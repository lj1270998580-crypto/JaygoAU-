/**
 * 5 套主流自媒体口播字幕模版与样式定义
 */

import type { SubtitleTemplateId, SubtitleStyleConfig } from './types';

export interface SubtitleTemplateDef {
  id: SubtitleTemplateId;
  name: string;
  badge: string;
  description: string;
  defaultConfig: SubtitleStyleConfig;
}

export const SUBTITLE_TEMPLATES: SubtitleTemplateDef[] = [
  {
    id: 'viral_double',
    name: '爆款双行强化',
    badge: '🔥 抖音首选',
    description: '主句亮白加粗，核心关键词自动高亮金黄，带黑色立体投影，极具视觉抓取力。',
    defaultConfig: {
      templateId: 'viral_double',
      fontSize: 28,
      textColor: '#ffffff',
      highlightColor: '#facc15', // yellow-400
      strokeColor: '#000000',
      strokeWidth: 3,
      yPercent: 0.18,
    },
  },
  {
    id: 'karaoke',
    name: '逐词跳跃卡拉OK',
    badge: '🎤 动感吸睛',
    description: '随着说话声波推进，当前正在朗读的字词动态变为亮黄色或橙红放大跳跃。',
    defaultConfig: {
      templateId: 'karaoke',
      fontSize: 26,
      textColor: '#e4e4e7',
      highlightColor: '#38bdf8', // sky-400
      strokeColor: '#09090b',
      strokeWidth: 3,
      yPercent: 0.18,
    },
  },
  {
    id: 'clean_white',
    name: '极简白字黑边',
    badge: '💎 知识博主',
    description: '高质感思源黑体，纯白字体配沉稳黑描边与微弱弥散阴影，沉稳耐看且不抢主体风头。',
    defaultConfig: {
      templateId: 'clean_white',
      fontSize: 24,
      textColor: '#ffffff',
      highlightColor: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 2.5,
      yPercent: 0.16,
    },
  },
  {
    id: 'pill_badge',
    name: '亮黄胶囊底色',
    badge: '🏷️ 强提示卡片',
    description: '文字包裹在醒目的圆角亮黄底色卡片内，黑字黄底，在复杂嘈杂背景下文字 100% 辨识。',
    defaultConfig: {
      templateId: 'pill_badge',
      fontSize: 22,
      textColor: '#000000',
      highlightColor: '#000000',
      strokeColor: 'transparent',
      strokeWidth: 0,
      yPercent: 0.18,
      boxColor: '#fbbf24', // amber-400
    },
  },
  {
    id: 'bilingual',
    name: '现代双语对照',
    badge: '🌐 国际视野',
    description: '上层为醒目中文主字幕，下层为浅灰斜体英文翻译对照，适合出海或双语播客。',
    defaultConfig: {
      templateId: 'bilingual',
      fontSize: 24,
      textColor: '#ffffff',
      highlightColor: '#a1a1aa',
      strokeColor: '#000000',
      strokeWidth: 2,
      yPercent: 0.18,
    },
  },
];
