import { create } from 'zustand';
import { api } from './lib/ipc';
import type { Settings, LibraryItem, ScannedAudio } from './types';

// 将已记录的库与磁盘扫描结果合并（按路径去重，磁盘历史文件补默认字段）
function mergeLibrary(existing: LibraryItem[], scanned: ScannedAudio[]): LibraryItem[] {
  const byPath = new Map(existing.map((i) => [i.path, i]));
  for (const s of scanned) {
    if (!byPath.has(s.path)) {
      byPath.set(s.path, {
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
  return Array.from(byPath.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export type Tab = 'settings' | 'clone' | 'voices' | 'synth' | 'library' | 'transcribe';

export interface BalanceInfo {
  available: number;
  cash: number;
  arrears: number;
  freeze: number;
  fetchedAt: number;
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

  init: () => Promise<void>;
  setTab: (t: Tab) => void;
  setSelectedVoice: (id: string | null) => void;
  setOfficialVoice: (id: string) => void;
  removeLibrary: (path: string) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  patchSettings: (p: Partial<Settings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  addLibrary: (item: LibraryItem) => void;
  setSynth: (s: Partial<AppState['synth']>) => void;
  showToast: (msg: string, type?: 'ok' | 'err' | 'info') => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<AppState>((set, get) => ({
  settings: null,
  hasKey: false,
  tab: 'clone',
  selectedVoiceId: null,
  officialVoiceId: '',
  library: [],
  synth: { active: false, pct: 0, stage: '' },
  toast: null,

  async init() {
    const [settings, hasKey, scanned] = await Promise.all([
      api.getSettings(),
      api.hasApiKey(),
      api.listLibrary(),
    ]);
    const merged = mergeLibrary(settings.library ?? [], scanned);
    if (merged.length !== (settings.library?.length ?? 0)) {
      await api.saveSettings({ library: merged }).catch(() => {});
    }
    set({ settings: { ...settings, library: merged }, hasKey, library: merged, tab: hasKey ? 'synth' : 'settings' });
  },

  setTab(t) {
    set({ tab: t });
  },

  setSelectedVoice(id) {
    set({ selectedVoiceId: id });
  },

  setOfficialVoice(id) {
    set({ officialVoiceId: id });
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
