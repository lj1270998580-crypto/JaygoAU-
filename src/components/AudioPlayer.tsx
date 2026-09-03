import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/ipc';

function fmtTime(sec: number): string {
  if (isNaN(sec) || !isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SPEEDS = [1.0, 1.25, 1.5, 2.0, 0.8];

export default function AudioPlayer({
  path,
  downloadName,
  compact = false,
  autoPlay = false,
}: {
  path: string;
  downloadName?: string;
  compact?: boolean;
  autoPlay?: boolean;
}) {
  const [src, setSrc] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const currentSpeed = SPEEDS[speedIdx];

  useEffect(() => {
    let alive = true;
    if (!compact || autoPlay) {
      setLoading(true);
      api
        .readAudio(path)
        .then((d) => {
          if (!alive) return;
          setSrc(d);
          if (autoPlay && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    } else {
      setSrc('');
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
    return () => {
      alive = false;
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [path, compact, autoPlay]);

  const togglePlay = async () => {
    if (loading) return;

    if (!src) {
      setLoading(true);
      try {
        const d = await api.readAudio(path);
        setSrc(d);
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.playbackRate = currentSpeed;
            audioRef.current.play().catch(() => {});
          }
        }, 50);
      } catch {
        setLoading(false);
      }
      return;
    }

    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.playbackRate = currentSpeed;
      audioRef.current.play().catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setLoading(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = target;
      setCurrentTime(target);
    }
  };

  const toggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIdx = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(nextIdx);
    const s = SPEEDS[nextIdx];
    if (audioRef.current) {
      audioRef.current.playbackRate = s;
    }
  };

  const download = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = downloadName || `jaygo_${Date.now()}.mp3`;
    await api.downloadAudio({ path, suggestedName: name });
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-zinc-200/90 bg-zinc-50/70 p-2 select-none transition hover:border-zinc-300 ${
        compact ? 'max-w-md w-full' : 'w-full'
      }`}
    >
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        disabled={loading}
        title={playing ? '暂停' : '播放'}
        className="grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 active:scale-95 disabled:opacity-50 shrink-0"
      >
        {loading ? (
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
        ) : playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="3" width="4" height="18" rx="1" />
            <rect x="15" y="3" width="4" height="18" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="translate-x-0.5">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      <div className="flex flex-1 flex-col justify-center min-w-0">
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="group relative h-3.5 w-full cursor-pointer flex items-center"
        >
          <div className="h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden transition-all group-hover:h-2">
            <div
              className="h-full bg-blue-600 rounded-full transition-[width] duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono -mt-0.5">
          <span>{fmtTime(currentTime)}</span>
          <span>{duration > 0 ? fmtTime(duration) : '--:--'}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={toggleSpeed}
        className="rounded px-1.5 py-0.5 text-[11px] font-mono font-medium text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-800 transition shrink-0"
        title="切换播放倍速"
      >
        {currentSpeed}x
      </button>

      <button
        type="button"
        onClick={download}
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 transition shrink-0"
        title="另存为文件"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </div>
  );
}
