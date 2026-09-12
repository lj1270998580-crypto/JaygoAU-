import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Layers,
  Zap,
  Type,
  Eye,
  EyeOff,
  Sliders,
} from 'lucide-react';
import type {
  CanvasConfig,
  CanvasRatio,
  CutSegment,
  SubtitleItem,
  SubtitleStyleConfig,
  SubtitleTemplateId,
} from '../../lib/talkEditor/types';
import { getDeletedIntervals } from '../../lib/talkEditor/audioSilenceScanner';
import { SUBTITLE_TEMPLATES } from '../../lib/talkEditor/subtitleTemplates';
import { useStore } from '../../store';

interface CanvasMonitorProps {
  videoSrc: string;
  videoDuration: number;
  currentTime: number;
  onSeek: (timeSec: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  canvasConfig: CanvasConfig;
  onChangeCanvasRatio: (ratio: CanvasRatio) => void;
  subtitleConfig: SubtitleStyleConfig;
  onChangeSubtitleConfig?: (config: SubtitleStyleConfig) => void;
  subtitles: SubtitleItem[];
  segments: CutSegment[];
  videoDimensions: { width: number; height: number };
  onVideoLoaded?: (dim: { width: number; height: number; duration: number }) => void;
}

export const CanvasMonitor: React.FC<CanvasMonitorProps> = ({
  videoSrc,
  videoDuration,
  currentTime,
  onSeek,
  isPlaying,
  onTogglePlay,
  canvasConfig,
  onChangeCanvasRatio,
  subtitleConfig,
  onChangeSubtitleConfig,
  subtitles,
  segments,
  videoDimensions,
  onVideoLoaded,
}) => {
  const { theme } = useStore();
  const isDark = theme !== 'light';

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  // 计算所有被删除的时间片段 (包含整句与字词级)
  const deletedIntervals = useMemo(() => getDeletedIntervals(segments), [segments]);

  // 跳过已删片段开关 (只要有切除内容，默认开启跳切试听)
  const [autoSkipDeleted, setAutoSkipDeleted] = useState<boolean>(true);

  // 当有新删除区间产生时，自动激活跳切试听
  useEffect(() => {
    if (deletedIntervals.length > 0) {
      setAutoSkipDeleted(true);
    }
  }, [deletedIntervals.length]);

  // 画布画幅宽高比字符串 (CSS aspect-ratio)
  const aspectCss = canvasConfig.aspectRatio.replace(':', ' / ');

  // 同步外部播放指针
  useEffect(() => {
    if (!videoRef.current || isScrubbing) return;
    if (Math.abs(videoRef.current.currentTime - currentTime) > 0.18) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime, isScrubbing]);

  // 同步播放/暂停状态
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // 🌟 核心跳切引擎：60fps 帧精细检测与瞬移跳过已切除片段 (比 HTML5 onTimeUpdate 灵敏 15 倍)
  useEffect(() => {
    if (!isPlaying || !autoSkipDeleted || deletedIntervals.length === 0) return;

    let animId: number;
    const checkAndSkip = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        const cur = video.currentTime;
        // 检查当前或未来 35ms 即将撞上的切除区间 (带提前量，彻底消灭剪掉片段的微小杂音)
        const hit = deletedIntervals.find(
          (it) =>
            (cur >= it.start && cur < it.end) ||
            (cur < it.start && cur + 0.035 >= it.start && cur + 0.035 < it.end)
        );
        if (hit) {
          const nextTarget = hit.end + 0.005;
          if (nextTarget < videoDuration) {
            video.currentTime = nextTarget;
            onSeek(nextTarget);
          } else {
            video.pause();
          }
        }
      }
      animId = requestAnimationFrame(checkAndSkip);
    };

    animId = requestAnimationFrame(checkAndSkip);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, autoSkipDeleted, deletedIntervals, videoDuration, onSeek]);

  // 播放器开始播放瞬移安全校验
  const handleTogglePlay = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      if (videoRef.current.paused && autoSkipDeleted && deletedIntervals.length > 0) {
        const hit = deletedIntervals.find((it) => cur >= it.start && cur < it.end);
        if (hit) {
          videoRef.current.currentTime = hit.end + 0.005;
          onSeek(hit.end + 0.005);
        }
      }
    }
    onTogglePlay();
  };

  // 播放进度更新 (轻量用于 UI 同步)
  const lastUpdateRef = useRef<number>(0);
  const handleTimeUpdate = () => {
    if (!videoRef.current || isScrubbing) return;
    const cur = videoRef.current.currentTime;
    const now = Date.now();
    if (now - lastUpdateRef.current > 40) {
      lastUpdateRef.current = now;
      onSeek(cur);
    }
  };

  // 全局播放快捷键 (Space, J/K/L, Left/Right)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'KeyJ' || e.code === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.shiftKey ? -5 : -1.5;
        const nextTime = Math.max(0, currentTime + delta);
        if (videoRef.current) videoRef.current.currentTime = nextTime;
        onSeek(nextTime);
      } else if (e.code === 'KeyL' || e.code === 'ArrowRight') {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1.5;
        const nextTime = Math.min(videoDuration, currentTime + delta);
        if (videoRef.current) videoRef.current.currentTime = nextTime;
        onSeek(nextTime);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, videoDuration, onSeek, autoSkipDeleted, deletedIntervals]);

  // 单轨波形拖拽/点击 Scrubbing 逻辑
  const seekByClientX = useCallback(
    (clientX: number) => {
      if (!trackRef.current || videoDuration <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      let targetTime = progress * videoDuration;
      if (videoRef.current) videoRef.current.currentTime = targetTime;
      onSeek(targetTime);
    },
    [videoDuration, onSeek]
  );

  const handleTrackMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    seekByClientX(e.clientX);

    let rafId: number | null = null;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        seekByClientX(moveEvent.clientX);
      });
    };

    const handleMouseUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsScrubbing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 获取当前朗读字幕 (严禁渲染任何气口/停顿标记)
  const activeSubtitle = useMemo(() => {
    // 🌟 严格只从非静音的台词句（sentence）中寻找当前活动且未删除的文本
    const curSeg = segments.find(
      (s) =>
        !s.isDeleted &&
        s.type !== 'silence' &&
        s.deleteReason !== 'silence' &&
        !s.id.startsWith('silence-') &&
        currentTime >= s.startTime &&
        currentTime <= s.endTime
    );
    if (curSeg) {
      if (curSeg.words && curSeg.words.length > 0) {
        // 过滤掉被单独删掉的字词
        const validWords = curSeg.words.filter((w) => !w.isDeleted);
        if (validWords.length === 0) return null;
        return {
          text: validWords.map((w) => w.text).join(''),
        };
      }
      return { text: curSeg.text };
    }

    return null;
  }, [segments, currentTime]);

  // 格式化时间 00:00
  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 实时字幕调节快捷处理
  const toggleSubtitleVisibility = () => {
    if (!onChangeSubtitleConfig) return;
    onChangeSubtitleConfig({
      ...subtitleConfig,
      visible: subtitleConfig.visible === false ? true : false,
    });
  };

  const adjustFontSize = (delta: number) => {
    if (!onChangeSubtitleConfig) return;
    const nextSize = Math.max(16, Math.min(42, (subtitleConfig.fontSize || 26) + delta));
    onChangeSubtitleConfig({
      ...subtitleConfig,
      fontSize: nextSize,
    });
  };

  const cycleSubtitleTemplate = () => {
    if (!onChangeSubtitleConfig) return;
    const currentId = subtitleConfig.templateId;
    const idx = SUBTITLE_TEMPLATES.findIndex((t) => t.id === currentId);
    const nextTmpl = SUBTITLE_TEMPLATES[(idx + 1) % SUBTITLE_TEMPLATES.length];
    onChangeSubtitleConfig({
      ...subtitleConfig,
      ...nextTmpl.defaultConfig,
      templateId: nextTmpl.id,
    });
  };

  const setVerticalPositionPreset = (yPercent: number) => {
    if (!onChangeSubtitleConfig) return;
    onChangeSubtitleConfig({
      ...subtitleConfig,
      yPercent,
    });
  };

  return (
    <div
      className={`h-full flex flex-col relative select-none overflow-hidden ${
        isDark ? 'bg-[#0c0d12] text-zinc-200' : 'bg-zinc-100 text-zinc-800'
      }`}
    >
      {/* 顶栏控制区：画幅切换 + 试听跳切 + 实时字幕微调带 (双层流式，彻底告别文字挤压竖排) */}
      <div
        className={`border-b shrink-0 flex flex-col ${
          isDark ? 'bg-[#14151e] border-zinc-800/80' : 'bg-white border-zinc-200 shadow-xs'
        }`}
      >
        {/* 第一层：画幅选择 + 试听跳切开关 */}
        <div className="h-10 px-3 flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap custom-scrollbar">
          {/* 画幅快速切换 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-medium flex items-center gap-1 opacity-75">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>画幅:</span>
            </span>
            <div
              className={`flex items-center gap-0.5 p-0.5 rounded-lg border ${
                isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
              }`}
            >
              {(['9:16', '16:9', '1:1', '4:5', '3:4'] as CanvasRatio[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeCanvasRatio(r)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition cursor-pointer ${
                    canvasConfig.aspectRatio === r
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'hover:text-indigo-500 opacity-70'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* 试听跳切模式开关 (独立右侧，坚决不挤压) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAutoSkipDeleted(!autoSkipDeleted)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border cursor-pointer whitespace-nowrap ${
                autoSkipDeleted
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/40 font-bold shadow-xs'
                  : 'border-zinc-300 dark:border-zinc-800 opacity-60'
              }`}
              title="开启后，播放时毫秒级瞬移跳过所有切除的气口、语气词与重录废话"
            >
              <Zap className={`w-3.5 h-3.5 shrink-0 ${autoSkipDeleted ? 'fill-current text-emerald-500' : ''}`} />
              <span>⚡ 跳过已剪: {autoSkipDeleted ? '开启' : '关闭'}</span>
            </button>
          </div>
        </div>

        {/* 第二层：实时字幕微调工具带 (独立整行，大方舒适) */}
        {onChangeSubtitleConfig && (
          <div
            className={`h-8 px-3 border-t flex items-center justify-between gap-2 overflow-x-auto whitespace-nowrap text-xs ${
              isDark ? 'bg-zinc-950/60 border-zinc-800/60' : 'bg-zinc-50 border-zinc-100'
            }`}
          >
            <div className="flex items-center gap-2.5 shrink-0">
              {/* 字幕显隐 */}
              <button
                type="button"
                onClick={toggleSubtitleVisibility}
                className={`flex items-center gap-1 text-[11px] font-medium transition cursor-pointer ${
                  subtitleConfig.visible !== false ? 'text-indigo-500 font-bold' : 'opacity-40'
                }`}
                title="实时开启/关闭画面字幕渲染"
              >
                {subtitleConfig.visible !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{subtitleConfig.visible !== false ? '字幕: 显示' : '字幕: 隐藏'}</span>
              </button>

              <span className="opacity-20">|</span>

              {/* 字号加减 */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="opacity-75">字号:</span>
                <button
                  type="button"
                  onClick={() => adjustFontSize(-2)}
                  className="w-5 h-4.5 flex items-center justify-center rounded bg-zinc-700/20 hover:bg-zinc-700/40 font-bold text-xs"
                  title="减小字号"
                >
                  -
                </button>
                <span className="font-mono font-bold w-4 text-center">{subtitleConfig.fontSize || 26}</span>
                <button
                  type="button"
                  onClick={() => adjustFontSize(2)}
                  className="w-5 h-4.5 flex items-center justify-center rounded bg-zinc-700/20 hover:bg-zinc-700/40 font-bold text-xs"
                  title="增大字号"
                >
                  +
                </button>
              </div>
            </div>

            {/* 模版轮换 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={cycleSubtitleTemplate}
                className="text-[10.5px] px-2 py-0.5 rounded-md bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 font-medium flex items-center gap-1 transition cursor-pointer"
                title="点击快速切换下一个爆款字幕模版"
              >
                <Type className="w-3 h-3" />
                <span>模版: {SUBTITLE_TEMPLATES.find((t) => t.id === subtitleConfig.templateId)?.name || '默认'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 中间舞台：真实比例画布监视器视窗 (极速单视频，60fps满帧) */}
      <div className="flex-1 flex items-center justify-center p-3 min-h-0 overflow-hidden relative">
        <div
          style={{ aspectRatio: aspectCss }}
          className="relative max-h-full max-w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center group"
        >
          {/* 背景层：暗色高雅氛围 */}
          {canvasConfig.backgroundType === 'blur' ? (
            <div className="absolute inset-0 overflow-hidden pointer-events-none bg-gradient-to-b from-[#181a24] via-[#0f1017] to-black">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent" />
            </div>
          ) : (
            <div
              style={{ backgroundColor: canvasConfig.backgroundColor || '#09090b' }}
              className="absolute inset-0 pointer-events-none"
            />
          )}

          {/* 前景视频主体 (单一原生 <video>) */}
          <div
            style={{
              transform: `scale(${canvasConfig.videoScale || 1.0}) translateY(${canvasConfig.videoYPercent || 0}%)`,
            }}
            className="relative z-10 w-full flex items-center justify-center transition-transform"
          >
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                muted={isMuted}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  onVideoLoaded?.({
                    width: v.videoWidth,
                    height: v.videoHeight,
                    duration: v.duration,
                  });
                }}
                onClick={onTogglePlay}
                className="w-full max-h-full object-contain block cursor-pointer shadow-lg"
              />
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-500 gap-2">
                <span className="text-xs">请上传口播视频素材</span>
              </div>
            )}
          </div>

          {/* 顶部主标题贴片 */}
          {canvasConfig.topPatch.enabled && canvasConfig.topPatch.text && (
            <div
              style={{ top: `${(canvasConfig.topPatch.yOffsetPercent ?? 0.06) * 100}%` }}
              className="absolute inset-x-4 z-20 flex justify-center pointer-events-none"
            >
              <div
                style={{
                  backgroundColor: canvasConfig.topPatch.backgroundColor || 'rgba(0,0,0,0.75)',
                  color: canvasConfig.topPatch.textColor || '#ffffff',
                  fontSize: `${canvasConfig.topPatch.fontSize || 24}px`,
                  borderRadius: `${canvasConfig.topPatch.borderRadius || 10}px`,
                  fontWeight: canvasConfig.topPatch.fontWeight || 'bold',
                }}
                className="px-4 py-1.5 shadow-xl text-center max-w-[90%] truncate border border-white/10"
              >
                {canvasConfig.topPatch.text}
              </div>
            </div>
          )}

          {/* 底部副标语贴片 */}
          {canvasConfig.bottomPatch.enabled && canvasConfig.bottomPatch.text && (
            <div
              style={{ bottom: `${(canvasConfig.bottomPatch.yOffsetPercent ?? 0.05) * 100}%` }}
              className="absolute inset-x-4 z-20 flex justify-center pointer-events-none"
            >
              <div
                style={{
                  backgroundColor: canvasConfig.bottomPatch.backgroundColor || 'rgba(0,0,0,0.65)',
                  color: canvasConfig.bottomPatch.textColor || '#d4d4d8',
                  fontSize: `${canvasConfig.bottomPatch.fontSize || 16}px`,
                  borderRadius: `${canvasConfig.bottomPatch.borderRadius || 8}px`,
                }}
                className="px-3 py-1 shadow-lg text-center max-w-[85%] truncate border border-white/5"
              >
                {canvasConfig.bottomPatch.text}
              </div>
            </div>
          )}

          {/* 实时字幕叠层渲染 (当 subtitleConfig.visible !== false 时呈现) */}
          {subtitleConfig.visible !== false && activeSubtitle?.text && (
            <div
              style={{
                bottom: `${(subtitleConfig.yPercent ?? 0.18) * 100}%`,
              }}
              className="absolute inset-x-4 z-20 flex flex-col items-center justify-center pointer-events-none text-center"
            >
              {subtitleConfig.templateId === 'pill_badge' ? (
                <div
                  style={{
                    backgroundColor: subtitleConfig.boxColor || '#fbbf24',
                    color: subtitleConfig.textColor || '#000000',
                    fontSize: `${subtitleConfig.fontSize || 24}px`,
                    borderRadius: '8px',
                  }}
                  className="px-3 py-1 font-bold shadow-lg"
                >
                  {activeSubtitle.text}
                </div>
              ) : subtitleConfig.templateId === 'karaoke' ? (
                <div
                  style={{
                    fontSize: `${subtitleConfig.fontSize || 26}px`,
                    color: subtitleConfig.textColor || '#ffffff',
                    WebkitTextStroke: `${subtitleConfig.strokeWidth || 2}px ${
                      subtitleConfig.strokeColor || '#000000'
                    }`,
                  }}
                  className="font-extrabold tracking-wide drop-shadow-md text-amber-300"
                >
                  {activeSubtitle.text}
                </div>
              ) : subtitleConfig.templateId === 'clean_white' ? (
                <div
                  style={{
                    fontSize: `${subtitleConfig.fontSize || 22}px`,
                    color: '#ffffff',
                  }}
                  className="font-medium tracking-wider drop-shadow"
                >
                  {activeSubtitle.text}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: `${subtitleConfig.fontSize || 26}px`,
                    color: subtitleConfig.textColor || '#ffffff',
                    WebkitTextStroke: `${subtitleConfig.strokeWidth || 2}px ${
                      subtitleConfig.strokeColor || '#000000'
                    }`,
                  }}
                  className="font-black tracking-wide drop-shadow-lg"
                >
                  {activeSubtitle.text}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 底部紧凑单轨波形与播放控制条 */}
      <div
        className={`border-t p-2.5 space-y-2 shrink-0 ${
          isDark ? 'bg-[#111218] border-zinc-800/90' : 'bg-white border-zinc-200'
        }`}
      >
        {/* 单轨声学切片能量条 */}
        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          className={`h-7 w-full rounded-lg border relative cursor-pointer overflow-hidden select-none shadow-inner ${
            isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
          }`}
          title="点击或拖拽播放指针快速定位"
        >
          {/* 渲染切片块 */}
          {videoDuration > 0 &&
            segments.map((seg) => {
              const leftPercent = Math.max(0, (seg.startTime / videoDuration) * 100);
              const widthPercent = Math.max(0.1, ((seg.endTime - seg.startTime) / videoDuration) * 100);

              const hasDeletedWord = seg.words?.some((w) => w.isDeleted);
              const isFullyDeleted = seg.isDeleted;

              return (
                <div
                  key={seg.id}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  className={`absolute top-0 bottom-0 transition-colors ${
                    isFullyDeleted
                      ? 'bg-rose-900/30 border-r border-rose-900/40 opacity-40'
                      : hasDeletedWord
                      ? 'bg-amber-600/70 border-r border-amber-500'
                      : seg.deleteReason === 'silence'
                      ? isDark
                        ? 'bg-zinc-900'
                        : 'bg-zinc-200'
                      : 'bg-indigo-600/80 hover:bg-indigo-500 border-r border-indigo-700/60'
                  }`}
                  title={`${seg.text} (${(seg.endTime - seg.startTime).toFixed(1)}s)`}
                />
              );
            })}

          {/* 贯穿式高亮播放头与发光指针 */}
          {videoDuration > 0 && (
            <div
              style={{
                left: `${Math.min(100, Math.max(0, (currentTime / videoDuration) * 100))}%`,
              }}
              className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-30 shadow-[0_0_8px_#ffffff]"
            >
              <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-white rounded-full border-2 border-indigo-600 shadow" />
            </div>
          )}
        </div>

        {/* 播放控制按钮组与时间戳显示 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition cursor-pointer flex items-center justify-center"
              title="播放 / 暂停 (快捷键: 空格 或 K)"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                const nextTime = Math.max(0, currentTime - 3);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
                onSeek(nextTime);
              }}
              className={`p-1.5 rounded-md border transition cursor-pointer ${
                isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700' : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200'
              }`}
              title="后退 3 秒 (快捷键: J 或 ←)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const nextTime = Math.min(videoDuration, currentTime + 3);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
                onSeek(nextTime);
              }}
              className={`p-1.5 rounded-md border transition cursor-pointer ${
                isDark ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700' : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200'
              }`}
              title="快进 3 秒 (快捷键: L 或 →)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono font-bold ml-1 text-xs">
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-[11px] hidden md:inline ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              快捷键: 空格播放 · J/L快进倒退 · 点击文稿直接定位
            </span>

            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 hover:text-indigo-500 opacity-70 hover:opacity-100 transition cursor-pointer"
              title={isMuted ? '取消静音' : '静音'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasMonitor;
