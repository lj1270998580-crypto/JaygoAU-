import { useState, useRef } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { FORMATS, SAMPLE_RATES, formatBytes } from '../lib/format';
import { officialVoiceById } from '../lib/officialVoices';
import AudioPlayer from './AudioPlayer';
import VoicePickerModal from './VoicePickerModal';

const SAMPLE_TEXTS = [
  '你好！欢迎使用 Jaygo AU，体验火山引擎豆包超高清超拟真语音合成。',
  '人工智能正在重塑每一个行业的生产力，从文字创意到声音表达，技术让想象力触手可及。',
  '山随平野尽，江入大荒流。月下飞天镜，云生结海楼。渡远荆门外，来从楚国游。',
];

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
  const [format, setFormat] = useState(settings?.defaultFormat ?? 'mp3');
  const [sampleRate, setSampleRate] = useState(settings?.defaultSampleRate ?? 24000);
  const [speed, setSpeed] = useState(settings?.speed ?? 1);
  const [volume, setVolume] = useState(settings?.volume ?? 1);
  const [emotion, setEmotion] = useState('');
  const [pitch, setPitch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // ---- 试听状态 ----
  const [previewing, setPreviewing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [result, setResult] = useState<{
    path: string;
    format: string;
    voiceName: string;
    voiceId: string;
    text: string;
    size: number;
  } | null>(null);

  if (!settings) return null;

  const voices = settings.voices || [];
  const myCurrent = voices.find((v) => v.id === selectedVoiceId);
  const isOfficial = Boolean(officialVoiceId) || (!myCurrent && voices.length === 0);
  const effectiveVoiceId = officialVoiceId || myCurrent?.id || selectedVoiceId || (voices[0]?.id ?? 'zh_female_vv_uranus_bigtts');
  const officialInfo = officialVoiceById(isOfficial ? (officialVoiceId || effectiveVoiceId) : officialVoiceId);
  const currentVoiceName = isOfficial
    ? (officialInfo?.name ?? (effectiveVoiceId === 'zh_female_vv_uranus_bigtts' ? 'Vivi 2.0' : effectiveVoiceId))
    : (myCurrent?.name ?? effectiveVoiceId);

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPreviewing(false);
  };

  const togglePreview = async () => {
    if (previewing) {
      stopPreview();
      return;
    }
    if (!effectiveVoiceId) {
      showToast('请先选择音色', 'err');
      return;
    }
    stopPreview();
    setPreviewLoading(true);
    try {
      const res = await api.previewVoice({ speakerId: effectiveVoiceId, official: isOfficial });
      const data = await api.readAudio(res.path);
      const a = new Audio(data);
      audioRef.current = a;
      a.onended = () => setPreviewing(false);
      a.onerror = () => setPreviewing(false);
      await a.play();
      setPreviewing(true);
    } catch (e: any) {
      showToast(e?.message || '试听失败', 'err');
      setPreviewing(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSelectVoice = (id: string, official: boolean) => {
    stopPreview();
    if (official) {
      setOfficialVoice(id);
      setSelectedVoice('');
    } else {
      setSelectedVoice(id);
      setOfficialVoice('');
    }
  };

  const start = async () => {
    if (!effectiveVoiceId) {
      showToast('请先选择音色', 'err');
      setIsPickerOpen(true);
      return;
    }
    if (!text.trim()) {
      showToast('请输入要合成的文本', 'err');
      return;
    }
    stopPreview();
    setBusy(true);
    setSynth({
      active: true,
      pct: 0,
      stage: 'streaming',
      voiceName: currentVoiceName,
    });

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
        voiceName: currentVoiceName,
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

  const fillSample = () => {
    const r = SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)];
    setText(r);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-6 animate-fade-in">
      {/* 顶部标题区 */}
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-100 dark:border-zinc-800/80">
        <div>
          <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-white leading-tight">语音合成工作台</h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            高拟真豆包大模型语音合成，支持音色切换、语速情感微调与流式生成
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab('voices')}
            className="btn-ghost !h-8 !px-3 !text-xs rounded-lg flex items-center gap-1.5"
          >
            <span>音色库</span>
          </button>
          <button
            onClick={() => setTab('library')}
            className="btn-ghost !h-8 !px-3 !text-xs rounded-lg flex items-center gap-1.5"
          >
            <span>音频库 →</span>
          </button>
        </div>
      </div>

      {/* 双栏工作区 */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* 左侧：核心脚本编辑区 + 常驻操作与播放 */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          {/* 文本卡片 */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-[#121215] shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50/70 dark:bg-[#16161a] border-b border-zinc-100 dark:border-zinc-800/80 text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <span>📝</span> 配音文案
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fillSample}
                  className="text-zinc-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition"
                  title="随机填入一段示范文本"
                >
                  填入示例
                </button>
                {text && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <button
                      type="button"
                      onClick={() => setText('')}
                      className="text-zinc-400 hover:text-rose-600 transition"
                    >
                      清空
                    </button>
                  </>
                )}
              </div>
            </div>

            <textarea
              className="w-full p-4 min-h-[280px] h-[340px] resize-y text-[14px] leading-relaxed text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 outline-none border-0 focus:ring-0 bg-transparent font-normal"
              placeholder="在此输入要转为语音的文本...（支持快捷键 Ctrl + Enter 一键合成）"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') start();
              }}
            />

            <div className="flex items-center justify-between px-4 py-2 bg-zinc-50/40 dark:bg-[#16161a]/60 border-t border-zinc-100 dark:border-zinc-800/80 text-[11px] text-zinc-400 dark:text-zinc-500">
              <span>快捷键：Ctrl + Enter 触发合成</span>
              <span className="font-mono">{text.length} 字</span>
            </div>
          </div>

          {/* 生成主操作与播放栏 */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-[#121215] p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-primary !h-11 !px-6 !text-[13.5px] rounded-lg font-medium flex-1 shadow-md shadow-blue-500/10 flex items-center justify-center gap-2"
                onClick={start}
                disabled={busy || !text.trim()}
              >
                {busy ? (
                  <>
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>正在合成语音…</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>开始合成音频 (Ctrl + Enter)</span>
                  </>
                )}
              </button>
            </div>

            {/* 流式生成进度 */}
            {(busy || synth.active) && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                    火山引擎语音大模型流式传输中...
                  </span>
                  <span>{synth.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-150"
                    style={{ width: `${Math.max(8, synth.pct)}%` }}
                  />
                </div>
              </div>
            )}

            {/* 最新生成结果播放器 */}
            {result && !busy && (
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    已生成：{result.voiceName}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-500 font-mono">
                    {result.format.toUpperCase()} · {formatBytes(result.size)}
                  </span>
                </div>
                <AudioPlayer
                  path={result.path}
                  downloadName={`jaygo_${result.voiceId}_${Date.now()}.${result.format === 'ogg_opus' ? 'ogg' : result.format}`}
                  autoPlay
                />
              </div>
            )}
          </div>
        </div>

        {/* 右侧：检查器面板 (音色与参数设置) */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
          {/* 当前音色卡片 */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-[#121215] p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">当前配音音色</span>
              <button
                type="button"
                onClick={() => setIsPickerOpen(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium hover:underline flex items-center gap-0.5"
              >
                切换音色 ⮑
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-[#16161a] border border-zinc-200/70 dark:border-zinc-800">
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold shadow-xs ${
                  isOfficial
                    ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white'
                    : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
                }`}
              >
                {isOfficial ? (officialInfo?.gender === '女' ? '♀' : '♂') : '🎙️'}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {currentVoiceName || '未选择音色'}
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                  {isOfficial ? (officialInfo?.tag || '官方音色') : '我的克隆声音'}
                </div>
              </div>

              <button
                type="button"
                onClick={togglePreview}
                disabled={previewLoading || !effectiveVoiceId}
                className={`grid h-8 w-8 place-items-center rounded-full transition shrink-0 ${
                  previewing
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-[#1c1c22] text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-500 hover:text-blue-600'
                }`}
                title={previewing ? '停止试听' : '试听当前音色'}
              >
                {previewLoading ? (
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : previewing ? (
                  <span className="text-[10px]">■</span>
                ) : (
                  <span className="text-[11px] translate-x-0.5">▶</span>
                )}
              </button>
            </div>
          </div>

          {/* 声音调节面板 */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-[#121215] p-4 shadow-sm space-y-4 text-xs">
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 pb-1 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <span>声音微调</span>
              <button
                type="button"
                onClick={() => {
                  setSpeed(1.0);
                  setVolume(1.0);
                  setPitch(0);
                  setEmotion('');
                }}
                className="text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 font-normal"
              >
                重置默认
              </button>
            </div>

            {/* 语速 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                <span>语速 (Speed)</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* 音量 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                <span>音量 (Volume)</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{volume.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* 音调 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                <span>音调 (Pitch)</span>
                <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{pitch > 0 ? `+${pitch}` : pitch}</span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* 情感 */}
            <div className="space-y-1.5">
              <label className="text-zinc-600 dark:text-zinc-400 block">情感色彩（部分音色支持）</label>
              <input
                className="glass-input w-full !h-8 text-xs font-mono"
                list="emotion-tags"
                placeholder="如 happy / sad / excited"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
              />
              <datalist id="emotion-tags">
                {[
                  'happy',
                  'angry',
                  'sad',
                  'fearful',
                  'surprised',
                  'neutral',
                  'calm',
                  'disgusted',
                  'annoyed',
                  'worried',
                  'excited',
                  'depressed',
                ].map((em) => (
                  <option key={em} value={em} />
                ))}
              </datalist>
            </div>
          </div>

          {/* 音频规格 */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-[#121215] p-4 shadow-sm space-y-3 text-xs">
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 pb-1 border-b border-zinc-100 dark:border-zinc-800">音频参数</div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-500 dark:text-zinc-400 mb-1 block">导出格式</label>
                <select
                  className="glass-input w-full !h-8 text-xs"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as any)}
                >
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-500 dark:text-zinc-400 mb-1 block">采样率</label>
                <select
                  className="glass-input w-full !h-8 text-xs"
                  value={sampleRate}
                  onChange={(e) => setSampleRate(Number(e.target.value))}
                >
                  {SAMPLE_RATES.map((s) => (
                    <option key={s} value={s}>
                      {s} Hz
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 音色选择弹窗 */}
      <VoicePickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleSelectVoice}
        currentVoiceId={effectiveVoiceId}
      />
    </div>
  );
}
