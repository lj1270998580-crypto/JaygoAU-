import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { FORMATS, SAMPLE_RATES, RESOURCE_IDS, LANGUAGES } from '../lib/format';
import { PRICING } from '../lib/pricing';
import { ModelHubModal } from './ModelHubModal';

type SettingsTab = 'ai_models' | 'preferences' | 'system' | 'about';

interface TabItem {
  id: SettingsTab;
  label: string;
  icon: string;
  badge?: string | number;
}

function SettingCard({
  title,
  desc,
  badge,
  action,
  children,
  className = '',
}: {
  title: string;
  desc?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/75 dark:bg-zinc-900/60 shadow-xs backdrop-blur-xs space-y-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/60 pb-3.5">
        <div>
          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>{title}</span>
            {badge}
          </div>
          {desc && <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">{desc}</div>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function Settings() {
  const {
    settings,
    hasKey,
    setApiKey,
    clearApiKey,
    patchSettings,
    showToast,
    modelHubSettings,
    setModelHubSettings,
    appVersion,
    update,
    checkUpdates,
    setChangelogOpen,
  } = useStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('ai_models');
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status: number;
    keyValid: boolean | null;
    resourceGranted: boolean | null;
    message: string;
  } | null>(null);

  const [cjTesting, setCjTesting] = useState(false);
  const [cjTestResult, setCjTestResult] = useState<{
    ok: boolean;
    message: string;
    accessToken?: string;
  } | null>(null);

  const [snTesting, setSnTesting] = useState(false);
  const [snTestResult, setSnTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!settings) return null;

  const saveKey = async () => {
    if (!keyInput.trim()) {
      showToast('请输入 API Key', 'err');
      return;
    }
    setBusy(true);
    try {
      await setApiKey(keyInput.trim());
      setKeyInput('');
      setTestResult(null);
      showToast('API Key 已保存', 'ok');
    } catch (e: any) {
      showToast(e?.message || '保存失败', 'err');
    } finally {
      setBusy(false);
    }
  };

  const testKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testApiKey();
      setTestResult(r);
    } catch (e: any) {
      setTestResult({ ok: false, status: 0, keyValid: null, resourceGranted: null, message: e?.message || '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  const testChanJing = async () => {
    if (!settings.chanjingAppId?.trim() || !settings.chanjingSecretKey?.trim()) {
      showToast('请先填写 App ID 与 Secret Key', 'err');
      return;
    }
    setCjTesting(true);
    setCjTestResult(null);
    try {
      const res = await api.chanjingAuth();
      setCjTestResult(res);
      if (res.ok) {
        showToast('蝉镜开放平台连接成功', 'ok');
      } else {
        showToast(res.message || '连接失败', 'err');
      }
    } catch (e: any) {
      setCjTestResult({ ok: false, message: e?.message || '连接异常' });
      showToast(e?.message || '连接异常', 'err');
    } finally {
      setCjTesting(false);
    }
  };

  const testSenseNovaKey = async () => {
    if (!settings.sensenovaApiKey?.trim()) {
      showToast('请先输入商汤 TokenPlan API Key', 'err');
      return;
    }
    setSnTesting(true);
    setSnTestResult(null);
    try {
      const res = await api.sensenovaTestKey(settings.sensenovaApiKey.trim());
      setSnTestResult(res);
      if (res.ok) {
        showToast('商汤日日新 TokenPlan 连接成功', 'ok');
      } else {
        showToast(res.message || '连接失败', 'err');
      }
    } catch (e: any) {
      setSnTestResult({ ok: false, message: e?.message || '连接异常' });
      showToast(e?.message || '连接异常', 'err');
    } finally {
      setSnTesting(false);
    }
  };

  const TABS: TabItem[] = [
    {
      id: 'ai_models',
      label: 'AI 模型与凭据',
      icon: '🔑',
      badge: hasKey ? '已就绪' : undefined,
    },
    {
      id: 'preferences',
      label: '创作与生成偏好',
      icon: '🎛️',
    },
    {
      id: 'system',
      label: '通用与系统设置',
      icon: '💻',
    },
    {
      id: 'about',
      label: '关于与费用说明',
      icon: 'ℹ️',
      badge: update.available ? '新版本' : undefined,
    },
  ];

  return (
    <div className="page pb-14 max-w-5xl">
      {/* 顶部标题与工具栏 */}
      <div className="page-head flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="page-title text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">设置中心</h2>
          <p className="page-desc text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            统一管理 AI 服务凭据、音视频生成偏好与客户端底层参数
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSecrets((s) => !s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 shadow-xs ${
              showSecrets
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
            title="一键切换页面中所有 SecretKey / API Key 的显隐明文状态"
          >
            <span>{showSecrets ? '🔒 隐藏敏感密匙' : '👁️ 显示敏感密匙'}</span>
          </button>
        </div>
      </div>

      {/* 现代化分段胶囊 Tab 导航 */}
      <div className="flex items-center gap-1 p-1 bg-zinc-200/60 dark:bg-zinc-800/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/60 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all select-none ${
                isActive
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs border border-zinc-200/50 dark:border-zinc-700/50'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-white/40 dark:hover:bg-zinc-700/40'
              }`}
            >
              <span className="text-sm">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-medium ${
                    tab.id === 'about'
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: AI 模型与服务凭据 */}
      {activeTab === 'ai_models' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 统一大模型中心 */}
          <SettingCard
            title="统一大模型中心 (Model Hub)"
            desc="集中管理火山豆包、DeepSeek、阿里通义千问、智谱清言、Kimi 及自定义大模型，统一驱动「AI 文案工坊」与「定时工作流」。"
            badge={
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-300 font-mono font-bold">
                {modelHubSettings.defaultProvider.toUpperCase()} 默认驱动
              </span>
            }
            action={
              <button
                type="button"
                onClick={() => setModelModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs shadow-blue-500/20 transition flex items-center gap-1.5"
              >
                <span>⚙️</span> 打开统一模型设置中心
              </button>
            }
          >
            <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-50/40 dark:bg-blue-950/20 text-xs text-zinc-600 dark:text-zinc-300 flex items-center justify-between">
              <div>
                <span className="font-medium text-blue-700 dark:text-blue-300">多模型路由就绪：</span>
                支持一键切换默认大模型、自定义 API Base URL 与连通性延时测速，无需在各个功能面板重复配置密钥。
              </div>
            </div>
          </SettingCard>

          {/* 火山引擎 X-Api-Key */}
          <SettingCard
            title="火山引擎 API Key (X-Api-Key)"
            desc="从火山引擎控制台「API Key 管理」获取；本机加密安全存储，用于语音合成、声音复刻与录音识别调用。"
            badge={
              hasKey ? (
                <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/20 text-[10px] px-2 py-0.5 rounded-full font-medium">
                  已配置且加密
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-500/20 text-[10px] px-2 py-0.5 rounded-full font-medium">
                  待配置
                </span>
              )
            }
          >
            <div className="flex gap-2">
              <input
                type={showKey || showSecrets ? 'text' : 'password'}
                className="glass-input flex-1 font-mono text-xs"
                placeholder={hasKey ? '已配置（留空表示不修改）' : '粘贴你的 X-Api-Key'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost text-xs px-3"
                onClick={() => setShowKey((s) => !s)}
              >
                {showKey || showSecrets ? '隐藏' : '显示'}
              </button>
              <button
                type="button"
                className="btn-primary text-xs px-4"
                onClick={saveKey}
                disabled={busy}
              >
                保存
              </button>
              {hasKey && (
                <button
                  type="button"
                  className="btn-danger text-xs px-3"
                  onClick={async () => {
                    await clearApiKey();
                    setTestResult(null);
                  }}
                >
                  清除
                </button>
              )}
              <button
                type="button"
                className="btn-ghost text-xs px-3"
                onClick={testKey}
                disabled={testing || !hasKey}
                title={hasKey ? '调用只读接口自检 Key 与资源授权' : '请先保存 API Key'}
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
            </div>

            {testResult && (
              <div
                className={`mt-3 p-3.5 rounded-xl text-xs leading-relaxed border ${
                  testResult.ok
                    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300'
                }`}
              >
                <div className="font-semibold mb-1 flex items-center gap-1.5">
                  <span>{testResult.ok ? '✓ 诊断通过' : `✕ 诊断未通过 (HTTP ${testResult.status || '—'})`}</span>
                </div>
                <div className="text-[12px] opacity-95 whitespace-pre-line">{testResult.message}</div>
                {!testResult.ok && (
                  <div className="mt-2 text-[11px] opacity-70">
                    Key 有效：{testResult.keyValid === null ? '未知' : testResult.keyValid ? '是' : '否'} ｜ 声音复刻资源已授权：
                    {testResult.resourceGranted === null ? '未知' : testResult.resourceGranted ? '是' : '否'}
                  </div>
                )}
              </div>
            )}

            {/* 火山 AK/SK（账户余额查询用） */}
            <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3.5 mt-3.5">
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                火山 AK/SK（用于左下角实时账户余额查询）
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-3">
                独立于 X-Api-Key；需在火山控制台「访问控制」创建，并授予账单查询权限。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label !text-[11px]">AccessKeyId</label>
                  <input
                    className="glass-input w-full font-mono text-xs"
                    value={settings.volcAccessKeyId || ''}
                    placeholder="如：AKLTxxxxxxxx"
                    onChange={(e) => patchSettings({ volcAccessKeyId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label !text-[11px]">SecretKey</label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    className="glass-input w-full font-mono text-xs"
                    placeholder="如：TVxxxxxxxxxxxxxxxx=="
                    value={settings.volcSecretKey || ''}
                    onChange={(e) => patchSettings({ volcSecretKey: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </SettingCard>

          {/* 商汤日日新 SenseNova */}
          <SettingCard
            title="商汤日日新 SenseNova（智能视频插图模型）"
            desc="驱动「智能视频配插图」工作台。默认支持 sensenova-u1.5-lite（高质场景/图生图）与 sensenova-u1-fast（极速信息图/数据图表）。"
          >
            <div>
              <label className="label !text-[11px]">TokenPlan API Key</label>
              <div className="flex gap-2">
                <input
                  type={showSecrets ? 'text' : 'password'}
                  className="glass-input flex-1 font-mono text-xs"
                  placeholder="输入商汤日日新 TokenPlan API Key..."
                  value={settings.sensenovaApiKey || ''}
                  onChange={(e) => {
                    patchSettings({ sensenovaApiKey: e.target.value });
                    setSnTestResult(null);
                  }}
                />
                <button
                  type="button"
                  onClick={testSenseNovaKey}
                  disabled={snTesting || !settings.sensenovaApiKey?.trim()}
                  className="btn-ghost text-xs px-3.5"
                >
                  {snTesting ? '测试中…' : '测试连接'}
                </button>
              </div>
            </div>

            {snTestResult && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  snTestResult.ok
                    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/50 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50/60 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800/50 dark:text-rose-300'
                }`}
              >
                {snTestResult.message}
              </div>
            )}

            <div className="flex items-center justify-between text-[11.5px] text-zinc-400 dark:text-zinc-500">
              <span>
                获取密匙与官方文档：
                <a
                  href="https://platform.sensenova.cn/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline ml-1"
                >
                  platform.sensenova.cn/docs
                </a>
              </span>
              <span className="text-zinc-400">画幅与模型偏好已收纳至「创作偏好」Tab</span>
            </div>
          </SettingCard>

          {/* 蝉镜开放平台 */}
          <SettingCard
            title="蝉镜开放平台（数字人视频生成）"
            desc="用于在「蝉镜数字人」工坊中一键渲染生成数字人口播视频。请在蝉镜 AI 开放平台创建应用获取凭证。"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label !text-[11px]">App ID</label>
                <input
                  type="text"
                  className="glass-input w-full font-mono text-xs"
                  placeholder="如：app_xxxxxxxxxxxx"
                  value={settings.chanjingAppId || ''}
                  onChange={(e) => {
                    patchSettings({ chanjingAppId: e.target.value });
                    setCjTestResult(null);
                  }}
                />
              </div>
              <div>
                <label className="label !text-[11px]">Secret Key</label>
                <input
                  type={showSecrets ? 'text' : 'password'}
                  className="glass-input w-full font-mono text-xs"
                  placeholder="如：sk_xxxxxxxxxxxxxxxx"
                  value={settings.chanjingSecretKey || ''}
                  onChange={(e) => {
                    patchSettings({ chanjingSecretKey: e.target.value });
                    setCjTestResult(null);
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-[11.5px] text-zinc-400 dark:text-zinc-500">
                开放接口文档：
                <a
                  href="https://doc.chanjing.cc/api/open-api-common-knowledge.html"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5 ml-1"
                >
                  doc.chanjing.cc
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              </div>
              <button
                type="button"
                className="btn-ghost text-xs px-3.5"
                onClick={testChanJing}
                disabled={cjTesting || !settings.chanjingAppId || !settings.chanjingSecretKey}
              >
                {cjTesting ? '验证凭证中…' : '测试连接蝉镜'}
              </button>
            </div>

            {cjTestResult && (
              <div
                className={`p-3 rounded-xl text-xs leading-relaxed border ${
                  cjTestResult.ok
                    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/50 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50/60 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800/50 dark:text-rose-300'
                }`}
              >
                <div className="font-semibold mb-0.5">
                  {cjTestResult.ok ? '✓ 凭证验证通过，已成功获取 AccessToken' : '✕ 凭证验证未通过'}
                </div>
                <div>{cjTestResult.message}</div>
              </div>
            )}
          </SettingCard>

          {/* 转录存储托管状态提示 */}
          <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 rounded-xl px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span>
              <strong>视音频转录存储已由 Jaygo 官方安全托管</strong>：转录音视频采用单次 / 短时预签名上传，任务结束后自动清理，你无需配置任何阿里云 OSS 密匙。
            </span>
          </div>
        </div>
      )}

      {/* Tab 2: 创作与生成偏好 */}
      {activeTab === 'preferences' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 语音合成默认参数 */}
          <SettingCard
            title="语音合成默认参数"
            desc="配置复刻语种、资源 ID，以及每次执行批量合成时的默认格式与采样率。"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">合成资源 ID（Resource-Id）</label>
                <select
                  className="glass-input w-full text-xs"
                  value={settings.resourceId}
                  onChange={(e) => patchSettings({ resourceId: e.target.value })}
                >
                  {RESOURCE_IDS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">官方音色资源 ID</label>
                <select
                  className="glass-input w-full text-xs"
                  value={settings.officialResourceId || 'seed-tts-2.0'}
                  onChange={(e) => patchSettings({ officialResourceId: e.target.value })}
                >
                  {RESOURCE_IDS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-400 mt-1">官方音色（非克隆）试听所用资源，默认 2.0。若账号仅开通 1.0 请切回。</p>
              </div>

              <div>
                <label className="label">复刻语种</label>
                <select
                  className="glass-input w-full text-xs"
                  value={settings.language}
                  onChange={(e) => patchSettings({ language: Number(e.target.value) })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">默认音频格式</label>
                <select
                  className="glass-input w-full text-xs"
                  value={settings.defaultFormat}
                  onChange={(e) => patchSettings({ defaultFormat: e.target.value as any })}
                >
                  {FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">默认采样率</label>
                <select
                  className="glass-input w-full text-xs"
                  value={settings.defaultSampleRate}
                  onChange={(e) => patchSettings({ defaultSampleRate: Number(e.target.value) })}
                >
                  {SAMPLE_RATES.map((s) => (
                    <option key={s} value={s}>{s} Hz</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 语速与音量滑块 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="label !mb-0">默认语速</label>
                  <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{settings.speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={settings.speed}
                  className="w-full accent-blue-600"
                  onChange={(e) => patchSettings({ speed: Number(e.target.value) })}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="label !mb-0">默认音量</label>
                  <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{settings.volume.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={settings.volume}
                  className="w-full accent-blue-600"
                  onChange={(e) => patchSettings({ volume: Number(e.target.value) })}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.denoise}
                onChange={(e) => patchSettings({ denoise: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">复刻时启用音频降噪</span>
            </label>
          </SettingCard>

          {/* 智能插图默认偏好 */}
          <SettingCard
            title="智能视频插图偏好"
            desc="设置商汤日日新智能生成插图时的默认画幅规格与模型分支。"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">默认偏好模型</label>
                <select
                  className="glass-input w-full text-xs"
                  value={settings.sensenovaDefaultModel || 'sensenova-u1.5-lite'}
                  onChange={(e) => patchSettings({ sensenovaDefaultModel: e.target.value })}
                >
                  <option value="sensenova-u1.5-lite">sensenova-u1.5-lite (标准图 · 4K高质场景/图生图)</option>
                  <option value="sensenova-u1-fast">sensenova-u1-fast (信息图 · 极速知识数据排版)</option>
                </select>
              </div>

              <div>
                <label className="label">默认生图画幅比例</label>
                <select
                  className="glass-input w-full text-xs"
                  value={settings.sensenovaDefaultRatio || '1:1'}
                  onChange={(e) => patchSettings({ sensenovaDefaultRatio: e.target.value })}
                >
                  <option value="1:1">1:1 正方形画中画 (2048x2048)</option>
                  <option value="9:16">9:16 竖屏手机卡片 (1536x2752)</option>
                  <option value="16:9">16:9 横屏信息图 (2752x1536)</option>
                  <option value="3:4">3:4 竖卡清单 (1760x2368)</option>
                  <option value="4:3">4:3 横卡展示 (2368x1760)</option>
                </select>
              </div>
            </div>
          </SettingCard>

          {/* 视音频智能转录偏好 */}
          <SettingCard
            title="视音频转录偏好"
            desc="录音文件识别 2.0：将音视频高效转写成带时间戳、标点符号与精美排版的台词字幕。"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">识别模型（Resource-Id）</label>
                <select
                  className="glass-input w-full text-xs"
                  value={settings.asrResourceId || 'volc.seedasr.auc'}
                  onChange={(e) => patchSettings({ asrResourceId: e.target.value })}
                >
                  <option value="volc.seedasr.auc">豆包录音文件识别 2.0（高精准确率）</option>
                  <option value="volc.bigasr.auc">豆包录音文件识别 1.0（经典兼容）</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 pt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.enableSpeakerInfo ?? false}
                onChange={(e) => patchSettings({ enableSpeakerInfo: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                默认开启说话人分离（多人对话按说话人分段排版，仅中文/普通话生效）
              </span>
            </label>
          </SettingCard>
        </div>
      )}

      {/* Tab 3: 通用与系统设置 */}
      {activeTab === 'system' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 音频文件存储位置 */}
          <SettingCard
            title="音频存储位置"
            desc="合成音频与试听原声的本地默认保存目录。修改后已有文件会自动迁移至新目录。"
          >
            <div className="flex items-center gap-2">
              <div className="glass-input flex-1 text-zinc-700 dark:text-zinc-300 break-all !h-auto !py-2 text-xs font-mono">
                {settings.outputDir || '使用系统默认目录'}
              </div>
              <button
                type="button"
                className="btn-primary whitespace-nowrap text-xs px-3.5"
                onClick={async () => {
                  const r = await api.chooseOutputDir();
                  if (!r) return;
                  useStore.setState({ settings: r });
                  if (r.migrated > 0) {
                    showToast(`存储位置已更新，迁移了 ${r.migrated} 个音频文件`, 'ok');
                  } else if (r.skipped > 0) {
                    showToast(`存储位置已更新（${r.skipped} 个文件迁移失败，保留在原位置）`, 'err');
                  } else {
                    showToast('存储位置已更新', 'ok');
                  }
                }}
              >
                修改位置
              </button>
              <button
                type="button"
                className="btn-ghost whitespace-nowrap text-xs px-3"
                onClick={() => api.openOutputDir()}
              >
                打开目录
              </button>
            </div>
          </SettingCard>

          {/* 系统托盘与任务通知 */}
          <SettingCard
            title="系统托盘与任务通知"
            desc="配置窗口关闭行为与长任务完成提示，防止误关导致后台数字人渲染或音视频转录中断。"
          >
            <div className="space-y-3.5">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.closeToTray !== false}
                  onChange={(e) => patchSettings({ closeToTray: e.target.checked })}
                  className="w-4 h-4 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    点击关闭按钮时最小化到系统托盘
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-relaxed">
                    推荐开启。点击右上角 ✕ 按钮时仅隐藏窗口至右下角托盘，后台任务（数字人视频渲染、音频转录）继续保持运行。彻底退出可在托盘图标右键选择「退出 Jaygo AU」。
                  </div>
                </div>
              </label>

              <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.notifyOnTaskComplete !== false}
                    onChange={(e) => patchSettings({ notifyOnTaskComplete: e.target.checked })}
                    className="w-4 h-4 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      长任务完成后发送 Windows 桌面弹窗通知
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-relaxed">
                      数字人视频渲染完成或音视频转录完成时，在屏幕右下角弹出系统原生通知。点击通知可直接唤起并跳转到对应任务页面。
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </SettingCard>

          {/* 桌面快捷方式与图标 */}
          <SettingCard
            title="桌面快捷方式与图标自愈"
            desc="若更新软件后桌面快捷方式仍显示为旧图标，通常是因为 Windows 系统的图标缓存机制，可在此一键自愈刷新。"
            badge={
              <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                极简微弧矩形已生效
              </span>
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                普通自愈点击通知 Windows 资源管理器重新载入图标；若仍未生效可使用“深度自愈”安全重启资源管理器。
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-primary !text-xs !py-1.5 flex items-center gap-1.5 whitespace-nowrap"
                  onClick={async () => {
                    try {
                      const res = await api.refreshDesktopIconCache();
                      if (res.ok) {
                        showToast(res.message || '桌面图标已刷新', 'ok');
                      } else {
                        showToast(res.message || '刷新指令发送异常', 'err');
                      }
                    } catch (e: any) {
                      showToast(e?.message || '刷新失败', 'err');
                    }
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  <span>🔄 立即刷新桌面图标</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost !text-xs !py-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 whitespace-nowrap"
                  title="清除系统 IconCache.db 并重启 Windows Explorer"
                  onClick={async () => {
                    if (!confirm('深度自愈将安全重启 Windows 资源管理器（桌面将短暂闪烁 1 秒后自动恢复），确定继续吗？')) return;
                    try {
                      const res = await api.refreshDesktopIconCache({ deep: true });
                      if (res.ok) {
                        showToast(res.message || '深度刷新完成', 'ok');
                      } else {
                        showToast(res.message || '深度刷新失败', 'err');
                      }
                    } catch (e: any) {
                      showToast(e?.message || '深度刷新失败', 'err');
                    }
                  }}
                >
                  深度自愈 (重启资源管理器)
                </button>
              </div>
            </div>
          </SettingCard>
        </div>
      )}

      {/* Tab 4: 关于与费用说明 */}
      {activeTab === 'about' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 版本与更新 */}
          <SettingCard
            title="版本信息与在线更新"
            desc="查看当前运行版本、在线检测增量更新与全版本演进更新日志。"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-mono font-bold text-sm shadow-md shadow-blue-500/20">
                  v{appVersion || '0.7.45'}
                </div>
                <div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>Jaygo AU 全能自媒体创作工作台</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                        update.available
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                          : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {update.available ? `有新版 v${update.available.version}` : '已是最新版'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                    语音合成 · 声音复刻 · 蝉镜数字人 · 智能媒体转录 · AI 文案工坊 · MCP 多智能体互联
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => checkUpdates()}
                  disabled={update.checking}
                  className="btn-ghost text-xs px-3.5 py-1.5"
                >
                  {update.checking ? '检查中…' : '检查更新'}
                </button>
                <button
                  type="button"
                  onClick={() => setChangelogOpen(true)}
                  className="btn-primary text-xs px-4 py-1.5"
                >
                  查看更新日志
                </button>
              </div>
            </div>
          </SettingCard>

          {/* 火山引擎官方价格说明 */}
          <SettingCard
            title="火山引擎官方价格说明"
            desc="以下为火山引擎官方计费标准参考，帮助了解各项功能的消费情况（以官网最新公示为准）。"
          >
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-[#16161a] text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="text-left font-medium px-3 py-2.5">功能</th>
                    <th className="text-left font-medium px-3 py-2.5">计费单位</th>
                    <th className="text-left font-medium px-3 py-2.5">按量价格</th>
                    <th className="text-left font-medium px-3 py-2.5">资源包</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {PRICING.map((p) => (
                    <tr key={p.feature} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200 font-medium whitespace-nowrap">{p.feature}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{p.unit}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 font-mono">{p.payAsYouGo}</td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{p.resourcePack || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-1 text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
              {PRICING.filter((p) => p.note).map((p) => (
                <div key={p.feature}>
                  • <b className="text-zinc-600 dark:text-zinc-300">{p.feature}</b>：{p.note}
                </div>
              ))}
            </div>
          </SettingCard>

          {/* 计费安全提醒 */}
          <div className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <div className="font-bold mb-1 flex items-center gap-1.5">
              <span>⚠️ 计费安全重要提醒</span>
            </div>
            声音复刻为后付费音色，<b className="underline">首次调用合成接口即视为「转正」并扣收音色槽位费</b>。请在复刻完成、试听效果完全满意后再正式批量合成。
          </div>
        </div>
      )}

      {/* 统一大模型中心弹窗 */}
      <ModelHubModal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        settings={modelHubSettings}
        onSave={(s) => setModelHubSettings(s)}
      />
    </div>
  );
}
