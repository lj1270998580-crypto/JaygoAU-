// 与 electron/preload.ts 中的类型保持一致（渲染层不引入 electron 包，故在此本地声明）

export interface VoiceRecord {
  id: string;
  name: string;
  createdAt: number;
  status: number; // 0未找到 1训练中 2成功 3失败 4可用
  modelType?: number;
  note?: string;
}

export interface Settings {
  outputDir: string;
  resourceId: string;
  officialResourceId?: string;  // 官方音色（非克隆）所用资源，默认 seed-tts-2.0
  defaultFormat: 'mp3' | 'wav' | 'ogg_opus' | 'pcm';
  defaultSampleRate: number;
  speed: number;
  volume: number;
  language: number;
  denoise: boolean;
  voices: VoiceRecord[];
  library: LibraryItem[];
  // ---- 视音频转录（录音文件识别 2.0） ----
  asrResourceId?: string;          // 默认 volc.seedasr.auc
  enableSpeakerInfo?: boolean;     // 转录时是否开启说话人分离
  // ---- 火山 AK/SK（账户余额实时查询用，独立于 X-Api-Key） ----
  volcAccessKeyId?: string;
  volcSecretKey?: string;
  // ---- 蝉镜开放平台（数字人视频生成） ----
  chanjingAppId?: string;
  chanjingSecretKey?: string;
  // ---- 用户上次使用的音色记忆（避免重启跳回默认） ----
  lastSelectedVoiceId?: string | null;
  lastOfficialVoiceId?: string;
  // ---- 系统托盘与任务通知偏好 ----
  closeToTray?: boolean;
  notifyOnTaskComplete?: boolean;
  // ---- 统一大模型中心与自媒体工作流持久化（写入磁盘 settings.json） ----
  modelHubSettings?: any;
  customSkills?: any[];
  workflowProjects?: any[];
  // ---- 商汤日日新 (SenseNova TokenPlan) ----
  sensenovaApiKey?: string;
  sensenovaDefaultModel?: string; // 'sensenova-u1.5-lite' | 'sensenova-u1-fast'
  sensenovaDefaultStyle?: string;
  sensenovaDefaultRatio?: string; // '16:9' | '9:16' | '1:1' | '4:3' | '3:4'
  sensenovaRoutingMode?: 'smart' | 'standard' | 'infographic';
}

export interface SynthProgress {
  stage: 'streaming' | 'done';
  pct: number;
  bytes: number;
}

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string }
  | { type: 'not-available'; version?: string }
  | { type: 'downloaded'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'error'; message: string };

export interface LibraryItem {
  id: string;
  text: string;
  path: string;
  voiceName: string;
  voiceId: string;
  format: string;
  size: number;
  createdAt: number;
}

// 磁盘扫描得到的音频文件（与 LibraryItem 不同：可能没有文字记录）
export interface ScannedAudio {
  path: string;
  name: string;
  size: number;
  createdAt: number;
  ext: string;
}

export interface JaygoAPI {
  getSettings(): Promise<Settings>;
  hasApiKey(): Promise<boolean>;
  setApiKey(key: string): Promise<boolean>;
  clearApiKey(): Promise<boolean>;
  saveSettings(p: Partial<Settings>): Promise<Settings>;
  pickAudioFile(): Promise<string | null>;
  getPathForFile(file: File): string;
  chooseOutputDir(): Promise<(Settings & { migrated: number; skipped: number }) | null>;
  openOutputDir(): Promise<boolean>;
  cloneVoice(a: { name: string; filePath: string; language: number; denoise: boolean }): Promise<any>;
  queryVoice(id: string): Promise<any>;
  testApiKey(): Promise<{
    ok: boolean;
    stage?: string;
    status: number;
    keyValid: boolean | null;
    resourceGranted: boolean | null;
    network?: boolean;
    message: string;
  }>;
  addManualVoice(a: { id: string; name: string }): Promise<boolean>;
  removeVoice(id: string): Promise<boolean>;
  removeLibraryItem(path: string): Promise<boolean>;
  renameVoice(a: { id: string; name: string }): Promise<boolean>;
  importVoices(rawIds: string): Promise<{ added: number; failed: string[] }>;
  windowMinimize(): Promise<void>;
  windowToggleMaximize(): Promise<boolean>;
  windowClose(): Promise<void>;
  windowIsMaximized(): Promise<boolean>;
  synthesize(a: {
    speakerId: string;
    text: string;
    format: string;
    sampleRate: number;
    speed: number;
    volume: number;
    pitch?: number;
    emotion?: string;
    resourceId?: string;
    official?: boolean;
  }): Promise<{ path: string; size: number; format: string; fileId: string }>;
  previewVoice(a: { speakerId: string; official?: boolean }): Promise<{ path: string; size: number; format: string }>;
  readAudio(p: string): Promise<string>;
  downloadAudio(a: { path: string; suggestedName: string }): Promise<string | null>;
  listLibrary(): Promise<{ path: string; name: string; size: number; createdAt: number; ext: string }[]>;
  // ---- 视音频转录 ----
  pickMediaFile(): Promise<string | null>;
  transcribe(a: { filePath: string; enableSpeakerInfo: boolean }): Promise<{
    text: string;
    utterances: {
      text: string;
      startTime: number;
      endTime: number;
      speaker?: string;
      words?: { text: string; startTime: number; endTime: number }[];
    }[];
    durationMs: number;
    url: string;
  }>;
  // ---- 账户余额查询 ----
  getBalance(): Promise<{
    available: number;
    cash: number;
    arrears: number;
    freeze: number;
    fetchedAt: number;
  } | null>;
  // ---- 在线更新 ----
  getAppVersion(): Promise<string>;
  checkUpdates(): Promise<{ ok: boolean; error?: string }>;
  downloadUpdate(): Promise<{ ok: boolean; error?: string }>;
  quitInstallUpdate(): Promise<{ ok: boolean }>;
  onUpdateEvent(cb: (e: UpdateEvent) => void): () => void;
  onTranscribeStatus(cb: (msg: string) => void): () => void;
  onSynthProgress(cb: (p: SynthProgress) => void): () => void;
  // ---- 蝉镜开放平台（数字人） ----
  chanjingAuth(): Promise<{ ok: boolean; message: string; accessToken?: string }>;
  chanjingListAvatars(a?: { page?: number; size?: number }): Promise<{ list: AvatarItem[]; total: number }>;
  chanjingListCustomAvatars(): Promise<CustomAvatarItem[]>;
  chanjingGetFontList(): Promise<FontItem[]>;
  chanjingCreateVideo(params: CreateAvatarVideoParams): Promise<{ videoId: string }>;
  chanjingQueryVideo(id: string): Promise<AvatarVideoTask>;
  chanjingListVideos(a?: { page?: number; size?: number }): Promise<{ list: AvatarVideoTask[]; total: number }>;
  chanjingDeleteVideo(id: string): Promise<boolean>;
  chanjingDownloadVideo(a: { url: string; defaultName?: string }): Promise<{ canceled: boolean; filePath?: string }>;
  chanjingUploadTempAudio(a: { localPath: string }): Promise<{ url: string; key: string }>;
  chanjingDeleteTempAudio(a: { key: string }): Promise<boolean>;
  // ---- 系统与桌面图标自愈 ----
  refreshDesktopIconCache(a?: { deep?: boolean }): Promise<{ ok: boolean; message: string }>;
  // ---- 系统托盘与原生桌面通知 ----
  showNotification(a: { title: string; body: string; tab?: string }): Promise<void>;
  appQuit(): Promise<void>;
  onNavigateTab(cb: (tab: string) => void): () => void;
  // ---- 打点后上传自己的图片（v0.7.8） ----
  pickImageFile(): Promise<string | null>;
  // ---- 多平台媒体/短视频无水印提取 ----
  extractMedia(input: string): Promise<ParsedMediaInfo>;
  downloadExtractedMedia(a: { mediaInfo: ParsedMediaInfo; type: 'video' | 'audio' }): Promise<{ path: string; size: number } | null>;
  downloadExtractedImage(a: { imageUrl: string; defaultName?: string }): Promise<{ path: string; size: number } | null>;
  downloadAllExtractedImages(a: { images: string[]; title: string }): Promise<{ folderPath: string; count: number } | null>;
  extractMediaForTranscribe(a: { mediaInfo: ParsedMediaInfo }): Promise<{ filePath: string; fileName: string }>;
  showItemInFolder(path: string): Promise<boolean>;
  // ---- 历史文章与多格式文档解析 (.txt, *.md, *.pdf, *.docx, *.json, *.csv) ----
  parseDocumentFile(filePath: string): Promise<{ ok: boolean; name?: string; path?: string; size?: number; text?: string; error?: string }>;
  pickDocumentFiles(): Promise<Array<{ ok: boolean; name: string; path: string; size: number; text: string; error?: string }>>;
  // ---- 商汤日日新 (SenseNova TokenPlan) & 智能视频配插图 ----
  sensenovaTestKey(apiKey: string): Promise<{ ok: boolean; message: string }>;
  sensenovaGenerateImage(a: {
    apiKey: string;
    model: string;
    prompt: string;
    size?: string;
    style?: string;
    imageBase64?: string;
  }): Promise<{ ok: boolean; imageUrl?: string; localPath?: string; model?: string; prompt?: string; error?: string }>;
  exportVideoWithOverlays(a: {
    videoPath: string;
    outputPath?: string;
    removeOriginalWatermark?: boolean; // 智能消除原视频左上角水印（如蝉镜）
    overlays: Array<{
      imagePath: string;
      startTime: number;
      endTime: number;
      xPercent: number;
      yPercent: number;
      widthPercent: number;
      heightPercent?: number;
      transitionEffect?: 'fade' | 'slide' | 'zoom' | 'none';
      borderStyle?: 'none' | 'clean_white' | 'rounded_card' | 'star_badge' | 'cyber_glow';
    }>;
  }): Promise<{ ok: boolean; outputPath?: string; error?: string }>;
  onExportVideoProgress(cb: (data: { currentTimeSec: number }) => void): () => void;
}

export interface VideoIllustrationItem {
  id: string;
  startTime: number; // 出现时刻 (秒)
  endTime: number;   // 消失时刻 (秒)
  contextText: string;
  concept: string;
  prompt: string;
  type: 'infographic' | 'standard'; // 信息图 (知识数据) vs 标准图 (画面场景)
  model: 'sensenova-u1-fast' | 'sensenova-u1.5-lite';
  category?: 'data_stat' | 'step_framework' | 'vs_comparison' | 'concept_metaphor' | 'scene_narrative' | 'historical_recreation' | 'product_showcase'; // 视觉价值类型
  style: string;
  ratio: string;
  status: 'idle' | 'generating' | 'success' | 'failed';
  /** v0.7.8：区分模型生成图与用户上传图 */
  source?: 'generated' | 'upload';
  /** v0.7.8：上传图的原始宽高比（w/h）。存在时优先于 ratio，实现「不与模型生成图共用画幅比例」 */
  customAspect?: number;
  imageUrl?: string;
  localPath?: string;
  referenceImage?: string; // 图生图参考图 (Base64 或路径)
  error?: string;
  beatId?: string;
  visualScore?: number; // 视觉价值评分 V (0.00 ~ 1.00)
  communicationGoal?: string; // 视觉导演 1秒读懂目标
  shot?: string; // 景别机位 (wide / medium / close 等)
  scenePlan?: any; // 完整导演分镜规划表
  promptBlocks?: any; // 结构化提示词模块
}

export type IllustrationDensity = 'sparse' | 'standard' | 'dense';

export interface IllustrationLayout {
  xPercent: number;     // 0.0 - 1.0
  yPercent: number;     // 0.0 - 1.0
  widthPercent: number; // 0.0 - 1.0
  heightPercent: number;// 0.0 - 1.0
  positionPreset: 'top-left' | 'top' | 'top-right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'center' | 'custom';
  transitionEffect?: 'fade' | 'slide' | 'zoom' | 'none';
  borderStyle?: 'none' | 'clean_white' | 'rounded_card' | 'star_badge' | 'cyber_glow';
}

export interface MediaResolutionOption {
  id: string;             // e.g. '1080p', '720p', '480p', '360p', 'h265', 'h264'
  label: string;          // e.g. '1080P 超清', '720P 高清', '360P 流畅'
  videoUrl?: string;      // 该清晰度对应的视频流直链
  audioUrl?: string;      // 对应的独立音频流（若有）
  quality?: number;       // 如 B站 qn: 80, 64, 32, 16
  bitrate?: number;       // 码率 (bps)
  width?: number;         // 分辨率宽
  height?: number;        // 分辨率高
  format?: string;        // mp4, h264, h265
  sizeEstimated?: number | string; // 预估文件大小 (bytes 或 MB 字符串)
  isDefault?: boolean;    // 是否为默认推荐项（最高画质）
}

export interface ParsedMediaInfo {
  platform: 'douyin' | 'bilibili' | 'kuaishou' | 'xiaohongshu' | 'generic';
  platformName: string;
  mediaType?: 'video' | 'images';
  title: string;
  desc?: string;
  author: string;
  authorAvatar?: string;
  coverUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  durationSec?: number;
  originalUrl: string;
  headers?: Record<string, string>;
  images?: string[];
  rawImages?: string[]; // 100% 超清无损原图列表 (去除 CDN 缩放/WebP压缩后的原图)
  resolutions?: MediaResolutionOption[]; // 可选清晰度列表（按画质从高到低排序）
  selectedResolutionId?: string;        // 默认选中的清晰度 ID
}

export interface AvatarFigure {
  type: string; // whole_body, sit_body, circle_view
  cover: string;
  pic_path?: string;
  width: number;
  height: number;
  preview_video_url?: string;
  bg_replace?: boolean;
}

export interface AvatarItem {
  id: string;
  name: string;
  gender?: string;
  figures: AvatarFigure[];
  audio_name?: string;
  audio_man_id?: string;
  audio_preview?: string;
  audio_lang?: string;
  tag_ids?: number[];
  tag_names?: string[];
}

export interface CustomAvatarItem {
  id: string;
  name: string;
  pic_url: string;
  preview_url?: string;
  audio_man_id?: string;
  status: number; // 蝉镜状态码：2 已就绪完成，1 训练/制作中，0 排队，3 失败
  progress?: number; // 进度百分比 0-100
  is_ready?: boolean; // 是否可用于生成视频
  source: 0 | 1; // 0 API定制 1 主站定制
  support_4k?: boolean;
  create_time?: number;
}

export interface FontItem {
  id: string;
  name: string;
  preview?: string;
  ttf_path?: string;
}

export interface SubtitleStyleConfig {
  show: boolean;
  preset?: 'white-black' | 'yellow-black' | 'black-white' | 'cyan-glow' | 'custom';
  fontId?: string;
  fontSize?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface AvatarVideoTask {
  id: string;
  status: number; // 10生成中，30成功，4X/5X异常
  progress: number; // 0-100
  msg?: string;
  video_url?: string;
  subtitle_data_url?: string;
  create_time?: number;
  preview_url?: string;
  duration?: number;
  queue_status?: 'queued' | 'processing' | 'completed' | 'failed' | 'other';
  queue_desc?: string;
  ossKey?: string; // 临时音频 OSS key（任务结束后自动删除）
}

export interface CreateAvatarVideoParams {
  personId: string;
  figureType?: string;
  isCustom?: boolean;
  source?: 0 | 1;
  driveType: 'tts' | 'audio';
  text?: string;
  speed?: number;
  audioMan?: string;
  wavUrl?: string;
  aspectRatio: '9:16' | '16:9';
  model?: number; // 0基础版, 1高质版
  showSubtitle?: boolean;
  subtitleConfig?: SubtitleStyleConfig;
  ossKey?: string;
}

declare global {
  interface Window {
    JaygoAPI: JaygoAPI;
  }
}
