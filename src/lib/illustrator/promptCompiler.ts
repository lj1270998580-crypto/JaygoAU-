// =========================================================================
// 模块 5: Prompt Compiler (确定性提示词编译器) - v2 语义优先版
// 核心升级：
// 1. Visual Anchors Priority 排序系统（Primary → Action → Secondary → Env → Style）
// 2. Prompt Coverage Check（编译后检查核心锚点是否覆盖）
// 3. 缺失锚点自动补全
// =========================================================================

import type { ScenePlan, StyleBible, PromptBlocks, ShotType } from './types';

/**
 * 镜头景别的自然语言描述映射
 */
const SHOT_DESC_MAP: Record<ShotType, string> = {
  wide: 'Wide establishing shot',
  medium: 'Medium narrative shot',
  close: 'Close-up detail shot',
  extreme_close: 'Macro extreme close-up',
  overhead: 'Overhead flat-lay bird-eye view',
};

/**
 * 将 ScenePlan 与 StyleBible 编译为纯净结构化提示词
 * 关键改进：按 Prompt Priority 排序，锚点覆盖检查
 */
export function compileScenePrompt(
  scenePlan: ScenePlan,
  styleBible: StyleBible
): PromptBlocks {
  // 1. 风格介质块（放在最前面建立基调，但不喧宾夺主）
  const styleBlock = `${styleBible.visualMedium}`;

  // 2. 主体与动作块 — Prompt Priority 最高
  const shotDesc = SHOT_DESC_MAP[scenePlan.composition.shot] || 'Medium shot';
  const subjectAndAction = `${shotDesc}. PRIMARY SUBJECT: ${scenePlan.scene.primarySubject}. ACTION: ${scenePlan.scene.action}`;

  // 3. 环境道具块
  const envParts: string[] = [];
  if (scenePlan.scene.foreground) {
    envParts.push(`FOREGROUND: ${scenePlan.scene.foreground}`);
  }
  if (scenePlan.scene.background) {
    envParts.push(`BACKGROUND: ${scenePlan.scene.background}`);
  }
  if (scenePlan.scene.period && scenePlan.scene.period !== '当代现代' && scenePlan.scene.period !== '当代') {
    envParts.push(`ERA: ${scenePlan.scene.period}`);
  }
  const environmentAndProps = envParts.join('. ');

  // 4. 机位构图块
  const compositionAndCamera = `${styleBible.cameraLanguage.recommendedLens}, ${styleBible.cameraLanguage.compositionRule}`;

  // 5. 光影与调色板块
  const paletteDesc = styleBible.palette.dominantTones.slice(0, 3).join(', ');
  const tempDesc = styleBible.palette.temperature === 'warm' ? 'warm tones' : styleBible.palette.temperature === 'cool' ? 'cool tones' : 'neutral tones';
  const lightingAndColor = `${styleBible.lighting.type}, ${tempDesc}, palette: ${paletteDesc}. ${styleBible.texture}`;

  // 6. 负向约束
  const allAvoid = Array.from(
    new Set([...(scenePlan.mustAvoid || []), ...(styleBible.forbidden || [])])
  );

  // 7. 按 Prompt Priority 排序组装
  // Priority 顺序: Primary Subject → Action → Visual Anchors → Secondary/Foreground → Environment → Composition → Style → Details → Negative
  const promptParts: string[] = [];

  // 最高优先级：主体与动作
  promptParts.push(subjectAndAction);

  // 第二优先级：视觉锚点（mustInclude 的核心物理实体）
  if (scenePlan.mustInclude && scenePlan.mustInclude.length > 0) {
    promptParts.push(`MUST INCLUDE: ${scenePlan.mustInclude.join(', ')}`);
  }

  // 第三优先级：环境与道具
  if (environmentAndProps) {
    promptParts.push(environmentAndProps);
  }

  // 第四优先级：构图与镜头
  promptParts.push(compositionAndCamera);

  // 第五优先级：光影色彩
  promptParts.push(lightingAndColor);

  // 第六优先级：风格
  promptParts.push(styleBlock);

  const rawCompiled = promptParts.filter(Boolean).join('. ');
  const compiledPrompt = sanitizePromptStrict(rawCompiled);

  // 8. Prompt Coverage Check — 检查视觉锚点覆盖率
  const anchors = scenePlan.visualAnchors || [];
  const promptLower = compiledPrompt.toLowerCase();
  const anchorsCovered: string[] = [];
  const anchorsMissing: string[] = [];

  for (const anchor of anchors) {
    // 检查锚点概念中的核心词是否出现在最终 Prompt 中
    const words = anchor.concept.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const coverageHits = words.filter(w => promptLower.includes(w));
    if (coverageHits.length >= Math.ceil(words.length * 0.4)) {
      anchorsCovered.push(anchor.concept);
    } else {
      anchorsMissing.push(anchor.concept);
    }
  }

  // 9. 自动补全缺失的高优先级锚点
  let finalPrompt = compiledPrompt;
  const highPriorityMissing = anchors
    .filter(a => a.priority >= 0.8 && anchorsMissing.includes(a.concept));

  if (highPriorityMissing.length > 0) {
    const patchStr = highPriorityMissing.map(a => a.concept).join(', ');
    finalPrompt = sanitizePromptStrict(`${compiledPrompt}. IMPORTANT DETAIL: ${patchStr}`);
    // 补全后重新统计覆盖
    for (const anchor of highPriorityMissing) {
      const idx = anchorsMissing.indexOf(anchor.concept);
      if (idx !== -1) {
        anchorsMissing.splice(idx, 1);
        anchorsCovered.push(anchor.concept);
      }
    }
  }

  const coverageScore = anchors.length > 0
    ? Math.round((anchorsCovered.length / anchors.length) * 100) / 100
    : 1.0;

  return {
    style: styleBlock,
    subjectAndAction,
    environmentAndProps,
    compositionAndCamera,
    lightingAndColor,
    negativeConstraints: allAvoid,
    compiledPrompt: finalPrompt,
    coverageScore,
    anchorsCovered,
    anchorsMissing,
  };
}

/**
 * 严格提示词净化器
 */
export function sanitizePromptStrict(p: string): string {
  if (!p) return '';
  return p
    // 去除十六进制颜色码与 RGB
    .replace(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/g, '')
    .replace(/rgba?\([^)]+\)/gi, '')
    .replace(/[（(]\s*#[^）)]*[）)]/g, '')
    // 去除内部标注交流词汇
    .replace(/[（(]\s*(图[0-9]+|标杆|推荐|参考)[^）)]*[）)]/g, '')
    // 彻底清除图片模型容易印出乱码的元词
    .replace(/(8k超清|8k高清|8k|4k|超高清|超清画质|超高分辨率|无水印|无水平|0水印|去除水印|去水印)/gi, '')
    .replace(/(排版整洁有序|排版整洁|排版整齐|整洁有序|排版规范|精致排版|版面整齐)/g, '')
    .replace(/(精致几何矢量构图|几何矢量构图|几何色块|几何拼接|七巧板式构图|七巧板|色块拼接)/g, '')
    .replace(/(指标卡片与数值对比|指标卡片|数值对比|指标卡|卡片看板)/g, '')
    .replace(/统一背景底色基调[：:]?/g, '')
    .replace(/统一核心主色调[：:]?/g, '')
    .replace(/统一辅助高亮\/警示色[：:]?/g, '')
    .replace(/禁止出现[：:]?/g, '')
    // 标点规整
    .replace(/([，,；;、]){2,}/g, '$1')
    .replace(/([。！!]){2,}/g, '。')
    .replace(/[，,；;、]\s*[。！!]/g, '。')
    .replace(/^[，,；;、\s]+/, '')
    .replace(/[，,；;、\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
