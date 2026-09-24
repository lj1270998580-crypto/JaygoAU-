import React, { useState, useEffect, useMemo } from 'react';
import type { ModelHubSettings, ModelProviderType, ProviderCategory, ConfiguredProvider, ProviderPreset } from '../lib/modelHubTypes';
import { PRESET_PROVIDERS, DEFAULT_MODEL_HUB_SETTINGS } from '../lib/modelHubTypes';
import { testConnection, fetchProviderModels } from '../lib/modelHubService';
import { useStore, sanitizeModelHubSettings } from '../store';
import { ErrorBoundary } from './ErrorBoundary';
import {
  Search,
  RefreshCw,
  Check,
  Copy,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  Zap,
  Globe,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Clipboard,
  RotateCcw,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: ModelHubSettings;
  onSave: (settings: ModelHubSettings) => void;
}

const CATEGORY_LABELS: Record<ProviderCategory, { label: string; icon: string }> = {
  domestic: { label: '国内主流大模型', icon: '🇨🇳' },
  global: { label: '国际前沿大模型', icon: '🌐' },
  custom: { label: '自定义 / 聚合接口', icon: '⚙️' },
};

const CATEGORIZED_PROVIDERS: { category: ProviderCategory; types: ModelProviderType[] }[] = [
  {
    category: 'domestic',
    types: ['doubao', 'deepseek', 'sensenova', 'qwen', 'zhipu', 'moonshot', 'minimax', 'mimo'],
  },
  {
    category: 'global',
    types: ['openai', 'claude'],
  },
  {
    category: 'custom',
    types: ['custom'],
  },
];

const PROVIDER_NAMES: Record<ModelProviderType, string> = {
  doubao: '豆包 (火山方舟)',
  sensenova: '商汤日日新 (SenseNova)',
  deepseek: 'DeepSeek (深度求索)',
  qwen: '通义千问 (DashScope)',
  zhipu: '智谱 AI (GLM)',
  moonshot: 'Kimi (月之暗面)',
  minimax: 'MiniMax (海螺 AI)',
  mimo: '小米 MiMo (大模型)',
  openai: 'OpenAI (官方国际版)',
  claude: 'Claude (Anthropic)',
  custom: '自定义兼容接口',
};

export function ModelHubModal({ open, onClose, settings, onSave }: Props) {
  const safeInitialSettings = useMemo(() => sanitizeModelHubSettings(settings), [settings]);
  const [formData, setFormData] = useState<ModelHubSettings>(safeInitialSettings);

  const [activeTab, setActiveTab] = useState<ModelProviderType>(() => {
    return (safeInitialSettings?.defaultProvider && PRESET_PROVIDERS[safeInitialSettings.defaultProvider])
      ? safeInitialSettings.defaultProvider
      : 'doubao';
  });

  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; pingMs: number; error?: string } | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [copiedModel, setCopiedModel] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(sanitizeModelHubSettings(settings));
    }
  }, [settings, open]);

  useEffect(() => {
    setTestResult(null);
    setModelSearchQuery('');
    setShowKey(false);
    setCopiedModel(false);
  }, [activeTab]);

  const currentProvider: ConfiguredProvider = useMemo(() => {
    const prov = formData.providers?.[activeTab];
    if (prov && typeof prov === 'object') return prov;
    return DEFAULT_MODEL_HUB_SETTINGS.providers[activeTab] || {
      type: activeTab,
      enabled: true,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS[activeTab]?.defaultBaseUrl || '',
      selectedModel: '',
      availableModels: [],
    };
  }, [formData.providers, activeTab]);

  const preset: ProviderPreset = useMemo(() => {
    return PRESET_PROVIDERS[activeTab] || {
      type: activeTab,
      name: activeTab,
      icon: '⚡',
      category: 'custom',
      defaultBaseUrl: '',
      keyPlaceholder: '请输入 API Key',
      docUrl: '',
      models: [],
    };
  }, [activeTab]);

  const updateFormData = (updater: (prev: ModelHubSettings) => ModelHubSettings) => {
    setFormData((prev) => {
      const sanitizedPrev = sanitizeModelHubSettings(prev);
      const next = sanitizeModelHubSettings(updater(sanitizedPrev));
      onSave(next);
      return next;
    });
  };

  // 自动从服务商获取最新模型列表（当用户已配置 API Key 但本地尚未获取过模型时）
  useEffect(() => {
    if (!open) return;
    const prov = formData.providers?.[activeTab];
    if (
      prov?.apiKey?.trim() &&
      activeTab !== 'custom' &&
      (!prov.availableModels || prov.availableModels.length === 0) &&
      !fetchingModels
    ) {
      handleFetchModels(activeTab, false);
    }
  }, [activeTab, open]);

  if (!open) return null;

  const handleKeyChange = (val: string) => {
    updateFormData((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [activeTab]: {
          ...prev.providers[activeTab],
          apiKey: val,
        },
      },
    }));
  };

  const handleBaseUrlChange = (val: string) => {
    updateFormData((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [activeTab]: {
          ...prev.providers[activeTab],
          baseUrl: val,
        },
      },
    }));
  };

  const handleResetBaseUrl = () => {
    handleBaseUrlChange(preset.defaultBaseUrl);
    useStore.getState().showToast('已重置为官方默认接口地址', 'ok');
  };

  const handlePasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleKeyChange(text.trim());
        useStore.getState().showToast('已从剪贴板粘贴 API Key', 'ok');
      }
    } catch {
      useStore.getState().showToast('无法读取剪贴板，请手动粘贴', 'err');
    }
  };

  const handleModelSelect = (val: string) => {
    updateFormData((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [activeTab]: {
          ...prev.providers[activeTab],
          selectedModel: val,
        },
      },
    }));
  };

  const handleCustomModelNameChange = (val: string) => {
    updateFormData((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [activeTab]: {
          ...prev.providers[activeTab],
          customModelName: val,
        },
      },
    }));
  };

  const handleCustomProviderNameChange = (val: string) => {
    updateFormData((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [activeTab]: {
          ...prev.providers[activeTab],
          customProviderName: val,
        },
      },
    }));
  };

  const handleSetDefault = (type: ModelProviderType) => {
    updateFormData((prev) => ({
      ...prev,
      defaultProvider: type,
    }));
    useStore.getState().showToast(`已将 ${PROVIDER_NAMES[type]} 设为全局默认大模型`, 'ok');
  };

  /**
   * 核心：直接向服务商获取当前真实可用的最新模型列表
   */
  const handleFetchModels = async (targetType = activeTab, notifyOnSuccess = true) => {
    const prov = formData.providers?.[targetType] || DEFAULT_MODEL_HUB_SETTINGS.providers[targetType];
    if (!prov?.apiKey?.trim()) {
      useStore.getState().showToast('请先输入该供应商的 API Key，再获取模型', 'err');
      return;
    }

    setFetchingModels(true);
    try {
      const res = await fetchProviderModels(prov);
      if (res.ok && Array.isArray(res.models) && res.models.length > 0) {
        updateFormData((prev) => {
          const prevProv = prev.providers?.[targetType] || DEFAULT_MODEL_HUB_SETTINGS.providers[targetType];
          let nextSelected = prevProv?.selectedModel;
          // 若当前未选中模型，或者当前选中的模型不在返回的列表中，则自动首选第一个推荐模型
          if (!nextSelected || !res.models.includes(nextSelected)) {
            nextSelected = res.models[0];
          }
          return {
            ...prev,
            providers: {
              ...prev.providers,
              [targetType]: {
                ...prevProv,
                availableModels: res.models,
                modelsFetchedAt: Date.now(),
                selectedModel: nextSelected,
              },
            },
          };
        });
        if (notifyOnSuccess) {
          useStore.getState().showToast(`成功获取到 ${res.models.length} 个最新可用模型！`, 'ok');
        }
      } else {
        useStore.getState().showToast(`获取模型失败：${res.error || '该服务商未开放 /models 接口'}`, 'err');
      }
    } catch (e: any) {
      useStore.getState().showToast(`获取模型异常：${e?.message || e}`, 'err');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestPing = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(currentProvider);
      setTestResult(res);
      if (res.ok) {
        updateFormData((prev) => ({
          ...prev,
          providers: {
            ...prev.providers,
            [activeTab]: {
              ...(prev.providers?.[activeTab] || DEFAULT_MODEL_HUB_SETTINGS.providers[activeTab]),
              lastPingMs: res.pingMs,
              lastTestOk: true,
            },
          },
        }));
        // 若当前未拉取过模型列表，连通性测试通过后顺带发起一次拉取
        if ((!currentProvider.availableModels || currentProvider.availableModels.length === 0) && activeTab !== 'custom') {
          handleFetchModels(activeTab, false);
        }
      } else {
        updateFormData((prev) => ({
          ...prev,
          providers: {
            ...prev.providers,
            [activeTab]: {
              ...(prev.providers?.[activeTab] || DEFAULT_MODEL_HUB_SETTINGS.providers[activeTab]),
              lastTestOk: false,
            },
          },
        }));
      }
    } catch (e: any) {
      setTestResult({ ok: false, pingMs: 0, error: e?.message || '测试异常' });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyModelId = (id: string) => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopiedModel(true);
    setTimeout(() => setCopiedModel(false), 2000);
    useStore.getState().showToast(`已复制模型 ID: ${id}`, 'ok');
  };

  const handleSaveAndClose = () => {
    onSave(formData);
    useStore.getState().showToast('大模型配置已成功保存并固化至本地！', 'ok');
    onClose();
  };

  // 动态过滤展示的模型列表（保证安全只渲染纯字符串）
  const displayedModels = useMemo(() => {
    const list = Array.isArray(currentProvider?.availableModels) ? currentProvider.availableModels : [];
    const stringList: string[] = list
      .map((m: any) => (typeof m === 'string' ? m : (m?.id || m?.name || '')))
      .filter((m: string) => Boolean(m && typeof m === 'string' && m.trim()));
    if (!modelSearchQuery.trim()) return stringList;
    const q = modelSearchQuery.trim().toLowerCase();
    return stringList.filter((m: string) => m.toLowerCase().includes(q));
  }, [currentProvider?.availableModels, modelSearchQuery]);

  const effectiveModel =
    currentProvider.type === 'custom' && currentProvider.customModelName
      ? currentProvider.customModelName
      : (currentProvider.customModelName || currentProvider.selectedModel || (Array.isArray(currentProvider.availableModels) && currentProvider.availableModels[0]) || '');

  return (
    <ErrorBoundary fallbackTitle="统一大模型中心加载异常" onReset={() => setFormData(DEFAULT_MODEL_HUB_SETTINGS)}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* 顶部 Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-lg shadow-md shadow-blue-500/20 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                  统一大模型中心 (Model Hub)
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  动态模型实时拉取
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                直接从各服务商 API 同步最新模型，告别硬编码滞后；一站式测试连通性与模型路由调度
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onSave(formData);
              onClose();
            }}
            className="w-8 h-8 rounded-xl hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center justify-center transition cursor-pointer text-sm"
            title="保存并关闭"
          >
            ✕
          </button>
        </div>

        {/* 主体两栏结构 */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧供应商分类导航 */}
          <div className="w-64 border-r border-zinc-100 dark:border-zinc-800/80 p-3 space-y-3 bg-zinc-50/40 dark:bg-zinc-900/20 overflow-y-auto shrink-0 select-none">
            {CATEGORIZED_PROVIDERS.map((group) => {
              const catInfo = CATEGORY_LABELS[group.category];
              return (
                <div key={group.category} className="space-y-1">
                  <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 px-2.5 py-1 uppercase tracking-wider flex items-center gap-1.5">
                    <span>{catInfo.icon}</span>
                    <span>{catInfo.label}</span>
                  </div>

                  {group.types.map((type) => {
                    const p = PRESET_PROVIDERS[type] || { name: type, icon: '⚡' };
                    const cfg = formData.providers?.[type] || DEFAULT_MODEL_HUB_SETTINGS.providers[type];
                    const isDefault = formData.defaultProvider === type;
                    const hasKey = Boolean(cfg?.apiKey && String(cfg.apiKey).trim());
                    const modelCount = Array.isArray(cfg?.availableModels) ? cfg.availableModels.length : 0;
                    const isCurrent = activeTab === type;

                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setActiveTab(type)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-medium transition text-left ${
                          isCurrent
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 font-semibold'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span className="text-base shrink-0">{p.icon}</span>
                          <span className="truncate">
                            {type === 'custom' && cfg?.customProviderName?.trim()
                              ? cfg.customProviderName.trim()
                              : (PROVIDER_NAMES[type] || p.name || type)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 pl-1">
                          {isDefault && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded-md font-bold border ${
                                isCurrent
                                  ? 'bg-white/20 text-white border-white/40'
                                  : 'bg-amber-400/10 text-amber-600 dark:text-amber-400 border-amber-400/30'
                              }`}
                            >
                              默认
                            </span>
                          )}
                          {modelCount > 0 && (
                            <span
                              className={`text-[9px] font-mono px-1 rounded ${
                                isCurrent ? 'text-blue-100' : 'text-zinc-400'
                              }`}
                              title={`已获取 ${modelCount} 个可用模型`}
                            >
                              {modelCount}
                            </span>
                          )}
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              hasKey
                                ? isCurrent
                                  ? 'bg-emerald-300 ring-2 ring-white/30'
                                  : 'bg-emerald-500'
                                : 'bg-zinc-300 dark:bg-zinc-600'
                            }`}
                            title={hasKey ? '已配置 API Key' : '未配置 API Key'}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* 右侧详细配置卡片 */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* 顶部供应商概要栏 */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-1 bg-white dark:bg-zinc-800 rounded-xl shadow-xs border border-zinc-100 dark:border-zinc-700/60">
                  {preset.icon}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {preset.name}
                    </h4>
                    {currentProvider.lastPingMs && currentProvider.lastTestOk && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono">
                        ⚡ {currentProvider.lastPingMs}ms
                      </span>
                    )}
                  </div>
                  {preset.docUrl && (
                    <a
                      href={preset.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 mt-0.5"
                    >
                      <span>前往官方控制台获取 API Key</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSetDefault(activeTab)}
                disabled={formData.defaultProvider === activeTab}
                className={`text-xs px-3.5 py-1.5 rounded-xl border font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  formData.defaultProvider === activeTab
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 cursor-default'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {formData.defaultProvider === activeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>当前全局默认模型</span>
                  </>
                ) : (
                  <span>设为全局默认模型</span>
                )}
              </button>
            </div>

            {/* 自定义别名 */}
            {activeTab === 'custom' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>自定义供应商显示名称</span>
                  <span className="text-[11px] text-zinc-400">各工作台模型切换菜单将显示此别名</span>
                </label>
                <input
                  type="text"
                  value={currentProvider.customProviderName || ''}
                  onChange={(e) => handleCustomProviderNameChange(e.target.value)}
                  placeholder="例如: 硅基流动 (SiliconFlow)、本地 Ollama、OpenRouter、OneAPI"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                />
              </div>
            )}

            {/* 区域 1：API 凭据与基础地址 */}
            <div className="p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5">
                <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-blue-500" />
                  <span>服务商鉴权与接口地址</span>
                </div>
                {currentProvider.apiKey && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>已填写密钥</span>
                  </span>
                )}
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>API Key 密钥</span>
                  <span className="text-[11px] text-zinc-400">本地加密存储，仅在请求时调用</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={currentProvider.apiKey}
                    onChange={(e) => handleKeyChange(e.target.value)}
                    placeholder={preset.keyPlaceholder}
                    className="w-full pl-3.5 pr-20 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono transition"
                  />
                  <div className="absolute right-2 flex items-center gap-1 text-zinc-400">
                    <button
                      type="button"
                      onClick={() => setShowKey((s) => !s)}
                      className="p-1 hover:text-zinc-600 dark:hover:text-zinc-200 rounded cursor-pointer"
                      title={showKey ? '隐藏密钥' : '显示明文'}
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={handlePasteKey}
                      className="p-1 hover:text-zinc-600 dark:hover:text-zinc-200 rounded cursor-pointer"
                      title="从剪贴板粘贴"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Base URL */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-zinc-400" />
                    <span>API 接口地址 (Base URL)</span>
                  </label>
                  {currentProvider.baseUrl !== preset.defaultBaseUrl && (
                    <button
                      type="button"
                      onClick={handleResetBaseUrl}
                      className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>恢复官方默认</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={currentProvider.baseUrl}
                  onChange={(e) => handleBaseUrlChange(e.target.value)}
                  placeholder={preset.defaultBaseUrl}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono transition"
                />
              </div>

              {/* 连通性测试与快速动作 */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestPing}
                  disabled={testing || !currentProvider.apiKey}
                  className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {testing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在测试连通性...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>测试接口连通性</span>
                    </>
                  )}
                </button>

                {testResult && (
                  <div
                    className={`text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${
                      testResult.ok
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {testResult.ok ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>连接通畅</span>
                        <span className="font-mono font-bold">({testResult.pingMs}ms)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        <span className="truncate max-w-sm">{testResult.error || '连通失败'}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 区域 2：动态模型获取与选择（核心改造区） */}
            <div className="p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span>模型选择 (实时从服务商获取)</span>
                  </div>
                  {currentProvider.availableModels && currentProvider.availableModels.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 font-mono">
                      {currentProvider.availableModels.length} 个可用模型
                    </span>
                  )}
                </div>

                {activeTab !== 'custom' && (
                  <button
                    type="button"
                    onClick={() => handleFetchModels(activeTab, true)}
                    disabled={fetchingModels || !currentProvider.apiKey}
                    className="px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                    title="向服务商 API 发起请求，拉取最新可用的全部模型列表"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? 'animate-spin' : ''}`} />
                    <span>{fetchingModels ? '正在同步最新模型...' : '从服务商获取最新模型'}</span>
                  </button>
                )}
              </div>

              {/* 模型列表选择区 */}
              {activeTab === 'custom' ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    输入模型 ID (自定义兼容模式)
                  </label>
                  <input
                    type="text"
                    value={currentProvider.customModelName || ''}
                    onChange={(e) => handleCustomModelNameChange(e.target.value)}
                    placeholder="输入具体的 Model ID，如 gpt-4o、deepseek-chat、qwen-plus、claude-3-5-sonnet 等"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    自定义接口将直接使用该 Model ID 作为请求参数发送至您的 Base URL。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 若已获取到在线模型列表 */}
                  {currentProvider.availableModels && currentProvider.availableModels.length > 0 ? (
                    <div className="space-y-2.5">
                      {/* 快速搜索栏 */}
                      {currentProvider.availableModels.length > 6 && (
                        <div className="relative flex items-center">
                          <Search className="w-3.5 h-3.5 absolute left-3 text-zinc-400" />
                          <input
                            type="text"
                            value={modelSearchQuery}
                            onChange={(e) => setModelSearchQuery(e.target.value)}
                            placeholder="🔍 输入关键字快速搜索过滤，例如: pro、flash、reasoner、plus、v3..."
                            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/60 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                          />
                          {modelSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setModelSearchQuery('')}
                              className="absolute right-2.5 text-zinc-400 hover:text-zinc-600 text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}

                      {/* 下拉选择器 */}
                      <div className="flex gap-2 items-center">
                        <select
                          value={currentProvider.selectedModel || ''}
                          onChange={(e) => handleModelSelect(e.target.value)}
                          className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono cursor-pointer"
                        >
                          <option value="" disabled>
                            {displayedModels.length === 0 ? '未匹配到包含该关键词的模型' : '请选择目标模型'}
                          </option>
                          {displayedModels.map((id: string) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>

                        {currentProvider.selectedModel && (
                          <button
                            type="button"
                            onClick={() => handleCopyModelId(currentProvider.selectedModel)}
                            className="px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs transition flex items-center gap-1 cursor-pointer shrink-0"
                            title="复制当前模型 ID"
                          >
                            {copiedModel ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedModel ? '已复制' : '复制ID'}</span>
                          </button>
                        )}
                      </div>

                      {/* 当前选中模型胶囊提示 */}
                      {effectiveModel && (
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">当前激活模型:</span>
                          <code className="font-mono text-blue-600 dark:text-blue-400 font-bold">{effectiveModel}</code>
                          {currentProvider.modelsFetchedAt && (
                            <span className="ml-auto text-[10px] text-zinc-400">
                              同步于 {new Date(currentProvider.modelsFetchedAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 尚未从服务商拉取到模型时的引导状态 */
                    <div className="p-4 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-2">
                      <div className="text-zinc-400 dark:text-zinc-500 text-xs">
                        {currentProvider.apiKey?.trim()
                          ? '已配置 API Key，点击上方「从服务商获取最新模型」即可自动载入实时模型阵容'
                          : '请先在上方填入 API Key 密钥，系统将自动从服务商获取最新可用模型'}
                      </div>
                      {currentProvider.apiKey?.trim() && (
                        <button
                          type="button"
                          onClick={() => handleFetchModels(activeTab, true)}
                          disabled={fetchingModels}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${fetchingModels ? 'animate-spin' : ''}`} />
                          <span>立即同步最新模型</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 针对火山方舟接入点 ID (ep-xxx) 或特殊模型的手动覆盖 */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                    <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 block mb-1">
                      手动覆盖模型 / 火山方舟接入点 ID (可选，若填写将优先采用)：
                    </label>
                    <input
                      type="text"
                      value={currentProvider.customModelName || ''}
                      onChange={(e) => handleCustomModelNameChange(e.target.value)}
                      placeholder={
                        activeTab === 'doubao'
                          ? '例如火山方舟接入点 ID: ep-20250101-xxxx（填入后将直接调用该接入点）'
                          : '例如私有微调版本或特殊发布模型 ID'
                      }
                      className="w-full px-3 py-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 font-mono focus:outline-hidden focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮与状态栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <span>当前全局默认引擎：</span>
            <strong className="text-blue-600 dark:text-blue-400 font-semibold">
              {PROVIDER_NAMES[formData.defaultProvider] || PRESET_PROVIDERS[formData.defaultProvider]?.name || formData.defaultProvider}
            </strong>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                onSave(formData);
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              关闭
            </button>
            <button
              onClick={handleSaveAndClose}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>保存所有配置</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
