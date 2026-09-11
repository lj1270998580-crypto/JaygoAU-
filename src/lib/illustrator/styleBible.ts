// =========================================================================
// 全片视觉风格圣经规范库 (Style Bible System)
// 依据 10 大画风预设构建结构化美学规范，确保整部视频所有插图共享一致的艺术调性
// =========================================================================

import type { StyleBible } from './types';

/**
 * v0.7.18：给**规划大模型**看的风格适配提示。
 *
 * 此前风格只在出图阶段被注入（promptCompiler），规划阶段完全不知道用户选了什么
 * 风格 —— 结果就是「画风对了、内容违和」：实测选水墨风去讲房产税，规划模型照样
 * 输出「现代办公室白板上的对比表格」，出图变成一张水墨质感的现代白板。
 *
 * 有了这份提示，规划模型在决定「这句话画什么主体」时就会主动贴合风格。
 */
export interface StylePlannerGuidance {
  /** 该风格下更合适的主体与道具（会写进规划提示词） */
  suitableSubjects: string[];
  /** 该风格下应当避开的主体（会写进规划提示词） */
  avoidSubjects: string[];
}

/**
 * 各风格对应的规划提示。
 *
 * 注意：这里刻意**不改动**任何风格的视觉定义，只是补上「这个风格该画什么题材」。
 * 规划模型拿到之后，会在选主体时主动贴合 —— 这是解决「画风对但内容违和」的关键。
 */
export const STYLE_PLANNER_GUIDANCE: Record<string, StylePlannerGuidance> = {
  modern_business: {
    suitableSubjects: ['现代办公室与会议室', '笔记本电脑、文件夹、报表', '职场人物与商务场景', '简洁的信息图表与看板'],
    avoidSubjects: ['古代器物', '水墨留白', '科幻霓虹'],
  },
  colored_pencil: {
    suitableSubjects: ['生活化日常场景', '手写笔记本与文具', '家庭与亲子', '温暖的小物件特写'],
    avoidSubjects: ['冷硬科技界面', '高楼玻璃幕墙', '未来科幻装置'],
  },
  classical_oil: {
    suitableSubjects: ['历史场景与古典室内', '厚重书本、烛台、旧家具', '庄重的人物肖像', '戏剧性的强光影场面'],
    avoidSubjects: ['手机屏幕与 App 界面', '现代办公设备', '扁平图表'],
  },
  cinematic_real: {
    suitableSubjects: ['真实办公与生活实景', '专业摄影级的静物与人像', '真实材质特写（木、金属、织物）'],
    avoidSubjects: ['卡通描边', '手绘涂抹', '抽象符号'],
  },
  chinese_ink: {
    // 实测：不写这段时，水墨风会画出「现代办公室白板上的对比表格」
    suitableSubjects: ['案头文房：毛笔、砚台、宣纸、印章', '算盘、账册、契约文书、线装书', '远山、竹石、庭院、窗棂', '中式厅堂与古典家具'],
    avoidSubjects: ['现代办公室白板', '手机屏幕与 App 界面', '笔记本电脑', '西装人物', '扁平矢量图表'],
  },
  anime_cartoon: {
    suitableSubjects: ['富有神态张力的人物', '校园与日常都市场景', '明快的动作瞬间', '夸张的表情特写'],
    avoidSubjects: ['厚重油画肌理', '老旧泛黄做旧感'],
  },
  isometric_3d: {
    suitableSubjects: ['微缩建筑与办公空间模型', '规整排列的物件与设备', '等距视角的数据看板', '流程与层级结构'],
    avoidSubjects: ['真实摄影质感', '手绘笔触', '随机透视'],
  },
  watercolor_book: {
    suitableSubjects: ['自然景物与植物', '温柔的日常片段', '绘本式的情境叙事', '轻盈的生活器物'],
    avoidSubjects: ['厚重油彩', '冰冷机械', '刺目荧光'],
  },
  minimal_line: {
    suitableSubjects: ['高度概括的人物轮廓', '极简的器物线条', '大面积留白的隐喻画面'],
    avoidSubjects: ['复杂背景', '多重厚涂色彩', '写实材质细节'],
  },
  cyberpunk: {
    suitableSubjects: ['未来城市天际线与霓虹街道', '全息界面与数据流', '科技装备与机械装置', '雨夜反光的金属质感'],
    avoidSubjects: ['田园乡村', '传统水墨器物', '明亮白昼的温馨日常'],
  },
  // v0.7.18 新增：信息图表风
  infographic_clean: {
    suitableSubjects: ['清晰的数据图表与对比表', '流程步骤与层级结构', '量化的指标与刻度', '简洁的图形化概念示意'],
    avoidSubjects: ['写实人物与场景插画', '油画笔触与手绘肌理', '抽象氛围渲染'],
  },
  // v0.7.19 新增（对齐官方 66 风格）
  'chinese-guochao': {
    suitableSubjects: ['中式厅堂与屏风', '印章、折扇、灯笼、祥云纹样', '山水与花鸟元素', '传统器物与节庆场景'],
    avoidSubjects: ['现代办公白板', '手机与电脑界面', '西装人物', '赛博霓虹'],
  },
  claymation: {
    suitableSubjects: ['黏土捏塑的人物与小场景', '圆润的手工道具', '微缩的家居与办公模型', '食物与日常物件'],
    avoidSubjects: ['锐利写实材质', '复杂文字排版', '冷硬金属质感'],
  },
  chalkboard: {
    suitableSubjects: ['板书式的公式与要点', '粉笔手绘的示意图与箭头', '圈画强调的关键词', '简笔人物与图示'],
    avoidSubjects: ['写实摄影', '繁复装饰', '高饱和彩色插画'],
  },
  'swiss-style': {
    suitableSubjects: ['严格网格中的文字与几何块', '极简图标与色块', '版式化的信息层级', '摄影与排版的组合'],
    avoidSubjects: ['手绘涂鸦', '装饰花纹', '三维立体效果', '复杂背景插画'],
  },
};

export const STYLE_BIBLES: Record<string, StyleBible> = {
  modern_business: {
    styleId: 'modern_business',
    label: '现代商务扁平',
    badge: '现代商务',
    visualMedium: '现代高级商业扁平矢量插画，几何结构利落，色块纯净高雅',
    realism: 0.65,
    palette: {
      temperature: 'neutral',
      saturation: 'muted',
      contrast: 'medium',
      dominantTones: ['莫兰迪深蓝', '米白底色', '暖驼色', '沉稳墨灰', '点缀翡翠绿'],
    },
    lighting: {
      type: '通透自然无阴影漫射光',
      direction: '柔和全局光',
      shadow: '极浅半透明投影',
    },
    cameraLanguage: {
      recommendedLens: '50mm 平视标准视角',
      compositionRule: '三分法留白构图，现代办公与商务场景留有呼吸感',
    },
    texture: '细腻平滑矢量微哑光质感',
    forbidden: [
      '三维塑料光泽',
      '劣质渐变',
      '杂乱笔触',
      '荧光刺眼高饱和度',
      '虚浮的非实体色块碎片',
      '乱码错位文字',
    ],
  },

  colored_pencil: {
    styleId: 'colored_pencil',
    label: '彩铅手绘插画',
    badge: '温馨手绘',
    visualMedium: '手绘彩色铅笔插画，细腻纸质排线肌理与柔和多层叠色',
    realism: 0.7,
    palette: {
      temperature: 'warm',
      saturation: 'natural',
      contrast: 'soft',
      dominantTones: ['暖黄赭石', '麦田金', '柔和灰绿', '原木棕', '温润象牙白'],
    },
    lighting: {
      type: '午后斜射温暖自然光',
      direction: '侧光',
      shadow: '彩铅交叉排线柔和阴影',
    },
    cameraLanguage: {
      recommendedLens: '35mm 温馨人文生活视角',
      compositionRule: '生活化故事构图，焦点聚集在人物与关键物件细节',
    },
    texture: '重磅素描纸颗粒与彩铅笔触质感',
    forbidden: [
      '冰冷数码矢量感',
      '坚硬锐利边缘',
      '三维渲染质感',
      '高光倒影',
      '现代机械感冷色调',
    ],
  },

  classical_oil: {
    styleId: 'classical_oil',
    label: '古典艺术油画',
    badge: '油画典藏',
    visualMedium: '欧洲古典写实油画艺术，厚重亚麻布油画颜料笔触肌理，古典大师典藏质感',
    realism: 0.85,
    palette: {
      temperature: 'warm',
      saturation: 'muted',
      contrast: 'high',
      dominantTones: ['深褐赭石', '普鲁士蓝', '古董金', '深绛红', '深邃暗夜黑'],
    },
    lighting: {
      type: '经典伦勃朗明暗对照光',
      direction: '单一斜上方强聚光',
      shadow: '深沉丰富的明暗过渡阴影',
    },
    cameraLanguage: {
      recommendedLens: '85mm 古典肖像与历史庄重视角',
      compositionRule: '古典三角稳定构图，庄重沉稳具有史诗厚重感',
    },
    texture: '亚麻画布纹理、厚涂笔刷刮刀肌理与光泽清漆',
    forbidden: [
      '现代数码平涂',
      '动漫赛璐璐线条',
      '过亮塑料感',
      '现代流行饱和度',
      '现代科技元素',
    ],
  },

  cinematic_real: {
    styleId: 'cinematic_real',
    label: '商业写实摄影',
    badge: '真实质感',
    visualMedium: '电影级商业静物与人物写实摄影，真实自然光学质感，主体清晰锐利',
    realism: 0.95,
    palette: {
      temperature: 'neutral',
      saturation: 'natural',
      contrast: 'medium',
      dominantTones: ['电影柯达胶片色彩', '真实皮肤光泽', '自然环境灰', '深层黑位'],
    },
    lighting: {
      type: '专业电影级侧逆光与柔光箱漫射',
      direction: '45度主光配合柔和轮廓光',
      shadow: '光学级渐变自然衰减阴影',
    },
    cameraLanguage: {
      recommendedLens: '35mm 或 50mm 电影大光圈镜头',
      compositionRule: '电影宽画幅景深分割，浅景深自然虚化杂乱背景',
    },
    texture: '细腻35mm电影胶片微颗粒，真实物理材质微观质感',
    forbidden: [
      '手绘涂抹感',
      '卡通描边',
      '假人塑料皮肤',
      '过度HDR曝光',
      '悬浮虚幻符号',
    ],
  },

  chinese_ink: {
    styleId: 'chinese_ink',
    label: '中国风水墨',
    badge: '东方美学',
    visualMedium: '中国传统写意水墨画，传统生宣纸微纤维肌理，淡墨晕染与浓墨勾勒',
    realism: 0.6,
    palette: {
      temperature: 'neutral',
      saturation: 'monochrome',
      contrast: 'high',
      dominantTones: ['焦浓重淡清五色墨', '生宣本色白', '局部极淡花青或赭石点染'],
    },
    lighting: {
      type: '空灵散点漫射自然气韵',
      direction: '无明确硬光源',
      shadow: '墨色浓淡自然晕化呈现空间层次',
    },
    cameraLanguage: {
      recommendedLens: '散点透视东方意境长卷视角',
      compositionRule: '计白当黑，东方古典美学大面积空灵留白',
    },
    texture: '生宣纸渗墨纤维质感与毛笔干湿飞白',
    forbidden: [
      '西洋厚重色彩',
      '强烈西方几何阴影',
      '现代科技高光',
      '复杂填满画面',
      '三维模型感',
    ],
  },

  anime_cartoon: {
    styleId: 'anime_cartoon',
    label: '现代动漫卡通',
    badge: '明快生动',
    visualMedium: '高品质现代日漫插画，干净平滑有张力的描线，通透清爽赛璐璐上色',
    realism: 0.55,
    palette: {
      temperature: 'warm',
      saturation: 'vibrant',
      contrast: 'medium',
      dominantTones: ['晴空青蓝', '温暖晨曦黄', '樱粉', '草木绿', '纯白高光'],
    },
    lighting: {
      type: '动漫动画明媚环境光照',
      direction: '顶部侧向阳光',
      shadow: '清晰利落的单色或双色动漫阴影块',
    },
    cameraLanguage: {
      recommendedLens: '28mm 动漫镜头广角透视',
      compositionRule: '富有视觉冲击力的人物动态构图与神态张力',
    },
    texture: '平滑数码赛璐璐图层，局部细腻光晕漫射',
    forbidden: [
      '脏乱杂色',
      '过暗过重阴影',
      '粗糙写实皮肤肌理',
      '欧美重金属风格',
    ],
  },

  isometric_3d: {
    styleId: 'isometric_3d',
    label: '3D立体渲染',
    badge: '等距建模',
    visualMedium: '等轴测等距 3D 渲染，干净柔和的高级微缩景观模型，几何结构精准立体',
    realism: 0.75,
    palette: {
      temperature: 'neutral',
      saturation: 'natural',
      contrast: 'medium',
      dominantTones: ['浅灰基底', '科技蓝', '活力橙', '清爽薄荷绿', '陶瓷白'],
    },
    lighting: {
      type: '三维摄影棚柔光漫反射与柔和环境光遮蔽(AO)',
      direction: '右上方主光配合左侧补光',
      shadow: '柔和渐变等距接触阴影',
    },
    cameraLanguage: {
      recommendedLens: '无透视等轴测 Isometric 机位视角',
      compositionRule: '45度俯视微缩全景，空间层级分明，物件结构精密规整',
    },
    texture: '细腻微磨砂材质、哑光黏土或高级树脂质感',
    forbidden: [
      '廉价低模多边形',
      '过曝反光',
      '平面涂鸦手绘感',
      '混乱不规则透视',
    ],
  },

  watercolor_book: {
    styleId: 'watercolor_book',
    label: '清新水彩绘本',
    badge: '通透自然',
    visualMedium: '手绘清新透明水彩绘本插画，水色自然渗透交融，轻盈通透',
    realism: 0.68,
    palette: {
      temperature: 'warm',
      saturation: 'natural',
      contrast: 'soft',
      dominantTones: ['天青淡蓝', '柠檬嫩黄', '珊瑚柔粉', '鼠尾草绿', '水彩纸纯白'],
    },
    lighting: {
      type: '晨光穿透空气的轻盈自然光',
      direction: '柔和漫射天光',
      shadow: '半透明水痕沉淀边缘阴影',
    },
    cameraLanguage: {
      recommendedLens: '50mm 温柔绘本视点',
      compositionRule: '温润舒缓的情境叙事构图，边缘自然水渍晕染羽化',
    },
    texture: '重磅中粗纹水彩纸质感与水色水痕沉淀',
    forbidden: [
      '厚重油彩',
      '坚硬数码矢量线',
      '刺目荧光高光',
      '机械冰冷几何',
    ],
  },

  minimal_line: {
    styleId: 'minimal_line',
    label: '极简线条插画',
    badge: '极简艺术',
    visualMedium: '现代极简单线手绘艺术风格，优雅流畅连续轮廓线，克制留白',
    realism: 0.5,
    palette: {
      temperature: 'neutral',
      saturation: 'muted',
      contrast: 'high',
      dominantTones: ['纯正单线黑', '大面积纯白背景', '局部极简克制低饱和纯色点缀'],
    },
    lighting: {
      type: '极简无光影平面设计感',
      direction: '平面二维',
      shadow: '无阴影',
    },
    cameraLanguage: {
      recommendedLens: '正面视平线艺术设计视角',
      compositionRule: '黄金比例优雅留白构图，一笔一划极度凝练',
    },
    texture: '高品质艺术卡纸质感与单线条墨迹',
    forbidden: [
      '复杂背景填充',
      '多重厚涂色彩',
      '立体光影渐变',
      '杂乱繁复细节',
    ],
  },

  cyberpunk: {
    styleId: 'cyberpunk',
    label: '未来科技赛博',
    badge: '未来科技',
    visualMedium: '未来赛博朋克科幻概念艺术，暗黑深邃背景与全息冷光霓虹流光',
    realism: 0.82,
    palette: {
      temperature: 'cool',
      saturation: 'vibrant',
      contrast: 'high',
      dominantTones: ['深邃暗空黑', '全息霓虹青蓝', '激光品红', '电子紫', '警示琥珀金'],
    },
    lighting: {
      type: '暗夜霓虹点光源与全息反射冷光',
      direction: '多方向彩色环境漫射光与硬朗轮廓光',
      shadow: '深沉高反差阴影，雨夜地面湿润光泽反光',
    },
    cameraLanguage: {
      recommendedLens: '24mm 电影超广角仰拍透视',
      compositionRule: '未来城市与科技装备纵深构图，充满科技张力与戏剧冲突',
    },
    texture: '磨砂金属、碳纤维、全息光波与雨水湿润光泽',
    forbidden: [
      '田园乡村朴素元素',
      '水彩手绘水渍',
      '过亮白天环境',
      '柔和扁平卡通',
    ],
  },

  // ===== v0.7.18 新增：专为「信息图」分支准备的信息图表风 =====
  // 此前 10 个风格全是「插画艺术风」，而工具本身有信息图/叙事图双分支。
  // 路由判定某句该出对比图时，风格却可能是「古典艺术油画」，
  // 最终编出「用油画笔触画数据对比图」这种不成立的组合。
  infographic_clean: {
    styleId: 'infographic_clean',
    label: '现代信息图表',
    badge: '数据可视化',
    visualMedium: '现代专业信息图表设计，干净的网格对齐与清晰的视觉层级，克制的强调色，图形化表达取代写实描绘',
    realism: 0.35,
    palette: {
      temperature: 'neutral',
      saturation: 'muted',
      contrast: 'medium',
      dominantTones: ['纯净白底', '深墨蓝主体', '一组协调的强调色', '中浅灰分隔线', '少量警示红或提升绿'],
    },
    lighting: {
      type: '平面设计无方向性照明',
      direction: '无光源方向',
      shadow: '不使用投影，仅用色块与描边区分层级',
    },
    cameraLanguage: {
      recommendedLens: '正视平面设计视角',
      compositionRule: '严格网格对齐，信息按从上到下或从左到右单向推进，留出充足呼吸空间',
    },
    texture: '平滑纯色块与精准几何描边，无任何肌理或噪点',
    forbidden: [
      '写实人物与场景插画',
      '油画笔触与手绘肌理',
      '三维塑料光泽',
      '复杂装饰花纹',
      '渐变滥用',
      '悬浮的抽象符号',
      '乱码错位文字',
    ],
  },

  // ===== v0.7.19 新增：对齐官方 sn-infographic 的 66 种风格，补齐实际缺口 =====
  'chinese-guochao': {
    styleId: 'chinese-guochao',
    label: '新中式国潮',
    badge: '国潮',
    visualMedium: '新中式国潮视觉设计，传统东方纹样与当代平面构成结合，配色浓郁而克制，兼具古典气韵与现代张力',
    realism: 0.55,
    palette: {
      temperature: 'warm',
      saturation: 'vibrant',
      contrast: 'high',
      dominantTones: ['朱砂红', '石青', '黛墨黑', '描金', '月白'],
    },
    lighting: {
      type: '平面化装饰性光照',
      direction: '无固定光源',
      shadow: '不使用写实投影，靠色块与描金线条区分层级',
    },
    cameraLanguage: {
      recommendedLens: '正视平面海报视角',
      compositionRule: '对称或回纹式布局，主图居中，四周以传统纹样收边',
    },
    texture: '宣纸底纹与烫金线条，局部漆器质感',
    forbidden: ['西式写实光影', '欧美卡通造型', '霓虹赛博元素', '杂乱乱码文字'],
  },

  claymation: {
    styleId: 'claymation',
    label: '黏土定格',
    badge: '手工质感',
    visualMedium: '黏土定格动画质感，手工捏塑的圆润造型与可见的指痕肌理，柔和影棚打光，温暖亲切',
    realism: 0.6,
    palette: {
      temperature: 'warm',
      saturation: 'natural',
      contrast: 'soft',
      dominantTones: ['奶油白', '陶土橙', '薄荷绿', '柔雾蓝', '浅木色'],
    },
    lighting: {
      type: '定格动画影棚柔光箱照明',
      direction: '柔和顶光配合正面补光',
      shadow: '短而柔的实体投影，强调立体体积',
    },
    cameraLanguage: {
      recommendedLens: '微距定格摄影视角',
      compositionRule: '微缩场景式构图，主体居中偏下，营造小人国般的亲切感',
    },
    texture: '黏土手捏肌理、细微指纹与哑光表面',
    forbidden: ['锋利硬边', '金属高光', '复杂写实细节', '扁平矢量感'],
  },

  chalkboard: {
    styleId: 'chalkboard',
    label: '黑板教学',
    badge: '知识科普',
    visualMedium: '黑板粉笔手绘教学风格，深色板面上粉笔笔迹的颗粒质感，知识讲解的经典形态',
    realism: 0.4,
    palette: {
      temperature: 'cool',
      saturation: 'muted',
      contrast: 'high',
      dominantTones: ['深墨绿黑板', '白色粉笔', '浅黄色重点', '淡蓝辅助线', '少量红色标注'],
    },
    lighting: {
      type: '教室顶部日光灯均匀照明',
      direction: '正面均匀光',
      shadow: '无阴影，纯平面呈现',
    },
    cameraLanguage: {
      recommendedLens: '正视黑板拍摄视角',
      compositionRule: '板书式布局，重点用粉笔圈画强调，留出讲解顺序的空白',
    },
    texture: '黑板哑光颗粒与粉笔灰笔迹',
    forbidden: ['三维渲染光泽', '照片级写实', '高饱和荧光色', '复杂渐变'],
  },

  'swiss-style': {
    styleId: 'swiss-style',
    label: '瑞士国际主义',
    badge: '理性排版',
    visualMedium: '瑞士国际主义平面设计，严格的网格系统、无衬线字体与理性留白，克制的红黑配色',
    realism: 0.45,
    palette: {
      temperature: 'neutral',
      saturation: 'muted',
      contrast: 'high',
      dominantTones: ['纯白底', '正黑', '国际红', '中灰', '少量原色点缀'],
    },
    lighting: {
      type: '平面设计无光源',
      direction: '无方向',
      shadow: '完全无阴影',
    },
    cameraLanguage: {
      recommendedLens: '正视平面视角',
      compositionRule: '严格网格对齐，大量理性留白，层级靠字号与位置而非装饰区分',
    },
    texture: '纯净平涂，无任何肌理',
    forbidden: ['装饰性花纹', '手绘笔触', '立体投影', '花哨渐变'],
  },
};

export function getStyleBible(styleId?: string): StyleBible {
  if (styleId && STYLE_BIBLES[styleId]) {
    return STYLE_BIBLES[styleId];
  }
  return STYLE_BIBLES.modern_business;
}
