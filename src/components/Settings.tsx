import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { FORMATS, SAMPLE_RATES, RESOURCE_IDS, LANGUAGES } from '../lib/format';

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="py-6 border-b border-zinc-100 last:border-b-0">
      <div className="section-title">{title}</div>
      {desc && <div className="section-desc mb-4">{desc}</div>}
      {children}
    </div>
  );
}

export default function Settings() {
  const { settings, hasKey, setApiKey, clearApiKey, patchSettings, showToast } = useStore();
  const [keyInput, setKeyInput] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status: number;
    keyValid: boolean | null;
    resourceGranted: boolean | null;
    message: string;
  } | null>(null);

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

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">设置</h2>
        <p className="page-desc">填入火山引擎 API Key，即可使用全部功能</p>
      </div>

      <Section title="API Key" desc="从火山引擎控制台「API Key 管理」获取；本机加密存储，不会出现在前端代码中。">
        <div className="flex gap-2">
          <input
            type={show ? 'text' : 'password'}
            className="glass-input flex-1 font-mono"
            placeholder={hasKey ? '已配置（留空表示不修改）' : '粘贴你的 X-Api-Key'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button className="btn-ghost" onClick={() => setShow((s) => !s)}>
            {show ? '隐藏' : '显示'}
          </button>
          <button className="btn-primary" onClick={saveKey} disabled={busy}>
            保存
          </button>
          {hasKey && (
            <button
              className="btn-danger"
              onClick={async () => {
                await clearApiKey();
                setTestResult(null);
              }}
            >
              清除
            </button>
          )}
          <button className="btn-ghost" onClick={testKey} disabled={testing || !hasKey} title={hasKey ? '调用只读接口自检 Key 与资源授权' : '请先保存 API Key'}>
            {testing ? '测试中…' : '测试连接'}
          </button>
        </div>
        {testResult && (
          <div
            className={`mt-3 p-3.5 rounded-lg text-[13px] leading-relaxed border ${
              testResult.ok
                ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800'
                : 'border-amber-200 bg-amber-50/60 text-amber-800'
            }`}
          >
            <div className="font-semibold mb-1">
              {testResult.ok ? '诊断通过' : `诊断未通过（HTTP ${testResult.status || '—'}）`}
            </div>
            <div className="text-[12.5px] opacity-95 whitespace-pre-line">{testResult.message}</div>
            {!testResult.ok && (
              <div className="mt-2 text-[11px] opacity-70">
                Key 有效：{testResult.keyValid === null ? '未知' : testResult.keyValid ? '是' : '否'} ｜ 声音复刻资源已授权：
                {testResult.resourceGranted === null ? '未知' : testResult.resourceGranted ? '是' : '否'}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="合成默认参数" desc="复刻语种、资源 ID，以及每次合成时的默认格式与采样率。">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">合成资源 ID（Resource-Id）</label>
            <select
              className="glass-input w-full"
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
              className="glass-input w-full"
              value={settings.officialResourceId || 'seed-tts-2.0'}
              onChange={(e) => patchSettings({ officialResourceId: e.target.value })}
            >
              {RESOURCE_IDS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="text-[11px] opacity-60 mt-1">官方音色（非克隆）试听/合成所用资源，默认 2.0。若账号只开通了 1.0 请切回。</p>
          </div>
          <div>
            <label className="label">复刻语种</label>
            <select
              className="glass-input w-full"
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
              className="glass-input w-full"
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
              className="glass-input w-full"
              value={settings.defaultSampleRate}
              onChange={(e) => patchSettings({ defaultSampleRate: Number(e.target.value) })}
            >
              {SAMPLE_RATES.map((s) => (
                <option key={s} value={s}>{s} Hz</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">默认语速 <span className="text-zinc-900 font-medium">{settings.speed.toFixed(1)}x</span></label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={settings.speed}
              className="w-full"
              onChange={(e) => patchSettings({ speed: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">默认音量 <span className="text-zinc-900 font-medium">{settings.volume.toFixed(1)}x</span></label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={settings.volume}
              className="w-full"
              onChange={(e) => patchSettings({ volume: Number(e.target.value) })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
          <input type="checkbox" checked={settings.denoise} onChange={(e) => patchSettings({ denoise: e.target.checked })} className="w-4 h-4" />
          <span className="text-[13px] text-zinc-700">复刻时启用音频降噪</span>
        </label>
      </Section>

      <Section title="音频存储位置" desc="合成与试听文件的保存目录，修改后已有文件会自动迁移到新目录。">
        <div className="flex items-center gap-2">
          <div className="glass-input flex-1 text-zinc-600 break-all !h-auto !py-2 text-xs">
            {settings.outputDir || '使用默认目录'}
          </div>
          <button
            className="btn-primary whitespace-nowrap"
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
          <button className="btn-ghost whitespace-nowrap" onClick={() => api.openOutputDir()}>
            打开目录
          </button>
        </div>
      </Section>

      <Section title="计费提醒">
        <div className="text-[12.5px] text-zinc-600 leading-relaxed">
          声音复刻为后付费音色，<b className="text-zinc-900">首次调用合成接口即视为「转正」并收取音色槽位费</b>。请在复刻完成、试听满意后再正式合成。
        </div>
      </Section>
    </div>
  );
}
