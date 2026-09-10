// =========================================================================
// 全片视觉风格圣经规范库 (Style Bible System)
// 依据 10 大画风预设构建结构化美学规范，确保整部视频所有插图共享一致的艺术调性
// =========================================================================

import type { StyleBible } from './types';

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
};

export function getStyleBible(styleId?: string): StyleBible {
  if (styleId && STYLE_BIBLES[styleId]) {
    return STYLE_BIBLES[styleId];
  }
  return STYLE_BIBLES.modern_business;
}
