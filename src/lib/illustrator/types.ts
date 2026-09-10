// =========================================================================
// AI 视觉导演系统 (AI Visual Director System) 核心数据模型定义
// 基于 7/8 层架构：Timeline -> Semantic -> VisualBeat -> Director -> StyleBible -> Compiler
// =========================================================================

export type VisualType =
  | 'scene_narrative'       // 场景叙事 / 人物故事
  | 'concept_metaphor'      // 概念隐喻 / 哲学思考
  | 'data_stat'             // 数据图表 / 统计看板
  | 'step_framework'        // 步骤框架 / 流程拆解
  | 'vs_comparison'         // 正反对比 / 优劣红线
  | 'historical_recreation' // 历史重现 / 纪实还原
  | 'product_showcase';     // 实体陈列 / 产品细节

export type ShotType = 'wide' | 'medium' | 'close' | 'extreme_close' | 'overhead';

export interface SemanticUnit {
  id: string;
  time: {
    start: number;
    end: number;
  };
  rawText: string;
  cleanText: string;
  subjects: Array<{ name: string; type: 'person' | 'object' | 'concept' | 'organization' }>;
  action: string;
  objects: Array<{ name: string; type: string }>;
  location?: string;
  timePeriod?: string;
  isAbstract: boolean;
  // 评分要素 (0.0 ~ 1.0)
  importance: number;
  visualizability: number;
  novelty: number;
  emotionalIntensity: number;
  sceneChange: number;
  informationDensity: number;
  // 语义理解增强字段（LLM 产出时有值，本地兜底时可选）
  visualGoal?: string;       // 观众应该在 1 秒内看到并理解什么
  visualAnchors?: Array<{    // 视觉锚点：能让观众一眼认出这段文案的核心元素
    concept: string;
    priority: number;
  }>;
}

export interface VisualScoreBreakdown {
  importance: number;
  visualizability: number;
  novelty: number;
  emotionalIntensity: number;
  sceneChange: number;
  informationDensity: number;
  total: number; // 视觉需求评分 V
}

export interface VisualBeat {
  beatId: string;
  sourceUnitIds: string[];
  sourceText: string;
  timeline: {
    contextStart: number;
    semanticTrigger: number;
    recommendedStart: number;
    recommendedEnd: number;
    duration: number;
  };
  score: VisualScoreBreakdown;
  visualType: VisualType;
  priority: 'high' | 'medium' | 'low';
}

export interface ScenePlan {
  beatId: string;
  communicationGoal: string; // 1秒读懂的核心传达目标
  visualType: VisualType;
  scene: {
    primarySubject: string; // 画面核心主体
    action: string;         // 主体动作或核心状态
    foreground: string;     // 前景道具与细节
    background: string;     // 背景空间与环境
    period?: string;        // 时代或场所特征
    weatherOrAmbience?: string; // 光影氛围
  };
  composition: {
    shot: ShotType;         // 机位景别
    cameraAngle: 'eye_level' | 'slightly_elevated' | 'low_angle' | 'top_down';
    subjectScale: 'dominant' | 'balanced' | 'environmental';
    depth: 'deep' | 'shallow' | 'layered';
  };
  emotion: {
    primary: string;
    secondary?: string;
  };
  mustInclude: string[];    // 画面中必须出现的物理实体
  mustAvoid: string[];      // 明确禁止出现的元素（如现代物品、混乱文字、悬浮符号）
  visualAnchors: Array<{    // 视觉锚点：观众能一眼认出这段文案的核心视觉元素（带优先级）
    concept: string;         // 具体视觉概念（英文，直接进入 Prompt）
    priority: number;        // 优先级 0.0~1.0，越高越不可省略
  }>;
  /**
   * 画面内需要出现的文字（v0.7.9）
   * 生图协议要求：凡是希望在图上出现的文字，必须在提示词中用引号逐字标出，
   * 否则模型会自行编造文字 —— 这是画面杂乱/乱码的首要来源。
   */
  textLabels?: string[];
  /**
   * 语义化视觉元素（v0.7.9）
   * 每个元素需描述其**具体图形内容**并指明与哪段文字对应，避免只写"一个图标"。
   */
  visualElements?: Array<{
    desc: string;    // 具体图形描述，如"带绿叶的红苹果插画"
    label?: string;  // 该元素对应的文字标签（会以引号写入提示词）
  }>;
}

export interface StyleBible {
  styleId: string;
  label: string;
  badge: string;
  visualMedium: string;    // 艺术媒介与材质
  realism: number;         // 0.0 ~ 1.0
  palette: {
    temperature: 'warm' | 'neutral' | 'cool';
    saturation: 'muted' | 'natural' | 'vibrant' | 'monochrome';
    contrast: 'soft' | 'medium' | 'high';
    dominantTones: string[]; // 语义色彩，杜绝HEX码
  };
  lighting: {
    type: string;          // 如 "自然侧向漫射柔光"
    direction: string;
    shadow: string;
  };
  cameraLanguage: {
    recommendedLens: string; // 如 "35mm 纪实广角"
    compositionRule: string;
  };
  texture: string;         // 如 "微胶片颗粒"、"细腻水彩纸纹理"
  forbidden: string[];     // 风格禁忌元素
}

export interface PromptBlocks {
  style: string;
  subjectAndAction: string;
  environmentAndProps: string;
  compositionAndCamera: string;
  lightingAndColor: string;
  negativeConstraints: string[];
  compiledPrompt: string;  // 最终纯净提示词（正向）
  /** v0.7.9：负向提示词，作为独立参数下发，不再混在正向提示词里 */
  negativePrompt: string;
  coverageScore: number;   // 视觉锚点覆盖率 0.0~1.0
  anchorsCovered: string[]; // 已覆盖的锚点概念列表
  anchorsMissing: string[]; // 未覆盖的锚点概念列表
}

export interface PipelineProgress {
  stage: 'aligning' | 'parsing' | 'planning' | 'directing' | 'compiling' | 'completed' | 'error';
  stepNumber: number;
  totalSteps: number;
  stageName: string;
  message: string;
  percent: number;
}
