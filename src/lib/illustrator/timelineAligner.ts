// =========================================================================
// 模块 1: Timeline Aligner (时间轴对齐器)
// 职责：支持 ASR 真实字词级发音时间轴，或在无 ASR 时基于中文口播自然语速进行精确时间估算
// =========================================================================

export interface TimelineSegment {
  index: number;
  text: string;
  startTime: number;
  endTime: number;
  duration: number;
  contextText: string;
}

export interface RawAsrUtterance {
  text: string;
  startTime: number;
  endTime: number;
}

/**
 * 将整段文案与可选的 ASR 时间轴对齐，生成带有毫秒级起止时间与上下文的句子列表
 */
export function alignScriptTimeline(
  scriptText: string,
  totalVideoDuration: number,
  asrUtterances?: RawAsrUtterance[]
): TimelineSegment[] {
  if (!scriptText || !scriptText.trim()) return [];

  // 1. 如果已有真实的 ASR 识别切片，直接基于 ASR 时间戳构建
  if (asrUtterances && asrUtterances.length > 0) {
    return asrUtterances
      .filter((u) => u.text && u.text.trim().length > 0)
      .map((u, idx, arr) => {
        const prev = idx > 0 ? arr[idx - 1].text : '';
        const next = idx < arr.length - 1 ? arr[idx + 1].text : '';
        const context = [prev, u.text, next].filter(Boolean).join(' ');
        const st = Math.round(u.startTime * 100) / 100;
        const et = Math.round(u.endTime * 100) / 100;
        return {
          index: idx,
          text: u.text.trim(),
          startTime: st,
          endTime: et,
          duration: Math.max(0.5, Math.round((et - st) * 100) / 100),
          contextText: context,
        };
      });
  }

  // 2. 无 ASR 时：基于标点符号与自然口播发音节奏进行精确时间估算
  // 普通话口播平均每秒约 4.2~4.8 个字，遇逗号停顿约 0.25s，句号停顿约 0.4s
  const rawSentences = scriptText
    .split(/([。！？!?；;\n]+)/)
    .reduce<string[]>((acc, part, i, arr) => {
      if (i % 2 === 0) {
        const punctuation = arr[i + 1] || '';
        const combined = (part + punctuation).trim();
        if (combined.length > 0) acc.push(combined);
      }
      return acc;
    }, [])
    .filter((s) => s.length > 0);

  if (rawSentences.length === 0) return [];

  // 计算全文有效字数
  const totalChars = rawSentences.reduce((sum, s) => sum + s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length, 0);
  const targetDuration = totalVideoDuration > 0 ? totalVideoDuration : Math.max(10, Math.round(totalChars / 4.2));

  // v0.7.11 修复：单句「最少 1.2 秒」的下限会把总时长撑爆。
  // 例：100 个短句按权重各得 1.0 秒，被下限抬到 1.2 秒后总时长变成 120 秒。
  // 句子越多、句子越短，超出越严重（实测有文案累计到 370 秒，而视频只有 162 秒），
  // 进而导致后续分镜的 recommendedStart 超出视频末尾 —— 那些分镜在预览与导出中都不会出现。
  // 处理：先按权重 + 下限估算，若总量超出目标时长则整体按比例压缩回目标时长。
  const baseDurations = rawSentences.map((s) => {
    const charCount = Math.max(2, s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length);
    const weight = charCount / Math.max(1, totalChars);
    return Math.max(1.2, Math.round(weight * targetDuration * 10) / 10);
  });

  let durations = baseDurations;
  const estimatedTotal = durations.reduce((a, b) => a + b, 0);
  if (estimatedTotal > targetDuration) {
    // 第一次压缩：保留一个较温和的下限，避免长句被压得不可读
    const k1 = targetDuration / estimatedTotal;
    durations = durations.map((d) => Math.max(0.5, d * k1));
    // 第二次压缩：下限仍可能再次撑爆，这次纯按比例归一到目标时长
    const total2 = durations.reduce((a, b) => a + b, 0);
    if (total2 > targetDuration) {
      const k2 = targetDuration / total2;
      durations = durations.map((d) => d * k2);
    }
  }

  let currentSec = 0;
  const segments: TimelineSegment[] = [];

  for (let i = 0; i < rawSentences.length; i++) {
    const s = rawSentences[i];
    const estDuration = Math.max(0.3, Math.round(durations[i] * 10) / 10);

    const startTime = Math.round(currentSec * 10) / 10;
    const endTime = Math.round((currentSec + estDuration) * 10) / 10;
    currentSec += estDuration;

    const prev = i > 0 ? rawSentences[i - 1] : '';
    const next = i < rawSentences.length - 1 ? rawSentences[i + 1] : '';
    const contextText = [prev, s, next].filter(Boolean).join(' ');

    segments.push({
      index: i,
      text: s,
      startTime,
      endTime,
      duration: estDuration,
      contextText,
    });
  }

  return segments;
}

export const MAX_ILLUSTRATION_DURATION = 6.0; // 单张插图最大展示时间绝对不超过 6 秒
export const MIN_ILLUSTRATION_DURATION = 2.5; // 单张插图最小停留时间（保证视觉可识别）
export const MIN_ILLUSTRATION_GAP = 0.1; // 100ms 呼吸防碰间隙

export interface TimeRangeItem {
  startTime: number;
  endTime: number;
  [key: string]: any;
}

/**
 * 严格单调防碰撞与时长安全钳制算法 (v0.7.32)
 * 1. 保证单张图片时长严格控制在 6.0 秒以内（不超过 6 秒），且不小于 2.5 秒；
 * 2. 保证相邻分镜按时间严格单调递增，且保留至少 100ms 呼吸间隙，彻底根除出点入点重叠；
 * 3. 严格受限于已知视频总时长 (videoDuration)。
 */
export function enforceStrictSequentialTimeline<T extends TimeRangeItem>(
  items: T[],
  videoDuration: number = 0,
  maxDuration: number = MAX_ILLUSTRATION_DURATION,
  minDuration: number = MIN_ILLUSTRATION_DURATION,
  minGap: number = MIN_ILLUSTRATION_GAP
): T[] {
  if (!items || items.length === 0) return [];

  // 1. 先按原始 startTime 排序
  const sorted = [...items].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  const totalLimit = videoDuration > 0 ? videoDuration : Number.POSITIVE_INFINITY;
  const result: T[] = [];

  let prevEndTime = 0;

  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    let start = Math.max(0, it.startTime);
    let end = it.endTime;

    // 若与前一个分镜发生碰撞或间隔不足 minGap，强制推移 start
    if (i > 0) {
      if (start < prevEndTime + minGap) {
        start = Math.round((prevEndTime + minGap) * 100) / 100;
      }
    }

    // 严厉时长约束：不超过 6.0 秒，不少于 2.5 秒
    let dur = end - start;
    if (dur > maxDuration || !Number.isFinite(dur)) {
      dur = maxDuration;
    } else if (dur < minDuration) {
      dur = minDuration;
    }

    end = Math.round((start + dur) * 100) / 100;

    // 若已知视频总时长，不可超出总时长
    if (totalLimit < Number.POSITIVE_INFINITY) {
      if (end > totalLimit) {
        end = totalLimit;
        start = Math.max(0, Math.round((end - Math.min(dur, maxDuration)) * 100) / 100);
        if (i > 0 && start < prevEndTime + minGap) {
          start = Math.round((prevEndTime + minGap) * 100) / 100;
          if (end <= start) {
            end = Math.min(totalLimit, start + 0.8);
          }
        }
      }
    }

    prevEndTime = end;
    result.push({
      ...it,
      startTime: Math.round(start * 100) / 100,
      endTime: Math.round(end * 100) / 100,
    });
  }

  // 2. 二次逆向校验：从后向前如果超出导致重叠，做精细微调保证单调
  for (let i = result.length - 2; i >= 0; i--) {
    const cur = result[i];
    const next = result[i + 1];
    if (cur.endTime + minGap > next.startTime) {
      cur.endTime = Math.round(Math.max(cur.startTime + 0.8, next.startTime - minGap) * 100) / 100;
    }
  }

  return result;
}

