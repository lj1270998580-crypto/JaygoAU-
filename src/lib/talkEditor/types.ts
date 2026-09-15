/**
 * AI 口播剪辑 (TalkEditor) 核心类型契约
 */

export type CanvasRatio = '9:16' | '16:9' | '1:1' | '4:5' | '3:4';
export type BackgroundType = 'blur' | 'color' | 'gradient';

export type TitleStylePresetId =
  | 'viral_yellow'    // 🔥 爆款黄底黑字 (高对比醒目招牌)
  | 'black_gold'       // 👑 黑金商务轻奢 (黑底金字香槟边)
  | 'red_alert'        // 🚨 高能干货警示红牌 (红底白字紧迫感)
  | 'clean_shadow'     // ✨ 极简立体 3D 浮雕 (无底色黑立体投影)
  | 'cyber_gradient'   // ⚡ 赛博炫彩渐变 (潮流蓝紫粉微光)
  | 'neon_lime'        // 🎯 荧光青绿潮牌 (高亮荧光绿黑字)
  | 'frosted_glass';   // 🎬 质感半透毛玻璃 (黑透磨砂微发光)

export interface CustomStickerPatch {
  id?: string;           // 唯一识别 ID
  enabled: boolean;
  imageUrl: string;      // 本地 blob / file:// 或 base64
  localPath?: string;    // 本地磁盘真实文件路径（用于剪映草稿与插画师无损引用）
  name?: string;         // 文件名
  xPercent: number;      // 水平位置百分比 (0.0 ~ 1.0, 默认 0.85 挂角或 0.5 居中)
  yPercent: number;      // 垂直位置百分比 (0.0 ~ 1.0, 默认 0.15 右上角)
  scale: number;         // 缩放比例 (无上限，支持 0.05 ~ 10.0+，默认 1.0)
  aspectRatio?: number;  // 贴图宽高比 (宽 / 高)
  opacity?: number;      // 不透明度 (0.1 ~ 1.0, 默认 1.0)
}

export interface CanvasPatch {
  enabled: boolean;
  text: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
  fontWeight: 'normal' | 'bold' | '900';
  yOffsetPercent: number; // 距离顶端或底端的垂直百分比 (0.02 ~ 0.5)
  xOffsetPercent?: number; // 水平居中或偏移百分比 (0.05 ~ 0.95, 默认 0.5 居中)
  stylePreset?: TitleStylePresetId; // 🌟 标题预设样式模版
}

export interface CanvasConfig {
  aspectRatio: CanvasRatio;
  backgroundType: BackgroundType;
  backgroundColor: string;
  blurIntensity: number; // 0 ~ 40px
  videoScale: number; // 0.5 ~ 1.5
  videoYPercent: number; // 居中垂直偏移
  topPatch: CanvasPatch;
  bottomPatch: CanvasPatch;
  stickerPatch?: CustomStickerPatch; // 🌟 兼容旧版单个全片贴片
  stickers?: CustomStickerPatch[];   // 🌟 支持多张贴片列表 (无张数限制，全片覆盖)
}

export type DeleteReason =
  | 'silence'            // 声学空白/气口
  | 'filler'             // 语气词 (呃、啊、然后、就是说)
  | 'stumble'            // 嘴瓢/重复重读
  | 'narrative_tangent'  // 宏观叙事跑题/冗长铺垫/车轱辘话
  | 'manual';            // 用户手动删除

export interface WordItem {
  id: string;
  text: string;
  startTime: number; // 秒
  endTime: number;   // 秒
  isDeleted: boolean;
  deleteReason?: DeleteReason;
}

export interface CutSegment {
  id: string;
  type?: 'sentence' | 'silence'; // 🌟 区分普通台词句 vs 声学空白气口
  startTime: number;
  endTime: number;
  text: string;
  isDeleted: boolean;
  deleteReason?: DeleteReason;
  tagLabel?: string;     // 如 "[建议精简 18s]", "[气口 0.9s]", "[语气词]", "[重录第1次]"
  reasonDetail?: string; // 🌟 详细删减理由说明 (如 "开篇寒暄发散", "多次录制嘴瓢忘词，系统已保留最佳版本")
  takeGroup?: number;    // 属于同句多次重录的分组 ID
  takeIndex?: number;    // 重录序号 (如 1, 2, 3)
  words?: WordItem[];    // 🌟 字级别切片列表
  confidence?: number;
}

export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
}

export interface SubtitleItem {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  secondaryText?: string; // 双语模版备用
  words?: WordTimestamp[];
}

export type SubtitleTemplateId =
  | 'viral_double'   // 爆款双行强化 (主句白字，重点金黄高亮带黑立体影)
  | 'karaoke'        // 逐词高亮卡拉OK (当前单词动态变色跳跃)
  | 'clean_white'    // 极简白字黑描边 (知识商业博主经典)
  | 'pill_badge'     // 亮黄胶囊底色 (黑字黄底圆角卡片)
  | 'bilingual';     // 现代双语对照 (中英文分层)

export interface SubtitleStyleConfig {
  templateId: SubtitleTemplateId;
  fontSize: number;
  textColor: string;
  highlightColor: string;
  strokeColor: string;
  strokeWidth: number;
  yPercent: number; // 垂直位置 (从底部算起 0.05 ~ 0.65)
  xPercent?: number; // 水平位置 (0.05 ~ 0.95, 默认 0.5 居中)
  fontFamily?: string;
  boxColor?: string;
  visible?: boolean; // 🌟 实时控制字幕是否显隐
  bold?: boolean;
}

export type NarrativePreset =
  | 'viral'    // 爆款短视频 (~55% 片长，大刀阔斧去枝留干)
  | 'balanced' // 紧凑深度 (~80% 片长，删跑题车轱辘话)
  | 'light';   // 轻度修整 (~90% 片长，仅清理气口与重录)

export interface NarrativeAnalysisResult {
  hookSummary?: string;
  coreArguments?: string[];
  prunedDurationSec: number;
  preservedDurationSec: number;
  totalDurationSec: number;
  condensedRatio: number;
  coherenceScore: number;
  summaryFeedback: string;
}

export interface TalkEditorState {
  videoFile: File | null;
  videoSrc: string;
  videoDuration: number;
  videoDimensions: { width: number; height: number };
  currentTime: number;
  isPlaying: boolean;
  canvasConfig: CanvasConfig;
  subtitleConfig: SubtitleStyleConfig;
  segments: CutSegment[];
  subtitles: SubtitleItem[];
  isTranscribing: boolean;
  isAnalyzingNarrative: boolean;
  activeNarrativePreset: NarrativePreset;
  narrativeAnalysis: NarrativeAnalysisResult | null;
  activeTab: 'canvas' | 'subtitle';
}

export const DEFAULT_CANVAS_CONFIG: CanvasConfig = {
  aspectRatio: '9:16',
  backgroundType: 'blur',
  backgroundColor: '#09090b',
  blurIntensity: 25,
  videoScale: 1.0,
  videoYPercent: 0,
  topPatch: {
    enabled: false,
    text: '',
    fontSize: 26,
    textColor: '#000000',
    backgroundColor: '#facc15',
    borderRadius: 10,
    fontWeight: '900',
    yOffsetPercent: 0.06,
    xOffsetPercent: 0.5,
    stylePreset: 'viral_yellow',
  },
  bottomPatch: {
    enabled: false,
    text: '',
    fontSize: 16,
    textColor: '#d4d4d8',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 8,
    fontWeight: 'normal',
    yOffsetPercent: 0.05,
    xOffsetPercent: 0.5,
  },
  stickers: [],
};
