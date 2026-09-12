import React, { useRef, useEffect, useState, useMemo } from 'react';
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
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // 画布画幅宽高比字符串 (CSS aspect-ratio)
  const aspectCss = canvasConfig.aspectRatio.replace(':', ' / ');

  // 同步外部播放指针
  useEffect(() => {
    if (!videoRef.current) return;
    if (Math.abs(videoRef.current.currentTime - currentTime) > 0.3) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  // 同步播放/暂停状态
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      if (bgVideoRef.current && bgVideoRef.current.paused) {
        bgVideoRef.current.play().catch(() => {});
      }
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
      if (bgVideoRef.current && !bgVideoRef.current.paused) {
        bgVideoRef.current.pause();
      }
    }
  }, [isPlaying]);

  // 核心声学与粗剪实时跳过引擎 (Real-time Skip-Cut Engine)
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    onSeek(cur);

    // 检查当前时刻是否处于任何被删除的片段内
    const activeDeletedSeg = segments.find(
      (s) => s.isDeleted && cur >= s.startTime && cur < s.endTime
    );

    if (activeDeletedSeg) {
      // 瞬时跳过删除片段，跳转到其结束点
      videoRef.current.currentTime = activeDeletedSeg.endTime + 0.02;
      if (bgVideoRef.current) {
        bgVideoRef.current.currentTime = activeDeletedSeg.endTime + 0.02;
      }
    }
  };

  // 获取当前正在朗读的字幕
  const activeSubtitle = useMemo(() => {
    return subtitles.find(
      (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime
    );
  }, [subtitles, currentTime]);

  // 计算当前有效保留时长统计
  const deletedDuration = segments.reduce(
    (acc, s) => acc + (s.isDeleted ? s.endTime - s.startTime : 0),
    0
  );
  const preservedDuration = Math.max(0, videoDuration - deletedDuration);

  return (
    <div className="h-full flex flex-col bg-[#0c0d12] relative select-none overflow-hidden">
      {/* 顶栏：画布画幅比例快速切换药丸栏 */}
      <div className="h-11 px-4 border-b border-zinc-800/80 bg-[#14151e] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-medium flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>画布比例:</span>
          </span>
          <div className="flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800">
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

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-emerald-400 font-bold">
            精剪预览: 自动跳过切除片段
          </span>
        </div>
      </div>

      {/* 中间舞台：真实比例画布监视器视窗 */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden relative">
        <div
          style={{ aspectRatio: aspectCss }}
          className="relative max-h-full max-w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center group"
        >
          {/* 背景层：毛玻璃模糊原片 或 纯色 */}
          {canvasConfig.backgroundType === 'blur' && videoSrc ? (
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-65">
              <video
                ref={bgVideoRef}
                src={videoSrc}
                muted
                className="w-full h-full object-cover filter blur-2xl scale-125 transform"
              />
              <div className="absolute inset-0 bg-black/40" />
            </div>
          ) : (
            <div
              style={{ backgroundColor: canvasConfig.backgroundColor || '#09090b' }}
              className="absolute inset-0 pointer-events-none"
            />
          )}

          {/* 前景视频主体 (根据缩放比与垂直偏移居中) */}
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
                  fontSize: `${canvasConfig.topPatch.fontSize || 26}px`,
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
                  fontSize: `${canvasConfig.bottomPatch.fontSize || 18}px`,
                  borderRadius: `${canvasConfig.bottomPatch.borderRadius || 8}px`,
                }}
                className="px-3 py-1 shadow-lg text-center max-w-[85%] truncate border border-white/5"
              >
                {canvasConfig.bottomPatch.text}
              </div>
            </div>
          )}

          {/* 实时字幕叠层渲染 (根据当前选中的模版样式呈现) */}
          {activeSubtitle && (
            <div
              style={{
                bottom: `${(subtitleConfig.yPercent ?? 0.18) * 100}%`,
              }}
              className="absolute inset-x-4 z-20 flex flex-col items-center justify-center pointer-events-none text-center"
            >
              {subtitleConfig.templateId === 'pill_badge' ? (
                /* 亮黄胶囊底色模版 */
                <div
                  style={{
                    backgroundColor: subtitleConfig.boxColor || '#fbbf24',
                    color: subtitleConfig.textColor || '#000000',
                    fontSize: `${subtitleConfig.fontSize || 22}px`,
                  }}
                  className="px-3 py-1 rounded-lg font-black shadow-2xl max-w-[90%]"
                >
                  {activeSubtitle.text}
                </div>
              ) : subtitleConfig.templateId === 'viral_double' ? (
                /* 爆款双行强化模版 */
                <div
                  style={{
                    fontSize: `${subtitleConfig.fontSize || 26}px`,
                    color: subtitleConfig.textColor || '#ffffff',
                    WebkitTextStroke: `${subtitleConfig.strokeWidth || 2.5}px ${subtitleConfig.strokeColor || '#000000'}`,
                    textShadow: '0 3px 6px rgba(0,0,0,0.9)',
                  }}
                  className="font-black tracking-wide max-w-[90%]"
                >
                  {activeSubtitle.text}
                </div>
              ) : subtitleConfig.templateId === 'karaoke' ? (
                /* 卡拉OK逐词点亮模版 */
                <div
                  style={{
                    fontSize: `${subtitleConfig.fontSize || 24}px`,
                    color: subtitleConfig.highlightColor || '#38bdf8',
                    WebkitTextStroke: `2px #000000`,
                    textShadow: '0 2px 5px rgba(0,0,0,0.8)',
                  }}
                  className="font-black max-w-[90%]"
                >
                  {activeSubtitle.text}
                </div>
              ) : (
                /* 极简白字黑边模版 */
                <div
                  style={{
                    fontSize: `${subtitleConfig.fontSize || 24}px`,
                    color: subtitleConfig.textColor || '#ffffff',
                    WebkitTextStroke: `${subtitleConfig.strokeWidth || 2}px #000000`,
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                  }}
                  className="font-bold max-w-[90%]"
                >
                  {activeSubtitle.text}
                </div>
              )}

              {/* 双语副字幕 */}
              {subtitleConfig.templateId === 'bilingual' && activeSubtitle.secondaryText && (
                <div className="text-xs text-zinc-300 italic mt-0.5 font-sans drop-shadow-md">
                  {activeSubtitle.secondaryText}
                </div>
              )}
            </div>
          )}

          {/* 播放悬浮遮罩控制 */}
          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <button
              type="button"
              onClick={onTogglePlay}
              className="w-12 h-12 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl transition pointer-events-auto cursor-pointer"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 底部控制台：播放进度条与时间码 */}
      <div className="h-12 px-4 border-t border-zinc-800/80 bg-[#14151e] flex items-center justify-between gap-4 shrink-0 font-mono">
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - 5))}
            className="p-1.5 text-zinc-400 hover:text-white transition cursor-pointer"
            title="后退 5 秒"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.min(videoDuration, currentTime + 5))}
            className="p-1.5 text-zinc-400 hover:text-white transition cursor-pointer"
            title="前进 5 秒"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 极简全局时间码显示 */}
        <div className="flex-1 flex items-center gap-3 text-xs">
          <span className="text-white font-bold">
            {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}.
            {String(Math.floor((currentTime % 1) * 10)).padStart(1, '0')}
          </span>
          <span className="text-zinc-600">/</span>
          <span className="text-emerald-400" title="剪辑后实际时长">
            精剪 {Math.floor(preservedDuration / 60)}:
            {String(Math.floor(preservedDuration % 60)).padStart(2, '0')}
          </span>
          <span className="text-zinc-500 text-[10px]" title="原片总长">
            (原 {Math.floor(videoDuration / 60)}:
            {String(Math.floor(videoDuration % 60)).padStart(2, '0')})
          </span>
        </div>

        {/* 静音开关 */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
