import { useState, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { FORMATS, SAMPLE_RATES, formatBytes, voiceReady } from '../lib/format';
import { OFFICIAL_VOICES, officialVoiceById } from '../lib/officialVoices';
import AudioPlayer from './AudioPlayer';

/* 圆形试听按钮 */
function PreviewDot({
  active,
  loading,
  onClick,
}: {
  active: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <span
      role="button"
      className={`ml-1.5 h-5 w-5 rounded-full text-[9px] inline-flex items-center justify-center shrink-0 select-none cursor-pointer transition ${
        active
          ? 'bg-blue-600 text-white'
          : loading
          ? 'bg-zinc-100 text-zinc-400'
          : 'bg-zinc-100 text-zinc-400 hover:bg-blue-50 hover:text-blue-600'
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

export default function Synthesize() {
  const {
    settings,
    selectedVoiceId,
    officialVoiceId,
    setSelectedVoice,
    setOfficialVoice,
    synth,
    setSynth,
    addLibrary,
    showToast,
    setTab,
  } = useStore();

  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState(selectedVoiceId ?? '');
  const [format, setFormat] = useState(settings?.defaultFormat ?? 'mp3');
  const [sampleRate, setSampleRate] = useState(settings?.defaultSampleRate ?? 24000);
  const [speed, setSpeed] = useState(settings?.speed ?? 1);
  const [volume, setVolume] = useState(settings?.volume ?? 1);
  const [emotion, setEmotion] = useState('');
  const [pitch, setPitch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [result, setResult] = useState<{ path: string; format: string; voiceName: string; voiceId: string; text: string; size: number } | null>(null);

  // ---- 试听状态 ----
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
  const voices = settings.voices;
  const myCurrent = voices.find((v) => v.id === (voiceId || selectedVoiceId));
  const effectiveVoiceId = officialVoiceId || myCurrent?.id || voiceId || selectedVoiceId || '';
  const isOfficial = Boolean(officialVoiceId);
  const officialName = officialVoiceById(officialVoiceId)?.name ?? officialVoiceId;

  const start = async () => {
    if (!effectiveVoiceId) {
      showToast('请先选择音色', 'err');
      return;
    }
    if (!text.trim()) {
      showToast('请输入要合成的文本', 'err');
      return;
    }
    setBusy(true);
    setSynth({ active: true, pct: 0, stage: 'streaming', voiceName: isOfficial ? officialName : myCurrent?.name });
    try {
      const res = await api.synthesize({
        speakerId: effectiveVoiceId,
        text: text.trim(),
        format,
        sampleRate,
        speed,
        volume,
        pitch,
        emotion: emotion.trim() || undefined,
        official: isOfficial,
      });
      const item = {
        id: res.fileId,
        text: text.trim(),
        path: res.path,
        voiceName: isOfficial ? officialName : (myCurrent?.name ?? effectiveVoiceId),
        voiceId: effectiveVoiceId,
        format: res.format,
        size: res.size,
        createdAt: Date.now(),
      };
      addLibrary(item);
      setResult(item);
    } catch (e: any) {
      showToast(e?.message || '合成失败', 'err');
      setSynth({ active: false, pct: 0, stage: '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="flex items-center justify-between">
          <h2 className="page-title">语音合成</h2>
          <button className="btn-ghost !h-8 !text-xs" onClick={() => setTab('library')}>音频库 →</button>
        </div>
        <p className="page-desc">选择音色，输入文本，一键生成可试听、可下载的音频</p>
      </div>

      {voices.length === 0 && !officialVoiceId && (
        <div className="glass-soft p-4 mb-5 text-[13px] text-zinc-600 flex items-center justify-between">
          <span className="text-amber-700">还没有可用音色，可选择上方「官方音色」或先去复刻/导入。</span>
          <button className="btn-ghost !h-8 !text-xs" onClick={() => setTab('voices')}>去音色库</button>
        </div>
      )}

      {/* 音色选择：我的音色 + 官方音色并排 */}
      <div className="flex flex-col lg:flex-row gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] font-medium text-zinc-900">我的音色</span>
            {myCurrent && <span className="text-[11px] text-zinc-400 font-mono">{myCurrent.id}</span>}
          </div>
          {voices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {voices.map((v) => {
                const active = !isOfficial && v.id === effectiveVoiceId;
                return (
                  <button
                    key={v.id}
                    className={`h-8 pl-3 pr-2 rounded-full text-[13px] border transition select-none inline-flex items-center ${
                      active
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                        : voiceReady(v)
                        ? 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                        : 'border-dashed border-zinc-200 bg-white text-zinc-400'
                    }`}
                    onClick={() => {
                      setVoiceId(v.id);
                      setSelectedVoice(v.id);
                      setOfficialVoice('');
                    }}
                    disabled={!voiceReady(v)}
                    title={voiceReady(v) ? '' : '该音色尚未就绪'}
                  >
                    <span>{v.name}</span>
                    {voiceReady(v) && (
                      <PreviewDot
                        active={previewId === v.id}
                        loading={previewLoading === v.id}
                        onClick={() => preview(v.id, false)}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-[13px] text-zinc-400">暂无音色</div>
          )}
        </div>

        <div className="w-full lg:w-64 shrink-0">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] font-medium text-zinc-900">官方音色</span>
            {officialVoiceId && (
              <button
                className="text-[11px] text-zinc-400 hover:text-zinc-600"
                onClick={() => setOfficialVoice('')}
              >
                清除
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="glass-input flex-1"
              value={officialVoiceId}
              onChange={(e) => {
                const id = e.target.value;
                setOfficialVoice(id);
                if (id) setVoiceId('');
              }}
            >
              <option value="">不使用官方音色</option>
              {OFFICIAL_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.gender}{v.tag ? ` · ${v.tag}` : ''}
                </option>
              ))}
            </select>
            {officialVoiceId && (
              <PreviewDot
                active={previewId === officialVoiceId}
                loading={previewLoading === officialVoiceId}
                onClick={() => preview(officialVoiceId, true)}
              />
            )}
          </div>
          {officialVoiceId && (
            <div className="mt-1.5 text-[11px] text-zinc-400 font-mono truncate">{officialVoiceId}</div>
          )}
        </div>
      </div>

      {/* 文本输入 */}
      <div className="mb-2">
        <textarea
          className="glass-input w-full min-h-[180px] h-64 resize-y text-[14px] leading-relaxed"
          placeholder="输入要转为语音的文字…（可拖动右下角调节高度）"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') start();
          }}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-zinc-400">Ctrl + Enter 快速合成</span>
          <span className="text-[11px] text-zinc-400">{text.length} 字</span>
        </div>
      </div>

      {/* 高级参数：默认展开 */}
      <div className="mb-5">
        <button
          className="text-[12px] text-zinc-400 hover:text-zinc-600 transition flex items-center gap-1"
          onClick={() => setShowAdvanced((s) => !s)}
        >
          <span className={`inline-block transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>›</span>
          高级参数（格式 / 采样率 / 语速 / 音量 / 情感）
        </button>
        {showAdvanced && (
          <div className="glass-soft p-4 mt-2 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">音频格式</label>
                <select className="glass-input w-full" value={format} onChange={(e) => setFormat(e.target.value as 'mp3' | 'wav' | 'ogg_opus' | 'pcm')}>
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">采样率</label>
                <select className="glass-input w-full" value={sampleRate} onChange={(e) => setSampleRate(Number(e.target.value))}>
                  {SAMPLE_RATES.map((s) => (
                    <option key={s} value={s}>{s} Hz</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">语速 <span className="text-zinc-900 font-medium">{speed.toFixed(1)}x</span></label>
                <input type="range" min={0.5} max={2} step={0.1} value={speed} className="w-full" onChange={(e) => setSpeed(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">音量 <span className="text-zinc-900 font-medium">{volume.toFixed(1)}x</span></label>
                <input type="range" min={0.5} max={2} step={0.1} value={volume} className="w-full" onChange={(e) => setVolume(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label">
                音调 <span className="text-zinc-900 font-medium">{pitch > 0 ? `+${pitch}` : pitch}</span>
                <span className="text-[11px] text-zinc-400 font-normal ml-2">仅部分音色支持，0 为默认</span>
              </label>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={pitch}
                className="w-full"
                onChange={(e) => setPitch(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">情感（可选，部分音色支持）</label>
              <input
                className="glass-input w-full"
                list="emotion-list"
                placeholder="如 happy / angry / sad"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
              />
              <datalist id="emotion-list">
                {['happy', 'angry', 'sad', 'fearful', 'surprised', 'neutral', 'calm', 'disgusted', 'annoyed', 'worried', 'excited', 'depressed'].map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
          </div>
        )}
      </div>

      {/* 主操作 */}
      <button className="btn-primary !h-10 !px-6 !text-sm w-full" onClick={start} disabled={busy || !effectiveVoiceId}>
        {busy ? '合成中…' : '开始合成'}
      </button>

      {(busy || synth.active) && (
        <div className="mt-5">
          <div className="flex justify-between text-[11px] text-zinc-400 mb-1.5">
            <span>正在生成音频…</span>
            <span>{synth.pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${synth.pct}%` }} />
          </div>
        </div>
      )}

      {result && !busy && (
        <div className="mt-5 pt-5 border-t border-zinc-100">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[13px] font-medium text-zinc-900">{result.voiceName}</span>
            <span className="text-[11px] text-zinc-400">
              {result.format.toUpperCase()} · {formatBytes(result.size)}
            </span>
          </div>
          <AudioPlayer path={result.path} downloadName={`jaygo_${result.voiceId}_${Date.now()}.${result.format === 'ogg_opus' ? 'ogg' : result.format}`} />
          <div className="text-xs text-zinc-400 mt-3 line-clamp-2">“{result.text}”</div>
        </div>
      )}
    </div>
  );
}
