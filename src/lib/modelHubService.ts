import type { ModelHubSettings, ConfiguredProvider, ModelProviderType } from './modelHubTypes';

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

  const reqBody = {
    model: model,
    messages: cleanMessages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2048,
    stream: isStream,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey.trim()}`,
  };

  // 超时控制器保护（流式 60s，非流式 45s）
  const timeoutMs = isStream ? 60000 : 45000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(reqBody),
      signal: controller.signal,
    });

    clearTimeout(timer);

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
      let buffer = '';

      // 流式读取心跳超时保护（每个 chunk 之间最多等待 20 秒）
      let chunkTimer: any = null;
      const resetChunkTimeout = () => {
        if (chunkTimer) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => {
          reader.cancel('流式传输空闲超时');
        }, 20000);
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

                if (typeof choice?.delta?.content === 'string') {
                  delta = choice.delta.content;
                } else if (Array.isArray(choice?.delta?.content)) {
                  delta = choice.delta.content.map((c: any) => c.text || '').join('');
                } else if (typeof choice?.delta?.reasoning_content === 'string') {
                  // 如果是纯深度思考内容，且主 content 尚未出现，不作为正文输出，避免首部空白
                } else if (typeof choice?.text === 'string') {
                  delta = choice.text;
                } else if (typeof choice?.message?.content === 'string') {
                  delta = choice.message.content;
                }

                if (delta) {
                  fullText += delta;
                  options.onDelta?.(delta);
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

      // 如果流式读取结束但没有提取到任何有效正文，自动走一次非流式重试兜底
      if (!fullText.trim()) {
        return await chatCompletion(cleanMessages, { ...options, stream: false }, settings);
      }

      return fullText.trimStart();
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

      const cleanResult = (content || '').trimStart();
      if (options.onDelta && cleanResult) {
        options.onDelta(cleanResult);
      }
      return cleanResult;
    }
  } catch (err: any) {
    clearTimeout(timer);
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

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: model,
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
