import type { ModelHubSettings, ConfiguredProvider, ModelProviderType } from './modelHubTypes';
import { PRESET_PROVIDERS } from './modelHubTypes';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  providerType?: ModelProviderType;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
  webSearch?: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  pingMs: number;
  error?: string;
  reply?: string;
}

function resolveProviderAndModel(
  settings: ModelHubSettings,
  options?: ChatCompletionOptions
): { provider: ConfiguredProvider; model: string } {
  const targetType = options?.providerType || settings.defaultProvider || 'doubao';
  const provider = settings.providers[targetType];

  if (!provider) {
    throw new Error(`未找到供应商配置: ${targetType}`);
  }

  const model =
    options?.modelId ||
    (provider.type === 'custom' && provider.customModelName
      ? provider.customModelName
      : provider.selectedModel);

  return { provider, model };
}

/**
 * 规范化并清洗发送给大模型的消息列表：
 * 1. 过滤掉内容为空的消息；
 * 2. 保证非 system 的首条消息必须是 user（自动剥离前端欢迎语等前置 assistant 消息，防止商汤/OpenAI类接口报错）；
 * 3. 合并连续相同角色的消息，确保多厂商最佳兼容性。
 */
export function sanitizeMessagesForLLM(messages: ChatMessage[]): ChatMessage[] {
  if (!messages || messages.length === 0) {
    return [{ role: 'user', content: '你好' }];
  }

  const systemMessages: ChatMessage[] = [];
  const convMessages: ChatMessage[] = [];

  for (const m of messages) {
    const trimmed = (m.content || '').trim();
    if (!trimmed) continue;
    if (m.role === 'system') {
      systemMessages.push({ role: 'system', content: trimmed });
    } else {
      convMessages.push({ role: m.role, content: trimmed });
    }
  }

  // 移除开头的 assistant 角色消息（例如前端自带的欢迎语）
  while (convMessages.length > 0 && convMessages[0].role === 'assistant') {
    convMessages.shift();
  }

  // 如果没有对话消息，至少补充一条用户问候
  if (convMessages.length === 0) {
    convMessages.push({ role: 'user', content: '你好' });
  }

  // 合并连续相同角色的消息
  const merged: ChatMessage[] = [];
  for (const msg of convMessages) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += `\n\n${msg.content}`;
    } else {
      merged.push({ ...msg });
    }
  }

  return [...systemMessages, ...merged];
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
  settings: ModelHubSettings
): Promise<string> {
  const { provider, model } = resolveProviderAndModel(settings, options);

  if (!provider.apiKey) {
    throw new Error(`【${provider.type.toUpperCase()}】尚未配置 API Key，请先前往 [模型中心] 填写`);
  }

  let baseUrl = (provider.baseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error(`【${provider.type.toUpperCase()}】未配置 Base URL`);
  }

  const cleanMessages = sanitizeMessagesForLLM(messages);
  const url = `${baseUrl}/chat/completions`;
  const isStream = Boolean(options.stream && options.onDelta);

  const actualModel = provider.type === 'sensenova' ? (model || '').toLowerCase() : model;

  const reqBody: any = {
    model: actualModel,
    messages: cleanMessages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 8192,
    stream: isStream,
  };

  // 默认开启大模型联网搜索功能（根据服务商特性适配官方参数）
  if (options.webSearch !== false) {
    if (provider.type === 'qwen') {
      reqBody.enable_search = true;
    } else if (provider.type === 'zhipu') {
      reqBody.tools = [{ type: 'web_search', web_search: { enable: true } }];
    } else if (provider.type === 'moonshot') {
      reqBody.tools = [{ type: 'builtin_function', builtin_function: { name: '$web_search' } }];
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey.trim()}`,
  };

  // 超时与 429 智能指数退避重试控制器（思考模型给予充裕时间）
  const timeoutMs = isStream ? 120000 : 90000;
  const MAX_429_RETRIES = 3;
  let attempt = 0;
  let res: Response | null = null;

  while (attempt <= MAX_429_RETRIES) {
    if (options.signal?.aborted) {
      throw new Error('用户已取消请求');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    if (options.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      if (fetchErr.name === 'AbortError') {
        if (options.signal?.aborted) {
          throw new Error('用户已取消请求');
        }
        throw new Error(`请求超时（等待已超过 ${timeoutMs / 1000} 秒未完成），请检查网络或在【模型设置】中切换其他模型`);
      }
      throw fetchErr;
    }

    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }

    // 针对 429 (Too Many Requests / 1 QPS 限制) 自动进行指数退避重试
    if (res.status === 429) {
      attempt++;
      if (attempt > MAX_429_RETRIES) {
        let errText = '';
        try {
          const errJson = await res.json();
          errText = errJson.error?.message || errJson.message || JSON.stringify(errJson);
        } catch (_) {
          errText = await res.text();
        }
        throw new Error(
          `触发服务商调用频次限制 (HTTP 429: Too Many Requests)。\n\n` +
          `已为您自动智能排队重试 3 次，但服务商仍限制访问。\n` +
          `💡 建议排查与解决：\n` +
          `1. 商汤 Token Plan、部分免费/公测模型限制为 1 QPS (每秒仅限 1 次调用)，请等待 5~10 秒后再试；\n` +
          `2. 可直接在对话框顶部快捷切换为其他已配置的供应商或模型（如 DeepSeek、豆包、通义千问等）；\n` +
          `3. 详情反馈: ${errText || 'Rate limit exceeded'}`
        );
      }

      // 读取服务端 Retry-After 头，无则按 1.5s -> 3s -> 6s 退避并加上抖动
      let delayMs = 1500 * Math.pow(2, attempt - 1);
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter) {
        const sec = parseFloat(retryAfter);
        if (!isNaN(sec) && sec > 0) {
          delayMs = Math.min(sec * 1000, 10000);
        }
      }
      delayMs += Math.floor(Math.random() * 350) + 200;

      // 友好通知前端用户正在排队
      const provName = PRESET_PROVIDERS[provider.type]?.name || provider.type;
      options.onDelta?.(`\n⏳ 当前服务商（${provName}）触发 1 QPS 频次保护 (429)，系统正在自动智能排队重试中（第 ${attempt}/${MAX_429_RETRIES} 次，等待 ${(delayMs / 1000).toFixed(1)} 秒）...\n`);

      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    // 状态码正常或非 429，跳出重试循环
    break;
  }

  if (!res) {
    throw new Error('未获取到服务商响应');
  }

  try {
    if (!res.ok) {
      let errText = '';
      try {
        const errJson = await res.json();
        errText = errJson.error?.message || errJson.message || JSON.stringify(errJson);
      } catch (_) {
        errText = await res.text();
      }
      throw new Error(`API 调用失败 (HTTP ${res.status}): ${errText}`);
    }

    const contentType = res.headers.get('content-type') || '';

    // 若服务端支持流式并按 SSE 格式输出
    if (isStream && res.body && (contentType.includes('text/event-stream') || !contentType.includes('application/json'))) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let reasoningBuffer = '';
      let buffer = '';
      let hasStartedThink = false;
      let hasEndedThink = false;

      // 流式读取心跳超时保护（思考阶段单个 chunk 等待放宽至 60 秒）
      let chunkTimer: any = null;
      const resetChunkTimeout = () => {
        if (chunkTimer) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => {
          reader.cancel('流式传输空闲超时');
        }, 60000);
      };

      try {
        resetChunkTimeout();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resetChunkTimeout();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                const choice = parsed.choices?.[0];
                let delta = '';

                // 提取思考推演内容
                let rDelta = '';
                if (typeof choice?.delta?.reasoning_content === 'string') {
                  rDelta = choice.delta.reasoning_content;
                } else if (typeof choice?.delta?.reasoning === 'string') {
                  rDelta = choice.delta.reasoning;
                }

                if (rDelta) {
                  reasoningBuffer += rDelta;
                  if (!hasStartedThink) {
                    hasStartedThink = true;
                    options.onDelta?.(`<think>\n${rDelta}`);
                  } else {
                    options.onDelta?.(rDelta);
                  }
                }

                // 提取正式输出正文内容
                if (typeof choice?.delta?.content === 'string') {
                  delta = choice.delta.content;
                } else if (Array.isArray(choice?.delta?.content)) {
                  delta = choice.delta.content.map((c: any) => c.text || '').join('');
                } else if (typeof choice?.text === 'string') {
                  delta = choice.text;
                } else if (typeof choice?.message?.content === 'string') {
                  delta = choice.message.content;
                }

                if (delta) {
                  fullText += delta;
                  // 若此前有思考过程且尚未闭合标签，在正文前无缝闭合 <think>
                  if (hasStartedThink && !hasEndedThink) {
                    hasEndedThink = true;
                    options.onDelta?.(`\n</think>\n\n${delta}`);
                  } else {
                    options.onDelta?.(delta);
                  }
                }
              } catch (_) {
                // 忽略个别 chunk 解析错误
              }
            }
          }
        }
      } catch (streamErr: any) {
        // 如果流式读取发生中断但已有部分内容，则优先返回已有内容，否则降级非流式
        if (fullText.trim().length > 10) {
          return fullText.trimStart();
        }
        console.warn('流式传输中断，尝试降级为非流式重试:', streamErr);
        return await chatCompletion(cleanMessages, { ...options, stream: false }, settings);
      } finally {
        if (chunkTimer) clearTimeout(chunkTimer);
      }

      if (hasStartedThink && !hasEndedThink) {
        hasEndedThink = true;
        options.onDelta?.(`\n</think>\n\n`);
      }

      let combined = fullText.trimStart();

      // 核心防护：如果模型输出了深度推演，但在正文阶段没有输出内容（如思考过长用尽 Token 或提前停止）
      // 自动发起一轮追问，令模型基于刚才的思考结果立即输出正式口播文案正文，确保创作者必定得到完整文章！
      if (!combined.trim() && reasoningBuffer.trim()) {
        console.warn('[modelHubService] 检测到模型仅输出了深度推演但无正文，自动触发续写成稿机制...');
        const followUpMessages: ChatMessage[] = [
          ...cleanMessages,
          { role: 'assistant', content: `<think>\n${reasoningBuffer.trim()}\n</think>` },
          { role: 'user', content: '请立即根据上述深度推演与构思结果，直接输出完整的口播文案正文，第一行直接开篇输出文案，不要再输出任何思考过程，开始：' }
        ];

        let followUpStreamed = '';
        const followUpReply = await chatCompletion(
          followUpMessages,
          {
            ...options,
            stream: isStream,
            maxTokens: 8192,
            onDelta: (deltaChunk: string) => {
              followUpStreamed += deltaChunk;
              options.onDelta?.(deltaChunk);
            }
          },
          settings
        );

        const realBody = (followUpReply || followUpStreamed).trim();
        return `<think>\n${reasoningBuffer.trim()}\n</think>\n\n${realBody}`;
      }

      if (combined && reasoningBuffer.trim() && !combined.includes('<think>')) {
        combined = `<think>\n${reasoningBuffer.trim()}\n</think>\n\n${combined}`;
      }

      // 如果流式读取结束但没有提取到任何有效正文，自动走一次非流式重试兜底
      if (!combined.trim()) {
        return await chatCompletion(cleanMessages, { ...options, stream: false }, settings);
      }

      return combined;
    } else {
      // 非流式直接解析 JSON
      const json = await res.json();
      let content = '';
      const choice = json.choices?.[0];
      if (choice?.message?.content) {
        content = typeof choice.message.content === 'string'
          ? choice.message.content
          : JSON.stringify(choice.message.content);
      } else if (choice?.text) {
        content = choice.text;
      }

      const reasoning = choice?.message?.reasoning_content;
      if (typeof reasoning === 'string' && reasoning.trim()) {
        if (!content.trim()) {
          // 非流式下若仅有思考，同样自动发起续写补齐
          const followUpMessages: ChatMessage[] = [
            ...cleanMessages,
            { role: 'assistant', content: `<think>\n${reasoning.trim()}\n</think>` },
            { role: 'user', content: '请立即根据上述深度推演与构思结果，直接输出完整的口播文案正文，第一行直接开篇，不要再输出任何思考过程，开始：' }
          ];
          const followUpReply = await chatCompletion(
            followUpMessages,
            { ...options, stream: false, maxTokens: 8192 },
            settings
          );
          content = `<think>\n${reasoning.trim()}\n</think>\n\n${followUpReply.trimStart()}`;
        } else if (!content.includes('<think>')) {
          content = `<think>\n${reasoning.trim()}\n</think>\n\n${content}`;
        }
      }

      const cleanResult = (content || '').trimStart();
      if (!cleanResult) {
        if (choice?.finish_reason === 'content_filter') {
          throw new Error('服务商内容风控拦截：当前提问或文案生成触发了服务商安全策略，未能返回正文，请微调要求或切换其他模型。');
        }
        if (choice?.finish_reason === 'length') {
          throw new Error('模型输出 Token 达到上限：输出已被截断，请尝试缩减文案字数要求。');
        }
        throw new Error(`服务商未返回任何文本内容（HTTP ${res.status}，响应内容为空）。建议在输入框底部切换为其他模型（如通义千问、豆包或商汤）重试。`);
      }

      if (options.onDelta && cleanResult) {
        options.onDelta(cleanResult);
      }
      return cleanResult;
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`请求超时（等待已超过 ${timeoutMs / 1000} 秒未完成），请检查网络或在【模型设置】中切换其他模型`);
    }
    throw err;
  }
}

export async function testConnection(provider: ConfiguredProvider): Promise<ConnectionTestResult> {
  const start = Date.now();

  if (!provider.apiKey) {
    return { ok: false, pingMs: 0, error: '请先填写 API Key' };
  }

  let baseUrl = (provider.baseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return { ok: false, pingMs: 0, error: 'Base URL 不能为空' };
  }

  const model =
    provider.type === 'custom' && provider.customModelName
      ? provider.customModelName
      : provider.selectedModel;

  const url = `${baseUrl}/chat/completions`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const actualModel = provider.type === 'sensenova' ? (model || '').toLowerCase() : model;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages: [{ role: 'user', content: 'Hi, respond with OK.' }],
        max_tokens: 5,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const pingMs = Date.now() - start;

    if (!res.ok) {
      let errText = '';
      try {
        const j = await res.json();
        errText = j.error?.message || j.message || JSON.stringify(j);
      } catch (_) {
        errText = await res.text();
      }
      if (res.status === 429) {
        return {
          ok: false,
          pingMs,
          error: `HTTP 429 (并发频次受限): 该服务商接口限制为 1 QPS 或已达并发上限，请稍候 5~10 秒后重试。详情: ${errText}`,
        };
      }
      return { ok: false, pingMs, error: `HTTP ${res.status}: ${errText}` };
    }

    const j = await res.json();
    const reply = j.choices?.[0]?.message?.content || 'OK';
    return { ok: true, pingMs, reply };
  } catch (err: any) {
    const pingMs = Date.now() - start;
    const msg = err.name === 'AbortError' ? '请求超时 (12秒)' : err.message || '网络连接异常';
    return { ok: false, pingMs, error: msg };
  }
}
