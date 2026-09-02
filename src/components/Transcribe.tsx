import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { ASR_PRICE_PER_HOUR } from '../lib/pricing';
import { formatBytes } from '../lib/format';

interface Utterance {
  text: string;
  startTime: number;
  endTime: number;
  speaker?: string;
}

function buildSpeakerText(utterances: Utterance[]): string {
  if (!utterances?.length) return '';
  let out = '';
  let cur: string | null = null;
  for (const u of utterances) {
    const sp = u.speaker ?? '?';
    if (cur !== sp) {
      out += `\n[说话人 ${sp}]\n`;
      cur = sp;
    }
    out += u.text;
  }
  return out.replace(/^\n/, '').trim();
}

function fmtDuration(ms: number): string {
  if (!ms) return '未知';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m} 分 ${r} 秒` : `${r} 秒`;
}

export default function Transcribe() {
  const { settings, hasKey, patchSettings, showToast } = useStore();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<{ text: string; utterances: Utterance[]; durationMs: number } | null>(null);
  const [speakerView, setSpeakerView] = useState(true);

  useEffect(() => {
    const off = api.onTranscribeStatus((msg) => setStatus(msg));
    return off;
  }, []);

  if (!settings) return null;

  const pick = async () => {
    const p = await api.pickMediaFile();
    if (p) {
      setFilePath(p);
      setResult(null);
    }
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
      setSpeakerView(Boolean(settings.enableSpeakerInfo && r.utterances?.some((u) => u.speaker)));
      setStatus('转录完成');
      showToast('转录完成', 'ok');
    } catch (e: any) {
      setStatus('');
      showToast(e?.message || '转录失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const hasSpeakers = Boolean(result && settings.enableSpeakerInfo && result.utterances?.some((u) => u.speaker));
  const displayText = result ? (speakerView && hasSpeakers ? buildSpeakerText(result.utterances) : result.text) : '';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('已复制到剪贴板', 'ok');
    } catch {
      showToast('复制失败，请手动选择文本', 'err');
    }
  };

  const save = (text: string, name: string) => {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('保存失败', 'err');
    }
  };

  const hours = result ? result.durationMs / 3600000 : 0;
  const cost = (hours * ASR_PRICE_PER_HOUR).toFixed(2);

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">视音频转录</h2>
        <p className="page-desc">上传音频或视频，调用火山引擎录音文件识别 2.0 转写为带标点、有排版的文本</p>
      </div>

      {!hasKey && (
        <div className="glass-soft p-4 mb-5 text-[13px] text-amber-700">
          尚未配置 API Key，请先到「设置」填写，否则无法调用转录接口。
        </div>
      )}

      {/* 选择文件 */}
      <div className="glass-soft p-4 mb-5">
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={pick}>选择音视频文件</button>
          {filePath && (
            <button className="btn-ghost" onClick={() => { setFilePath(null); setResult(null); }}>清除</button>
          )}
          {filePath && (
            <span className="text-[12px] text-zinc-500 truncate max-w-[420px]" title={filePath}>
              {filePath.split(/[\\/]/).pop()}
            </span>
          )}
        </div>
        {!filePath && (
          <p className="text-[12px] text-zinc-400 mt-2 leading-relaxed">
            支持音频（wav/mp3/m4a/ogg/aac/pcm/amr/spx 等）与视频（mp4/mov/avi/mkv/webm 等）。视频会自动提取音轨后转录；文件最大 512MB / 5 小时。
          </p>
        )}
        {filePath && (
          <p className="text-[11px] text-zinc-400 mt-2">
            已选择：<span className="font-mono break-all">{filePath}</span>
          </p>
        )}

        <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.enableSpeakerInfo ?? false}
            onChange={(e) => patchSettings({ enableSpeakerInfo: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-[13px] text-zinc-700">开启说话人分离（多人对话按说话人分段，仅中文/普通话生效）</span>
        </label>
      </div>

      {/* 开始 */}
      <button className="btn-primary !h-10 !px-6 !text-sm w-full" onClick={start} disabled={busy || !filePath}>
        {busy ? (status || '转录中…') : '开始转录'}
      </button>

      {busy && (
        <div className="mt-5">
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <span>{status || '转录中…'}</span>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">转录在本地异步进行，文件经服务端下发的临时凭证上传到阿里云 OSS（任务结束自动删除），再将临时 URL 交给火山识别。</p>
        </div>
      )}

      {/* 结果 */}
      {result && !busy && (
        <div className="mt-5 pt-5 border-t border-zinc-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-zinc-900">转录结果</span>
            <span className="text-[11px] text-zinc-400">
              时长 {fmtDuration(result.durationMs)} ｜ 约消耗 ¥{cost}（0.8 元/小时）
            </span>
          </div>

          {hasSpeakers && (
            <div className="flex gap-2 mb-2">
              <button
                className={`btn-ghost !h-7 !text-xs ${speakerView ? '!bg-blue-50 !text-blue-700 !border-blue-200' : ''}`}
                onClick={() => setSpeakerView(true)}
              >
                说话人分段
              </button>
              <button
                className={`btn-ghost !h-7 !text-xs ${!speakerView ? '!bg-blue-50 !text-blue-700 !border-blue-200' : ''}`}
                onClick={() => setSpeakerView(false)}
              >
                纯文本
              </button>
            </div>
          )}

          <textarea
            readOnly
            className="glass-input w-full min-h-[220px] h-72 resize-y text-[13.5px] leading-relaxed"
            value={displayText}
          />

          <div className="flex gap-2 mt-2">
            <button className="btn-ghost !h-8 !text-xs" onClick={() => copy(displayText)}>复制全文</button>
            <button
              className="btn-ghost !h-8 !text-xs"
              onClick={() => save(displayText, `jaygo_transcript_${Date.now()}.txt`)}
            >
              保存为 .txt
            </button>
          </div>

          <p className="text-[11px] text-zinc-400 mt-3">转录文本已自动断句、加标点并书面化（数字/金额转为规范格式）。</p>
        </div>
      )}
    </div>
  );
}
