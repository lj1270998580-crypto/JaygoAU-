import { useEffect, useState, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';

interface Utterance {
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
}

interface Paragraph {
  speaker?: string;
  startTime: number;
  endTime: number;
  text: string;
}

const ASR_PRICE_PER_HOUR = 0.8;

function fmtDuration(ms: number) {
  if (!ms) return '未知';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}分${r}秒` : `${r}秒`;
}

function fmtSec(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = Math.floor(ms % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function buildSrt(utterances: Utterance[]): string {
  return utterances
    .map((u, idx) => {
      const start = formatSrtTime(u.startTime);
      const end = formatSrtTime(u.endTime);
      const prefix = u.speaker ? `[说话人 ${u.speaker}] ` : '';
      return `${idx + 1}\n${start} --> ${end}\n${prefix}${u.text}\n`;
    })
    .join('\n');
}

function buildSpeakerText(utterances: Utterance[]): string {
  const lines: string[] = [];
  let curSpeaker = '';
  let curSegs: string[] = [];
  for (const u of utterances) {
    const spk = u.speaker ? `说话人 ${u.speaker}` : '发言';
    if (spk !== curSpeaker) {
      if (curSegs.length) lines.push(`[${curSpeaker}]\n${curSegs.join('')}`);
      curSpeaker = spk;
      curSegs = [u.text];
    } else {
      curSegs.push(u.text);
    }
  }
  if (curSegs.length) lines.push(`[${curSpeaker}]\n${curSegs.join('')}`);
  return lines.join('\n\n');
}

// 智能分句提取与降级自愈（如遇服务端未下发分句，自动按标点与时长断句，保障时间轴与分段绝不空白）
function getEffectiveUtterances(result: { text: string; utterances: Utterance[]; durationMs: number } | null): Utterance[] {
  if (!result) return [];
  if (Array.isArray(result.utterances) && result.utterances.length > 0) {
    return result.utterances;
  }
  const raw = (result.text || '').trim();
  if (!raw) return [];

  // 按标点切句，保留标点
  const parts = raw.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g) || [raw];
  const dur = result.durationMs > 0 ? result.durationMs : parts.length * 3000;
  const totalChars = Math.max(1, raw.length);

  let curTime = 0;
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const segDur = Math.max(800, Math.round((p.length / totalChars) * dur));
      const start = curTime;
      const end = Math.min(dur, start + segDur);
      curTime = end;
      return {
        text: p,
        startTime: start,
        endTime: end,
      };
    });
}

// 智能分段聚类
function clusterParagraphs(utterances: Utterance[]): Paragraph[] {
  if (!utterances || utterances.length === 0) return [];
  const paragraphs: Paragraph[] = [];
  let curPara: Paragraph = {
    speaker: utterances[0].speaker,
    startTime: utterances[0].startTime,
    endTime: utterances[0].endTime,
    text: utterances[0].text,
  };

  for (let i = 1; i < utterances.length; i++) {
    const u = utterances[i];
    const prev = utterances[i - 1];
    const isSameSpeaker = (u.speaker || '') === (curPara.speaker || '');
    const pauseTime = u.startTime - prev.endTime;

    // 同一说话人且停顿小于 2 秒，且段落长度不超过 260 字，聚合为段落
    if (isSameSpeaker && pauseTime < 2000 && curPara.text.length < 260) {
      curPara.endTime = u.endTime;
      curPara.text += u.text;
    } else {
      paragraphs.push(curPara);
      curPara = {
        speaker: u.speaker,
        startTime: u.startTime,
        endTime: u.endTime,
        text: u.text,
      };
    }
  }
  paragraphs.push(curPara);
  return paragraphs;
}

// 说话人颜色调色板
const SPEAKER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '0': { bg: 'bg-blue-50 dark:bg-blue-950/60', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  '1': { bg: 'bg-emerald-50 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  '2': { bg: 'bg-purple-50 dark:bg-purple-950/60', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  '3': { bg: 'bg-amber-50 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
};

function getSpeakerStyle(speaker?: string) {
  if (!speaker) return { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', border: 'border-zinc-200 dark:border-zinc-700' };
  return SPEAKER_COLORS[speaker] || { bg: 'bg-indigo-50 dark:bg-indigo-950/60', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' };
}

export default function Transcribe() {
  const { settings, hasKey, patchSettings, showToast, pendingTranscribe, setPendingTranscribe } = useStore();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<{ text: string; utterances: Utterance[]; durationMs: number } | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'paragraphs' | 'doc'>('paragraphs');
  const [copied, setCopied] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [linkInput, setLinkInput] = useState('');
  const [linkExtracting, setLinkExtracting] = useState(false);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  useEffect(() => {
    const off = api.onTranscribeStatus((msg) => setStatus(msg));
    return off;
  }, []);

  const isVideo = (path: string) => /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(path);

  const mediaUrl = useMemo(() => {
    if (!filePath) return '';
    return `file:///${filePath.replace(/\\/g, '/')}`;
  }, [filePath]);

  const startTranscribeWithFile = async (targetPath: string) => {
    if (!hasKey) {
      showToast('请先在「设置」中填写 API Key', 'err');
      return;
    }
    if (!targetPath) {
      showToast('请先选择音视频文件', 'err');
      return;
    }
    setBusy(true);
    setStatus('准备中…');
    setResult(null);
    try {
      const r = await api.transcribe({ filePath: targetPath, enableSpeakerInfo: settings?.enableSpeakerInfo ?? false });
      setResult(r);
      const effective = getEffectiveUtterances(r);
      setViewMode(effective.length > 0 ? 'paragraphs' : 'doc');
      setStatus('转录完成');
      showToast('转录完成', 'ok');
      api.showNotification?.({
        title: '📝 视音频转录已完成',
        body: '识别文本与说话人时间轴已提取完毕，点击前往查看与导出',
        tab: 'transcribe',
      });
    } catch (e: any) {
      setStatus('');
      showToast(e?.message || '转录失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  // 监听来自其他模块（如媒体提取器）的一键转录请求
  useEffect(() => {
    if (pendingTranscribe) {
      const { filePath: p, fileName: n, autoStart } = pendingTranscribe;
      setPendingTranscribe(null);
      setFilePath(p);
      setFileName(n);
      setResult(null);
      if (autoStart) {
        startTranscribeWithFile(p);
      }
    }
  }, [pendingTranscribe]);

  if (!settings) return null;

  const pick = async () => {
    const p = await api.pickMediaFile();
    if (p) {
      setFilePath(p);
      setFileName(p.split(/[\\/]/).pop() || '');
      setResult(null);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const p = api.getPathForFile ? api.getPathForFile(f) : (f as any).path || f.name;
    setFilePath(p);
    setFileName(f.name);
    setFileSize(f.size || null);
    setResult(null);
  };

  const start = async () => {
    if (filePath) {
      await startTranscribeWithFile(filePath);
    } else {
      showToast('请先选择音视频文件或输入链接', 'err');
    }
  };

  // 直接解析短视频链接并全自动提取转录
  const extractAndTranscribeLink = async () => {
    const raw = linkInput.trim();
    if (!raw) {
      showToast('请先粘贴短视频/媒体链接', 'err');
      return;
    }
    if (!hasKey) {
      showToast('请先在「设置」中填写 API Key', 'err');
      return;
    }

    setLinkExtracting(true);
    setBusy(true);
    setStatus('正在解析短视频链接…');
    setResult(null);

    try {
      const media = await api.extractMedia(raw);
      setStatus(`已解析「${media.platformName}」: ${media.title.slice(0, 15)}… 正在提取原声`);
      const extracted = await api.extractMediaForTranscribe({ mediaInfo: media });
      setFilePath(extracted.filePath);
      setFileName(extracted.fileName);
      setLinkInput('');

      // 启动 ASR 大模型识别
      setStatus('正在提交火山引擎大模型识别…');
      await startTranscribeWithFile(extracted.filePath);
    } catch (err: any) {
      setStatus('');
      showToast(err?.message || '短视频解析或提取失败', 'err');
      setBusy(false);
    } finally {
      setLinkExtracting(false);
    }
  };

  // 跳转并播放
  const seekTo = (ms: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = Math.max(0, ms / 1000 - 0.2);
      mediaRef.current.play().catch(() => {});
    }
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (mediaRef.current) {
      mediaRef.current.playbackRate = rate;
    }
  };

  const effectiveUtterances = useMemo(() => {
    return getEffectiveUtterances(result);
  }, [result]);

  const hasUtterances = effectiveUtterances.length > 0;
  const fallbackText = effectiveUtterances.length ? effectiveUtterances.map((u) => u.text).join('') : '';
  const pureText = result ? (result.text || fallbackText) : '';
  const speakerFormattedText = hasUtterances ? buildSpeakerText(effectiveUtterances) : pureText;
  const paragraphs = useMemo(() => {
    return clusterParagraphs(effectiveUtterances);
  }, [effectiveUtterances]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('已复制到剪贴板', 'ok');
    } catch {
      showToast('复制失败，请手动选择文本', 'err');
    }
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`已导出 ${filename}`, 'ok');
    } catch {
      showToast('保存失败', 'err');
    }
  };

  const exportSrt = () => {
    if (!effectiveUtterances.length) {
      showToast('无可用时间轴分句，无法导出 SRT', 'err');
      return;
    }
    const srt = buildSrt(effectiveUtterances);
    const base = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'transcript';
    downloadFile(srt, `${base}_${Date.now()}.srt`, 'text/plain;charset=utf-8');
  };

  const exportTxt = () => {
    const textToExport = viewMode === 'timeline' && hasUtterances ? speakerFormattedText : pureText;
    const base = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'transcript';
    downloadFile(textToExport, `${base}_${Date.now()}.txt`, 'text/plain;charset=utf-8');
  };

  const hours = result ? result.durationMs / 3600000 : 0;
  const cost = (hours * ASR_PRICE_PER_HOUR).toFixed(2);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-fade-in text-zinc-900 dark:text-zinc-100">
      {/* 头部导航与功能简介 */}
      <div className="pb-4 mb-5 border-b border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-white leading-tight flex items-center gap-2">
            <span>🎥</span>
            <span>视音频转录工作台</span>
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            火山引擎 Seed-ASR 2.0 大模型音视频识别 · 智能分段排版 · 角色分离 · 联动音视频同步对照
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/60 font-medium">
            ASR 2.0 大模型 · 约 ¥0.80/小时
          </span>
        </div>
      </div>

      {!hasKey && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/40 p-3.5 mb-5 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <span>⚠️</span>
          <span>尚未配置 API Key，请先到「设置」填写，否则无法调用云端转录接口。</span>
        </div>
      )}

      {/* 双栏工作区 */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* 左栏：媒体控制台 (380px) */}
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
          {/* 在线短视频/媒体链接直接转录 */}
          <div className="rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                <span>🔗</span>
                <span>短视频 / 网络链接直接转录</span>
              </span>
              <span className="text-[10.5px] text-blue-600 dark:text-blue-400 font-medium">
                抖音 · B站 · 快手 · 小红书
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    extractAndTranscribeLink();
                  }
                }}
                placeholder="粘贴分享口令或作品链接…"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <button
                type="button"
                disabled={linkExtracting || !linkInput.trim()}
                onClick={() => extractAndTranscribeLink()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition shrink-0 flex items-center gap-1 shadow-xs"
              >
                {linkExtracting ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>提取中…</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>提取转录</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 my-0.5">
            <div className="h-px flex-1 bg-zinc-200/80 dark:bg-zinc-800/80" />
            <span className="text-[11px] text-zinc-400">或选择本地文件</span>
            <div className="h-px flex-1 bg-zinc-200/80 dark:bg-zinc-800/80" />
          </div>

          {/* 文件选择 / 上传卡片 */}
          <div
            className={`rounded-xl p-4 border-2 border-dashed transition cursor-pointer ${
              drag
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : filePath
                ? 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-[#141418]'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-[#141418]'
            }`}
            onClick={pick}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0 text-lg">
                  {filePath ? (isVideo(filePath) ? '🎬' : '🎵') : '📥'}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {filePath ? fileName : '选择或拖入音视频文件'}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                    {filePath ? '点击可更换文件' : '支持 MP4, MOV, MP3, WAV, M4A 等'}
                  </div>
                </div>
              </div>

              {filePath && (
                <button
                  type="button"
                  className="text-xs text-zinc-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilePath(null);
                    setFileName('');
                    setResult(null);
                  }}
                  title="清除文件"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* 媒体播放与预览器 */}
          {filePath && (
            <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-[#141418] p-3.5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <span>📺</span>
                  <span>媒体同步预览</span>
                </span>

                {/* 倍速切换胶囊 */}
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-md">
                  {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => changePlaybackRate(rate)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                        playbackRate === rate
                          ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {/* 播放器实体 */}
              <div className="rounded-lg overflow-hidden bg-black/90 flex flex-col items-center justify-center">
                {isVideo(filePath) ? (
                  <video
                    ref={mediaRef as React.RefObject<HTMLVideoElement>}
                    src={mediaUrl}
                    controls
                    className="w-full max-h-[220px] object-contain"
                  />
                ) : (
                  <div className="w-full p-4 flex flex-col items-center gap-3 bg-gradient-to-b from-zinc-900 to-black">
                    <div className="flex items-center gap-2 text-zinc-300 text-xs font-mono truncate max-w-full">
                      <span className="animate-pulse text-blue-400">♬</span>
                      <span className="truncate">{fileName}</span>
                    </div>
                    <audio
                      ref={mediaRef as React.RefObject<HTMLAudioElement>}
                      src={mediaUrl}
                      controls
                      className="w-full h-8"
                    />
                  </div>
                )}
              </div>

              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed bg-zinc-50 dark:bg-[#1a1a20] p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/80">
                💡 <span className="font-medium text-zinc-600 dark:text-zinc-300">时间轴联动：</span>
                点击右侧转录结果中的任意时间戳，播放器将自动精准跳转到对应位置！
              </div>
            </div>
          )}

          {/* 转录配置与操作卡片 */}
          <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-[#141418] p-4 shadow-sm space-y-4">
            <div>
              <div className="text-xs font-semibold text-zinc-900 dark:text-white mb-2">转录识别参数</div>
              <label className="flex items-start gap-2.5 cursor-pointer select-none text-xs text-zinc-700 dark:text-zinc-300 p-2.5 rounded-lg bg-zinc-50 dark:bg-[#1a1a20] border border-zinc-200/60 dark:border-zinc-800">
                <input
                  type="checkbox"
                  checked={settings.enableSpeakerInfo ?? false}
                  onChange={(e) => patchSettings({ enableSpeakerInfo: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <div className="leading-snug">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">开启说话人角色分离</div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    自动识别人声发言并区分说话人 0、1、2...（适用于访谈、会议与播客）
                  </div>
                </div>
              </label>
            </div>

            <button
              type="button"
              className="btn-primary !h-10 w-full !text-xs rounded-lg font-medium shadow-md shadow-blue-500/10 flex items-center justify-center gap-2"
              onClick={start}
              disabled={busy || !filePath}
            >
              {busy ? (
                <>
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>{status || '正在转录识别中…'}</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>开始转录识别</span>
                </>
              )}
            </button>

            {result && (
              <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                <div className="font-medium flex items-center justify-between">
                  <span>✓ 转录已完成</span>
                  <span className="font-mono">{fmtDuration(result.durationMs)}</span>
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                  <span>预估费用</span>
                  <span className="font-semibold">¥{cost} 元</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右栏：识别结果排版工作区 (flex-1) */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          {!result && !busy && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141418] p-12 text-center shadow-sm">
              <div className="text-4xl mb-3">📄</div>
              <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">等待开始转录</div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto mb-4 leading-relaxed">
                在左侧选择本地视音频文件后点击「开始转录」，结果将在此以智能分段排版呈现，并支持一键导出 SRT 字幕与文本。
              </p>
              <button
                type="button"
                onClick={pick}
                className="btn-primary !h-8 !px-4 !text-xs rounded-lg"
              >
                选择音视频文件
              </button>
            </div>
          )}

          {busy && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141418] p-12 text-center shadow-sm space-y-4">
              <div className="grid h-12 w-12 mx-auto place-items-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <span className="inline-block h-6 w-6 rounded-full border-3 border-current border-t-transparent animate-spin" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {status || '正在进行语音识别与分句处理…'}
                </div>
                <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                  采用火山引擎大模型 ASR 接口，支持快速流式处理与高精准度标点预测
                </div>
              </div>
            </div>
          )}

          {result && !busy && (
            <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white dark:bg-[#141418] shadow-sm overflow-hidden animate-fade-in flex flex-col">
              {/* 头部工具栏与模式切换 */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-zinc-50/70 dark:bg-[#18181e] border-b border-zinc-100 dark:border-zinc-800">
                {/* 视图排版模式 */}
                <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#202028] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('paragraphs')}
                    className={`px-3 py-1 rounded-md transition flex items-center gap-1 ${
                      viewMode === 'paragraphs'
                        ? 'bg-blue-600 text-white font-medium shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <span>📄 智能分段</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('timeline')}
                    className={`px-3 py-1 rounded-md transition flex items-center gap-1 ${
                      viewMode === 'timeline'
                        ? 'bg-blue-600 text-white font-medium shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <span>💬 对话时间轴</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('doc')}
                    className={`px-3 py-1 rounded-md transition flex items-center gap-1 ${
                      viewMode === 'doc'
                        ? 'bg-blue-600 text-white font-medium shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <span>📝 纯文本</span>
                  </button>
                </div>

                {/* 导出与复制工具按钮 */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copy(viewMode === 'timeline' && hasUtterances ? speakerFormattedText : pureText)}
                    className={`btn-ghost !h-7 !px-2.5 !text-xs rounded-md transition ${
                      copied ? '!border-emerald-300 !text-emerald-700 !bg-emerald-50 dark:!bg-emerald-950/50' : ''
                    }`}
                  >
                    {copied ? '✓ 已复制全文' : '复制全文'}
                  </button>

                  <button
                    type="button"
                    onClick={exportTxt}
                    className="btn-ghost !h-7 !px-2.5 !text-xs rounded-md"
                    title="导出纯文本 .txt 文件"
                  >
                    导出 TXT
                  </button>

                  {hasUtterances && (
                    <button
                      type="button"
                      onClick={exportSrt}
                      className="btn-primary !h-7 !px-3 !text-xs rounded-md shadow-xs bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1 font-medium"
                      title="导出带起止时间戳的 SRT 字幕文件，可直接拖入剪映或 Premiere"
                    >
                      <span>导出 SRT 字幕</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 核心展示区 */}
              <div className="p-5 max-h-[620px] overflow-y-auto">
                {/* 1. 智能分段排版模式 */}
                {viewMode === 'paragraphs' && (
                  <div className="space-y-4">
                    {paragraphs.length === 0 ? (
                      <div className="text-zinc-400 text-xs py-8 text-center">暂无分段数据</div>
                    ) : (
                      paragraphs.map((p, idx) => {
                        const style = getSpeakerStyle(p.speaker);
                        return (
                          <div
                            key={idx}
                            className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-[#16161c] hover:border-blue-300 dark:hover:border-blue-700/60 transition group"
                          >
                            {/* 段落头部 */}
                            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                                  {p.speaker ? `说话人 ${p.speaker}` : `段落 ${idx + 1}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => seekTo(p.startTime)}
                                  className="text-[11px] font-mono text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 flex items-center gap-1"
                                  title="点击播放器跳转至此段开始位置"
                                >
                                  <span>▶</span>
                                  <span>{fmtSec(p.startTime)} - {fmtSec(p.endTime)}</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => copy(p.text)}
                                className="opacity-0 group-hover:opacity-100 text-[11px] text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
                                title="复制此段内容"
                              >
                                复制本段
                              </button>
                            </div>

                            {/* 段落正文 */}
                            <p className="text-[13.5px] leading-relaxed text-zinc-800 dark:text-zinc-200 select-text">
                              {p.text}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* 2. 对话时间轴逐句模式 */}
                {viewMode === 'timeline' && (
                  <div className="space-y-2.5">
                    {effectiveUtterances.map((u, i) => {
                      const style = getSpeakerStyle(u.speaker);
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-3 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-[#16161c] hover:bg-zinc-50 dark:hover:bg-[#1a1a20] transition group"
                        >
                          <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                              {u.speaker ? `说话人 ${u.speaker}` : '发言'}
                            </span>
                            <button
                              type="button"
                              onClick={() => seekTo(u.startTime)}
                              className="text-[10px] font-mono text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
                              title="点击跳转播放此句"
                            >
                              ▶ {fmtSec(u.startTime)}
                            </button>
                          </div>

                          <div className="flex-1 text-[13.5px] leading-relaxed text-zinc-800 dark:text-zinc-200 select-text">
                            {u.text}
                          </div>

                          <button
                            type="button"
                            onClick={() => copy(u.text)}
                            className="opacity-0 group-hover:opacity-100 text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition shrink-0 pt-0.5"
                            title="复制这句"
                          >
                            复制
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 3. 纯文本模式 */}
                {viewMode === 'doc' && (
                  <textarea
                    readOnly
                    className="w-full h-96 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-[13.5px] leading-relaxed text-zinc-800 dark:text-zinc-200 outline-none resize-y bg-zinc-50/30 dark:bg-[#16161c] select-text"
                    value={pureText}
                  />
                )}
              </div>

              {/* 结果底栏信息 */}
              <div className="px-5 py-2.5 bg-zinc-50/60 dark:bg-[#16161c]/80 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center justify-between">
                <span>智能标点预测与逆文本正则化已生效 · 支持时间戳精准寻道</span>
                <span className="font-mono">共 {pureText.length} 字 · {paragraphs.length} 个自然段</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
