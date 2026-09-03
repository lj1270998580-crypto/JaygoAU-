import { useMemo } from 'react';
import { useStore } from '../store';
import { formatBytes } from '../lib/format';
import AudioPlayer from './AudioPlayer';

function timeStr(t: number) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function voiceKey(item: { voiceId: string; voiceName: string }): string {
  return item.voiceId || item.voiceName || '其他';
}

function voiceDisplay(item: { voiceId: string; voiceName: string }): string {
  return item.voiceName || item.voiceId || '历史音频';
}

export default function Library() {
  const { library, removeLibrary } = useStore();

  const groups = useMemo(() => {
    const map = new Map<string, typeof library>();
    for (const item of library) {
      const key = voiceKey(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    // 按每组最新一条排序
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, items, latest: Math.max(...items.map((i) => i.createdAt)) }))
      .sort((a, b) => b.latest - a.latest);
  }, [library]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="flex items-center justify-between">
          <h2 className="page-title">音频库</h2>
          <span className="text-xs text-zinc-400">{library.length} 条</span>
        </div>
        <p className="page-desc">合成过的所有音频，按音色分类，可随时试听、下载或删除</p>
      </div>

      {library.length === 0 && (
        <div className="text-center py-16 text-[13px] text-zinc-400">暂无音频，去「语音合成」生成第一条吧</div>
      )}

      <div className="space-y-6">
        {groups.map(({ key, items }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-zinc-100 dark:border-zinc-800">
              <div className="text-[13px] font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                {voiceDisplay(items[0])}
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal">{items.length} 条</span>
              </div>
            </div>
            <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {items.map((item) => (
                <div key={item.id} className="py-3 group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{item.voiceName}</div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        {item.format.toUpperCase()} · {formatBytes(item.size)} · {timeStr(item.createdAt)}
                      </span>
                      <button
                        className="text-[11px] text-rose-500 hover:text-rose-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeLibrary(item.path)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 line-clamp-1 mb-2">“{item.text}”</div>
                  <AudioPlayer
                    path={item.path}
                    compact
                    downloadName={`jaygo_${item.voiceId}_${item.createdAt}.${item.format === 'ogg_opus' ? 'ogg' : item.format}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
