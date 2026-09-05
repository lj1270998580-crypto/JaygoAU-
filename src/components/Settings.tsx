import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { FORMATS, SAMPLE_RATES, RESOURCE_IDS, LANGUAGES } from '../lib/format';
import { PRICING } from '../lib/pricing';

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="py-6 border-b border-zinc-100 dark:border-zinc-800/80 last:border-b-0">
      <div className="section-title text-zinc-900 dark:text-white">{title}</div>
      {desc && <div className="section-desc mb-4 text-zinc-500 dark:text-zinc-400">{desc}</div>}
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

  const [cjTesting, setCjTesting] = useState(false);
  const [cjTestResult, setCjTestResult] = useState<{
    ok: boolean;
    message: string;
    accessToken?: string;
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

      <Section
        title="蝉镜开放平台（数字人视频生成）"
        desc="用于在「蝉镜数字人」工坊中生成数字人口播视频。请在蝉镜 AI 开放平台创建应用获取凭证。"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">App ID</label>
            <input
              type="text"
              className="glass-input w-full font-mono"
              placeholder="如：app_xxxxxxxxxxxx"
              value={settings.chanjingAppId || ''}
              onChange={(e) => {
                patchSettings({ chanjingAppId: e.target.value });
                setCjTestResult(null);
              }}
            />
          </div>
          <div>
            <label className="label">Secret Key</label>
            <input
              type={showSecrets ? 'text' : 'password'}
              className="glass-input w-full font-mono"
              placeholder="如：sk_xxxxxxxxxxxxxxxx"
              value={settings.chanjingSecretKey || ''}
              onChange={(e) => {
                patchSettings({ chanjingSecretKey: e.target.value });
                setCjTestResult(null);
              }}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
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
            className="btn-ghost"
            onClick={testChanJing}
            disabled={cjTesting || !settings.chanjingAppId || !settings.chanjingSecretKey}
          >
            {cjTesting ? '验证凭证中…' : '测试连接蝉镜'}
          </button>
        </div>
        {cjTestResult && (
          <div
            className={`mt-3 p-3 rounded-lg text-[12.5px] leading-relaxed border ${
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
            <label className="label">默认语速 <span className="text-zinc-900 dark:text-zinc-100 font-medium">{settings.speed.toFixed(1)}x</span></label>
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
            <label className="label">默认音量 <span className="text-zinc-900 dark:text-zinc-100 font-medium">{settings.volume.toFixed(1)}x</span></label>
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
          <span className="text-[13px] text-zinc-700 dark:text-zinc-200">复刻时启用音频降噪</span>
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
          <span className="text-[13px] text-zinc-700 dark:text-zinc-200">默认开启说话人分离（多人对话按说话人分段，仅中文/普通话生效）</span>
        </label>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2 leading-relaxed">计费：录音文件识别 2.0 按量 0.8 元/小时。需先配置 API Key（转录的云端临时存储已由服务端托管，你无需任何配置）。</p>
      </Section>

      <Section title="音频存储位置" desc="合成与试听文件的保存目录，修改后已有文件会自动迁移到新目录。">
        <div className="flex items-center gap-2">
          <div className="glass-input flex-1 text-zinc-700 dark:text-zinc-300 break-all !h-auto !py-2 text-xs">
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

      <Section title="桌面快捷方式与图标" desc="若更新软件后桌面快捷方式仍显示为旧图标，通常是因为 Windows 系统的图标缓存机制，可在此一键自愈刷新。">
        <div className="glass-soft p-4 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <span>当前应用图标状态</span>
                <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  极简微弧矩形已生效
                </span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                点击通知 Windows 资源管理器重新载入图标；若仍未生效可使用“深度自愈”重启资源管理器。
              </div>
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
        </div>
      </Section>

      <Section title="系统托盘与任务通知" desc="配置窗口关闭行为与长任务完成提示，防止误关导致后台渲染或转录任务中断。">
        <div className="glass-soft p-4 rounded-xl space-y-3.5">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.closeToTray !== false}
              onChange={(e) => patchSettings({ closeToTray: e.target.checked })}
              className="w-4 h-4 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                点击关闭按钮时最小化到系统托盘
              </div>
              <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-normal">
                推荐开启。点击右上角 ✕ 按钮时仅隐藏窗口至右下角系统托盘，后台任务（数字人视频渲染、音频转录）继续运行。彻底退出请在右下角托盘图标右键选择「退出 Jaygo AU」。
              </div>
            </div>
          </label>

          <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-3">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.notifyOnTaskComplete !== false}
                onChange={(e) => patchSettings({ notifyOnTaskComplete: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                  长任务完成后发送 Windows 桌面弹窗通知
                </div>
                <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-normal">
                  蝉镜数字人视频渲染完成或音视频转录完成时，屏幕右下角弹出系统原生通知。点击通知可直接唤起并跳转到对应任务页面。
                </div>
              </div>
            </label>
          </div>
        </div>
      </Section>

      <Section title="官方价格说明" desc="以下为火山引擎官方计费标准，帮助你了解各功能的消费情况（以官网最新公示为准）。">
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-[12.5px]">
            <thead className="bg-zinc-50 dark:bg-[#16161a] text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="text-left font-medium px-3 py-2">功能</th>
                <th className="text-left font-medium px-3 py-2">计费单位</th>
                <th className="text-left font-medium px-3 py-2">按量价格</th>
                <th className="text-left font-medium px-3 py-2">资源包</th>
              </tr>
            </thead>
            <tbody>
              {PRICING.map((p) => (
                <tr key={p.feature} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2 text-zinc-800 dark:text-zinc-200 font-medium align-top whitespace-nowrap">{p.feature}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 align-top">{p.unit}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 align-top">{p.payAsYouGo}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 align-top">{p.resourcePack || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-1 text-[11.5px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
          {PRICING.filter((p) => p.note).map((p) => (
            <div key={p.feature}>
              · <b className="text-zinc-600 dark:text-zinc-300">{p.feature}</b>：{p.note}
            </div>
          ))}
        </div>
      </Section>

      <Section title="计费提醒">
        <div className="text-[12.5px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
          声音复刻为后付费音色，<b className="text-zinc-900 dark:text-zinc-100">首次调用合成接口即视为「转正」并收取音色槽位费</b>。请在复刻完成、试听满意后再正式合成。
        </div>
      </Section>
    </div>
  );
}
