import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  SkipBack,
  SkipForward,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import type {
  CanvasConfig,
  CanvasRatio,
  CutSegment,
  SubtitleItem,
  SubtitleStyleConfig,
} from '../../lib/talkEditor/types';

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
  subtitles,
  segments,
  videoDimensions,
  onVideoLoaded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  // 是否开启「跳过已删片段」试听模式（默认关闭，保证编辑时顺畅拖拽与任意位置监听）
  const [autoSkipDeleted, setAutoSkipDeleted] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

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

  // 播放进度更新（节流 50ms）
  const lastUpdateRef = useRef<number>(0);
  const handleTimeUpdate = () => {
    if (!videoRef.current || isScrubbing) return;
    const cur = videoRef.current.currentTime;

    const now = Date.now();
    if (now - lastUpdateRef.current > 50) {
      lastUpdateRef.current = now;
      onSeek(cur);
    }

    // 仅在用户明确开启「精剪跳过试听」且正在播放时才执行跳切
    if (autoSkipDeleted && isPlaying) {
      const activeDeletedSeg = segments.find(
        (s) => s.isDeleted && cur >= s.startTime && cur < s.endTime
      );
      if (activeDeletedSeg) {
        const nextTime = activeDeletedSeg.endTime + 0.02;
        videoRef.current.currentTime = nextTime;
        onSeek(nextTime);
      }
    }
  };

  // 全局播放快捷键 (Space, J/K/L, Left/Right)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 避免在 input/textarea 输入时误触快捷键
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay();
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        onTogglePlay();
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
  }, [currentTime, videoDuration, onTogglePlay, onSeek]);

  // 单轨波形拖拽/点击 Scrubbing 逻辑
  const seekByClientX = useCallback(
    (clientX: number) => {
      if (!trackRef.current || videoDuration <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetTime = progress * videoDuration;
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

  // 获取当前朗读字幕
  const activeSubtitle = useMemo(() => {
    return subtitles.find(
      (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime
    );
  }, [subtitles, currentTime]);

  // 时长统计
  const deletedDuration = useMemo(() => {
    return segments.reduce(
      (acc, s) => acc + (s.isDeleted ? s.endTime - s.startTime : 0),
      0
    );
  }, [segments]);
  const preservedDuration = Math.max(0, videoDuration - deletedDuration);

  // 格式化时间 00:00
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0d12] relative select-none overflow-hidden">
      {/* 顶栏：画幅快速切换与试听跳切开关 */}
      <div className="h-10 px-3 border-b border-zinc-800/80 bg-[#14151e] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-medium flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>画幅:</span>
          </span>
          <div className="flex items-center gap-0.5 bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800">
            {(['9:16', '16:9', '1:1', '4:5', '3:4'] as CanvasRatio[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onChangeCanvasRatio(r)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition cursor-pointer ${
                  canvasConfig.aspectRatio === r
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* 试听跳切模式开关与统计 */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setAutoSkipDeleted(!autoSkipDeleted)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border cursor-pointer ${
              autoSkipDeleted
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/60 shadow-sm'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
            title="开启后，播放时将自动跳过已删除的气口与嘴瓢片段"
          >
            <Zap className={`w-3.5 h-3.5 ${autoSkipDeleted ? 'text-emerald-400 fill-current' : 'text-zinc-500'}`} />
            <span>⚡ 跳过已删试听: {autoSkipDeleted ? '开启' : '关闭'}</span>
          </button>

          <span className="text-xs font-mono text-zinc-400 hidden sm:inline">
            精剪后: <strong className="text-indigo-400">{formatTime(preservedDuration)}</strong>
            <span className="text-zinc-600 ml-1">(减{deletedDuration.toFixed(1)}s)</span>
          </span>
        </div>
      </div>

      {/* 中间舞台：真实比例画布监视器视窗 (极速单视频，60fps满帧) */}
      <div className="flex-1 flex items-center justify-center p-3 min-h-0 overflow-hidden relative">
        <div
          style={{ aspectRatio: aspectCss }}
          className="relative max-h-full max-w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center group"
        >
          {/* 背景层：暗色渐变氛围 */}
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
              <div className="py-20 flex flex-col items-center justify-center text-zinc-600 gap-2">
                <span className="text-xs">请上传视频素材</span>
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

          {/* 实时字幕叠层渲染 */}
          {activeSubtitle && (
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

      {/* 底部紧凑高响应单轨波形与播放控制条 (彻底代替繁重多轨时间轴) */}
      <div className="bg-[#111218] border-t border-zinc-800/90 p-2.5 space-y-2 shrink-0">
        {/* 单轨声学切片能量条 (极速渲染，毫秒级点按跳转) */}
        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          className="h-7 w-full bg-zinc-950 rounded-lg border border-zinc-800 relative cursor-pointer overflow-hidden select-none group shadow-inner"
          title="点击或拖拽播放指针快速定位 (绿色=保留，暗红=切除)"
        >
          {/* 渲染各切片颜色块 */}
          {videoDuration > 0 &&
            segments.map((seg) => {
              const leftPercent = Math.max(0, (seg.startTime / videoDuration) * 100);
              const widthPercent = Math.max(0.1, ((seg.endTime - seg.startTime) / videoDuration) * 100);

              return (
                <div
                  key={seg.id}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  className={`absolute top-0 bottom-0 transition-colors ${
                    seg.isDeleted
                      ? 'bg-zinc-800/80 border-r border-rose-900/40 opacity-40'
                      : seg.deleteReason === 'silence'
                      ? 'bg-zinc-900'
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
        <div className="flex items-center justify-between text-xs text-zinc-300">
          <div className="flex items-center gap-2">
            {/* 播放 / 暂停 */}
            <button
              type="button"
              onClick={onTogglePlay}
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition cursor-pointer flex items-center justify-center"
              title="播放 / 暂停 (快捷键: 空格 或 K)"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>

            {/* 快退 3s (J) / 快进 3s (L) */}
            <button
              type="button"
              onClick={() => {
                const nextTime = Math.max(0, currentTime - 3);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
                onSeek(nextTime);
              }}
              className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
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
              className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
              title="快进 3 秒 (快捷键: L 或 →)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* 当前时间 / 总时长 */}
            <span className="font-mono text-zinc-300 font-bold ml-1 text-xs">
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-zinc-500 hidden md:inline">
              快捷键: 空格播放 · J/L快进倒退 · 点击文稿直接定位
            </span>

            {/* 静音开关 */}
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 hover:text-white text-zinc-400 transition cursor-pointer"
              title={isMuted ? '取消静音' : '静音'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasMonitor;
