import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';

interface Utterance {
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
}

const ASR_PRICE_PER_HOUR = 0.8;

function fmtDuration(ms: number) {
  if (!ms) return '未知';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m} 分 ${r} 秒` : `${r} 秒`;
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
      const prefix = u.speaker ? `[${u.speaker}] ` : '';
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

// 说话人颜色调色板
const SPEAKER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '0': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  '1': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  '2': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  '3': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
};

function getSpeakerStyle(speaker?: string) {
  if (!speaker) return { bg: 'bg-zinc-100', text: 'text-zinc-600', border: 'border-zinc-200' };
  return SPEAKER_COLORS[speaker] || { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
}

export default function Transcribe() {
  const { settings, hasKey, patchSettings, showToast } = useStore();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<{ text: string; utterances: Utterance[]; durationMs: number } | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'doc'>('timeline');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const off = api.onTranscribeStatus((msg) => setStatus(msg));
    return off;
  }, []);

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
    setResult(null);
  };

  const start = async () => {
    if (!hasKey) {
      showToast('请先在「设置」中填写 API Key', 'err');
      return;
    }
    if (!filePath) {
      showToast('请先选择音视频文件', 'err');
      return;
    }
    setBusy(true);
    setStatus('准备中…');
    setResult(null);
    try {
      const r = await api.transcribe({ filePath, enableSpeakerInfo: settings.enableSpeakerInfo ?? false });
      setResult(r);
      setViewMode(r.utterances && r.utterances.length > 0 ? 'timeline' : 'doc');
      setStatus('转录完成');
      showToast('转录完成', 'ok');
    } catch (e: any) {
      setStatus('');
      showToast(e?.message || '转录失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const hasUtterances = Boolean(result?.utterances && result.utterances.length > 0);
  const fallbackText = result?.utterances?.length ? result.utterances.map((u) => u.text).join('') : '';
  const pureText = result ? (result.text || fallbackText) : '';
  const speakerFormattedText = result && hasUtterances ? buildSpeakerText(result.utterances) : pureText;

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
    if (!result?.utterances?.length) {
      showToast('无可用时间轴分句，无法导出 SRT', 'err');
      return;
    }
    const srt = buildSrt(result.utterances);
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
    <div className="w-full max-w-5xl mx-auto px-6 py-6 animate-fade-in">
      {/* 标题 */}
      <div className="pb-4 mb-5 border-b border-zinc-100">
        <h2 className="text-[17px] font-semibold text-zinc-900 leading-tight">视音频转录工作台</h2>
        <p className="text-xs text-zinc-400 mt-1">
          火山引擎 Seed-ASR 2.0 大模型音视频识别，支持智能标点、说话人角色分离与 SRT 字幕生成
        </p>
      </div>

      {!hasKey && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 mb-4 text-xs text-amber-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>尚未配置 API Key，请先到「设置」填写，否则无法调用云端转录接口。</span>
        </div>
      )}

      {/* 拖拽上传与文件选择区域 */}
      <div
        className={`rounded-xl p-6 border-2 border-dashed transition cursor-pointer mb-5 ${
          drag
            ? 'border-blue-500 bg-blue-50/50'
            : filePath
            ? 'border-zinc-300 bg-zinc-50/40'
            : 'border-zinc-200 hover:border-zinc-300 bg-white'
        }`}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600 shrink-0 text-lg">
              🎥
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-zinc-900 truncate">
                {filePath ? fileName || filePath : '点击选择，或直接拖拽音视频文件到此处'}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                支持 MP4 / MOV / MKV / AVI / WEBM / MP3 / WAV / M4A / AAC 等常见媒体格式（最大 512MB / 5小时）
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn-ghost !h-8 !px-3 !text-xs rounded-lg" onClick={pick}>
              {filePath ? '重新选择' : '浏览文件'}
            </button>
            {filePath && (
              <button
                type="button"
                className="btn-danger !h-8 !px-2.5 !text-xs rounded-lg"
                onClick={() => {
                  setFilePath(null);
                  setFileName('');
                  setResult(null);
                }}
              >
                清除
              </button>
            )}
          </div>
        </div>

        {filePath && (
          <div className="mt-3 pt-3 border-t border-zinc-200/60 text-[11px] text-zinc-400 font-mono truncate">
            物理路径：{filePath}
          </div>
        )}
      </div>

      {/* 参数与开始按钮 */}
      <div className="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-sm mb-5 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={settings.enableSpeakerInfo ?? false}
            onChange={(e) => patchSettings({ enableSpeakerInfo: e.target.checked })}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
          />
          <span className="font-medium">开启说话人角色分离（多人访谈/播客自动识别发言人，仅中文普通话生效）</span>
        </label>

        <button
          type="button"
          className="btn-primary !h-10 w-full !text-[13.5px] rounded-lg font-medium shadow-md shadow-blue-500/10 flex items-center justify-center gap-2"
          onClick={start}
          disabled={busy || !filePath}
        >
          {busy ? (
            <>
              <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              <span>{status || '正在转写音频…'}</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
              </svg>
              <span>开始转录</span>
            </>
          )}
        </button>
      </div>

      {/* 识别结果区域 */}
      {result && !busy && (
        <div className="rounded-xl border border-zinc-200/90 bg-white shadow-sm overflow-hidden animate-fade-in">
          {/* 头部状态与视图切换 */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-zinc-50/70 border-b border-zinc-100">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold text-zinc-900 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                识别结果
              </span>
              <span className="text-xs text-zinc-400 font-mono">
                音频时长 {fmtDuration(result.durationMs)} ｜ 约预估 ¥{cost}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* 视图切换 */}
              {hasUtterances && (
                <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('timeline')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      viewMode === 'timeline'
                        ? 'bg-blue-600 text-white font-medium shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    对话时间轴
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('doc')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      viewMode === 'doc'
                        ? 'bg-blue-600 text-white font-medium shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    纯文本
                  </button>
                </div>
              )}

              {/* 导出按钮 */}
              <button
                type="button"
                onClick={() => copy(viewMode === 'timeline' && hasUtterances ? speakerFormattedText : pureText)}
                className={`btn-ghost !h-7 !px-2.5 !text-xs rounded-md transition ${
                  copied ? '!border-emerald-300 !text-emerald-700 !bg-emerald-50' : ''
                }`}
              >
                {copied ? '✓ 已复制' : '复制全文'}
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
                  className="btn-primary !h-7 !px-2.5 !text-xs rounded-md shadow-xs bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1"
                  title="导出带标准起止毫秒的 SRT 字幕文件，可直接拖入剪映/PR"
                >
                  <span>导出 SRT 字幕</span>
                </button>
              )}
            </div>
          </div>

          {/* 内容展示 */}
          <div className="p-5 max-h-[500px] overflow-y-auto">
            {viewMode === 'timeline' && hasUtterances ? (
              <div className="space-y-3">
                {result.utterances.map((u, i) => {
                  const style = getSpeakerStyle(u.speaker);
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-xl border border-zinc-100 bg-zinc-50/40 hover:bg-zinc-50 transition group"
                    >
                      <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                          {u.speaker ? `说话人 ${u.speaker}` : '发言'}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {fmtSec(u.startTime)}
                        </span>
                      </div>

                      <div className="flex-1 text-[13.5px] leading-relaxed text-zinc-800">
                        {u.text}
                      </div>

                      <button
                        type="button"
                        onClick={() => copy(u.text)}
                        className="opacity-0 group-hover:opacity-100 text-[11px] text-zinc-400 hover:text-zinc-700 transition shrink-0 pt-0.5"
                        title="复制这句"
                      >
                        复制
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <textarea
                readOnly
                className="w-full h-80 p-3 rounded-lg border border-zinc-200 text-[13.5px] leading-relaxed text-zinc-800 outline-none resize-y bg-zinc-50/30"
                value={pureText}
              />
            )}
          </div>

          <div className="px-5 py-2.5 bg-zinc-50/50 border-t border-zinc-100 text-[11px] text-zinc-400 flex items-center justify-between">
            <span>识别文本已完成标点预测、逆文本正则化与字音纠正</span>
            <span>共 {pureText.length} 字</span>
          </div>
        </div>
      )}
    </div>
  );
}
