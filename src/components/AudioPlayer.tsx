import { useEffect, useState } from 'react';
import { api } from '../lib/ipc';

export default function AudioPlayer({
  path,
  downloadName,
  compact = false,
}: {
  path: string;
  downloadName?: string;
  compact?: boolean;
}) {
  const [src, setSrc] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .readAudio(path)
      .then((d) => alive && setSrc(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path]);

  const download = async () => {
    const name = downloadName || `jaygo_${Date.now()}.mp3`;
    await api.downloadAudio({ path, suggestedName: name });
  };

  return (
    <div className="flex items-center gap-3">
      {loading ? (
        <span className="text-zinc-400 text-xs">音频加载中…</span>
      ) : (
        <audio controls src={src} className={compact ? 'h-9 w-72' : 'h-9 w-full max-w-md'} />
      )}
      <button className="btn-ghost !h-7 !px-2.5 !text-xs !rounded-md" onClick={download} title="另存为">
        下载
      </button>
    </div>
  );
}
