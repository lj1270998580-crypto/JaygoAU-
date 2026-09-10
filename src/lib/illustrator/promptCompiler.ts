// =========================================================================
// 模块 5: Prompt Compiler (提示词编译器) - v4 自然语言导演简报版
//
// v4 关键改动（针对「提示词太复杂、出图效果不好」的反馈）：
// 此前输出的是「标签堆叠式」提示词，例如：
//   主体：一间空荡的办公室…。动作与状态：最后一名员工…。
//   必须出现的实体：…。前景：…。背景：…。氛围：…。
//   近景细节镜头，平视视角。主体占据画面主导位置。浅景深…
// 这种形式对人类可读性尚可，但对生图模型而言是一串彼此割裂的标签，
// 缺少主语与叙述连贯性，模型难以建立完整画面。
//
// 现在改为**自然语言画面描述**（导演简报式），例如：
//   一间空荡的办公室，椅子翻倒在地，文件散落各处，门上贴着停业告示。
//   最后一名员工抱着纸箱走出已经关闭的办公室。
//   画面中必须清晰出现散落的文件与翻倒的物件。前景是…
//   背景是光线昏暗的办公走廊，整体氛围通透自然光影。
//   采用近景细节镜头，平视视角，主体占据画面主导位置。
//   整体视觉风格：现代高级商业扁平矢量插画…
//   禁止出现：三维塑料感、漂浮的乱码色块。
//
// 同时修复：视觉锚点此前从不写入提示词正文（只在覆盖率检查不达标时才补一句），
// 而锚点恰恰是「让观众一眼认出这段内容」的最关键元素，现改为显式呈现。
// =========================================================================

import type { ScenePlan, StyleBible, PromptBlocks, ShotType } from './types';

const SHOT_DESC_MAP: Record<ShotType, string> = {
  wide: '横向宽幅的建立镜头',
  medium: '中景叙事镜头',
  close: '近景细节镜头',
  extreme_close: '特写微距镜头',
  overhead: '俯拍平铺视角',
};

const ANGLE_DESC_MAP: Record<string, string> = {
  eye_level: '平视视角',
  slightly_elevated: '略微俯视',
  low_angle: '低角度仰视',
  top_down: '垂直俯拍',
};

const SCALE_DESC_MAP: Record<string, string> = {
  dominant: '主体占据画面主导位置',
  balanced: '主体与环境均衡',
  environmental: '主体融入环境，强调空间关系',
};

const DEPTH_DESC_MAP: Record<string, string> = {
  deep: '景深很深，前后层次清晰',
  shallow: '浅景深，背景虚化突出主体',
  layered: '多层景深，前景中景背景分明',
};

const TEMPERATURE_DESC_MAP: Record<string, string> = {
  warm: '整体偏暖',
  neutral: '整体中性',
  cool: '整体偏冷',
};

/** 中文标点收尾，避免出现「。」拼接重复 */
function sentence(s: string): string {
  const t = (s || '').trim();
  if (!t) return '';
  return /[。！？；，]$/.test(t) ? t : `${t}。`;
}

/** 把数组拼成自然中文列举 */
function joinList(items: string[], max = 6): string {
  const arr = (items || []).filter(Boolean).slice(0, max);
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return `${arr.slice(0, -1).join('、')}和${arr[arr.length - 1]}`;
}

/**
 * 将 ScenePlan 与 StyleBible 编译为自然语言中文提示词
 */
export function compileScenePrompt(
  scenePlan: ScenePlan,
  styleBible: StyleBible,
  options?: { type?: 'infographic' | 'standard' }
): PromptBlocks {
  const isInfographic = options?.type === 'infographic';

  const shotDesc = SHOT_DESC_MAP[scenePlan.composition.shot] || '中景镜头';
  const angleDesc = ANGLE_DESC_MAP[scenePlan.composition.cameraAngle] || '平视视角';
  const scaleDesc = SCALE_DESC_MAP[scenePlan.composition.subjectScale] || '';
  const depthDesc = DEPTH_DESC_MAP[scenePlan.composition.depth] || '';
  const tempDesc = TEMPERATURE_DESC_MAP[styleBible.palette.temperature] || '整体中性';
  const paletteDesc = joinList(styleBible.palette.dominantTones.slice(0, 3), 3);

  // 视觉锚点 —— 最高优先级的画面元素，必须显式进入提示词
  const anchors = (scenePlan.visualAnchors || [])
    .filter((a) => a && a.concept)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map((a) => a.concept);
  const anchorList = joinList(anchors, 4);

  const mustInclude = (scenePlan.mustInclude || []).filter(Boolean);

  // 信息图「反模板化」约束必须排在最前面 —— 它们是信息图不变成企业 PPT 的关键，
  // 而负向词列表有长度上限，排在后面前会被截断掉（v0.7.7 修复）。
  const INFO_ANTI_TEMPLATE = [
    '圆角卡片矩阵',
    '平均分栏的方格排版',
    'PPT SmartArt 样式',
    '大量小图标平铺堆砌',
    '标准企业模板感信息图',
    '白底商务蓝的套路配色',
  ];
  const infoAvoid = isInfographic
    ? INFO_ANTI_TEMPLATE.filter((a) => !(scenePlan.mustAvoid || []).includes(a))
    : [];

  const allAvoid = Array.from(
    new Set(
      [...infoAvoid, ...(scenePlan.mustAvoid || []), ...(styleBible.forbidden || [])].filter(Boolean)
    )
  );

  const lines: string[] = [];
  let subjectAndAction: string;
  let environmentAndProps: string;
  let compositionAndCamera: string;
  let lightingAndColor: string;

  if (isInfographic) {
    // ————————————— 信息图：信息结构优先的自然语言描述 —————————————
    const goal = (scenePlan.communicationGoal || '').replace(/^1秒读懂[：:]?\s*/, '');
    subjectAndAction = sentence(
      `一张清晰的信息图，要传达的核心信息是：${goal || scenePlan.scene.primarySubject}`
    );

    lines.push(subjectAndAction);
    lines.push(
      sentence(
        `画面以${scenePlan.scene.primarySubject}的方式组织信息，${scenePlan.scene.action}`
      )
    );

    if (anchorList) {
      lines.push(sentence(`视觉上必须一眼可辨的核心元素是：${anchorList}`));
    }
    if (mustInclude.length > 0) {
      lines.push(sentence(`需要清晰呈现的信息模块包括：${joinList(mustInclude, 6)}`));
    }

    environmentAndProps = sentence(
      '信息按从左到右或从上到下的顺序自然推进，观众视线不被打断'
    );
    lines.push(environmentAndProps);
    lines.push(sentence('核心结论最醒目，模块标题次之，说明文字最小且简短'));
    lines.push(sentence('模块之间用真实的连线、箭头或流程关系连接，整体结构一目了然'));
    lines.push(sentence('画面留出充足呼吸空间，元素不拥挤、不贴边，整体不做成多张独立卡片的拼贴'));

    compositionAndCamera = sentence(`采用${shotDesc}，${angleDesc}`);
    lines.push(compositionAndCamera);

    lightingAndColor = sentence(
      `配色${tempDesc}，主色调为${paletteDesc}，${styleBible.lighting.type}`
    );
    lines.push(lightingAndColor);
  } else {
    // ————————————— 叙事插画：画面描述优先的自然语言 —————————————
    const periodPart =
      scenePlan.scene.period && scenePlan.scene.period !== '当代现代' && scenePlan.scene.period !== '当代'
        ? `${scenePlan.scene.period}。`
        : '';

    subjectAndAction = sentence(`${periodPart}${scenePlan.scene.primarySubject}，${scenePlan.scene.action}`);
    lines.push(subjectAndAction);

    if (anchorList) {
      lines.push(sentence(`画面中必须清晰可辨的关键元素是：${anchorList}`));
    }
    if (mustInclude.length > 0) {
      lines.push(sentence(`画面中必须出现${joinList(mustInclude, 5)}`));
    }

    const envBits: string[] = [];
    if (scenePlan.scene.foreground) envBits.push(`前景是${scenePlan.scene.foreground}`);
    if (scenePlan.scene.background) envBits.push(`背景是${scenePlan.scene.background}`);
    if (scenePlan.scene.weatherOrAmbience) envBits.push(`整体氛围${scenePlan.scene.weatherOrAmbience}`);
    environmentAndProps = sentence(envBits.join('，'));
    if (environmentAndProps) lines.push(environmentAndProps);

    compositionAndCamera = sentence(
      [`采用${shotDesc}`, angleDesc, scaleDesc, depthDesc].filter(Boolean).join('，')
    );
    lines.push(compositionAndCamera);

    lightingAndColor = sentence(
      `${styleBible.lighting.type}，${styleBible.lighting.direction}，配色${tempDesc}，主色调为${paletteDesc}，${styleBible.texture}`
    );
    lines.push(lightingAndColor);
  }

  // 风格基调（放在描述之后，避免喧宾夺主）
  lines.push(sentence(`整体视觉风格：${styleBible.visualMedium}`));

  // 负向约束统一放最后，用一句明确的中文表达（信息图给更高上限，保证反模板词不被截断）
  if (allAvoid.length > 0) {
    lines.push(`禁止出现：${joinList(allAvoid, isInfographic ? 10 : 8)}。`);
  }

  const rawCompiled = lines.filter(Boolean).join('');
  const compiledPrompt = sanitizePromptStrict(rawCompiled);

  // 视觉锚点覆盖检查（中文：整体包含 + 2 字滑窗命中率）
  const promptLower = compiledPrompt.toLowerCase();
  const anchorsCovered: string[] = [];
  const anchorsMissing: string[] = [];
  for (const anchor of scenePlan.visualAnchors || []) {
    if (!anchor || !anchor.concept) continue;
    if (isAnchorCovered(anchor.concept, promptLower)) anchorsCovered.push(anchor.concept);
    else anchorsMissing.push(anchor.concept);
  }

  // 高优先级锚点若仍未覆盖，直接补一句（正常情况下上一段已覆盖）
  let finalPrompt = compiledPrompt;
  const highPriorityMissing = (scenePlan.visualAnchors || []).filter(
    (a) => a?.concept && (a.priority || 0) >= 0.8 && anchorsMissing.includes(a.concept)
  );
  if (highPriorityMissing.length > 0) {
    const patchStr = highPriorityMissing.map((a) => a.concept).join('、');
    finalPrompt = sanitizePromptStrict(`${compiledPrompt}画面中必须明确出现${patchStr}。`);
    for (const anchor of highPriorityMissing) {
      const idx = anchorsMissing.indexOf(anchor.concept);
      if (idx !== -1) {
        anchorsMissing.splice(idx, 1);
        anchorsCovered.push(anchor.concept);
      }
    }
  }

  const coverageScore =
    (scenePlan.visualAnchors || []).length > 0
      ? Math.round((anchorsCovered.length / scenePlan.visualAnchors.length) * 100) / 100
      : 1.0;

  return {
    style: styleBible.visualMedium,
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
 */
function isAnchorCovered(concept: string, promptLower: string): boolean {
  const c = (concept || '').toLowerCase().trim();
  if (!c) return true;
  if (promptLower.includes(c)) return true;

  const latinTokens = c.split(/\s+/).filter((w) => /[a-z0-9]/.test(w) && w.length >= 3);
  if (latinTokens.length > 0) {
    const hits = latinTokens.filter((w) => promptLower.includes(w)).length;
    if (hits / latinTokens.length >= 0.6) return true;
  }

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
 * 剔除会被生图模型直接画到画面上的中文元词（含"水印"类，避免被画成水印图案）。
 */
export function sanitizePromptStrict(p: string): string {
  if (!p) return '';
  return p
    .replace(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/g, '')
    .replace(/rgba?\([^)]+\)/gi, '')
    .replace(/[（(]\s*#[^）)]*[）)]/g, '')
    .replace(/[（(]\s*(图[0-9]+|标杆|推荐|参考)[^）)]*[）)]/g, '')
    // 生图模型会把这类中文元词直接绘制成画面上的乱码字或水印图案
    .replace(/(8k超清|8k高清|8k|4k|超高清|超清画质|超高分辨率|无水印|无水平|0水印|去除水印|去水印|避免任何水印|水印)/gi, '')
    .replace(/(排版整洁有序|排版整洁|排版整齐|整洁有序|排版规范|精致排版|版面整齐)/g, '')
    .replace(/(精致几何矢量构图|几何矢量构图|几何色块|几何拼接|七巧板式构图|七巧板|色块拼接)/g, '')
    .replace(/(指标卡片与数值对比|指标卡片|数值对比|指标卡|卡片看板)/g, '')
    .replace(/统一背景底色基调[：:]?/g, '')
    .replace(/统一核心主色调[：:]?/g, '')
    .replace(/统一辅助高亮\/警示色[：:]?/g, '')
    // 标点规整
    .replace(/([，,；;、]){2,}/g, '$1')
    .replace(/([。！!]){2,}/g, '。')
    .replace(/[，,；;、]\s*[。！!]/g, '。')
    .replace(/^[，,；;、\s]+/, '')
    .replace(/[，,；;、\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
