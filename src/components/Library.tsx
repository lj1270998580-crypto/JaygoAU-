import { useState, useMemo, useRef, useEffect } from 'react';
import { useStore, LibraryItem } from '../store';
import { formatBytes } from '../lib/format';
import { api } from '../lib/ipc';
import { isOfficialVoice } from '../lib/officialVoices';

function timeStr(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtTime(sec: number): string {
  if (isNaN(sec) || !isFinite(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SPEEDS = [1.0, 1.25, 1.5, 2.0];

export default function Library() {
  const { library, removeLibrary, showToast } = useStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'custom' | 'official' | 'mp3' | 'wav'>('all');

  // 当前全局播放音轨状态
  const [currentTrack, setCurrentTrack] = useState<LibraryItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  // 卸载时停止
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // 播放指定项目
  const playTrack = async (item: LibraryItem) => {
    // 若点击正在播放的音轨 -> 暂停或播放切换
    if (currentTrack?.id === item.id) {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
        } else {
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      }
      return;
    }

    // 播放新音轨
    setCurrentTrack(item);
    setLoadingAudio(true);
    setCurrentTime(0);
    setDuration(0);

    try {
      let audioUrl = '';
      try {
        audioUrl = await api.readAudio(item.path);
      } catch {
        // Fallback to file protocol
        audioUrl = `file:///${item.path.replace(/\\/g, '/')}`;
      }

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      const a = audioRef.current;
      a.src = audioUrl;
      a.playbackRate = SPEEDS[speedIdx];

      a.onloadedmetadata = () => {
        setDuration(a.duration || 0);
      };

      a.ontimeupdate = () => {
        setCurrentTime(a.currentTime);
      };

      a.onended = () => {
        setIsPlaying(false);
      };

      a.onerror = () => {
        setIsPlaying(false);
        showToast('音频文件损坏或路径不存在', 'err');
      };

      await a.play();
      setIsPlaying(true);
    } catch (err: any) {
      showToast(err?.message || '播放失败', 'err');
      setIsPlaying(false);
    } finally {
      setLoadingAudio(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !audioRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * duration;
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const toggleSpeed = () => {
    const nextIdx = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[nextIdx];
    }
  };

  const stopAndClosePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setCurrentTrack(null);
    setIsPlaying(false);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('文本已复制到剪贴板', 'ok');
  };

  const downloadItem = async (item: LibraryItem) => {
    try {
      const data = await api.readAudio(item.path);
      const ext = item.format === 'ogg_opus' ? 'ogg' : item.format || 'mp3';
      const filename = `jaygo_${item.voiceName || 'voice'}_${item.createdAt}.${ext}`;
      const a = document.createElement('a');
      a.href = data;
      a.download = filename;
      a.click();
      showToast('已开始下载音频', 'ok');
    } catch {
      showToast('下载失败', 'err');
    }
  };

  const handleDelete = (item: LibraryItem) => {
    if (!window.confirm(`确定从音频库中删除此记录吗？`)) return;
    if (currentTrack?.id === item.id) {
      stopAndClosePlayer();
    }
    removeLibrary(item.path);
    showToast('已从音频库删除', 'info');
  };

  // 筛选与搜索
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((item) => {
      // 搜索词
      if (q) {
        const matchText = (item.text || '').toLowerCase().includes(q);
        const matchVoice = (item.voiceName || '').toLowerCase().includes(q);
        const matchFormat = (item.format || '').toLowerCase().includes(q);
        if (!matchText && !matchVoice && !matchFormat) return false;
      }

      // 类型分类
      const isOfficial = isOfficialVoice(item.voiceId);
      if (filterType === 'custom' && isOfficial) return false;
      if (filterType === 'official' && !isOfficial) return false;
      if (filterType === 'mp3' && item.format !== 'mp3') return false;
      if (filterType === 'wav' && item.format !== 'wav') return false;

      return true;
    });
  }, [library, search, filterType]);

  const totalSize = useMemo(() => {
    return library.reduce((acc, item) => acc + (item.size || 0), 0);
  }, [library]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="page pb-28">
      {/* 头部导航与统计 */}
      <div className="page-head pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="page-title flex items-center gap-2">
              <span>🎧</span>
              <span>音频库</span>
            </h2>
            <p className="page-desc mt-0.5">
              已合成保存的音频列表，支持即时搜索、全局底栏播放、下载与批量管理
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 font-medium">
              共 {library.length} 条记录
            </span>
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 font-medium">
              占用 {formatBytes(totalSize)}
            </span>
          </div>
        </div>
      </div>

      {/* 搜索与分类过滤栏 */}
      <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-50 dark:bg-[#16161a] p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
        {/* 搜索输入 */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="搜索文案内容、音色名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full !pl-9 !pr-8 !h-8 text-xs rounded-lg"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* 类型切换胶囊 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
          {[
            { id: 'all', label: '全部' },
            { id: 'custom', label: '专属复刻' },
            { id: 'official', label: '官方音色' },
            { id: 'mp3', label: 'MP3' },
            { id: 'wav', label: 'WAV' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition shrink-0 ${
                filterType === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-[#1c1c22] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 音频列表内容 */}
      <div className="mt-4">
        {library.length === 0 ? (
          <div className="text-center py-20 bg-zinc-50/50 dark:bg-[#141417] rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
            <div className="text-4xl mb-3">🎵</div>
            <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">音频库为空</div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto mb-4">
              在「语音合成」完成配音后，生成的音频将自动保存在这里，随时可以回放与导出。
            </p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 dark:text-zinc-500 text-xs">
            未找到匹配的音频记录
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredList.map((item) => {
              const isCurrent = currentTrack?.id === item.id;
              const isOfficial = isOfficialVoice(item.voiceId);
              const isV2 = item.voiceId?.includes('uranus');

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition group ${
                    isCurrent
                      ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 ring-1 ring-blue-500/20'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#16161a] hover:border-blue-300 dark:hover:border-blue-600/70 hover:shadow-xs'
                  }`}
                >
                  {/* 左侧：播放按钮 + 音色信息 + 文本摘录 */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
                    {/* 播放控制小圆圈 */}
                    <button
                      type="button"
                      onClick={() => playTrack(item)}
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
                        isCurrent && isPlaying
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-blue-500 hover:text-white group-hover:scale-105'
                      }`}
                      title={isCurrent && isPlaying ? '暂停' : '播放'}
                    >
                      {isCurrent && loadingAudio ? (
                        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : isCurrent && isPlaying ? (
                        <span className="text-xs">⏸</span>
                      ) : (
                        <span className="text-xs translate-x-0.5">▶</span>
                      )}
                    </button>

                    {/* 文档核心信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.voiceName || '音色'}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                            isOfficial
                              ? isV2
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isOfficial ? (isV2 ? '2.0 大模型' : '1.0 官方') : '专属复刻'}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                          {item.format?.toUpperCase()} · {formatBytes(item.size)}
                        </span>
                      </div>

                      {/* 文本内容引用 */}
                      <p
                        className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1 select-text cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200 transition"
                        onClick={() => copyText(item.text)}
                        title="点击复制文案内容"
                      >
                        “{item.text}”
                      </p>
                    </div>
                  </div>

                  {/* 右侧：生成时间 + 工具操作 */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-zinc-400 font-mono hidden md:inline">
                      {timeStr(item.createdAt)}
                    </span>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() => copyText(item.text)}
                        className="btn-ghost !h-7 !px-2 !text-xs rounded-md"
                        title="复制文案"
                      >
                        复制
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadItem(item)}
                        className="btn-ghost !h-7 !px-2 !text-xs rounded-md"
                        title="下载音频文件"
                      >
                        下载
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="btn-ghost !h-7 !px-2 !text-xs rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="删除记录"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= 常驻全局底栏播放条 Floating Mini Player ================= */}
      {currentTrack && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-4xl z-40 animate-slide-up">
          <div className="rounded-2xl border border-zinc-300/80 dark:border-zinc-700/80 bg-white/95 dark:bg-[#18181e]/95 backdrop-blur-xl shadow-2xl p-3 sm:px-5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              {/* 左侧：音色与标题 */}
              <div className="flex items-center gap-3 min-w-0 w-1/3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white font-bold text-xs shadow-sm">
                  {isPlaying ? '♫' : '▶'}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                    {currentTrack.voiceName}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                    {currentTrack.text}
                  </div>
                </div>
              </div>

              {/* 中间：播放/暂停控制 */}
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => playTrack(currentTrack)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition"
                  title={isPlaying ? '暂停' : '播放'}
                >
                  {isPlaying ? (
                    <span className="text-xs">⏸</span>
                  ) : (
                    <span className="text-xs translate-x-0.5">▶</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleSpeed}
                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                  title="切换播放倍速"
                >
                  {SPEEDS[speedIdx]}x
                </button>
              </div>

              {/* 右侧：时间与关闭 */}
              <div className="flex items-center justify-end gap-3 w-1/3">
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
                <button
                  type="button"
                  onClick={() => downloadItem(currentTrack)}
                  className="btn-ghost !h-7 !px-2 !text-xs rounded-md"
                  title="下载音频"
                >
                  ⬇
                </button>
                <button
                  type="button"
                  onClick={stopAndClosePlayer}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 text-sm transition"
                  title="关闭播放栏"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 底部播放进度条 */}
            <div
              ref={progressBarRef}
              onClick={handleSeek}
              className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full cursor-pointer relative overflow-hidden group/bar"
            >
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-100"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
