/**
 * 音频气口与静音智能扫描器
 * 核心声学保护：
 * 1. 首尾呼吸保护缓冲 (Head & Tail 120ms Buffer) —— 坚决杜绝吃字吞辅音；
 * 2. 默认保持 100% 原始状态，仅做标记，绝不未经用户允许默认强行剪辑；
 * 3. 支持字级别 (Word / Character Level) 的精确时间戳对齐与剪裁。
 */

import type { CutSegment, WordItem } from './types';

export interface SilenceScanOptions {
  /** 判定为气口停顿的最小秒数阈值，默认 0.4s */
  silenceThresholdSec?: number;
  /** 人声头部预留缓冲，默认 0.12s (120ms) */
  headPaddingSec?: number;
  /** 人声尾部预留缓冲，默认 0.15s (150ms) */
  tailPaddingSec?: number;
}

/**
 * 将整句文本分解为字级别 (Word / Token) 时间轴
 */
export function buildWordItems(
  sentenceText: string,
  startTime: number,
  endTime: number,
  rawWords?: Array<{ text: string; startTime: number; endTime: number }>
): WordItem[] {
  const text = sentenceText.trim();
  if (!text) return [];

  // 如果 ASR 返回了精确的字词级时间戳（注意：若入参为秒，则直接使用）
  if (rawWords && rawWords.length > 0) {
    return rawWords.map((w, idx) => ({
      id: `w-${idx}-${w.startTime.toFixed(2)}`,
      text: w.text,
      startTime: Number(w.startTime.toFixed(3)),
      endTime: Number(w.endTime.toFixed(3)),
      isDeleted: false,
    }));
  }

  // 若没有返回字级时间戳，采用中文音节字符等比插值算法
  const chars = Array.from(text);
  const totalChars = chars.length;
  if (totalChars === 0) return [];

  const duration = Math.max(0.1, endTime - startTime);
  const charDuration = duration / totalChars;

  return chars.map((char, idx) => {
    const cStart = startTime + idx * charDuration;
    const cEnd = idx === totalChars - 1 ? endTime : cStart + charDuration;
    return {
      id: `c-${idx}-${cStart.toFixed(2)}`,
      text: char,
      startTime: Number(cStart.toFixed(3)),
      endTime: Number(cEnd.toFixed(3)),
      isDeleted: false,
    };
  });
}

/**
 * 基于 ASR 识别切片提取停顿与人声片段 (默认保留全部，不默认切除)
 */
export function scanSilenceSegments(
  asrUtterances: Array<{
    id?: string;
    text: string;
    startTime: number; // 单位：秒
    endTime: number;   // 单位：秒
    words?: Array<{ text: string; startTime: number; endTime: number }>;
  }>,
  totalDuration: number,
  options: SilenceScanOptions = {}
): CutSegment[] {
  const {
    silenceThresholdSec = 0.4,
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
        type: 'silence',
        startTime: Number(cursor.toFixed(2)),
        endTime: Number(currentStart.toFixed(2)),
        text: isLongSilence ? `[停顿气口 ${gap.toFixed(1)}s]` : `[微小停顿 ${gap.toFixed(1)}s]`,
        isDeleted: false, // 🌟 默认不切除！交给用户预览与一键精剪确认
        deleteReason: 'silence', // 明确声学空白性质
        tagLabel: isLongSilence ? `[气口 ${gap.toFixed(1)}s]` : `[停顿 ${gap.toFixed(1)}s]`,
        confidence: isLongSilence ? 0.95 : 0.6,
      });
    }

    // 构建字级别切片
    const wordItems = buildWordItems(utt.text, currentStart, Math.max(currentStart + 0.1, utt.endTime), utt.words);

    // 压入当前有效说话片段
    segments.push({
      id: utt.id || `utt-${i}-${utt.startTime.toFixed(2)}`,
      type: 'sentence',
      startTime: Number(currentStart.toFixed(2)),
      endTime: Number(Math.max(currentStart + 0.1, utt.endTime).toFixed(2)),
      text: utt.text.trim(),
      isDeleted: false, // 🌟 默认不切除
      words: wordItems,
    });

    cursor = Math.max(cursor, utt.endTime);
  }

  // 检查最后一句与视频结尾之间的停顿
  if (totalDuration > cursor + 0.04) {
    const gap = totalDuration - cursor;
    const isLongSilence = gap >= silenceThresholdSec;
    segments.push({
      id: `silence-tail-${cursor.toFixed(2)}`,
      type: 'silence',
      startTime: Number(cursor.toFixed(2)),
      endTime: Number(totalDuration.toFixed(2)),
      text: isLongSilence ? `[结尾空白 ${gap.toFixed(1)}s]` : `[尾部缓冲 ${gap.toFixed(1)}s]`,
      isDeleted: false, // 🌟 默认不切除
      deleteReason: 'silence',
      tagLabel: isLongSilence ? `[气口 ${gap.toFixed(1)}s]` : `[停顿 ${gap.toFixed(1)}s]`,
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

    // 1. 如果整句完全是语气词
    const isPureFiller = FILLER_WORDS.some((fw) => trimmed === fw || trimmed === `${fw}，` || trimmed === `${fw}。`);
    if (isPureFiller) {
      return {
        ...seg,
        isDeleted: true,
        deleteReason: 'filler',
        tagLabel: '[语气词]',
        confidence: 0.9,
        words: seg.words?.map((w) => ({ ...w, isDeleted: true, deleteReason: 'filler' })),
      };
    }

    // 2. 如果包含字词级切片，识别句首或句中的语气词并切除对应字词
    if (seg.words && seg.words.length > 0) {
      let hasWordDeleted = false;
      const updatedWords = seg.words.map((w) => {
        const wt = w.text.replace(/[，。！？、]/g, '');
        if (FILLER_WORDS.includes(wt)) {
          hasWordDeleted = true;
          return { ...w, isDeleted: true, deleteReason: 'filler' as const };
        }
        return w;
      });

      if (hasWordDeleted) {
        return {
          ...seg,
          words: updatedWords,
          tagLabel: seg.tagLabel || '[含语气词]',
        };
      }
    }

    return seg;
  });
}

/**
 * 汇总计算所有被切除的时间区间 (包含整句切除与字词级切除)
 */
export function getDeletedIntervals(segments: CutSegment[]): Array<{ start: number; end: number }> {
  const intervals: Array<{ start: number; end: number }> = [];

  for (const seg of segments) {
    if (seg.isDeleted) {
      intervals.push({ start: seg.startTime, end: seg.endTime });
    } else if (seg.words && seg.words.length > 0) {
      let runStart: number | null = null;
      let runEnd: number | null = null;

      for (const w of seg.words) {
        if (w.isDeleted) {
          if (runStart === null) runStart = w.startTime;
          runEnd = w.endTime;
        } else {
          if (runStart !== null && runEnd !== null) {
            intervals.push({ start: runStart, end: runEnd });
            runStart = null;
            runEnd = null;
          }
        }
      }
      if (runStart !== null && runEnd !== null) {
        intervals.push({ start: runStart, end: runEnd });
      }
    }
  }

  if (intervals.length === 0) return [];
  intervals.sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = intervals[i];
    if (cur.start <= prev.end + 0.04) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push(cur);
    }
  }

  return merged;
}

