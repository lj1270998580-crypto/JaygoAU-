import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  Type,
  Sliders,
  Check,
  Film,
  FolderArchive,
  Palette,
  ArrowRight,
} from 'lucide-react';
import type {
  CanvasConfig,
  CanvasRatio,
  SubtitleStyleConfig,
  SubtitleItem,
  CutSegment,
} from '../../lib/talkEditor/types';
import { SUBTITLE_TEMPLATES } from '../../lib/talkEditor/subtitleTemplates';

import { useStore } from '../../store';

interface PolishExportPanelProps {
  canvasConfig: CanvasConfig;
  onChangeCanvasConfig: (config: CanvasConfig) => void;
  subtitleConfig: SubtitleStyleConfig;
  onChangeSubtitleConfig: (config: SubtitleStyleConfig) => void;
  subtitles: SubtitleItem[];
  segments: CutSegment[];
  videoPath: string;
  videoDuration: number;
  onPushToIllustrator: () => void;
  onExportJianyingDraft: () => void;
}

export const PolishExportPanel: React.FC<PolishExportPanelProps> = ({
  canvasConfig,
  onChangeCanvasConfig,
  subtitleConfig,
  onChangeSubtitleConfig,
  subtitles,
  segments,
  videoPath,
  videoDuration,
  onPushToIllustrator,
  onExportJianyingDraft,
}) => {
  const { theme } = useStore();
  const isDark = theme !== 'light';

  const [activeTab, setActiveTab] = useState<'canvas' | 'subtitle'>('canvas');

  // 计算保留时长
  const deletedDuration = segments.reduce(
    (acc, s) => acc + (s.isDeleted ? s.endTime - s.startTime : 0),
    0
  );
  const preservedDuration = Math.max(0, videoDuration - deletedDuration);

  return (
    <div
      className={`h-full flex flex-col border-r select-none overflow-hidden ${
        isDark ? 'bg-[#111218] border-zinc-800/80 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-800'
      }`}
    >
      {/* 顶栏 Tab 切换 */}
      <div
        className={`p-3 border-b shrink-0 ${
          isDark ? 'bg-[#14151f] border-zinc-800' : 'bg-zinc-50 border-zinc-200'
        }`}
      >
        <div
          className={`flex items-center gap-1.5 p-1 rounded-xl border ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('canvas')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'canvas'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>画布与留白贴片</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('subtitle')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'subtitle'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>爆款字幕模版</span>
          </button>
        </div>
      </div>

      {/* 中部可滚动设置项 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
        {activeTab === 'canvas' ? (
          <>
            {/* 1. 画布画幅比例 */}
            <div className="p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-2.5">
              <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>目标画布画幅比例</span>
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {(['9:16', '16:9', '1:1', '4:5', '3:4'] as CanvasRatio[]).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() =>
                      onChangeCanvasConfig({
                        ...canvasConfig,
                        aspectRatio: ratio,
                      })
                    }
                    className={`py-2 rounded-lg text-center font-mono transition cursor-pointer border ${
                      canvasConfig.aspectRatio === ratio
                        ? 'bg-indigo-600 border-indigo-500 text-white font-bold shadow'
                        : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs">{ratio}</div>
                    <div className="text-[9px] text-zinc-300 mt-0.5">
                      {ratio === '9:16' ? '竖屏' : ratio === '16:9' ? '横屏' : ratio === '1:1' ? '方形' : '自媒'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 顶部大标题贴片 */}
            <div className="p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-amber-400" />
                  <span>顶部醒目大标题贴片</span>
                </label>
                <input
                  type="checkbox"
                  checked={canvasConfig.topPatch.enabled}
                  onChange={(e) =>
                    onChangeCanvasConfig({
                      ...canvasConfig,
                      topPatch: { ...canvasConfig.topPatch, enabled: e.target.checked },
                    })
                  }
                  className="rounded accent-indigo-500 cursor-pointer"
                />
              </div>

              {canvasConfig.topPatch.enabled && (
                <div className="space-y-2 pt-1 border-t border-zinc-800/60">
                  <input
                    type="text"
                    value={canvasConfig.topPatch.text}
                    onChange={(e) =>
                      onChangeCanvasConfig({
                        ...canvasConfig,
                        topPatch: { ...canvasConfig.topPatch, text: e.target.value },
                      })
                    }
                    placeholder="输入顶部吸引眼球的大标题..."
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700/80 text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
                    <span>字号大小: {canvasConfig.topPatch.fontSize}px</span>
                    <input
                      type="range"
                      min={16}
                      max={36}
                      value={canvasConfig.topPatch.fontSize}
                      onChange={(e) =>
                        onChangeCanvasConfig({
                          ...canvasConfig,
                          topPatch: { ...canvasConfig.topPatch, fontSize: parseInt(e.target.value, 10) },
                        })
                      }
                      className="w-32 h-1 accent-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. 底部副标语贴片 */}
            <div className="p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-sky-400" />
                  <span>底部黄金标语 / 关注引导贴片</span>
                </label>
                <input
                  type="checkbox"
                  checked={canvasConfig.bottomPatch.enabled}
                  onChange={(e) =>
                    onChangeCanvasConfig({
                      ...canvasConfig,
                      bottomPatch: { ...canvasConfig.bottomPatch, enabled: e.target.checked },
                    })
                  }
                  className="rounded accent-indigo-500 cursor-pointer"
                />
              </div>

              {canvasConfig.bottomPatch.enabled && (
                <div className="space-y-2 pt-1 border-t border-zinc-800/60">
                  <input
                    type="text"
                    value={canvasConfig.bottomPatch.text}
                    onChange={(e) =>
                      onChangeCanvasConfig({
                        ...canvasConfig,
                        bottomPatch: { ...canvasConfig.bottomPatch, text: e.target.value },
                      })
                    }
                    placeholder="如：关注我 · 获取自媒体全套生产力工具..."
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700/80 text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
                    <span>字号大小: {canvasConfig.bottomPatch.fontSize}px</span>
                    <input
                      type="range"
                      min={12}
                      max={28}
                      value={canvasConfig.bottomPatch.fontSize}
                      onChange={(e) =>
                        onChangeCanvasConfig({
                          ...canvasConfig,
                          bottomPatch: { ...canvasConfig.bottomPatch, fontSize: parseInt(e.target.value, 10) },
                        })
                      }
                      className="w-32 h-1 accent-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 字幕模版选择 */}
            <div className="space-y-2.5">
              <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>5 套自媒体爆款字幕视觉模版</span>
              </label>
              <div className="space-y-2">
                {SUBTITLE_TEMPLATES.map((tmpl) => {
                  const isSelected = subtitleConfig.templateId === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() =>
                        onChangeSubtitleConfig({
                          ...subtitleConfig,
                          ...tmpl.defaultConfig,
                          templateId: tmpl.id,
                        })
                      }
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-950/40 border-amber-500 text-white ring-1 ring-amber-500/40'
                          : 'bg-zinc-900/70 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{tmpl.name}</span>
                          <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            {tmpl.badge}
                          </span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <p className="text-[10.5px] text-zinc-500 leading-relaxed mt-1">
                        {tmpl.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 字幕微调滑块 */}
            <div className="p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-3">
              <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>全局字幕大小与排版位置</span>
              </label>

              {/* 字号 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
                  <span>字幕字号</span>
                  <span className="font-mono text-zinc-300 font-bold">{subtitleConfig.fontSize || 24}px</span>
                </div>
                <input
                  type="range"
                  min={18}
                  max={40}
                  step={1}
                  value={subtitleConfig.fontSize || 24}
                  onChange={(e) =>
                    onChangeSubtitleConfig({ ...subtitleConfig, fontSize: parseInt(e.target.value, 10) })
                  }
                  className="w-full h-1 accent-amber-500"
                />
              </div>

              {/* 垂直位置 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
                  <span>距底部高度</span>
                  <span className="font-mono text-zinc-300 font-bold">
                    {((subtitleConfig.yPercent || 0.18) * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.08}
                  max={0.38}
                  step={0.01}
                  value={subtitleConfig.yPercent || 0.18}
                  onChange={(e) =>
                    onChangeSubtitleConfig({ ...subtitleConfig, yPercent: parseFloat(e.target.value) })
                  }
                  className="w-full h-1 accent-amber-500"
                />
              </div>

              {/* 描边粗细 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
                  <span>立体黑描边粗细</span>
                  <span className="font-mono text-zinc-300 font-bold">{subtitleConfig.strokeWidth || 2}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={0.5}
                  value={subtitleConfig.strokeWidth ?? 2}
                  onChange={(e) =>
                    onChangeSubtitleConfig({ ...subtitleConfig, strokeWidth: parseFloat(e.target.value) })
                  }
                  className="w-full h-1 accent-amber-500"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部固定导出直通区 */}
      <div className="p-3.5 border-t border-zinc-800/80 bg-[#14151f] shrink-0 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
          <span>精剪后成片预估:</span>
          <span className="font-mono text-emerald-400 font-bold">
            {Math.floor(preservedDuration / 60)}:{String(Math.floor(preservedDuration % 60)).padStart(2, '0')}
          </span>
        </div>

        {/* 1. 一键推送到视频插图 */}
        <button
          type="button"
          onClick={onPushToIllustrator}
          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>🚀 推送到视频插图 (生成配图)</span>
          <ArrowRight className="w-3.5 h-3.5 opacity-80" />
        </button>

        {/* 2. 导出剪映官方草稿 */}
        <button
          type="button"
          onClick={onExportJianyingDraft}
          className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2"
        >
          <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
          <span>🎬 导出剪映 Pro 官方草稿</span>
        </button>
      </div>
    </div>
  );
};

export default PolishExportPanel;
