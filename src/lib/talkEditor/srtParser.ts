/**
 * SRT / VTT 外部字幕轻量解析器
 * 用于支持用户直接导入剪映导出的 SRT 或本地字幕，免跑 ASR 大模型，零网络消耗即刻剪辑。
 */

import type { CutSegment, SubtitleItem } from './types';
import { scanSilenceSegments } from './audioSilenceScanner';
import { refineUtterancesToSubtitleUnits } from './sentenceSplitter';

export interface ParsedSrtResult {
  segments: CutSegment[];
  subtitles: SubtitleItem[];
  durationSec: number;
}

/**
 * 将时间戳格式 "00:01:23,456" 或 "00:01:23.456" 转换为秒数
 */
function parseTimeStringToSeconds(timeStr: string): number {
  const clean = timeStr.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return Number((hours * 3600 + minutes * 60 + seconds).toFixed(3));
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return Number((minutes * 60 + seconds).toFixed(3));
  }
  return 0;
}

/**
 * 解析 SRT 或 WebVTT 纯文本内容
 */
export function parseSrtContent(content: string, estimatedDuration?: number): ParsedSrtResult {
  // 标准化换行
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);

  const rawUtterances: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    words?: Array<{ text: string; startTime: number; endTime: number; isDeleted: boolean }>;
  }> = [];

  const timeRegex = /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{2}:\d{2}[,.]\d{1,3})/;

  let maxEndTime = 0;

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].trim().split('\n');
    if (lines.length < 2) continue;

    let timeLineIdx = -1;
    let match: RegExpMatchArray | null = null;

    for (let j = 0; j < lines.length; j++) {
      match = lines[j].match(timeRegex);
      if (match) {
        timeLineIdx = j;
        break;
      }
    }

    if (timeLineIdx === -1 || !match) continue;

    const startSec = parseTimeStringToSeconds(match[1]);
    const endSec = parseTimeStringToSeconds(match[2]);

    if (endSec <= startSec) continue;

    const textLines = lines.slice(timeLineIdx + 1).map((l) => l.trim()).filter((l) => l.length > 0);
    const cleanText = textLines.join(' ').replace(/<[^>]+>/g, '').trim();

    if (!cleanText) continue;

    if (endSec > maxEndTime) maxEndTime = endSec;

    // 为每个单字分配均匀时间戳 (便于实现单字双击删除与拖拽切除)
    const chars = Array.from(cleanText);
    const segDur = endSec - startSec;
    const charDur = segDur / Math.max(1, chars.length);

    const words = chars.map((char, cIdx) => ({
      text: char,
      startTime: Number((startSec + cIdx * charDur).toFixed(3)),
      endTime: Number((startSec + (cIdx + 1) * charDur).toFixed(3)),
      isDeleted: false,
    }));

    rawUtterances.push({
      id: `srt-utt-${i}`,
      text: cleanText,
      startTime: startSec,
      endTime: endSec,
      words,
    });
  }

  const finalDuration = estimatedDuration && estimatedDuration > maxEndTime ? estimatedDuration : maxEndTime;

  // 🌟 核心升级：经过短视频口播黄金节奏断句器，将长段/长句切成 6~14 字精炼短语
  const refinedUtterances = refineUtterancesToSubtitleUnits(rawUtterances, finalDuration);

  // 使用呼吸缓冲扫描气口停顿
  const segments = scanSilenceSegments(refinedUtterances, finalDuration, {
    silenceThresholdSec: 0.4,
    headPaddingSec: 0.12,
    tailPaddingSec: 0.15,
  });

  const subtitles: SubtitleItem[] = refinedUtterances.map((u, i) => ({
    id: `srt-sub-${i}`,
    startTime: u.startTime,
    endTime: u.endTime,
    text: u.cleanText || u.text,
    words: u.words?.map((w) => ({ word: w.text, startTime: w.startTime, endTime: w.endTime })),
  }));

  return {
    segments,
    subtitles,
    durationSec: finalDuration,
  };
}
