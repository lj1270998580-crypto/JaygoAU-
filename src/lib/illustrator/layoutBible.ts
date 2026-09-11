// =========================================================================
// v0.7.19：版式（Layout）规范库
//
// 来源：SenseNova 官方 sn-infographic 技能（87 种布局 / 66 种风格）。
// https://github.com/OpenSenseNova/SenseNova-Skills
//
// 官方把「版式」和「画风」拆成**两条独立的轴**：
//   - 版式 layout：信息怎么排（对比、流程、层级、仪表盘…）
//   - 画风 style ：画面长什么样（扁平、水墨、黏土、赛博…）
//
// 而本项目此前只有画风轴、完全没有版式轴 —— 所有信息图都只能靠模型自由发挥，
// 结果就是永远长成「标题 + 几个卡片」那一个样子。这里补上版式轴。
//
// 官方选择逻辑（references/layout-style-selection.md）：
//   按 data_type 查出主选版式（权重 10）与备选（权重 9），再掺入少量随机项，
//   加权随机抽取 —— 刻意保留随机性，避免每条视频都长一个样。
// =========================================================================

import type { VisualType } from './types';

export interface LayoutSpec {
  id: string;
  /** 中文展示名 */
  label: string;
  /** 一句话说明 */
  desc: string;
  /** 直接进入提示词的版式描述 */
  prompt: string;
}

/**
 * 版式目录。
 * 取自官方 references/layouts/ 的命名，此处收录与本工具题材相关的部分。
 */
export const LAYOUTS: Record<string, LayoutSpec> = {
  // —— 流程 / 时间线 ——
  'linear-progression': {
    id: 'linear-progression',
    label: '线性推进',
    desc: '左到右 / 上到下的单向步骤推进',
    prompt: '信息沿单一方向（从左到右或从上到下）依次推进，每一步之间有明确的箭头或连线，读者视线不回头',
  },
  'step-staircase': {
    id: 'step-staircase',
    label: '阶梯递进',
    desc: '像台阶一样逐级上升',
    prompt: '信息呈阶梯状逐级抬升排列，每一级比前一级更高一阶，用高度差直观表达递进与累积',
  },
  'winding-roadmap': {
    id: 'winding-roadmap',
    label: '蜿蜒路线',
    desc: '一条蜿蜒路径串起多个节点',
    prompt: '一条蜿蜒曲折的路径贯穿整个画面，路径上分布若干关键节点，适合表达有起伏的过程或历程',
  },
  'one-way-flow': {
    id: 'one-way-flow',
    label: '单向流动',
    desc: '强调单一方向的流动感',
    prompt: '画面强化单一方向的流动感，元素沿同一方向排布并带有速度与方向暗示',
  },
  'funnel': {
    id: 'funnel',
    label: '漏斗收束',
    desc: '由宽到窄层层筛选',
    prompt: '信息从上到下由宽变窄形成漏斗，逐层筛选收敛到最终结果',
  },
  'circular-flow': {
    id: 'circular-flow',
    label: '循环闭环',
    desc: '首尾相接的循环',
    prompt: '元素沿环形排布并首尾相接，形成闭环，强调循环往复、周而复始',
  },
  's-curve': {
    id: 's-curve',
    label: 'S 形曲线',
    desc: '柔和的 S 形走势',
    prompt: '信息沿柔和的 S 形曲线展开，节奏有起伏但不中断',
  },

  // —— 对比 ——
  'binary-comparison': {
    id: 'binary-comparison',
    label: '二元对比',
    desc: '左右分栏的正反对比',
    prompt: '画面分为明确的左右两栏，两侧并列展示对立的两方，中间可用分隔线或对照轴线强化对比关系',
  },
  'conflict-contrast': {
    id: 'conflict-contrast',
    label: '冲突对峙',
    desc: '强化张力的正面对撞',
    prompt: '两股力量在画面中正面对撞形成张力，用倾斜、挤压或色彩冲突表达对抗关系',
  },
  'four-quadrant-grid': {
    id: 'four-quadrant-grid',
    label: '四象限',
    desc: '横纵两轴切成四格',
    prompt: '画面用横纵两条轴线切成四个象限，每个象限承载一类情况，适合二维分类',
  },
  'visual-tension': {
    id: 'visual-tension',
    label: '视觉张力',
    desc: '用失衡构图制造紧张感',
    prompt: '刻意采用失衡、倾斜、重心偏移的构图制造紧张感，强调矛盾与风险',
  },

  // —— 层级 / 结构 ——
  'hierarchical-layers': {
    id: 'hierarchical-layers',
    label: '层级堆叠',
    desc: '上下分层的结构',
    prompt: '信息按层级从上到下或从后到前堆叠，层与层之间有明确的从属与包含关系',
  },
  'axial-expansion': {
    id: 'axial-expansion',
    label: '轴向展开',
    desc: '从一个中心轴向外展开',
    prompt: '以一个中心轴或核心节点为起点，向两侧或四周逐级展开分支',
  },
  'deconstruction': {
    id: 'deconstruction',
    label: '结构拆解',
    desc: '把整体拆成零件',
    prompt: '把一个整体拆解为若干组成部件并平铺展示，每个部件标注其作用，适合讲清构成',
  },
  'structural-breakdown': {
    id: 'structural-breakdown',
    label: '结构剖析',
    desc: '剖开看内部构造',
    prompt: '以剖面或透视方式展示对象内部构造，各组成部分清晰可辨',
  },
  'containerization': {
    id: 'containerization',
    label: '容器分区',
    desc: '用容器把内容分组',
    prompt: '用清晰的容器（框、卡片、托盘）把内容分组收纳，组与组之间界限分明但不做拼贴堆砌',
  },

  // —— 关系 ——
  'hub-spoke': {
    id: 'hub-spoke',
    label: '中心辐射',
    desc: '一个中心连向多个外围',
    prompt: '一个核心元素位于画面中心，多条连线从中心辐射到外围若干节点，表达一对多的关系',
  },
  'venn-diagram': {
    id: 'venn-diagram',
    label: '维恩交集',
    desc: '圆与圆的重叠区',
    prompt: '用相互重叠的圆形区域表达集合关系，重叠部分承载共同点，是表达「交集」最直接的形式',
  },
  'jigsaw': {
    id: 'jigsaw',
    label: '拼图嵌合',
    desc: '像拼图一样互相咬合',
    prompt: '若干块状元素像拼图一样互相咬合拼成一个整体，强调各部分缺一不可',
  },
  'multi-focal': {
    id: 'multi-focal',
    label: '多中心并列',
    desc: '多个同等重要的焦点',
    prompt: '画面中存在多个同等重要的视觉焦点，彼此并列而非主从，适合表达多方并列的局面',
  },
  'bridge': {
    id: 'bridge',
    label: '桥梁连接',
    desc: '用桥连接两端',
    prompt: '用一座桥或连接结构把两个原本分离的部分连起来，强调打通与过渡',
  },

  // —— 数据 / 指标 ——
  dashboard: {
    id: 'dashboard',
    label: '仪表盘',
    desc: '多个指标卡组成的看板',
    prompt: '由若干关键指标模块组成的专业看板，每个指标有明确数值与主次层级，数据是画面主角',
  },
  'data-landscape': {
    id: 'data-landscape',
    label: '数据地貌',
    desc: '把数据做成地形起伏',
    prompt: '把数据的高低起伏表现为地形或景观的高低，用空间感承载数量关系',
  },
  'swiss-grid': {
    id: 'swiss-grid',
    label: '瑞士网格',
    desc: '严格网格与理性留白',
    prompt: '严格遵循网格系统排版，栏与栏对齐精准，大量理性留白，排版本身即风格',
  },
  'hard-alignment': {
    id: 'hard-alignment',
    label: '硬对齐',
    desc: '所有元素严格对齐',
    prompt: '所有元素的边缘严格对齐到同几条基准线上，用秩序感传达严谨',
  },
  'periodic-table': {
    id: 'periodic-table',
    label: '元素周期表',
    desc: '规则方格阵列',
    prompt: '内容以规则方格阵列排布，每个方格承载一个独立条目，适合分类齐全的清单',
  },
  'bento-grid': {
    id: 'bento-grid',
    label: '便当格',
    desc: '大小不一的格子拼盘',
    prompt: '大小不等的矩形格子拼合成一个整体版面，主次格大小差异明显，整体边界整齐',
  },
  'tile-layout': {
    id: 'tile-layout',
    label: '瓦片平铺',
    desc: '等大瓦片整齐平铺',
    prompt: '等大的瓦片整齐平铺，节奏均匀，适合并列关系的一组内容',
  },
  'skewed-grid': {
    id: 'skewed-grid',
    label: '倾斜网格',
    desc: '带角度的动感网格',
    prompt: '网格整体带有统一倾角，在秩序中注入动感',
  },

  // —— 单一焦点 ——
  'single-focal-point': {
    id: 'single-focal-point',
    label: '单点聚焦',
    desc: '画面只有一个主角',
    prompt: '画面只有一个绝对主角，其余元素全部退为陪衬，视线被牢牢锁定在一点',
  },
  'big-typography': {
    id: 'big-typography',
    label: '大字排版',
    desc: '文字本身即画面主体',
    prompt: '极少数几个字被放大到占据画面主体，文字本身就是构图，图形元素退居其次',
  },
  'ultra-minimalist': {
    id: 'ultra-minimalist',
    label: '极简留白',
    desc: '极少元素 + 大量空白',
    prompt: '画面元素极少，大面积留白，靠一个精准的元素和留白关系传达含义',
  },
  'center-focus': {
    id: 'center-focus',
    label: '中心构图',
    desc: '主体居中对称',
    prompt: '主体居中放置形成稳定的对称构图，四周元素向其汇聚',
  },
  'golden-ratio-split': {
    id: 'golden-ratio-split',
    label: '黄金分割',
    desc: '按黄金比例划分版面',
    prompt: '版面按黄金比例划分主次区域，视觉重心落在黄金分割点上',
  },
  'macro-closeup': {
    id: 'macro-closeup',
    label: '微距特写',
    desc: '贴近放大局部细节',
    prompt: '镜头贴近被摄物，只呈现局部细节并被放大到充满画面，靠质感与细节说话',
  },
  'single-object-art': {
    id: 'single-object-art',
    label: '单物陈列',
    desc: '一个物体的静物式呈现',
    prompt: '画面中只有一个被精心摆放的物体，用光影与材质把它讲清楚',
  },

  // —— 叙事 ——
  'comic-strip': {
    id: 'comic-strip',
    label: '连环画格',
    desc: '分格讲述连续情节',
    prompt: '画面分成若干连续的分格，像连环画一样按顺序讲述一个有先后的小情节',
  },
  storyboard: {
    id: 'storyboard',
    label: '故事板',
    desc: '电影分镜式的画面序列',
    prompt: '以电影分镜故事板的形式并排展示若干个关键画面瞬间',
  },
  'story-mountain': {
    id: 'story-mountain',
    label: '故事山',
    desc: '起承转合的起伏曲线',
    prompt: '用一条起伏的山形曲线承载叙事节奏，标出起点、上升、高潮与回落',
  },
  'emotional-gradient': {
    id: 'emotional-gradient',
    label: '情绪渐变',
    desc: '用色彩渐变表达情绪推移',
    prompt: '用色彩与明度的连续渐变表达情绪的推移变化',
  },
  'left-image-right-text': {
    id: 'left-image-right-text',
    label: '左图右文',
    desc: '经典的图文分栏',
    prompt: '画面左半部分是主视觉图形，右半部分是与之对应的说明文字，图文严格分区',
  },
  'panorama': {
    id: 'panorama',
    label: '全景铺陈',
    desc: '横向展开的宽幅全景',
    prompt: '横向展开一幅宽幅全景，多个场景元素在同一水平线上铺陈',
  },

  // —— 场景 / 空间 ——
  'multi-scale': {
    id: 'multi-scale',
    label: '多尺度',
    desc: '宏观与微观同框',
    prompt: '同时呈现宏观整体与微观局部，用尺度对比建立联系',
  },
  'isometric-map': {
    id: 'isometric-map',
    label: '等距地图',
    desc: '俯视的空间布局图',
    prompt: '以等距俯视视角呈现一个空间布局，各区域位置关系一目了然',
  },
  'strong-perspective': {
    id: 'strong-perspective',
    label: '强透视',
    desc: '夸张的透视纵深',
    prompt: '使用夸张的透视关系制造强烈纵深，引导视线冲向远方',
  },
  'scene-unfolding': {
    id: 'scene-unfolding',
    label: '场景展开',
    desc: '像画卷一样缓缓展开',
    prompt: '画面像画卷一样自一侧向另一侧徐徐展开，内容随视线移动逐步显露',
  },

  // —— 营销 / 报告 ——
  'z-pattern': {
    id: 'z-pattern',
    label: 'Z 字视线',
    desc: '按 Z 字路径引导视线',
    prompt: '按 Z 字形路径安排元素，引导视线从左上到右下自然扫过',
  },
  'header-body': {
    id: 'header-body',
    label: '标题正文',
    desc: '常规的标题加正文结构',
    prompt: '顶部是醒目的标题区，下方是承载正文的主体区，层级清晰',
  },
  'heading-subheading': {
    id: 'heading-subheading',
    label: '主副标题',
    desc: '主标题与副标题分层',
    prompt: '主标题与副标题形成明确的字号与层级差，副标题对主标题做补充限定',
  },
  'editorial-vogue': {
    id: 'editorial-vogue',
    label: '杂志大片',
    desc: '时尚杂志式的大开本排版',
    prompt: '采用时尚杂志式排版，大字号标题与图片形成强烈对比，留白讲究',
  },
  'newspaper-collage': {
    id: 'newspaper-collage',
    label: '报纸拼贴',
    desc: '剪报拼贴的版面',
    prompt: '由剪报、纸条、图钉拼贴而成，带有强烈的手工与纪实气息',
  },
  'generous-margins': {
    id: 'generous-margins',
    label: '宽裕留白',
    desc: '大边距的高级感',
    prompt: '四周留出宽裕的边距，内容被优雅地框在中央，传达高级与从容',
  },
  'full-bleed-image': {
    id: 'full-bleed-image',
    label: '满版出血',
    desc: '图片铺满整个画面',
    prompt: '主视觉图像铺满整个画面不留边框，文字叠加其上',
  },
  'diagonal-composition': {
    id: 'diagonal-composition',
    label: '对角线构图',
    desc: '沿对角线布置元素',
    prompt: '主要元素沿对角线方向布置，制造动势与不稳定感',
  },
  'nonlinear-path': {
    id: 'nonlinear-path',
    label: '非线性路径',
    desc: '不规则的探索路径',
    prompt: '路径不规则、有分叉与回环，强调探索与发现的过程',
  },
};

/** 版式 id 是否有效 */
export function isValidLayout(id: string): boolean {
  return Boolean(LAYOUTS[id]);
}

/**
 * v0.7.19：数据形态 → 候选版式。
 *
 * 直接采用官方 references/layout-style-selection.md 的映射表，
 * 并把本工具的视觉类型（VisualType）对应到官方 data_type。
 */
export const DATA_TYPE_TO_LAYOUTS: Record<string, { primary: string; alternatives: string[] }> = {
  'comparison': { primary: 'binary-comparison', alternatives: ['four-quadrant-grid', 'conflict-contrast', 'visual-tension'] },
  'process': { primary: 'linear-progression', alternatives: ['step-staircase', 'funnel', 'one-way-flow', 'swimlane'] },
  'data': { primary: 'dashboard', alternatives: ['periodic-table', 'data-landscape', 'hard-alignment', 'swiss-grid'] },
  'hierarchy': { primary: 'hierarchical-layers', alternatives: ['axial-expansion', 'deconstruction'] },
  'relationships': { primary: 'hub-spoke', alternatives: ['jigsaw', 'multi-focal', 'venn-diagram'] },
  'timeline': { primary: 'linear-progression', alternatives: ['winding-roadmap', 'step-staircase', 'one-way-flow'] },
  'journey': { primary: 'winding-roadmap', alternatives: ['story-mountain', 'comic-strip', 'emotional-gradient', 'storyboard', 'panorama'] },
  'overview': { primary: 'bento-grid', alternatives: ['periodic-table', 'tile-layout', 'panorama', 'golden-ratio-split'] },
  'problem': { primary: 'iceberg', alternatives: ['conflict-contrast', 'visual-tension', 'funnel', 'bridge'] },
  'categories': { primary: 'periodic-table', alternatives: ['bento-grid', 'tile-layout', 'skewed-grid'] },
  'spatial': { primary: 'multi-scale', alternatives: ['strong-perspective', 'panorama', 'isometric-map'] },
  'catalog': { primary: 'modular-repetition', alternatives: ['bento-grid', 'containerization', 'tile-layout'] },
  'spotlight': { primary: 'single-focal-point', alternatives: ['big-typography', 'ultra-minimalist', 'center-focus', 'macro-closeup', 'single-object-art', 'golden-ratio-split'] },
  'narrative': { primary: 'comic-strip', alternatives: ['storyboard', 'left-image-right-text', 'panorama', 'scene-unfolding'] },
  'report': { primary: 'header-body', alternatives: ['swiss-grid', 'hard-alignment', 'heading-subheading', 'editorial-vogue'] },
  'marketing': { primary: 'z-pattern', alternatives: ['tile-layout', 'editorial-vogue', 'generous-margins', 'full-bleed-image', 'diagonal-composition'] },
};

/** 本工具的视觉类型 → 官方 data_type */
export const VISUAL_TYPE_TO_DATA_TYPE: Record<VisualType, string> = {
  data_stat: 'data',
  vs_comparison: 'comparison',
  step_framework: 'process',
  scene_narrative: 'narrative',
  concept_metaphor: 'spotlight',
  historical_recreation: 'timeline',
  product_showcase: 'catalog',
};

/**
 * 为某个视觉类型生成候选版式清单（供规划大模型从中挑选）。
 */
export function layoutCandidatesFor(visualType: VisualType): string[] {
  const dataType = VISUAL_TYPE_TO_DATA_TYPE[visualType] || 'overview';
  const row = DATA_TYPE_TO_LAYOUTS[dataType] || DATA_TYPE_TO_LAYOUTS.overview;
  return [row.primary, ...row.alternatives].filter((id) => LAYOUTS[id]);
}

/**
 * 兜底版式：规划模型没给或给了无效值时使用。
 */
export function fallbackLayoutFor(visualType: VisualType): string {
  const candidates = layoutCandidatesFor(visualType);
  return candidates[0] || 'single-focal-point';
}

/** 取版式描述文本，供提示词使用 */
export function layoutPromptText(id?: string, visualType?: VisualType): string {
  const key = id && LAYOUTS[id] ? id : visualType ? fallbackLayoutFor(visualType) : '';
  const spec = LAYOUTS[key];
  return spec ? `信息版式采用【${spec.label}】：${spec.prompt}` : '';
}
