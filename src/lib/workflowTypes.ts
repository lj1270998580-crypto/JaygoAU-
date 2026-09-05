export type NodeType =
  | 'trigger'
  | 'topic_source'
  | 'ai_script'
  | 'voice_tts'
  | 'digital_avatar'
  | 'export_notify';

export interface TriggerNodeConfig {
  mode: 'cron' | 'manual' | 'direct_input';
  cronExpression: string; // e.g. "0 9 * * *"
  cronDescription: string; // e.g. "每天 09:00"
  rawBatchText: string[]; // 用户直接输入的文案列表（多篇）
}

export interface TopicSourceNodeConfig {
  sourceType: 'ai_brainstorm' | 'pool_rotation' | 'video_extract';
  domainKeyword: string;
  generateCount: number; // 每次发散生成的选题数
  poolList: string[];    // 本地选题池
  videoUrl?: string;     // 待提取的视频链接
}

export interface AiScriptNodeConfig {
  skillPresetId: string; // 绑定的创作者风格预设 ID
  batchCount: number;    // 单主题衍生篇数 (1~5)
  targetWordCount: number; // 目标字数
  hookStrategy: 'counter_intuitive' | 'pain_point' | 'suspense' | 'gold_sentence';
  customRequirement?: string;
}

export interface VoiceTtsNodeConfig {
  engine: 'seed-tts-2.0' | 'bigtts-1.0';
  voiceId: string;      // 若为空则自动使用选定 Skill 预设所绑定的克隆音色
  voiceName: string;
  emotion: string;      // 开心/严肃/深情/激动等
  speedRatio: number;   // 0.8 ~ 2.0
  volumeRatio: number;  // 0.5 ~ 2.0
  audioFormat: 'mp3' | 'wav';
}

export interface DigitalAvatarNodeConfig {
  avatarId: string;
  avatarName: string;
  figureType: string;   // whole_body, sit_body, circle_view
  aspectRatio: '9:16' | '16:9';
  resolution: '1080p' | '4k';
  addSubtitle: boolean; // 是否自动烧录/内嵌字幕 (用户关键需求)
  subtitleFontSize?: number;
  subtitleFontColor?: string;
  backgroundMode: 'transparent' | 'default' | 'custom';
}

export interface ExportNotifyNodeConfig {
  outputDir: string;
  saveScript: boolean;
  saveAudio: boolean;
  saveVideo: boolean;
  enableTrayNotify: boolean; // 是否弹出系统托盘完成气泡
  autoOpenFolder: boolean;   // 完成后是否自动打开目标目录
}

export type NodeConfigMap = {
  trigger: TriggerNodeConfig;
  topic_source: TopicSourceNodeConfig;
  ai_script: AiScriptNodeConfig;
  voice_tts: VoiceTtsNodeConfig;
  digital_avatar: DigitalAvatarNodeConfig;
  export_notify: ExportNotifyNodeConfig;
};

export interface WorkflowNode<T extends NodeType = NodeType> {
  id: string;
  type: T;
  name: string;
  enabled: boolean; // 是否启用此节点 (Bypass 开关)
  config: NodeConfigMap[T];
}

export interface WorkflowRunHistoryItem {
  id: string;
  startTime: number;
  endTime: number;
  status: 'success' | 'failed' | 'running';
  log: string;
  generatedScripts?: string[];
  generatedAudioPaths?: string[];
  generatedVideoUrls?: string[];
  error?: string;
}

export interface WorkflowProject {
  id: string;
  name: string;
  description: string;
  enabled: boolean; // 定时计划总开关
  nodes: WorkflowNode[];
  createdAt: number;
  updatedAt: number;
  lastRunTime?: number;
  lastStatus?: 'idle' | 'running' | 'success' | 'failed';
  lastLog?: string;
  history?: WorkflowRunHistoryItem[];
}

export const NODE_TYPE_META: Record<
  NodeType,
  { name: string; icon: string; tag: string; description: string; color: string }
> = {
  trigger: {
    name: '触发器',
    icon: '⏰',
    tag: 'TRIGGER',
    description: '设定执行时机：定时 Cron 周期、单次定时、手动立即触发或直接批量文案导入',
    color: 'border-amber-500/40 bg-amber-500/5 text-amber-400',
  },
  topic_source: {
    name: '选题灵感源',
    icon: '💡',
    tag: 'SOURCE',
    description: 'AI 赛道爆款热点发散、本地待办选题池轮询消费或短视频素材原片提取',
    color: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400',
  },
  ai_script: {
    name: 'AI 文案工坊',
    icon: '✍️',
    tag: 'SCRIPT',
    description: '根据选定老师 Skill 预设风格，自动化批量重构为 60 秒爆款口播台词',
    color: 'border-blue-500/40 bg-blue-500/5 text-blue-400',
  },
  voice_tts: {
    name: 'Seed-TTS 配音',
    icon: '🎙️',
    tag: 'AUDIO',
    description: '调用 Seed-TTS 2.0 神经大模型与专属复刻音色，注入细腻情绪批量出音频',
    color: 'border-purple-500/40 bg-purple-500/5 text-purple-400',
  },
  digital_avatar: {
    name: '蝉镜数字人出镜',
    icon: '🎬',
    tag: 'AVATAR',
    description: '将合成音频推入蝉镜 API，由真人数字人出镜对齐口型，可选自动添加内嵌字幕',
    color: 'border-cyan-500/40 bg-cyan-500/5 text-cyan-400',
  },
  export_notify: {
    name: '交付与托盘通知',
    icon: '📁',
    tag: 'OUTPUT',
    description: '自动按日期归档产物至指定文件夹，并通过 Windows 托盘弹出生成完成通知',
    color: 'border-rose-500/40 bg-rose-500/5 text-rose-400',
  },
};

export const DEFAULT_NODES_FACTORY: {
  [K in NodeType]: () => WorkflowNode<K>;
} = {
  trigger: () => ({
    id: `node_trigger_${Date.now()}`,
    type: 'trigger',
    name: '定时触发器',
    enabled: true,
    config: {
      mode: 'cron',
      cronExpression: '0 9 * * *',
      cronDescription: '每天上午 09:00',
      rawBatchText: [],
    },
  }),
  topic_source: () => ({
    id: `node_topic_${Date.now()}`,
    type: 'topic_source',
    name: '赛道爆款选题发散',
    enabled: true,
    config: {
      sourceType: 'ai_brainstorm',
      domainKeyword: '自媒体副业与商业认知',
      generateCount: 1,
      poolList: [],
    },
  }),
  ai_script: () => ({
    id: `node_script_${Date.now()}`,
    type: 'ai_script',
    name: '张老师风格文案创作',
    enabled: true,
    config: {
      skillPresetId: 'teacher_zhang_business',
      batchCount: 1,
      targetWordCount: 300,
      hookStrategy: 'counter_intuitive',
    },
  }),
  voice_tts: () => ({
    id: `node_tts_${Date.now()}`,
    type: 'voice_tts',
    name: 'Seed-TTS 2.0 语音合成',
    enabled: true,
    config: {
      engine: 'seed-tts-2.0',
      voiceId: '',
      voiceName: '自动继承风格音色',
      emotion: '开心',
      speedRatio: 1.0,
      volumeRatio: 1.0,
      audioFormat: 'mp3',
    },
  }),
  digital_avatar: () => ({
    id: `node_avatar_${Date.now()}`,
    type: 'digital_avatar',
    name: '蝉镜数字人视频渲染',
    enabled: true,
    config: {
      avatarId: '',
      avatarName: '默认数字人模特',
      figureType: 'whole_body',
      aspectRatio: '9:16',
      resolution: '1080p',
      addSubtitle: true, // 默认开启字幕
      backgroundMode: 'default',
    },
  }),
  export_notify: () => ({
    id: `node_export_${Date.now()}`,
    type: 'export_notify',
    name: '本地归档与托盘提醒',
    enabled: true,
    config: {
      outputDir: '',
      saveScript: true,
      saveAudio: true,
      saveVideo: true,
      enableTrayNotify: true,
      autoOpenFolder: false,
    },
  }),
};
