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
  | 'custom';

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
  badge?: string;
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
    docUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    models: [
      { id: 'doubao-seed-2.1-pro', name: 'Doubao-Seed-2.1-Pro (最新 Seed 2.1 旗舰)', description: '对齐 Claude Opus，全网最新 MoE 旗舰，自媒体文学质感与逻辑巅峰', badge: '2026最新旗舰' },
      { id: 'doubao-seed-2.1-turbo', name: 'Doubao-Seed-2.1-Turbo (新一代极速版)', description: '极速响应、极低资费，批量洗稿与高并发生产首选', badge: '2.1极速' },
      { id: 'doubao-seed-1.6-thinking', name: 'Doubao-Seed-1.6-thinking (深度思考推理)', description: '支持慢思考与长思维链推演，复杂商业认知与反常识破局极强', badge: '深度思考' },
      { id: 'doubao-1.5-pro-32k', name: 'Doubao-1.5-pro-32k (1.5 MoE 主力旗舰)', description: '经典自媒体口播改写主力，推理性能与文字张力平衡出色', badge: '1.5主力' },
      { id: 'doubao-1.5-pro-256k', name: 'Doubao-1.5-pro-256k (超长文本旗舰)', description: '支持 256K 超长视频台词全集重构与全案大纲提炼', badge: '256K长文' },
      { id: 'doubao-1.5-lite-32k', name: 'Doubao-1.5-lite-32k (轻量极速低价)', description: '秒级响应、超低资费，适合高并发选题发散', badge: '极速低价' },
      { id: 'doubao-pro-32k', name: 'Doubao-pro-32k (经典版 1.0)', description: '早期经典大模型' },
      { id: 'doubao-pro-128k', name: 'Doubao-pro-128k (经典版 1.0)', description: '早期经典 128K' },
    ],
  },
  sensenova: {
    type: 'sensenova',
    name: '商汤日日新 (SenseNova · Token Plan)',
    icon: '☀️',
    defaultBaseUrl: 'https://token.sensenova.cn/v1',
    keyPlaceholder: '请输入商汤 Token Plan API Key (sk-...)',
    docUrl: 'https://platform.sensenova.cn/token-plan',
    models: [
      { id: 'sensenova-6.8-flash-lite', name: 'SenseNova-6.8-Flash-Lite (Token Plan 首选主力)', description: 'Token Plan 免费公测主力，低消耗、高响应，办公与自媒体智能体首选', badge: 'TokenPlan首选' },
      { id: 'SenseNova-V6.5-Omni', name: 'SenseNova-V6.5-Omni (实时全模态旗舰)', description: '最新全模态实时流式交互旗舰，音视文统一推理', badge: '全模态旗舰' },
      { id: 'sensenova-u1-fast', name: 'SenseNova-U1-Fast (统一图文多模态)', description: 'NEO-unify 架构，图文统一理解与生成', badge: 'NEO架构' },
      { id: 'SenseNova-V6-Pro', name: 'SenseNova-V6-Pro (长文本深度旗舰)', description: '支持 64K 超长上下文，多模态长篇理解', badge: '64K长文' },
      { id: 'SenseNova-V6-Turbo', name: 'SenseNova-V6-Turbo (高并发极速版)', description: '极速推理吞吐，高并发自媒体量产' },
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
      { id: 'deepseek-chat', name: 'DeepSeek-V3 (671B MoE 通用旗舰)', description: '中文自然度标杆，极高性价比与出色文字感染力', badge: '最强推荐' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (深度长思维链推理)', description: '开源逻辑推理与深度思考巅峰，适合复杂观点破局', badge: '深度推理' },
    ],
  },
  qwen: {
    type: 'qwen',
    name: '阿里 · 通义千问 (DashScope)',
    icon: '☁️',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://bailian.console.aliyun.com/',
    models: [
      { id: 'qwen3.8-max', name: 'Qwen3.8-Max (2026最新 2.4万亿 MoE 顶级旗舰)', description: '阿里千问家族迄今最强能力底座，通用智能与长篇创作跃升', badge: '2026顶级旗舰' },
      { id: 'qwen2.5-max', name: 'Qwen2.5-Max (千问 2.5 千亿最新旗舰)', description: '千亿级别超大规模语言模型，文字张力极佳', badge: '2.5旗舰' },
      { id: 'qwen-max-latest', name: 'Qwen-Max-Latest (动态滚动更新旗舰)', description: '阿里最强能力底座，百炼自动滚动升级至最新版本', badge: '滚动最新' },
      { id: 'qwen-plus-latest', name: 'Qwen-Plus-Latest (新一代均衡主力)', description: '速度质量兼备，自媒体批量口播高性价比首选', badge: '均衡主力' },
      { id: 'qwen-turbo-latest', name: 'Qwen-Turbo-Latest (100万 Token 极速版)', description: '超大上下文与秒级返回', badge: '100万长文' },
      { id: 'qwq-32b-preview', name: 'QwQ-32B-Preview (阿里强化学习推理)', description: '对标 o1 / R1 的深度思考模型，擅长批判性拆解', badge: '深度思考' },
      { id: 'qwen2.5-72b-instruct', name: 'Qwen2.5-72B-Instruct (开源顶级指令)', description: '开源指令遵循之王' },
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
      { id: 'glm-4-plus', name: 'GLM-4-Plus (高智能旗舰模型)', description: '全模态底座，高质量文字创作与复杂长程逻辑', badge: '旗舰版' },
      { id: 'glm-4-flash', name: 'GLM-4-Flash (免费高速模型)', description: '普惠免费模型，秒级响应，轻量任务首选', badge: '免费高速' },
      { id: 'glm-4-air', name: 'GLM-4-Air (极速均衡性价比旗舰)', description: '高并发与日常生成高性价比首选', badge: '极速均衡' },
      { id: 'glm-4-long', name: 'GLM-4-Long (100万 Token 超长上下文)', description: '适合处理多篇爆款长视频与剧本' },
      { id: 'glm-zero-preview', name: 'GLM-Zero (智谱沉思深度推理)', description: '深度思考与逻辑推演', badge: '深度思考' },
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
      { id: 'kimi-latest', name: 'Kimi-Latest (月之暗面最新动态旗舰)', description: 'Kimi 官方滚动最新模型，文字细腻自然、极具拟人感', badge: '最新旗舰' },
      { id: 'moonshot-v1-auto', name: 'Moonshot-v1-auto (动态智能窗口)', description: '自动根据文案长度匹配最佳上下文窗口', badge: '智能推荐' },
      { id: 'moonshot-v1-128k', name: 'Moonshot-v1-128k (128K 超长文案)', description: '超长素材阅读与多篇风格比对', badge: '128K长文' },
      { id: 'moonshot-v1-32k', name: 'Moonshot-v1-32k (经典自媒体中长篇)', description: '文字细腻温润，共情与故事感极强' },
      { id: 'moonshot-v1-8k', name: 'Moonshot-v1-8k (短篇速出)', description: '60秒快节奏短视频' },
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
      { id: 'gpt-4.5-preview', name: 'GPT-4.5-Preview (最新多模态知识旗舰)', description: 'OpenAI 全新一代旗舰，世界知识深度与细微语感顶级', badge: '4.5最新' },
      { id: 'o3-mini', name: 'o3-mini (全新极速深度推理模型)', description: '最新强推理旗舰，数学与逻辑飞跃，支持调整思考强度', badge: '最新强推' },
      { id: 'o1', name: 'o1 (通用深度长思维链推理)', description: 'OpenAI 官方最强深度推理模型', badge: '推理旗舰' },
      { id: 'gpt-4o', name: 'GPT-4o (全能多模态旗舰)', description: '国际综合能力标杆，指令遵循与创意生成极强', badge: '全能旗舰' },
      { id: 'gpt-4o-mini', name: 'GPT-4o-mini (极速高性价比)', description: '低延时高性价比主力' },
      { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o-Latest (官方动态版)', description: '始终同步 ChatGPT 网页版最新权重' },
    ],
  },
  claude: {
    type: 'claude',
    name: 'Anthropic · Claude (官方/兼容接口)',
    icon: '🎭',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    docUrl: 'https://docs.anthropic.com/',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (最新混合思考旗舰)', description: '全球首款混合深度思考旗舰，文学修辞与长逻辑地表最强', badge: '2025最新' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (经典高表现力主力)', description: '文采斐然、口语表达自然，自媒体创作者最爱', badge: '爆款主力' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (轻量极速响应)', description: '极速生成短句与前3秒钩子', badge: '极速轻量' },
    ],
  },
  minimax: {
    type: 'minimax',
    name: 'MiniMax (海螺 AI · 稀宇科技)',
    icon: '🐚',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    keyPlaceholder: '请输入 MiniMax API Key',
    docUrl: 'https://platform.minimaxi.com/',
    models: [
      { id: 'MiniMax-Text-01', name: 'MiniMax-Text-01 (400万字超长上下文)', description: '原生超拟人中文大模型，语气自然，极具真人感', badge: '超拟人' },
      { id: 'abab6.5s-chat', name: 'Abab6.5s-Chat (高情商角色口播)', description: '适合情感、治愈与人设化强烈的自媒体账号' },
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
  customModelName?: string; // 手动填写的特定 Model ID 或火山 Endpoint ID
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
      selectedModel: 'doubao-seed-2.1-pro', // 默认升级为最新 2.1-pro 旗舰
    },
    sensenova: {
      type: 'sensenova',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.sensenova.defaultBaseUrl,
      selectedModel: 'sensenova-6.8-flash-lite',
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
      selectedModel: 'qwen3.8-max', // 默认升级为 3.8-max
    },
    zhipu: {
      type: 'zhipu',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.zhipu.defaultBaseUrl,
      selectedModel: 'glm-4-plus', // 默认升级为 plus
    },
    moonshot: {
      type: 'moonshot',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.moonshot.defaultBaseUrl,
      selectedModel: 'moonshot-v1-auto', // 默认升级为 auto
    },
    openai: {
      type: 'openai',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.openai.defaultBaseUrl,
      selectedModel: 'o3-mini', // 默认升级为最新 o3-mini
    },
    claude: {
      type: 'claude',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.claude.defaultBaseUrl,
      selectedModel: 'claude-3-7-sonnet-20250219', // 最新 3.7 Sonnet
    },
    minimax: {
      type: 'minimax',
      enabled: false,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS.minimax.defaultBaseUrl,
      selectedModel: 'MiniMax-Text-01',
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
