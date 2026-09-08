/**
 * scriptSanitizer.ts - 口播脚本与台词智能净洗器
 * 
 * 核心功能：
 * 1. 自动剥离 Markdown 围栏代码块（```markdown ... ``` 或 ```text ... ``` 等）
 * 2. 智能识别并切除开头常见的寒暄客套语与标题标记（如“好的，为您生成如下口播文案：”、“【口播文案】”等）
 * 3. 智能识别并切除结尾常见的互动寒暄、总结、免责声明与拍摄建议等无关内容
 * 4. 彻底去除开头和结尾的所有空白字符与多余换行（彻底杜绝流转中心首行多出空行）
 * 5. 规范化段落间距（将连续3个以上的冗余空行收拢为标准2个换行）
 */

// 头部常见的客套话、说明与标题模式
const LEADING_GREETING_PATTERNS = [
  /^(好的|没问题|当然可以|收到|已为您|这是为您|为您生成|为你定制|为你创作|以下是|下面是|为你准备|为您准备|这是为您准备|根据您的要求|针对您的要求|已为您重构|已根据|遵照|根据)[^。\n]{0,80}[：:！!\n]/,
  /^【?.*?(口播文案|爆款文案|短视频脚本|完整文案|正文脚本|文案正文|脚本内容|口播脚本|脚本文案|脚本|文案|正文|爆款台词|参考文案).*?】?[：:]?\s*$/,
  /^#+\s*.*?(口播文案|爆款文案|短视频脚本|脚本|文案|正文|台词).*/,
  /^\*{1,3}.*?(口播文案|爆款文案|短视频脚本|脚本正文|正文|台词)\*{1,3}[：:]?\s*$/,
  /^(标题|选题|主题|视频主题)[：:].*$/,
];

// 尾部常见的客套话、行动号召总结、拍摄说明等
const TRAILING_GREETING_PATTERNS = [
  /^(希望(这篇|这套|这个|以上|此)?(文案|脚本|内容|建议)?(能|对你|对您|有所帮助|有帮助|喜欢).*)/,
  /^(如果(你|您)?(还有|需要|想|对).*?(微调|修改|调整|补充|随时).*)/,
  /^(祝(您|你)?(爆款|拍摄|创作|点赞|视频|播放).*)/,
  /^——+\s*(完|结束|EOF|THE END)\s*——+$/i,
  /^[—\-_]{3,}$/,
  /^\((注|提示|建议|拍摄提示|拍摄建议|语气提示|出镜建议)[：:].*?\)$/,
  /^【?.*?(拍摄建议|视觉建议|画面建议|分镜说明|注意事项|创作提示|出镜提示|拍摄说明).*?】?[：:]?.*$/,
];

/**
 * 净洗提取纯粹的口播脚本内容
 */
export function extractCleanScript(rawText: string): string {
  if (!rawText) return '';

  let text = String(rawText)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // 1. 彻底剥离 <think>...</think> 与未闭合的 <think> 深度推演块
  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<think\b[^>]*>[\s\S]*$/gi, '');
  text = text.replace(/<thought\b[^>]*>[\s\S]*?<\/thought>/gi, '');
  text = text.replace(/<thought\b[^>]*>[\s\S]*$/gi, '');

  // 2. 剥离 Markdown 代码块外壳包裹
  text = text.replace(/^```(?:markdown|text|plain|txt)?\s*\n([\s\S]*?)\n```\s*$/im, '$1');
  const codeBlockMatch = text.match(/```(?:markdown|text|plain|txt)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1].trim().length > 15) {
    if (!text.slice(0, text.indexOf('```')).includes('正文') && text.indexOf('```') < 100) {
      text = codeBlockMatch[1];
    }
  }

  // 3. 智能截取正文区间（识别正文开始标记与尾部汇报/说明分界线）
  // 3.1 识别尾部汇报总结/创作说明/检查清单/分镜等分界线
  // 匹配整行以 #、【、---、*** 开头，且包含汇报、思路、说明、检查清单、投流配套、复盘等关键词
  const trailingBoundaryRegex = /(?:^|\n)\s*(?:#+\s*|【|\*{1,3}|---+\s*|\*\*\*+\s*)[^\n]*(?:创作思路|创作说明|改写说明|修改说明|改写逻辑|设计思路|设计说明|设计亮点|违规点|违规规避|合规说明|合规自检|自检|汇报总结|创作汇报|汇报|创作复盘|复盘说明|思路复盘|检查清单|投流配套|封面标题|拍摄建议|分镜建议|拍摄说明|分镜说明|出镜建议|语气建议|注意事项|互动话术|评论区话术)[^\n]*(?:\n|$)/i;
  
  const trailingMatch = text.match(trailingBoundaryRegex);
  if (trailingMatch && trailingMatch.index !== undefined) {
    const beforeBoundary = text.slice(0, trailingMatch.index).trim();
    if (beforeBoundary.length >= 20) {
      text = beforeBoundary;
    }
  }

  // 3.2 识别正文开始标记（如【口播正文】、【文案正文】等）
  const bodyStartRegex = /(?:^|\n)\s*(?:#+\s*|【|\*{1,3})?\s*(?:口播正文|文案正文|正文脚本|脚本文案|脚本正文|短视频文案|口播台词|正文内容|正文)(?:】|\*{1,3}|[：:])?\s*(?:\n|$)/i;
  const startMatch = text.match(bodyStartRegex);
  if (startMatch && startMatch.index !== undefined) {
    const afterStart = text.slice(startMatch.index + startMatch[0].length).trim();
    if (afterStart.length >= 20) {
      text = afterStart;
    }
  }

  // 4. 切分成行逐行清洗首尾
  let lines = text.split('\n');

  // 4.1 剥离头部的无意义行、空行与寒暄
  let leadingLoopCount = 0;
  while (lines.length > 0 && leadingLoopCount < 20) {
    leadingLoopCount++;
    const firstLine = lines[0].trim();
    if (!firstLine) {
      lines.shift();
      continue;
    }
    const isGreeting = LEADING_GREETING_PATTERNS.some(pat => pat.test(firstLine));
    if (isGreeting) {
      lines.shift();
      continue;
    }
    break;
  }

  // 4.2 剥离尾部的客套总结、拍摄建议与空行
  let trailingLoopCount = 0;
  while (lines.length > 0 && trailingLoopCount < 20) {
    trailingLoopCount++;
    const lastLine = lines[lines.length - 1].trim();
    if (!lastLine) {
      lines.pop();
      continue;
    }
    const isTrailing = TRAILING_GREETING_PATTERNS.some(pat => pat.test(lastLine));
    if (isTrailing) {
      lines.pop();
      continue;
    }
    break;
  }

  // 5. 重新拼合并再次清理可能残留的 markdown 围栏
  let result = lines.join('\n').trim();
  result = result.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();

  // 6. 收拢超过 2 个连续空行为标准 2 个换行
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}
