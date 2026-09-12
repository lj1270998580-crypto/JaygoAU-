/**
 * AI 口播剪辑 (TalkEditor) 核心类型契约
 */

export type CanvasRatio = '9:16' | '16:9' | '1:1' | '4:5' | '3:4';
export type BackgroundType = 'blur' | 'color' | 'gradient';

export interface CanvasPatch {
  enabled: boolean;
  text: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
  fontWeight: 'normal' | 'bold' | '900';
  yOffsetPercent: number; // 距离顶端或底端的百分比
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
  startTime: number;
  endTime: number;
  text: string;
  isDeleted: boolean;
  deleteReason?: DeleteReason;
  tagLabel?: string;     // 如 "[建议精简 18s]", "[气口 0.9s]", "[语气词]", "[重录第1次]"
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
  yPercent: number; // 垂直位置 (从底部算起 0.05 ~ 0.40)
  fontFamily?: string;
  boxColor?: string;
  visible?: boolean; // 🌟 实时控制字幕是否显隐
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
