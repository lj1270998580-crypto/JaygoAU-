import type { VoiceRecord } from '../types';

export function formatBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function statusText(s: number): string {
  return ({ 0: '未找到', 1: '训练中', 2: '训练成功', 3: '训练失败', 4: '可用' } as Record<number, string>)[s] ?? `状态${s}`;
}

export function statusColor(s: number): string {
  return (
    {
      0: 'bg-slate-100 text-slate-600',
      1: 'bg-amber-50 text-amber-700',
      2: 'bg-emerald-50 text-emerald-700',
      3: 'bg-rose-50 text-rose-700',
      4: 'bg-emerald-100 text-emerald-700',
    } as Record<number, string>
  )[s] ?? 'bg-slate-100 text-slate-600';
}

export function modelTypeText(m?: number): string {
  return (
    {
      1: 'ICL V1',
      2: 'DiT 标准版',
      3: 'DiT 还原版',
      4: 'ICL V2',
      5: 'ICL V3',
    } as Record<number, string>
  )[m ?? -1] ?? (m ? `模型${m}` : '—');
}

export function voiceReady(v: VoiceRecord): boolean {
  return v.status === 2 || v.status === 4;
}

export const LANGUAGES: { value: number; label: string }[] = [
  { value: 0, label: '中文' },
  { value: 1, label: 'English' },
  { value: 2, label: '日语' },
  { value: 3, label: '西班牙语' },
  { value: 4, label: '印尼语' },
  { value: 5, label: '葡萄牙语' },
  { value: 6, label: '法语' },
  { value: 7, label: '德语' },
  { value: 8, label: '韩语' },
];

export const FORMATS: { value: string; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'ogg_opus', label: 'OGG Opus' },
  { value: 'pcm', label: 'PCM' },
];

export const SAMPLE_RATES: number[] = [8000, 16000, 22050, 24000, 32000, 44100, 48000];

export const RESOURCE_IDS: { value: string; label: string }[] = [
  { value: 'seed-icl-2.0', label: '声音复刻 2.0（ICL 2.0 / V3）' },
  { value: 'seed-icl-1.0', label: '声音复刻 1.0（ICL 1.0）' },
  { value: 'seed-tts-2.0', label: '豆包语音合成 2.0（官方音色）' },
  { value: 'seed-tts-1.0', label: '豆包语音合成 1.0（官方音色）' },
];
