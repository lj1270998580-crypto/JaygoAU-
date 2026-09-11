import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  Palette,
  Wand2,
} from 'lucide-react';
import { STYLE_OPTIONS, type StyleConfig } from './VideoIllustrator';
import { STYLE_PLANNER_GUIDANCE } from '../lib/illustrator/styleBible';

interface StyleSelectorModalProps {
  open: boolean;
  onClose: () => void;
  selectedStyleId?: string;
  onSelect: (styleId: string) => void;
}

export type StyleCategory = 'all' | 'business' | 'artistic' | 'chinese' | 'modern';

export interface StyleCategoryMeta {
  id: StyleCategory;
  label: string;
  desc: string;
}

export const STYLE_CATEGORIES: StyleCategoryMeta[] = [
  { id: 'all', label: '全部画风', desc: '全量官方精选视觉风格' },
  { id: 'business', label: '商务与科技', desc: '现代商业扁平、写实摄影与等距3D' },
  { id: 'artistic', label: '艺术与手绘', desc: '彩铅、古典油画、水彩、黑板与黏土' },
  { id: 'chinese', label: '东方与国风', desc: '传统写意水墨与新国潮美学' },
  { id: 'modern', label: '潮流与二次元', desc: '现代日漫卡通、极简线条与赛博朋克' },
];

/** 风格视觉元信息扩展（调色盘与分类映射） */
interface StyleDisplayMeta {
  category: StyleCategory;
  colors: string[];
  lighting: string;
  texture: string;
}

const STYLE_DISPLAY_MAP: Record<string, StyleDisplayMeta> = {
  modern_business: {
    category: 'business',
    colors: ['#2B4C7E', '#DCE4EC', '#F4A261', '#2A9D8F'],
    lighting: '通透漫射软光 · 无明显生硬投影',
    texture: '现代扁平矢量 · 极细微哑光颗粒',
  },
  colored_pencil: {
    category: 'artistic',
    colors: ['#E76F51', '#F4A261', '#E9C46A', '#2A9D8F'],
    lighting: '温暖自然侧光 · 柔和过渡',
    texture: '细密排线笔触 · 彩色铅笔叠色质感',
  },
  classical_oil: {
    category: 'artistic',
    colors: ['#5C3D2E', '#B85D19', '#E0C097', '#2D2424'],
    lighting: '伦勃朗明暗对照光 · 戏剧性高反差',
    texture: '油画颜料厚涂肌理 · 典雅古典开裂微纹',
  },
  cinematic_real: {
    category: 'business',
    colors: ['#1A1A24', '#3A3F58', '#E2E8F0', '#0EA5E9'],
    lighting: '电影级侧逆轮廓光 · 真实微距景深',
    texture: '超高清写实光学质感 · 细致材质纹理',
  },
  chinese_ink: {
    category: 'chinese',
    colors: ['#18181B', '#52525B', '#A1A1AA', '#C2410C'],
    lighting: '散点透视 · 东方意境空灵留白',
    texture: '生宣纸渗染晕墨 · 浓淡干湿焦五色',
  },
  anime_cartoon: {
    category: 'modern',
    colors: ['#3B82F6', '#EC4899', '#FBBF24', '#10B981'],
    lighting: '明快通透全局光 · 纯净通透高光',
    texture: '赛璐璐利落描边 · 治愈系平涂',
  },
  isometric_3d: {
    category: 'business',
    colors: ['#6366F1', '#8B5CF6', '#EC4899', '#F1F5F9'],
    lighting: '柔和立体等距环境光 · 浅半透明投影',
    texture: '3D 微缩建模 · 细腻哑光粘土与磨砂亚克力',
  },
  watercolor_book: {
    category: 'artistic',
    colors: ['#6EE7B7', '#93C5FD', '#FDE68A', '#FCA5A5'],
    lighting: '晨光般柔润漫射 · 轻盈通透',
    texture: '纯棉水彩纸纹理 · 水色边缘自然渗透',
  },
  minimal_line: {
    category: 'modern',
    colors: ['#09090B', '#71717A', '#F4F4F5', '#E11D48'],
    lighting: '无阴影纯线描 · 视觉留白极度克制',
    texture: '高精度几何单色线条 · 高级画廊版式',
  },
  cyberpunk: {
    category: 'modern',
    colors: ['#06B6D4', '#EC4899', '#8B5CF6', '#09090B'],
    lighting: '霓虹点光源反光 · 雨夜金属辉光',
    texture: '赛博科技数据流 · 全息微噪点',
  },
  'chinese-guochao': {
    category: 'chinese',
    colors: ['#991B1B', '#D97706', '#047857', '#FEF3C7'],
    lighting: '宫廷金石微辉 · 华美典雅',
    texture: '工笔重彩描金 · 祥云瑞兽传统纹样',
  },
  claymation: {
    category: 'artistic',
    colors: ['#F97316', '#06B6D4', '#84CC16', '#F59E0B'],
    lighting: '摄影棚微距摄影灯 · 定格动画质感',
    texture: '手工黏土指纹微痕 · 圆润萌趣倒角',
  },
  chalkboard: {
    category: 'artistic',
    colors: ['#1C2826', '#E2E8F0', '#FDE047', '#38BDF8'],
    lighting: '教室自然顶光 · 黑板漫反射',
    texture: '墨绿黑板颗粒底色 · 彩色粉笔摩擦笔痕',
  },
  'swiss-style': {
    category: 'business',
    colors: ['#DC2626', '#18181B', '#F4F4F5', '#2563EB'],
    lighting: '现代主义平面无阴影 · 纯粹严谨',
    texture: '非衬线排版 · 绝对网格几何对齐',
  },
};

/** 风格视觉示意矢量图组件 */
const StyleVisualPreview: React.FC<{ styleId: string }> = ({ styleId }) => {
  switch (styleId) {
    case 'modern_business':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <defs>
            <linearGradient id="mb-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2B4C7E" />
              <stop offset="100%" stopColor="#1E293B" />
            </linearGradient>
          </defs>
          <rect width="100" height="64" fill="url(#mb-bg)" rx="6" />
          <rect x="12" y="16" width="36" height="32" rx="4" fill="#3B82F6" fillOpacity="0.4" />
          <rect x="22" y="10" width="40" height="38" rx="4" fill="#60A5FA" fillOpacity="0.3" />
          <rect x="56" y="22" width="32" height="26" rx="3" fill="#F4A261" fillOpacity="0.8" />
          <circle cx="32" cy="26" r="6" fill="#F8FAFC" fillOpacity="0.8" />
          <line x1="20" y1="38" x2="44" y2="38" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
          <line x1="62" y1="32" x2="80" y2="32" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'chinese_ink':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#F4F1EA" rx="6" />
          <path d="M 4 52 C 24 36, 44 48, 62 34 C 74 24, 88 38, 96 30 L 96 64 L 4 64 Z" fill="#27272A" fillOpacity="0.8" />
          <path d="M 20 48 C 38 28, 54 36, 72 22 C 84 14, 92 24, 96 18 L 96 64 L 20 64 Z" fill="#71717A" fillOpacity="0.4" />
          <circle cx="28" cy="20" r="7" fill="#DC2626" fillOpacity="0.65" />
          <rect x="80" y="8" width="8" height="12" fill="#B91C1C" rx="1" />
          <line x1="84" y1="10" x2="84" y2="18" stroke="#FEF2F2" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    case 'classical_oil':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <defs>
            <radialGradient id="oil-light" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#D97706" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#78350F" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#1C1917" />
            </radialGradient>
          </defs>
          <rect width="100" height="64" fill="url(#oil-light)" rx="6" />
          <circle cx="38" cy="28" r="14" fill="#FDE68A" fillOpacity="0.5" />
          <path d="M 16 54 C 28 38, 48 36, 68 44 C 80 50, 88 46, 94 56" stroke="#92400E" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M 12 50 C 26 42, 46 40, 64 48 C 76 54, 84 48, 90 58" stroke="#B45309" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      );

    case 'colored_pencil':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#FEFDF9" rx="6" />
          {[0, 4, 8, 12, 16, 20, 24, 28, 32].map((i) => (
            <line
              key={`h1-${i}`}
              x1={10 + i * 2}
              y1={46 - i}
              x2={38 + i * 2}
              y2={18 - i}
              stroke="#F43F5E"
              strokeWidth="1.2"
              strokeOpacity="0.75"
              strokeLinecap="round"
            />
          ))}
          {[0, 4, 8, 12, 16, 20].map((i) => (
            <line
              key={`h2-${i}`}
              x1={46 + i * 2}
              y1={54 - i}
              x2={74 + i * 2}
              y2={26 - i}
              stroke="#0EA5E9"
              strokeWidth="1.2"
              strokeOpacity="0.75"
              strokeLinecap="round"
            />
          ))}
          <circle cx="68" cy="24" r="10" stroke="#F59E0B" strokeWidth="2" fill="#FEF3C7" fillOpacity="0.4" strokeDasharray="3 1.5" />
        </svg>
      );

    case 'isometric_3d':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#0F172A" rx="6" />
          <polygon points="50,14 74,26 50,38 26,26" fill="#818CF8" />
          <polygon points="26,26 50,38 50,54 26,42" fill="#4F46E5" />
          <polygon points="74,26 50,38 50,54 74,42" fill="#6366F1" />
          <polygon points="80,10 90,15 80,20 70,15" fill="#EC4899" fillOpacity="0.8" />
          <polygon points="70,15 80,20 80,26 70,21" fill="#BE185D" fillOpacity="0.8" />
          <polygon points="90,15 80,20 80,26 90,21" fill="#DB2777" fillOpacity="0.8" />
        </svg>
      );

    case 'cinematic_real':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <defs>
            <linearGradient id="cine-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0B0F19" />
              <stop offset="60%" stopColor="#1E293B" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <rect width="100" height="64" fill="url(#cine-grad)" rx="6" />
          <circle cx="68" cy="24" r="16" fill="#38BDF8" fillOpacity="0.25" />
          <circle cx="34" cy="42" r="12" fill="#60A5FA" fillOpacity="0.15" />
          <rect x="24" y="20" width="34" height="28" rx="2" fill="none" stroke="#94A3B8" strokeWidth="1" strokeDasharray="4 2" />
          <line x1="16" y1="34" x2="22" y2="34" stroke="#F8FAFC" strokeWidth="1" />
          <line x1="60" y1="34" x2="66" y2="34" stroke="#F8FAFC" strokeWidth="1" />
          <line x1="41" y1="12" x2="41" y2="18" stroke="#F8FAFC" strokeWidth="1" />
          <line x1="41" y1="50" x2="41" y2="56" stroke="#F8FAFC" strokeWidth="1" />
        </svg>
      );

    case 'anime_cartoon':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#EFF6FF" rx="6" />
          <path d="M 20 64 C 24 34, 40 22, 62 18 C 76 16, 88 28, 96 64 Z" fill="#60A5FA" stroke="#1D4ED8" strokeWidth="1.5" />
          <circle cx="48" cy="30" r="8" fill="#F472B6" />
          <circle cx="70" cy="36" r="6" fill="#FBBF24" />
          <path d="M 6 48 Q 24 36 44 46 T 84 40" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'watercolor_book':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#FDFBF7" rx="6" />
          <circle cx="36" cy="30" r="18" fill="#34D399" fillOpacity="0.4" />
          <circle cx="58" cy="26" r="16" fill="#60A5FA" fillOpacity="0.45" />
          <circle cx="48" cy="42" r="14" fill="#FBBF24" fillOpacity="0.4" />
          <path d="M 20 48 Q 48 30 76 44" fill="none" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6" />
        </svg>
      );

    case 'minimal_line':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#FAFAFA" rx="6" />
          <circle cx="34" cy="28" r="12" fill="none" stroke="#18181B" strokeWidth="1.5" />
          <line x1="34" y1="40" x2="34" y2="56" stroke="#18181B" strokeWidth="1.5" />
          <path d="M 52 18 L 82 18 M 52 28 L 74 28 M 52 38 L 86 38" stroke="#18181B" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="78" cy="46" r="4" fill="#E11D48" />
        </svg>
      );

    case 'cyberpunk':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#090A0F" rx="6" />
          <line x1="0" y1="46" x2="100" y2="46" stroke="#EC4899" strokeWidth="1.5" strokeOpacity="0.8" />
          {[14, 28, 42, 56, 70, 84].map((x) => (
            <line key={`grid-${x}`} x1={x} y1="46" x2={50 + (x - 50) * 1.8} y2="64" stroke="#06B6D4" strokeWidth="1" strokeOpacity="0.5" />
          ))}
          <circle cx="50" cy="26" r="14" fill="#F43F5E" fillOpacity="0.7" />
          <rect x="22" y="18" width="16" height="28" fill="#06B6D4" fillOpacity="0.4" />
          <rect x="62" y="12" width="18" height="34" fill="#8B5CF6" fillOpacity="0.4" />
        </svg>
      );

    case 'chalkboard':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#1C2826" rx="6" />
          <rect x="4" y="4" width="92" height="56" rx="3" fill="none" stroke="#78350F" strokeWidth="2" strokeOpacity="0.6" />
          <line x1="14" y1="18" x2="52" y2="18" stroke="#FEF08A" strokeWidth="1.5" strokeDasharray="3 1.5" />
          <line x1="14" y1="28" x2="42" y2="28" stroke="#F8FAFC" strokeWidth="1.2" strokeDasharray="2 1" />
          <circle cx="70" cy="32" r="10" fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeDasharray="4 2" />
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full">
          <rect width="100" height="64" fill="#18181B" rx="6" />
          <circle cx="50" cy="32" r="16" fill="#6366F1" fillOpacity="0.5" />
          <line x1="20" y1="48" x2="80" y2="48" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
};

export const StyleSelectorModal: React.FC<StyleSelectorModalProps> = ({
  open,
  onClose,
  selectedStyleId = 'auto',
  onSelect,
}) => {
  const [activeCategory, setActiveCategory] = useState<StyleCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 过滤出除了 auto 外的常规风格
  const regularStyles: StyleConfig[] = useMemo(() => {
    return STYLE_OPTIONS.filter((s) => s.id !== 'auto');
  }, []);

  const autoStyle = useMemo(() => {
    return STYLE_OPTIONS.find((s) => s.id === 'auto') || STYLE_OPTIONS[0];
  }, []);

  const filteredStyles = useMemo(() => {
    return regularStyles.filter((style) => {
      const meta = STYLE_DISPLAY_MAP[style.id];
      if (activeCategory !== 'all' && meta?.category !== activeCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchLabel = style.label.toLowerCase().includes(q);
        const matchDesc = style.desc.toLowerCase().includes(q);
        const matchBadge = style.badge.toLowerCase().includes(q);
        const matchId = style.id.toLowerCase().includes(q);
        const guidance = STYLE_PLANNER_GUIDANCE[style.id];
        const matchSuit = (guidance?.suitableSubjects || []).some((s) => s.toLowerCase().includes(q));
        return matchLabel || matchDesc || matchBadge || matchId || matchSuit;
      }
      return true;
    });
  }, [regularStyles, activeCategory, searchQuery]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[88vh] bg-white dark:bg-[#13141b] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden">
        {/* 顶部 Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  图片画风全景参考大厅
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-semibold border border-rose-200/60 dark:border-rose-800/60">
                  官方多维度视觉预设
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                直观预览每种画风的代表色调、光影质感与推荐题材；首选「自动」由模型智能分析文案调性全片统一
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 搜索与分类导航栏 */}
        <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-[#111217] space-y-2 shrink-0">
          {/* 搜索条 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索画风名称、艺术媒介或适用场景（如：商务、手绘、水墨、油画、摄影、动漫、3D）…"
              className="w-full pl-8 pr-4 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:ring-1 focus:ring-rose-500 outline-none"
            />
          </div>

          {/* 分类 Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-xs">
            {STYLE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1 rounded-lg font-medium transition shrink-0 cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-rose-600 text-white font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* 核心卡片列表滚动区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 顶置：AI 自动语义分析匹配推荐卡 */}
          <div
            onClick={() => {
              onSelect('auto');
              onClose();
            }}
            className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
              selectedStyleId === 'auto'
                ? 'border-indigo-500 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-950/40 dark:via-purple-950/40 dark:to-pink-950/40 ring-2 ring-indigo-500/20 shadow-md'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-gradient-to-r from-indigo-50/50 to-purple-50/30 dark:from-zinc-900/60 dark:to-zinc-900/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-rose-500 text-white flex items-center justify-center shadow-md shrink-0">
                <Wand2 className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                    {autoStyle.label}
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500 text-white font-bold">
                    官方默认推荐
                  </span>
                  {selectedStyleId === 'auto' && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center gap-0.5">
                      <Check className="w-3 h-3" />
                      当前选中
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 font-medium">
                  {autoStyle.desc}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                  <span>✨ 大模型通读全文文案</span>
                  <span>·</span>
                  <span>🎨 匹配最契合画风</span>
                  <span>·</span>
                  <span>🔒 锁定全片画风统一</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                selectedStyleId === 'auto'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60'
              }`}
            >
              {selectedStyleId === 'auto' ? '已选择该推荐' : '选用自动匹配'}
            </button>
          </div>

          {/* 固定风格卡片网格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredStyles.map((style) => {
              const meta = STYLE_DISPLAY_MAP[style.id];
              const guidance = STYLE_PLANNER_GUIDANCE[style.id];
              const isSelected = selectedStyleId === style.id;

              return (
                <div
                  key={style.id}
                  onClick={() => {
                    onSelect(style.id);
                    onClose();
                  }}
                  className={`group p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden bg-zinc-50/40 dark:bg-zinc-900/40 hover:shadow-md ${
                    isSelected
                      ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 dark:bg-rose-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-rose-300 dark:hover:border-rose-700'
                  }`}
                >
                  {/* 顶部标签与勾选 */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 group-hover:bg-rose-50 dark:group-hover:bg-rose-950/60 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition">
                      {style.badge}
                    </span>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-xs">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  {/* 核心视觉示意预览图 */}
                  <div className="w-full aspect-[16/10] rounded-lg overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 mb-2 shadow-xs group-hover:scale-[1.01] transition">
                    <StyleVisualPreview styleId={style.id} />
                  </div>

                  {/* 风格标题与关键词 */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition">
                      {style.label}
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                      {style.desc}
                    </p>
                  </div>

                  {/* 调色板与质感标签 */}
                  <div className="mt-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400">
                    <div className="flex items-center gap-1">
                      {meta?.colors.map((c, i) => (
                        <span
                          key={i}
                          className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/10"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                    {guidance?.suitableSubjects?.[0] && (
                      <span className="truncate max-w-[120px] text-zinc-500 dark:text-zinc-400" title={guidance.suitableSubjects.join('、')}>
                        {guidance.suitableSubjects[0]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredStyles.length === 0 && (
            <div className="p-8 text-center text-zinc-400 text-xs">
              未找到匹配的画风，请尝试缩短或更换搜索词
            </div>
          )}
        </div>

        {/* 底部 Footer */}
        <div className="p-3 px-4 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-rose-500" />
            <span>
              已收录 <strong className="text-zinc-700 dark:text-zinc-200">{STYLE_OPTIONS.length}</strong> 种官方视觉风格 · 当前：
              <strong className="text-rose-600 dark:text-rose-400 font-bold ml-1">
                {STYLE_OPTIONS.find((s) => s.id === selectedStyleId)?.label || '自动匹配'}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold hover:opacity-90 transition cursor-pointer"
          >
            完成选择
          </button>
        </div>
      </div>
    </div>
  );
};

export default StyleSelectorModal;
