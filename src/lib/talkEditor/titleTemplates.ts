/**
 * 7 套主流自媒体爆款大标题贴片预设样式定义
 */

import type { TitleStylePresetId } from './types';

export interface TitleStyleDef {
  id: TitleStylePresetId;
  name: string;
  badge: string;
  description: string;
  previewBg: string;
  previewText: string;
  defaultConfig: {
    textColor: string;
    backgroundColor: string;
    borderRadius: number;
    fontWeight: 'normal' | 'bold' | '900';
    border?: string;
    boxShadow?: string;
    textShadow?: string;
    backdropFilter?: string;
  };
}

export const TITLE_STYLE_PRESETS: TitleStyleDef[] = [
  {
    id: 'viral_yellow',
    name: '爆款黄底黑字',
    badge: '🔥 抖音首选',
    description: '亮黄底加粗黑字，短视频最抓眼球的经典招牌样式，商业/干货顶流同款。',
    previewBg: '#facc15',
    previewText: '#000000',
    defaultConfig: {
      textColor: '#000000',
      backgroundColor: '#facc15',
      borderRadius: 10,
      fontWeight: '900',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
    },
  },
  {
    id: 'black_gold',
    name: '黑金商务轻奢',
    badge: '👑 高端知识',
    description: '黑曜石半透卡片衬托尊贵金黄大字，配香槟金细发光边框，尊荣沉稳。',
    previewBg: 'rgba(20, 20, 28, 0.92)',
    previewText: '#fbbf24',
    defaultConfig: {
      textColor: '#fbbf24',
      backgroundColor: 'rgba(18, 18, 24, 0.90)',
      borderRadius: 12,
      fontWeight: 'bold',
      border: '1px solid rgba(251, 191, 36, 0.45)',
      boxShadow: '0 6px 20px rgba(0, 0, 0, 0.55), 0 0 10px rgba(251, 191, 36, 0.15)',
    },
  },
  {
    id: 'red_alert',
    name: '高能干货警示',
    badge: '🚨 必看警示',
    description: '鲜明正红底配纯白特粗大字，紧迫警示感拉满，适合痛点剖析与避坑揭秘。',
    previewBg: '#dc2626',
    previewText: '#ffffff',
    defaultConfig: {
      textColor: '#ffffff',
      backgroundColor: '#dc2626',
      borderRadius: 8,
      fontWeight: '900',
      border: '2px solid #ef4444',
      boxShadow: '0 4px 16px rgba(220, 38, 38, 0.45)',
    },
  },
  {
    id: 'clean_shadow',
    name: '极简3D立体影',
    badge: '✨ 极简立体',
    description: '完全透明底色，纯白特粗文字搭配多层纯黑描边与立体阴影，清爽不挡画面。',
    previewBg: 'rgba(0,0,0,0.4)',
    previewText: '#ffffff',
    defaultConfig: {
      textColor: '#ffffff',
      backgroundColor: 'transparent',
      borderRadius: 0,
      fontWeight: '900',
      textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 4px 12px rgba(0,0,0,0.9)',
    },
  },
  {
    id: 'cyber_gradient',
    name: '赛博炫彩潮牌',
    badge: '⚡ 潮流科技',
    description: '紫青粉多重动态渐变底色，潮流年轻态与数码科技感十足。',
    previewBg: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
    previewText: '#ffffff',
    defaultConfig: {
      textColor: '#ffffff',
      backgroundColor: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
      borderRadius: 12,
      fontWeight: '900',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      boxShadow: '0 6px 20px rgba(168, 85, 247, 0.45)',
    },
  },
  {
    id: 'neon_lime',
    name: '荧光青绿潮牌',
    badge: '🎯 醒目潮酷',
    description: '年轻活力的高饱和荧光绿，粗黑硬核无衬线体，极速吸引年轻观众眼球。',
    previewBg: '#84cc16',
    previewText: '#000000',
    defaultConfig: {
      textColor: '#000000',
      backgroundColor: '#84cc16',
      borderRadius: 8,
      fontWeight: '900',
      boxShadow: '0 4px 16px rgba(132, 204, 22, 0.4)',
    },
  },
  {
    id: 'frosted_glass',
    name: '质感半透毛玻璃',
    badge: '🎬 质感纪录',
    description: '黑透磨砂毛玻璃底板配极细白边框与高级字距，电影纪录片与深度访谈首选。',
    previewBg: 'rgba(0, 0, 0, 0.65)',
    previewText: '#f4f4f5',
    defaultConfig: {
      textColor: '#f4f4f5',
      backgroundColor: 'rgba(0, 0, 0, 0.68)',
      borderRadius: 12,
      fontWeight: 'bold',
      border: '1px solid rgba(255, 255, 255, 0.16)',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
      backdropFilter: 'blur(12px)',
    },
  },
];
