import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Scissors,
  Trash2,
  Volume2,
  ZoomIn,
  ZoomOut,
  Magnet,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Type,
  Layers,
  Film,
  Sparkles,
  RotateCcw,
  Check,
} from 'lucide-react';
import type { CutSegment, SubtitleItem, CanvasConfig } from '../../lib/talkEditor/types';

export interface TalkTimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;

  // 切片相关
  segments: CutSegment[];
  onToggleSegmentDelete: (id: string) => void;
  onSplitSegmentAtPlayhead: () => void;
  onTrimSegment: (id: string, newStart: number, newEnd: number) => void;
  onBatchDeleteSilences: () => void;
  onBatchDeleteStumbles: () => void;
  selectedSegmentId: string | null;
  onSelectSegment: (id: string | null) => void;

  // 字幕相关
  subtitles: SubtitleItem[];
  onUpdateSubtitle: (id: string, updates: Partial<SubtitleItem>) => void;
  onSelectSubtitle: (id: string) => void;
  selectedSubtitleId: string | null;

  // 贴片配置
  canvasConfig: CanvasConfig;

  // 音频源
  videoSrc?: string;

  // 时间轴面板高度
  height: number;
}

export const TalkTimeline: React.FC<TalkTimelineProps> = ({
  duration,
  currentTime,
  onSeek,
  isPlaying,
  onTogglePlay,
  segments,
  onToggleSegmentDelete,
  onSplitSegmentAtPlayhead,
  onTrimSegment,
  onBatchDeleteSilences,
  onBatchDeleteStumbles,
  selectedSegmentId,
  onSelectSegment,
  subtitles,
  onUpdateSubtitle,
  onSelectSubtitle,
  selectedSubtitleId,
  canvasConfig,
  videoSrc,
  height,
}) => {
  const dur = Math.max(1, duration || 1);

  // 缩放等级 (1.0x ~ 8.0x)
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isSnapEnabled, setIsSnapEnabled] = useState<boolean>(true);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);

  // 视口与滚动状态
  const [viewportWidth, setViewportWidth] = useState<number>(1000);
  const [scrollLeft, setScrollLeft] = useState<number>(0);

  // 音频波形
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [isExtractingWaveform, setIsExtractingWaveform] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 拖拽操作状态
  const draggingRef = useRef<{
    type: 'scrub' | 'trim-left' | 'trim-right' | 'sub-trim-left' | 'sub-trim-right' | 'nav-window';
    id?: string;
    startX: number;
    initialStart?: number;
    initialEnd?: number;
    initialScrollLeft?: number;
    trackWidth: number;
  } | null>(null);

  // 测量视口宽度
  useEffect(() => {
    const updateWidth = () => {
      if (scrollContainerRef.current) {
        setViewportWidth(scrollContainerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // 计算轨道总像素宽度
  const baseWidth = Math.max(viewportWidth - 100, 800);
  const trackWidth = Math.round(baseWidth * zoomLevel);
  const pxPerSec = trackWidth / dur;

  // 原生音频波形提取
  useEffect(() => {
    if (!videoSrc || waveformPeaks.length > 0) return;
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
        const sampleCount = 600;
        const step = Math.floor(channelData.length / sampleCount);
        const peaks: number[] = [];

        for (let i = 0; i < sampleCount; i++) {
          let max = 0;
          const start = i * step;
          const end = Math.min(start + step, channelData.length);
          for (let j = start; j < end; j += 6) {
            const val = Math.abs(channelData[j]);
            if (val > max) max = val;
          }
          peaks.push(max);
        }

        audioCtx.close();
        if (!isCancelled) setWaveformPeaks(peaks);
      } catch (err) {
        console.warn('[TalkTimeline] 音频波形解码失败，使用模拟波形:', err);
      } finally {
        if (!isCancelled) setIsExtractingWaveform(false);
      }
    };

    extractWaveform();
    return () => {
      isCancelled = true;
    };
  }, [videoSrc, waveformPeaks.length]);

  // 快捷键监听 (空格播放, C 剃刀切割, Delete 删除/恢复)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onSplitSegmentAtPlayhead();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedSegmentId) {
          e.preventDefault();
          onToggleSegmentDelete(selectedSegmentId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTogglePlay, onSplitSegmentAtPlayhead, onToggleSegmentDelete, selectedSegmentId]);

  // 滚轮缩放时间轴 (Ctrl + 滚轮 或 Alt + 滚轮)
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.altKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.3 : -0.3;
      setZoomLevel((z) => Math.min(8, Math.max(1, Math.round((z + delta) * 10) / 10)));
    }
  };

  // 磁力吸附计算
  const getSnapTime = useCallback(
    (targetTime: number, thresholdPx = 12): number => {
      if (!isSnapEnabled) return targetTime;
      const thresholdSec = thresholdPx / pxPerSec;
      const snapPoints = [0, dur];

      // 收集切片端点
      for (const seg of segments) {
        snapPoints.push(seg.startTime, seg.endTime);
      }
      // 收集字幕端点
      for (const sub of subtitles) {
        snapPoints.push(sub.startTime, sub.endTime);
      }

      let closestSnap: number | null = null;
      let minDiff = Infinity;

      for (const p of snapPoints) {
        const diff = Math.abs(targetTime - p);
        if (diff < thresholdSec && diff < minDiff) {
          minDiff = diff;
          closestSnap = p;
        }
      }

      if (closestSnap !== null) {
        setActiveSnapLine(closestSnap);
        return closestSnap;
      }
      setActiveSnapLine(null);
      return targetTime;
    },
    [isSnapEnabled, pxPerSec, dur, segments, subtitles]
  );

  // 处理标尺/轨道区域点击定位播放头
  const handleTimelineScrub = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
    const rawTime = Math.max(0, Math.min(dur, clickX / pxPerSec));
    const finalTime = getSnapTime(rawTime);
    onSeek(finalTime);
  };

  // 启动标尺或播放头 Scrubbing 拖拽
  const startScrubbing = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = {
      type: 'scrub',
      startX: e.clientX,
      trackWidth,
    };
    handleTimelineScrub(e);
  };

  // 启动切片边缘拖拽调整 (Trim In / Trim Out)
  const startSegmentTrim = (
    e: React.MouseEvent,
    id: string,
    type: 'trim-left' | 'trim-right',
    curStart: number,
    curEnd: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = {
      type,
      id,
      startX: e.clientX,
      initialStart: curStart,
      initialEnd: curEnd,
      trackWidth,
    };
  };

  // 启动字幕边缘拖拽调整 (Sub Trim In / Sub Trim Out)
  const startSubtitleTrim = (
    e: React.MouseEvent,
    id: string,
    type: 'sub-trim-left' | 'sub-trim-right',
    curStart: number,
    curEnd: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    draggingRef.current = {
      type,
      id,
      startX: e.clientX,
      initialStart: curStart,
      initialEnd: curEnd,
      trackWidth,
    };
  };

  // 全局鼠标拖拽移动监听
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;

      if (drag.type === 'scrub') {
        if (!scrollContainerRef.current) return;
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
        const rawTime = Math.max(0, Math.min(dur, currentX / pxPerSec));
        const finalTime = getSnapTime(rawTime);
        onSeek(finalTime);
      } else if (drag.type === 'trim-left' && drag.id) {
        const deltaPx = e.clientX - drag.startX;
        const deltaSec = deltaPx / pxPerSec;
        const newStart = Math.max(
          0,
          Math.min(drag.initialEnd! - 0.2, (drag.initialStart || 0) + deltaSec)
        );
        const snappedStart = getSnapTime(newStart);
        onTrimSegment(drag.id, snappedStart, drag.initialEnd!);
      } else if (drag.type === 'trim-right' && drag.id) {
        const deltaPx = e.clientX - drag.startX;
        const deltaSec = deltaPx / pxPerSec;
        const newEnd = Math.min(
          dur,
          Math.max(drag.initialStart! + 0.2, (drag.initialEnd || 0) + deltaSec)
        );
        const snappedEnd = getSnapTime(newEnd);
        onTrimSegment(drag.id, drag.initialStart!, snappedEnd);
      } else if (drag.type === 'sub-trim-left' && drag.id) {
        const deltaPx = e.clientX - drag.startX;
        const deltaSec = deltaPx / pxPerSec;
        const newStart = Math.max(
          0,
          Math.min(drag.initialEnd! - 0.2, (drag.initialStart || 0) + deltaSec)
        );
        onUpdateSubtitle(drag.id, { startTime: Number(newStart.toFixed(2)) });
      } else if (drag.type === 'sub-trim-right' && drag.id) {
        const deltaPx = e.clientX - drag.startX;
        const deltaSec = deltaPx / pxPerSec;
        const newEnd = Math.min(
          dur,
          Math.max(drag.initialStart! + 0.2, (drag.initialEnd || 0) + deltaSec)
        );
        onUpdateSubtitle(drag.id, { endTime: Number(newEnd.toFixed(2)) });
      } else if (drag.type === 'nav-window' && scrollContainerRef.current) {
        const deltaPx = e.clientX - drag.startX;
        const navContainerWidth = 600; // 粗略基准
        const scrollDelta = (deltaPx / navContainerWidth) * trackWidth * 1.5;
        scrollContainerRef.current.scrollLeft = (drag.initialScrollLeft || 0) + scrollDelta;
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
  }, [dur, pxPerSec, getSnapTime, onSeek, onTrimSegment, onUpdateSubtitle, trackWidth]);

  // 全景导航条点击跳转
  const handleNavigatorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * dur;
    onSeek(targetTime);

    // 同步视口中心
    if (scrollContainerRef.current) {
      const targetScroll = targetTime * pxPerSec - viewportWidth / 2;
      scrollContainerRef.current.scrollLeft = Math.max(0, targetScroll);
    }
  };

  // 生成标尺主次刻度
  const rulerTicks = useMemo(() => {
    const ticks: Array<{ time: number; label?: string; isMajor: boolean }> = [];
    // 依缩放比动态决定主刻度间隔 (1s, 2s, 5s, 10s)
    let step = 5;
    if (zoomLevel >= 4) step = 1;
    else if (zoomLevel >= 2) step = 2;
    else step = 5;

    for (let t = 0; t <= dur; t += step) {
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const label = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      ticks.push({ time: t, label, isMajor: true });

      // 次刻度
      if (step > 1) {
        for (let sub = 1; sub < step; sub++) {
          if (t + sub < dur) {
            ticks.push({ time: t + sub, isMajor: false });
          }
        }
      }
    }
    return ticks;
  }, [dur, zoomLevel]);

  // 时间格式化工具
  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      style={{ height: `${height}px` }}
      className="flex flex-col bg-[#0c0d12] border-t border-zinc-800 select-none text-zinc-300"
      onWheel={handleWheel}
    >
      {/* 1. 时间轴顶部控制工具栏 */}
      <div className="h-10 px-3 bg-[#13141c] border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0">
        {/* 左侧：播放走带与当前时间码 */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            className={`w-7 h-7 rounded flex items-center justify-center transition cursor-pointer ${
              isPlaying
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow'
            }`}
            title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - 1))}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="后退 1 秒"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.min(dur, currentTime + 1))}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="前进 1 秒"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* 时间码显示 */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11.5px] font-mono">
            <span className="text-indigo-400 font-bold">{formatTimecode(currentTime)}</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">{formatTimecode(dur)}</span>
          </div>
        </div>

        {/* 中间：专业剪辑工具按钮 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onSplitSegmentAtPlayhead}
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-indigo-900/60 hover:border-indigo-500/50 text-zinc-200 hover:text-white text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 border border-zinc-700/60"
            title="在播放头处切断当前片段 (快捷键: C)"
          >
            <Scissors className="w-3.5 h-3.5 text-indigo-400" />
            <span>剃刀分割 (C)</span>
          </button>

          {selectedSegmentId && (
            <button
              type="button"
              onClick={() => onToggleSegmentDelete(selectedSegmentId)}
              className="px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 border border-rose-500/40"
              title="切换当前选中片段的删除/保留状态 (快捷键: Delete)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>删除/恢复片段 (Del)</span>
            </button>
          )}

          <div className="w-px h-4 bg-zinc-800 mx-1" />

          <button
            type="button"
            onClick={onBatchDeleteSilences}
            className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-amber-300/90 hover:text-amber-200 text-[11px] font-medium transition cursor-pointer flex items-center gap-1 border border-zinc-800 hover:border-amber-500/40"
            title="一键将识别到的所有无声气口标记为删除"
          >
            <Volume2 className="w-3 h-3 text-amber-400" />
            <span>一键删气口</span>
          </button>

          <button
            type="button"
            onClick={onBatchDeleteStumbles}
            className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-rose-300/90 hover:text-rose-200 text-[11px] font-medium transition cursor-pointer flex items-center gap-1 border border-zinc-800 hover:border-rose-500/40"
            title="一键将识别到的重复/嘴瓢片段标记为删除"
          >
            <RotateCcw className="w-3 h-3 text-rose-400" />
            <span>一键删嘴瓢</span>
          </button>
        </div>

        {/* 右侧：磁力吸附与缩放滑块 */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsSnapEnabled(!isSnapEnabled)}
            className={`p-1.5 rounded transition cursor-pointer flex items-center gap-1 text-[11px] ${
              isSnapEnabled
                ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40'
                : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/60'
            }`}
            title={isSnapEnabled ? '磁力吸附: 开启 (S)' : '磁力吸附: 关闭 (S)'}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>吸附</span>
          </button>

          {/* 连续缩放滑块 */}
          <div className="flex items-center gap-1.5 bg-zinc-900/90 px-2 py-0.5 rounded border border-zinc-800">
            <ZoomOut
              className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
            />
            <input
              type="range"
              min="1"
              max="8"
              step="0.2"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="w-20 h-1 accent-indigo-500 bg-zinc-700 rounded cursor-pointer"
            />
            <ZoomIn
              className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              onClick={() => setZoomLevel((z) => Math.min(8, z + 0.5))}
            />
            <span className="text-[10px] font-mono text-zinc-400 w-7 text-right">
              {zoomLevel.toFixed(1)}x
            </span>
          </div>
        </div>
      </div>

      {/* 2. 时间轴多轨核心工作区 (左侧轨道头 + 右侧滚动内容) */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* 左侧轨道头 (Track Headers) */}
        <div className="w-28 bg-[#111218] border-r border-zinc-800 shrink-0 flex flex-col z-20 text-[10.5px]">
          {/* 标尺头 */}
          <div className="h-6 border-b border-zinc-800 bg-[#0e0f14] flex items-center px-2 text-[10px] text-zinc-500 font-mono">
            RULER
          </div>

          {/* T1 字幕轨头 */}
          <div className="h-10 border-b border-zinc-800/80 flex items-center justify-between px-2 text-amber-400 font-semibold bg-amber-950/10">
            <div className="flex items-center gap-1">
              <Type className="w-3 h-3 text-amber-400" />
              <span>T1 字幕</span>
            </div>
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">
              {subtitles.length}
            </span>
          </div>

          {/* V2 贴片轨头 */}
          <div className="h-8 border-b border-zinc-800/80 flex items-center justify-between px-2 text-teal-400 font-medium bg-teal-950/10">
            <div className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-teal-400" />
              <span>V2 贴片</span>
            </div>
            <span className="text-[8.5px] text-zinc-500">
              {canvasConfig.topPatch?.enabled ? '顶贴' : ''}
            </span>
          </div>

          {/* V1 视频切片主轨头 */}
          <div className="h-14 border-b border-zinc-800/80 flex items-center justify-between px-2 text-indigo-400 font-semibold bg-indigo-950/10">
            <div className="flex items-center gap-1">
              <Film className="w-3 h-3 text-indigo-400" />
              <span>V1 视频切片</span>
            </div>
            <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
              {segments.filter((s) => !s.isDeleted).length}/{segments.length}
            </span>
          </div>

          {/* A1 音频波形轨头 */}
          <div className="h-12 flex items-center justify-between px-2 text-sky-400 font-medium bg-sky-950/10">
            <div className="flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-sky-400" />
              <span>A1 声学波形</span>
            </div>
            {isExtractingWaveform && (
              <span className="text-[8.5px] text-sky-300 animate-pulse">提取中</span>
            )}
          </div>
        </div>

        {/* 右侧可滚动轨道内容区 */}
        <div
          ref={scrollContainerRef}
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0a0b0f] select-none"
        >
          <div
            style={{ width: `${trackWidth}px` }}
            className="h-full relative cursor-crosshair"
            onMouseDown={startScrubbing}
          >
            {/* 时间标尺 Ruler */}
            <div className="h-6 border-b border-zinc-800 bg-[#0e0f14] relative">
              {rulerTicks.map((tick, idx) => {
                const leftPx = tick.time * pxPerSec;
                return (
                  <div
                    key={idx}
                    style={{ left: `${leftPx}px` }}
                    className="absolute top-0 bottom-0 pointer-events-none flex flex-col justify-end"
                  >
                    {tick.isMajor ? (
                      <>
                        <span className="text-[9px] font-mono text-zinc-400 pl-1 -translate-y-2">
                          {tick.label}
                        </span>
                        <div className="w-px h-2.5 bg-zinc-600" />
                      </>
                    ) : (
                      <div className="w-px h-1 bg-zinc-800" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* T1 智能字幕轨道 */}
            <div className="h-10 border-b border-zinc-800/60 relative bg-amber-950/5">
              {subtitles.map((sub) => {
                const left = sub.startTime * pxPerSec;
                const width = Math.max(12, (sub.endTime - sub.startTime) * pxPerSec);
                const isSelected = sub.id === selectedSubtitleId;
                return (
                  <div
                    key={sub.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSubtitle(sub.id);
                      onSeek(sub.startTime);
                    }}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute inset-y-1 rounded border transition-all cursor-pointer overflow-hidden flex items-center px-1.5 ${
                      isSelected
                        ? 'bg-amber-500/40 border-amber-400 text-white shadow ring-1 ring-amber-400'
                        : 'bg-amber-900/30 border-amber-500/40 text-amber-200 hover:bg-amber-800/40'
                    }`}
                    title={`${sub.startTime}s ~ ${sub.endTime}s: ${sub.text}`}
                  >
                    {/* 左拉伸把手 */}
                    <div
                      onMouseDown={(e) =>
                        startSubtitleTrim(e, sub.id, 'sub-trim-left', sub.startTime, sub.endTime)
                      }
                      className="absolute left-0 inset-y-0 w-1.5 bg-amber-400/50 hover:bg-amber-300 cursor-ew-resize opacity-0 hover:opacity-100 z-10"
                    />

                    <span className="text-[10.5px] font-medium truncate select-none pointer-events-none">
                      {sub.text}
                    </span>

                    {/* 右拉伸把手 */}
                    <div
                      onMouseDown={(e) =>
                        startSubtitleTrim(e, sub.id, 'sub-trim-right', sub.startTime, sub.endTime)
                      }
                      className="absolute right-0 inset-y-0 w-1.5 bg-amber-400/50 hover:bg-amber-300 cursor-ew-resize opacity-0 hover:opacity-100 z-10"
                    />
                  </div>
                );
              })}
            </div>

            {/* V2 贴片轨道 (上下贴片生效区域) */}
            <div className="h-8 border-b border-zinc-800/60 relative bg-teal-950/5">
              {canvasConfig.topPatch?.enabled && (
                <div
                  style={{ left: 0, width: `${trackWidth}px` }}
                  className="absolute inset-y-1 rounded bg-teal-900/20 border border-teal-500/30 flex items-center px-2 text-[10px] text-teal-300 truncate"
                  title="顶部大标题贴片全程展示"
                >
                  <Layers className="w-2.5 h-2.5 mr-1 text-teal-400 shrink-0" />
                  <span className="truncate">
                    贴片：{canvasConfig.topPatch.text || '未填写标题'}
                  </span>
                </div>
              )}
            </div>

            {/* V1 视频切片主轨 */}
            <div className="h-14 border-b border-zinc-800/60 relative bg-indigo-950/5">
              {segments.map((seg, idx) => {
                const left = seg.startTime * pxPerSec;
                const width = Math.max(8, (seg.endTime - seg.startTime) * pxPerSec);
                const isSelected = seg.id === selectedSegmentId;
                const isDel = seg.isDeleted;

                return (
                  <div
                    key={seg.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSegment(seg.id);
                      onSeek(seg.startTime);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onToggleSegmentDelete(seg.id);
                    }}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className={`absolute inset-y-1 rounded-md border transition-all cursor-pointer overflow-hidden flex flex-col justify-between p-1 group ${
                      isDel
                        ? 'bg-zinc-900/90 border-dashed border-rose-500/40 text-zinc-500 opacity-60'
                        : isSelected
                        ? 'bg-indigo-600/40 border-indigo-400 text-white shadow-lg ring-2 ring-indigo-400 z-10'
                        : 'bg-gradient-to-r from-indigo-950/80 to-purple-950/70 border-indigo-500/40 text-zinc-200 hover:border-indigo-400'
                    }`}
                    title={
                      isDel
                        ? `[已删除: ${seg.tagLabel || '片段'}] ${seg.text || ''} (${(seg.endTime - seg.startTime).toFixed(2)}s) 双击恢复`
                        : `[#${idx + 1}] ${seg.text || ''} (${(seg.endTime - seg.startTime).toFixed(2)}s) 双击删除`
                    }
                  >
                    {/* 左侧拉伸把手 */}
                    {!isDel && (
                      <div
                        onMouseDown={(e) =>
                          startSegmentTrim(e, seg.id, 'trim-left', seg.startTime, seg.endTime)
                        }
                        className="absolute left-0 inset-y-0 w-2 bg-indigo-400/40 hover:bg-indigo-300 cursor-ew-resize opacity-0 group-hover:opacity-100 z-20 flex items-center justify-center"
                      >
                        <div className="w-0.5 h-3 bg-white/70 rounded" />
                      </div>
                    )}

                    {/* 切片头部信息条 */}
                    <div className="flex items-center justify-between text-[9.5px] leading-tight select-none">
                      <span className="font-bold font-mono opacity-80">#{idx + 1}</span>
                      {isDel ? (
                        <span className="px-1 py-0.2 rounded bg-rose-950/90 border border-rose-600/60 text-rose-300 font-bold text-[9px]">
                          {seg.tagLabel || '已删除'}
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] text-zinc-400">
                          {(seg.endTime - seg.startTime).toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {/* 切片文字摘要 */}
                    <div className="text-[10px] truncate select-none leading-none opacity-90">
                      {seg.text || '(空白停顿)'}
                    </div>

                    {/* 右侧拉伸把手 */}
                    {!isDel && (
                      <div
                        onMouseDown={(e) =>
                          startSegmentTrim(e, seg.id, 'trim-right', seg.startTime, seg.endTime)
                        }
                        className="absolute right-0 inset-y-0 w-2 bg-indigo-400/40 hover:bg-indigo-300 cursor-ew-resize opacity-0 group-hover:opacity-100 z-20 flex items-center justify-center"
                      >
                        <div className="w-0.5 h-3 bg-white/70 rounded" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* A1 声学波形轨道 */}
            <div className="h-12 relative bg-sky-950/5 flex items-center overflow-hidden">
              {waveformPeaks.length > 0 ? (
                <div className="w-full h-8 flex items-center gap-[1px]">
                  {waveformPeaks.map((peak, pIdx) => {
                    const barHeight = Math.max(2, Math.round(peak * 32));
                    return (
                      <div
                        key={pIdx}
                        style={{ height: `${barHeight}px` }}
                        className="flex-1 bg-sky-500/40 rounded-full hover:bg-sky-400/70"
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600">
                  {isExtractingWaveform ? '波形渲染中…' : '声学波形就绪'}
                </div>
              )}
            </div>

            {/* 磁力吸附垂直对齐辅助线 */}
            {activeSnapLine !== null && (
              <div
                style={{ left: `${activeSnapLine * pxPerSec}px` }}
                className="absolute inset-y-0 w-px bg-yellow-300 shadow-[0_0_6px_rgba(253,224,71,0.8)] z-30 pointer-events-none"
              />
            )}

            {/* 贯穿式专业播放头指针 (Playhead Scrubber) */}
            <div
              style={{ left: `${currentTime * pxPerSec}px` }}
              className="absolute inset-y-0 w-0 z-40 pointer-events-none transform -translate-x-1/2"
            >
              {/* 红色顶部指针倒三角手柄 */}
              <div
                style={{ clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)' }}
                className="w-3.5 h-3.5 bg-rose-500 shadow-md transform -translate-x-[6px] pointer-events-auto cursor-ew-resize"
              />
              {/* 贯穿红色竖线 */}
              <div className="w-[1.5px] h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. 时间轴底部 Mini Navigator 全景视窗导航条 */}
      <div className="h-7 px-3 bg-[#0d0e14] border-t border-zinc-800/80 flex items-center justify-between gap-3 shrink-0 select-none">
        <div className="text-[10px] font-mono text-zinc-500 shrink-0">全片全景导航</div>

        {/* 全景微缩条 */}
        <div
          onClick={handleNavigatorClick}
          className="flex-1 h-3.5 bg-zinc-950 rounded border border-zinc-800 relative cursor-pointer overflow-hidden group shadow-inner"
          title="点击全景条任意位置快速跳转视窗"
        >
          {/* 切片微缩分布 */}
          {segments.map((seg) => {
            const leftPct = (seg.startTime / dur) * 100;
            const widthPct = Math.max(0.3, ((seg.endTime - seg.startTime) / dur) * 100);
            return (
              <div
                key={seg.id}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                className={`absolute inset-y-0 ${
                  seg.isDeleted ? 'bg-rose-900/60' : 'bg-indigo-500/70'
                }`}
              />
            );
          })}

          {/* 播放头在微缩条上的指针 */}
          <div
            style={{ left: `${Math.min(100, Math.max(0, (currentTime / dur) * 100))}%` }}
            className="absolute inset-y-0 w-1 bg-rose-500 z-10 pointer-events-none transform -translate-x-1/2"
          />

          {/* 可视窗口高亮滑块 */}
          {trackWidth > 0 && (
            <div
              style={{
                left: `${Math.max(0, Math.min(100, (scrollLeft / trackWidth) * 100))}%`,
                width: `${Math.max(3, Math.min(100, (viewportWidth / trackWidth) * 100))}%`,
              }}
              className="absolute inset-y-0 bg-white/20 border border-indigo-400 rounded pointer-events-none shadow"
            />
          )}
        </div>

        <div className="text-[10px] font-mono text-zinc-400 shrink-0">
          {(currentTime).toFixed(1)}s / {(dur).toFixed(1)}s
        </div>
      </div>
    </div>
  );
};
export default TalkTimeline;
