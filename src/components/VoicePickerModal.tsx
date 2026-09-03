import { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { OFFICIAL_VOICES, groupOfficialVoices } from '../lib/officialVoices';
import { statusText, statusColor, voiceReady } from '../lib/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (voiceId: string, isOfficial: boolean) => void;
  currentVoiceId: string;
}

export default function VoicePickerModal({ isOpen, onClose, onSelect, currentVoiceId }: Props) {
  const { settings, showToast } = useStore();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('全部');

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPreviewId(null);
  };

  useEffect(() => {
    if (!isOpen) stopPreview();
    return () => stopPreview();
  }, [isOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const preview = async (id: string, official: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewId === id) {
      stopPreview();
      return;
    }
    stopPreview();
    setPreviewLoading(id);
    try {
      const res = await api.previewVoice({ speakerId: id, official });
      const data = await api.readAudio(res.path);
      const a = new Audio(data);
      audioRef.current = a;
      a.onended = () => setPreviewId(null);
      a.onerror = () => setPreviewId(null);
      await a.play();
      setPreviewId(id);
    } catch (err: any) {
      showToast(err?.message || '试听失败', 'err');
      setPreviewId(null);
    } finally {
      setPreviewLoading(null);
    }
  };

  const myVoices = settings?.voices || [];
  const officialGroups = useMemo(() => groupOfficialVoices(), []);

  const categories = useMemo(() => {
    const list = ['全部', '我的克隆'];
    for (const g of officialGroups) {
      if (!list.includes(g.category)) list.push(g.category);
    }
    return list;
  }, [officialGroups]);

  // 合并筛选
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const results: Array<{
      id: string;
      name: string;
      isOfficial: boolean;
      tag?: string;
      gender?: string;
      category: string;
      ready: boolean;
      status?: number;
    }> = [];

    // 1. 我的音色
    if (activeTab === '全部' || activeTab === '我的克隆') {
      for (const v of myVoices) {
        const matchSearch =
          !q ||
          v.name.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q) ||
          '我的克隆'.includes(q);
        if (matchSearch) {
          results.push({
            id: v.id,
            name: v.name,
            isOfficial: false,
            tag: '克隆音色',
            category: '我的克隆',
            ready: voiceReady(v),
            status: v.status,
          });
        }
      }
    }

    // 2. 官方音色
    if (activeTab !== '我的克隆') {
      for (const g of officialGroups) {
        if (activeTab !== '全部' && activeTab !== g.category) continue;
        for (const v of g.voices) {
          const matchSearch =
            !q ||
            v.name.toLowerCase().includes(q) ||
            v.id.toLowerCase().includes(q) ||
            (v.tag && v.tag.toLowerCase().includes(q)) ||
            (v.gender && v.gender.toLowerCase().includes(q)) ||
            g.category.toLowerCase().includes(q);
          if (matchSearch) {
            results.push({
              id: v.id,
              name: v.name,
              isOfficial: true,
              tag: v.tag || g.category,
              gender: v.gender,
              category: g.category,
              ready: true,
            });
          }
        }
      }
    }

    return results;
  }, [search, activeTab, myVoices, officialGroups]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div
        className="flex flex-col w-full max-w-3xl h-[640px] max-h-[90vh] rounded-2xl bg-white dark:bg-[#121215] shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden text-zinc-900 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold text-sm">
              🎙️
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">选择配音音色</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                {myVoices.length} 个我的克隆 · {OFFICIAL_VOICES.length} 个官方精品音色
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 搜索栏与分类 Tab */}
        <div className="px-6 py-3 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-[#16161a] shrink-0 space-y-2.5">
          {/* 搜索框 */}
          <div className="relative">
            <svg
              className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500"
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
              placeholder="搜索音色名称、标签、性别（如：灿灿、解说、女声）..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input w-full !pl-9 !pr-8 !h-9 text-xs rounded-lg"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* 分类胶囊标签 */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {categories.map((cat) => {
              const active = activeTab === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-[#1c1c22] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 音色卡片网格列表 */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white dark:bg-[#121215]">
          {filteredList.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 text-xs py-16">
              <span className="text-3xl mb-2">🔍</span>
              <span>未找到符合条件的音色</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredList.map((item) => {
                const isSelected = item.id === currentVoiceId;
                const isAuditioning = previewId === item.id;
                const isLoading = previewLoading === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!item.ready) return;
                      onSelect(item.id, item.isOfficial);
                      onClose();
                    }}
                    className={`group relative flex items-center justify-between p-3 rounded-xl border transition cursor-pointer select-none ${
                      isSelected
                        ? 'border-blue-600 dark:border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                        : item.ready
                        ? 'border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#16161a] hover:border-blue-300 dark:hover:border-blue-600/80 hover:shadow-sm'
                        : 'border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      {/* 头像/标识 */}
                      <div
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                          item.isOfficial
                            ? 'bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50'
                            : 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50'
                        }`}
                      >
                        {item.gender === '女' ? '♀' : item.gender === '男' ? '♂' : item.name.slice(0, 1)}
                      </div>

                      {/* 音色名与描述 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {item.name}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] bg-blue-600 text-white rounded px-1 py-0.2 shrink-0 font-normal">
                              当前
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate flex items-center gap-1.5">
                          <span>{item.tag || item.category}</span>
                          {!item.ready && item.status != null && (
                            <span className={`chip ${statusColor(item.status)}`}>
                              {statusText(item.status)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 试听按钮 */}
                    {item.ready && (
                      <button
                        type="button"
                        onClick={(e) => preview(item.id, item.isOfficial, e)}
                        disabled={isLoading}
                        title={isAuditioning ? '停止试听' : '试听音色'}
                        className={`grid h-7 w-7 place-items-center rounded-full transition shrink-0 ${
                          isAuditioning
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-400'
                        }`}
                      >
                        {isLoading ? (
                          <span className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        ) : isAuditioning ? (
                          <span className="text-[9px]">■</span>
                        ) : (
                          <span className="text-[10px] translate-x-0.5">▶</span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部信息栏 */}
        <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50 dark:bg-[#16161a] flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
          <span>单击卡片即可选择并应用到语音合成</span>
          <button
            onClick={onClose}
            className="btn-ghost !h-7 !px-3 !text-xs rounded-md"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
