import React, { useState, useEffect } from 'react';
import type { ModelHubSettings, ModelProviderType } from '../lib/modelHubTypes';
import { PRESET_PROVIDERS, DEFAULT_MODEL_HUB_SETTINGS } from '../lib/modelHubTypes';
import { testConnection } from '../lib/modelHubService';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: ModelHubSettings;
  onSave: (settings: ModelHubSettings) => void;
}

const PROVIDER_ORDER: ModelProviderType[] = [
  'doubao',
  'deepseek',
  'qwen',
  'zhipu',
  'moonshot',
  'openai',
  'custom',
];

export function ModelHubModal({ open, onClose, settings, onSave }: Props) {
  const [activeTab, setActiveTab] = useState<ModelProviderType>('doubao');
  const [formData, setFormData] = useState<ModelHubSettings>(settings || DEFAULT_MODEL_HUB_SETTINGS);
  const [testing, setTesting] = useState(false);
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

  const handleKeyChange = (val: string) => {
    setFormData(prev => ({
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
    setFormData(prev => ({
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
    setFormData(prev => ({
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
    setFormData(prev => ({
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
    setFormData(prev => ({
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

  const handleSaveAndClose = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* 顶部 Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center text-lg">
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
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* 主体两栏 */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧供应商列表 */}
          <div className="w-56 border-r border-zinc-100 dark:border-zinc-800/80 p-3 space-y-1 bg-zinc-50/30 dark:bg-zinc-900/20 overflow-y-auto">
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
                    <span>{p.icon}</span>
                    <span className="truncate">{p.name.split('·')[0]}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isDefault && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-500 dark:text-amber-300 font-semibold border border-amber-400/30">
                        默认
                      </span>
                    )}
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        hasKey ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                驱动模型选择
              </label>
              {activeTab === 'custom' ? (
                <input
                  type="text"
                  value={currentProvider.customModelName || ''}
                  onChange={e => handleCustomModelNameChange(e.target.value)}
                  placeholder="例如: llama3-70b 或 qwen-72b-chat"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono"
                />
              ) : (
                <select
                  value={currentProvider.selectedModel}
                  onChange={e => handleModelSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 cursor-pointer"
                >
                  {preset.models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 连通性测试按钮与反馈 */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestPing}
                disabled={testing || !currentProvider.apiKey}
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {testing ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    正在测试连通性...
                  </>
                ) : (
                  <>
                    <span>⚡</span> 测试网络与 API 连通性
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
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              取消
            </button>
            <button
              onClick={handleSaveAndClose}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs shadow-blue-500/30 transition"
            >
              保存所有配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
