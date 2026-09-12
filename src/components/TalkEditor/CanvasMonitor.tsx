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
  const [isMuted, setIsMuted] = useState<boolean>(false);
  // 是否开启「跳过已删片段」试听模式（默认关闭，保证编辑时顺畅拖拽与任意位置监听）
  const [autoSkipDeleted, setAutoSkipDeleted] = useState<boolean>(false);

  // 画布画幅宽高比字符串 (CSS aspect-ratio)
  const aspectCss = canvasConfig.aspectRatio.replace(':', ' / ');

  // 同步外部播放指针（当拖拽或定位时间轴时响应）
  useEffect(() => {
    if (!videoRef.current) return;
    if (Math.abs(videoRef.current.currentTime - currentTime) > 0.18) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  // 同步播放/暂停状态
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // 播放进度更新（节流更新，防止过高频率重绘）
  const lastUpdateRef = useRef<number>(0);
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;

    const now = Date.now();
    if (now - lastUpdateRef.current > 60) {
      lastUpdateRef.current = now;
      onSeek(cur);
    }

    // 仅在用户明确开启「精剪跳过试听」且正在播放时才执行跳切
    if (autoSkipDeleted && isPlaying) {
      const activeDeletedSeg = segments.find(
        (s) => s.isDeleted && cur >= s.startTime && cur < s.endTime
      );
      if (activeDeletedSeg) {
        videoRef.current.currentTime = activeDeletedSeg.endTime + 0.02;
        onSeek(activeDeletedSeg.endTime + 0.02);
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
  const deletedDuration = useMemo(() => {
    return segments.reduce(
      (acc, s) => acc + (s.isDeleted ? s.endTime - s.startTime : 0),
      0
    );
  }, [segments]);
  const preservedDuration = Math.max(0, videoDuration - deletedDuration);

  // 逐帧微调
  const handleStepFrame = (deltaSec: number) => {
    if (!videoRef.current) return;
    const nextTime = Math.max(0, Math.min(videoDuration, videoRef.current.currentTime + deltaSec));
    videoRef.current.currentTime = nextTime;
    onSeek(nextTime);
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0d12] relative select-none overflow-hidden">
      {/* 顶栏：画布画幅比例快速切换与试听模式切换 */}
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
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition flex items-center gap-1 border cursor-pointer ${
              autoSkipDeleted
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 shadow-sm'
                : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
            title="开启后，播放时将自动跳过已删除的气口与嘴瓢片段"
          >
            <Zap className={`w-3 h-3 ${autoSkipDeleted ? 'text-emerald-400 fill-current' : 'text-zinc-500'}`} />
            <span>跳过已删试听: {autoSkipDeleted ? '开启' : '关闭'}</span>
          </button>

          <span className="text-[11px] font-mono text-zinc-400 hidden sm:inline">
            精剪后: <strong className="text-indigo-400">{preservedDuration.toFixed(1)}s</strong>
            <span className="text-zinc-600 ml-1">(减{deletedDuration.toFixed(1)}s)</span>
          </span>
        </div>
      </div>

      {/* 中间舞台：真实比例画布监视器视窗 */}
      <div className="flex-1 flex items-center justify-center p-3 min-h-0 overflow-hidden relative">
        <div
          style={{ aspectRatio: aspectCss }}
          className="relative max-h-full max-w-full bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800 flex items-center justify-center group"
        >
          {/* 背景层：高雅毛玻璃氛围暗色渐变 或 纯色背景 */}
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

          {/* 前景视频主体 (单视频元素渲染，杜绝多重解码卡顿) */}
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
                    fontSize: `${subtitleConfig.fontSize || 24}px`,
                    borderRadius: '8px',
                  }}
                  className="px-3 py-1 font-bold shadow-lg"
                >
                  {activeSubtitle.text}
                </div>
              ) : subtitleConfig.templateId === 'karaoke' ? (
                /* 卡拉OK渐变点亮模版 */
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
                /* 极简无描边白字 */
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
                /* 默认：爆款双行醒目模版 */
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

      {/* 底部简易控制辅助栏 (微调入出点、逐帧与声音) */}
      <div className="h-8 px-4 bg-[#111218] border-t border-zinc-800/80 flex items-center justify-between text-zinc-400 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleStepFrame(-1 / 30)}
            className="px-1.5 py-0.5 rounded hover:bg-zinc-800 text-[10.5px] text-zinc-400 hover:text-zinc-200 transition"
            title="后退一帧"
          >
            -1帧
          </button>
          <button
            type="button"
            onClick={() => handleStepFrame(1 / 30)}
            className="px-1.5 py-0.5 rounded hover:bg-zinc-800 text-[10.5px] text-zinc-400 hover:text-zinc-200 transition"
            title="前进一帧"
          >
            +1帧
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-1 hover:text-white transition cursor-pointer"
            title={isMuted ? '取消静音' : '静音'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
export default CanvasMonitor;
