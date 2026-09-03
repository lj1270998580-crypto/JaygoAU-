import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { statusText, statusColor, modelTypeText, voiceReady } from '../lib/format';
import { groupOfficialVoices } from '../lib/officialVoices';

/* 试听小按钮：播放/停止/加载中 三态 */
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
      <span
        role="button"
        className={`h-5 min-w-5 px-1 rounded-full text-[9px] inline-flex items-center justify-center shrink-0 select-none cursor-pointer transition ${
          active
            ? 'bg-blue-600 text-white'
            : loading
            ? 'bg-zinc-100 text-zinc-400'
            : 'text-zinc-400 hover:bg-blue-50 hover:text-blue-600'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title={active ? '停止试听' : '试听音色'}
      >
        {loading && !active ? '…' : active ? '■' : '▶'}
      </span>
    );
  }
  return (
    <button
      className={`btn-ghost !h-7 !px-2.5 !text-xs !rounded-md ${
        active ? '!text-blue-600 !border-blue-300 !bg-blue-50' : ''
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(true);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Hook 必须在任何条件早退之前调用（React Hooks 规则）
  const officialGroups = useMemo(() => groupOfficialVoices(), []);

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

  // 组件卸载时停止播放
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const preview = async (id: string, official: boolean) => {
    // 同一音色正在播放 -> 停止
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
  const voices = settings.voices;

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
    await api.removeVoice(id);
    await refreshSettings();
    showToast('已删除音色', 'info');
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

  return (
    <div className="page">
      <div className="page-head">
        <div className="flex items-center justify-between">
          <h2 className="page-title">音色库</h2>
          <span className="text-xs text-zinc-400">{voices.length} 个我的音色 · 76 个官方音色</span>
        </div>
        <p className="page-desc">训练中的音色会自动刷新状态；官方音色可直接用于合成</p>
      </div>

      {voices.length === 0 && (
        <div className="text-center py-14 mb-4">
          <div className="text-[13px] text-zinc-500 mb-3">还没有音色</div>
          <div className="flex items-center justify-center gap-2">
            <button className="btn-ghost !h-8 !text-xs" onClick={() => setTab('clone')}>去复刻</button>
            <button className="btn-primary !h-8 !text-xs" onClick={() => setShowAdd(true)}>导入已有音色</button>
          </div>
        </div>
      )}

      {/* 我的音色列表 */}
      {voices.length > 0 && (
        <div className="mb-6">
          <div className="text-[12px] font-medium text-zinc-900 mb-2">我的音色</div>
          {voices.map((v) => (
            <div
              key={v.id}
              className="group flex items-center gap-3 py-3 px-3 -mx-3 rounded-lg hover:bg-zinc-50/70 transition"
            >
              <div className="flex-1 min-w-0">
                {editingId === v.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="glass-input !h-8 flex-1"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(v.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button className="btn-primary !h-8 !px-3 !text-xs" onClick={() => submitRename(v.id)}>保存</button>
                    <button className="btn-ghost !h-8 !px-3 !text-xs" onClick={() => setEditingId(null)}>取消</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[13px] font-medium text-zinc-900 truncate">{v.name}</span>
                    <span className={`chip ${statusColor(v.status)}`}>{statusText(v.status)}</span>
                    {v.modelType != null && (
                      <span className="chip bg-zinc-100 text-zinc-500">{modelTypeText(v.modelType)}</span>
                    )}
                    <span className="text-[11px] text-zinc-400 font-mono truncate hidden sm:inline">{v.id}</span>
                  </div>
                )}
              </div>

              {editingId !== v.id && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {voiceReady(v) && (
                    <PreviewButton
                      active={previewId === v.id}
                      loading={previewLoading === v.id}
                      onClick={() => preview(v.id, false)}
                    />
                  )}
                  {voiceReady(v) && (
                    <button
                      className="btn-primary !h-7 !px-2.5 !text-xs !rounded-md"
                      onClick={() => {
                        setOfficialVoice('');
                        setSelectedVoice(v.id);
                        setTab('synth');
                      }}
                    >
                      去合成
                    </button>
                  )}
                  <button
                    className="btn-ghost !h-7 !px-2.5 !text-xs !rounded-md"
                    onClick={() => query(v.id)}
                    disabled={busyId === v.id}
                  >
                    {busyId === v.id ? '刷新中…' : '刷新'}
                  </button>
                  <button
                    className="btn-ghost !h-7 !px-2.5 !text-xs !rounded-md"
                    onClick={() => startRename(v)}
                  >
                    重命名
                  </button>
                  <button className="btn-danger !h-7 !px-2.5 !text-xs !rounded-md" onClick={() => remove(v.id)}>
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 添加音色：默认展开 */}
      <div className="border-t border-zinc-100 pt-4 mb-8">
        <button
          className="text-[12px] text-zinc-400 hover:text-zinc-600 transition flex items-center gap-1"
          onClick={() => setShowAdd((s) => !s)}
        >
          <span className={`inline-block transition-transform ${showAdd ? 'rotate-90' : ''}`}>›</span>
          添加已有音色（从火山控制台导入）
        </button>

        {showAdd && (
          <div className="mt-3 space-y-4">
            <div>
              <label className="label">批量导入音色 ID</label>
              <p className="text-[11px] text-zinc-400 mb-2 leading-relaxed">
                火山接口无法直接列出账号下的音色，请从控制台复制音色 ID 粘贴到这里（支持换行 / 逗号 / 空格分隔），导入时会自动逐个查询训练状态。
              </p>
              <textarea
                className="glass-input w-full h-20 font-mono text-xs resize-none"
                placeholder={'S_xxxxxxxxxxxx\nzh_female_vv_uranus_bigtts'}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <button className="btn-primary !h-8 !text-xs mt-2" onClick={runImport} disabled={importing}>
                {importing ? '导入中…' : '批量导入'}
              </button>
            </div>

            <div className="pt-3 border-t border-zinc-100">
              <label className="label">手动添加单个音色</label>
              <div className="flex gap-2">
                <input
                  className="glass-input flex-1"
                  placeholder="音色 ID"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                />
                <input
                  className="glass-input w-44"
                  placeholder="显示名称（可选）"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <button className="btn-ghost !h-8 !text-xs shrink-0" onClick={addManual}>添加</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 官方音色 */}
      <div className="border-t border-zinc-100 pt-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[12px] font-medium text-zinc-900">官方音色</div>
            <div className="text-[11px] text-zinc-400">共 {officialGroups.reduce((s, g) => s + g.voices.length, 0)} 个，点击即可在「语音合成」中使用</div>
          </div>
        </div>

        <div className="space-y-5">
          {officialGroups.map((g) => (
            <div key={g.category}>
              <div className="text-[11px] text-zinc-500 mb-2 sticky top-0 bg-white py-1">{g.category}</div>
              <div className="flex flex-wrap gap-2">
                {g.voices.map((v) => (
                  <div
                    key={v.id}
                    className="h-8 pl-3 pr-1.5 rounded-full text-[12px] border border-zinc-200 bg-white text-zinc-700 hover:border-blue-400 hover:text-blue-700 transition select-none flex items-center gap-1.5 cursor-pointer"
                    onClick={() => useOfficial(v.id)}
                    title={v.id}
                  >
                    <span>{v.name}</span>
                    {v.tag && <span className="text-[10px] text-zinc-400">· {v.tag}</span>}
                    <PreviewButton
                      size="xs"
                      active={previewId === v.id}
                      loading={previewLoading === v.id}
                      onClick={() => preview(v.id, true)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
