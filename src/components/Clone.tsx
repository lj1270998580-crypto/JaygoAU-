import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { LANGUAGES, statusText } from '../lib/format';

export default function Clone() {
  const { settings, hasKey, refreshSettings, showToast, setTab } = useStore();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ src: string; size: number; name: string } | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(settings?.language ?? 0);
  const [denoise, setDenoise] = useState(settings?.denoise ?? true);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!settings) return null;

  useEffect(() => {
    if (!preview) return;
    const a = new Audio(preview.src);
    a.onloadedmetadata = () => setDuration(a.duration || 0);
  }, [preview]);

  const pick = async () => {
    const p = await api.pickAudioFile();
    if (!p) return;
    setFilePath(p);
    const name = p.split(/[\\/]/).pop() || 'audio';
    setPreview({ src: '', size: 0, name });
    api.readAudio(p).then((d) => {
      const b64 = d.split(',')[1] || '';
      const size = Math.floor((b64.length * 3) / 4);
      setPreview({ src: d, size, name });
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const p = api.getPathForFile ? api.getPathForFile(f) : (f as any).path || f.name;
    setFilePath(p);
    setPreview({ src: URL.createObjectURL(f), size: f.size, name: f.name });
  };

  const tooBig = preview ? preview.size > 10 * 1024 * 1024 : false;

  const start = async () => {
    if (!filePath) {
      showToast('请先选择音频文件', 'err');
      return;
    }
    if (tooBig) {
      showToast('音频超过 10MB，请裁剪后重试', 'err');
      return;
    }
    setBusy(true);
    try {
      const res = await api.cloneVoice({ name, filePath, language, denoise });
      await refreshSettings();
      showToast(`已提交复刻，当前状态：${statusText(res.status)}`, 'ok');
      setFilePath(null);
      setPreview(null);
      setName('');
      setTab('voices');
    } catch (e: any) {
      showToast(e?.message || '复刻失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">声音复刻</h2>
        <p className="page-desc">上传一段清晰人声（建议 10–25 秒、≤10MB），训练出专属克隆音色</p>
      </div>

      {!hasKey && (
        <div className="glass-soft p-3.5 mb-4 text-[13px] text-amber-700">
          尚未配置 API Key，请先到「设置」中填入。
        </div>
      )}

      <div
        className={`rounded-[10px] p-7 mb-4 border-[1.5px] border-dashed transition cursor-pointer ${
          drag
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-white dark:bg-[#121215]'
        }`}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-zinc-50 dark:bg-[#18181c] text-zinc-400 dark:text-zinc-500 shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">点击选择，或拖入音频文件</div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">支持 wav / mp3 / m4a / ogg / aac / pcm</div>
          </div>
        </div>

        {preview && (
          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-[13px] mb-2">
              <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[60%]">{preview.name}</span>
              <span className={`chip ${tooBig ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                {preview.size ? `${preview.size > 1024 * 1024 ? (preview.size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(preview.size / 1024) + ' KB'}` : ''}
                {duration ? ` · ${duration.toFixed(1)}s` : ''}
              </span>
            </div>
            <audio controls src={preview.src} className="h-9 w-full" />
            {tooBig && <div className="text-rose-600 text-xs mt-2">文件过大，请控制在 10MB 以内。</div>}
          </div>
        )}
      </div>

      <div className="mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">音色名称（可选，用于显示）</label>
            <input
              className="glass-input w-full"
              placeholder="例如：我的声音"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">复刻语种</label>
            <select className="glass-input w-full" value={language} onChange={(e) => setLanguage(Number(e.target.value))}>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
          <input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} className="w-4 h-4" />
          <span className="text-[13px] text-zinc-700">启用音频降噪</span>
        </label>
      </div>

      <button className="btn-primary !h-10 !px-6 !text-sm w-full" onClick={start} disabled={busy || !hasKey}>
        {busy ? '复刻任务提交中…' : '开始复刻'}
      </button>

      <p className="text-[11px] text-zinc-400 mt-3 text-center leading-relaxed">
        复刻后的音色为后付费音色：训练与试听阶段免费，首次正式合成时才收取音色槽位费
      </p>
    </div>
  );
}
