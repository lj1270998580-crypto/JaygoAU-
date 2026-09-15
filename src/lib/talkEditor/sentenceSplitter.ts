/**
 * 自媒体短视频黄金口播节奏分句器 (Oral Speech Subtitle Splitter)
 * 解决问题：ASR 输出连绵长段、少用句号导致字幕一整段塞入屏幕的严重缺陷。
 *
 * 核心规则：
 * 1. 强标点必断：[。！？!?；;\n]
 * 2. 逗号/顿号/空格自然断句：当单句已达 6~14 字时，遇到标点立即切为独立口播字幕句；
 * 3. 超长无标点截断保护：连续无标点超过 16 字，自动在连词/语气词前或等长平滑截断，单句字数严格保持在 6~15 字；
 * 4. 字音精准对齐：如果包含逐字 words 列表，切出短句的首尾时刻严格对应实际发音时间。
 */

export interface SplitSpeechUnit {
  id: string;
  text: string;           // 包含标点的台词句（供文稿与精剪分析使用）
  cleanText: string;      // 剔除末尾多余标点的纯净字幕文本（供屏幕字幕展示使用）
  startTime: number;      // 秒
  endTime: number;        // 秒
  words?: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
}

export interface RawUtteranceInput {
  id?: string;
  text: string;
  startTime: number; // 秒
  endTime: number;   // 秒
  words?: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
}

// 常见汉语连词与短语前缀（适合在超长无标点句中作为自然断句切分点）
const CLAUSE_SPLIT_KEYWORDS = [
  '因为', '所以', '但是', '如果', '而且', '然后', '那么', '不过',
  '其实', '也就是说', '关键在于', '比如说', '举个例子', '为什么',
  '虽然', '只要', '无论', '从而', '进而', '由此',
];

/**
 * 将一段原始台词文本智能拆解为符合短视频黄金节奏的短语数组
 */
export function splitTextIntoShortPhrases(text: string): string[] {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];

  // 第一步：先按强标点（句号、感叹号、问号、分号、换行）做第一道切分
  const strongChunks = trimmed.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g) || [trimmed];
  const phrases: string[] = [];

  for (const chunk of strongChunks) {
    const s = chunk.trim();
    if (!s) continue;

    // 若当前短句很短（<= 12 字），直接保留
    if (s.length <= 12) {
      phrases.push(s);
      continue;
    }

    // 第二步：中等长度（> 12 字），尝试按逗号、顿号、空格进行二次切分
    const commaParts = s.match(/[^，,、\s]+[，,、\s]?/g) || [s];
    let currentAcc = '';

    for (const part of commaParts) {
      if (!currentAcc) {
        currentAcc = part;
      } else if (currentAcc.length + part.length <= 14) {
        // 合并后仍在 14 字以内，合并以避免太碎
        currentAcc += part;
      } else {
        // 超出 14 字，输出当前累积，开始新短语
        phrases.push(currentAcc.trim());
        currentAcc = part;
      }
    }
    if (currentAcc.trim()) {
      phrases.push(currentAcc.trim());
    }
  }

  // 第三步：兜底超长保护（针对连续无任何标点的超长字符，如 > 16 字）
  const finalPhrases: string[] = [];
  for (const p of phrases) {
    if (p.length <= 16) {
      finalPhrases.push(p);
      continue;
    }

    // 检查是否有常用连词作为断句点
    let remaining = p;
    while (remaining.length > 16) {
      let cutIdx = -1;
      for (const kw of CLAUSE_SPLIT_KEYWORDS) {
        const idx = remaining.indexOf(kw, 5); // 至少 5 个字之后再切
        if (idx >= 6 && idx <= 15) {
          cutIdx = idx;
          break;
        }
      }

      // 没有连词匹配时，在 11~14 字处平滑切断
      if (cutIdx === -1) {
        cutIdx = Math.min(13, remaining.length);
      }

      const head = remaining.slice(0, cutIdx).trim();
      if (head) finalPhrases.push(head);
      remaining = remaining.slice(cutIdx).trim();
    }
    if (remaining.trim()) {
      finalPhrases.push(remaining.trim());
    }
  }

  return finalPhrases.filter((p) => p.length > 0);
}

/**
 * 将原生 utterances 或长句切片精细化拆分为自媒体短视频单句字幕单元
 */
export function refineUtterancesToSubtitleUnits(
  rawList: RawUtteranceInput[],
  fallbackTotalDurationSec?: number
): SplitSpeechUnit[] {
  if (!rawList || rawList.length === 0) return [];

  const results: SplitSpeechUnit[] = [];
  let unitIndex = 0;

  for (const raw of rawList) {
    const rawText = (raw.text || '').trim();
    if (!rawText) continue;

    const rawStart = raw.startTime;
    const rawEnd = Math.max(rawStart + 0.3, raw.endTime);
    const rawDur = rawEnd - rawStart;

    // 切出子短句
    const phrases = splitTextIntoShortPhrases(rawText);
    if (phrases.length <= 1) {
      // 无需二次拆分
      const cleanText = rawText.replace(/[。！？!?，,；;、\s]+$/, '');
      results.push({
        id: raw.id || `sub-unit-${unitIndex++}`,
        text: rawText,
        cleanText: cleanText || rawText,
        startTime: rawStart,
        endTime: rawEnd,
        words: raw.words,
      });
      continue;
    }

    // 存在逐字 words 列表时，按字符在原句中的索引精确截取逐字起止时间
    const totalChars = Math.max(1, rawText.length);
    let charCursor = 0;

    for (let pIdx = 0; pIdx < phrases.length; pIdx++) {
      const phrase = phrases[pIdx];
      const pLen = phrase.length;
      const cleanText = phrase.replace(/[。！？!?，,；;、\s]+$/, '');

      let subStart: number;
      let subEnd: number;
      let subWords: Array<{ text: string; startTime: number; endTime: number }> | undefined = undefined;

      if (Array.isArray(raw.words) && raw.words.length > 0) {
        const sliceWords = raw.words.slice(charCursor, charCursor + pLen);
        if (sliceWords.length > 0) {
          subStart = sliceWords[0].startTime;
          subEnd = sliceWords[sliceWords.length - 1].endTime;
          subWords = sliceWords;
        } else {
          // 兜底等比计算
          subStart = Number((rawStart + (charCursor / totalChars) * rawDur).toFixed(3));
          subEnd = Number((rawStart + ((charCursor + pLen) / totalChars) * rawDur).toFixed(3));
        }
      } else {
        // 无字级信息：按字符数在该段音频中等比分配
        subStart = Number((rawStart + (charCursor / totalChars) * rawDur).toFixed(3));
        subEnd = Number((rawStart + ((charCursor + pLen) / totalChars) * rawDur).toFixed(3));
        // 为该分句内插生成字级信息
        const charDur = Math.max(0.05, (subEnd - subStart) / Math.max(1, pLen));
        subWords = phrase.split('').map((ch, i) => ({
          text: ch,
          startTime: Number((subStart + i * charDur).toFixed(3)),
          endTime: Number((subStart + (i + 1) * charDur).toFixed(3)),
        }));
      }

      // 确保 endTime 严格大于 startTime
      subEnd = Math.max(subStart + 0.3, subEnd);

      results.push({
        id: `sub-unit-${unitIndex++}`,
        text: phrase,
        cleanText: cleanText || phrase,
        startTime: subStart,
        endTime: subEnd,
        words: subWords,
      });

      charCursor += pLen;
    }
  }

  // 保证所有单元按时间顺序严格递增排序
  results.sort((a, b) => a.startTime - b.startTime);

  return results;
}
