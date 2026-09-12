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
  Info,
  SkipBack,
  SkipForward,
  Video as VideoIcon,
  Check,
  ChevronLeft,
  ChevronRight,
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
  globalLayout?: { xPercent: number; yPercent: number; widthPercent: number };
  aspectRatio?: string;
  videoDimensions?: { width: number; height: number };
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
  globalLayout = { xPercent: 0.11, yPercent: 0.26, widthPercent: 0.78 },
  aspectRatio = '16/9',
  videoDimensions,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 支持 1.0x ~ 15.0x 连续滑动
  const [isSnapEnabled, setIsSnapEnabled] = useState<boolean>(true);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [isExtractingWaveform, setIsExtractingWaveform] = useState<boolean>(false);
  const [activeSnapLine, setActiveSnapLine] = useState<number | null>(null);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(selectedId || null);
  const [loadedDim, setLoadedDim] = useState<{ width: number; height: number } | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(1000);
  const [scrollLeft, setScrollLeft] = useState<number>(0);

  // 监视器区域高度：支持自由拖拽 160px ~ 520px，本地持久化，默认 280px 黄金均衡比例
  const [monitorHeight, setMonitorHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('jaygo_adv_timeline_monitor_h');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 160 && val <= 520) return val;
      }
    } catch (_) {}
    return 280;
  });
  const [isResizingHeight, setIsResizingHeight] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const illustrationsRef = useRef(illustrations);
  illustrationsRef.current = illustrations;

  const draggingRef = useRef<{
    type: 'move' | 'resize-left' | 'resize-right' | 'scrub';
    itemId?: string;
    startX: number;
    initialStartTime?: number;
    initialEndTime?: number;
    trackWidth: number;
  } | null>(null);

  // 动态画幅计算：优先使用外部传入分辨率，其次使用视频元数据实测，兜底 9:16 或 16:9
  const currentDim = videoDimensions || loadedDim || { width: 1080, height: 1920 };
  const monitorAspect = `${currentDim.width} / ${currentDim.height}`;

  // 视口宽度监听 (ResizeObserver)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => {
      setViewportWidth(Math.max(600, el.clientWidth));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  // 鼠标滚轮平滑缩放 (Ctrl/Alt + 滚轮)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.altKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.3 : -0.3;
      setZoomLevel((z) => Math.min(15, Math.max(1, Math.round((z + delta) * 10) / 10)));
    }
  }, []);

  // 同步外部选中的分镜
  useEffect(() => {
    if (selectedId) setInternalSelectedId(selectedId);
  }, [selectedId]);

  // 同步视频预览元素的播放与指针
  useEffect(() => {
    if (!videoPreviewRef.current) return;
    if (Math.abs(videoPreviewRef.current.currentTime - currentTime) > 0.35) {
      videoPreviewRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  useEffect(() => {
    if (!videoPreviewRef.current) return;
    if (isPlaying && videoPreviewRef.current.paused) {
      videoPreviewRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoPreviewRef.current.paused) {
      videoPreviewRef.current.pause();
    }
  }, [isPlaying]);

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

  // 计算轨道总宽度（基于实际视口测量宽度与平滑缩放倍数）
  const baseWidth = Math.max(800, viewportWidth - 144);
  const trackWidth = Math.max(baseWidth, Math.round(baseWidth * zoomLevel));
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

  // 处理垂直高度分割线拖拽
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingHeight(true);
    const startY = e.clientY;
    const initialH = monitorHeight;

    const onMouseMove = (moveEv: MouseEvent) => {
      const deltaY = moveEv.clientY - startY;
      const newH = Math.max(160, Math.min(520, Math.round(initialH + deltaY)));
      setMonitorHeight(newH);
      try {
        localStorage.setItem('jaygo_adv_timeline_monitor_h', String(newH));
      } catch (_) {}
    };

    const onMouseUp = () => {
      setIsResizingHeight(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 监听时间轴容器的横向滚动位置
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // 滚轮交互：Ctrl/Alt 缩放，Shift 或普通滚轮在放大状态下平移
  const handleTimelineWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.altKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.3 : -0.3;
      setZoomLevel((z) => Math.min(15, Math.max(1, Math.round((z + delta) * 10) / 10)));
    } else {
      const el = scrollContainerRef.current;
      if (!el) return;
      if (e.shiftKey) {
        el.scrollLeft += e.deltaY;
      } else if (Math.abs(e.deltaX) > 0) {
        el.scrollLeft += e.deltaX;
      } else if (zoomLevel > 1) {
        // 当放大倍数 > 1 时，滚轮直接转化为横向平移，极大降低操作负担
        el.scrollLeft += e.deltaY;
      }
    }
  }, [zoomLevel]);

  // 处理全景视窗导航条 (Mini Navigator) 点击与拖动
  const handleNavigatorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = clickRatio * dur;
    if (scrollContainerRef.current) {
      const targetPx = targetSec * pxPerSec;
      scrollContainerRef.current.scrollLeft = Math.max(0, targetPx - viewportWidth / 2);
    }
  };

  const handleNavigatorWindowMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const initialScroll = scrollContainerRef.current?.scrollLeft || 0;

    const onMove = (me: MouseEvent) => {
      const deltaX = me.clientX - startX;
      const navWidth = containerRef.current?.clientWidth || viewportWidth;
      const scale = trackWidth / Math.max(1, navWidth - 160);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = Math.max(
          0,
          Math.min(trackWidth - viewportWidth, initialScroll + deltaX * scale)
        );
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleStepTime = (deltaSec: number) => {
    const newTime = Math.max(0, Math.min(dur, currentTime + deltaSec));
    onSeek(newTime);
    if (scrollContainerRef.current) {
      const targetPx = newTime * pxPerSec;
      if (
        targetPx < scrollContainerRef.current.scrollLeft ||
        targetPx > scrollContainerRef.current.scrollLeft + viewportWidth
      ) {
        scrollContainerRef.current.scrollLeft = Math.max(0, targetPx - viewportWidth / 2);
      }
    }
  };

  const handleCenterPlayhead = () => {
    if (scrollContainerRef.current) {
      const targetPx = currentTime * pxPerSec;
      scrollContainerRef.current.scrollTo({
        left: Math.max(0, targetPx - viewportWidth / 2),
        behavior: 'smooth',
      });
    }
  };

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 中键平移 (button === 1) 或按住 Alt 点击平移
    if (e.button === 1 || (e.altKey && e.button === 0)) {
      e.preventDefault();
      const startX = e.clientX;
      const initialScroll = scrollContainerRef.current?.scrollLeft || 0;
      const onMove = (me: MouseEvent) => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = initialScroll - (me.clientX - startX);
        }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return;
    }

    if (e.button !== 0) return;
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
      const itemDuration = Math.min(6.0, initialEndTime - initialStartTime);

      // 计算前后相邻分镜的无碰撞边界，杜绝重叠冲突 (Points 4 & 5)
      const allItems = illustrationsRef.current;
      const sortedOtherItems = allItems
        .filter((it) => it.id !== itemId)
        .sort((a, b) => a.startTime - b.startTime);
      const prevNeighbor = [...sortedOtherItems].reverse().find((it) => it.endTime <= initialStartTime + 0.4);
      const nextNeighbor = sortedOtherItems.find((it) => it.startTime >= initialEndTime - 0.4);

      const minPrevBound = prevNeighbor ? prevNeighbor.endTime + 0.1 : 0;
      const maxNextBound = nextNeighbor ? nextNeighbor.startTime - 0.1 : dur;

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

        // 防重叠约束：不与前后相邻分镜冲突
        if (newStart < minPrevBound) {
          newStart = minPrevBound;
          newEnd = newStart + itemDuration;
        }
        if (newEnd > maxNextBound) {
          newEnd = maxNextBound;
          newStart = Math.max(minPrevBound, newEnd - itemDuration);
        }

        // 限制在总片长区间
        if (newStart < 0) {
          newStart = 0;
          newEnd = Math.min(dur, itemDuration);
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

        // 铁律1：单图时长不超过 6.0 秒
        newStart = Math.max(newStart, initialEndTime - 6.0);
        // 铁律2：最少保持 1.0 秒
        newStart = Math.min(newStart, initialEndTime - 1.0);
        // 铁律3：出入点严禁重叠，不得早于上一镜出点+0.1s
        newStart = Math.max(minPrevBound, newStart);

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

        // 铁律1：单图时长不超过 6.0 秒
        newEnd = Math.min(newEnd, initialStartTime + 6.0);
        // 铁律2：最少保持 1.0 秒
        newEnd = Math.max(newEnd, initialStartTime + 1.0);
        // 铁律3：出入点严禁重叠，不得晚于下一镜入点-0.1s
        newEnd = Math.min(maxNextBound, newEnd);
        newEnd = Math.min(dur, newEnd);

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

  // 时间刻度标尺数据（基于每秒像素数动态调整步长）
  const timeRulerTicks = useMemo(() => {
    const stepSec = pxPerSec >= 50 ? 0.5 : pxPerSec >= 24 ? 1 : pxPerSec >= 10 ? 2 : 5;
    const ticks: Array<{ time: number; label: string; isMajor: boolean }> = [];
    for (let t = 0; t <= dur; t += stepSec) {
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      const frac = Math.floor((t % 1) * 10);
      const label = stepSec < 1
        ? `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${frac}`
        : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      ticks.push({
        time: t,
        label,
        isMajor: t % (stepSec * 2) === 0,
      });
    }
    return ticks;
  }, [dur, pxPerSec]);

  // 当前激活插图（在播放指针当前秒数内）
  const activeIllustration = useMemo(() => {
    return (
      illustrations.find(
        (it) => currentTime >= it.startTime && currentTime <= it.endTime
      ) || null
    );
  }, [illustrations, currentTime]);

  // 当前查看属性的插图（点击选中的分镜优先，否则为当前激活镜头）
  const inspectedItem = useMemo(() => {
    if (internalSelectedId) {
      const found = illustrations.find((it) => it.id === internalSelectedId);
      if (found) return found;
    }
    return activeIllustration;
  }, [illustrations, internalSelectedId, activeIllustration]);

  // 快捷跳转
  const handlePrevShot = () => {
    const sorted = [...illustrations].sort((a, b) => a.startTime - b.startTime);
    const prev = [...sorted].reverse().find((it) => it.startTime < currentTime - 0.2);
    if (prev) {
      onSeek(prev.startTime);
      setInternalSelectedId(prev.id);
    }
  };

  const handleNextShot = () => {
    const sorted = [...illustrations].sort((a, b) => a.startTime - b.startTime);
    const next = sorted.find((it) => it.startTime > currentTime + 0.2);
    if (next) {
      onSeek(next.startTime);
      setInternalSelectedId(next.id);
    }
  };

  if (!isOpen) return null;

  return (
    /* 严格避开顶栏 38px，防止被 Electron 窗口标题栏遮挡任何按钮 (Point 1) */
    <div className="fixed top-[38px] inset-x-0 bottom-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200">
      {/* 顶部工具栏 (100% 完整露出，无任何遮挡) */}
      <div className="h-12 px-4 border-b border-zinc-800 bg-[#161720] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs md:text-sm font-bold text-white tracking-wide">
              专业波形时间轴剪辑台
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30">
              毫秒级高精微调
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 磁吸对齐开关 */}
          <button
            type="button"
            onClick={() => setIsSnapEnabled(!isSnapEnabled)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
              isSnapEnabled
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
            title="磁吸对齐（拖动时自动吸附至口播起止与静音停顿点）"
          >
            <Magnet className={`w-3.5 h-3.5 ${isSnapEnabled ? 'text-indigo-400' : ''}`} />
            <span>磁吸: {isSnapEnabled ? '开启' : '关闭'}</span>
          </button>

          {/* 监视器与时间轴比例预设 (Point 7) */}
          <div className="hidden sm:flex items-center gap-1 bg-zinc-800/90 rounded-lg p-1 border border-zinc-700">
            <button
              type="button"
              onClick={() => {
                setMonitorHeight(400);
                try {
                  localStorage.setItem('jaygo_adv_timeline_monitor_h', '400');
                } catch (_) {}
              }}
              className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                monitorHeight >= 360
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
              }`}
              title="监视器大画面优先 (400px)"
            >
              大监视器
            </button>
            <button
              type="button"
              onClick={() => {
                setMonitorHeight(280);
                try {
                  localStorage.setItem('jaygo_adv_timeline_monitor_h', '280');
                } catch (_) {}
              }}
              className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                monitorHeight >= 230 && monitorHeight < 360
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
              }`}
              title="标准均衡视图 (280px)"
            >
              均衡
            </button>
            <button
              type="button"
              onClick={() => {
                setMonitorHeight(180);
                try {
                  localStorage.setItem('jaygo_adv_timeline_monitor_h', '180');
                } catch (_) {}
              }}
              className={`px-2 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                monitorHeight < 230
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
              }`}
              title="大时间轴轨道优先 (180px)"
            >
              大时间轴
            </button>
          </div>

          {/* 剪辑软件级平滑缩放滑动条 */}
          <div className="flex items-center gap-1.5 bg-zinc-800/90 rounded-lg px-2 py-1 border border-zinc-700">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(1, Math.round((z - 0.5) * 10) / 10))}
              disabled={zoomLevel <= 1}
              className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer transition"
              title="缩小时间轴 (或按住 Ctrl+滚轮向下)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={1}
              max={15}
              step={0.2}
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="w-20 sm:w-28 md:w-36 h-1 accent-indigo-500 bg-zinc-700 rounded-lg cursor-pointer"
              title="拖动平滑缩放时间轴宽度"
            />
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(15, Math.round((z + 0.5) * 10) / 10))}
              disabled={zoomLevel >= 15}
              className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-30 cursor-pointer transition"
              title="放大时间轴 (或按住 Ctrl+滚轮向上)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-zinc-300 w-10 text-center font-medium select-none">
              {zoomLevel.toFixed(1)}x
            </span>
            {zoomLevel > 1 && (
              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 ml-0.5 px-1 py-0.5 rounded bg-indigo-950/60 hover:bg-indigo-900/60 transition cursor-pointer"
                title="重置为适应视口宽度"
              >
                自适应
              </button>
            )}
          </div>

          {/* 完成关闭按钮 */}
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-sm ml-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>完成</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
            title="关闭 (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 上半部分：视频预览监视器 + 实时分镜画中画叠层 + 分镜属性监视 (支持高度自由拖拽调高调低) */}
      <div
        style={{ height: `${monitorHeight}px` }}
        className="bg-[#0c0d12] border-b border-zinc-800 flex items-center justify-center p-3 gap-4 shrink-0 overflow-hidden transition-[height] duration-75"
      >
        {/* 视频监视器播放视窗：自适应真实画幅比例，彻底杜绝竖屏大黑边与插图错位漂移 */}
        <div className="h-full flex flex-col items-center justify-center shrink-0">
          <div
            style={{ aspectRatio: monitorAspect }}
            className="relative h-full bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center group"
          >
            {videoSrc ? (
              <video
                ref={videoPreviewRef}
                src={videoSrc}
                className="w-full h-full object-contain block"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight) {
                    setLoadedDim({ width: v.videoWidth, height: v.videoHeight });
                  }
                }}
                onPlay={() => {
                  if (!isPlaying) onTogglePlay();
                }}
                onPause={() => {
                  if (isPlaying) onTogglePlay();
                }}
                onClick={onTogglePlay}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-600 gap-1.5 p-6">
                <VideoIcon className="w-8 h-8 text-zinc-700" />
                <span className="text-xs">暂无视频源</span>
              </div>
            )}

            {/* 实时分镜插图浮层（随当前时间轴秒数同步叠放预览，与画面严格贴合） */}
            {activeIllustration && (
              <div
                style={{
                  left: `${(globalLayout?.xPercent ?? 0.11) * 100}%`,
                  top: `${(globalLayout?.yPercent ?? 0.26) * 100}%`,
                  width: `${(globalLayout?.widthPercent ?? 0.78) * 100}%`,
                  aspectRatio: activeIllustration.ratio?.replace(':', '/') || aspectRatio || '16/9',
                }}
                className="absolute pointer-events-none rounded-lg overflow-hidden border border-indigo-400/80 shadow-2xl bg-zinc-900/90 z-20 flex items-center justify-center transition-all duration-200"
              >
                {activeIllustration.imageUrl ? (
                  <img
                    src={activeIllustration.imageUrl}
                    alt={activeIllustration.concept}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full p-2 flex flex-col items-center justify-center text-center">
                    <Sparkles className="w-5 h-5 text-indigo-400 mb-0.5" />
                    <span className="text-[10px] font-bold text-white truncate max-w-[90%]">
                      {activeIllustration.concept}
                    </span>
                    <span className="text-[9px] text-indigo-300">
                      {activeIllustration.status === 'generating' ? '生成中…' : '待生成'}
                    </span>
                  </div>
                )}
                <div className="absolute top-1 left-1 px-1 py-0.2 rounded bg-black/75 text-[8.5px] text-white font-mono">
                  {activeIllustration.concept}
                </div>
              </div>
            )}

            {/* 播放悬浮遮罩控制 */}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlay();
                }}
                className="w-10 h-10 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition pointer-events-auto cursor-pointer"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
            </div>
          </div>

          {/* 监视器下方极简播放时间码 */}
          <div className="flex items-center gap-3 mt-1.5 font-mono text-xs text-zinc-400">
            <button
              type="button"
              onClick={onTogglePlay}
              className="text-white hover:text-indigo-400 transition cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <span className="font-bold text-white">
              {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}.
              {String(Math.floor((currentTime % 1) * 100)).padStart(2, '0')}
            </span>
            <span className="text-zinc-600">/</span>
            <span>
              {Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, '0')}.00
            </span>
          </div>
        </div>

        {/* 右侧：分镜监视与微调面板 (属性 Inspector) */}
        <div className="w-[300px] lg:w-[340px] h-full bg-[#14151c] rounded-xl border border-zinc-800 p-3 flex flex-col justify-between shrink-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80">
              <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>分镜监视与微调</span>
              </span>
              {inspectedItem && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  第 {illustrations.findIndex((it) => it.id === inspectedItem.id) + 1} / {illustrations.length} 镜
                </span>
              )}
            </div>

            {inspectedItem ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  {inspectedItem.imageUrl ? (
                    <img
                      src={inspectedItem.imageUrl}
                      alt=""
                      className="w-11 h-11 rounded-lg object-cover border border-zinc-700 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 font-bold text-xs shrink-0">
                      待生图
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate" title={inspectedItem.concept}>
                      {inspectedItem.concept}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                      {inspectedItem.storyArcId ? `故事弧线: ${inspectedItem.storyArcId}` : inspectedItem.category || '标准插图'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-zinc-900/60 rounded-lg border border-zinc-800/60 text-center font-mono">
                  <div>
                    <div className="text-[9px] text-zinc-500">入点</div>
                    <div className="text-[11px] font-bold text-emerald-400">{inspectedItem.startTime.toFixed(2)}s</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-zinc-500">出点</div>
                    <div className="text-[11px] font-bold text-emerald-400">{inspectedItem.endTime.toFixed(2)}s</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-zinc-500">时长</div>
                    <div className="text-[11px] font-bold text-indigo-300">{(inspectedItem.endTime - inspectedItem.startTime).toFixed(2)}s</div>
                  </div>
                </div>

                {inspectedItem.prompt && (
                  <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed bg-zinc-950/40 p-1.5 rounded border border-zinc-900" title={inspectedItem.prompt}>
                    {inspectedItem.prompt}
                  </p>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-zinc-500 text-xs">
                在下方时间轴上点击任意分镜块查看画面与属性
              </div>
            )}
          </div>

          {/* 快捷跳转与控制按钮组 */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={handlePrevShot}
              className="flex-1 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1"
              title="跳转至上一个分镜"
            >
              <SkipBack className="w-3 h-3" />
              <span>上一镜</span>
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-sm"
              title="播放/暂停 (空格)"
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isPlaying ? '暂停' : '播放'}</span>
            </button>
            <button
              type="button"
              onClick={handleNextShot}
              className="flex-1 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1"
              title="跳转至下一个分镜"
            >
              <span>下一镜</span>
              <SkipForward className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 上下高度拖拽调节分割条 (水平把手，支持 160px ~ 520px 动态拖拉，Point 7) */}
      <div
        onMouseDown={handleSplitterMouseDown}
        className={`h-2 hover:h-2.5 bg-[#161722] hover:bg-indigo-600/40 border-b border-zinc-800/80 cursor-row-resize flex items-center justify-center transition-all shrink-0 z-30 group select-none ${
          isResizingHeight ? 'bg-indigo-600/60 h-2.5' : ''
        }`}
        title="上下拖动调整【视频监视器】与【时间轴轨道】的高度比例"
      >
        <div className="w-16 h-1 rounded-full bg-zinc-600 group-hover:bg-indigo-400 group-hover:w-24 transition-all flex items-center justify-center" />
      </div>

      {/* 下半部分：多轨道时间轴主画布 */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* 左侧固定轨道标签 */}
        <div className="w-36 bg-[#13141a] border-r border-zinc-800/80 flex flex-col shrink-0 select-none z-20 shadow-md">
          <div className="h-8 border-b border-zinc-800/60 px-3 flex items-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            <Clock className="w-3 h-3 mr-1 text-zinc-400" />
            标尺刻度
          </div>
          <div className="h-16 border-b border-zinc-800/60 px-3 flex items-center justify-between text-xs font-semibold text-zinc-300">
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>原生音频波形</span>
            </div>
            {isExtractingWaveform && (
              <span className="text-[9px] text-indigo-400 animate-pulse">解析中</span>
            )}
          </div>
          <div className="h-12 border-b border-zinc-800/60 px-3 flex items-center text-xs font-semibold text-zinc-300">
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
              拖动移动 · 拖边缘调长短
            </span>
          </div>
        </div>

        {/* 右侧可滚动的多轨道画布视窗 (专属 12px 高对比可拖动导轨) */}
        <div
          ref={scrollContainerRef}
          onScroll={handleTimelineScroll}
          onWheel={handleTimelineWheel}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-[#0e0f14] timeline-scroll-viewport cursor-crosshair"
        >
          <div
            id="advanced-timeline-track"
            style={{ width: `${trackWidth}px` }}
            onMouseDown={handleTrackMouseDown}
            className="h-full relative flex flex-col"
          >
            {/* 1. 时间刻度标尺 */}
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

            {/* 2. 原生音频波形 */}
            <div className="h-16 border-b border-zinc-800/60 relative bg-zinc-950/40 flex items-center px-0 shrink-0 overflow-hidden">
              {waveformPeaks.length > 0 ? (
                <div className="w-full h-full flex items-center justify-between pointer-events-none px-1">
                  {waveformPeaks.map((peak, idx) => (
                    <div
                      key={idx}
                      style={{
                        height: `${Math.max(4, peak * 56)}px`,
                        width: `${Math.max(1, trackWidth / waveformPeaks.length - 1)}px`,
                      }}
                      className="bg-gradient-to-t from-indigo-500/80 via-purple-400/80 to-indigo-500/80 rounded-full opacity-85 transition-all"
                    />
                  ))}
                </div>
              ) : (
                <div className="w-full h-full flex items-center pointer-events-none relative">
                  {asrUtterances.map((u, i) => {
                    const left = u.startTime * pxPerSec;
                    const width = (u.endTime - u.startTime) * pxPerSec;
                    return (
                      <div
                        key={i}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        className="absolute h-8 bg-indigo-500/20 border-t border-b border-indigo-400/30 rounded flex items-center justify-center overflow-hidden"
                      >
                        <div className="w-full h-1.5 bg-indigo-500/40 rounded-full animate-pulse" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. ASR 口播切片 */}
            <div className="h-12 border-b border-zinc-800/60 relative bg-zinc-950/30 shrink-0 overflow-hidden">
              {asrUtterances.map((u, i) => {
                const left = u.startTime * pxPerSec;
                const width = Math.max(24, (u.endTime - u.startTime) * pxPerSec);
                return (
                  <div
                    key={i}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    className="absolute top-1 bottom-1 rounded bg-emerald-950/40 border border-emerald-500/40 px-1.5 flex items-center overflow-hidden shadow-sm"
                    title={`${u.startTime.toFixed(1)}s - ${u.endTime.toFixed(1)}s: ${u.text}`}
                  >
                    <span className="text-[10px] text-emerald-300 font-medium truncate pointer-events-none">
                      {u.text}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 4. 插图画中画轨 (分镜主舞台) */}
            <div className="flex-1 relative bg-zinc-950/60 py-2.5 overflow-hidden">
              {illustrations.map((item, idx) => {
                const left = item.startTime * pxPerSec;
                const width = Math.max(26, (item.endTime - item.startTime) * pxPerSec);
                const isSelected = item.id === internalSelectedId;
                const isMini = width < 65;
                const isMedium = width >= 65 && width < 125;

                return (
                  <div
                    key={item.id}
                    style={{
                      left: `${left}px`,
                      width: `${width}px`,
                      top: '8px',
                      height: '70px',
                    }}
                    onMouseDown={(e) => handleMouseDownItem(e, item.id, 'move')}
                    className={`absolute rounded-xl border flex flex-col justify-between cursor-move transition-shadow select-none shadow-md overflow-hidden ${
                      isMini ? 'p-1' : 'p-2'
                    } ${
                      isSelected
                        ? 'bg-gradient-to-r from-purple-900/95 to-indigo-900/95 border-indigo-400 ring-2 ring-indigo-400 shadow-indigo-500/30 z-10'
                        : 'bg-zinc-800/90 hover:bg-zinc-800 border-zinc-700/80 hover:border-zinc-600'
                    }`}
                  >
                    {/* 左侧拉伸调整把手 */}
                    {width >= 36 && (
                      <div
                        onMouseDown={(e) => handleMouseDownItem(e, item.id, 'resize-left')}
                        className="absolute left-0 inset-y-0 w-2.5 cursor-w-resize hover:bg-white/30 rounded-l-xl flex items-center justify-center group z-10"
                        title="按住向左或向右拉伸开始时间"
                      >
                        <div className="w-0.5 h-4 rounded-full bg-white/40 group-hover:bg-white transition-colors" />
                      </div>
                    )}

                    {/* 右侧拉伸调整把手 */}
                    {width >= 36 && (
                      <div
                        onMouseDown={(e) => handleMouseDownItem(e, item.id, 'resize-right')}
                        className="absolute right-0 inset-y-0 w-2.5 cursor-e-resize hover:bg-white/30 rounded-r-xl flex items-center justify-center group z-10"
                        title="按住向左或向右拉伸结束时间"
                      >
                        <div className="w-0.5 h-4 rounded-full bg-white/40 group-hover:bg-white transition-colors" />
                      </div>
                    )}

                    {/* 卡片内容展示：自适应防挤压模式 */}
                    {isMini ? (
                      /* 极简模式：小宽度只显示序号与时长，杜绝文字重叠粘连 */
                      <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none text-center">
                        <span className="text-[10px] font-mono font-bold text-white leading-tight">
                          #{idx + 1}
                        </span>
                        <span className="text-[8.5px] font-mono text-zinc-400 leading-tight">
                          {(item.endTime - item.startTime).toFixed(1)}s
                        </span>
                      </div>
                    ) : isMedium ? (
                      /* 中等宽度紧凑模式 */
                      <>
                        <div className="flex items-center gap-1.5 pointer-events-none min-w-0 pl-1">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="w-7 h-7 rounded object-cover border border-white/20 shrink-0"
                            />
                          ) : (
                            <span className="w-6 h-6 rounded bg-zinc-900/80 text-zinc-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>
                          )}
                          <span className="text-[10.5px] font-bold text-white truncate flex-1 min-w-0">
                            {item.concept}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[8.5px] font-mono text-zinc-400 pointer-events-none pl-1">
                          <span>{item.startTime.toFixed(1)}s</span>
                          <span>{item.endTime.toFixed(1)}s</span>
                        </div>
                      </>
                    ) : (
                      /* 大宽度完整丰富模式 */
                      <>
                        <div className="flex items-center gap-2 pointer-events-none min-w-0 pl-1">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="w-9 h-9 rounded-lg object-cover border border-white/20 shrink-0 shadow-sm"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-zinc-900/80 border border-white/10 flex items-center justify-center text-zinc-500 text-[10px] shrink-0 font-bold">
                              #{idx + 1}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-bold text-white truncate" title={item.concept}>
                              {item.concept}
                            </div>
                            <div className="text-[9.5px] text-zinc-400 truncate mt-0.5">
                              {item.storyArcId ? `故事线: ${item.storyArcId}` : item.category || '插图'}
                            </div>
                          </div>
                        </div>

                        {/* 底部时间显示 */}
                        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-300 pointer-events-none pl-1">
                          <span>{item.startTime.toFixed(1)}s</span>
                          <span className="text-zinc-400 font-bold">
                            {(item.endTime - item.startTime).toFixed(1)}s
                          </span>
                          <span>{item.endTime.toFixed(1)}s</span>
                        </div>
                      </>
                    )}
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

      {/* 全景视窗导航条 (Mini Navigator / 缩略全览导航，Point 6: 解决放大后无法拖动全局视图) */}
      <div className="h-9 px-3 border-t border-zinc-800/90 bg-[#111218] flex items-center justify-between gap-3 shrink-0 select-none">
        {/* 快速步进控制与定位 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleStepTime(-5)}
            className="px-2 py-1 rounded bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10.5px] font-medium transition cursor-pointer flex items-center gap-1 border border-zinc-700/60"
            title="时间轴后退 5 秒"
          >
            <ChevronLeft className="w-3 h-3" />
            <span>后退5s</span>
          </button>
          <button
            type="button"
            onClick={() => handleStepTime(5)}
            className="px-2 py-1 rounded bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10.5px] font-medium transition cursor-pointer flex items-center gap-1 border border-zinc-700/60"
            title="时间轴前进 5 秒"
          >
            <span>前进5s</span>
            <ChevronRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleCenterPlayhead}
            className="px-2 py-1 rounded bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 hover:text-white text-[10.5px] font-medium transition cursor-pointer border border-indigo-500/40"
            title="将时间轴视窗快速定位到当前播放指针"
          >
            定位指针
          </button>
        </div>

        {/* 全片微缩全景条 (Mini Strip: 点击任意位置跳转或按住视窗框平移) */}
        <div
          onClick={handleNavigatorClick}
          className="flex-1 h-5 bg-zinc-950 rounded-md border border-zinc-800 relative cursor-pointer overflow-hidden group shadow-inner"
          title="点击全景条任意位置快速跳转视窗，或拖拽高亮视窗平移"
        >
          {/* 所有分镜在全景条上的微缩色块 */}
          {illustrations.map((it) => {
            const leftPct = (it.startTime / dur) * 100;
            const widthPct = Math.max(0.4, ((it.endTime - it.startTime) / dur) * 100);
            const isCurrent = it.id === internalSelectedId;
            return (
              <div
                key={it.id}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                className={`absolute inset-y-0.5 rounded-sm transition-opacity ${
                  isCurrent
                    ? 'bg-indigo-400 opacity-100 z-10'
                    : 'bg-purple-600/70 group-hover:opacity-90 opacity-65'
                }`}
              />
            );
          })}

          {/* 播放头在全景条上的微缩红线 */}
          <div
            style={{ left: `${Math.min(100, Math.max(0, (currentTime / dur) * 100))}%` }}
            className="absolute inset-y-0 w-1 bg-rose-500 z-20 pointer-events-none transform -translate-x-1/2 shadow-sm"
          />

          {/* 当前可视窗口高亮遮罩 (Draggable Viewport Window) */}
          {trackWidth > 0 && (
            <div
              onMouseDown={handleNavigatorWindowMouseDown}
              style={{
                left: `${Math.max(0, Math.min(100, (scrollLeft / trackWidth) * 100))}%`,
                width: `${Math.max(3, Math.min(100, (viewportWidth / trackWidth) * 100))}%`,
              }}
              className="absolute inset-y-0 bg-white/15 border-2 border-indigo-400/90 rounded cursor-grab active:cursor-grabbing z-30 transition-shadow shadow-[0_0_8px_rgba(99,102,241,0.5)] hover:bg-white/20"
              title="按住左右拖拽可视窗口"
            />
          )}
        </div>

        {/* 右侧视窗时间范围指示 */}
        <div className="flex items-center gap-2 text-[10.5px] font-mono text-zinc-400 shrink-0">
          <span className="text-zinc-500">可视视窗:</span>
          <span className="text-zinc-200 font-bold">
            {Math.floor(((scrollLeft / Math.max(1, trackWidth)) * dur) / 60)}:
            {String(Math.floor(((scrollLeft / Math.max(1, trackWidth)) * dur) % 60)).padStart(2, '0')}
            {' ~ '}
            {Math.floor((Math.min(dur, ((scrollLeft + viewportWidth) / Math.max(1, trackWidth)) * dur)) / 60)}:
            {String(Math.floor((Math.min(dur, ((scrollLeft + viewportWidth) / Math.max(1, trackWidth)) * dur)) % 60)).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* 底部操作说明与微调状态 */}
      <div className="h-7 px-4 border-t border-zinc-800/80 bg-[#121319] flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-zinc-300">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            <span>拖拽卡片移动 · 左右把手拉伸时长(≤6s) · 标尺点击跳转 · Shift+滚轮/中键平移 · 拖动中间条调高</span>
          </span>
          <span>·</span>
          <span>空格键 播放/暂停 · ESC 关闭退出</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-500 font-mono text-[10.5px]">
            缩放: {zoomLevel}x · 磁吸: ±0.25s · 共 {illustrations.length} 镜 · 监视器: {monitorHeight}px
          </span>
        </div>
      </div>
    </div>
  );
};
