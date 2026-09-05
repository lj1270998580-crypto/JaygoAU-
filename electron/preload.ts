import { contextBridge, ipcRenderer, webUtils } from 'electron';

export type VoiceRecord = {
  id: string;
  name: string;
  createdAt: number;
  status: number;
  modelType?: number;
  note?: string;
};

export type LibraryItem = {
  id: string;
  text: string;
  path: string;
  voiceName: string;
  voiceId: string;
  format: string;
  size: number;
  createdAt: number;
};

export type ScannedAudio = {
  path: string;
  name: string;
  size: number;
  createdAt: number;
  ext: string;
};

export type Settings = {
  outputDir: string;
  resourceId: string;
  officialResourceId: string;
  defaultFormat: 'mp3' | 'wav' | 'ogg_opus' | 'pcm';
  defaultSampleRate: number;
  speed: number;
  volume: number;
  language: number;
  denoise: boolean;
  voices: VoiceRecord[];
  library: LibraryItem[];
  // ---- 视音频转录（录音文件识别 2.0） ----
  asrResourceId: string;
  enableSpeakerInfo: boolean;
  // ---- 火山 AK/SK ----
  volcAccessKeyId: string;
  volcSecretKey: string;
  // ---- 蝉镜开放平台 ----
  chanjingAppId?: string;
  chanjingSecretKey?: string;
  // ---- 用户上次使用的音色记忆 ----
  lastSelectedVoiceId?: string | null;
  lastOfficialVoiceId?: string;
};

export type SynthProgress = { stage: 'streaming' | 'done'; pct: number; bytes: number };

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string }
  | { type: 'not-available'; version?: string }
  | { type: 'downloaded'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'error'; message: string };

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('getSettings'),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('hasApiKey'),
  setApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('setApiKey', key),
  clearApiKey: (): Promise<boolean> => ipcRenderer.invoke('clearApiKey'),
  saveSettings: (partial: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('saveSettings', partial),

  pickAudioFile: (): Promise<string | null> => ipcRenderer.invoke('pickAudioFile'),
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return (file as any).path || '';
    }
  },
  chooseOutputDir: (): Promise<(Settings & { migrated: number; skipped: number }) | null> =>
    ipcRenderer.invoke('chooseOutputDir'),
  openOutputDir: (): Promise<boolean> => ipcRenderer.invoke('openOutputDir'),

  cloneVoice: (args: { name: string; filePath: string; language: number; denoise: boolean }) =>
    ipcRenderer.invoke('cloneVoice', args),
  queryVoice: (speakerId: string) => ipcRenderer.invoke('queryVoice', speakerId),
  testApiKey: (): Promise<{
    ok: boolean;
    stage?: string;
    status: number;
    keyValid: boolean | null;
    resourceGranted: boolean | null;
    network?: boolean;
    message: string;
  }> => ipcRenderer.invoke('testApiKey'),
  addManualVoice: (args: { id: string; name: string }) =>
    ipcRenderer.invoke('addManualVoice', args),
  removeVoice: (speakerId: string) => ipcRenderer.invoke('removeVoice', speakerId),
  removeLibraryItem: (itemPath: string) => ipcRenderer.invoke('removeLibraryItem', itemPath),
  renameVoice: (args: { id: string; name: string }): Promise<boolean> =>
    ipcRenderer.invoke('renameVoice', args),
  importVoices: (rawIds: string): Promise<{ added: number; failed: string[] }> =>
    ipcRenderer.invoke('importVoices', rawIds),
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('windowMinimize'),
  windowToggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('windowToggleMaximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('windowClose'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('windowIsMaximized'),

  synthesize: (args: {
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
  }) => ipcRenderer.invoke('synthesize', args),

  previewVoice: (args: { speakerId: string; official?: boolean }) =>
    ipcRenderer.invoke('previewVoice', args),

  readAudio: (p: string): Promise<string> => ipcRenderer.invoke('readAudio', p),
  downloadAudio: (args: { path: string; suggestedName: string }): Promise<string | null> =>
    ipcRenderer.invoke('downloadAudio', args),
  listLibrary: (): Promise<ScannedAudio[]> => ipcRenderer.invoke('listLibrary'),

  // ---- 视音频转录 ----
  pickMediaFile: (): Promise<string | null> => ipcRenderer.invoke('pickMediaFile'),
  transcribe: (args: { filePath: string; enableSpeakerInfo: boolean }) =>
    ipcRenderer.invoke('transcribe', args),
  getBalance: (): Promise<{
    available: number;
    cash: number;
    arrears: number;
    freeze: number;
    fetchedAt: number;
  } | null> => ipcRenderer.invoke('getBalance'),

  onTranscribeStatus: (cb: (msg: string) => void) => {
    const listener = (_e: unknown, msg: string) => cb(msg);
    ipcRenderer.on('transcribe-status', listener);
    return () => ipcRenderer.removeListener('transcribe-status', listener);
  },

  onSynthProgress: (cb: (p: SynthProgress) => void) => {
    const listener = (_e: unknown, p: SynthProgress) => cb(p);
    ipcRenderer.on('synth-progress', listener);
    return () => ipcRenderer.removeListener('synth-progress', listener);
  },

  // ---- 在线更新 ----
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  checkUpdates: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('check-updates'),
  downloadUpdate: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('download-update'),
  quitInstallUpdate: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('quit-install-update'),
  onUpdateEvent: (cb: (e: UpdateEvent) => void) => {
    const listener = (_e: unknown, payload: UpdateEvent) => cb(payload);
    ipcRenderer.on('update-event', listener);
    return () => ipcRenderer.removeListener('update-event', listener);
  },

  // ---- 蝉镜开放平台（数字人） ----
  chanjingAuth: () => ipcRenderer.invoke('chanjing-auth'),
  chanjingListAvatars: (args?: { page?: number; size?: number }) =>
    ipcRenderer.invoke('chanjing-list-avatars', args),
  chanjingListCustomAvatars: () => ipcRenderer.invoke('chanjing-list-custom-avatars'),
  chanjingGetFontList: () => ipcRenderer.invoke('chanjing-get-font-list'),
  chanjingCreateVideo: (params: any) => ipcRenderer.invoke('chanjing-create-video', params),
  chanjingQueryVideo: (id: string) => ipcRenderer.invoke('chanjing-query-video', id),
  chanjingListVideos: (args?: { page?: number; size?: number }) =>
    ipcRenderer.invoke('chanjing-list-videos', args),
  chanjingDeleteVideo: (id: string) => ipcRenderer.invoke('chanjing-delete-video', id),
  chanjingDownloadVideo: (args: { url: string; defaultName?: string }) =>
    ipcRenderer.invoke('chanjing-download-video', args),
  chanjingUploadTempAudio: (args: { localPath: string }) =>
    ipcRenderer.invoke('chanjing-upload-temp-audio', args),
  chanjingDeleteTempAudio: (args: { key: string }) =>
    ipcRenderer.invoke('chanjing-delete-temp-audio', args),
  // ---- 系统与桌面图标自愈 ----
  refreshDesktopIconCache: (args?: { deep?: boolean }) =>
    ipcRenderer.invoke('refresh-desktop-icon-cache', args),
  // ---- 系统托盘与原生桌面通知 ----
  showNotification: (args: { title: string; body: string; tab?: string }) =>
    ipcRenderer.invoke('show-notification', args),
  appQuit: () => ipcRenderer.invoke('app-quit'),
  onNavigateTab: (cb: (tab: string) => void) => {
    const listener = (_e: any, tab: string) => cb(tab);
    ipcRenderer.on('navigate-tab', listener);
    return () => ipcRenderer.removeListener('navigate-tab', listener);
  },
  // ---- 多平台媒体/短视频无水印提取 ----
  extractMedia: (input: string) => ipcRenderer.invoke('extract-media', input),
  downloadExtractedMedia: (args: { mediaInfo: any; type: 'video' | 'audio' }) =>
    ipcRenderer.invoke('download-extracted-media', args),
  extractMediaForTranscribe: (args: { mediaInfo: any }) =>
    ipcRenderer.invoke('extract-media-for-transcribe', args),
  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('showItemInFolder', filePath),
};

contextBridge.exposeInMainWorld('JaygoAPI', api);
