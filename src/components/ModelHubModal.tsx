import React, { useState, useEffect } from 'react';
import type { ModelHubSettings, ModelProviderType } from '../lib/modelHubTypes';
import { PRESET_PROVIDERS, DEFAULT_MODEL_HUB_SETTINGS } from '../lib/modelHubTypes';
import { testConnection, fetchProviderModels } from '../lib/modelHubService';
import { useStore } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: ModelHubSettings;
  onSave: (settings: ModelHubSettings) => void;
}

const PROVIDER_ORDER: ModelProviderType[] = [
  'doubao',
  'sensenova',
  'deepseek',
  'qwen',
  'zhipu',
  'moonshot',
  'minimax',
  'mimo',
  'openai',
  'claude',
  'custom',
];

const PROVIDER_NAMES: Record<ModelProviderType, string> = {
  doubao: '豆包 (火山引擎)',
  sensenova: '商汤日日新 (SenseNova)',
  deepseek: 'DeepSeek (深度求索)',
  qwen: '通义千问 (阿里云)',
  zhipu: '智谱 AI (GLM)',
  moonshot: 'Kimi (月之暗面)',
  minimax: 'MiniMax (海螺AI)',
  mimo: '小米 MiMo (MiMo 2.5)',
  openai: 'OpenAI (国际版)',
  claude: 'Claude (Anthropic)',
  custom: '自定义兼容接口',
};

export function ModelHubModal({ open, onClose, settings, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<ModelProviderType>('doubao');
  const [formData, setFormData] = useState<ModelHubSettings>(settings || DEFAULT_MODEL_HUB_SETTINGS);
  const [testing, setTesting] = useState(false);
  // v0.7.16：从服务商实时拉取的模型列表（null 表示尚未拉取）
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; pingMs: number; error?: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings, open]);

  useEffect(() => {
    setTestResult(null);
  }, [activeTab]);

  if (!open) return null;

  const currentProvider = formData.providers[activeTab];
  const preset = PRESET_PROVIDERS[activeTab];

  const updateFormData = (updater: (prev: ModelHubSettings) => ModelHubSettings) => {
    setFormData(prev => {
      const next = updater(prev);
      // 实时同步触发全局持久化落盘，确保任何输入和切换均永不丢失
      onSave(next);
      return next;
    });
  };

  const handleKeyChange = (val: string) => {
    updateFormData(prev => ({
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
    updateFormData(prev => ({
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

  const handleModelSelect = (val: string) => {
    updateFormData(prev => ({
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
    updateFormData(prev => ({
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

  const handleSetDefault = (type: ModelProviderType) => {
    updateFormData(prev => ({
      ...prev,
      defaultProvider: type,
    }));
  };

  const handleTestPing = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(currentProvider);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ ok: false, pingMs: 0, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  /**
   * v0.7.16：从服务商实时拉取模型列表。
   * 内置清单必然会过期（实测 MiMo 内置的 mimo-v2.5-flash 根本不存在），
   * 因此提供一键拉取服务商**当前真实**可用的模型 ID。
   */
  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchedModels(null);
    try {
      const res = await fetchProviderModels(currentProvider);
      if (res.ok) {
        setFetchedModels(res.models);
        useStore.getState().showToast(`已拉取到 ${res.models.length} 个可用模型`, 'ok');
      } else {
        useStore.getState().showToast(`拉取失败：${res.error || '未知错误'}`, 'err');
      }
    } catch (e: any) {
      useStore.getState().showToast(`拉取失败：${e?.message || e}`, 'err');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSaveAndClose = () => {
    onSave(formData);
    try {
      useStore.getState().showToast('大模型配置已成功保存并固化至本地硬盘！', 'ok');
    } catch (_) {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* 顶部 Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center text-lg shrink-0">
              ⚡
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base flex items-center gap-2">
                统一大模型设置中心 (Model Hub)
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  全平台统一调度
                </span>
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                配置火山豆包、DeepSeek 等各大厂商 Key，一处配置全局生效，驱动 AI 文案与定时流水线
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              onSave(formData);
              onClose();
            }}
            className="w-8 h-8 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center justify-center transition cursor-pointer"
            title="保存并关闭"
          >
            ✕
          </button>
        </div>

        {/* 主体两栏 */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧供应商列表 */}
          <div className="w-64 border-r border-zinc-100 dark:border-zinc-800/80 p-3 space-y-1 bg-zinc-50/30 dark:bg-zinc-900/20 overflow-y-auto shrink-0">
            <div className="text-[10px] font-medium text-zinc-400 px-3 py-1 uppercase tracking-wider">
              模型供应商
            </div>
            {PROVIDER_ORDER.map(type => {
              const p = PRESET_PROVIDERS[type];
              const cfg = formData.providers[type];
              const isDefault = formData.defaultProvider === type;
              const hasKey = Boolean(cfg.apiKey);

              return (
                <button
                  key={type}
                  onClick={() => setActiveTab(type)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition text-left ${
                    activeTab === type
                      ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="shrink-0">{p.icon}</span>
                    <span className="truncate">{PROVIDER_NAMES[type] || p.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pl-1">
                    {isDefault && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${
                        activeTab === type 
                          ? 'bg-white/20 text-white border-white/40' 
                          : 'bg-amber-400/20 text-amber-500 dark:text-amber-300 border-amber-400/30'
                      }`}>
                        默认
                      </span>
                    )}
                    <span
                      className={`w-2 h-2 rounded-full ${
                        hasKey ? 'bg-emerald-400' : 'bg-zinc-300 dark:bg-zinc-600'
                      }`}
                      title={hasKey ? '已配置 Key' : '未配置 Key'}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* 右侧配置面板 */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{preset.icon}</span>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {preset.name}
                  </h4>
                  {preset.docUrl && (
                    <a
                      href={preset.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1"
                    >
                      官方文档与 API 获取 ↗
                    </a>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSetDefault(activeTab)}
                disabled={formData.defaultProvider === activeTab}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                  formData.defaultProvider === activeTab
                    ? 'border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 cursor-default'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                {formData.defaultProvider === activeTab ? '✓ 当前全局默认模型' : '设为全局默认模型'}
              </button>
            </div>

            {/* API Key 输入框 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                API Key 密钥
              </label>
              <input
                type="password"
                value={currentProvider.apiKey}
                onChange={e => handleKeyChange(e.target.value)}
                placeholder={preset.keyPlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono transition"
              />
            </div>

            {/* Base URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>API 接口地址 (Base URL)</span>
                <span className="text-[11px] text-zinc-400">OpenAI 兼容规范</span>
              </label>
              <input
                type="text"
                value={currentProvider.baseUrl}
                onChange={e => handleBaseUrlChange(e.target.value)}
                placeholder={preset.defaultBaseUrl}
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono transition"
              />
            </div>

            {/* 模型选择 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  驱动模型选择
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400">
                    {fetchedModels ? `已拉取 ${fetchedModels.length} 个在线模型` : '内置清单（可能过期）'}
                  </span>
                  {activeTab !== 'custom' && (
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={fetchingModels}
                      className="text-[11px] px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50 cursor-pointer"
                      title="直接向服务商查询当前真实可用的模型 ID，避免内置清单过期"
                    >
                      {fetchingModels ? '拉取中…' : '拉取最新模型'}
                    </button>
                  )}
                </div>
              </div>

              {activeTab === 'custom' ? (
                <input
                  type="text"
                  value={currentProvider.customModelName || ''}
                  onChange={e => handleCustomModelNameChange(e.target.value)}
                  placeholder="例如: llama3-70b 或 qwen-72b-chat"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono"
                />
              ) : (
                <div className="space-y-2">
                  {/* 已拉取到在线列表时，优先使用服务商返回的真实模型 ID */}
                  {fetchedModels ? (
                    <select
                      value={fetchedModels.includes(currentProvider.selectedModel) ? currentProvider.selectedModel : ''}
                      onChange={e => handleModelSelect(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-white dark:bg-zinc-900/80 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 cursor-pointer font-mono"
                    >
                      <option value="" disabled>
                        {fetchedModels.includes(currentProvider.selectedModel)
                          ? '请选择模型'
                          : `当前选择 ${currentProvider.selectedModel} 不在在线列表中`}
                      </option>
                      {fetchedModels.map(id => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={currentProvider.selectedModel}
                      onChange={e => handleModelSelect(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 cursor-pointer font-sans"
                    >
                      {preset.models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.badge ? `[${m.badge}] ` : ''}{m.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* 选定模型的详细说明（仅内置清单提供描述） */}
                  {!fetchedModels && (() => {
                    const currentModelObj = preset.models.find(m => m.id === currentProvider.selectedModel);
                    return currentModelObj?.description ? (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 px-1">
                        💡 {currentModelObj.description}
                      </p>
                    ) : null;
                  })()}

                  {/* 支持手动输入 Model ID 或火山方舟 Endpoint ID 覆盖 */}
                  <div className="pt-1.5">
                    <label className="text-[11px] text-zinc-400 block mb-1">
                      自定义模型覆盖 / 接入点 ID (可选，若填写将优先使用)：
                    </label>
                    <input
                      type="text"
                      value={currentProvider.customModelName || ''}
                      onChange={e => handleCustomModelNameChange(e.target.value)}
                      placeholder={
                        activeTab === 'doubao'
                          ? '例如火山方舟接入点 ID: ep-20250101-xxxx（填入则优先走此端点）'
                          : '例如最新发布但暂未收录的模型版本 ID'
                      }
                      className="w-full px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 font-mono focus:outline-hidden focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 连通性测试按钮与反馈 */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestPing}
                disabled={testing || !currentProvider.apiKey}
                className="btn-modern-ghost"
              >
                {testing ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    <span>正在测试连通性...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span> <span>测试网络与 API 连通性</span>
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
                    testResult.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
                  }`}
                >
                  <span>{testResult.ok ? '✓ 连接成功' : '✕ 连接失败'}</span>
                  {testResult.ok && <span className="font-mono">({testResult.pingMs}ms)</span>}
                  {testResult.error && <span className="truncate max-w-xs">{testResult.error}</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="text-xs text-zinc-400">
            当前默认模型：<strong className="text-blue-500">{PRESET_PROVIDERS[formData.defaultProvider].name}</strong>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                onSave(formData);
                onClose();
              }}
              className="btn-modern-ghost"
            >
              关闭
            </button>
            <button
              onClick={handleSaveAndClose}
              className="btn-modern-primary"
            >
              <span>💾</span>
              <span>保存所有配置</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
