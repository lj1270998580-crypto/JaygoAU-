import React, { useState } from 'react';
import {
  Sparkles,
  Sliders,
  Type,
  Plus,
  Trash2,
  Minimize2,
  Maximize2,
  Split,
  Combine,
  Check,
} from 'lucide-react';
import type { SubtitleItem, SubtitleStyleConfig, SubtitleTemplateId } from '../../lib/talkEditor/types';
import { SUBTITLE_TEMPLATES } from '../../lib/talkEditor/subtitleTemplates';

interface SubtitleEditorPanelProps {
  subtitles: SubtitleItem[];
  onChangeSubtitles: (newSubtitles: SubtitleItem[]) => void;
  config: SubtitleStyleConfig;
  onChangeConfig: (newConfig: SubtitleStyleConfig) => void;
  currentTime: number;
  onSeek: (timeSec: number) => void;
}

export const SubtitleEditorPanel: React.FC<SubtitleEditorPanelProps> = ({
  subtitles,
  onChangeSubtitles,
  config,
  onChangeConfig,
  currentTime,
  onSeek,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'templates' | 'lines'>('templates');

  // 修改单条字幕文本
  const handleUpdateText = (id: string, text: string) => {
    onChangeSubtitles(
      subtitles.map((sub) => (sub.id === id ? { ...sub, text } : sub))
    );
  };

  // 微调时间戳
  const handleAdjustTime = (id: string, field: 'startTime' | 'endTime', delta: number) => {
    onChangeSubtitles(
      subtitles.map((sub) => {
        if (sub.id !== id) return sub;
        const newTime = Math.max(0, Math.round((sub[field] + delta) * 100) / 100);
        return { ...sub, [field]: newTime };
      })
    );
  };

  // 拆分字幕 (按当前文字中间拆成两句)
  const handleSplitSubtitle = (id: string) => {
    const idx = subtitles.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const target = subtitles[idx];
    const text = target.text.trim();
    if (text.length < 2) return;

    const midChar = Math.floor(text.length / 2);
    const midTime = (target.startTime + target.endTime) / 2;

    const part1: SubtitleItem = {
      id: `${target.id}-1`,
      startTime: target.startTime,
      endTime: Math.round(midTime * 100) / 100,
      text: text.slice(0, midChar),
    };
    const part2: SubtitleItem = {
      id: `${target.id}-2`,
      startTime: Math.round(midTime * 100) / 100,
      endTime: target.endTime,
      text: text.slice(midChar),
    };

    const nextList = [...subtitles];
    nextList.splice(idx, 1, part1, part2);
    onChangeSubtitles(nextList);
  };

  // 合并到下一句
  const handleMergeNext = (idx: number) => {
    if (idx >= subtitles.length - 1) return;
    const cur = subtitles[idx];
    const next = subtitles[idx + 1];

    const merged: SubtitleItem = {
      id: cur.id,
      startTime: cur.startTime,
      endTime: next.endTime,
      text: `${cur.text} ${next.text}`.trim(),
    };

    const nextList = [...subtitles];
    nextList.splice(idx, 2, merged);
    onChangeSubtitles(nextList);
  };

  // 删除单条字幕
  const handleDeleteSubtitle = (id: string) => {
    onChangeSubtitles(subtitles.filter((s) => s.id !== id));
  };

  return (
    <div className="h-full flex flex-col select-none text-xs overflow-hidden">
      {/* 顶部二级 Tab 切换 */}
      <div className="p-2.5 border-b border-zinc-800 bg-[#14151e] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('templates')}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
              activeSubTab === 'templates'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            字幕模版与样式
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('lines')}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
              activeSubTab === 'lines'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>逐句改字与微调</span>
            <span className="text-[10px] font-mono text-zinc-400">({subtitles.length})</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'templates' ? (
        /* Tab 1: 字幕模版与全局排版调节 */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* 5 套自媒体模版卡片 */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>爆款字幕视觉模版</span>
            </label>
            <div className="space-y-2">
              {SUBTITLE_TEMPLATES.map((tmpl) => {
                const isSelected = config.templateId === tmpl.id;
                return (
                  <div
                    key={tmpl.id}
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        ...tmpl.defaultConfig,
                        templateId: tmpl.id,
                      })
                    }
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 text-white ring-1 ring-indigo-500/40'
                        : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs">{tmpl.name}</span>
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {tmpl.badge}
                        </span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </div>
                    <p className="text-[10.5px] text-zinc-500 leading-relaxed mt-1">
                      {tmpl.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 全局样式调节滑块 */}
          <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-3">
            <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>全局字体与位置微调</span>
            </label>

            {/* 字号大小 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
                <span>字幕大小</span>
                <span className="font-mono text-zinc-300 font-bold">{config.fontSize || 24}px</span>
              </div>
              <input
                type="range"
                min={18}
                max={40}
                step={1}
                value={config.fontSize || 24}
                onChange={(e) => onChangeConfig({ ...config, fontSize: parseInt(e.target.value, 10) })}
                className="w-full h-1 accent-indigo-500"
              />
            </div>

            {/* 垂直 Y 轴高度位置 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
                <span>垂直高度位置 (距底部)</span>
                <span className="font-mono text-zinc-300 font-bold">
                  {((config.yPercent || 0.18) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0.08}
                max={0.38}
                step={0.01}
                value={config.yPercent || 0.18}
                onChange={(e) => onChangeConfig({ ...config, yPercent: parseFloat(e.target.value) })}
                className="w-full h-1 accent-indigo-500"
              />
            </div>

            {/* 描边粗细 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
                <span>文字立体黑描边粗细</span>
                <span className="font-mono text-zinc-300 font-bold">{config.strokeWidth || 2}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={6}
                step={0.5}
                value={config.strokeWidth ?? 2}
                onChange={(e) => onChangeConfig({ ...config, strokeWidth: parseFloat(e.target.value) })}
                className="w-full h-1 accent-indigo-500"
              />
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: 逐句改字、拆分与合并 */
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
          {subtitles.map((sub, idx) => {
            const isCurrent = currentTime >= sub.startTime && currentTime <= sub.endTime;

            return (
              <div
                key={sub.id}
                onClick={() => onSeek(sub.startTime)}
                className={`p-2.5 rounded-xl border transition-all space-y-2 cursor-pointer ${
                  isCurrent
                    ? 'border-indigo-500/90 bg-indigo-950/20'
                    : 'border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-800/40'
                }`}
              >
                {/* 顶栏：序号与时间戳微调 */}
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span className="text-zinc-500 font-bold">#{idx + 1}</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdjustTime(sub.id, 'startTime', -0.1);
                      }}
                      className="px-1 py-0.2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      title="入点提前 0.1s"
                    >
                      -0.1s
                    </button>
                    <span className="text-white font-bold">{sub.startTime.toFixed(2)}s</span>
                    <span>~</span>
                    <span className="text-white font-bold">{sub.endTime.toFixed(2)}s</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAdjustTime(sub.id, 'endTime', 0.1);
                      }}
                      className="px-1 py-0.2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      title="出点延后 0.1s"
                    >
                      +0.1s
                    </button>
                  </div>
                </div>

                {/* 文字编辑输入框 */}
                <textarea
                  value={sub.text}
                  rows={2}
                  onChange={(e) => handleUpdateText(sub.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700/80 text-xs text-white resize-none leading-relaxed focus:outline-none focus:border-indigo-500"
                  placeholder="输入字幕文字..."
                />

                {/* 底部快捷操作条：拆分、合并、删除 */}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSplitSubtitle(sub.id);
                      }}
                      className="text-zinc-400 hover:text-indigo-300 flex items-center gap-1 transition"
                      title="从中间拆分为两条字幕"
                    >
                      <Split className="w-2.5 h-2.5" />
                      <span>拆分</span>
                    </button>
                    {idx < subtitles.length - 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMergeNext(idx);
                        }}
                        className="text-zinc-400 hover:text-indigo-300 flex items-center gap-1 transition"
                        title="与下一句合并为一条"
                      >
                        <Combine className="w-2.5 h-2.5" />
                        <span>合并下一句</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSubtitle(sub.id);
                    }}
                    className="text-zinc-500 hover:text-rose-400 transition"
                    title="删除该条字幕"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
