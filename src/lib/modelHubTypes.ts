export type ModelProviderType =
  | 'doubao'
  | 'sensenova'
  | 'deepseek'
  | 'qwen'
  | 'zhipu'
  | 'moonshot'
  | 'openai'
  | 'claude'
  | 'minimax'
  | 'mimo'
  | 'custom';

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  badge?: string;
}

export type ProviderCategory = 'domestic' | 'global' | 'custom';

export interface ProviderPreset {
  type: ModelProviderType;
  name: string;
  icon: string;
  category: ProviderCategory;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  docUrl: string;
  models?: ModelOption[];
}

export const PRESET_PROVIDERS: Record<ModelProviderType, ProviderPreset> = {
  doubao: {
    type: 'doubao',
    name: '火山引擎 · 豆包大模型',
    icon: '⚡',
    category: 'domestic',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    keyPlaceholder: '请输入火山方舟 API Key (ARK_API_KEY)',
    docUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    models: [],
  },
  sensenova: {
    type: 'sensenova',
    name: '商汤日日新 (SenseNova · Token Plan)',
    icon: '☀️',
    category: 'domestic',
    defaultBaseUrl: 'https://token.sensenova.cn/v1',
    keyPlaceholder: '请输入商汤 Token Plan API Key (sk-...)',
    docUrl: 'https://platform.sensenova.cn/token-plan',
    models: [],
  },
  deepseek: {
    type: 'deepseek',
    name: 'DeepSeek (深度求索)',
    icon: '🐋',
    category: 'domestic',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://platform.deepseek.com/',
    models: [],
  },
  qwen: {
    type: 'qwen',
    name: '阿里 · 通义千问 (DashScope)',
    icon: '☁️',
    category: 'domestic',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://bailian.console.aliyun.com/',
    models: [],
  },
  zhipu: {
    type: 'zhipu',
    name: '智谱 AI (GLM)',
    icon: '🧠',
    category: 'domestic',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyPlaceholder: '请输入智谱 API Key',
    docUrl: 'https://open.bigmodel.cn/',
    models: [],
  },
  moonshot: {
    type: 'moonshot',
    name: '月之暗面 (Kimi)',
    icon: '🌙',
    category: 'domestic',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://platform.moonshot.cn/',
    models: [],
  },
  minimax: {
    type: 'minimax',
    name: 'MiniMax (海螺 AI · 稀宇科技)',
    icon: '🐚',
    category: 'domestic',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    keyPlaceholder: '请输入 MiniMax API Key',
    docUrl: 'https://platform.minimaxi.com/',
    models: [],
  },
  mimo: {
    type: 'mimo',
    name: '小米 · MiMo (大模型开放平台)',
    icon: '📱',
    category: 'domestic',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    keyPlaceholder: '按量付费填 sk-… ；Token Plan 套餐填 tp-…（域名自动切换）',
    docUrl: 'https://platform.xiaomimimo.com/',
    models: [],
  },
  openai: {
    type: 'openai',
    name: 'OpenAI (官方国际版)',
    icon: '🌐',
    category: 'global',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://platform.openai.com/',
    models: [],
  },
  claude: {
    type: 'claude',
    name: 'Anthropic · Claude (官方/兼容接口)',
    icon: '🎭',
    category: 'global',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://docs.anthropic.com/',
    models: [],
  },
  custom: {
    type: 'custom',
    name: '自定义 OpenAI 兼容接口',
    icon: '⚙️',
    category: 'custom',
    defaultBaseUrl: 'https://your-custom-domain.com/v1',
    keyPlaceholder: '请输入对应服务的 API Key',
    docUrl: '',
    models: [],
  },
};


export interface ConfiguredProvider {
  type: ModelProviderType;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  selectedModel: string;
  availableModels?: string[]; // 从供应商 API 实时拉取的最新可用模型列表
  modelsFetchedAt?: number;   // 上次成功拉取的时间戳
  customModelName?: string; // 手动填写的特定 Model ID 或火山 Endpoint ID
  customProviderName?: string; // 手动填写的自定义供应商显示名称（如 OpenRouter、硅基流动、本地 Ollama）
  lastPingMs?: number;
  lastTestOk?: boolean;
}

export interface ModelHubSettings {
  providers: Record<ModelProviderType, ConfiguredProvider>;
  defaultProvider: ModelProviderType;
  taskBindings?: {
    scriptWriter?: { provider: ModelProviderType; model: string };
    topicFinder?: { provider: ModelProviderType; model: string };
    copilotChat?: { provider: ModelProviderType; model: string };
  };
}

export const DEFAULT_MODEL_HUB_SETTINGS: ModelHubSettings = {
  defaultProvider: 'doubao',
  providers: {
    doubao: {
      type: 'doubao',
      enabled: true,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.doubao.defaultBaseUrl,
      selectedModel: '',
    },
    sensenova: {
      type: 'sensenova',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.sensenova.defaultBaseUrl,
      selectedModel: '',
    },
    deepseek: {
      type: 'deepseek',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.deepseek.defaultBaseUrl,
      selectedModel: '',
    },
    qwen: {
      type: 'qwen',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.qwen.defaultBaseUrl,
      selectedModel: '',
    },
    zhipu: {
      type: 'zhipu',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.zhipu.defaultBaseUrl,
      selectedModel: '',
    },
    moonshot: {
      type: 'moonshot',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.moonshot.defaultBaseUrl,
      selectedModel: '',
    },
    openai: {
      type: 'openai',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.openai.defaultBaseUrl,
      selectedModel: '',
    },
    claude: {
      type: 'claude',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.claude.defaultBaseUrl,
      selectedModel: '',
    },
    minimax: {
      type: 'minimax',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.minimax.defaultBaseUrl,
      selectedModel: '',
    },
    mimo: {
      type: 'mimo',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.mimo.defaultBaseUrl,
      selectedModel: '',
    },
    custom: {
      type: 'custom',
      enabled: false,
      apiKey: '',
      baseUrl: '',
      selectedModel: '',
      customModelName: '',
      customProviderName: '',
    },
  },
};

/**
 * 获取各大服务商大模型对应的最大上下文 Token 规格（用于 90% 容量自动压缩与状态预警）
 */
export function getModelContextLimit(modelId: string, providerType?: ModelProviderType): number {
  const id = (modelId || '').toLowerCase();
  if (id.includes('1000k') || id.includes('1m') || id.includes('turbo-latest') || id.includes('glm-4-long')) return 1000000;
  if (id.includes('256k')) return 256000;
  if (id.includes('128k') || id.includes('k3') || id.includes('plus') || id.includes('max') || id.includes('pro') || id.includes('4o') || id.includes('sonnet') || id.includes('seed-2.1')) return 128000;
  if (id.includes('64k') || id.includes('flash') || id.includes('deepseek') || id.includes('glm') || id.includes('mini')) return 64000;
  if (id.includes('32k')) return 32000;
  return 64000;
}

