import { useEffect } from 'react';
import { useStore, type Tab } from './store';
import { api } from './lib/ipc';
import Settings from './components/Settings';
import Clone from './components/Clone';
import Voices from './components/Voices';
import Synthesize from './components/Synthesize';
import Library from './components/Library';
import Transcribe from './components/Transcribe';

/* 16x16 线性图标（1.5 描边，currentColor） */
const Icon = {
  clone: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  ),
  voices: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  synth: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  library: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  transcribe: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="10" x2="4" y2="14" />
      <line x1="8" y1="6" x2="8" y2="18" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="16" y1="6" x2="16" y2="18" />
      <line x1="20" y1="10" x2="20" y2="14" />
    </svg>
  ),
  settings: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const NAV: { key: Tab; label: string; icon: JSX.Element }[] = [
  { key: 'synth', label: '语音合成', icon: Icon.synth },
  { key: 'clone', label: '声音复刻', icon: Icon.clone },
  { key: 'voices', label: '音色库', icon: Icon.voices },
  { key: 'library', label: '音频库', icon: Icon.library },
  { key: 'transcribe', label: '视音频转录', icon: Icon.transcribe },
  { key: 'settings', label: '设置', icon: Icon.settings },
];

// 左下角账户余额：读取火山 AK/SK 配置后实时查询，并每 60s 刷新一次
function BalanceIndicator() {
  const { settings, balance, refreshBalance } = useStore();
  useEffect(() => {
    refreshBalance();
    const t = setInterval(() => refreshBalance(), 60000);
    return () => clearInterval(t);
  }, [refreshBalance]);

  const hasAk = Boolean(settings?.volcAccessKeyId);
  let value: JSX.Element;
  if (!hasAk) {
    value = <span className="text-zinc-400">未配置 AK/SK</span>;
  } else if (!balance) {
    value = <span className="text-zinc-400">获取失败</span>;
  } else {
    const low = balance.available <= 0;
    value = <span className={low ? 'text-rose-500' : 'text-emerald-600'}>¥{balance.available.toFixed(2)}</span>;
  }
  const tip = balance
    ? `可用余额 ¥${balance.available.toFixed(2)} ｜ 现金 ¥${balance.cash.toFixed(2)} ｜ 欠费 ¥${balance.arrears.toFixed(2)} ｜ 冻结 ¥${balance.freeze.toFixed(2)}`
    : '在「设置 → 火山 AK/SK」填写后，可实时显示账户余额';
  return (
    <div
      className="flex items-center gap-2 mx-1 px-2.5 h-8 rounded-md text-[12px] bg-zinc-50 text-zinc-600"
      title={tip}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <circle cx="12" cy="13" r="1.4" />
      </svg>
      <span className="text-zinc-400">余额</span>
      <span className="ml-auto font-medium">{value}</span>
    </div>
  );
}

// 左下角在线更新：检查 / 下载 / 重启安装
function UpdateWidget() {
  const { appVersion, update, initUpdate, checkUpdates, downloadUpdate, quitInstallUpdate } = useStore();
  useEffect(() => {
    initUpdate();
  }, [initUpdate]);

  let action: JSX.Element;
  if (update.checking) {
    action = <span className="text-zinc-400">检查中…</span>;
  } else if (update.error) {
    action = <span className="text-rose-500" title={update.error}>检查出错</span>;
  } else if (update.downloaded) {
    action = (
      <button className="text-emerald-600 hover:underline font-medium" onClick={quitInstallUpdate} title="退出并静默安装，完成后自动重新打开">
        重启并更新
      </button>
    );
  } else if (update.available) {
    const downloading = update.progress > 0;
    action = (
      <button
        className="text-blue-600 hover:underline font-medium"
        onClick={downloadUpdate}
        disabled={downloading}
        title={update.available.releaseNotes || `发现新版本 v${update.available.version}`}
      >
        {downloading ? `下载中 ${Math.floor(update.progress)}%` : `下载 v${update.available.version}`}
      </button>
    );
  } else if (update.notAvailable) {
    action = <span className="text-zinc-400">已是最新</span>;
  } else {
    action = (
      <button className="text-zinc-400 hover:text-zinc-600" onClick={checkUpdates}>
        检查更新
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-2 mx-1 px-2.5 h-8 rounded-md text-[12px] bg-zinc-50 text-zinc-600"
      title={update.available?.releaseNotes || '软件更新'}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <polyline points="21 3 21 9 15 9" />
      </svg>
      <span className="text-zinc-400">v{appVersion || '—'}</span>
      <span className="ml-auto">{action}</span>
    </div>
  );
}

export default function App() {
  const { settings, hasKey, tab, toast, init, setTab, setSynth, showToast } = useStore();

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    const off = api.onSynthProgress((p) => {
      setSynth({ active: p.stage !== 'done', pct: p.pct, stage: p.stage });
      if (p.stage === 'done') {
        showToast('合成完成，可试听 / 下载', 'ok');
      }
    });
    return off;
  }, []);

  // 兜底：preload 未注入时给出明确提示，避免白屏无从排查
  if (!api) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <div className="app-bg" />
        <div className="relative z-10 flex h-full items-center justify-center p-8">
          <div className="glass max-w-md p-6 text-center">
            <div className="text-lg font-semibold text-rose-600">预加载脚本未生效</div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              渲染进程未检测到 <code className="text-zinc-800">window.JaygoAPI</code>。
              请确认是通过桌面快捷方式启动（而非直接打开 index.html），必要时重新安装本应用。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col">
      <div className="app-bg" />

      {/* ---- 自绘标题栏：可拖动，右侧为最小化 / 最大化 / 关闭 ---- */}
      <div className="titlebar relative z-20">
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <span className="grid h-[18px] w-[18px] place-items-center rounded bg-blue-600 text-[10px] font-bold text-white">J</span>
          <span>Jaygo AU</span>
          <span className="text-[11px] text-zinc-400">豆包语音可视化GUI平台</span>
        </div>
        <div className="flex">
          <button className="titlebar-btn" title="最小化" onClick={() => api.windowMinimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button className="titlebar-btn" title="最大化" onClick={() => api.windowToggleMaximize()}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button className="titlebar-btn close" title="关闭" onClick={() => api.windowClose()}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 min-h-0">
        {/* 窄图标侧边栏 */}
        <aside className="rail">
          {NAV.map((n) => (
            <div
              key={n.key}
              className={`rail-item ${tab === n.key ? 'rail-item-active' : ''}`}
              onClick={() => setTab(n.key)}
            >
              {n.icon}
              <span className="rail-tip">{n.label}</span>
            </div>
          ))}

          <div className="flex-1" />

          {/* Key 状态：直观显示配置情况 */}
          <div
            className={`flex items-center gap-2 mx-1 px-2.5 h-8 rounded-md text-[12px] ${
              hasKey ? 'text-emerald-600 bg-emerald-50' : 'text-rose-500 bg-rose-50'
            }`}
            title={hasKey ? 'API Key 已配置' : '未配置 API Key'}
          >
            <span className={`block h-1.5 w-1.5 rounded-full ${hasKey ? 'bg-emerald-500' : 'bg-rose-400 animate-pulse'}`} />
            {hasKey ? '已连接' : '未配置 Key'}
          </div>

          {/* 余额（左下角，需配置火山 AK/SK）+ 在线更新 */}
          <BalanceIndicator />
          <UpdateWidget />
        </aside>

        {/* 主内容：白底大画布 */}
        <main className="flex-1 min-w-0 overflow-hidden bg-white border-l border-zinc-100">
          <div className="h-full overflow-y-auto">
            {!settings ? (
              <div className="h-full flex items-center justify-center text-zinc-400 text-sm">加载中…</div>
            ) : (
              <>
              {tab === 'settings' && <Settings />}
              {tab === 'clone' && <Clone />}
              {tab === 'voices' && <Voices />}
              {tab === 'synth' && <Synthesize />}
              {tab === 'library' && <Library />}
              {tab === 'transcribe' && <Transcribe />}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`px-4 py-2.5 rounded-lg text-[13px] shadow-lg ${
              toast.type === 'ok'
                ? 'bg-zinc-900 text-white'
                : toast.type === 'err'
                ? 'bg-rose-600 text-white'
                : 'bg-zinc-900 text-white'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
