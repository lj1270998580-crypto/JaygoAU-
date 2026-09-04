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
    utterances: { text: string; startTime: number; endTime: number; speaker?: string }[];
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
  chanjingCreateVideo(params: CreateAvatarVideoParams): Promise<{ videoId: string }>;
  chanjingQueryVideo(id: string): Promise<AvatarVideoTask>;
  chanjingListVideos(a?: { page?: number; size?: number }): Promise<{ list: AvatarVideoTask[]; total: number }>;
  chanjingDownloadVideo(a: { url: string; defaultName?: string }): Promise<{ canceled: boolean; filePath?: string }>;
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
}

export interface CreateAvatarVideoParams {
  personId: string;
  figureType?: string;
  driveType: 'tts' | 'audio';
  text?: string;
  speed?: number;
  audioMan?: string;
  wavUrl?: string;
  aspectRatio: '9:16' | '16:9';
  model?: number; // 0基础版, 1高质版
  showSubtitle?: boolean;
}

declare global {
  interface Window {
    JaygoAPI: JaygoAPI;
  }
}
