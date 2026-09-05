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

  const url = `${baseUrl}/chat/completions`;
  const isStream = Boolean(options.stream && options.onDelta);

  const reqBody = {
    model: model,
    messages: messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2048,
    stream: isStream,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey.trim()}`,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(reqBody),
    signal: options.signal,
  });

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

  if (isStream && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              options.onDelta?.(delta);
            }
          } catch (_) {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }
    return fullText;
  } else {
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || '';
    return content;
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
