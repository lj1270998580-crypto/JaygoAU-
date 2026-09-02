import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { FORMATS, SAMPLE_RATES, RESOURCE_IDS, LANGUAGES } from '../lib/format';
import { PRICING } from '../lib/pricing';

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

      <Section title="视音频转录存储（已托管）" desc="转录时的音视频临时托管由 Jaygo 服务端托管，App 内已内置安全的临时上传凭证，你无需任何配置。音频仅在任务期间存在，结束后自动删除。">
        <div className="flex items-center gap-2 text-[12.5px] text-emerald-700 bg-emerald-50/60 border border-emerald-200 rounded-lg px-3.5 py-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>已默认接入 · 包内不含 OSS 密匙 · 单次 / 短时预签名 URL 上传</span>
        </div>
      </Section>

      <Section title="火山 AK/SK（账户余额查询用）" desc="用于左下角实时查询账户余额，独立于 X-Api-Key（需在火山控制台「访问控制」创建、并拥有账单查询权限）。">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">AccessKeyId</label>
            <input className="glass-input w-full font-mono" value={settings.volcAccessKeyId || ''} onChange={(e) => patchSettings({ volcAccessKeyId: e.target.value })} />
          </div>
          <div>
            <label className="label">SecretKey</label>
            <input type={showSecrets ? 'text' : 'password'} className="glass-input w-full font-mono" value={settings.volcSecretKey || ''} onChange={(e) => patchSettings({ volcSecretKey: e.target.value })} />
          </div>
        </div>
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

      <Section title="视音频转录" desc="录音文件识别 2.0：上传音视频 → 转写成带标点、有排版的文本。">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">识别模型（Resource-Id）</label>
            <select className="glass-input w-full" value={settings.asrResourceId || 'volc.seedasr.auc'} onChange={(e) => patchSettings({ asrResourceId: e.target.value })}>
              <option value="volc.seedasr.auc">豆包录音文件识别 2.0</option>
              <option value="volc.bigasr.auc">豆包录音文件识别 1.0</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.enableSpeakerInfo ?? false}
            onChange={(e) => patchSettings({ enableSpeakerInfo: e.target.checked })}
            className="w-4 h-4"
          />
          <span className="text-[13px] text-zinc-700">默认开启说话人分离（多人对话按说话人分段，仅中文/普通话生效）</span>
        </label>
        <p className="text-[11px] text-zinc-400 mt-2 leading-relaxed">计费：录音文件识别 2.0 按量 0.8 元/小时。需先配置 API Key（转录的云端临时存储已由服务端托管，你无需任何配置）。</p>
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

      <Section title="官方价格说明" desc="以下为火山引擎官方计费标准，帮助你了解各功能的消费情况（以官网最新公示为准）。">
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">功能</th>
                <th className="text-left font-medium px-3 py-2">计费单位</th>
                <th className="text-left font-medium px-3 py-2">按量价格</th>
                <th className="text-left font-medium px-3 py-2">资源包</th>
              </tr>
            </thead>
            <tbody>
              {PRICING.map((p) => (
                <tr key={p.feature} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-800 font-medium align-top whitespace-nowrap">{p.feature}</td>
                  <td className="px-3 py-2 text-zinc-600 align-top">{p.unit}</td>
                  <td className="px-3 py-2 text-zinc-600 align-top">{p.payAsYouGo}</td>
                  <td className="px-3 py-2 text-zinc-600 align-top">{p.resourcePack || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1 text-[11.5px] text-zinc-400 leading-relaxed">
          {PRICING.filter((p) => p.note).map((p) => (
            <div key={p.feature}>
              · <b className="text-zinc-600">{p.feature}</b>：{p.note}
            </div>
          ))}
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
