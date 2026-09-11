import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  Sparkles,
  Layers,
  LayoutGrid,
  Workflow,
  Scale,
  BarChart3,
  Share2,
  Target,
  Film,
  Lightbulb,
} from 'lucide-react';
import {
  LAYOUTS,
  LAYOUT_CATEGORIES,
  type LayoutSpec,
  type LayoutCategory,
} from '../lib/illustrator/layoutBible';

interface LayoutSelectorModalProps {
  open: boolean;
  onClose: () => void;
  selectedLayoutId?: string;
  onSelect: (layoutId: string) => void;
}

const LayoutWireframePreview: React.FC<{ layoutId: string; category: LayoutCategory }> = ({
  layoutId,
  category,
}) => {
  switch (layoutId) {
    case 'binary-comparison':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="6" y="8" width="40" height="48" rx="4" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
          <rect x="54" y="8" width="40" height="48" rx="4" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" />
          <line x1="50" y1="6" x2="50" y2="58" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.5" />
          <circle cx="26" cy="20" r="4" fill="currentColor" />
          <circle cx="74" cy="20" r="4" fill="currentColor" />
          <line x1="14" y1="32" x2="38" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="62" y1="32" x2="86" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'four-quadrant-grid':
    case 'swot-matrix':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="6" y="6" width="41" height="23" rx="3" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
          <rect x="53" y="6" width="41" height="23" rx="3" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="6" y="35" width="41" height="23" rx="3" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.2" />
          <rect x="53" y="35" width="41" height="23" rx="3" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
          <line x1="50" y1="4" x2="50" y2="60" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="4" y1="32" x2="96" y2="32" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );

    case 'nine-grid':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <rect
                key={`${r}-${c}`}
                x={8 + c * 29}
                y={6 + r * 18}
                width="26"
                height="15"
                rx="2"
                fill="currentColor"
                fillOpacity={r === 1 && c === 1 ? '0.35' : '0.15'}
                stroke="currentColor"
                strokeWidth="1"
              />
            ))
          )}
        </svg>
      );

    case 'comparison-matrix':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="8" y="8" width="84" height="48" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="8" y1="22" x2="92" y2="22" stroke="currentColor" strokeWidth="1.2" />
          <line x1="8" y1="36" x2="92" y2="36" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.6" />
          <line x1="8" y1="50" x2="92" y2="50" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" strokeOpacity="0.6" />
          <line x1="36" y1="8" x2="36" y2="56" stroke="currentColor" strokeWidth="1.2" />
          <line x1="64" y1="8" x2="64" y2="56" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" strokeOpacity="0.6" />
        </svg>
      );

    case 'asymmetry':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="6" y="8" width="58" height="48" rx="4" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" />
          <rect x="70" y="14" width="24" height="14" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1" />
          <rect x="70" y="34" width="24" height="22" rx="2" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1" />
        </svg>
      );

    case 'breaking-the-grid':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="18" y="14" width="68" height="42" rx="4" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
          <circle cx="36" cy="22" r="16" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.5" />
          <line x1="56" y1="28" x2="80" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="56" y1="38" x2="74" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'three-tier':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="14" y="6" width="72" height="14" rx="2.5" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.2" />
          <rect x="10" y="24" width="80" height="15" rx="2.5" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
          <rect x="6" y="43" width="88" height="16" rx="2.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );

    case 'speech-bubbles':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="8" y="8" width="52" height="22" rx="4" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="16,30 24,30 18,36" fill="currentColor" fillOpacity="0.25" />
          <rect x="40" y="32" width="52" height="22" rx="4" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="76,32 84,32 82,26" fill="currentColor" fillOpacity="0.15" />
        </svg>
      );

    case 'left-text-right-image':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="52" y="8" width="42" height="48" rx="4" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.2" />
          <line x1="8" y1="16" x2="44" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="8" y1="26" x2="40" y2="26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="34" x2="42" y2="34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="42" x2="32" y2="42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'top-image-bottom-text':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="8" y="6" width="84" height="30" rx="3" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.2" />
          <line x1="12" y1="44" x2="88" y2="44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="52" x2="68" y2="52" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'wave-path':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <path d="M 6 38 C 22 16, 42 16, 50 32 C 58 48, 78 48, 94 26" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
          <circle cx="16" cy="30" r="4" fill="currentColor" />
          <circle cx="50" cy="32" r="4" fill="currentColor" />
          <circle cx="84" cy="34" r="4" fill="currentColor" />
        </svg>
      );

    case 'linear-progression':
    case 'one-way-flow':
    case 'z-pattern':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="6" y="18" width="22" height="28" rx="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          <rect x="39" y="18" width="22" height="28" rx="3" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
          <rect x="72" y="18" width="22" height="28" rx="3" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.2" />
          <path d="M 29 32 L 37 32 M 34 29 L 37 32 L 34 35" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M 62 32 L 70 32 M 67 29 L 70 32 L 67 35" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      );

    case 'step-staircase':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="8" y="38" width="24" height="20" rx="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          <rect x="38" y="24" width="24" height="34" rx="3" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
          <rect x="68" y="10" width="24" height="48" rx="3" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.2" />
          <path d="M 20 32 L 50 18 L 80 4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
        </svg>
      );

    case 'funnel':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <polygon points="10,10 90,10 76,26 24,26" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="26,28 74,28 62,42 38,42" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="40,44 60,44 55,56 45,56" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );

    case 'circular-flow':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <circle cx="50" cy="32" r="22" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" fill="none" />
          <circle cx="50" cy="10" r="5" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="1" />
          <circle cx="72" cy="32" r="5" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="1" />
          <circle cx="50" cy="54" r="5" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="1" />
          <circle cx="28" cy="32" r="5" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="1" />
        </svg>
      );

    case 'dashboard':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="6" y="6" width="88" height="20" rx="3" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
          <rect x="6" y="30" width="41" height="28" rx="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          <rect x="53" y="30" width="41" height="28" rx="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          <line x1="14" y1="16" x2="38" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 60 20 L 70 12 L 80 17 L 88 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      );

    case 'bento-grid':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="6" y="6" width="52" height="52" rx="4" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
          <rect x="62" y="6" width="32" height="24" rx="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          <rect x="62" y="34" width="32" height="24" rx="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );

    case 'hub-spoke':
    case 'radial-network':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <circle cx="50" cy="32" r="9" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="20" cy="18" r="4.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1" />
          <circle cx="80" cy="18" r="4.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1" />
          <circle cx="20" cy="46" r="4.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1" />
          <circle cx="80" cy="46" r="4.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="32" x2="20" y2="18" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="50" y1="32" x2="80" y2="18" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="50" y1="32" x2="20" y2="46" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="50" y1="32" x2="80" y2="46" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );

    case 'venn-diagram':
    case 'venn-triple':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <circle cx="38" cy="32" r="20" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="62" cy="32" r="20" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );

    case 'hierarchical-layers':
    case 'pyramid':
    case 'pyramid-tier':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <polygon points="50,6 64,22 36,22" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="34,25 66,25 76,41 24,41" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="22,44 78,44 88,60 12,60" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );

    case 'iceberg':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <line x1="6" y1="24" x2="94" y2="24" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" />
          <polygon points="50,10 60,23 40,23" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.2" />
          <polygon points="40,25 60,25 78,56 22,56" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );

    case 'single-focal-point':
    case 'center-focus':
    case 'single-object-art':
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="10" y="10" width="80" height="44" rx="4" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
          <rect x="36" y="18" width="28" height="28" rx="4" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="50" cy="32" r="5" fill="currentColor" />
        </svg>
      );

    default:
      if (category === 'process') {
        return (
          <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
            <line x1="10" y1="32" x2="90" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="20" cy="32" r="6" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="50" cy="32" r="6" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="80" cy="32" r="6" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        );
      }
      if (category === 'comparison') {
        return (
          <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
            <rect x="8" y="12" width="38" height="40" rx="3" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
            <rect x="54" y="12" width="38" height="40" rx="3" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        );
      }
      if (category === 'data') {
        return (
          <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
            <rect x="8" y="10" width="24" height="44" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
            <rect x="38" y="10" width="24" height="44" rx="2" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.2" />
            <rect x="68" y="10" width="24" height="44" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        );
      }
      return (
        <svg viewBox="0 0 100 64" className="w-full h-full text-indigo-500/70 dark:text-indigo-400/80">
          <rect x="14" y="12" width="72" height="40" rx="4" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="34" cy="32" r="8" fill="currentColor" fillOpacity="0.4" />
          <line x1="50" y1="26" x2="74" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="50" y1="38" x2="68" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
  }
};

const CATEGORY_ICON_MAP: Record<LayoutCategory, React.ComponentType<{ className?: string }>> = {
  process: Workflow,
  comparison: Scale,
  data: BarChart3,
  hierarchy: Layers,
  relation: Share2,
  focus: Target,
  narrative: Film,
  metaphor: Lightbulb,
};

export const LayoutSelectorModal: React.FC<LayoutSelectorModalProps> = ({
  open,
  onClose,
  selectedLayoutId = 'auto',
  onSelect,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const allLayoutList: LayoutSpec[] = useMemo(() => Object.values(LAYOUTS), []);

  const filteredList = useMemo(() => {
    return allLayoutList.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchLabel = item.label.toLowerCase().includes(q);
        const matchDesc = item.desc.toLowerCase().includes(q);
        const matchId = item.id.toLowerCase().includes(q);
        return matchLabel || matchDesc || matchId;
      }
      return true;
    });
  }, [allLayoutList, activeCategory, searchQuery]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[88vh] bg-white dark:bg-[#13141b] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden">
        {/* 顶部 Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  信息图版式全集大厅 (88+ 种官方架构)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 font-semibold border border-cyan-200/60 dark:border-cyan-800/60">
                  对齐商汤官方 sn-infographic 完整规范
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                版式决定「信息怎么排」，画风决定「质感怎么渲染」。支持自适应或挑选固定版式
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
              placeholder="搜索版式名称、特性或适用场景（如：对比、步骤、四象限、漏斗、金字塔）…"
              className="w-full pl-8 pr-4 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:ring-1 focus:ring-cyan-500 outline-none"
            />
          </div>

          {/* 分类 Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1 rounded-lg font-medium transition shrink-0 cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-cyan-600 text-white font-bold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              全部 ({allLayoutList.length})
            </button>

            {LAYOUT_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICON_MAP[cat.id] || LayoutGrid;
              const count = allLayoutList.filter((i) => i.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    activeCategory === cat.id
                      ? 'bg-cyan-600 text-white font-bold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  title={cat.desc}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cat.label}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 版式卡片网格展示区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
          {/* 首位推荐：AI 自动智能匹配 */}
          {activeCategory === 'all' && !searchQuery && (
            <div
              onClick={() => {
                onSelect('auto');
                onClose();
              }}
              className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                selectedLayoutId === 'auto' || !selectedLayoutId
                  ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/30 ring-1 ring-cyan-500 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#14151c] hover:border-cyan-300 dark:hover:border-cyan-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      🤖 AI 智能自适应匹配 (官方推荐)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold border border-cyan-500/20">
                      全自动
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    由视觉规划大模型通读每句旁白，根据对比、步骤、数据或概念等语义形态，在 60+ 版式库中自动选择最优版式
                  </p>
                </div>
              </div>

              {(selectedLayoutId === 'auto' || !selectedLayoutId) && (
                <div className="w-6 h-6 rounded-full bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          )}

          {/* 60+ 版式矩阵卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {filteredList.map((item) => {
              const isSelected = selectedLayoutId === item.id;
              const catMeta = LAYOUT_CATEGORIES.find((c) => c.id === item.category);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col group relative ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-50/40 dark:bg-cyan-950/30 ring-2 ring-cyan-500/80 shadow-md'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#14151c] hover:border-cyan-300 dark:hover:border-cyan-700/60 hover:shadow-xs'
                  }`}
                >
                  {/* 结构骨架线框示意图 */}
                  <div className="w-full aspect-[16/10] rounded-lg bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200/60 dark:border-zinc-800/80 overflow-hidden flex items-center justify-center p-1.5 relative group-hover:scale-[1.02] transition-transform">
                    <LayoutWireframePreview layoutId={item.id} category={item.category} />

                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-cyan-600 text-white flex items-center justify-center shadow">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>

                  {/* 文本说明 */}
                  <div className="mt-2 flex flex-col flex-1 justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-[11.5px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.label}
                        </span>
                        {catMeta && (
                          <span className="text-[9px] px-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 shrink-0">
                            {catMeta.label.slice(0, 2)}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed" title={item.desc}>
                        {item.desc}
                      </p>
                    </div>

                    <div className="mt-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
                      <span className="text-[9px] text-cyan-600 dark:text-cyan-400 font-mono truncate block">
                        {item.id}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredList.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-400">
              <LayoutGrid className="w-8 h-8 mb-2 opacity-30 text-cyan-500" />
              <p className="text-xs">未找到包含 "{searchQuery}" 的版式</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="mt-2 text-[11px] text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                清除搜索条件
              </button>
            </div>
          )}
        </div>

        {/* 底部 Footer */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <div className="flex items-center gap-2">
            <span>当前选择：</span>
            <span className="font-bold text-cyan-600 dark:text-cyan-400">
              {selectedLayoutId === 'auto' || !selectedLayoutId
                ? '🤖 自动匹配 (AI 语义自适应)'
                : LAYOUTS[selectedLayoutId]?.label || selectedLayoutId}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayoutSelectorModal;
