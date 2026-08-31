import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// Agent / headless 验证模式：禁用 GPU 相关进程，避免无显示环境启动崩溃
// 正常用户桌面使用时不设置 JAYGO_HEADLESS 即可保持硬件加速
if (process.env.JAYGO_HEADLESS === '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('no-sandbox');
}

// 注意：本文件编译为 CommonJS（Electron 主进程/预加载脚本不支持 ESM），
// 因此 __dirname 由 CJS 直接提供，不能再使用 import.meta.url。
declare const __dirname: string;

// ---- 启动诊断日志（定位「打不开」问题，确认修复后可移除） ----
const DEBUG_LOG = path.join(process.env.TEMP || 'C:\\Temp', 'jaygo-debug.log');
function dbg(msg: string) {
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}
dbg('=== main.js 已开始执行 ===');
process.on('uncaughtException', (e) => dbg('uncaughtException: ' + (e?.stack || e)));
process.on('unhandledRejection', (e: any) => dbg('unhandledRejection: ' + (e?.stack || e)));

const BASE = 'https://openspeech.bytedance.com';
const CLONE_URL = `${BASE}/api/v3/tts/voice_clone`;
const GET_VOICE_URL = `${BASE}/api/v3/tts/get_voice`;
const SYNTH_URL = `${BASE}/api/v3/tts/unidirectional`;

type VoiceRecord = {
  id: string;          // custom_speaker_id / speaker id
  name: string;        // 用户可读名称
  createdAt: number;
  status: number;      // 0未找到 1训练中 2成功 3失败 4可用
  modelType?: number;
  note?: string;
};

type LibraryItem = {
  id: string;
  text: string;
  path: string;
  voiceName: string;
  voiceId: string;
  format: string;
  size: number;
  createdAt: number;
};

type Settings = {
  outputDir: string;
  resourceId: string;  // 合成资源ID，克隆音色默认 seed-icl-2.0（声音复刻 2.0）
  defaultFormat: 'mp3' | 'wav' | 'ogg_opus' | 'pcm';
  defaultSampleRate: number;
  speed: number;       // 倍速 0.5-2
  volume: number;      // 0.5-2
  language: number;    // 0中文 ...
  denoise: boolean;
  voices: VoiceRecord[];
  library: LibraryItem[];
};

const DEFAULT_SETTINGS: Settings = {
  outputDir: '',
  resourceId: 'seed-icl-2.0',
  defaultFormat: 'mp3',
  defaultSampleRate: 24000,
  speed: 1.0,
  volume: 1.0,
  language: 0,
  denoise: true,
  voices: [],
  library: [],
};

const settingsPath = () => path.join(app.getPath('userData'), 'jaygo-settings.json');

// get_voice 请求体必须按音色 ID 类型区分（官方文档 6561/2535742）：
//  - 后付费音色（custom_ 开头）：{ speaker_id: 'custom_speaker_id', custom_speaker_id: xxx }
//  - 控制台复刻/预付费音色（S_ 开头或其它）：{ speaker_id: xxx }
// 用错格式时服务端不报 4xx，而是直接 500 —— 这就是"测试 API 显示 500"的根因。
function getVoiceBody(id: string): Record<string, string> {
  return id.startsWith('custom_')
    ? { speaker_id: 'custom_speaker_id', custom_speaker_id: id }
    : { speaker_id: id };
}

let settings: Settings = loadSettings();

function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed, voices: parsed.voices ?? [], library: parsed.library ?? [] };
    // 旧版本可能把 outputDir 存为空字符串，这里兜底到默认目录并持久化
    if (!merged.outputDir) {
      merged.outputDir = path.join(app.getPath('userData'), 'audio');
      fs.mkdirSync(merged.outputDir, { recursive: true });
      fs.writeFileSync(settingsPath(), JSON.stringify({ ...parsed, outputDir: merged.outputDir }, null, 2));
    }
    return merged;
  } catch {
    const s = { ...DEFAULT_SETTINGS };
    s.outputDir = path.join(app.getPath('userData'), 'audio');
    return s;
  }
}

function persistSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  const { outputDir, resourceId, defaultFormat, defaultSampleRate, speed, volume, language, denoise, voices, library } = settings;
  // 关键：apiKeyEnc 不属于 Settings 结构但存在同一文件里，
  // 这里必须原样带回，否则任何一次持久化（改设置 / 复刻 / 增删音色）都会把 API Key 抹掉。
  const prevApiKeyEnc = loadSettingsRaw().apiKeyEnc;
  const data: Record<string, unknown> = {
    outputDir,
    resourceId,
    defaultFormat,
    defaultSampleRate,
    speed,
    volume,
    language,
    denoise,
    voices,
    library,
  };
  if (prevApiKeyEnc != null) data.apiKeyEnc = prevApiKeyEnc;
  fs.writeFileSync(settingsPath(), JSON.stringify(data, null, 2));
}

// ---- API Key 安全存储（safeStorage 加密落盘） ----
function getApiKey(): string {
  try {
    const enc = (loadSettingsRaw().apiKeyEnc as string) || '';
    if (!enc) throw new Error('未配置 API Key');
    const buf = safeStorage.decryptString(Buffer.from(enc, 'base64'));
    return buf;
  } catch {
    throw new Error('未配置 API Key，请先在「设置」中填写。');
  }
}

function loadSettingsRaw(): any {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function setApiKey(key: string) {
  const raw = loadSettingsRaw();
  if (!safeStorage.isEncryptionAvailable()) {
    raw.apiKeyEnc = Buffer.from(key).toString('base64'); // 退路：无 DPAPI 时明文 base64
  } else {
    raw.apiKeyEnc = safeStorage.encryptString(key).toString('base64');
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify({ ...raw, ...stripVoices(raw) }, null, 2));
}

function stripVoices(raw: any) {
  const { outputDir, resourceId, defaultFormat, defaultSampleRate, speed, volume, language, denoise, voices } = raw;
  return { outputDir, resourceId, defaultFormat, defaultSampleRate, speed, volume, language, denoise, voices: voices ?? [] };
}

function clearApiKey() {
  const raw = loadSettingsRaw();
  delete raw.apiKeyEnc;
  fs.writeFileSync(settingsPath(), JSON.stringify(stripVoices(raw), null, 2));
}

function uuid() {
  return crypto.randomUUID();
}

function makeSpeakerId(name: string): string {
  const base = (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/^[-_]+/, '')
    .replace(/[-_]+$/, '');
  const rand = crypto.randomBytes(3).toString('hex');
  let id = `custom_zh_${base || 'voice'}_${rand}`;
  if (!/^[a-z]/.test(id)) id = 'c' + id;
  return id.slice(0, 256);
}

function extForFormat(fmt: string): string {
  if (fmt === 'wav') return 'wav';
  if (fmt === 'ogg_opus') return 'ogg';
  if (fmt === 'pcm') return 'pcm';
  return 'mp3';
}

async function httpPostJson(url: string, headers: Record<string, string>, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.raw || `HTTP ${res.status}`;
    throw new Error(`请求失败(${res.status}): ${msg}`);
  }
  return json;
}

// ---- 创建窗口 ----
function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: 'Jaygo AU',
    backgroundColor: '#f4f5f7',
    frame: false,            // 去掉原生标题栏，改用自绘标题栏（含最小化/最大化/关闭）
    autoHideMenuBar: true,   // 同时隐藏菜单栏，避免 Alt 键唤出
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.resolve('dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Vite 生产构建给 script/link 加了 crossorigin；Electron 用 file:// 加载本地文件时会被 CORS 拦截，
      // 关掉 webSecurity 让本地 JS/CSS 正常加载（应用本身不直接发起外网请求，API 调用全部走主进程）。
      webSecurity: false,
    },
  });

  dbg('BrowserWindow 已创建');
  win.webContents.on('did-fail-load', (_e, code, desc) => dbg('did-fail-load: ' + code + ' ' + desc));
  win.webContents.on('render-process-gone', (_e, d) => dbg('render-process-gone: ' + JSON.stringify(d)));
  win.on('closed', () => dbg('window closed'));

  const html = path.join(__dirname, '../dist/index.html');
  if (process.env.DEV) {
    win.loadURL('http://localhost:5173');
  } else {
    dbg('准备 loadFile: ' + html);
    win.loadFile(html).then(() => dbg('loadFile 成功')).catch((e) => dbg('loadFile 失败: ' + e));
  }
  return win;
}

app.whenReady().then(() => {
  dbg('app ready');
  try {
    createWindow();
    dbg('createWindow 完成');
  } catch (e: any) {
    dbg('createWindow 抛错: ' + (e?.stack || e));
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: 设置与密钥 ----
ipcMain.handle('getSettings', () => ({ ...settings }));
ipcMain.handle('hasApiKey', () => !!loadSettingsRaw().apiKeyEnc);
ipcMain.handle('setApiKey', (_e, key: string) => {
  if (!key || !key.trim()) throw new Error('API Key 不能为空');
  setApiKey(key.trim());
  return true;
});
ipcMain.handle('clearApiKey', () => {
  clearApiKey();
  return true;
});
ipcMain.handle('saveSettings', (_e, partial: Partial<Settings>) => {
  settings = { ...settings, ...partial, voices: settings.voices };
  if (partial.outputDir) fs.mkdirSync(partial.outputDir, { recursive: true });
  persistSettings();
  return { ...settings };
});

// ---- 文件选择 ----
ipcMain.handle('pickAudioFile', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '音频', extensions: ['wav', 'mp3', 'm4a', 'ogg', 'aac', 'pcm'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// ---- 音频存储位置 ----
// 选择新目录并把现有音频库文件一并迁移过去（迁移失败的单条跳过，不阻塞换目录）
ipcMain.handle('chooseOutputDir', async () => {
  const res = await dialog.showOpenDialog({
    title: '选择音频存储位置',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: settings.outputDir || undefined,
  });
  if (res.canceled || !res.filePaths.length) return null;

  const newDir = res.filePaths[0];
  const oldDir = settings.outputDir;
  if (path.resolve(newDir) === path.resolve(oldDir || '')) return { ...settings, migrated: 0, skipped: 0 };

  fs.mkdirSync(newDir, { recursive: true });
  let migrated = 0;
  let skipped = 0;
  if (oldDir && settings.library.length) {
    settings.library = settings.library.map((it) => {
      // 只迁移还在旧目录里的文件；已另存到别处的不动
      if (path.resolve(path.dirname(it.path)) === path.resolve(oldDir)) {
        const dest = path.join(newDir, path.basename(it.path));
        try {
          fs.renameSync(it.path, dest);
          migrated += 1;
          return { ...it, path: dest };
        } catch {
          skipped += 1;
          return it;
        }
      }
      return it;
    });
  }
  settings.outputDir = newDir;
  persistSettings();
  return { ...settings, migrated, skipped };
});

ipcMain.handle('openOutputDir', () => {
  const dir = settings.outputDir || path.join(app.getPath('userData'), 'audio');
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
  return true;
});

// ---- 复刻（训练） ----
ipcMain.handle('cloneVoice', async (_e, args: { name: string; filePath: string; language: number; denoise: boolean }) => {
  const key = getApiKey();
  const buf = fs.readFileSync(args.filePath);
  const b64 = buf.toString('base64');
  const ext = (path.extname(args.filePath).slice(1) || 'wav').toLowerCase();
  const speakerId = makeSpeakerId(args.name);
  const body: any = {
    speaker_id: 'custom_speaker_id',
    custom_speaker_id: speakerId,
    audio: { data: b64, format: ext },
    language: args.language ?? 0,
    extra_params: { voice_clone_denoise_model_id: args.denoise ? '' : undefined },
  };
  const json = await httpPostJson(CLONE_URL, {
    'X-Api-Key': key,
    'X-Api-Request-Id': uuid(),
  }, body);
  const status = json?.status ?? 1;
  const rec: VoiceRecord = {
    id: speakerId,
    name: args.name?.trim() || speakerId,
    createdAt: Date.now(),
    status,
    modelType: json?.speaker_status?.[0]?.model_type,
    note: json?.message,
  };
  settings.voices = [rec, ...settings.voices.filter((v) => v.id !== speakerId)];
  persistSettings();
  return { ok: true, speakerId, status, message: json?.message, code: json?.code };
});

// ---- 查询状态 ----
ipcMain.handle('queryVoice', async (_e, speakerId: string) => {
  const key = getApiKey();
  const json = await httpPostJson(GET_VOICE_URL, {
    'X-Api-Key': key,
    'X-Api-Request-Id': uuid(),
  }, getVoiceBody(speakerId));
  const status = json?.status ?? 0;
  const idx = settings.voices.findIndex((v) => v.id === speakerId);
  if (idx >= 0) {
    settings.voices[idx].status = status;
    settings.voices[idx].modelType = json?.speaker_status?.[0]?.model_type;
    persistSettings();
  }
  return { status, message: json?.message, speakerStatus: json?.speaker_status };
});

// ---- 诊断 API Key（只读） ----
// 策略：优先用本机已记录的真实音色 ID 探测（结果最准）；
// 没有则用一次性探测 ID。注意：火山对「不存在的音色 ID」可能直接返回 500，
// 所以 5xx 不能当作 Key 有问题 —— 它反而说明请求已通过鉴权网关、网络也通。
ipcMain.handle('testApiKey', async () => {
  let key: string;
  try {
    key = getApiKey();
  } catch (e: any) {
    return { ok: false, stage: 'no-key', status: 0, keyValid: false, resourceGranted: false, message: e?.message || '未配置 API Key' };
  }

  const probeId = settings.voices[0]?.id || 'jaygo_probe_00000000';
  const usingRealVoice = Boolean(settings.voices[0]?.id);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(GET_VOICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': key,
        'X-Api-Request-Id': uuid(),
      },
      body: JSON.stringify(getVoiceBody(probeId)),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text().catch(() => '');
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (res.status === 200) {
      return {
        ok: true,
        status: 200,
        keyValid: true,
        resourceGranted: true,
        message: usingRealVoice
          ? `✅ Key 有效，声音复刻资源已授权（已用你的音色「${settings.voices[0].name}」验证）。可以正常训练和合成。`
          : '✅ Key 有效，声音复刻资源已授权。可以正常训练和合成。',
      };
    }

    if (res.status >= 500) {
      return {
        ok: false,
        status: res.status,
        keyValid: true,
        resourceGranted: true,
        serverError: true,
        message:
          `⚠️ 服务返回 ${res.status}（服务器内部错误）。这通常**不代表 Key 有问题** —— 请求已经通过鉴权（没有被 401/403 拒绝），网络也是通的。\n` +
          (usingRealVoice
            ? `这次是用你的音色「${settings.voices[0].name}」探测的，可能是该音色状态异常或服务端临时故障，稍后重试即可。`
            : '因为还没有任何音色，本次用了一次性探测 ID；火山在查询不存在的音色时可能直接返回 500。建议先到「我的音色」批量导入你的真实音色 ID，再回来测一次。') +
          `\n服务端原文：${(json?.message || text || '').slice(0, 160)}`,
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        keyValid: false,
        resourceGranted: false,
        message:
          '❌ API Key 无效（401）：请确认使用的是火山引擎【新版控制台】的 API Key（console.volcengine.com/speech/new/setting/apikeys），且粘贴时不含多余空格或换行。旧控制台（speech/app）的 appid+access_token 与此 Key 体系不通用。',
      };
    }
    if (res.status === 403) {
      const msg = json?.message || text || '';
      const notGranted = /resource not granted|not granted|未授权|forbidden/i.test(msg);
      return {
        ok: false,
        status: 403,
        keyValid: true,
        resourceGranted: false,
        message: notGranted
          ? '🔑 Key 有效，但【声音复刻资源未授权】（403）：请到火山引擎控制台为当前 API Key 开通「语音合成大模型 - 声音复刻」资源（resource_id=volc.megatts.timbre），并确认已开通后付费/购买音色槽位。代码层配置已经正确，这是账号侧的权限问题。'
          : `🔑 Key 被拒绝（403）：${msg.slice(0, 220)}`,
      };
    }
    return {
      ok: false,
      status: res.status,
      keyValid: null,
      resourceGranted: null,
      message: `请求返回 ${res.status}：${(json?.message || text || '').slice(0, 220)}`,
    };
  } catch (e: any) {
    clearTimeout(timer);
    const net = /abort|timeout|fetch failed|ENOTFOUND|ECONN|network/i.test(e?.message || '');
    return {
      ok: false,
      status: 0,
      keyValid: null,
      resourceGranted: null,
      network: net,
      message: net
        ? '🌐 网络不通或请求超时（15s）：请检查本机网络连接、代理/VPN 设置，或稍后重试。'
        : `请求异常：${e?.message || String(e)}`,
    };
  }
});

// ---- 合成（流式 NDJSON） ----
ipcMain.handle('synthesize', async (e, args: {
  speakerId: string;
  text: string;
  format: string;
  sampleRate: number;
  speed: number;
  volume: number;
  pitch?: number;
  emotion?: string;
  resourceId?: string;
  official?: boolean;
}) => {
  const key = getApiKey();
  const isOfficial = args.official === true;
  const resourceId = isOfficial
    ? (args.speakerId.includes('uranus') ? 'seed-tts-2.0' : 'seed-tts-1.0')
    : (args.resourceId || settings.resourceId || 'seed-icl-2.0');
  const format = args.format || settings.defaultFormat;
  const speechRate = Math.round((args.speed - 1) * 100);
  const loudnessRate = Math.round((args.volume - 1) * 100);
  const audioParams: any = { format, sample_rate: args.sampleRate };
  if (speechRate !== 0) audioParams.speech_rate = speechRate;
  if (loudnessRate !== 0) audioParams.loudness_rate = loudnessRate;
  if (args.emotion) audioParams.emotion = args.emotion;
  if (args.pitch != null && args.pitch !== 0) {
    audioParams.additions = { post_process: { pitch: args.pitch } };
  }

  const reqParams: any = {
    text: args.text,
    audio_params: audioParams,
  };
  // V3 流式接口：音色统一通过 speaker 传入，官方/克隆由 Resource-Id 区分
  reqParams.speaker = args.speakerId;
  if (!isOfficial) {
    // 声音复刻 2.0 克隆音色：显式指定 2.0 高表现力模型
    reqParams.model = 'seed-tts-2.0-expressive';
  }

  const body = {
    user: { uid: `jaygo_${Date.now()}` },
    req_params: reqParams,
  };

  const res = await fetch(SYNTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': key,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': uuid(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    throw new Error(`合成请求失败(${res.status}): ${t.slice(0, 200)}`);
  }

  const outDir = settings.outputDir || path.join(app.getPath('userData'), 'audio');
  fs.mkdirSync(outDir, { recursive: true });
  const fileId = `jaygo_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
  const outPath = path.join(outDir, `${fileId}.${extForFormat(format)}`);
  const out = fs.createWriteStream(outPath);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let written = 0;
  let totalChunks = 0;
  let lastPct = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.code === 0 && obj.data) {
        const chunk = Buffer.from(obj.data, 'base64');
        out.write(chunk);
        written += chunk.length;
        totalChunks++;
        const pct = totalChunks % 4 === 0 ? Math.min(99, totalChunks) : lastPct;
        if (pct !== lastPct) {
          lastPct = pct as number;
          e.sender.send('synth-progress', { stage: 'streaming', pct: lastPct, bytes: written });
        }
      } else if (obj.code === 20000000) {
        // 结束标记
      } else if (obj.code && obj.code !== 0) {
        out.end();
        throw new Error(`合成错误 code=${obj.code}: ${obj.message || ''}`);
      }
    }
  }
  await new Promise<void>((resolve, reject) => {
    out.end((err?: Error) => (err ? reject(err) : resolve()));
  });

  e.sender.send('synth-progress', { stage: 'done', pct: 100, bytes: written });
  return { path: outPath, size: written, format, fileId };
});

// ---- 音色试听：合成固定示例文本到临时文件（不入音频库、不弹进度） ----
ipcMain.handle('previewVoice', async (_e, args: { speakerId: string; official?: boolean }) => {
  const key = getApiKey();
  const isOfficial = args.official === true;
  const resourceId = isOfficial
    ? (args.speakerId.includes('uranus') ? 'seed-tts-2.0' : 'seed-tts-1.0')
    : (settings.resourceId || 'seed-icl-2.0');

  const reqParams: any = {
    // 试听示例文本：短小、覆盖常用发音
    text: '你好，这是我的音色试听，很高兴认识你。',
    audio_params: { format: 'mp3', sample_rate: 24000 },
  };
  // V3 流式接口：音色统一通过 speaker 传入，官方/克隆由 Resource-Id 区分
  reqParams.speaker = args.speakerId;
  if (!isOfficial) {
    reqParams.model = 'seed-tts-2.0-expressive';
  }

  const res = await fetch(SYNTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': key,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': uuid(),
    },
    body: JSON.stringify({ user: { uid: `jaygo_${Date.now()}` }, req_params: reqParams }),
  });

  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    throw new Error(`试听请求失败(${res.status}): ${t.slice(0, 200)}`);
  }

  // 覆盖式写入临时目录，避免文件堆积
  const previewDir = path.join(app.getPath('temp'), 'jaygo-preview');
  fs.mkdirSync(previewDir, { recursive: true });
  const safeId = args.speakerId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = path.join(previewDir, `preview_${safeId}.mp3`);
  const out = fs.createWriteStream(outPath);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let written = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj: any;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.code === 0 && obj.data) {
        const chunk = Buffer.from(obj.data, 'base64');
        out.write(chunk);
        written += chunk.length;
      } else if (obj.code && obj.code !== 0 && obj.code !== 20000000) {
        out.end();
        throw new Error(`试听合成错误 code=${obj.code}: ${obj.message || ''}`);
      }
    }
  }
  await new Promise<void>((resolve, reject) => {
    out.end((err?: Error) => (err ? reject(err) : resolve()));
  });

  if (written === 0) throw new Error('试听合成为空，请检查音色是否可用');
  return { path: outPath, size: written, format: 'mp3' };
});

// ---- 自绘标题栏的窗口控制 ----
function winOf(e: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender);
}
ipcMain.handle('windowMinimize', (e) => {
  winOf(e)?.minimize();
});
ipcMain.handle('windowToggleMaximize', (e) => {
  const w = winOf(e);
  if (!w) return false;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
  return w.isMaximized();
});
ipcMain.handle('windowClose', (e) => {
  winOf(e)?.close();
});
ipcMain.handle('windowIsMaximized', (e) => winOf(e)?.isMaximized() ?? false);

// ---- 试听：读取音频为 dataURL ----
ipcMain.handle('readAudio', async (_e, p: string) => {
  const buf = fs.readFileSync(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : ext === 'pcm' ? 'audio/basic' : 'audio/mpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
});

// ---- 下载：另存为 ----
ipcMain.handle('downloadAudio', async (_e, args: { path: string; suggestedName: string }) => {
  const res = await dialog.showSaveDialog({
    defaultPath: args.suggestedName,
    filters: [{ name: '音频', extensions: [path.extname(args.suggestedName).slice(1) || 'mp3'] }],
  });
  if (res.canceled || !res.filePath) return null;
  fs.copyFileSync(args.path, res.filePath);
  return res.filePath;
});

// ---- 扫描音频库（持久化）：读取输出目录下的音频文件 ----
ipcMain.handle('listLibrary', () => {
  const dir = settings.outputDir || path.join(app.getPath('userData'), 'audio');
  try {
    if (!fs.existsSync(dir)) return [];
    const exts = new Set(['.mp3', '.wav', '.ogg', '.pcm']);
    return fs
      .readdirSync(dir)
      .filter((f) => exts.has(path.extname(f).toLowerCase()))
      .map((f) => {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        return {
          path: p,
          name: f,
          size: st.size,
          createdAt: st.birthtimeMs || st.mtimeMs,
          ext: path.extname(f).slice(1).toLowerCase(),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
});

// ---- 删除音色/记录 ----
ipcMain.handle('removeVoice', (_e, speakerId: string) => {
  settings.voices = settings.voices.filter((v) => v.id !== speakerId);
  persistSettings();
  return true;
});

ipcMain.handle('removeLibraryItem', (_e, itemPath: string) => {
  try {
    if (fs.existsSync(itemPath)) fs.unlinkSync(itemPath);
  } catch {}
  settings.library = settings.library.filter((i) => i.path !== itemPath);
  persistSettings();
  return true;
});

ipcMain.handle('addManualVoice', (_e, args: { id: string; name: string }) => {
  if (!args.id?.trim()) throw new Error('音色 ID 不能为空');
  const rec: VoiceRecord = { id: args.id.trim(), name: args.name?.trim() || args.id.trim(), createdAt: Date.now(), status: 4 };
  settings.voices = [rec, ...settings.voices.filter((v) => v.id !== rec.id)];
  persistSettings();
  return true;
});

// ---- 重命名音色 ----
ipcMain.handle('renameVoice', (_e, args: { id: string; name: string }) => {
  const name = args.name?.trim();
  if (!name) throw new Error('名称不能为空');
  const idx = settings.voices.findIndex((v) => v.id === args.id);
  if (idx < 0) throw new Error('音色不存在');
  settings.voices[idx].name = name;
  persistSettings();
  return true;
});

// ---- 批量导入音色（官方 V3 接口只能逐个查，无法列出账号下全部音色，故由用户粘贴 ID 批量录入） ----
ipcMain.handle('importVoices', async (_e, rawIds: string) => {
  const key = getApiKey();
  const ids = [
    ...new Set(
      String(rawIds || '')
        .split(/[\s,，;；\n\r\t]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  if (ids.length === 0) throw new Error('请粘贴至少一个音色 ID');

  const added: string[] = [];
  const failed: string[] = [];

  for (const id of ids) {
    let status = 4;   // 默认可用；查询失败时保持可用，避免官方音色被误标
    let modelType: number | undefined;
    let queried = false;
    try {
      const json = await httpPostJson(
        GET_VOICE_URL,
        { 'X-Api-Key': key, 'X-Api-Request-Id': uuid() },
        getVoiceBody(id)
      );
      status = json?.status ?? 0;
      modelType = json?.speaker_status?.[0]?.model_type;
      queried = true;
    } catch {
      // 官方精品音色（zh_female_xxx 等）不走音色查询接口，保持默认可用即可
    }
    if (queried && status === 0) {
      failed.push(id);   // 明确查不到，提示用户核对
      continue;
    }
    const rec: VoiceRecord = {
      id,
      name: settings.voices.find((v) => v.id === id)?.name || id,
      createdAt: Date.now(),
      status,
      modelType,
    };
    settings.voices = [rec, ...settings.voices.filter((v) => v.id !== id)];
    added.push(id);
  }

  persistSettings();
  return { added: added.length, failed };
});
