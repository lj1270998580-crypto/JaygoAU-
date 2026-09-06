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

  // 1. 如果整体被 Markdown 代码块包裹，解构提取代码块内部内容
  const codeBlockMatch = text.match(/```(?:markdown|text|plain|txt)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1].trim().length > 15) {
    text = codeBlockMatch[1];
  }

  // 2. 切分成行逐行清洗首尾
  let lines = text.split('\n');

  // 3. 剥离头部的无意义行、空行与寒暄
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

  // 4. 剥离尾部的客套总结、拍摄建议与空行
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

  // 5. 重新拼合并彻底 trim
  let result = lines.join('\n').trim();

  // 6. 收拢超过 2 个连续空行为标准 2 个换行
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}
