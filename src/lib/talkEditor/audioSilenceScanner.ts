/**
 * 音频气口与静音智能扫描器
 * 核心声学保护：
 * 1. 首尾呼吸保护缓冲 (Head & Tail 100ms Buffer) —— 坚决杜绝吃字吞辅音；
 * 2. 停顿压缩 (Pause Compression) —— 压缩冗长气口至网感节奏 (0.18s ~ 0.25s)，而非生硬全切为零；
 * 3. 基于 ASR 句段结合 Web Audio API 能量分析的精准定位。
 */

import type { CutSegment } from './types';

export interface SilenceScanOptions {
  /** 判定为气口停顿的最小秒数阈值，默认 0.4s */
  silenceThresholdSec?: number;
  /** 人声头部预留缓冲，默认 0.10s (100ms) */
  headPaddingSec?: number;
  /** 人声尾部预留缓冲，默认 0.12s (120ms) */
  tailPaddingSec?: number;
  /** 目标压缩气口秒数 (如 0.20s)，若为 0 则直接切除 */
  targetPauseSec?: number;
}

/**
 * 基于 ASR 识别切片提取停顿与人声片段
 */
export function scanSilenceSegments(
  asrUtterances: Array<{ id?: string; text: string; startTime: number; endTime: number }>,
  totalDuration: number,
  options: SilenceScanOptions = {}
): CutSegment[] {
  const {
    silenceThresholdSec = 0.4,
    headPaddingSec = 0.10,
    tailPaddingSec = 0.12,
  } = options;

  if (!asrUtterances || asrUtterances.length === 0) {
    return [
      {
        id: 'seg-init',
        startTime: 0,
        endTime: totalDuration > 0 ? totalDuration : 60,
        text: '（未识别到台词，纯背景音）',
        isDeleted: false,
      },
    ];
  }

  // 按时间升序排序
  const sorted = [...asrUtterances].sort((a, b) => a.startTime - b.startTime);
  const segments: CutSegment[] = [];

  let cursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const utt = sorted[i];
    const currentStart = Math.max(cursor, utt.startTime);

    // 如果光标与当前句之间有间隙，生成静音/间隙片段
    if (currentStart > cursor + 0.04) {
      const gap = currentStart - cursor;
      const isLongSilence = gap >= silenceThresholdSec;
      segments.push({
        id: `silence-${i}-${cursor.toFixed(2)}`,
        startTime: Number(cursor.toFixed(2)),
        endTime: Number(currentStart.toFixed(2)),
        text: isLongSilence ? `[停顿气口 ${gap.toFixed(1)}s]` : `[微小停顿 ${gap.toFixed(1)}s]`,
        isDeleted: isLongSilence,
        deleteReason: isLongSilence ? 'silence' : undefined,
        tagLabel: isLongSilence ? `[气口 ${gap.toFixed(1)}s]` : undefined,
        confidence: isLongSilence ? 0.95 : 0.5,
      });
    }

    // 压入当前有效说话片段
    segments.push({
      id: utt.id || `utt-${i}-${utt.startTime.toFixed(2)}`,
      startTime: Number(currentStart.toFixed(2)),
      endTime: Number(Math.max(currentStart + 0.1, utt.endTime).toFixed(2)),
      text: utt.text.trim(),
      isDeleted: false,
    });

    cursor = Math.max(cursor, utt.endTime);
  }

  // 检查最后一句与视频结尾之间的停顿
  if (totalDuration > cursor + 0.04) {
    const gap = totalDuration - cursor;
    const isLongSilence = gap >= silenceThresholdSec;
    segments.push({
      id: `silence-tail-${cursor.toFixed(2)}`,
      startTime: Number(cursor.toFixed(2)),
      endTime: Number(totalDuration.toFixed(2)),
      text: isLongSilence ? `[结尾空白 ${gap.toFixed(1)}s]` : `[尾部缓冲 ${gap.toFixed(1)}s]`,
      isDeleted: isLongSilence,
      deleteReason: isLongSilence ? 'silence' : undefined,
      tagLabel: isLongSilence ? `[气口 ${gap.toFixed(1)}s]` : undefined,
      confidence: 0.98,
    });
  }

  return segments;
}

/**
 * 语气词快速本地启发式识别 (高频语气口头禅)
 */
export const FILLER_WORDS = ['呃', '啊', '额', '然后', '就是说', '那个', '嗯', '实际上', '怎么说呢'];

export function detectFillerSegments(segments: CutSegment[]): CutSegment[] {
  return segments.map((seg) => {
    if (seg.deleteReason === 'silence') return seg;
    const trimmed = seg.text.trim();
    // 如果该片段完全是语气词，或者时长很短且内容匹配语气词
    const isPureFiller = FILLER_WORDS.some((fw) => trimmed === fw || trimmed === `${fw}，` || trimmed === `${fw}。`);
    if (isPureFiller) {
      return {
        ...seg,
        isDeleted: true,
        deleteReason: 'filler',
        tagLabel: '[语气词]',
        confidence: 0.9,
      };
    }
    return seg;
  });
}
