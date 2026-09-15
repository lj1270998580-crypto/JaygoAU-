import React, { useState, useMemo } from 'react';
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
  UploadCloud,
  Image as ImageIcon,
  Trash2,
  Eye,
  EyeOff,
  Plus,
} from 'lucide-react';
import type {
  CanvasConfig,
  CanvasRatio,
  SubtitleStyleConfig,
  SubtitleItem,
  CutSegment,
  CustomStickerPatch,
} from '../../lib/talkEditor/types';
import { SUBTITLE_TEMPLATES } from '../../lib/talkEditor/subtitleTemplates';
import { TITLE_STYLE_PRESETS } from '../../lib/talkEditor/titleTemplates';

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

  // 🌟 多贴片状态与管理
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  const activeStickers: CustomStickerPatch[] = useMemo(() => {
    if (canvasConfig.stickers && canvasConfig.stickers.length > 0) {
      return canvasConfig.stickers;
    }
    if (canvasConfig.stickerPatch && canvasConfig.stickerPatch.imageUrl) {
      return [
        {
          ...canvasConfig.stickerPatch,
          id: canvasConfig.stickerPatch.id || 'sticker-default',
        },
      ];
    }
    return [];
  }, [canvasConfig.stickers, canvasConfig.stickerPatch]);

  const currentSticker = useMemo(() => {
    return activeStickers.find((s) => s.id === selectedStickerId) || activeStickers[0] || null;
  }, [activeStickers, selectedStickerId]);

  const handleUploadStickerFiles = (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    const newStickers: CustomStickerPatch[] = [...activeStickers];

    let completed = 0;
    fileArr.forEach((file, fIdx) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const id = `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const offset = (newStickers.length + fIdx) * 0.05;
          const newSticker: CustomStickerPatch = {
            id,
            imageUrl: dataUrl,
            name: file.name,
            localPath: (file as any).path || undefined,
            xPercent: Math.min(0.85, 0.5 + (offset % 0.35)),
            yPercent: Math.min(0.85, 0.2 + (offset % 0.35)),
            scale: 1.0,
            aspectRatio: img.width / Math.max(1, img.height),
            enabled: true,
          };
          newStickers.push(newSticker);
          completed++;
          if (completed === fileArr.length) {
            onChangeCanvasConfig({
              ...canvasConfig,
              stickers: newStickers,
              stickerPatch: newStickers[0],
            });
            setSelectedStickerId(id);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUpdateSticker = (id: string, partial: Partial<CustomStickerPatch>) => {
    const updated = activeStickers.map((st) => (st.id === id ? { ...st, ...partial } : st));
    onChangeCanvasConfig({
      ...canvasConfig,
      stickers: updated,
      stickerPatch: updated[0],
    });
  };

  const handleDeleteSticker = (id: string) => {
    const updated = activeStickers.filter((st) => st.id !== id);
    onChangeCanvasConfig({
      ...canvasConfig,
      stickers: updated,
      stickerPatch: updated[0] || undefined,
    });
    if (selectedStickerId === id) {
      setSelectedStickerId(updated[0]?.id || null);
    }
  };

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
                : isDark
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>画布排版</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('subtitle')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'subtitle'
                ? 'bg-amber-600 text-white shadow-sm'
                : isDark
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>字幕样式</span>
          </button>
        </div>
      </div>

      {/* 中部可滚动设置项 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
        {activeTab === 'canvas' ? (
          <>
            {/* 1. 画布画幅比例 */}
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 ${
                isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200 shadow-xs'
              }`}
            >
              <label
                className={`text-[11px] font-bold flex items-center gap-1.5 ${
                  isDark ? 'text-zinc-200' : 'text-zinc-800'
                }`}
              >
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
                        : isDark
                        ? 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-white'
                        : 'bg-white border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 shadow-xs'
                    }`}
                  >
                    <div className="text-xs">{ratio}</div>
                    <div
                      className={`text-[9px] mt-0.5 ${
                        canvasConfig.aspectRatio === ratio
                          ? 'text-indigo-100'
                          : isDark
                          ? 'text-zinc-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      {ratio === '9:16' ? '竖屏' : ratio === '16:9' ? '横屏' : ratio === '1:1' ? '方形' : '自媒'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. 顶部大标题贴片 */}
            <div
              className={`p-3.5 rounded-xl border space-y-3 ${
                isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <label
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    isDark ? 'text-zinc-200' : 'text-zinc-800'
                  }`}
                >
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
                <div className={`space-y-2.5 pt-1 border-t ${isDark ? 'border-zinc-800/60' : 'border-zinc-200'}`}>
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
                    className={`w-full px-3 py-1.5 rounded-lg border text-xs focus:outline-none transition ${
                      isDark
                        ? 'bg-zinc-950 border-zinc-700/80 text-white placeholder-zinc-500 focus:border-indigo-500'
                        : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 shadow-xs'
                    }`}
                  />

                  {/* 7 套自媒体爆款大标题样式预设 */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span>标题爆款视觉样式</span>
                      <span className="font-mono text-amber-500 font-medium">7 款预设</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5 custom-scrollbar">
                      {TITLE_STYLE_PRESETS.map((preset) => {
                        const isCur = (canvasConfig.topPatch.stylePreset || 'viral_yellow') === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              onChangeCanvasConfig({
                                ...canvasConfig,
                                topPatch: {
                                  ...canvasConfig.topPatch,
                                  stylePreset: preset.id,
                                  textColor: preset.defaultConfig.textColor,
                                  backgroundColor: preset.defaultConfig.backgroundColor,
                                  borderRadius: preset.defaultConfig.borderRadius,
                                  fontWeight: preset.defaultConfig.fontWeight,
                                },
                              })
                            }
                            style={{
                              background: preset.previewBg,
                              color: preset.previewText,
                            }}
                            className={`px-2 py-1.5 rounded-lg text-left transition text-[10px] flex flex-col justify-between cursor-pointer border shadow-xs relative overflow-hidden group ${
                              isCur
                                ? 'ring-2 ring-indigo-500 border-indigo-400 scale-[1.02]'
                                : 'border-white/15 opacity-85 hover:opacity-100 hover:scale-[1.01]'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full font-bold truncate">
                              <span className="truncate">{preset.name}</span>
                              {isCur && <Check className="w-3 h-3 text-indigo-500 shrink-0 ml-1" />}
                            </div>
                            <span className="text-[9px] opacity-80 mt-0.5 truncate">{preset.badge}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        <span>字号大小</span>
                        <span className="font-mono font-bold">{canvasConfig.topPatch.fontSize || 24}px</span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={48}
                        value={canvasConfig.topPatch.fontSize || 24}
                        onChange={(e) =>
                          onChangeCanvasConfig({
                            ...canvasConfig,
                            topPatch: { ...canvasConfig.topPatch, fontSize: parseInt(e.target.value, 10) },
                          })
                        }
                        className="w-full h-1 accent-indigo-500 cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        <span>垂直位置 (距顶)</span>
                        <span className="font-mono font-bold">{Math.round((canvasConfig.topPatch.yOffsetPercent ?? 0.06) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.02}
                        max={0.50}
                        step={0.01}
                        value={canvasConfig.topPatch.yOffsetPercent ?? 0.06}
                        onChange={(e) =>
                          onChangeCanvasConfig({
                            ...canvasConfig,
                            topPatch: { ...canvasConfig.topPatch, yOffsetPercent: parseFloat(e.target.value) },
                          })
                        }
                        className="w-full h-1 accent-indigo-500 cursor-pointer"
                      />
                    </div>
                  </div>
                  <p className="text-[9.5px] text-zinc-500 pt-0.5">
                    💡 提示：在右侧视频预览框中，也可直接鼠标拖拽大标题任意摆放与调整大小。
                  </p>
                </div>
              )}
            </div>

            {/* 3. 底部副标语贴片 */}
            <div
              className={`p-3.5 rounded-xl border space-y-3 ${
                isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <label
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    isDark ? 'text-zinc-200' : 'text-zinc-800'
                  }`}
                >
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
                <div className={`space-y-2 pt-1 border-t ${isDark ? 'border-zinc-800/60' : 'border-zinc-200'}`}>
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
                    className={`w-full px-3 py-1.5 rounded-lg border text-xs focus:outline-none transition ${
                      isDark
                        ? 'bg-zinc-950 border-zinc-700/80 text-white placeholder-zinc-500 focus:border-indigo-500'
                        : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 shadow-xs'
                    }`}
                  />
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        <span>字号大小</span>
                        <span className="font-mono font-bold">{canvasConfig.bottomPatch.fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={12}
                        max={32}
                        value={canvasConfig.bottomPatch.fontSize}
                        onChange={(e) =>
                          onChangeCanvasConfig({
                            ...canvasConfig,
                            bottomPatch: { ...canvasConfig.bottomPatch, fontSize: parseInt(e.target.value, 10) },
                          })
                        }
                        className="w-full h-1 accent-indigo-500 cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                        <span>距底部高度</span>
                        <span className="font-mono font-bold">{Math.round((canvasConfig.bottomPatch.yOffsetPercent ?? 0.05) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.02}
                        max={0.40}
                        step={0.01}
                        value={canvasConfig.bottomPatch.yOffsetPercent ?? 0.05}
                        onChange={(e) =>
                          onChangeCanvasConfig({
                            ...canvasConfig,
                            bottomPatch: { ...canvasConfig.bottomPatch, yOffsetPercent: parseFloat(e.target.value) },
                          })
                        }
                        className="w-full h-1 accent-indigo-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. 自定义视频贴片 / 品牌 Logo (覆盖全片) */}
            {/* 4. 自定义视频贴片 / 品牌 Logo (支持多张、无尺寸限制、覆盖全片) */}
            <div
              className={`p-3.5 rounded-xl border space-y-3 ${
                isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200 shadow-xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <label
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    isDark ? 'text-zinc-200' : 'text-zinc-800'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    自定义全片贴片 · Logo 水印
                    {activeStickers.length > 0 && ` (${activeStickers.length}张)`}
                  </span>
                </label>
                <input
                  type="checkbox"
                  checked={activeStickers.some((s) => s.enabled)}
                  onChange={(e) => {
                    const willEnable = e.target.checked;
                    if (activeStickers.length === 0) {
                      // 若无贴片，保持
                      return;
                    }
                    const updated = activeStickers.map((s) => ({ ...s, enabled: willEnable }));
                    onChangeCanvasConfig({
                      ...canvasConfig,
                      stickers: updated,
                      stickerPatch: updated[0],
                    });
                  }}
                  className="rounded accent-emerald-500 cursor-pointer"
                  title="一键开启或隐藏全部贴片"
                />
              </div>

              <div className={`space-y-3 pt-1 border-t ${isDark ? 'border-zinc-800/60' : 'border-zinc-200'}`}>
                {activeStickers.length > 0 ? (
                  <div className="space-y-3">
                    {/* 贴片列表与新增按钮 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span>贴片列表 (点击切换编辑)</span>
                        <label className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer font-bold">
                          <Plus className="w-3 h-3" />
                          <span>添加更多贴片</span>
                          <input
                            type="file"
                            multiple
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={(e) => {
                              if (e.target.files) handleUploadStickerFiles(e.target.files);
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5 custom-scrollbar">
                        {activeStickers.map((st, idx) => {
                          const isSelected = (currentSticker?.id || activeStickers[0]?.id) === st.id;
                          return (
                            <div
                              key={st.id || idx}
                              onClick={() => setSelectedStickerId(st.id || null)}
                              className={`p-2 rounded-lg border flex items-center gap-2.5 cursor-pointer transition ${
                                isSelected
                                  ? isDark
                                    ? 'bg-emerald-950/30 border-emerald-500/60 ring-1 ring-emerald-500/40'
                                    : 'bg-emerald-50/60 border-emerald-500/50 ring-1 ring-emerald-500/30'
                                  : isDark
                                  ? 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                                  : 'bg-white border-zinc-200 hover:border-zinc-300'
                              }`}
                            >
                              <div className="w-9 h-9 rounded border border-zinc-700/50 bg-[radial-gradient(#71717a_1px,transparent_1px)] [background-size:4px_4px] bg-zinc-900 flex items-center justify-center overflow-hidden shrink-0">
                                <img
                                  src={st.imageUrl}
                                  alt={st.name || '贴片'}
                                  className="max-w-full max-h-full object-contain"
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold truncate">
                                  {st.name || `贴片 #${idx + 1}`}
                                </div>
                                <div className="text-[9.5px] text-zinc-400 flex items-center gap-2 mt-0.5">
                                  <span className="font-mono text-emerald-400 font-medium">{(st.scale || 1.0).toFixed(1)}x</span>
                                  <span>
                                    ({Math.round((st.xPercent ?? 0.5) * 100)}%, {Math.round((st.yPercent ?? 0.5) * 100)}%)
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* 显隐切换 */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateSticker(st.id!, { enabled: !st.enabled });
                                  }}
                                  className={`p-1 rounded transition cursor-pointer ${
                                    st.enabled
                                      ? 'text-emerald-400 hover:text-emerald-300'
                                      : 'text-zinc-500 hover:text-zinc-400'
                                  }`}
                                  title={st.enabled ? '隐藏贴片' : '显示贴片'}
                                >
                                  {st.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                </button>

                                {/* 删除按钮 */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSticker(st.id!);
                                  }}
                                  className="p-1 rounded text-rose-400 hover:text-rose-300 transition cursor-pointer"
                                  title="删除贴片"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 选中贴片的精细调节面板 */}
                    {currentSticker && (
                      <div className={`space-y-2.5 pt-2 border-t ${isDark ? 'border-zinc-800/60' : 'border-zinc-200'}`}>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`font-bold truncate max-w-[200px] ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                            选中调节: {currentSticker.name || '贴片'}
                          </span>
                          <label className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium">
                            <UploadCloud className="w-3 h-3" />
                            <span>换图</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (evt) => {
                                  const dataUrl = evt.target?.result as string;
                                  const img = new Image();
                                  img.onload = () => {
                                    handleUpdateSticker(currentSticker.id!, {
                                      imageUrl: dataUrl,
                                      name: file.name,
                                      localPath: (file as any).path || undefined,
                                      aspectRatio: img.width / Math.max(1, img.height),
                                    });
                                  };
                                  img.src = dataUrl;
                                };
                                reader.readAsDataURL(file);
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* 快捷挂角预设 */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-400">快捷挂角对齐</span>
                          <div className="grid grid-cols-5 gap-1 text-[10px]">
                            {[
                              { label: '右上', x: 0.85, y: 0.12 },
                              { label: '左上', x: 0.15, y: 0.12 },
                              { label: '右下', x: 0.85, y: 0.88 },
                              { label: '左下', x: 0.15, y: 0.88 },
                              { label: '居中', x: 0.50, y: 0.50 },
                            ].map((pos) => (
                              <button
                                key={pos.label}
                                type="button"
                                onClick={() =>
                                  handleUpdateSticker(currentSticker.id!, {
                                    xPercent: pos.x,
                                    yPercent: pos.y,
                                  })
                                }
                                className={`py-1 rounded border text-center transition font-mono ${
                                  isDark
                                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100 shadow-xs'
                                }`}
                              >
                                {pos.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 贴片微调滑块 (完全解禁尺寸，支持 0.1 ~ 10.0+ 自由缩放) */}
                        <div className="space-y-2 pt-1">
                          <div className="space-y-1">
                            <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                              <span>缩放大小 (无限制)</span>
                              <div className="flex items-center gap-1">
                                {[0.5, 1.0, 2.0, 3.0, 5.0].map((quickScale) => (
                                  <button
                                    key={quickScale}
                                    type="button"
                                    onClick={() => handleUpdateSticker(currentSticker.id!, { scale: quickScale })}
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-mono border transition ${
                                      Math.abs((currentSticker.scale || 1.0) - quickScale) < 0.05
                                        ? 'bg-emerald-500 text-white border-emerald-500 font-bold'
                                        : isDark
                                        ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                                    }`}
                                  >
                                    {quickScale}x
                                  </button>
                                ))}
                                <span className="font-mono font-bold text-emerald-400 ml-1">{(currentSticker.scale || 1.0).toFixed(1)}x</span>
                              </div>
                            </div>
                            <input
                              type="range"
                              min={0.1}
                              max={8.0}
                              step={0.1}
                              value={currentSticker.scale || 1.0}
                              onChange={(e) =>
                                handleUpdateSticker(currentSticker.id!, { scale: parseFloat(e.target.value) })
                              }
                              className="w-full h-1 accent-emerald-500 cursor-pointer"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="space-y-1">
                              <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                <span>水平 X 轴</span>
                                <span className="font-mono font-bold">{Math.round((currentSticker.xPercent ?? 0.85) * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min={0.0}
                                max={1.0}
                                step={0.01}
                                value={currentSticker.xPercent ?? 0.85}
                                onChange={(e) =>
                                  handleUpdateSticker(currentSticker.id!, { xPercent: parseFloat(e.target.value) })
                                }
                                className="w-full h-1 accent-emerald-500 cursor-pointer"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                <span>垂直 Y 轴</span>
                                <span className="font-mono font-bold">{Math.round((currentSticker.yPercent ?? 0.12) * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min={0.0}
                                max={1.0}
                                step={0.01}
                                value={currentSticker.yPercent ?? 0.12}
                                onChange={(e) =>
                                  handleUpdateSticker(currentSticker.id!, { yPercent: parseFloat(e.target.value) })
                                }
                                className="w-full h-1 accent-emerald-500 cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <label className={`w-full py-6 px-3 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition ${
                    isDark
                      ? 'border-zinc-700 bg-zinc-950 hover:border-emerald-500/80 hover:bg-emerald-950/10 text-zinc-400'
                      : 'border-zinc-300 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 text-zinc-600'
                  }`}>
                    <UploadCloud className="w-6 h-6 text-emerald-500" />
                    <span className="text-xs font-bold text-zinc-300">点击上传图片贴片 / Logo 水印</span>
                    <span className="text-[10px] text-zinc-500">支持一次选多张图片，尺寸大小完全无限制</span>
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(e) => {
                        if (e.target.files) handleUploadStickerFiles(e.target.files);
                      }}
                      className="hidden"
                    />
                  </label>
                )}

                <p className="text-[9.5px] text-zinc-500 leading-relaxed">
                  💡 支持添加多张贴片，尺寸无上限！可直接在右侧视频预览框中拖拽调位与拉手柄等比缩放；导出剪映草稿时各贴片均独立成轨，完美还原！
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 字幕模版选择 */}
            <div className="space-y-2.5">
              <label
                className={`text-[11px] font-bold flex items-center gap-1.5 ${
                  isDark ? 'text-zinc-200' : 'text-zinc-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
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
                          ? isDark
                            ? 'bg-amber-950/40 border-amber-500 text-white ring-1 ring-amber-500/40'
                            : 'bg-amber-50/90 border-amber-500 text-amber-950 ring-1 ring-amber-500/40 shadow-xs'
                          : isDark
                          ? 'bg-zinc-900/70 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-white shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{tmpl.name}</span>
                          <span
                            className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono ${
                              isSelected
                                ? isDark
                                  ? 'bg-amber-900/50 text-amber-200 border border-amber-700/50'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                                : isDark
                                ? 'bg-zinc-800 text-zinc-400'
                                : 'bg-zinc-200/80 text-zinc-600'
                            }`}
                          >
                            {tmpl.badge}
                          </span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                      </div>
                      <p
                        className={`text-[10.5px] leading-relaxed mt-1 ${
                          isSelected
                            ? isDark
                              ? 'text-amber-200/70'
                              : 'text-amber-800/80'
                            : isDark
                            ? 'text-zinc-500'
                            : 'text-zinc-500'
                        }`}
                      >
                        {tmpl.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 字幕微调滑块 */}
            <div
              className={`p-3.5 rounded-xl border space-y-3 ${
                isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200 shadow-xs'
              }`}
            >
              <label
                className={`text-[11px] font-bold flex items-center gap-1.5 ${
                  isDark ? 'text-zinc-200' : 'text-zinc-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>全局字幕大小与排版位置</span>
              </label>

              {/* 字号 */}
              <div className="space-y-1">
                <div
                  className={`flex items-center justify-between text-[10.5px] ${
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  <span>字幕字号</span>
                  <span className={`font-mono font-bold ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                    {subtitleConfig.fontSize || 24}px
                  </span>
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
                  className="w-full h-1 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* 垂直位置 */}
              <div className="space-y-1">
                <div
                  className={`flex items-center justify-between text-[10.5px] ${
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  <span>距底部高度</span>
                  <span className={`font-mono font-bold ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
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
                  className="w-full h-1 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* 描边粗细 */}
              <div className="space-y-1">
                <div
                  className={`flex items-center justify-between text-[10.5px] ${
                    isDark ? 'text-zinc-400' : 'text-zinc-600'
                  }`}
                >
                  <span>立体黑描边粗细</span>
                  <span className={`font-mono font-bold ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                    {subtitleConfig.strokeWidth || 2}px
                  </span>
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
                  className="w-full h-1 accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部固定导出直通区 */}
      <div
        className={`p-3.5 border-t shrink-0 space-y-2 ${
          isDark ? 'border-zinc-800/80 bg-[#14151f]' : 'border-zinc-200 bg-zinc-50'
        }`}
      >
        <div
          className={`flex items-center justify-between text-[11px] mb-1 ${
            isDark ? 'text-zinc-400' : 'text-zinc-600'
          }`}
        >
          <span>精剪后成片预估:</span>
          <span className={`font-mono font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
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
          <span>🚀 推送至视频配图</span>
          <ArrowRight className="w-3.5 h-3.5 opacity-80" />
        </button>

        {/* 2. 导出剪映官方草稿 */}
        <button
          type="button"
          onClick={onExportJianyingDraft}
          className={`w-full py-2 px-3 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 border shadow-xs ${
            isDark
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700/60'
              : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'
          }`}
        >
          <FolderArchive className="w-3.5 h-3.5 text-indigo-500" />
          <span>🎬 导出剪映草稿</span>
        </button>
      </div>
    </div>
  );
};

export default PolishExportPanel;
