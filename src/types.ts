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
  defaultFormat: 'mp3' | 'wav' | 'ogg_opus' | 'pcm';
  defaultSampleRate: number;
  speed: number;
  volume: number;
  language: number;
  denoise: boolean;
  voices: VoiceRecord[];
  library: LibraryItem[];
}

export interface SynthProgress {
  stage: 'streaming' | 'done';
  pct: number;
  bytes: number;
}

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
  onSynthProgress(cb: (p: SynthProgress) => void): () => void;
}

declare global {
  interface Window {
    JaygoAPI: JaygoAPI;
  }
}
