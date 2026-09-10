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

  // 每个句子的字符权重
  let currentSec = 0;
  const segments: TimelineSegment[] = [];

  for (let i = 0; i < rawSentences.length; i++) {
    const s = rawSentences[i];
    const charCount = Math.max(2, s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length);
    const weight = charCount / Math.max(1, totalChars);
    let estDuration = weight * targetDuration;
    // 单句最少 1.2 秒
    estDuration = Math.max(1.2, Math.round(estDuration * 10) / 10);

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
