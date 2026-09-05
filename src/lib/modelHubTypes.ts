export type ModelProviderType =
  | 'doubao'
  | 'deepseek'
  | 'qwen'
  | 'zhipu'
  | 'moonshot'
  | 'openai'
  | 'custom';

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderPreset {
  type: ModelProviderType;
  name: string;
  icon: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  docUrl: string;
  models: ModelOption[];
}

export const PRESET_PROVIDERS: Record<ModelProviderType, ProviderPreset> = {
  doubao: {
    type: 'doubao',
    name: '火山引擎 · 豆包大模型',
    icon: '⚡',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    keyPlaceholder: '请输入火山方舟 API Key (ARK_API_KEY)',
    docUrl: 'https://www.volcengine.com/docs/82379/1099475',
    models: [
      { id: 'doubao-pro-32k', name: 'Doubao-pro-32k (强推理高表现力)', description: '推荐用于爆款文案改写、复杂风格仿写' },
      { id: 'doubao-pro-128k', name: 'Doubao-pro-128k (长文本旗舰)', description: '支持超长视频原片台词处理与全集大纲重构' },
      { id: 'doubao-lite-32k', name: 'Doubao-lite-32k (极致性价比与响应)', description: '极速生成、轻量选题发散' },
      { id: 'doubao-lite-128k', name: 'Doubao-lite-128k (长上下文轻量版)', description: '适合大批量多篇文案并发处理' },
    ],
  },
  deepseek: {
    type: 'deepseek',
    name: 'DeepSeek (深度求索)',
    icon: '🐋',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://platform.deepseek.com/',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3 (通用旗舰模型)', description: '语言自然度极佳，极高性价比，自媒体标配' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (深度思考推理大模型)', description: '适合深度商业认知拆解、复杂逻辑推演' },
    ],
  },
  qwen: {
    type: 'qwen',
    name: '阿里 · 通义千问 (DashScope)',
    icon: '☁️',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://help.aliyun.com/zh/model-studio/',
    models: [
      { id: 'qwen-max', name: 'Qwen-Max (通义千问千亿旗舰)', description: '千问系列最强能力，逻辑严密' },
      { id: 'qwen-plus', name: 'Qwen-Plus (高性价比均衡版)', description: '兼顾速度与生成文采' },
      { id: 'qwen-turbo', name: 'Qwen-Turbo (秒级低延时版)', description: '极速输出' },
    ],
  },
  zhipu: {
    type: 'zhipu',
    name: '智谱 AI (GLM)',
    icon: '🧠',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyPlaceholder: '请输入智谱 API Key',
    docUrl: 'https://open.bigmodel.cn/',
    models: [
      { id: 'glm-4-flash', name: 'GLM-4-Flash (免费秒级高速)', description: '免费商用模型，响应极快' },
      { id: 'glm-4-plus', name: 'GLM-4-Plus (高智能旗舰模型)', description: '高质量文字创作与角色模仿' },
    ],
  },
  moonshot: {
    type: 'moonshot',
    name: '月之暗面 (Kimi)',
    icon: '🌙',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://platform.moonshot.cn/',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot-v1-8k (经典短篇)', description: '中文语感极佳，长于叙事与共情' },
      { id: 'moonshot-v1-32k', name: 'Moonshot-v1-32k (中长文案)', description: '自媒体口播标准篇幅' },
    ],
  },
  openai: {
    type: 'openai',
    name: 'OpenAI (官方国际版)',
    icon: '🌐',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://platform.openai.com/',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (全能多模态旗舰)', description: '国际标杆大模型' },
      { id: 'gpt-4o-mini', name: 'GPT-4o-mini (极速经济版)', description: '轻量经济型模型' },
    ],
  },
  custom: {
    type: 'custom',
    name: '自定义 OpenAI 兼容接口',
    icon: '⚙️',
    defaultBaseUrl: 'https://your-custom-domain.com/v1',
    keyPlaceholder: '请输入对应服务的 API Key',
    docUrl: '',
    models: [
      { id: 'custom-model', name: '自定义模型 ID (手动填写)', description: '兼容任意 OneAPI / NewAPI / 本地 Ollama' },
    ],
  },
};

export interface ConfiguredProvider {
  type: ModelProviderType;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  selectedModel: string;
  customModelName?: string; // custom 时填写的具体模型 ID
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
      selectedModel: 'doubao-pro-32k',
    },
    deepseek: {
      type: 'deepseek',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.deepseek.defaultBaseUrl,
      selectedModel: 'deepseek-chat',
    },
    qwen: {
      type: 'qwen',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.qwen.defaultBaseUrl,
      selectedModel: 'qwen-plus',
    },
    zhipu: {
      type: 'zhipu',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.zhipu.defaultBaseUrl,
      selectedModel: 'glm-4-flash',
    },
    moonshot: {
      type: 'moonshot',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.moonshot.defaultBaseUrl,
      selectedModel: 'moonshot-v1-8k',
    },
    openai: {
      type: 'openai',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.openai.defaultBaseUrl,
      selectedModel: 'gpt-4o-mini',
    },
    custom: {
      type: 'custom',
      enabled: false,
      apiKey: '',
      baseUrl: '',
      selectedModel: 'custom-model',
      customModelName: '',
    },
  },
};
