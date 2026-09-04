// 火山引擎官方计费标准（以官网最新公示为准），用于「设置 → 官方价格说明」展示
export interface PriceItem {
  feature: string;
  unit: string;
  payAsYouGo: string;
  resourcePack?: string;
  note?: string;
}

export const PRICING: PriceItem[] = [
  {
    feature: '大模型语音合成 2.0 (Seed-TTS)',
    unit: '万字符',
    payAsYouGo: '5.0 元 / 万字符',
    resourcePack: '2.8 元 / 万字符（10 万字包 ¥28）',
    note: '最新大模型架构，超高表现力、高保真停顿与多情绪支持，官方默认推荐。',
  },
  {
    feature: '经典语音合成 1.0 (BigTTS)',
    unit: '万字符',
    payAsYouGo: '约 0.20 元 / 万字符',
    resourcePack: '约 0.15 元 / 万字符',
    note: '经典基础音色库，超低资费，适合长篇小说、有声书等大通量低成本场景。',
  },
  {
    feature: '大模型声音复刻 2.0 (Seed-ICL)',
    unit: '万字符',
    payAsYouGo: '8.0 元 / 万字符',
    resourcePack: '约 2.8 元 / 万字符',
    note: '训练与试听阶段完全免费！仅复刻成功后首次正式合成调用时收取 5 元/个音色槽位费。',
  },
  {
    feature: '录音文件识别 2.0 (视音频转录)',
    unit: '小时',
    payAsYouGo: '0.80 元 / 小时',
    resourcePack: '约 0.90 元 / 小时（1000 小时包 ¥900）',
    note: '按音频时长计费，单文件最长 5 小时 / 512MB；说话人角色分离不额外收费。',
  },
];

// 录音文件识别 2.0 按量单价（元/小时），用于转录页费用估算
export const ASR_PRICE_PER_HOUR = 0.8;
