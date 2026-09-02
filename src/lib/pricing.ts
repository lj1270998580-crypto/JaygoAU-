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
    feature: '语音合成 2.0',
    unit: '万字符',
    payAsYouGo: '5 元 / 万字符',
    resourcePack: '2.8 元 / 万字符（10 万字包 ¥28）',
    note: '按合成文本字符数计费；官方音色与克隆音色均按此标准，音色槽位不另收费。',
  },
  {
    feature: '声音复刻 2.0',
    unit: '万字符',
    payAsYouGo: '8 元 / 万字符',
    resourcePack: '2.8 元 / 万字符',
    note: '复刻成功后首次调用合成接口「转正」会一次性收取音色槽位费（后付费音色）。',
  },
  {
    feature: '录音文件识别 2.0（视音频转录）',
    unit: '小时',
    payAsYouGo: '0.8 元 / 小时',
    resourcePack: '约 0.9 元 / 小时（1000 小时包 ¥900）',
    note: '按音频时长计费，单文件最长 5 小时 / 512MB；说话人分离不额外收费。',
  },
  {
    feature: '流式语音识别 2.0',
    unit: '小时',
    payAsYouGo: '1.0 元 / 小时',
    note: '本工具暂未集成流式识别，列出仅供参考。',
  },
];

// 录音文件识别 2.0 按量单价（元/小时），用于转录页费用估算
export const ASR_PRICE_PER_HOUR = 0.8;
