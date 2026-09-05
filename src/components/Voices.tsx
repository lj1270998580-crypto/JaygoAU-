import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { statusText, statusColor, modelTypeText, voiceReady } from '../lib/format';
import { groupOfficialVoices, OFFICIAL_VOICES_V2, OFFICIAL_VOICES_V1 } from '../lib/officialVoices';

/* 试听按钮组件 */
function PreviewButton({
  active,
  loading,
  onClick,
  size = 'sm',
}: {
  active: boolean;
  loading: boolean;
  onClick: () => void;
  size?: 'sm' | 'xs';
}) {
  if (size === 'xs') {
    return (
      <button
        type="button"
        className={`h-6 min-w-6 px-1.5 rounded-full text-[10px] inline-flex items-center justify-center shrink-0 select-none cursor-pointer transition ${
          active
            ? 'bg-blue-600 text-white shadow-sm'
            : loading
            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-blue-50 dark:hover:bg-blue-900/50 hover:text-blue-600 dark:hover:text-blue-300'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title={active ? '停止试听' : '试听音色'}
      >
        {loading && !active ? '…' : active ? '■' : '▶'}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`btn-ghost !h-7 !px-2.5 !text-xs !rounded-md whitespace-nowrap shrink-0 ${
        active ? '!text-blue-600 !border-blue-300 !bg-blue-50 dark:!bg-blue-950/40 dark:!text-blue-400' : ''
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={active ? '停止试听' : '试听音色'}
      disabled={loading && !active}
    >
      {loading && !active ? '试听中…' : active ? '■ 停止' : '▶ 试听'}
    </button>
  );
}

export default function Voices() {
  const { settings, refreshSettings, setTab, setSelectedVoice, setOfficialVoice, showToast } = useStore();
  const [topTab, setTopTab] = useState<'my' | 'official'>('my');
  const [versionTab, setVersionTab] = useState<'2.0' | '1.0'>('2.0');
  const [officialCategory, setOfficialCategory] = useState('全部');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // 官方音色分组
  const officialGroups = useMemo(() => groupOfficialVoices(versionTab), [versionTab]);
  const categories = useMemo(() => {
    return ['全部', ...officialGroups.map((g) => g.category)];
  }, [officialGroups]);

  // 当切换版本时，重置分类
  const handleVersionChange = (ver: '2.0' | '1.0') => {
    setVersionTab(ver);
    setOfficialCategory('全部');
  };

  // ---- 音色试听 ----
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
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const preview = async (id: string, official: boolean) => {
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
    } catch (e: any) {
      showToast(e?.message || '试听失败', 'err');
      setPreviewId(null);
    } finally {
      setPreviewLoading(null);
    }
  };

  if (!settings) return null;
  const voices = settings.voices || [];

  const startRename = (v: { id: string; name: string }) => {
    setEditingId(v.id);
    setEditName(v.name);
  };

  const submitRename = async (id: string) => {
    const name = editName.trim();
    if (!name) {
      showToast('名称不能为空', 'err');
      return;
    }
    try {
      await api.renameVoice({ id, name });
      await refreshSettings();
      setEditingId(null);
      showToast('已重命名', 'ok');
    } catch (e: any) {
      showToast(e?.message || '重命名失败', 'err');
    }
  };

  const runImport = async () => {
    if (!importText.trim()) {
      showToast('请粘贴音色 ID', 'err');
      return;
    }
    setImporting(true);
    try {
      const r = await api.importVoices(importText);
      await refreshSettings();
      setImportText('');
      if (r.failed.length > 0) {
        showToast(`已导入 ${r.added} 个，${r.failed.length} 个查不到：${r.failed.join('、')}`, 'err');
      } else {
        showToast(`已导入 ${r.added} 个音色并刷新状态`, 'ok');
      }
    } catch (e: any) {
      showToast(e?.message || '导入失败', 'err');
    } finally {
      setImporting(false);
    }
  };

  const query = async (id: string) => {
    setBusyId(id);
    try {
      await api.queryVoice(id);
      await refreshSettings();
      showToast('已刷新状态', 'ok');
    } catch (e: any) {
      showToast(e?.message || '查询失败', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('确定从本地列表中移除此音色吗？')) return;
    await api.removeVoice(id);
    await refreshSettings();
    showToast('已移除音色', 'info');
  };

  const addManual = async () => {
    if (!manualId.trim()) {
      showToast('请输入音色 ID', 'err');
      return;
    }
    try {
      await api.addManualVoice({ id: manualId, name: manualName });
      await refreshSettings();
      setManualId('');
      setManualName('');
      showToast('已添加音色', 'ok');
    } catch (e: any) {
      showToast(e?.message || '添加失败', 'err');
    }
  };

  const useOfficial = (id: string) => {
    setOfficialVoice(id);
    setSelectedVoice('');
    setTab('synth');
  };

  const voicesRef = useRef(settings.voices);
  voicesRef.current = settings.voices;

  // 自动轮询「训练中」的音色，直到就绪或失败
  useEffect(() => {
    const hasTraining = settings.voices.some((v) => v.status === 1);
    if (!hasTraining) return;

    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped) return;
      const trainingList = voicesRef.current.filter((v) => v.status === 1);
      if (trainingList.length === 0) {
        clearInterval(timer);
        return;
      }
      for (const v of trainingList) {
        if (stopped) break;
        try {
          await api.queryVoice(v.id);
        } catch {
          /* ignore */
        }
      }
      if (!stopped) await refreshSettings();
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [settings.voices.some((v) => v.status === 1)]);

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    showToast('音色 ID 已复制', 'ok');
  };

  return (
    <div className="page">
      {/* 头部与主导航 Tabs */}
      <div className="page-head pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="page-title">音色库</h2>
            <p className="page-desc mt-0.5">
              管理专属复刻音色与浏览火山引擎精品音色（支持 2.0 / 1.0 随时选用）
            </p>
          </div>

          {/* 顶层选项卡：专属复刻 vs 官方音色 */}
          <div className="flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-[#18181c] border border-zinc-200/80 dark:border-zinc-800 shrink-0 select-none">
            <button
              type="button"
              onClick={() => setTopTab('my')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                topTab === 'my'
                  ? 'bg-white dark:bg-[#23232b] text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <span>🎙️ 我的专属复刻</span>
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300">
                {voices.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTopTab('official')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                topTab === 'official'
                  ? 'bg-white dark:bg-[#23232b] text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <span>🌟 官方音色库</span>
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-normal">
                2.0 / 1.0
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================== Tab 1: 我的专属复刻 ===================== */}
      {topTab === 'my' && (
        <div className="mt-5 space-y-5 animate-fade-in">
          {/* 工具栏：复刻按钮与导入入口 */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-50 dark:bg-[#16161a] p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              包含通过声音复刻训练出的专属音色，训练就绪后可一键用于文本配音
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowAdd((s) => !s)}
                className="btn-ghost !h-8 !px-3 !text-xs rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>{showAdd ? '✕ 收起导入' : '＋ 导入已有音色'}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('clone')}
                className="btn-primary !h-8 !px-3.5 !text-xs rounded-lg flex items-center gap-1.5 font-medium shadow-sm whitespace-nowrap shrink-0"
              >
                <span>🎙️</span>
                <span>复刻新音色</span>
              </button>
            </div>
          </div>

          {/* 展开的导入区域 */}
          {showAdd && (
            <div className="p-4 rounded-xl bg-white dark:bg-[#16161a] border border-blue-200 dark:border-blue-900/50 shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span>📥 导入已有音色 ID</span>
                  <span className="text-[11px] font-normal text-zinc-400">（用于跨设备或恢复已复刻音色）</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="label text-xs">批量导入音色 ID</label>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-2 leading-relaxed">
                  火山引擎接口无法直接列出账号名下所有音色，请从火山控制台复制音色 ID 粘贴到这里（支持多行换行 / 逗号 / 空格分隔），导入时会自动逐个查询训练状态。
                </p>
                <textarea
                  className="glass-input w-full h-20 font-mono text-xs resize-none"
                  placeholder={'S_xxxxxxxxxxxx\nzh_female_vv_uranus_bigtts'}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <div className="flex justify-end mt-2">
                  <button className="btn-primary !h-8 !px-4 !text-xs" onClick={runImport} disabled={importing}>
                    {importing ? '导入中…' : '开始批量导入'}
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">快捷单条添加：</div>
                <input
                  className="glass-input !h-8 flex-1 text-xs"
                  placeholder="音色 ID (如 S_xxx)"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                />
                <input
                  className="glass-input !h-8 w-40 text-xs"
                  placeholder="备注名称 (可选)"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <button className="btn-ghost !h-8 !px-3 !text-xs shrink-0" onClick={addManual}>
                  添加
                </button>
              </div>
            </div>
          )}

          {/* 音色卡片列表 */}
          {voices.length === 0 ? (
            <div className="text-center py-16 bg-zinc-50/50 dark:bg-[#141417] rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
              <div className="text-4xl mb-3">🎙️</div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">暂无专属复刻音色</div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto mb-4">
                只需上传一段 5~10 秒的高清人声音频，即可快速复刻属于你的独家声音模型。
              </p>
              <div className="flex items-center justify-center gap-2.5">
                <button className="btn-primary !h-8 !px-4 !text-xs" onClick={() => setTab('clone')}>
                  立即去复刻
                </button>
                <button className="btn-ghost !h-8 !px-3.5 !text-xs" onClick={() => setShowAdd(true)}>
                  导入已有音色
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {voices.map((v) => {
                const isReady = voiceReady(v);
                const isEditing = editingId === v.id;

                return (
                  <div
                    key={v.id}
                    className="flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#16161a] hover:border-blue-300 dark:hover:border-blue-600/70 hover:shadow-md transition-all group min-w-0"
                  >
                    <div>
                      {/* 头部：头像 + 状态 */}
                      <div className="flex items-start justify-between gap-2.5 mb-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-bold text-sm shadow-sm">
                            {v.name.slice(0, 1) || '声'}
                          </div>
                          <div className="min-w-0">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <input
                                  className="glass-input !h-7 text-xs w-28"
                                  value={editName}
                                  autoFocus
                                  onChange={(e) => setEditName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') submitRename(v.id);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                />
                                <button
                                  className="btn-primary !h-7 !px-2 !text-xs"
                                  onClick={() => submitRename(v.id)}
                                >
                                  ✓
                                </button>
                                <button
                                  className="btn-ghost !h-7 !px-1.5 !text-xs"
                                  onClick={() => setEditingId(null)}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {v.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startRename(v)}
                                  className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition text-xs"
                                  title="重命名"
                                >
                                  ✏️
                                </button>
                              </div>
                            )}
                            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1 font-mono">
                              <span className="truncate max-w-[120px]">{v.id}</span>
                              <button
                                type="button"
                                onClick={() => copyId(v.id)}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                title="复制 ID"
                              >
                                📋
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 状态 Chip */}
                        <span className={`chip shrink-0 ${statusColor(v.status)}`}>
                          {statusText(v.status)}
                        </span>
                      </div>

                      {/* 模型类型与信息 */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {modelTypeText(v.modelType)}
                        </span>
                        {v.status === 1 && (
                          <span className="text-[11px] text-blue-600 dark:text-blue-400 animate-pulse">
                            系统训练中，每 5 秒自动同步…
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 卡片底栏操作按钮 */}
                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isReady && (
                          <PreviewButton
                            active={previewId === v.id}
                            loading={previewLoading === v.id}
                            onClick={() => preview(v.id, false)}
                          />
                        )}
                        <button
                          className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition shrink-0"
                          onClick={() => query(v.id)}
                          disabled={busyId === v.id}
                          title="从火山服务器查询最新状态"
                        >
                          <span className={busyId === v.id ? 'animate-spin inline-block' : ''}>🔄</span>
                        </button>
                        <button
                          className="h-7 w-7 rounded-lg inline-flex items-center justify-center text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/40 transition shrink-0"
                          onClick={() => remove(v.id)}
                          title="从本地列表中移除"
                        >
                          🗑️
                        </button>
                      </div>

                      {isReady && (
                        <button
                          className="btn-primary !h-7 !px-3 !text-xs !rounded-lg font-medium whitespace-nowrap shrink-0 shadow-sm flex items-center gap-1"
                          onClick={() => {
                            setOfficialVoice('');
                            setSelectedVoice(v.id);
                            setTab('synth');
                          }}
                        >
                          <span>去合成</span>
                          <span>→</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== Tab 2: 官方精品音色库 ===================== */}
      {topTab === 'official' && (
        <div className="mt-5 space-y-5 animate-fade-in">
          {/* 版本切换栏与价格说明 */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-[#16161a] border border-zinc-200/80 dark:border-zinc-800">
            {/* 2.0 vs 1.0 分段切换器 */}
            <div className="flex items-center p-1 rounded-xl bg-zinc-200/80 dark:bg-zinc-800/90 shrink-0 select-none">
              <button
                type="button"
                onClick={() => handleVersionChange('2.0')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  versionTab === '2.0'
                    ? 'bg-white dark:bg-[#202028] text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <span>🌟 2.0 大模型音色</span>
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.2 rounded font-normal">
                  {OFFICIAL_VOICES_V2.length}个
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleVersionChange('1.0')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  versionTab === '1.0'
                    ? 'bg-white dark:bg-[#202028] text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <span>📻 1.0 经典音色</span>
                <span className="text-[10px] px-1.5 py-0.2 text-zinc-500">
                  {OFFICIAL_VOICES_V1.length}个
                </span>
              </button>
            </div>

            {/* 计费提示 */}
            <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {versionTab === '2.0' ? (
                <span className="text-blue-600 dark:text-blue-400">
                  💡 Seed-TTS 2.0 大模型音色，按量计费 5.0 元/万字（购买资源包低至 2.8 元/万字）
                </span>
              ) : (
                <span className="text-zinc-600 dark:text-zinc-400">
                  💡 BigTTS 1.0 经典基础音色，按量计费约 0.20 元/万字（经典高性价比）
                </span>
              )}
            </div>
          </div>

          {/* 分类胶囊标签筛选 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => {
              const active = officialCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setOfficialCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-[#16161a] text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* 音色卡片渲染 */}
          <div className="space-y-6">
            {officialGroups.map((g) => {
              if (officialCategory !== '全部' && officialCategory !== g.category) return null;

              return (
                <div key={g.category} className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    <span>{g.category}</span>
                    <span className="text-zinc-400 font-normal">({g.voices.length})</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                    {g.voices.map((v) => {
                      const isV2 = v.version === '2.0';
                      return (
                        <div
                          key={v.id}
                          onClick={() => useOfficial(v.id)}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#16161a] hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm cursor-pointer select-none transition group min-w-0"
                          title={`点击在语音合成中使用此音色\nID: ${v.id}`}
                        >
                          <div className="min-w-0 flex-1 pr-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                {v.name}
                              </span>
                              {isV2 && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium shrink-0">
                                  2.0
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                              {v.gender ? `${v.gender}声` : ''} {v.tag ? `· ${v.tag}` : ''}
                            </div>
                          </div>

                          <PreviewButton
                            size="xs"
                            active={previewId === v.id}
                            loading={previewLoading === v.id}
                            onClick={() => preview(v.id, true)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
