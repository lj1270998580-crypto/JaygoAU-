import { create } from 'zustand';
import { api } from './lib/ipc';
import type { Settings, LibraryItem, ScannedAudio, UpdateEvent } from './types';

// 将已记录的库与磁盘扫描结果合并（按路径去重，自动修复多机运行/目录变更时的失效绝对路径）
function mergeLibrary(existing: LibraryItem[], scanned: ScannedAudio[]): LibraryItem[] {
  const scannedByName = new Map<string, ScannedAudio>();
  const scannedByPath = new Set<string>();
  for (const s of scanned) {
    const fn = s.name.toLowerCase();
    scannedByName.set(fn, s);
    scannedByPath.add(s.path.toLowerCase());
  }

  const updatedExisting: LibraryItem[] = [];
  const handledPaths = new Set<string>();

  for (const item of existing) {
    let finalPath = item.path;
    const itemFileName = (item.path.split(/[/\\]/).pop() || '').toLowerCase();
    // 若原绝对路径不存在，但当前扫描目录中有同名真实文件，自动纠偏为当前真实路径
    if (!scannedByPath.has(item.path.toLowerCase()) && scannedByName.has(itemFileName)) {
      const match = scannedByName.get(itemFileName)!;
      finalPath = match.path;
    }
    const pathKey = finalPath.toLowerCase();
    if (!handledPaths.has(pathKey)) {
      handledPaths.add(pathKey);
      updatedExisting.push({ ...item, path: finalPath });
    }
  }

  // 追加磁盘上存在但现有记录中没有的新文件
  for (const s of scanned) {
    const pathKey = s.path.toLowerCase();
    if (!handledPaths.has(pathKey)) {
      handledPaths.add(pathKey);
      updatedExisting.push({
        id: s.path,
        text: s.name,
        path: s.path,
        voiceName: '历史音频',
        voiceId: '',
        format: s.ext === 'ogg_opus' ? 'ogg' : s.ext,
        size: s.size,
        createdAt: s.createdAt,
      });
    }
  }

  return updatedExisting.sort((a, b) => b.createdAt - a.createdAt);
}

export type Tab = 'settings' | 'clone' | 'voices' | 'synth' | 'library' | 'transcribe' | 'avatar' | 'extractor' | 'script' | 'workflow';
export type { LibraryItem } from './types';
import type { ModelHubSettings } from './lib/modelHubTypes';
import { DEFAULT_MODEL_HUB_SETTINGS, PRESET_PROVIDERS } from './lib/modelHubTypes';

export interface BalanceInfo {
  available: number;
  cash: number;
  arrears: number;
  freeze: number;
  fetchedAt: number;
}

export interface UpdateState {
  checking: boolean;
  available: { version: string; releaseNotes?: string } | null;
  downloaded: boolean;
  progress: number;
  error: string | null;
  notAvailable: boolean;
}

interface AppState {
  settings: Settings | null;
  hasKey: boolean;
  tab: Tab;
  selectedVoiceId: string | null;
  officialVoiceId: string;
  library: LibraryItem[];
  synth: { active: boolean; pct: number; stage: string; voiceName?: string };
  toast: { msg: string; type: 'ok' | 'err' | 'info' } | null;
  balance: BalanceInfo | null;
  appVersion: string;
  update: UpdateState;
  theme: 'light' | 'dark';

  init: () => Promise<void>;
  setTab: (t: Tab) => void;
  setTheme: (th: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setSelectedVoice: (id: string | null) => void;
  setOfficialVoice: (id: string) => void;
  removeLibrary: (path: string) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => void;
  patchSettings: (p: Partial<Settings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  initUpdate: () => void;
  checkUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitInstallUpdate: () => void;
  addLibrary: (item: LibraryItem) => void;
  setSynth: (s: Partial<AppState['synth']>) => void;
  showToast: (msg: string, type?: 'ok' | 'err' | 'info') => void;
  pendingTranscribe: { filePath: string; fileName: string; autoStart?: boolean } | null;
  setPendingTranscribe: (p: { filePath: string; fileName: string; autoStart?: boolean } | null) => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  modelHubSettings: ModelHubSettings;
  setModelHubSettings: (s: ModelHubSettings) => void;
  pendingSynthText: { text: string; voiceId?: string } | null;
  setPendingSynthText: (p: { text: string; voiceId?: string } | null) => void;
  pendingAvatarText: string | null;
  setPendingAvatarText: (t: string | null) => void;
}

function sanitizeModelHubSettings(parsed: any): ModelHubSettings {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_MODEL_HUB_SETTINGS;
  const mergedProviders = {
    ...DEFAULT_MODEL_HUB_SETTINGS.providers,
    ...(parsed.providers || {}),
  };

  // 防御性校验商汤模型（若旧缓存为已下线的 sensenova-6.8-pro 或不在7个支持列表中，纠偏至 deepseek-v4-pro）
  if (mergedProviders.sensenova) {
    const validSenseNovaIds = PRESET_PROVIDERS.sensenova.models.map(m => m.id);
    const curModel = String(mergedProviders.sensenova.selectedModel || '').toLowerCase();
    if (validSenseNovaIds.includes(curModel)) {
      mergedProviders.sensenova.selectedModel = curModel;
    } else {
      mergedProviders.sensenova.selectedModel = 'deepseek-v4-pro';
    }
  }

  // 防御性校验 MiniMax 模型（若旧缓存仍为老旧版本，自动升级至 MiniMax-M3）
  if (mergedProviders.minimax) {
    const validMiniMaxIds = PRESET_PROVIDERS.minimax.models.map(m => m.id);
    if (!validMiniMaxIds.includes(mergedProviders.minimax.selectedModel)) {
      mergedProviders.minimax.selectedModel = 'MiniMax-M3';
    }
  }

  return {
    ...DEFAULT_MODEL_HUB_SETTINGS,
    ...parsed,
    providers: mergedProviders,
  };
}

function getInitialModelHubSettings(): ModelHubSettings {
  try {
    const raw = localStorage.getItem('jaygo_model_hub_settings_v1');
    if (raw) {
      return sanitizeModelHubSettings(JSON.parse(raw));
    }
  } catch {}
  return DEFAULT_MODEL_HUB_SETTINGS;
}

function applyTheme(th: 'light' | 'dark') {
  if (th === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  }
  try {
    localStorage.setItem('jaygo_theme', th);
  } catch {}
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('jaygo_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem('jaygo_sidebar_collapsed') === 'true';
  } catch {
    return false;
  }
}

const initialTheme = getInitialTheme();
applyTheme(initialTheme);

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<AppState>((set, get) => ({
  settings: null,
  hasKey: false,
  tab: 'clone',
  selectedVoiceId: null,
  officialVoiceId: 'zh_female_vv_uranus_bigtts',
  library: [],
  synth: { active: false, pct: 0, stage: '' },
  toast: null,
  balance: null,
  appVersion: '',
  update: { checking: false, available: null, downloaded: false, progress: 0, error: null, notAvailable: false },
  theme: initialTheme,
  pendingTranscribe: null,
  setPendingTranscribe: (p) => set({ pendingTranscribe: p }),
  sidebarCollapsed: getInitialSidebarCollapsed(),
  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed;
    set({ sidebarCollapsed: next });
    try {
      localStorage.setItem('jaygo_sidebar_collapsed', String(next));
    } catch {}
  },
  modelHubSettings: getInitialModelHubSettings(),
  setModelHubSettings: (s) => {
    set({ modelHubSettings: s });
    try {
      localStorage.setItem('jaygo_model_hub_settings_v1', JSON.stringify(s));
    } catch {}
    // 关键修复：立即通过 Electron IPC 持久化写到硬盘上的 jaygo-settings.json 中
    api.saveSettings({ modelHubSettings: s } as any).catch((err) => {
      console.error('Failed to persist modelHubSettings to disk:', err);
    });
  },
  pendingSynthText: null,
  setPendingSynthText: (p) => set({ pendingSynthText: p }),
  pendingAvatarText: null,
  setPendingAvatarText: (t) => set({ pendingAvatarText: t }),

  async init() {
    applyTheme(get().theme);
    get().initUpdate();
    const [settings, hasKey, scanned] = await Promise.all([
      api.getSettings(),
      api.hasApiKey(),
      api.listLibrary(),
    ]);
    const merged = mergeLibrary(settings.library ?? [], scanned);
    if (merged.length !== (settings.library?.length ?? 0)) {
      await api.saveSettings({ library: merged }).catch(() => {});
    }
    const initialOfficialVoice = settings.lastOfficialVoiceId !== undefined
      ? settings.lastOfficialVoiceId
      : (settings.lastSelectedVoiceId ? '' : 'zh_female_vv_uranus_bigtts');
    const initialSelectedVoice = settings.lastSelectedVoiceId ?? null;

    // 关键修复：优先从持久化磁盘 settings.json 加载 modelHubSettings
    let loadedModelHub = settings.modelHubSettings;
    if (!loadedModelHub) {
      try {
        const raw = localStorage.getItem('jaygo_model_hub_settings_v1');
        if (raw) loadedModelHub = JSON.parse(raw);
      } catch {}
    }
    let finalModelHub = get().modelHubSettings;
    if (loadedModelHub && loadedModelHub.providers) {
      finalModelHub = sanitizeModelHubSettings(loadedModelHub);
      set({ modelHubSettings: finalModelHub });
      try {
        localStorage.setItem('jaygo_model_hub_settings_v1', JSON.stringify(finalModelHub));
      } catch {}
    }
    // 若磁盘上暂无 modelHubSettings 记录，进行首次固化
    if (!settings.modelHubSettings && finalModelHub) {
      api.saveSettings({ modelHubSettings: finalModelHub } as any).catch(() => {});
    }

    // 磁盘持久化兜底同步：自定技能与工作流
    if (settings.customSkills && Array.isArray(settings.customSkills)) {
      try {
        localStorage.setItem('jaygo_au_custom_skills_v1', JSON.stringify(settings.customSkills));
      } catch {}
    }
    if (settings.workflowProjects && Array.isArray(settings.workflowProjects)) {
      try {
        localStorage.setItem('jaygo_au_workflows_v1', JSON.stringify(settings.workflowProjects));
      } catch {}
    }

    set({
      settings: { ...settings, library: merged },
      hasKey,
      library: merged,
      tab: hasKey ? 'synth' : 'settings',
      officialVoiceId: initialOfficialVoice,
      selectedVoiceId: initialSelectedVoice,
    });

    // 软件启动 1.5 秒后自动在后台检查云端更新
    setTimeout(() => {
      get().checkUpdates();
    }, 1500);
  },

  setTheme(th) {
    applyTheme(th);
    set({ theme: th });
  },

  toggleTheme() {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },

  setTab(t) {
    set({ tab: t });
  },

  setSelectedVoice(id) {
    set({ selectedVoiceId: id });
    api.saveSettings({ lastSelectedVoiceId: id, lastOfficialVoiceId: get().officialVoiceId }).catch(() => {});
  },

  setOfficialVoice(id) {
    set({ officialVoiceId: id });
    api.saveSettings({ lastOfficialVoiceId: id, lastSelectedVoiceId: get().selectedVoiceId }).catch(() => {});
  },

  async removeLibrary(itemPath) {
    await api.removeLibraryItem(itemPath);
    const next = get().library.filter((i) => i.path !== itemPath);
    set({ library: next });
    get().showToast('已删除音频', 'info');
  },

  async setApiKey(key) {
    await api.setApiKey(key);
    set({ hasKey: true });
    get().showToast('API Key 已保存（本地加密存储）', 'ok');
  },

  async clearApiKey() {
    await api.clearApiKey();
    set({ hasKey: false });
    get().showToast('已清除 API Key', 'info');
  },

  async patchSettings(p) {
    const s = await api.saveSettings(p);
    set({ settings: s });
  },

  async refreshSettings() {
    const s = await api.getSettings();
    set({ settings: s, library: s.library ?? get().library });
  },

  async refreshBalance() {
    const b = await api.getBalance().catch(() => null);
    set({ balance: b });
  },

  initUpdate() {
    api.getAppVersion().then((v) => set({ appVersion: v })).catch(() => {});
    api.onUpdateEvent((e: UpdateEvent) => {
      switch (e.type) {
        case 'checking':
          set({ update: { checking: true, available: null, downloaded: false, progress: 0, error: null, notAvailable: false } });
          break;
        case 'available':
          set({ update: { checking: false, available: { version: e.version, releaseNotes: e.releaseNotes }, downloaded: false, progress: 0, error: null, notAvailable: false } });
          break;
        case 'not-available':
          set({ update: { checking: false, available: null, downloaded: false, progress: 0, error: null, notAvailable: true } });
          break;
        case 'downloaded':
          set({ update: { ...get().update, checking: false, downloaded: true } });
          break;
        case 'progress':
          set({ update: { ...get().update, progress: e.percent } });
          break;
        case 'error':
          set({ update: { ...get().update, checking: false, error: e.message } });
          break;
      }
    });
  },

  async checkUpdates() {
    const r = await api.checkUpdates().catch((e: any) => ({ ok: false, error: e?.message || '检查失败' }));
    if (!r.ok) set({ update: { ...get().update, checking: false, error: r.error || '检查更新失败' } });
  },

  async downloadUpdate() {
    set({ update: { ...get().update, error: null } });
    const r = await api.downloadUpdate().catch((e: any) => ({ ok: false, error: e?.message || '下载失败' }));
    if (!r.ok) set({ update: { ...get().update, error: r.error || '下载更新失败' } });
  },

  quitInstallUpdate() {
    api.quitInstallUpdate().catch(() => {});
  },

  addLibrary(item) {
    const next = [item, ...get().library].slice(0, 500);
    set({ library: next });
    api.saveSettings({ library: next }).catch(() => {});
  },

  setSynth(s) {
    set({ synth: { ...get().synth, ...s } });
  },

  showToast(msg, type = 'info') {
    set({ toast: { msg, type } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
}));
