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

export type LayoutCategory =
  | 'process'     // 步骤 · 流程 · 路径
  | 'comparison'  // 对比 · 冲突 · 象限
  | 'hierarchy'   // 层级 · 架构 · 容器
  | 'relation'    // 关系 · 网络 · 辐射
  | 'data'        // 数据 · 看板 · 矩阵
  | 'focus'       // 聚焦 · 单点 · 特写
  | 'narrative'   // 叙事 · 连环 · 全景
  | 'metaphor';   // 隐喻 · 空间 · 探索

export interface LayoutCategoryMeta {
  id: LayoutCategory;
  label: string;
  desc: string;
}

export const LAYOUT_CATEGORIES: LayoutCategoryMeta[] = [
  { id: 'process', label: '步骤与流程', desc: '线性推进、台阶、闭环、时间线与路线图' },
  { id: 'comparison', label: '对比与对立', desc: '二元分栏、四象限、冲突对峙与天平' },
  { id: 'data', label: '数据与看板', desc: '仪表盘、便当盒排版、元素表与对齐表格' },
  { id: 'hierarchy', label: '层级与架构', desc: '层级堆叠、金字塔、轴向展开与结构拆解' },
  { id: 'relation', label: '关系与网络', desc: '中心辐射、维恩交集、拼图嵌合与多焦点' },
  { id: 'focus', label: '聚焦与单点', desc: '单点聚光、微距特写、单件艺术品' },
  { id: 'narrative', label: '叙事与长卷', desc: '连环分镜、场景递进、左图右文与全景' },
  { id: 'metaphor', label: '隐喻与场景', desc: '冰山模型、桥梁跨越、故事山与探险路径' },
];

export interface LayoutSpec {
  id: string;
  /** 中文展示名 */
  label: string;
  /** 一句话说明 */
  desc: string;
  /** 直接进入提示词的版式描述 */
  prompt: string;
  /** 版式分类 */
  category: LayoutCategory;
}

/**
 * 版式目录（精选 60+ 种典型信息结构版式，对齐商汤官方 sn-infographic 技能）
 */
export const LAYOUTS: Record<string, LayoutSpec> = {
  // —— 流程 / 时间线 ——
  'linear-progression': {
    id: 'linear-progression',
    label: '线性推进',
    category: 'process',
    desc: '左到右 / 上到下的单向步骤推进',
    prompt: '信息沿单一方向（从左到右或从上到下）依次推进，每一步之间有明确的箭头或连线，读者视线不回头',
  },
  'step-staircase': {
    id: 'step-staircase',
    label: '阶梯递进',
    category: 'process',
    desc: '像台阶一样逐级上升',
    prompt: '信息呈阶梯状逐级抬升排列，每一级比前一级更高一阶，用高度差直观表达递进与累积',
  },
  'winding-roadmap': {
    id: 'winding-roadmap',
    label: '蜿蜒路线',
    category: 'process',
    desc: '一条蜿蜒路径串起多个节点',
    prompt: '一条蜿蜒曲折的路径贯穿整个画面，路径上分布若干关键节点，适合表达有起伏的过程或历程',
  },
  'one-way-flow': {
    id: 'one-way-flow',
    label: '单向流动',
    category: 'process',
    desc: '强调单一方向的流动感',
    prompt: '画面强化单一方向的流动感，元素沿同一方向排布并带有速度与方向暗示',
  },
  'funnel': {
    id: 'funnel',
    label: '漏斗收束',
    category: 'process',
    desc: '由宽到窄层层筛选',
    prompt: '信息从上到下由宽变窄形成漏斗，逐层筛选收敛到最终结果',
  },
  'circular-flow': {
    id: 'circular-flow',
    label: '循环闭环',
    category: 'process',
    desc: '首尾相接的循环',
    prompt: '元素沿环形排布并首尾相接，形成闭环，强调循环往复、周而复始',
  },
  's-curve': {
    id: 's-curve',
    label: 'S 形曲线',
    category: 'process',
    desc: '柔和的 S 形走势',
    prompt: '信息沿柔和的 S 形曲线展开，节奏有起伏但不中断',
  },
  'swimlane': {
    id: 'swimlane',
    label: '泳道流程',
    category: 'process',
    desc: '多条平行推进的阶段轨道',
    prompt: '用多条平行泳道切分不同责任主体或阶段，各道内流程并行推进并产生跨道交接',
  },

  // —— 对比 ——
  'binary-comparison': {
    id: 'binary-comparison',
    label: '二元对比',
    category: 'comparison',
    desc: '左右分栏的正反对比',
    prompt: '画面分为明确的左右两栏，两侧并列展示对立的两方，中间可用分隔线或对照轴线强化对比关系',
  },
  'conflict-contrast': {
    id: 'conflict-contrast',
    label: '冲突对峙',
    category: 'comparison',
    desc: '强化张力的正面对撞',
    prompt: '两股力量在画面中正面对撞形成张力，用倾斜、挤压或色彩冲突表达对抗关系',
  },
  'four-quadrant-grid': {
    id: 'four-quadrant-grid',
    label: '四象限',
    category: 'comparison',
    desc: '横纵两轴切成四格',
    prompt: '画面用横纵两条轴线切成四个象限，每个象限承载一类情况，适合二维分类',
  },
  'visual-tension': {
    id: 'visual-tension',
    label: '视觉张力',
    category: 'comparison',
    desc: '用失衡构图制造紧张感',
    prompt: '刻意采用失衡、倾斜、重心偏移的构图制造紧张感，强调矛盾与风险',
  },
  'comparison-table': {
    id: 'comparison-table',
    label: '对照表格',
    category: 'comparison',
    desc: '清晰规整的横向条目比对',
    prompt: '采用清晰规整的矩阵列表逐项横向对照，左右各指标对齐分明，对比一目了然',
  },

  // —— 层级 / 结构 ——
  'hierarchical-layers': {
    id: 'hierarchical-layers',
    label: '层级堆叠',
    category: 'hierarchy',
    desc: '上下分层的结构',
    prompt: '信息按层级从上到下或从后到前堆叠，层与层之间有明确的从属与包含关系',
  },
  'pyramid-tier': {
    id: 'pyramid-tier',
    label: '金字塔层级',
    category: 'hierarchy',
    desc: '底宽顶尖的等级分布',
    prompt: '经典的三角金字塔结构，越靠底层受众或基底越宽，越到顶尖越核心稀缺',
  },
  'axial-expansion': {
    id: 'axial-expansion',
    label: '轴向展开',
    category: 'hierarchy',
    desc: '从一个中心轴向外展开',
    prompt: '以一个中心轴或核心节点为起点，向两侧或四周逐级展开分支',
  },
  'deconstruction': {
    id: 'deconstruction',
    label: '结构拆解',
    category: 'hierarchy',
    desc: '把整体拆成零件',
    prompt: '把一个整体拆解为若干组成部件并平铺展示，每个部件标注其作用，适合讲清构成',
  },
  'structural-breakdown': {
    id: 'structural-breakdown',
    label: '结构剖析',
    category: 'hierarchy',
    desc: '剖开看内部构造',
    prompt: '以剖面或透视方式展示对象内部构造，各组成部分清晰可辨',
  },
  'containerization': {
    id: 'containerization',
    label: '容器分区',
    category: 'hierarchy',
    desc: '用容器把内容分组',
    prompt: '用清晰的容器（框、卡片、托盘）把内容分组收纳，组与组之间界限分明但不做拼贴堆砌',
  },

  // —— 关系 ——
  'hub-spoke': {
    id: 'hub-spoke',
    label: '中心辐射',
    category: 'relation',
    desc: '一个中心连向多个外围',
    prompt: '一个核心元素位于画面中心，多条连线从中心辐射到外围若干节点，表达一对多的关系',
  },
  'venn-diagram': {
    id: 'venn-diagram',
    label: '维恩交集',
    category: 'relation',
    desc: '圆与圆的重叠区',
    prompt: '用相互重叠的圆形区域表达集合关系，重叠部分承载共同点，是表达「交集」最直接的形式',
  },
  'jigsaw': {
    id: 'jigsaw',
    label: '拼图嵌合',
    category: 'relation',
    desc: '像拼图一样互相咬合',
    prompt: '若干块状元素像拼图一样互相咬合拼成一个整体，强调各部分缺一不可',
  },
  'multi-focal': {
    id: 'multi-focal',
    label: '多中心并列',
    category: 'relation',
    desc: '多个同等重要的焦点',
    prompt: '画面包含 2~3 个同等重要的视觉焦点，彼此之间用弱关联线连接，不分主次',
  },

  // —— 数据 / 看板 ——
  'dashboard': {
    id: 'dashboard',
    label: '仪表盘看板',
    category: 'data',
    desc: '类似数字看板的模块组合',
    prompt: '采用仪表盘式布局，大字号关键指标居于显要位置，周边配合图形与辅助数据',
  },
  'bento-grid': {
    id: 'bento-grid',
    label: '便当盒网格',
    category: 'data',
    desc: '大小不一但严丝合缝的格子',
    prompt: '像日式便当盒一样，由若干大小不一但边缘严丝合缝的矩形网格拼接而成，主次分明',
  },
  'periodic-table': {
    id: 'periodic-table',
    label: '元素周期表式',
    category: 'data',
    desc: '规整的小方块网格',
    prompt: '仿照元素周期表的小方格规整排列，每个格子里标明关键属性，适合大容量分类陈列',
  },
  'data-landscape': {
    id: 'data-landscape',
    label: '数据地貌',
    category: 'data',
    desc: '数据高低起伏像地貌',
    prompt: '把抽象数据具象化为高低起伏的地貌或立柱，用高度直观感知数量差异',
  },
  'hard-alignment': {
    id: 'hard-alignment',
    label: '强网格对齐',
    category: 'data',
    desc: '严格对齐的理性网格',
    prompt: '严格按照网格线对齐所有元素，边缘锋利，秩序感极强，传达高度理性与严谨',
  },
  'swiss-grid': {
    id: 'swiss-grid',
    label: '瑞士网格',
    category: 'data',
    desc: '瑞士国际主义网格系统',
    prompt: '遵循经典瑞士平面网格，大量严谨留白与纯粹平涂，字体与色块秩序分明',
  },

  // —— 聚焦 / 单点 ——
  'single-focal-point': {
    id: 'single-focal-point',
    label: '单点聚焦',
    category: 'focus',
    desc: '画面中央一个绝对主体',
    prompt: '画面有且仅有一个绝对视觉主体居于中央或黄金分割点，周围留出充足呼吸空间',
  },
  'center-focus': {
    id: 'center-focus',
    label: '向心聚集',
    category: 'focus',
    desc: '所有线条收敛到中心',
    prompt: '画面四周的线条与元素全部向中央收敛聚焦，形成强烈的向心视线引导',
  },
  'big-typography': {
    id: 'big-typography',
    label: '大字焦点',
    category: 'focus',
    desc: '特大字号作为主视觉',
    prompt: '特大字号的核心词或数字占据画面主导位置，图形元素退居辅助，突出核心结论',
  },
  'ultra-minimalist': {
    id: 'ultra-minimalist',
    label: '极简极空',
    category: 'focus',
    desc: '大面积留白与极少元素',
    prompt: '大面积留白，仅保留一两个极其克制的元素，传达极高段位的专注与从容',
  },
  'macro-closeup': {
    id: 'macro-closeup',
    label: '微距特写',
    category: 'focus',
    desc: '极近距离观察局部',
    prompt: '像微距镜头一样贴近对象的某个局部，展现肉眼难以留意的质感与细节',
  },
  'single-object-art': {
    id: 'single-object-art',
    label: '单件艺术品',
    category: 'focus',
    desc: '把主体像展品一样陈列',
    prompt: '把主体对象像博物馆展品一样置于纯净底座或柔光中陈列，强调其本身的存在感',
  },

  // —— 叙事 / 长卷 ——
  'comic-strip': {
    id: 'comic-strip',
    label: '连环分镜',
    category: 'narrative',
    desc: '漫画式的连续画格',
    prompt: '画面分为 2~4 个连续画格，画格之间有时间或因果递进，像看连环画一样推进情节',
  },
  'storyboard': {
    id: 'storyboard',
    label: '故事板',
    category: 'narrative',
    desc: '电影分镜台本式排布',
    prompt: '采用电影分镜台本式构图，镜头切换感强，每幕定格一个关键瞬间',
  },
  'panorama': {
    id: 'panorama',
    label: '横卷全景',
    category: 'narrative',
    desc: '横向连贯的长卷叙事',
    prompt: '如同一幅横向展开的长卷，多个场景在一张画面内自然连缀，时空连贯',
  },
  'scene-unfolding': {
    id: 'scene-unfolding',
    label: '场景递进',
    category: 'narrative',
    desc: '前景到深景逐层揭示',
    prompt: '视线从前景穿透到远景，画面像舞台布景一样层层展开',
  },
  'left-image-right-text': {
    id: 'left-image-right-text',
    label: '左图右文',
    category: 'narrative',
    desc: '经典的图文分列版式',
    prompt: '一侧为主视觉大图，另一侧为结构清晰的要点列举，图文互相呼应',
  },

  // —— 隐喻 / 场景 ——
  'iceberg': {
    id: 'iceberg',
    label: '冰山模型',
    category: 'metaphor',
    desc: '水面上一角，水下深藏巨量',
    prompt: '采用经典的冰山模型构图，水平面清晰划开：水上仅显露一小角表象，水下深藏庞大根因',
  },
  'bridge': {
    id: 'bridge',
    label: '桥梁跨越',
    category: 'metaphor',
    desc: '连接两岸的桥梁',
    prompt: '以一座桥梁跨越鸿沟连接对立的两岸，象征转化、过渡、达成共识的路径',
  },
  'story-mountain': {
    id: 'story-mountain',
    label: '故事山峰',
    category: 'metaphor',
    desc: '起伏爬坡的高潮曲线',
    prompt: '呈山峰起伏形态：起点爬坡、中段高峰碰撞、随后下行落地，直观展示波澜历程',
  },
  'emotional-gradient': {
    id: 'emotional-gradient',
    label: '情绪梯度',
    category: 'metaphor',
    desc: '色彩或光影的梯度变化',
    prompt: '利用从暗到亮或从冷到暖的明暗过渡，表达从困境到转机的走向',
  },
  'strong-perspective': {
    id: 'strong-perspective',
    label: '透视纵深',
    category: 'metaphor',
    desc: '强烈的单点或双点透视',
    prompt: '利用极强的单点透视线条拉伸纵深空间，将视线瞬间吸引到尽头',
  },
  'isometric-map': {
    id: 'isometric-map',
    label: '等轴测沙盘',
    category: 'metaphor',
    desc: '上帝视角的 3D 沙盘',
    prompt: '采用 2.5D 等轴测（Isometric）沙盘视角，整个系统像沙盘一样在三维空间中呈现',
  },
  'tile-layout': {
    id: 'tile-layout',
    label: '磁贴平铺',
    category: 'data',
    desc: '齐整的模块化平铺磁贴',
    prompt: '各个模块如平铺磁贴般紧凑排列，模块间留白微小而利落',
  },
  'z-pattern': {
    id: 'z-pattern',
    label: 'Z 字视觉线',
    category: 'process',
    desc: '经典的 Z 字形视线引导',
    prompt: '信息按 Z 字形走势（左上→右上→左下→右下）引导读者视线',
  },
  'header-body': {
    id: 'header-body',
    label: '标题正文报表',
    category: 'data',
    desc: '规整的报告式版面',
    prompt: '顶部醒目标题区，主体部分规整分为若干内容块，专业商务感强',
  },
  'editorial-vogue': {
    id: 'editorial-vogue',
    label: '时尚画报',
    category: 'focus',
    desc: '时尚杂志式的大开本排版',
    prompt: '采用时尚杂志式排版，大字号标题与图片形成强烈对比，留白讲究',
  },
  'generous-margins': {
    id: 'generous-margins',
    label: '典雅留白',
    category: 'focus',
    desc: '大边距的高级感',
    prompt: '四周留出宽裕的边距，内容被优雅地框在中央，传达高级与从容',
  },
  'full-bleed-image': {
    id: 'full-bleed-image',
    label: '满版出画',
    category: 'focus',
    desc: '主画面铺满整个空间',
    prompt: '主视觉图像铺满整个画面不留边框，极富视觉冲击力',
  },
  'swot-matrix': {
    id: 'swot-matrix',
    label: 'SWOT 分析矩阵',
    category: 'comparison',
    desc: '优势/劣势/机会/威胁的四格对比',
    prompt: '四格矩阵式布局，分别标示优势、劣势、机会与威胁四个维度，用不同的底色色块与明确的标题界定',
  },
  'fishbone-diagram': {
    id: 'fishbone-diagram',
    label: '因果鱼骨图',
    category: 'hierarchy',
    desc: '主干延伸分支的因果分析',
    prompt: '采用鱼骨架构图，水平主干直指核心问题，上下两侧鱼刺分支排列各个影响维度与子原因',
  },
  'pyramid': {
    id: 'pyramid',
    label: '金字塔分层',
    category: 'hierarchy',
    desc: '自底向上的层级递进',
    prompt: '经典的三角金字塔结构，自底向上划分为清晰的 3~4 个层级，底座稳健，顶端核心精辟',
  },
  'venn-triple': {
    id: 'venn-triple',
    label: '三圆维恩交集',
    category: 'relation',
    desc: '三个圆形的交叉重叠区',
    prompt: '三个等大圆形呈品字形重叠，重叠中心为三者交集核心，外围为两两交集，适合多维综合决策',
  },
  'timeline-vertical': {
    id: 'timeline-vertical',
    label: '纵向时间轴',
    category: 'process',
    desc: '自上而下的垂直时间节点',
    prompt: '一条纵向时间轴自上而下贯穿画面，左右两侧交替分布时间节点与图文说明，条理清晰',
  },
  'comparison-columns': {
    id: 'comparison-columns',
    label: '多列横向对比',
    category: 'comparison',
    desc: '三到四列并列参数对比',
    prompt: '采用多列规整排布，各列顶部为主体标题，下方并列对齐各项关键指标与细节对比',
  },
  'radial-network': {
    id: 'radial-network',
    label: '辐射网络图',
    category: 'relation',
    desc: '多节点互联的关系网络',
    prompt: '多个节点以网状结构互联互通，节点大小体现权重，连线粗细体现关联紧密程度',
  },
  'radar-chart': {
    id: 'radar-chart',
    label: '雷达多维评估',
    category: 'data',
    desc: '多边形维度的能力分布',
    prompt: '采用多边形雷达图架构，从中心向各能力维度轴向辐射，多维覆盖面积直观展现综合实力',
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

/** 取版式描述文本，供提示词使用（采用官方自然语言空间描述，杜绝【】等程序元标签） */
export function layoutPromptText(id?: string, visualType?: VisualType): string {
  const key = id && LAYOUTS[id] ? id : visualType ? fallbackLayoutFor(visualType) : '';
  const spec = LAYOUTS[key];
  // 杜绝“信息版式采用【】”等程序性元指令（避免生图模型把“信息版式用”直接画成海报大标题）
  return spec ? `整体布局为${spec.label}结构，${spec.prompt}` : '';
}
