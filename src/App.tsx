import { useEffect, useState, useRef } from 'react';
import { useStore, type Tab } from './store';
import { api } from './lib/ipc';
import BrandLogo from './components/BrandLogo';
import Clone from './components/Clone';
import Voices from './components/Voices';
import Synthesize from './components/Synthesize';
import Library from './components/Library';
import Settings from './components/Settings';
import Transcribe from './components/Transcribe';
import AvatarStudio from './components/AvatarStudio';
import MediaExtractor from './components/MediaExtractor';

const Icon = {
  synth: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
    </svg>
  ),
  clone: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  ),
  voices: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  library: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  transcribe: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  extractor: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  avatar: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <polygon points="10 8 16 11.5 10 15 10 8" fill="currentColor" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

interface NavItem {
  key: Tab;
  label: string;
  icon: JSX.Element;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '音频生产',
    items: [
      { key: 'synth', label: '语音合成', icon: Icon.synth },
      { key: 'clone', label: '声音复刻', icon: Icon.clone },
      { key: 'voices', label: '音色中心', icon: Icon.voices },
    ],
  },
  {
    title: '视听创作',
    items: [
      { key: 'avatar', label: '蝉镜数字人', icon: Icon.avatar },
      { key: 'extractor', label: '媒体提取', icon: Icon.extractor },
      { key: 'transcribe', label: '视音频转录', icon: Icon.transcribe },
    ],
  },
  {
    title: '资产管理',
    items: [
      { key: 'library', label: '本地音频', icon: Icon.library },
    ],
  },
];

const TAB_BREADCRUMBS: Record<Tab, { group: string; label: string }> = {
  synth: { group: '音频生产', label: '语音合成' },
  clone: { group: '音频生产', label: '声音复刻' },
  voices: { group: '音频生产', label: '音色中心' },
  avatar: { group: '视听创作', label: '蝉镜数字人' },
  extractor: { group: '视听创作', label: '媒体提取' },
  transcribe: { group: '视听创作', label: '视音频转录' },
  library: { group: '资产管理', label: '本地音频' },
  settings: { group: '系统管理', label: '偏好设置' },
};

// 左下角三合一系统状态胶囊
function SystemStatusCapsule() {
  const { hasKey, balance, refreshBalance, appVersion, update, checkUpdates, downloadUpdate, quitInstallUpdate } =
    useStore();
  const [openDetail, setOpenDetail] = useState(false);
  const capsuleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    refreshBalance();
    const t = setInterval(() => refreshBalance(), 60000);
    return () => clearInterval(t);
  }, [refreshBalance]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (capsuleRef.current && !capsuleRef.current.contains(e.target as Node)) {
        setOpenDetail(false);
      }
    };
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  const hasNewVer = Boolean(update.available && update.available.version !== appVersion);

  return (
    <div className="relative" ref={capsuleRef}>
      {/* 胶囊主条 */}
      <div
        onClick={() => setOpenDetail(!openDetail)}
        className={`flex items-center justify-between h-8 px-2.5 rounded-lg border text-[11.5px] cursor-pointer transition select-none ${
          openDetail
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
            : 'border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-[#151518]/90 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
        }`}
        title="点击查看连接与账户余额明细"
      >
        {/* 左侧：连接小绿灯 */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`inline-block h-2 w-2 rounded-full shrink-0 ${
              hasKey ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-rose-400 animate-ping'
            }`}
          />
          <span className="font-medium truncate text-zinc-800 dark:text-zinc-200">
            {balance ? `¥${balance.available.toFixed(2)}` : hasKey ? '已连接' : '无Key'}
          </span>
        </div>

        {/* 右侧：版本或升级小红点 */}
        <div className="flex items-center gap-1 shrink-0 font-mono text-[11px] text-zinc-400">
          {hasNewVer ? (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-blue-600 text-white animate-pulse">
              更新 v{update.available?.version}
            </span>
          ) : update.checking ? (
            <span className="text-[10px] text-blue-500 animate-pulse">检查中…</span>
          ) : (
            <span>v{appVersion || '0.3.0'}</span>
          )}
        </div>
      </div>

      {/* 悬浮明细气泡卡片 */}
      {openDetail && (
        <div className="absolute bottom-10 left-0 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181c] p-3.5 shadow-xl shadow-black/10 z-50 animate-fade-in text-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">系统状态监视</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                hasKey
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-500'
              }`}
            >
              {hasKey ? 'API Key 正常' : '未配置 Key'}
            </span>
          </div>

          {/* 余额详情 */}
          <div className="space-y-1.5 font-mono text-[11.5px]">
            <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
              <span>可用余额:</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {balance ? `¥${balance.available.toFixed(2)}` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>现金账户:</span>
              <span>{balance ? `¥${balance.cash.toFixed(2)}` : '--'}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>欠费金额:</span>
              <span className={balance && balance.arrears > 0 ? 'text-rose-500' : ''}>
                {balance ? `¥${balance.arrears.toFixed(2)}` : '--'}
              </span>
            </div>
          </div>

          {/* 版本与升级 */}
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">
              当前版本：v{appVersion || '0.3.0'}
            </span>
            {hasNewVer ? (
              update.downloaded ? (
                <button
                  type="button"
                  onClick={quitInstallUpdate}
                  className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 transition"
                >
                  重启完成升级
                </button>
              ) : (
                <button
                  type="button"
                  onClick={downloadUpdate}
                  className="px-2 py-1 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 transition"
                >
                  {update.progress > 0 ? `下载中 ${Math.round(update.progress)}%` : `下载 v${update.available?.version}`}
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => checkUpdates()}
                disabled={update.checking}
                className="text-blue-600 dark:text-blue-400 hover:underline text-[11px]"
              >
                {update.checking ? '检查中…' : update.notAvailable ? '已是最新版 (重新检查)' : '检查更新'}
              </button>
            )}
          </div>
          {update.error && (
            <div className="text-[10.5px] text-rose-500 pt-1 leading-normal">
              {update.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const {
    settings,
    tab,
    toast,
    theme,
    init,
    setTab,
    toggleTheme,
    setSynth,
    showToast,
    sidebarCollapsed,
    toggleSidebarCollapsed,
  } = useStore();
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set([tab]));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarCollapsed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebarCollapsed]);

  useEffect(() => {
    const off = api.onSynthProgress((p) => {
      setSynth({ active: p.stage !== 'done', pct: p.pct, stage: p.stage });
      if (p.stage === 'done') {
        showToast('合成完成，可试听 / 下载', 'ok');
      }
    });
    return off;
  }, []);

  useEffect(() => {
    if (!api?.onNavigateTab) return;
    const off = api.onNavigateTab((targetTab: any) => {
      if (targetTab) {
        setTab(targetTab as Tab);
      }
    });
    return off;
  }, [setTab]);

  if (!api) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        <div className="app-bg" />
        <div className="relative z-10 flex h-full items-center justify-center p-8">
          <div className="glass max-w-md p-6 text-center">
            <div className="text-lg font-semibold text-rose-600">预加载脚本未生效</div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              渲染进程未检测到 <code className="text-zinc-800">window.JaygoAPI</code>。
              请确认是通过桌面快捷方式启动，必要时重新安装。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col bg-[#fafafa] dark:bg-[#0b0c10] text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
      <div className="app-bg" />

      {/* ---- 自绘顶栏：集成折叠开关、动态智能面包屑与窗口操作 ---- */}
      <div className="titlebar relative z-20">
        <div className="flex items-center gap-2.5 text-[12px] text-zinc-600 dark:text-zinc-400 font-medium select-none">
          {/* 折叠/展开侧边栏按钮 */}
          <button
            type="button"
            className="titlebar-btn !w-7 !h-7 !p-0 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition"
            title={sidebarCollapsed ? '展开侧边栏 (Ctrl+B)' : '收起侧边栏 (Ctrl+B)'}
            onClick={toggleSidebarCollapsed}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              {sidebarCollapsed ? (
                <polyline points="13 9 16 12 13 15" />
              ) : (
                <polyline points="7 9 4 12 7 15" />
              )}
            </svg>
          </button>

          {/* 当侧边栏折叠时：顶栏平滑淡入 Mini Logo 与品牌标识，保持品牌感知 */}
          {sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <BrandLogo size={18} />
              <span className="font-semibold text-zinc-900 dark:text-white text-[12px]">Jaygo AU</span>
              <span className="text-zinc-300 dark:text-zinc-700">/</span>
            </div>
          )}

          {/* 页面动态智能面包屑导航（消除顶栏重复 Logo，清晰标示当前模块） */}
          {TAB_BREADCRUMBS[tab] && (
            <div className="flex items-center gap-1.5 text-[11.5px]">
              <span className="text-zinc-400 dark:text-zinc-500">{TAB_BREADCRUMBS[tab].group}</span>
              <span className="text-zinc-300 dark:text-zinc-700 text-[10px]">›</span>
              <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{TAB_BREADCRUMBS[tab].label}</span>
            </div>
          )}
        </div>
        <div className="flex">
          <button className="titlebar-btn" title="最小化" onClick={() => api.windowMinimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="titlebar-btn" title="最大化" onClick={() => api.windowToggleMaximize()}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button className="titlebar-btn close" title="关闭" onClick={() => api.windowClose()}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative z-10 flex flex-1 min-h-0">
        {/* 现代侧边栏（支持平滑收起展开） */}
        <aside className={`rail ${sidebarCollapsed ? 'rail-collapsed' : ''} flex flex-col justify-between`}>
          {/* 上部：品牌展厅与核心创作导航 */}
          <div className="flex flex-col overflow-y-auto no-scrollbar">
            {/* 侧边栏专属品牌展厅卡片（消除顶栏重复，恢复饱满视觉锚点） */}
            <div className="px-1.5 pt-1 pb-3 mb-2 border-b border-zinc-200/70 dark:border-zinc-800/80">
              <BrandLogo size={28} showText={true} subtext="AI 自媒体创作工作台" />
            </div>

            {/* 核心创作导航 */}
            <div className="flex flex-col gap-1">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-0.5 mb-2">
                  <div className="rail-group-title">
                    <span>{group.title}</span>
                  </div>
                  {group.items.map((n) => (
                    <div
                      key={n.key}
                      className={`rail-item ${tab === n.key ? 'rail-item-active' : ''}`}
                      onClick={() => setTab(n.key)}
                    >
                      {n.icon}
                      <span className="rail-tip">{n.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* 下部固定底座：深浅主题切换 + 偏好设置 + 三合一状态胶囊 */}
          <div className="flex flex-col gap-2 pt-3 border-t border-zinc-200/70 dark:border-zinc-800/80">
            {/* 设置与主题切换组合行 */}
            <div className="flex items-center gap-1.5">
              {/* 独立偏好设置按钮（左下角核心入口） */}
              <div
                className={`rail-item flex-1 ${tab === 'settings' ? 'rail-item-active' : ''}`}
                onClick={() => setTab('settings')}
                title="系统偏好设置"
              >
                {Icon.settings}
                <span className="rail-tip">偏好设置</span>
              </div>

              {/* 暗黑模式切换按钮 */}
              <button
                type="button"
                onClick={toggleTheme}
                className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-[#151518]/90 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition shrink-0"
                title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              >
                {theme === 'dark' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
            </div>

            {/* 三合一状态监控胶囊 */}
            <SystemStatusCapsule />
          </div>
        </aside>

        {/* 主内容工作区画布（按需懒挂载 + Keep-Alive 虚拟栈，保留各模块文本输入、状态与后台任务） */}
        <main className="flex-1 min-w-0 overflow-hidden bg-white dark:bg-[#0c0c0e] border-l border-zinc-200/70 dark:border-zinc-800/80 transition-colors relative">
          {!settings ? (
            <div className="h-full flex items-center justify-center text-zinc-400 text-sm">加载中…</div>
          ) : (
            <div className="h-full relative">
              {visitedTabs.has('synth') && (
                <div className={`h-full overflow-y-auto ${tab === 'synth' ? 'block' : 'hidden'}`}>
                  <Synthesize />
                </div>
              )}
              {visitedTabs.has('clone') && (
                <div className={`h-full overflow-y-auto ${tab === 'clone' ? 'block' : 'hidden'}`}>
                  <Clone />
                </div>
              )}
              {visitedTabs.has('voices') && (
                <div className={`h-full overflow-y-auto ${tab === 'voices' ? 'block' : 'hidden'}`}>
                  <Voices />
                </div>
              )}
              {visitedTabs.has('library') && (
                <div className={`h-full overflow-y-auto ${tab === 'library' ? 'block' : 'hidden'}`}>
                  <Library />
                </div>
              )}
              {visitedTabs.has('transcribe') && (
                <div className={`h-full overflow-y-auto ${tab === 'transcribe' ? 'block' : 'hidden'}`}>
                  <Transcribe />
                </div>
              )}
              {visitedTabs.has('extractor') && (
                <div className={`h-full overflow-y-auto ${tab === 'extractor' ? 'block' : 'hidden'}`}>
                  <MediaExtractor />
                </div>
              )}
              {visitedTabs.has('avatar') && (
                <div className={`h-full ${tab === 'avatar' ? 'flex flex-col' : 'hidden'}`}>
                  <AvatarStudio />
                </div>
              )}
              {visitedTabs.has('settings') && (
                <div className={`h-full overflow-y-auto ${tab === 'settings' ? 'block' : 'hidden'}`}>
                  <Settings />
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 悬浮 Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-2xl backdrop-blur-md transition-all ${
              toast.type === 'ok'
                ? 'bg-zinc-900/90 text-white border border-zinc-700/50'
                : toast.type === 'err'
                ? 'bg-rose-600/95 text-white shadow-rose-500/20'
                : 'bg-zinc-800/90 text-zinc-100 border border-zinc-700/50'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
