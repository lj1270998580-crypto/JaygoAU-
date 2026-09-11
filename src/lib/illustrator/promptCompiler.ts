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
import { layoutPromptText } from './layoutBible';

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
 * 剥离描述性文本中的单双引号，避免生图模型的 Text Encoder 把自然语言描述中的词当作需要印制的文字
 * 官方铁律：引号仅供文字白名单（textLabels）专属使用！
 */
function stripDescriptiveQuotes(s?: string): string {
  if (!s) return '';
  return s.replace(/[“""”‘’']/g, '').trim();
}

/**
 * 判断某个实体或短语是否已经在已有文本集合中充分表达
 * 避免在提示词中多处机械重复同一名词导致生图模型生成多重分身/重复实体
 */
function isEntityAlreadyCovered(entity: string, existingTexts: string[]): boolean {
  const e = (entity || '').trim().toLowerCase();
  if (!e) return true;
  for (const text of existingTexts) {
    if (!text) continue;
    const t = text.toLowerCase();
    if (t.includes(e) || e.includes(t)) return true;
    // 针对中文做 2 字滑窗重合度判定
    const cjk = e.replace(/[^\u4e00-\u9fff]/g, '');
    if (cjk.length >= 3) {
      let hits = 0;
      let total = 0;
      for (let i = 0; i + 2 <= cjk.length; i++) {
        total++;
        if (t.includes(cjk.slice(i, i + 2))) hits++;
      }
      if (total > 0 && hits / total >= 0.6) return true;
    }
  }
  return false;
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

  // 严格剥离实体描述中的引号（商汤官方铁律：双引号仅供最终印刷文字使用，叙述中的引号会导致模型在画布多处印刷重复文字）
  const cleanSubject = stripDescriptiveQuotes(scenePlan.scene.primarySubject);
  const cleanAction = stripDescriptiveQuotes(scenePlan.scene.action);
  const cleanForeground = stripDescriptiveQuotes(scenePlan.scene.foreground);
  const cleanBackground = stripDescriptiveQuotes(scenePlan.scene.background);
  const cleanAmbience = stripDescriptiveQuotes(scenePlan.scene.weatherOrAmbience);

  // 视觉锚点 —— 最高优先级的画面元素（剥离引号）
  const rawAnchors = (scenePlan.visualAnchors || [])
    .filter((a) => a && a.concept)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map((a) => stripDescriptiveQuotes(a.concept));

  // 智能实体去重：如果锚点词汇已在主体或动作中充分阐明，不再重复生成机械句子
  const existingSubjectTexts = [cleanSubject, cleanAction].filter(Boolean);
  const anchors = rawAnchors.filter((a) => !isEntityAlreadyCovered(a, existingSubjectTexts));
  const anchorList = joinList(anchors, 3);

  // 智能过滤 mustInclude（剥离引号）：凡是已被主体、动作或过滤后锚点包含的实体，不再重复罗列
  const mustInclude = (scenePlan.mustInclude || [])
    .map((item) => stripDescriptiveQuotes(item))
    .filter(Boolean)
    .filter((item) => !isEntityAlreadyCovered(item, [...existingSubjectTexts, ...anchors]));

  // 商汤及主流生图模型通用的抗重复、抗分身克隆、抗拼图负向词群（针对乱码字、假字、无关字强化）
  const ANTI_DUPLICATION_CONSTRAINTS = [
    '无关文字',
    '重复文字',
    '文字重影',
    '相同文字多处出现',
    '多余文字',
    '乱码字符',
    '假字',
    '伪文字',
    '表格乱码',
    '无意义字母',
    '错别字',
    '拼音',
    '多余标签',
    '重复人物',
    '相同人物副本',
    '克隆人',
    '分身重影',
    '多个相同角色',
    '画面分割',
    '左右分屏拼图',
    '九宫格拼贴',
    '多图拼接',
    '重复元素',
    '多余肢体',
  ];

  // 信息图「反模板化」约束必须排在前面 —— 它们是信息图不变成企业 PPT 的关键
  const INFO_ANTI_TEMPLATE = [
    '圆角卡片矩阵',
    '平均分栏的方格排版',
    'PPT SmartArt 样式',
    '大量小图标平铺堆砌',
    '标准企业模板感信息图',
    '白底商务蓝的套路配色',
    '表格乱码',
    '假数据表格',
  ];
  const infoAvoid = isInfographic
    ? INFO_ANTI_TEMPLATE.filter((a) => !(scenePlan.mustAvoid || []).includes(a))
    : [];

  const allAvoid = Array.from(
    new Set(
      [
        ...ANTI_DUPLICATION_CONSTRAINTS,
        ...infoAvoid,
        ...(scenePlan.mustAvoid || []),
        ...(styleBible.forbidden || []),
      ].filter(Boolean)
    )
  );

  const lines: string[] = [];
  let subjectAndAction: string;
  let environmentAndProps = '';
  let compositionAndCamera = '';
  let lightingAndColor = '';

  if (isInfographic) {
    // ————————————— 信息图：对齐商汤官方 sn-infographic 真实提示词规范 —————————————
    // 官方规范：
    // 1. 开头：一张专业信息图，采用...风格。整体布局为...结构。
    // 2. 彻底删除“观众视线不被打断”、“核心结论最醒目，模块标题次之”等设计元指令（避免被生图模型画成表格表头与单元格乱码字）！
    // 3. 任何禁止项均下发给 negativePrompt，正向提示词绝不包含“严禁分屏拼贴”等排斥语句。
    subjectAndAction = sentence(`一张专业信息图，采用${styleBible.visualMedium}风格`);
    lines.push(subjectAndAction);

    const layoutText = layoutPromptText(scenePlan.layout, scenePlan.visualType);
    if (layoutText) {
      lines.push(sentence(layoutText));
    }

    if (cleanSubject) {
      lines.push(sentence(`画面核心呈现${cleanSubject}`));
    }
    if (cleanAction) {
      lines.push(sentence(cleanAction));
    }

    if (anchorList) {
      lines.push(sentence(`视觉核心元素是${anchorList}`));
    }
    if (mustInclude.length > 0) {
      lines.push(sentence(`包含的关键视觉模块为：${joinList(mustInclude, 4)}`));
    }

    compositionAndCamera = sentence(`采用${shotDesc}，${angleDesc}`);
    lines.push(compositionAndCamera);

    lightingAndColor = sentence(
      `画面干净整洁，背景留白充裕，${styleBible.texture}，配色${tempDesc}，主色调为${paletteDesc}`
    );
    lines.push(lightingAndColor);
  } else {
    // ————————————— 叙事插画：画面描述优先的自然语言 —————————————
    const periodPart =
      scenePlan.scene.period && scenePlan.scene.period !== '当代现代' && scenePlan.scene.period !== '当代'
        ? `${scenePlan.scene.period}。`
        : '';

    subjectAndAction = sentence(`${periodPart}${cleanSubject}，${cleanAction}`);
    lines.push(subjectAndAction);

    // 单镜头单一主体正面引导（不带易被模型反向误画的排斥词）
    lines.push(
      sentence('单镜头完整画面，单一物理场景，主体人物全画面仅出现一位')
    );

    if (anchorList) {
      lines.push(sentence(`画面中必须清晰可辨的关键元素是：${anchorList}`));
    }
    if (mustInclude.length > 0) {
      lines.push(sentence(`画面中需要呈现的关键物件包括：${joinList(mustInclude, 4)}`));
    }

    const envBits: string[] = [];
    if (cleanForeground) envBits.push(`前景是${cleanForeground}`);
    if (cleanBackground) envBits.push(`背景是${cleanBackground}`);
    if (cleanAmbience) envBits.push(`整体氛围${cleanAmbience}`);
    environmentAndProps = sentence(envBits.join('，'));
    if (environmentAndProps) lines.push(environmentAndProps);

    compositionAndCamera = sentence(
      [`采用${shotDesc}`, angleDesc, scaleDesc, depthDesc].filter(Boolean).join('，')
    );
    lines.push(compositionAndCamera);

    const lensPart = styleBible.cameraLanguage?.recommendedLens
      ? `镜头质感${styleBible.cameraLanguage.recommendedLens}`
      : '';
    const rulePart = styleBible.cameraLanguage?.compositionRule
      ? `构图遵循${styleBible.cameraLanguage.compositionRule}`
      : '';
    const camLine = sentence([lensPart, rulePart].filter(Boolean).join('，'));
    if (camLine) lines.push(camLine);

    lightingAndColor = sentence(
      `${styleBible.lighting.type}，${styleBible.lighting.direction}${
        styleBible.lighting.shadow ? `，${styleBible.lighting.shadow}` : ''
      }，配色${tempDesc}，主色调为${paletteDesc}，${styleBible.texture}`
    );
    lines.push(lightingAndColor);

    lines.push(sentence(`整体视觉风格：${styleBible.visualMedium}`));
  }

  // ————————————— 画面内文字与元素（对齐商汤官方生图协议与去重防重影铁律）—————————————
  // 商汤官方铁律：
  // 1. 只有最终需要印刷在画面上的文字才允许使用双引号“...”！
  // 2. 文字必须简短，字数过多生图模型必定乱码重影；限制每条最多 10 个字，最多 3 条；
  // 3. 避免长串负向说教（反向引导模型关注），改用客观肯定句引导，负向词下发到 negativePrompt；
  const rawLabels = (scenePlan.textLabels || [])
    .map((t) => stripDescriptiveQuotes(t).trim())
    .filter((t) => t.length > 0 && t.length <= 12);
  const textLabels = Array.from(new Set(rawLabels)).slice(0, 3);
  const visualElements = (scenePlan.visualElements || [])
    .filter((e) => e && e.desc)
    .slice(0, 4);

  if (textLabels.length > 0) {
    const quoted = textLabels.map((t) => `“${t}”`).join('、');
    if (textLabels.length === 1) {
      lines.push(sentence(`画面对应位置标明核心文字：“${textLabels[0]}”`));
    } else {
      lines.push(sentence(`画面各对应位置分别精确标明文字：${quoted}`));
    }
    // 官方标准封闭文字约束
    lines.push(
      sentence(
        '除上述引号内的指定文字外，画面其他任何区域保持纯净，不出现多余文字、数字、标签或乱码字符'
      )
    );
  } else {
    lines.push(sentence('画面全图纯图形视觉呈现，不出现任何文字、数字、字母、标题或标签，画面无乱码字符'));
  }

  if (visualElements.length > 0) {
    // 纯化图形元素描述：绝不包含引号或文字后缀
    const desc = visualElements
      .map((e) => stripDescriptiveQuotes(e.desc || ''))
      .filter(Boolean)
      .join('；');
    if (desc) {
      lines.push(sentence(`画面中需要具体绘制的图形元素：${desc}`));
    }
  }

  const rawCompiled = lines.filter(Boolean).join('');
  const compiledPrompt = sanitizePromptStrict(rawCompiled);

  // 负向约束作为独立参数下发（扩大容量至 24 项，确保抗重复、抗分身克隆词群完整生效）
  const negativePrompt = Array.from(new Set(allAvoid.filter(Boolean)))
    .slice(0, 24)
    .join('，');

  // 视觉锚点覆盖检查（中文：整体包含 + 2 字滑窗命中率）
  const promptLower = compiledPrompt.toLowerCase();
  const anchorsCovered: string[] = [];
  const anchorsMissing: string[] = [];
  for (const anchor of scenePlan.visualAnchors || []) {
    if (!anchor || !anchor.concept) continue;
    const cleanConcept = stripDescriptiveQuotes(anchor.concept);
    if (isAnchorCovered(cleanConcept, promptLower)) anchorsCovered.push(cleanConcept);
    else anchorsMissing.push(cleanConcept);
  }

  // 高优先级锚点若仍未覆盖，直接补一句（正常情况下上一段已覆盖）
  let finalPrompt = compiledPrompt;
  const highPriorityMissing = (scenePlan.visualAnchors || []).filter(
    (a) => a?.concept && (a.priority || 0) >= 0.8 && anchorsMissing.includes(stripDescriptiveQuotes(a.concept))
  );
  if (highPriorityMissing.length > 0) {
    const trulyMissing = highPriorityMissing
      .map((a) => stripDescriptiveQuotes(a.concept))
      .filter((concept) => !isEntityAlreadyCovered(concept, [finalPrompt]));
    if (trulyMissing.length > 0) {
      const patchStr = trulyMissing.join('、');
      finalPrompt = sanitizePromptStrict(`${compiledPrompt}画面中包含${patchStr}。`);
      for (const anchor of trulyMissing) {
        const idx = anchorsMissing.indexOf(anchor);
        if (idx !== -1) {
          anchorsMissing.splice(idx, 1);
          anchorsCovered.push(anchor);
        }
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
    negativePrompt,
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
    // 彻底剔除可能被生图模型绘制成大标题的“信息版式采用【...】：”或“信息版式用”残余
    .replace(/信息版式[采使]?用[【\[]?[^】\]：:]*[】\]]?[：:]?/g, '')
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
