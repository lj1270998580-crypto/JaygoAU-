import { contextBridge, ipcRenderer } from 'electron';

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
  defaultFormat: 'mp3' | 'wav' | 'ogg_opus' | 'pcm';
  defaultSampleRate: number;
  speed: number;
  volume: number;
  language: number;
  denoise: boolean;
  voices: VoiceRecord[];
  library: LibraryItem[];
};

export type SynthProgress = { stage: 'streaming' | 'done'; pct: number; bytes: number };

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('getSettings'),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('hasApiKey'),
  setApiKey: (key: string): Promise<boolean> => ipcRenderer.invoke('setApiKey', key),
  clearApiKey: (): Promise<boolean> => ipcRenderer.invoke('clearApiKey'),
  saveSettings: (partial: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('saveSettings', partial),

  pickAudioFile: (): Promise<string | null> => ipcRenderer.invoke('pickAudioFile'),
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

  onSynthProgress: (cb: (p: SynthProgress) => void) => {
    const listener = (_e: unknown, p: SynthProgress) => cb(p);
    ipcRenderer.on('synth-progress', listener);
    return () => ipcRenderer.removeListener('synth-progress', listener);
  },
};

contextBridge.exposeInMainWorld('JaygoAPI', api);
