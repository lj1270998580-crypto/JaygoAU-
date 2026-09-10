// =========================================================================
// 模块 5: Prompt Compiler (确定性提示词编译器) - v3 中文母语版
// 核心升级（v3）：
// 1. 【语言统一】结构性标签全部改为中文 —— 商汤日日新 U1 系列为中文原生模型，
//    此前「英文骨架 + 中文血肉」的混血提示词会损失模型能力。
// 2. 【信息图独立编译】新增 visualType/type 参数，信息图走独立的图表化编译分支，
//    不再与普通叙事插画共用同一套编译逻辑（此前只有一个模型名切换）。
// 3. 【中文锚点覆盖检查】修复原实现用 length>3 过滤导致的空词表假阳性。
// =========================================================================

import type { ScenePlan, StyleBible, PromptBlocks, ShotType } from './types';

/**
 * 镜头景别的中文自然语言描述映射
 */
const SHOT_DESC_MAP: Record<ShotType, string> = {
  wide: '横向宽幅建立镜头',
  medium: '中景叙事镜头',
  close: '近景细节镜头',
  extreme_close: '特写微距镜头',
  overhead: '俯拍平铺视角',
};

/**
 * 机位角度中文映射
 */
const ANGLE_DESC_MAP: Record<string, string> = {
  eye_level: '平视视角',
  slightly_elevated: '略微俯视',
  low_angle: '低角度仰视',
  top_down: '垂直俯拍',
};

/**
 * 主体占比中文映射
 */
const SCALE_DESC_MAP: Record<string, string> = {
  dominant: '主体占据画面主导位置',
  balanced: '主体与环境均衡构图',
  environmental: '主体融入环境，强调空间关系',
};

/**
 * 层次中文映射
 */
const DEPTH_DESC_MAP: Record<string, string> = {
  deep: '深景深，前后层次清晰',
  shallow: '浅景深，背景虚化突出主体',
  layered: '多层景深，前景中景背景分明',
};

/**
 * 色温中文映射
 */
const TEMPERATURE_DESC_MAP: Record<string, string> = {
  warm: '暖色调',
  neutral: '中性色调',
  cool: '冷色调',
};

/**
 * 信息图专用：阅读路径与结构描述
 */
function buildInfographicStructure(scenePlan: ScenePlan): string {
  const modules = (scenePlan.mustInclude || []).filter(Boolean);
  const lines: string[] = [];

  lines.push(`核心信息：${scenePlan.communicationGoal}`);
  lines.push(`信息组织方式：${scenePlan.scene.primarySubject}。${scenePlan.scene.action}`);

  if (modules.length > 0) {
    lines.push('必须清晰呈现的信息模块：');
    modules.forEach((m, i) => {
      lines.push(`  ${i + 1}. ${m}`);
    });
  }

  lines.push('阅读路径：从左向右或从上向下自然推进，观众视线不被中断。');
  lines.push('信息层级：核心结论最醒目，模块标题次之，说明文字最小且简短。');
  lines.push('模块之间用真实的连线、箭头或流程关系连接，形成一目了然的整体结构。');
  lines.push('画面必须留出足够呼吸空间，元素不拥挤、不贴边。');

  return lines.join('\n');
}

/**
 * 将 ScenePlan 与 StyleBible 编译为纯净结构化中文提示词
 *
 * @param scenePlan  视觉导演产出的场景规划
 * @param styleBible 全局风格圣经
 * @param options.type 'infographic' 走信息图专用编译分支，'standard' 走叙事插画分支
 */
export function compileScenePrompt(
  scenePlan: ScenePlan,
  styleBible: StyleBible,
  options?: { type?: 'infographic' | 'standard' }
): PromptBlocks {
  const isInfographic = options?.type === 'infographic';

  // 1. 风格介质块（放在最前面建立基调，但不喧宾夺主）
  const styleBlock = styleBible.visualMedium;

  // 2. 镜头与机位（中文）
  const shotDesc = SHOT_DESC_MAP[scenePlan.composition.shot] || '中景镜头';
  const angleDesc = ANGLE_DESC_MAP[scenePlan.composition.cameraAngle] || '平视视角';
  const scaleDesc = SCALE_DESC_MAP[scenePlan.composition.subjectScale] || '';
  const depthDesc = DEPTH_DESC_MAP[scenePlan.composition.depth] || '';

  // 3. 主体与动作块 —— 信息图与叙事插画完全分离
  let subjectAndAction: string;
  let environmentAndProps: string;

  if (isInfographic) {
    // ---- 信息图分支：不描述「人物/场景」，而描述「信息结构与阅读路径」 ----
    subjectAndAction = buildInfographicStructure(scenePlan);
    environmentAndProps = '整体为信息可视化图版，不做真实场景叙事，不出现与信息无关的人物与道具。';
  } else {
    // ---- 叙事插画分支 ----
    subjectAndAction =
      `主体：${scenePlan.scene.primarySubject}。` +
      `动作与状态：${scenePlan.scene.action}。` +
      `画面目标：${scenePlan.communicationGoal}`;

    const envParts: string[] = [];
    if (scenePlan.scene.foreground) {
      envParts.push(`前景：${scenePlan.scene.foreground}`);
    }
    if (scenePlan.scene.background) {
      envParts.push(`背景：${scenePlan.scene.background}`);
    }
    if (scenePlan.scene.period && scenePlan.scene.period !== '当代现代' && scenePlan.scene.period !== '当代') {
      envParts.push(`时代背景：${scenePlan.scene.period}`);
    }
    if (scenePlan.scene.weatherOrAmbience) {
      envParts.push(`氛围：${scenePlan.scene.weatherOrAmbience}`);
    }
    environmentAndProps = envParts.join('。');
  }

  // 4. 机位构图块（中文）
  const compositionAndCamera =
    `${shotDesc}，${angleDesc}。` +
    (scaleDesc ? `${scaleDesc}。` : '') +
    (depthDesc ? `${depthDesc}。` : '') +
    `${styleBible.cameraLanguage.recommendedLens}，${styleBible.cameraLanguage.compositionRule}。`;

  // 5. 光影与色彩块（中文）
  const paletteDesc = styleBible.palette.dominantTones.slice(0, 3).join('、');
  const tempDesc = TEMPERATURE_DESC_MAP[styleBible.palette.temperature] || '中性色调';
  const lightingAndColor =
    `${styleBible.lighting.type}，${styleBible.lighting.direction}，${styleBible.lighting.shadow}。` +
    `${tempDesc}，主色调：${paletteDesc}。${styleBible.texture}。`;

  // 6. 负向约束
  const allAvoid = Array.from(
    new Set([...(scenePlan.mustAvoid || []), ...(styleBible.forbidden || [])])
  );

  // 信息图追加「反模板化」负向约束（避免出成企业 PPT / 圆角卡片矩阵）
  if (isInfographic) {
    const infoAvoid = [
      '圆角卡片矩阵',
      '平均分栏的方格排版',
      'PPT SmartArt 样式',
      '大量小图标平铺堆砌',
      '标准企业模板感信息图',
      '白底商务蓝配色套路',
    ];
    for (const a of infoAvoid) {
      if (!allAvoid.includes(a)) allAvoid.push(a);
    }
  }

  // 7. 按优先级组装
  const promptParts: string[] = [];

  if (isInfographic) {
    // 信息图：先讲清信息结构，再讲风格与禁令
    promptParts.push(`生成一张信息图（Infographic）。`);
    promptParts.push(subjectAndAction);
    promptParts.push(`必须包含的信息模块：${(scenePlan.mustInclude || []).join('、') || '核心结论与支撑要点'}。`);
    promptParts.push(compositionAndCamera);
    promptParts.push(lightingAndColor);
    promptParts.push(`整体视觉风格：${styleBlock}。`);
  } else {
    promptParts.push(subjectAndAction);
    if (scenePlan.mustInclude && scenePlan.mustInclude.length > 0) {
      promptParts.push(`必须出现的实体：${scenePlan.mustInclude.join('、')}。`);
    }
    if (environmentAndProps) {
      promptParts.push(environmentAndProps);
    }
    promptParts.push(compositionAndCamera);
    promptParts.push(lightingAndColor);
    promptParts.push(`整体视觉风格：${styleBlock}。`);
  }

  const rawCompiled = promptParts.filter(Boolean).join(' ');
  const compiledPrompt = sanitizePromptStrict(rawCompiled);

  // 8. 中文视觉锚点覆盖检查（修复原 length>3 空词表假阳性）
  const anchors = scenePlan.visualAnchors || [];
  const promptLower = compiledPrompt.toLowerCase();
  const anchorsCovered: string[] = [];
  const anchorsMissing: string[] = [];

  for (const anchor of anchors) {
    if (isAnchorCovered(anchor.concept, promptLower)) {
      anchorsCovered.push(anchor.concept);
    } else {
      anchorsMissing.push(anchor.concept);
    }
  }

  // 9. 自动补全缺失的高优先级锚点
  let finalPrompt = compiledPrompt;
  const highPriorityMissing = anchors.filter(
    (a) => a.priority >= 0.8 && anchorsMissing.includes(a.concept)
  );

  if (highPriorityMissing.length > 0) {
    const patchStr = highPriorityMissing.map((a) => a.concept).join('、');
    finalPrompt = sanitizePromptStrict(`${compiledPrompt} 画面中必须明确出现：${patchStr}。`);
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
 * 中文/英文混合锚点的覆盖判定
 * 中文没有空格分词，改用「整体包含 + 2 字滑窗命中率」双判据，
 * 修复原实现 split(/\s+/).filter(w => w.length > 3) 在中文下产生空词表、
 * 从而把任意锚点都判为「已覆盖」的假阳性问题。
 */
function isAnchorCovered(concept: string, promptLower: string): boolean {
  const c = (concept || '').toLowerCase().trim();
  if (!c) return true;

  // 1) 整体包含：最直接
  if (promptLower.includes(c)) return true;

  // 2) 按空格拆英文单词，保留长度 >= 3 的 token
  const latinTokens = c.split(/\s+/).filter((w) => /[a-z0-9]/.test(w) && w.length >= 3);
  if (latinTokens.length > 0) {
    const hits = latinTokens.filter((w) => promptLower.includes(w)).length;
    if (hits / latinTokens.length >= 0.6) return true;
  }

  // 3) 中文 2 字滑窗命中率（过滤掉纯标点与单字噪声）
  const cjkOnly = c.replace(/[^\u4e00-\u9fff]/g, '');
  if (cjkOnly.length >= 4) {
    let total = 0;
    let hit = 0;
    for (let i = 0; i + 2 <= cjkOnly.length; i++) {
      const gram = cjkOnly.slice(i, i + 2);
      total++;
      if (promptLower.includes(gram)) hit++;
    }
    if (total > 0 && hit / total >= 0.6) return true;
  }

  return false;
}

/**
 * 严格提示词净化器
 * 注意：这里剔除的是「图片模型会把中文元词直接画到画面上」的词，
 * 因此下游 Electron 主进程不得再把同类词重新追加回来（见 electron/main.ts）。
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
    // 彻底清除图片模型容易印出乱码的元词（含"水印"类，避免被画成水印图案）
    .replace(/(8k超清|8k高清|8k|4k|超高清|超清画质|超高分辨率|无水印|无水平|0水印|去除水印|去水印|避免任何水印|水印)/gi, '')
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
    .replace(/([。！!])\s*([。！!])/g, '$1')
    .replace(/^[，,；;、\s]+/, '')
    .replace(/[，,；;、\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
