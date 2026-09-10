// =========================================================================
// 宽容 JSON 数组提取器（Tolerant JSON Array Extractor）
//
// 背景：插图板块的语义解析与视觉导演都要求大模型返回「严格 JSON 数组」。
// 原实现使用贪婪正则 /\[\s*\{[\s\S]*\}\s*\]/，只要模型输出被 max_tokens 截断、
// 或在数组前后带了额外说明文字，匹配就会失败并静默退回关键词模板。
//
// 本模块提供：
// 1. 去噪：剥离 <think> 思考块、``` 代码围栏、前后客套话
// 2. 括号配平扫描：字符串感知地找到数组真实结束位置（不再依赖正则）
// 3. 截断抢救：数组不完整时，逐个抢救出其中已经完整的对象
// =========================================================================

export interface JsonArrayExtraction<T> {
  /** 成功解析出的数组元素（可能来自截断抢救） */
  items: T[];
  /** 原始输出是否被截断（数组没有正常闭合） */
  truncated: boolean;
  /** 是否至少解析出了内容 */
  ok: boolean;
  /** 提取片段（用于诊断，最多 800 字符） */
  raw: string;
}

/**
 * 剥离思考块、代码围栏与常见前后缀噪声
 */
export function stripLlmNoise(text: string): string {
  if (!text) return '';
  let t = text;

  // 1. 剥离<think>思考块（含未闭合的情况）
  t = t.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/<thought\b[^>]*>[\s\S]*?<\/thought>/gi, '');
  t = t.replace(/<think\b[^>]*>[\s\S]*$/gi, '');

  // 2. 剥离代码围栏（保留围栏内的内容）
  const fence = t.match(/```(?:json|javascript|js)?\s*\n([\s\S]*?)\n?```/i);
  if (fence && fence[1]) {
    t = fence[1];
  } else {
    t = t.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
  }

  return t.trim();
}

/**
 * 从 `openIndex` 处的开括号开始做配平扫描，返回对应闭括号的下标。
 * 感知字符串字面量与转义，避免被内容里的括号干扰。
 * 找不到闭合时返回 -1（即输出被截断）。
 */
function findMatchingBracket(s: string, openIndex: number): number {
  const open = s[openIndex];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

/**
 * 截断抢救：从残缺的数组文本中，逐个提取出已经完整闭合的对象
 */
function salvageObjects<T>(s: string): T[] {
  const out: T[] = [];
  let i = 0;

  while (i < s.length) {
    const objStart = s.indexOf('{', i);
    if (objStart === -1) break;

    const objEnd = findMatchingBracket(s, objStart);
    if (objEnd === -1) break; // 这个对象本身就没闭合，后面的也救不回来

    const slice = s.slice(objStart, objEnd + 1);
    try {
      const parsed = JSON.parse(slice);
      if (parsed && typeof parsed === 'object') out.push(parsed as T);
    } catch {
      // 单个对象解析失败则跳过，不影响后续抢救
    }
    i = objEnd + 1;
  }

  return out;
}

/**
 * 宽容提取 JSON 数组
 */
export function extractJsonArrayLoose<T = any>(text: string): JsonArrayExtraction<T> {
  const cleaned = stripLlmNoise(text);
  if (!cleaned) {
    return { items: [], truncated: false, ok: false, raw: '' };
  }

  const start = cleaned.indexOf('[');

  // 情形一：找不到数组起点 —— 也许模型直接返回了单个对象
  if (start === -1) {
    const objStart = cleaned.indexOf('{');
    if (objStart !== -1) {
      const objEnd = findMatchingBracket(cleaned, objStart);
      if (objEnd !== -1) {
        try {
          const single = JSON.parse(cleaned.slice(objStart, objEnd + 1));
          return { items: [single as T], truncated: false, ok: true, raw: cleaned.slice(0, 800) };
        } catch {
          /* ignore */
        }
      }
    }
    return { items: [], truncated: false, ok: false, raw: cleaned.slice(0, 800) };
  }

  const end = findMatchingBracket(cleaned, start);

  // 情形二：数组完整闭合 —— 正常解析
  if (end !== -1) {
    const slice = cleaned.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed)) {
        return { items: parsed as T[], truncated: false, ok: parsed.length > 0, raw: slice.slice(0, 800) };
      }
    } catch {
      // 闭合却解析失败（例如非法 JSON），继续走抢救流程
    }
    const salvaged = salvageObjects<T>(slice);
    return {
      items: salvaged,
      truncated: false,
      ok: salvaged.length > 0,
      raw: slice.slice(0, 800),
    };
  }

  // 情形三：数组没有闭合 —— 输出被截断，抢救已完整的对象
  const salvaged = salvageObjects<T>(cleaned.slice(start));
  return {
    items: salvaged,
    truncated: true,
    ok: salvaged.length > 0,
    raw: cleaned.slice(start, start + 800),
  };
}

/**
 * 把数组按固定大小切分为若干分片
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
