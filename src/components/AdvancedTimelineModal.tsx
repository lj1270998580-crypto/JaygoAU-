import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Magnet,
  Sliders,
  Volume2,
  Clock,
  Sparkles,
  Maximize2,
  Minimize2,
  Info,
} from 'lucide-react';
import type { VideoIllustrationItem } from '../types';

export interface AdvancedTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoSrc?: string;
  videoDuration: number;
  currentTime: number;
  onSeek: (timeSec: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  illustrations: VideoIllustrationItem[];
  onUpdateIllustration: (id: string, updates: Partial<VideoIllustrationItem>) => void;
  onSelectIllustration?: (id: string) => void;
  selectedId?: string | null;
  asrUtterances?: Array<{ text: string; startTime: number; endTime: number }>;
}

export const AdvancedTimelineModal: React.FC<AdvancedTimelineModalProps> = ({
  isOpen,
  onClose,
  videoSrc,
  videoDuration,
  currentTime,
  onSeek,
  isPlaying,
  onTogglePlay,
  illustrations,
  onUpdateIllustration,
  onSelectIllustration,
  selectedId,
  asrUtterances = [],
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1x, 2x, 4x
  const [isSnapEnabled, setIsSnapEnabled] = useState<boolean>(true);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [isExtractingWaveform, setIsExtractingWaveform] = useState<boolean>(false);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(selectedId || null);
  const [isMaximized, setIsMaximized] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{
    type: 'move' | 'resize-left' | 'resize-right' | 'scrub';
    itemId?: string;
    startX: number;
    initialStartTime?: number;
    initialEndTime?: number;
    trackWidth: number;
  } | null>(null);

  // 同步外部选中的分镜
  useEffect(() => {
    if (selectedId) setInternalSelectedId(selectedId);
  }, [selectedId]);

  // 音频波形提取（通过浏览器原生 Web Audio API）
  useEffect(() => {
    if (!isOpen || !videoSrc || waveformPeaks.length > 0) return;

    let isCancelled = false;
    const extractWaveform = async () => {
      setIsExtractingWaveform(true);
      try {
        const res = await fetch(videoSrc);
        const arrayBuffer = await res.arrayBuffer();
        if (isCancelled) return;

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        const audioCtx = new AudioCtxClass();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        if (isCancelled) {
          audioCtx.close();
          return;
        }

        const channelData = audioBuffer.getChannelData(0);
        const samples = 800;
        const step = Math.floor(channelData.length / samples);
        const peaks: number[] = [];

        for (let i = 0; i < samples; i++) {
          let max = 0;
          const start = i * step;
          const end = Math.min(start + step, channelData.length);
          for (let j = start; j < end; j += 8) {
            const val = Math.abs(channelData[j]);
            if (val > max) max = val;
          }
          peaks.push(max);
        }

        audioCtx.close();
        if (!isCancelled) {
          setWaveformPeaks(peaks);
        }
      } catch (err) {
        console.warn('[Timeline] 原生音频波形提取失败，将使用自适应波形:', err);
      } finally {
        if (!isCancelled) setIsExtractingWaveform(false);
      }
    };

    extractWaveform();
    return () => {
      isCancelled = true;
    };
  }, [isOpen, videoSrc, waveformPeaks.length]);

  // 键盘快捷键监听 (空格播放/暂停, ESC 关闭)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onTogglePlay, onClose]);

  // 计算轨道总宽度
  const baseWidth = containerRef.current ? containerRef.current.clientWidth - 160 : 1000;
  const trackWidth = Math.max(baseWidth, baseWidth * zoomLevel);
  const dur = videoDuration > 0 ? videoDuration : 60;
  const pxPerSec = trackWidth / dur;

  // 磁吸吸附计算器
  const snapCandidates = useMemo(() => {
    const list: number[] = [0, dur];
    asrUtterances.forEach((u) => {
      list.push(u.startTime);
      list.push(u.endTime);
    });
    illustrations.forEach((it) => {
      list.push(it.startTime);
      list.push(it.endTime);
    });
    return Array.from(new Set(list)).sort((a, b) => a - b);
  }, [asrUtterances, illustrations, dur]);

  const applySnap = useCallback(
    (time: number, thresholdSec = 0.25): { time: number; snapped: boolean } => {
      if (!isSnapEnabled) return { time, snapped: false };
      for (const cand of snapCandidates) {
        if (Math.abs(cand - time) <= thresholdSec) {
          return { time: cand, snapped: true };
        }
      }
      return { time, snapped: false };
    },
    [isSnapEnabled, snapCandidates]
  );

  // 处理拖拽交互
  const handleMouseDownItem = (
    e: React.MouseEvent,
    itemId: string,
    type: 'move' | 'resize-left' | 'resize-right'
  ) => {
    e.stopPropagation();
    const item = illustrations.find((i) => i.id === itemId);
    if (!item) return;

    setInternalSelectedId(itemId);
    onSelectIllustration?.(itemId);

    draggingRef.current = {
      type,
      itemId,
      startX: e.clientX,
      initialStartTime: item.startTime,
      initialEndTime: item.endTime,
      trackWidth,
    };
  };

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetSec = Math.max(0, Math.min(dur, clickX / pxPerSec));
    onSeek(targetSec);

    draggingRef.current = {
      type: 'scrub',
      startX: e.clientX,
      trackWidth,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const { type, itemId, startX, initialStartTime = 0, initialEndTime = 0 } = draggingRef.current;
      const deltaX = e.clientX - startX;
      const deltaSec = deltaX / pxPerSec;

      if (type === 'scrub') {
        const trackElem = document.getElementById('advanced-timeline-track');
        if (trackElem) {
          const rect = trackElem.getBoundingClientRect();
          const curX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const targetSec = Math.max(0, Math.min(dur, curX / pxPerSec));
          onSeek(targetSec);
        }
        return;
      }

      if (!itemId) return;
      const itemDuration = initialEndTime - initialStartTime;

      if (type === 'move') {
        let newStart = initialStartTime + deltaSec;
        let newEnd = newStart + itemDuration;

        // 磁吸判断
        const snapStart = applySnap(newStart);
        if (snapStart.snapped) {
          newStart = snapStart.time;
          newEnd = newStart + itemDuration;
          setActiveSnapLine(newStart);
        } else {
          const snapEnd = applySnap(newEnd);
          if (snapEnd.snapped) {
            newEnd = snapEnd.time;
            newStart = newEnd - itemDuration;
            setActiveSnapLine(newEnd);
          } else {
            setActiveSnapLine(null);
          }
        }

        // 限制在视频区间
        if (newStart < 0) {
          newStart = 0;
          newEnd = itemDuration;
        }
        if (newEnd > dur) {
          newEnd = dur;
          newStart = Math.max(0, dur - itemDuration);
        }

        onUpdateIllustration(itemId, {
          startTime: Math.round(newStart * 100) / 100,
          endTime: Math.round(newEnd * 100) / 100,
        });
      } else if (type === 'resize-left') {
        let newStart = initialStartTime + deltaSec;
        const snapStart = applySnap(newStart);
        if (snapStart.snapped) {
          newStart = snapStart.time;
          setActiveSnapLine(newStart);
        } else {
          setActiveSnapLine(null);
        }

        // 最短保持 1 秒
        newStart = Math.max(0, Math.min(initialEndTime - 1.0, newStart));
        onUpdateIllustration(itemId, { startTime: Math.round(newStart * 100) / 100 });
      } else if (type === 'resize-right') {
        let newEnd = initialEndTime + deltaSec;
        const snapEnd = applySnap(newEnd);
        if (snapEnd.snapped) {
          newEnd = snapEnd.time;
          setActiveSnapLine(newEnd);
        } else {
          setActiveSnapLine(null);
        }

        // 最短保持 1 秒
        newEnd = Math.max(initialStartTime + 1.0, Math.min(dur, newEnd));
        onUpdateIllustration(itemId, { endTime: Math.round(newEnd * 100) / 100 });
      }
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
      setActiveSnapLine(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pxPerSec, dur, applySnap, onSeek, onUpdateIllustration]);

  // 时间刻度标尺数据
  const timeRulerTicks = useMemo(() => {
    const stepSec = zoomLevel >= 4 ? 1 : zoomLevel >= 2 ? 2 : 5;
    const ticks: Array<{ time: number; label: string; isMajor: boolean }> = [];
    for (let t = 0; t <= dur; t += stepSec) {
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      ticks.push({
        time: t,
        label,
        isMajor: t % (stepSec * 2) === 0,
      });
    }
    return ticks;
  }, [dur, zoomLevel]);

  if (!isOpen) return null;

  const currentActiveItem = illustrations.find((i) => i.id === internalSelectedId);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
      <div
        ref={containerRef}
        className={`w-full bg-[#14151b] border-t border-zinc-800 shadow-2xl flex flex-col transition-all duration-200 select-none ${
          isMaximized ? 'h-full' : 'h-[520px]'
        }`}
      >
        {/* 顶部工具栏 */}
        <div className="px-5 py-3 border-b border-zinc-800/80 bg-[#181a22] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  专业波形时间轴工作台
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">
                  毫秒级高精微调
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                按住分镜块拖动位置，左右边缘拖拽长短，自动磁吸 ASR 口播停顿点
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 磁吸对齐开关 */}
            <button
              type="button"
              onClick={() => setIsSnapEnabled(!isSnapEnabled)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                isSnapEnabled
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
              title="磁吸对齐（拖动时自动吸附至口播起止与静音停顿点）"
            >
              <Magnet className={`w-3.5 h-3.5 ${isSnapEnabled ? 'text-indigo-400' : ''}`} />
              <span>磁吸吸附: {isSnapEnabled ? '开启' : '关闭'}</span>
            </button>

            {/* 缩放控制器 */}
            <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(1, z / 2))}
                disabled={zoomLevel <= 1}
                className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                title="缩小时间轴"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-mono text-zinc-300">{zoomLevel}x</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(4, z * 2))}
                disabled={zoomLevel >= 4}
                className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer"
                title="放大时间轴"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 最大化 / 抽屉尺寸切换 */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
              title={isMaximized ? '还原为抽屉尺寸' : '全屏展开编辑'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* 完成关闭 */}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition cursor-pointer shadow-sm ml-2"
            >
              完成
            </button>
          </div>
        </div>

        {/* 播放控制与指针时间指示 */}
        <div className="px-5 py-2.5 bg-[#16171f] border-b border-zinc-800/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onTogglePlay}
              className="w-8 h-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition shadow-md cursor-pointer"
              title="播放 / 暂停 (空格键)"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-white font-bold text-sm">
                {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}.
                {String(Math.floor((currentTime % 1) * 100)).padStart(2, '0')}
              </span>
              <span className="text-zinc-500">/</span>
              <span className="text-zinc-400">
                {Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, '0')}.00
              </span>
            </div>
          </div>

          {currentActiveItem && (
            <div className="flex items-center gap-3 text-xs bg-zinc-900/90 px-3 py-1.5 rounded-lg border border-zinc-800">
              <span className="text-zinc-400">已选中:</span>
              <span className="font-bold text-indigo-300 max-w-[200px] truncate">
                {currentActiveItem.concept}
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-emerald-400">{currentActiveItem.startTime.toFixed(2)}s</span>
                <span className="text-zinc-600">→</span>
                <span className="text-emerald-400">{currentActiveItem.endTime.toFixed(2)}s</span>
                <span className="text-zinc-400">
                  ({(currentActiveItem.endTime - currentActiveItem.startTime).toFixed(2)}s)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 时间轴主舞台 (左侧轨道标题 + 右侧横向滚动时间条) */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {/* 左侧轨道标签栏 (固定) */}
          <div className="w-36 bg-[#13141a] border-r border-zinc-800/80 flex flex-col shrink-0 select-none z-20 shadow-md">
            <div className="h-8 border-b border-zinc-800/60 px-3 flex items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              <Clock className="w-3 h-3 mr-1 text-zinc-400" />
              标尺刻度
            </div>
            <div className="h-20 border-b border-zinc-800/60 px-3 flex items-center justify-between text-xs font-semibold text-zinc-300">
              <div className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>原生音频波形</span>
              </div>
              {isExtractingWaveform && (
                <span className="text-[9px] text-indigo-400 animate-pulse">解析中</span>
              )}
            </div>
            <div className="h-14 border-b border-zinc-800/60 px-3 flex items-center text-xs font-semibold text-zinc-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>口播 ASR 句段</span>
              </span>
            </div>
            <div className="flex-1 px-3 py-3 flex flex-col text-xs font-semibold text-zinc-300">
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>插图画中画轨</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-500">{illustrations.length}</span>
              </div>
              <span className="text-[9.5px] text-zinc-500 font-normal">
                上下层对齐预览
              </span>
            </div>
          </div>

          {/* 右侧主轨道画布 (可横向滚动的交互视窗) */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0e0f14] custom-scrollbar cursor-crosshair"
          >
            <div
              id="advanced-timeline-track"
              style={{ width: `${trackWidth}px` }}
              onMouseDown={handleTrackMouseDown}
              className="h-full relative flex flex-col"
            >
              {/* 1. 时间刻度标尺 Track */}
              <div className="h-8 border-b border-zinc-800/60 relative bg-[#13141a]/90 shrink-0">
                {timeRulerTicks.map((tick) => {
                  const leftPx = tick.time * pxPerSec;
                  return (
                    <div
                      key={tick.time}
                      style={{ left: `${leftPx}px` }}
                      className="absolute top-0 bottom-0 flex flex-col justify-end pointer-events-none"
                    >
                      <div
                        className={`w-px ${
                          tick.isMajor ? 'h-3.5 bg-zinc-500' : 'h-2 bg-zinc-700'
                        }`}
                      />
                      {tick.isMajor && (
                        <span className="text-[9.5px] font-mono text-zinc-400 ml-1 mb-0.5 leading-none">
                          {tick.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 2. 原生音频波形 Track */}
              <div className="h-20 border-b border-zinc-800/60 relative bg-zinc-950/40 flex items-center px-0 shrink-0 overflow-hidden">
                {waveformPeaks.length > 0 ? (
                  <div className="w-full h-full flex items-center justify-between pointer-events-none px-1">
                    {waveformPeaks.map((peak, idx) => (
                      <div
                        key={idx}
                        style={{
                          height: `${Math.max(4, peak * 68)}px`,
                          width: `${Math.max(1, trackWidth / waveformPeaks.length - 1)}px`,
                        }}
                        className="bg-gradient-to-t from-indigo-500/80 via-purple-400/80 to-indigo-500/80 rounded-full opacity-85 transition-all"
                      />
                    ))}
                  </div>
                ) : (
                  // 自适应基于 ASR 句段构造的自然语音波形
                  <div className="w-full h-full flex items-center pointer-events-none relative">
                    {asrUtterances.map((u, i) => {
                      const left = u.startTime * pxPerSec;
                      const width = (u.endTime - u.startTime) * pxPerSec;
                      return (
                        <div
                          key={i}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          className="absolute h-10 bg-indigo-500/20 border-t border-b border-indigo-400/30 rounded flex items-center justify-center overflow-hidden"
                        >
                          <div className="w-full h-2 bg-indigo-500/40 rounded-full animate-pulse" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. ASR 口播切片 Track */}
              <div className="h-14 border-b border-zinc-800/60 relative bg-zinc-950/30 shrink-0 overflow-hidden">
                {asrUtterances.map((u, i) => {
                  const left = u.startTime * pxPerSec;
                  const width = Math.max(24, (u.endTime - u.startTime) * pxPerSec);
                  return (
                    <div
                      key={i}
                      style={{ left: `${left}px`, width: `${width}px` }}
                      className="absolute top-1.5 bottom-1.5 rounded bg-emerald-950/40 border border-emerald-500/40 px-2 flex items-center overflow-hidden shadow-sm"
                      title={`${u.startTime.toFixed(1)}s - ${u.endTime.toFixed(1)}s: ${u.text}`}
                    >
                      <span className="text-[10px] text-emerald-300 font-medium truncate pointer-events-none">
                        {u.text}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 4. 插图画中画轨 (分镜拖动与拉伸主舞台) */}
              <div className="flex-1 relative bg-zinc-950/60 py-3 overflow-hidden">
                {illustrations.map((item, idx) => {
                  const left = item.startTime * pxPerSec;
                  const width = Math.max(36, (item.endTime - item.startTime) * pxPerSec);
                  const isSelected = item.id === internalSelectedId;

                  return (
                    <div
                      key={item.id}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        top: '10px',
                        height: '76px',
                      }}
                      onMouseDown={(e) => handleMouseDownItem(e, item.id, 'move')}
                      className={`absolute rounded-xl border flex flex-col justify-between p-2 cursor-move transition-shadow select-none shadow-md ${
                        isSelected
                          ? 'bg-gradient-to-r from-purple-900/90 to-indigo-900/90 border-indigo-400 ring-2 ring-indigo-400 shadow-indigo-500/20 z-10'
                          : 'bg-zinc-800/90 hover:bg-zinc-800 border-zinc-700/80 hover:border-zinc-600'
                      }`}
                    >
                      {/* 左侧拉伸调整把手 */}
                      <div
                        onMouseDown={(e) => handleMouseDownItem(e, item.id, 'resize-left')}
                        className="absolute left-0 inset-y-0 w-3 cursor-w-resize hover:bg-white/30 rounded-l-xl flex items-center justify-center group"
                        title="按住向左或向右拉伸开始时间"
                      >
                        <div className="w-1 h-5 rounded-full bg-white/40 group-hover:bg-white transition-colors" />
                      </div>

                      {/* 右侧拉伸调整把手 */}
                      <div
                        onMouseDown={(e) => handleMouseDownItem(e, item.id, 'resize-right')}
                        className="absolute right-0 inset-y-0 w-3 cursor-e-resize hover:bg-white/30 rounded-r-xl flex items-center justify-center group"
                        title="按住向左或向右拉伸结束时间"
                      >
                        <div className="w-1 h-5 rounded-full bg-white/40 group-hover:bg-white transition-colors" />
                      </div>

                      {/* 卡片内容展示 */}
                      <div className="flex items-center gap-2 pointer-events-none min-w-0 pl-1">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover border border-white/20 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-zinc-900/80 border border-white/10 flex items-center justify-center text-zinc-500 text-[10px] shrink-0 font-bold">
                            #{idx + 1}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-white truncate">
                            {item.concept}
                          </div>
                          <div className="text-[9.5px] text-zinc-400 truncate">
                            {item.storyArcId ? `故事线: ${item.storyArcId}` : item.category || '插图'}
                          </div>
                        </div>
                      </div>

                      {/* 底部时间显示 */}
                      <div className="flex items-center justify-between text-[9.5px] font-mono text-zinc-300 pointer-events-none pl-1">
                        <span>{item.startTime.toFixed(1)}s</span>
                        <span className="text-zinc-400 font-bold">
                          {(item.endTime - item.startTime).toFixed(1)}s
                        </span>
                        <span>{item.endTime.toFixed(1)}s</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 磁吸对齐指示线 */}
              {activeSnapLine !== null && (
                <div
                  style={{ left: `${activeSnapLine * pxPerSec}px` }}
                  className="absolute inset-y-0 w-px bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] z-40 pointer-events-none flex flex-col items-center"
                >
                  <div className="bg-cyan-500 text-black text-[9px] font-bold px-1 rounded-b shadow">
                    磁吸 {activeSnapLine.toFixed(2)}s
                  </div>
                </div>
              )}

              {/* 播放头游标 (红色竖线 + 顶部三角形) */}
              <div
                style={{ left: `${currentTime * pxPerSec}px` }}
                className="absolute inset-y-0 w-0.5 bg-rose-500 z-50 pointer-events-none flex flex-col items-center"
              >
                <div className="w-3.5 h-3.5 bg-rose-500 transform rotate-45 -mt-1.5 shadow-md" />
              </div>
            </div>
          </div>
        </div>

        {/* 底部操作说明栏 */}
        <div className="px-5 py-2 border-t border-zinc-800/80 bg-[#121319] flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-zinc-300">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              <span>拖拽卡片主体移动起止时间</span>
            </span>
            <span>·</span>
            <span>拖拽左右两侧白色把手拉长或缩短</span>
            <span>·</span>
            <span>点击标尺或波形任意位置即时跳转播放指针</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-mono">
              缩放: {zoomLevel}x · 磁吸阈值: ±0.25s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
