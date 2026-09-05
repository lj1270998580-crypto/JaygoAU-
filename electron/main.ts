import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, net, Tray, Menu, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as child_process from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { extractMedia, downloadMediaFile, extractAudioWithFfmpeg, type ParsedMediaInfo } from './mediaExtractor';

// 主进程出站请求统一走 Chromium 网络栈（net.fetch），自动尊重系统代理（v2rayN/Clash 等）。
// Node.js 原生 fetch(undici) 默认不读取系统代理，导致中国大陆用户即便开了代理，
// 调用火山/阿里云/字节点等境外/半境外接口时仍会直连超时或失败。
const fetch: typeof globalThis.fetch = net.fetch.bind(net) as any;

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

// ============================================================
// 服务端地址（仅公开端点，绝不包含 OSS AK/SK 等密匙）
// 真实阿里云 OSS AK/SK 只存于服务端，客户端转录时向这些端点
// 换取「单次 / 短时 / 限单个对象」的临时预签名 URL 后直接上传。
// 部署时若改用其他域名，只需改这里（及 electron-builder 的 publish.url）。
// ============================================================
const APP_CONFIG = {
  // 获取上传/下载临时预签名 URL（POST，返回 {putUrl,getUrl,key,expiresIn}）
  ossTokenEndpoint: 'https://ailabing.cn/api/jaygo-au/oss-token',
  // 任务结束后删除临时对象（POST {key}）
  ossDeleteEndpoint: 'https://ailabing.cn/api/jaygo-au/oss-delete',
  // 在线更新 feed（electron-updater generic provider，latest.yml 所在目录）
  updateFeedUrl: 'https://ailabing.cn/jaygo-au/updates',
  // 可选：与后端约定的轻量共享令牌，仅用于过滤随机扫描（非保密，不必进密匙管理）
  appToken: '',
};

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
  officialResourceId: string;  // 官方音色资源ID，默认 seed-tts-2.0（豆包语音合成 2.0）
  defaultFormat: 'mp3' | 'wav' | 'ogg_opus' | 'pcm';
  defaultSampleRate: number;
  speed: number;       // 倍速 0.5-2
  volume: number;      // 0.5-2
  language: number;    // 0中文 ...
  denoise: boolean;
  voices: VoiceRecord[];
  library: LibraryItem[];
  // ---- 视音频转录（录音文件识别 2.0） ----
  asrResourceId: string;        // 默认 volc.seedasr.auc
  enableSpeakerInfo: boolean;   // 转录时是否开启说话人分离
  // ---- 火山 AK/SK（账户余额实时查询用，独立于 X-Api-Key） ----
  volcAccessKeyId: string;
  volcSecretKey: string;
  // ---- 蝉镜开放平台（数字人视频生成） ----
  chanjingAppId?: string;
  chanjingSecretKey?: string;
  // ---- 用户上次使用的音色记忆 ----
  lastSelectedVoiceId?: string | null;
  lastOfficialVoiceId?: string;
  // ---- 系统托盘与任务通知偏好 ----
  closeToTray?: boolean;
  notifyOnTaskComplete?: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  outputDir: '',
  resourceId: 'seed-icl-2.0',
  officialResourceId: 'seed-tts-2.0',
  defaultFormat: 'mp3',
  defaultSampleRate: 24000,
  speed: 1.0,
  volume: 1.0,
  language: 0,
  denoise: true,
  voices: [],
  library: [],
  asrResourceId: 'volc.seedasr.auc',
  enableSpeakerInfo: false,
  volcAccessKeyId: '',
  volcSecretKey: '',
  chanjingAppId: '',
  chanjingSecretKey: '',
  lastSelectedVoiceId: null,
  lastOfficialVoiceId: 'zh_female_vv_uranus_bigtts',
  closeToTray: true,
  notifyOnTaskComplete: true,
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
  // 关键：apiKeyEnc 不属于 Settings 结构但存在同一文件里，
  // 这里必须原样带回，否则任何一次持久化（改设置 / 复刻 / 增删音色）都会把 API Key 抹掉。
  const prevApiKeyEnc = loadSettingsRaw().apiKeyEnc;
  // 直接序列化完整 settings（含 volcAccessKeyId / volcSecretKey / asrResourceId / enableSpeakerInfo
  // 等所有字段），避免硬编码白名单遗漏新增字段导致「输入即失效」。
  const data: Record<string, unknown> = { ...settings };
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
  const cloned = { ...raw };
  return {
    ...DEFAULT_SETTINGS,
    ...cloned,
    voices: cloned.voices ?? [],
    library: cloned.library ?? [],
  };
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
    .replace(/[^\w\u4e00-\u9fa5]/g, '_')
    .slice(0, 16);
  const rnd = crypto.randomBytes(3).toString('hex');
  return `jaygo_${base ? base + '_' : ''}${rnd}`;
}

function extForFormat(f: string): string {
  if (f === 'ogg_opus') return 'ogg';
  return f;
}

async function httpPostJson(url: string, headers: Record<string, string>, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || `HTTP ${res.status}`;
    throw new Error(`请求失败(${res.status}): ${msg}`);
  }
  return json;
}

// 同 httpPostJson，但额外返回原始 status / text，便于排查「200 + 空 body」类问题
async function httpPostJsonWithRaw(url: string, headers: Record<string, string>, body: any): Promise<{ json: any; status: number; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const msg = json?.message || text || `HTTP ${res.status}`;
    throw new Error(`请求失败(${res.status}): ${msg}`);
  }
  return { json, status: res.status, text };
}

// ---- 走 Electron net.request 的 POST：能拿到「原始响应头」----
// 火山 ASR 把任务状态放在响应头 X-Api-Status-Code / X-Api-Message 里（body 在任务未完成时是 {}），
// 而 net.fetch 走的是 Chromium fetch 语义，跨域时自定义响应头可能被隐藏，读不到状态码。
// net.request 是底层客户端请求，headers 一定拿得到，所以 ASR 的 submit/query 专用这一路。
function netPost(url: string, headers: Record<string, string>, body: any): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  return new Promise((resolve, reject) => {
    let done = false;
    const req = net.request({ method: 'POST', url });
    const outHeaders: Record<string, string> = {};
    const allHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
    req.on('response', (res) => {
      try {
        for (const [k, v] of Object.entries(res.headers || {})) {
          outHeaders[String(k).toLowerCase()] = Array.isArray(v) ? v.join(',') : String(v);
        }
      } catch {}
      const chunks: Buffer[] = [];
      res.on('data', (c: any) => {
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
      });
      res.on('end', () => {
        if (done) return;
        done = true;
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve({ status: res.statusCode || 0, headers: outHeaders, text });
      });
      res.on('error', (e: any) => {
        if (done) return;
        done = true;
        reject(e);
      });
    });
    req.on('error', (e: any) => {
      if (done) return;
      done = true;
      reject(e);
    });
    try {
      for (const [k, v] of Object.entries(allHeaders)) req.setHeader(k, v);
      req.end(JSON.stringify(body));
    } catch (e) {
      if (!done) {
        done = true;
        reject(e);
      }
    }
  });
}

// 火山 ASR 状态码（来自响应头 X-Api-Status-Code）
const ASR_STATUS_TEXT: Record<string, string> = {
  '20000000': '任务完成',
  '20000001': '任务排队中',
  '20000002': '任务处理中',
  '20000003': '静音音频（无需重试，请换一个音频）',
  '45000001': '请求参数无效',
  '45000002': '空音频（云端没拿到有效音频数据）',
  '45000151': '音频格式不正确',
  '55000031': '服务器繁忙，请稍后重试',
};

// 从 query 响应里尽量健壮地抽出识别文本与分句
function extractAsrResult(body: any): { text: string; utterances: any[]; durationMs: number } | null {
  if (!body || typeof body !== 'object') return null;
  let r: any = body.result;
  if (Array.isArray(r)) r = r[0];
  if (!r || typeof r !== 'object') return null;

  const rawUtt: any[] = Array.isArray(r.utterances) ? r.utterances : Array.isArray(body.result) ? body.result : [];
  const utterances = rawUtt.map((u: any) => ({
    text: typeof u?.text === 'string' ? u.text : '',
    startTime: Number(u?.start_time) || 0,
    endTime: Number(u?.end_time) || 0,
    speaker: u?.additions?.speaker,
  }));

  // 文本优先取 result.text；没有就用全部分句拼起来兜底
  let text = typeof r.text === 'string' ? r.text : '';
  if (!text && utterances.length) text = utterances.map((u) => u.text).join('');

  const dur = Number(body?.audio_info?.duration) || Number(r?.additions?.duration) || 0;
  return { text, utterances, durationMs: dur };
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function getAppIconPath(): string | undefined {
  const candidates = [
    path.join(__dirname, 'icon.ico'),
    path.join(process.resourcesPath, 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'dist-electron', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
  ];
  return candidates.find(p => fs.existsSync(p));
}

function createTray() {
  if (tray) return;
  const iconPath = getAppIconPath();
  if (!iconPath) {
    dbg('未找到系统托盘图标文件');
    return;
  }

  try {
    tray = new Tray(iconPath);
    tray.setToolTip('Jaygo AU — 豆包语音工作室');

    const showWin = (targetTab?: string) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        if (targetTab) {
          mainWindow.webContents.send('navigate-tab', targetTab);
        }
      }
    };

    tray.on('click', () => showWin());
    tray.on('double-click', () => showWin());

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主界面',
        click: () => showWin(),
      },
      {
        label: '偏好设置',
        click: () => showWin('settings'),
      },
      { type: 'separator' },
      {
        label: '退出 Jaygo AU',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
    dbg('系统托盘已成功创建');
  } catch (err: any) {
    dbg('创建系统托盘异常: ' + (err?.stack || err));
  }
}

// ---- 创建窗口 ----
function createWindow() {
  const iconPath = path.join(__dirname, 'icon.ico');
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: 'Jaygo AU',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#0c0c0e',
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

  mainWindow = win;

  dbg('BrowserWindow 已创建');
  win.webContents.on('did-fail-load', (_e, code, desc) => dbg('did-fail-load: ' + code + ' ' + desc));
  win.webContents.on('render-process-gone', (_e, d) => dbg('render-process-gone: ' + JSON.stringify(d)));
  win.on('closed', () => {
    dbg('window closed');
    mainWindow = null;
  });

  // 拦截关闭事件：若开启了最小化至托盘且未显式退出，则隐藏窗口保活后台任务
  let hasShownBalloon = false;
  win.on('close', (e) => {
    if (!isQuitting && settings.closeToTray !== false) {
      e.preventDefault();
      win.hide();
      if (tray && !hasShownBalloon) {
        hasShownBalloon = true;
        try {
          tray.displayBalloon({
            title: 'Jaygo AU',
            content: '已最小化到系统托盘，后台任务将继续运行。单击托盘图标可重新打开。',
          });
        } catch {}
      }
      return false;
    }
  });

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
  try {
    createTray();
    dbg('createTray 完成');
  } catch (e: any) {
    dbg('createTray 抛错: ' + (e?.stack || e));
  }
  try {
    initAutoUpdater();
  } catch (e: any) {
    dbg('initAutoUpdater 抛错: ' + (e?.stack || e));
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (isQuitting || settings.closeToTray === false) {
      app.quit();
    }
  }
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

// ---- 原生系统通知与应用退出 ----
ipcMain.handle('show-notification', (_e, args: { title: string; body: string; tab?: string }) => {
  if (settings.notifyOnTaskComplete === false) return;
  if (!Notification.isSupported()) return;
  const iconPath = getAppIconPath();
  const notif = new Notification({
    title: args.title,
    body: args.body,
    icon: iconPath,
  });
  notif.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (args.tab) {
        mainWindow.webContents.send('navigate-tab', args.tab);
      }
    }
  });
  notif.show();
});

ipcMain.handle('app-quit', () => {
  isQuitting = true;
  app.quit();
});

// ---- 试听：读取音频为 dataURL ----
ipcMain.handle('readAudio', async (_e, p: string) => {
  let targetPath = path.normalize(p);
  if (!fs.existsSync(targetPath)) {
    // 尝试在当前 outputDir 或 userData/audio 目录下按文件名兜底查找
    const fileName = path.basename(p);
    const candidate1 = settings.outputDir ? path.join(settings.outputDir, fileName) : '';
    const candidate2 = path.join(app.getPath('userData'), 'audio', fileName);
    if (candidate1 && fs.existsSync(candidate1)) {
      targetPath = candidate1;
    } else if (fs.existsSync(candidate2)) {
      targetPath = candidate2;
    } else {
      throw new Error(`音频文件不存在: ${fileName}`);
    }
  }
  const buf = fs.readFileSync(targetPath);
  const ext = path.extname(targetPath).slice(1).toLowerCase();
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

// ============================================================
// 视音频转录（录音文件识别 2.0）
// ============================================================

const VIDEO_EXT = new Set(['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'mpeg', 'mpg', 'm4v', 'ts', 'vob', '3gp', 'm2ts']);
// 火山 ASR 支持的音频容器 → (format, codec)
const ASR_AUDIO: Record<string, { format: string; codec?: string }> = {
  wav: { format: 'wav', codec: 'raw' },
  pcm: { format: 'pcm', codec: 'raw' },
  mp3: { format: 'mp3' },
  m4a: { format: 'm4a' },
  aac: { format: 'aac' },
  ogg: { format: 'ogg' },
  oga: { format: 'ogg' },
  opus: { format: 'ogg', codec: 'opus' },
  amr: { format: 'amr' },
  spx: { format: 'spx' },
};

const ASR_SUBMIT = `${BASE}/api/v3/auc/bigmodel/submit`;
const ASR_QUERY = `${BASE}/api/v3/auc/bigmodel/query`;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// electron 把 ffmpeg-static 解包到 app.asar.unpacked，但 ffmpeg-static 通过 __dirname 拼接的路径
// 在 electron+asar 下偶尔仍指向 asar 内的虚拟路径，导致 spawn() ENOENT。强制指向 .unpacked 里的真实 exe。
const FFMPEG_PATH: string = (() => {
  let p = ffmpegStatic as unknown as string;
  if (p && p.includes(`${path.sep}app.asar${path.sep}`)) {
    p = p.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  }
  return p;
})();
dbg('FFMPEG_PATH resolved to: ' + FFMPEG_PATH);

// 用 ffmpeg 从视频（或不支持的音频格式）中提取单声道 16k wav
function extractAudio(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_PATH) return reject(new Error('未找到 ffmpeg（ffmpeg-static 未正确安装）'));
    const args = ['-y', '-i', input, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', output];
    let stderr = '';
    const proc = spawn(FFMPEG_PATH, args);
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(output)) {
        const size = fs.statSync(output).size;
        // 44 字节 = 只有 wav 头、没有任何采样数据 → 抽出来的是「空音频」，交给火山必然识别为空
        if (size <= 44) {
          dbg(`[extractAudio] 警告：输出仅 ${size} 字节，疑似空音频。stderr=${stderr.slice(-300)}`);
          return reject(new Error('音频提取结果是空的（该文件可能没有音轨，或音轨格式 ffmpeg 无法解码）'));
        }
        dbg(`[extractAudio] ok -> ${output} size=${(size / 1024).toFixed(1)}KB`);
        resolve();
      } else reject(new Error(`音频提取失败（ffmpeg 退出码 ${code}）：${stderr.slice(-400)}`));
    });
  });
}

// 解析出可直接送 ASR 的音频：视频 → 抽音频；不支持的音频 → 转 wav
async function resolveAudioForAsr(filePath: string): Promise<{ localPath: string; format: string; codec?: string; isTemp: boolean }> {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (VIDEO_EXT.has(ext)) {
    const out = path.join(app.getPath('temp'), `jaygo-asr-${crypto.randomBytes(4).toString('hex')}.wav`);
    await extractAudio(filePath, out);
    return { localPath: out, format: 'wav', codec: 'raw', isTemp: true };
  }
  const a = ASR_AUDIO[ext];
  if (a) return { localPath: filePath, format: a.format, codec: a.codec, isTemp: false };
  // 不支持的音频格式（如 wma/flac）→ 统一转 wav
  const out = path.join(app.getPath('temp'), `jaygo-asr-${crypto.randomBytes(4).toString('hex')}.wav`);
  await extractAudio(filePath, out);
  return { localPath: out, format: 'wav', codec: 'raw', isTemp: true };
}

// ---- 托管式 OSS：真实 AK/SK 仅存于服务端，客户端只拿临时预签名 URL ----
// 安全要点：① 全程 HTTPS；② 预签名 URL 限单次 PUT/GET、绑定随机对象 key、短时有效；
//          ③ 客户端不持有任何长期密匙；④ 任务结束后由服务端删除临时对象。
async function requestOssTicket(ext?: string): Promise<{ putUrl: string; getUrl: string; key: string; expiresIn: number }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (APP_CONFIG.appToken) headers['x-app-token'] = APP_CONFIG.appToken;
  const res = await fetch(APP_CONFIG.ossTokenEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ext: ext || 'wav' }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`获取 OSS 上传凭证失败（${res.status}）：${t.slice(0, 200)}`);
  }
  const data: any = await res.json().catch(() => ({}));
  if (!data.putUrl || !data.getUrl || !data.key) {
    throw new Error('OSS 凭证返回格式异常，请联系开发者');
  }
  return data;
}

async function uploadAudioToOss(localPath: string, ext: string = 'wav'): Promise<{ url: string; key: string }> {
  const ticket = await requestOssTicket(ext);
  const buf = fs.readFileSync(localPath);
  dbg(`[OSS] put size=${buf.length}B getUrlHost=${(() => { try { return new URL(ticket.getUrl).host; } catch { return '?'; } })()}`);
  const res = await fetch(ticket.putUrl, {
    method: 'PUT',
    body: buf,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`上传到 OSS 失败（${res.status}）：${t.slice(0, 200)}`);
  }
  dbg(`[OSS] uploaded ok -> ${ticket.getUrl}`);
  return { url: ticket.getUrl, key: ticket.key };
}

async function deleteOssObject(key: string) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (APP_CONFIG.appToken) headers['x-app-token'] = APP_CONFIG.appToken;
    await fetch(APP_CONFIG.ossDeleteEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key }),
    });
  } catch {
    // 忽略删除失败（不影响结果返回）
  }
}

// 轮询查询结果，直到识别完成或超时
async function pollAsr(taskId: string, key: string, e: Electron.IpcMainInvokeEvent): Promise<{ text: string; utterances: any[]; durationMs: number }> {
  const headers: Record<string, string> = {
    'X-Api-Key': key,
    'X-Api-Resource-Id': settings.asrResourceId || 'volc.seedasr.auc',
    'X-Api-Request-Id': taskId,
  };
  const deadline = Date.now() + 15 * 60 * 1000; // 15 分钟超时
  let n = 0;
  let lastRaw = '';
  while (Date.now() < deadline) {
    await sleep(3000);
    n += 1;
    e.sender.send('transcribe-status', `识别中（第 ${n} 次查询）…`);

    const r = await netPost(ASR_QUERY, headers, {});
    const code = String(r.headers['x-api-status-code'] || '');
    const apiMsg = r.headers['x-api-message'] || '';
    lastRaw = (r.text || '').slice(0, 400);
    dbg(`[ASR query#${n}] http=${r.status} code=${code || '-'} msg=${apiMsg || '-'} body=${(r.text || '').slice(0, 800)}`);

    let json: any = {};
    try {
      json = JSON.parse(r.text || '{}');
    } catch {
      json = {};
    }
    const body = json && json.body ? json.body : json;
    const parsed = extractAsrResult(body);

    // 拿到有效文本 → 直接返回
    if (parsed && parsed.text) return parsed;

    // 服务端明确说「任务完成」却没有文本 → 直接把原始响应抛出来，方便定位
    if (code === '20000000') {
      throw new Error(
        `识别已结束但结果为空（${
          ASR_STATUS_TEXT[code] || apiMsg || '可能是静音音频或云端没下载到音频'
        }）。原始响应：${(r.text || '').slice(0, 300)}`
      );
    }
    // 明确的失败/异常状态码 → 立刻报错，不再空转
    if (code && code !== '20000001' && code !== '20000002') {
      throw new Error(`转录失败（${code} ${ASR_STATUS_TEXT[code] || apiMsg || '未知错误'}）`);
    }
    if (!code && n === 1) {
      dbg('[ASR query] 提示：响应头里没有 X-Api-Status-Code，退化为按 body 判断');
    }
    if (r.status >= 400 && !code) {
      throw new Error(`转录查询失败（HTTP ${r.status}）：${(r.text || '').slice(0, 200)}`);
    }
  }
  throw new Error(
    `转录超时（15 分钟仍未完成，请检查音频时长或网络）。最后一次响应：${lastRaw}`
  );
}

ipcMain.handle('pickMediaFile', async () => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: '音视频文件',
        extensions: [
          'wav', 'mp3', 'm4a', 'ogg', 'oga', 'opus', 'aac', 'pcm', 'amr', 'spx', 'wma', 'flac',
          'mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'mpeg', 'mpg', 'm4v', 'ts', '3gp',
        ],
      },
    ],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// ---- 多平台媒体/短视频无水印提取 ----
ipcMain.handle('extract-media', async (_e, input: string) => {
  dbg('[MediaExtractor] 开始解析: ' + (input || '').slice(0, 100));
  return await extractMedia(input);
});

ipcMain.handle(
  'download-extracted-media',
  async (e, args: { mediaInfo: ParsedMediaInfo; type: 'video' | 'audio' }) => {
    const { mediaInfo, type } = args;
    const safeTitle = (mediaInfo.title || 'media').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const defaultExt = type === 'video' ? 'mp4' : 'mp3';
    const defaultPath = path.join(settings.outputDir || app.getPath('downloads'), `${safeTitle}.${defaultExt}`);

    const win = winOf(e) || mainWindow;
    const saveRes = await dialog.showSaveDialog(win!, {
      title: type === 'video' ? '保存无水印视频' : '保存原声音频',
      defaultPath,
      filters: [
        type === 'video'
          ? { name: 'MP4 视频', extensions: ['mp4'] }
          : { name: 'MP3 音频', extensions: ['mp3'] },
      ],
    });
    if (saveRes.canceled || !saveRes.filePath) return null;
    const targetPath = saveRes.filePath;

    if (type === 'video') {
      if (!mediaInfo.videoUrl) throw new Error('该作品未解析出视频流');
      await downloadMediaFile(mediaInfo.videoUrl, targetPath, mediaInfo.headers);
      return { path: targetPath, size: fs.statSync(targetPath).size };
    } else {
      // 提取音频
      if (mediaInfo.audioUrl) {
        const tempAudio = path.join(app.getPath('temp'), `jaygo-extract-audio-${Date.now()}`);
        await downloadMediaFile(mediaInfo.audioUrl, tempAudio, mediaInfo.headers);
        await extractAudioWithFfmpeg(FFMPEG_PATH, tempAudio, targetPath, 'mp3');
        fs.unlink(tempAudio, () => {});
        return { path: targetPath, size: fs.statSync(targetPath).size };
      } else if (mediaInfo.videoUrl) {
        const tempVideo = path.join(app.getPath('temp'), `jaygo-extract-vid-${Date.now()}.mp4`);
        await downloadMediaFile(mediaInfo.videoUrl, tempVideo, mediaInfo.headers);
        await extractAudioWithFfmpeg(FFMPEG_PATH, tempVideo, targetPath, 'mp3');
        fs.unlink(tempVideo, () => {});
        return { path: targetPath, size: fs.statSync(targetPath).size };
      } else {
        throw new Error('未解析出可用的音频或视频流');
      }
    }
  }
);

ipcMain.handle('extract-media-for-transcribe', async (e, args: { mediaInfo: ParsedMediaInfo }) => {
  const { mediaInfo } = args;
  const safeTitle = (mediaInfo.title || 'transcribe').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const tempWav = path.join(app.getPath('temp'), `jaygo-asr-media-${Date.now()}.wav`);

  e.sender.send('transcribe-status', '正在下载并提取高质量原声音频…');

  if (mediaInfo.audioUrl) {
    const tempRaw = path.join(app.getPath('temp'), `jaygo-asr-raw-${Date.now()}`);
    await downloadMediaFile(mediaInfo.audioUrl, tempRaw, mediaInfo.headers);
    await extractAudioWithFfmpeg(FFMPEG_PATH, tempRaw, tempWav, 'wav');
    fs.unlink(tempRaw, () => {});
    return { filePath: tempWav, fileName: `${safeTitle}.wav` };
  } else if (mediaInfo.videoUrl) {
    const tempVideo = path.join(app.getPath('temp'), `jaygo-asr-vid-${Date.now()}.mp4`);
    await downloadMediaFile(mediaInfo.videoUrl, tempVideo, mediaInfo.headers);
    await extractAudioWithFfmpeg(FFMPEG_PATH, tempVideo, tempWav, 'wav');
    fs.unlink(tempVideo, () => {});
    return { filePath: tempWav, fileName: `${safeTitle}.wav` };
  } else {
    throw new Error('该链接未解析出可用的音视频媒体流');
  }
});

ipcMain.handle('showItemInFolder', (_e, filePath: string) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('transcribe', async (e, args: { filePath: string; enableSpeakerInfo: boolean }) => {
  const key = getApiKey();
  const { filePath, enableSpeakerInfo } = args;
  if (!fs.existsSync(filePath)) throw new Error('文件不存在：' + filePath);

  const audio = await resolveAudioForAsr(filePath);
  dbg(`[ASR prepare] src=${filePath} -> ${audio.localPath} format=${audio.format} codec=${audio.codec || '-'} size=${(fs.statSync(audio.localPath).size / 1024).toFixed(1)}KB`);
  e.sender.send('transcribe-status', '正在上传到云端临时存储…');
  const upload = await uploadAudioToOss(audio.localPath);
  try {
    const submitBody: any = {
      audio: { url: upload.url, format: audio.format },
      request: {
        model_name: 'bigmodel',
        enable_punc: true,
        enable_itn: true,
        enable_speaker_info: enableSpeakerInfo,
        show_utterances: true,
      },
    };
    if (audio.codec) submitBody.audio.codec = audio.codec;

    e.sender.send('transcribe-status', '已提交转录任务，等待识别…');
    // 用 Raw 变体拿原始 status/text，便于在「HTTP 200 + 空 body / 无 task_id」时定位真因
    const reqHeaders = {
      'X-Api-Key': key,
      'X-Api-Resource-Id': settings.asrResourceId || 'volc.seedasr.auc',
      'X-Api-Request-Id': uuid(),
      'X-Api-Sequence': '-1',
    };
    dbg(`[ASR submit] headers=${JSON.stringify(reqHeaders)} body=${JSON.stringify(submitBody)}`);
    // 用 netPost 拿到「原始响应头」：火山把成败放在 X-Api-Status-Code 里，body 常常是字面 {}
    let submit: { status: number; headers: Record<string, string>; text: string };
    try {
      submit = await netPost(ASR_SUBMIT, reqHeaders, submitBody);
    } catch (e: any) {
      dbg('[ASR submit] http error: ' + (e?.stack || e));
      throw e;
    }
    const subCode = String(submit.headers['x-api-status-code'] || '');
    const subMsg = submit.headers['x-api-message'] || '';
    dbg(`[ASR submit] http=${submit.status} code=${subCode || '-'} msg=${subMsg || '-'} body=${submit.text.slice(0, 500)}`);

    // 提交阶段的错误码（45000001 参数无效等）必须拦下来，否则会拿一个不存在的任务 ID 空转 15 分钟
    if (subCode && subCode !== '20000000' && subCode !== '20000001' && subCode !== '20000002') {
      throw new Error(`提交转录任务失败（${subCode} ${ASR_STATUS_TEXT[subCode] || subMsg || '未知错误'}）`);
    }
    if (submit.status >= 400 && !subCode) {
      throw new Error(`提交转录任务失败（HTTP ${submit.status}）：${submit.text.slice(0, 200)}`);
    }

    // 火山 ASR 大模型（bigmodel）实测坑：提交成功响应常常是字面 `{}`，
    // 任务 ID 不在 body 里 —— 任务标识就是我们自己发的 X-Api-Request-Id UUID，
    // 后面轮询也用同一个 UUID（pollAsr 已把它当作 X-Api-Request-Id 发出去）。
    // 优先取 body 里的 task_id（部分账户/变体官方文档示例中有），回退用 header UUID，
    // 这样无论响应是 `{}` 还是带 task_id，都能正确进入轮询。
    let submitJson: any = {};
    try {
      submitJson = JSON.parse(submit.text || '{}');
    } catch {}
    const taskId = submitJson?.task_id || reqHeaders['X-Api-Request-Id'];

    const result = await pollAsr(taskId, key, e);
    return { ...result, url: upload.url };
  } finally {
    // 无论成功失败，都清理 OSS 临时文件与本地临时音频
    await deleteOssObject(upload.key);
    if (audio.isTemp) {
      try { fs.unlinkSync(audio.localPath); } catch { /* ignore */ }
    }
  }
});

// ============================================================
// 账户余额查询（火山费用中心 QueryBalanceAcct，AK/SK 签名）
// ============================================================

function sha256hex(s: string | Buffer): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function hmacHex(key: string | Buffer, s: string): Buffer {
  return crypto.createHmac('sha256', key).update(s, 'utf8').digest();
}
function uriEscape(s: string): string {
  return encodeURIComponent(s)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}
function volcXDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// 火山 OpenAPI V4 签名（HMAC-SHA256，无 VOLC 前缀）
function signVolcRequest(p: {
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}): { queryString: string; headers: Record<string, string> } {
  const datetime = volcXDate();
  const date = datetime.slice(0, 8);

  const sortedKeys = Object.keys(p.query).sort();
  const canonicalQuery = sortedKeys.map((k) => `${uriEscape(k)}=${uriEscape(p.query[k])}`).join('&');

  const canonicalHeaders = `host:${p.host}\n` + `x-date:${datetime}\n`;
  const signedHeaders = 'host;x-date';
  const payloadHash = sha256hex('');

  const canonicalRequest = [
    p.method.toUpperCase(),
    p.path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${date}/${p.region}/${p.service}/request`;
  const stringToSign = ['HMAC-SHA256', datetime, credentialScope, sha256hex(canonicalRequest)].join('\n');

  const kDate = hmacHex(p.secretAccessKey, date);
  const kRegion = hmacHex(kDate, p.region);
  const kService = hmacHex(kRegion, p.service);
  const kSigning = hmacHex(kService, 'request');
  const signature = hmacHex(kSigning, stringToSign).toString('hex');

  const authorization =
    `HMAC-SHA256 Credential=${p.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    queryString: canonicalQuery,
    headers: {
      'X-Date': datetime,
      Authorization: authorization,
      // 注意：fetch 会自动带上 Host，这里不要把 Host 作为真实请求头（否则 undici 报错）
    },
  };
}

ipcMain.handle('getBalance', async () => {
  const { volcAccessKeyId, volcSecretKey } = settings;
  if (!volcAccessKeyId || !volcSecretKey) return null;
  try {
    const signed = signVolcRequest({
      method: 'GET',
      host: 'billing.volcengineapi.com',
      path: '/',
      query: { Action: 'QueryBalanceAcct', Version: '2022-01-01' },
      accessKeyId: volcAccessKeyId,
      secretAccessKey: volcSecretKey,
      region: 'cn-beijing',
      service: 'billing',
    });
    const res = await fetch(`https://billing.volcengineapi.com/?${signed.queryString}`, {
      method: 'GET',
      headers: signed.headers,
    });
    const json: any = await res.json().catch(() => ({}));
    if (json?.Result) {
      const r = json.Result;
      const num = (v: any) => (v == null ? 0 : Number(v));
      return {
        available: num(r.AvailableBalance),
        cash: num(r.CashBalance),
        arrears: num(r.ArrearsBalance),
        freeze: num(r.FreezeAmount),
        fetchedAt: Date.now(),
      };
    }
    if (json?.ResponseMetadata?.Error) {
      throw new Error('查询余额失败：' + (json.ResponseMetadata.Error.Message || json.ResponseMetadata.Error.Code || '未知错误'));
    }
    return null;
  } catch (err: any) {
    dbg('getBalance error: ' + (err?.stack || err));
    return null; // 查询失败不阻塞界面，余额区显示「—」
  }
});

// ============================================================
// 在线更新（electron-updater generic provider，自家服务器托管）
// 未设置 publisherName → 不强制 Authenticode，未签名安装包可自动更新；
// 完整性由下载文件 SHA512 与 latest.yml 比对保证（HTTPS 传输）。
// ============================================================
function broadcastUpdate(payload: any) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update-event', payload);
  }
}

function initAutoUpdater() {
  const defaultYml = path.join(process.resourcesPath, 'app-update.yml');
  const yamlContent = `provider: generic\nurl: ${APP_CONFIG.updateFeedUrl}\nupdaterCacheDirName: jaygo-au-updater\n`;

  if (!fs.existsSync(defaultYml)) {
    try {
      fs.writeFileSync(defaultYml, yamlContent, 'utf-8');
      dbg('自动修复写入 resources/app-update.yml 成功');
    } catch (e: any) {
      dbg('写入 resources/app-update.yml 受权限限制，转用 userData: ' + (e?.message || e));
      try {
        const fallbackYml = path.join(app.getPath('userData'), 'app-update.yml');
        fs.writeFileSync(fallbackYml, yamlContent, 'utf-8');
        autoUpdater.updateConfigPath = fallbackYml;
        dbg('自动修复设置 autoUpdater.updateConfigPath=' + fallbackYml);
      } catch (err: any) {
        dbg('自动修复 app-update.yml 彻底失败: ' + (err?.message || err));
      }
    }
  }

  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: APP_CONFIG.updateFeedUrl });
  } catch (e: any) {
    dbg('setFeedURL error: ' + (e?.stack || e));
  }
  autoUpdater.autoDownload = false;          // 由用户手动触发下载
  autoUpdater.autoRunAppAfterInstall = true;  // 安装后自动重新打开

  autoUpdater.on('checking-for-update', () => broadcastUpdate({ type: 'checking' }));
  autoUpdater.on('update-available', (info: any) =>
    broadcastUpdate({ type: 'available', version: info?.version, releaseNotes: info?.releaseNotes }));
  autoUpdater.on('update-not-available', (info: any) =>
    broadcastUpdate({ type: 'not-available', version: info?.version }));
  autoUpdater.on('update-downloaded', (info: any) =>
    broadcastUpdate({ type: 'downloaded', version: info?.version }));
  autoUpdater.on('download-progress', (p: any) =>
    broadcastUpdate({ type: 'progress', percent: p?.percent ?? 0 }));
  autoUpdater.on('error', (err: any) =>
    broadcastUpdate({ type: 'error', message: err?.message || String(err) }));

  dbg('autoUpdater 初始化完成，feed=' + APP_CONFIG.updateFeedUrl);
}

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('check-updates', async () => {
  try {
    const defaultYml = path.join(process.resourcesPath, 'app-update.yml');
    if (!fs.existsSync(defaultYml)) {
      const fallbackYml = path.join(app.getPath('userData'), 'app-update.yml');
      if (!fs.existsSync(fallbackYml)) {
        fs.writeFileSync(
          fallbackYml,
          `provider: generic\nurl: ${APP_CONFIG.updateFeedUrl}\nupdaterCacheDirName: jaygo-au-updater\n`,
          'utf-8'
        );
      }
      autoUpdater.updateConfigPath = fallbackYml;
    }
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('quit-install-update', () => {
  // 静默安装并重新打开（NSIS /S + 自动重启）
  autoUpdater.quitAndInstall(true, true);
  return { ok: true };
});

// ============================================================
// 蝉镜开放平台（数字人视频生成）
// ============================================================

let cjTokenCache: { token: string; expiresAt: number } | null = null;
let cjTokenPromise: Promise<string> | null = null;

async function getChanJingToken(forceRefresh = false): Promise<string> {
  const appId = settings.chanjingAppId?.trim();
  const secretKey = settings.chanjingSecretKey?.trim();
  if (!appId || !secretKey) {
    throw new Error('未配置蝉镜开放平台凭证，请先在「设置」中填写 App ID 和 Secret Key');
  }

  const now = Date.now();
  if (!forceRefresh && cjTokenCache && cjTokenCache.expiresAt > now + 60 * 1000) {
    return cjTokenCache.token;
  }

  // 如果当前已有在途的换票请求，直接复用该 Promise，防止并发请求互相踩踏导致旧 Token 被服务端吊销 (10400)
  if (cjTokenPromise) {
    return cjTokenPromise;
  }

  cjTokenPromise = (async () => {
    try {
      dbg(`[ChanJing Auth] 请求 access_token: appId=${appId.slice(0, 6)}... (forceRefresh=${forceRefresh})`);
      const res = await fetch('https://open-api.chanjing.cc/open/v1/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, secret_key: secretKey }),
      });

      const json: any = await res.json().catch(() => ({}));
      if (json.code !== 0 || !json.data?.access_token) {
        throw new Error(`获取蝉镜 AccessToken 失败（code ${json.code || res.status}）：${json.msg || '凭证无效，请检查 App ID 与 Secret Key'}`);
      }

      const token = json.data.access_token;
      let expiresAt = Date.now() + 23 * 3600 * 1000;
      if (typeof json.data.expire_in === 'number') {
        if (json.data.expire_in > 1000000000) {
          expiresAt = json.data.expire_in * 1000;
        } else {
          expiresAt = Date.now() + json.data.expire_in * 1000;
        }
      }

      cjTokenCache = { token, expiresAt };
      dbg(`[ChanJing Auth] 鉴权成功，token 有效期至: ${new Date(expiresAt).toLocaleTimeString()}`);
      return token;
    } finally {
      cjTokenPromise = null;
    }
  })();

  return cjTokenPromise;
}

// 统一封装蝉镜 API 请求器：自动附带 access_token，并在遇到 10400 或 401 时自动强制换票重试 1 次
async function chanjingFetch(url: string, init: RequestInit = {}): Promise<{ res: Response; json: any }> {
  let token = await getChanJingToken();
  const buildHeaders = (t: string) => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      access_token: t,
    };
    if (init.headers) {
      Object.assign(h, init.headers);
    }
    return h;
  };

  let res = await fetch(url, { ...init, headers: buildHeaders(token) });
  let json: any = await res.json().catch(() => ({}));

  // 如果遇到 10400 (AccessToken验证失败) 或 HTTP 401，尝试强制刷新 token 一次并重试
  if (json.code === 10400 || res.status === 401) {
    dbg(`[ChanJing] 检测到 AccessToken 失效 (code: ${json.code})，正在重新换取 token 并重试...`);
    token = await getChanJingToken(true);
    res = await fetch(url, { ...init, headers: buildHeaders(token) });
    json = await res.json().catch(() => ({}));
  }

  return { res, json };
}

ipcMain.handle('chanjing-auth', async () => {
  try {
    const token = await getChanJingToken(true);
    return { ok: true, message: '认证成功', accessToken: token.slice(0, 8) + '...' };
  } catch (e: any) {
    return { ok: false, message: e?.message || '认证失败' };
  }
});

ipcMain.handle('chanjing-list-avatars', async (_e, args?: { page?: number; size?: number }) => {
  const page = args?.page || 1;
  const size = args?.size || 50;
  dbg(`[ChanJing] 拉取公共形象库: page=${page} size=${size}`);
  const { res, json } = await chanjingFetch(`https://open-api.chanjing.cc/open/v1/list_common_dp?page=${page}&size=${size}`, {
    method: 'GET',
  });
  if (json.code !== 0) {
    throw new Error(json.msg || `拉取公共数字人形象失败（${json.code || res.status}）`);
  }
  return {
    list: json.data?.list || [],
    total: json.data?.page_info?.total_count || 0,
  };
});

ipcMain.handle('chanjing-list-custom-avatars', async () => {
  dbg('[ChanJing] 拉取用户定制数字人形象列表 (source 0 & 1)');

  const fetchBySource = async (source: 0 | 1) => {
    try {
      const { json } = await chanjingFetch('https://open-api.chanjing.cc/open/v1/list_customised_person', {
        method: 'POST',
        body: JSON.stringify({ page: 1, page_size: 50, source }),
      });
      if (json.code === 0 && Array.isArray(json.data?.list)) {
        return json.data.list.map((item: any) => {
          // 蝉镜 status 状态码说明：
          // 2: 制作完成/已就绪 (可直接驱动生成视频)
          // 1: 制作中/训练中
          // 0: 排队中
          // 3 / -1: 制作失败
          // progress: 进度 0-100，100 表示完成
          const rawStatus = Number(item.status);
          const progress = typeof item.progress === 'number' ? item.progress : (rawStatus === 2 ? 100 : 0);
          const isReady = rawStatus === 2 || progress >= 100;
          return {
            id: String(item.id || item.person_id || ''),
            name: item.name || '专属克隆形象',
            pic_url: item.pic_url || item.cover || item.avatar || '',
            preview_url: item.preview_url,
            audio_man_id: item.audio_man_id,
            status: isReady ? 2 : (rawStatus || 1),
            progress,
            is_ready: isReady,
            source,
            support_4k: Boolean(item.support_4k),
            create_time: item.create_time,
          };
        });
      }
    } catch (err: any) {
      dbg(`[ChanJing] 拉取定制形象 source=${source} 失败: ${err?.message}`);
    }
    return [];
  };

  // 分别获取 API定制 (0) 与 蝉镜主站定制 (1)
  const [list0, list1] = await Promise.all([fetchBySource(0), fetchBySource(1)]);

  // 当用户在主站已有克隆形象时，过滤 source: 0 中平台默认返回的测试样例模特（如“晓洁”）
  // 防止官方模特混入专属克隆形象中导致排版错乱与串行
  const realList0 = list0.filter((item: any) => {
    if (list1.length > 0 && (item.name === '晓洁' || item.id === 'xiaojie')) {
      return false;
    }
    return true;
  });

  // 主站克隆形象 (source: 1) 优先展示在前
  const map = new Map<string, any>();
  for (const item of [...list1, ...realList0]) {
    if (item.id && !map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
});

ipcMain.handle('chanjing-get-font-list', async () => {
  dbg('[ChanJing] 获取字体列表');
  const { res, json } = await chanjingFetch('https://open-api.chanjing.cc/open/v1/font_list', {
    method: 'GET',
  });
  if (json.code !== 0) {
    throw new Error(json.msg || `获取字体列表失败（code ${json.code || res.status}）`);
  }
  return json.data || [];
});

ipcMain.handle('chanjing-create-video', async (_e, params: any) => {
  const {
    personId,
    figureType = 'whole_body',
    isCustom = false,
    source,
    driveType = 'tts',
    text = '',
    speed = 1.0,
    audioMan,
    wavUrl,
    aspectRatio = '9:16',
    model = 0,
    showSubtitle = true,
    subtitleConfig,
  } = params;

  const isVertical = aspectRatio === '9:16';
  const screen_width = isVertical ? 1080 : 1920;
  const screen_height = isVertical ? 1920 : 1080;

  const personConfig: any = {
    id: personId,
    x: 0,
    y: 0,
    width: screen_width,
    height: screen_height,
    drive_mode: 'random',
  };
  // 仅公共模特传递 figure_type，定制形象不需要传
  if (!isCustom && figureType) {
    personConfig.figure_type = figureType;
  }

  const body: any = {
    person: personConfig,
    audio: {
      type: driveType,
      volume: 100, // 必传：默认 100。若缺省则会被开放平台服务端解析为 0 导致渲染出静音无声的视频！
      language: 'cn',
    },
    screen_width,
    screen_height,
    model: Number(model) || 0,
    add_compliance_watermark: true,
  };

  // 定制数字人如果来自主站，传入 source: 1
  if (isCustom && source === 1) {
    body.source = 1;
  }

  if (driveType === 'tts') {
    if (!text || !text.trim()) {
      throw new Error('请输入数字人播报文案');
    }
    // 确定音色 ID：若形象本身绑定了音色则使用之；若未绑定（如仅形象定制），使用官方经典真人音色保底
    const DEFAULT_AUDIO_MAN = 'C-CASE-d8dfe5838e774124b04e0ad41c194847';
    const effectiveAudioMan = audioMan?.trim() || DEFAULT_AUDIO_MAN;

    body.audio.tts = {
      text: [text.trim()],
      speed: Math.max(0.5, Math.min(2.0, Number(speed) || 1.0)),
      audio_man: effectiveAudioMan,
    };
    body.audio.type = 'tts';
    body.audio.wav_url = '';

    // 蝉镜开放平台规范：如果使用的是主站个人定制音色（source=1），创建视频任务时必须传顶层参数 audio_source = 1
    // 如果是官方兜底音色（API 渠道）或官方模特音色，则保持 audio_source 为 0
    if (isCustom && source === 1 && effectiveAudioMan === audioMan?.trim()) {
      body.audio_source = 1;
    }
  } else {
    if (!wavUrl || !wavUrl.trim()) {
      throw new Error('请提供驱动数字人的音频 URL 地址');
    }
    body.audio.wav_url = wavUrl.trim();
    body.audio.type = 'audio';
  }

  const isSubShow = showSubtitle && subtitleConfig?.show !== false;
  if (isSubShow) {
    body.subtitle_config = {
      show: true,
      font_id: subtitleConfig?.fontId || undefined,
      font_size: subtitleConfig?.fontSize || (isVertical ? 64 : 52),
      color: subtitleConfig?.color || '#FFFFFF',
      stroke_color: subtitleConfig?.strokeColor || '#000000',
      stroke_width: subtitleConfig?.strokeWidth ?? 3,
      x: isVertical ? 31 : 60,
      y: isVertical ? 1521 : 880,
      width: isVertical ? 1000 : 1800,
      height: 200,
    };
  } else {
    body.hide_subtitle = true;
  }

  dbg('[ChanJing create_video] payload: ' + JSON.stringify(body));

  const { res, json } = await chanjingFetch('https://open-api.chanjing.cc/open/v1/create_video', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (json.code !== 0 || !json.data) {
    throw new Error(`创建视频合成任务失败（code ${json.code || res.status}）：${json.msg || '参数错误或余额不足'}`);
  }

  dbg('[ChanJing create_video] 成功创建任务 ID: ' + json.data);
  return { videoId: json.data };
});

ipcMain.handle('chanjing-query-video', async (_e, id: string) => {
  const { res, json } = await chanjingFetch(`https://open-api.chanjing.cc/open/v1/video?id=${encodeURIComponent(id)}`, {
    method: 'GET',
  });
  if (json.code !== 0) {
    throw new Error(json.msg || `查询视频状态失败（code ${json.code || res.status}）`);
  }
  return json.data;
});

ipcMain.handle('chanjing-list-videos', async (_e, args?: { page?: number; size?: number }) => {
  const page = args?.page || 1;
  const page_size = args?.size || 20;
  const { res, json } = await chanjingFetch('https://open-api.chanjing.cc/open/v1/video_list', {
    method: 'POST',
    body: JSON.stringify({ page, page_size }),
  });
  if (json.code !== 0) {
    throw new Error(json.msg || `拉取视频列表失败（code ${json.code || res.status}）`);
  }
  return {
    list: json.data?.List || [],
    total: json.data?.PageInfo?.total_count || 0,
  };
});

ipcMain.handle('chanjing-delete-video', async (_e, id: string) => {
  if (!id) {
    throw new Error('缺少要删除的视频任务 ID');
  }
  dbg(`[ChanJing] 删除视频任务: ${id}`);
  const { res, json } = await chanjingFetch('https://open-api.chanjing.cc/open/v1/delete_video', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  if (json.code !== 0) {
    throw new Error(json.msg || `删除视频失败（code ${json.code || res.status}）`);
  }
  return true;
});

ipcMain.handle('chanjing-download-video', async (_e, args: { url: string; defaultName?: string }) => {
  const { url, defaultName } = args;
  const saveRes = await dialog.showSaveDialog({
    title: '保存数字人视频',
    defaultPath: path.join(app.getPath('downloads'), defaultName || `chanjing_avatar_${Date.now()}.mp4`),
    filters: [{ name: 'MP4 视频文件', extensions: ['mp4'] }],
  });
  if (saveRes.canceled || !saveRes.filePath) {
    return { canceled: true };
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载视频文件失败（HTTP ${res.status}）`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(saveRes.filePath, Buffer.from(arrayBuffer));
  return { canceled: false, filePath: saveRes.filePath };
});

ipcMain.handle('chanjing-upload-temp-audio', async (_e, args: { localPath: string }) => {
  if (!args?.localPath || !fs.existsSync(args.localPath)) {
    throw new Error('未找到指定的本地音频文件');
  }
  dbg(`[ChanJing] 准备标准化并上传驱动音频: ${args.localPath}`);
  // 蝉镜开放平台严格规范：音频格式以 16000Hz 单声道 WAV 最优，且 URL 后缀必须带有文件扩展名（.wav）
  const tempWav = path.join(app.getPath('temp'), `chanjing-drive-${crypto.randomBytes(6).toString('hex')}.wav`);
  try {
    // 统一通过 ffmpeg 标准化转码为 16000Hz 单声道 16-bit PCM WAV，确保开放平台唇形算法与字幕打轴 100% 成功解析
    await extractAudio(args.localPath, tempWav);
    const res = await uploadAudioToOss(tempWav, 'wav');
    let finalUrl = res.url;
    try {
      const u = new URL(finalUrl);
      if (!u.pathname.endsWith('.wav')) {
        u.pathname = u.pathname + '.wav';
        finalUrl = u.toString();
      }
    } catch {}
    dbg(`[ChanJing] 驱动音频处理完成并上传，URL: ${finalUrl}`);
    return { url: finalUrl, key: res.key };
  } finally {
    if (fs.existsSync(tempWav)) {
      try { fs.unlinkSync(tempWav); } catch {}
    }
  }
});

ipcMain.handle('chanjing-delete-temp-audio', async (_e, args: { key: string }) => {
  if (!args?.key) return false;
  dbg(`[ChanJing] 任务结束，删除 OSS 临时音频: ${args.key}`);
  await deleteOssObject(args.key);
  return true;
});

ipcMain.handle('refresh-desktop-icon-cache', async (_e, args?: { deep?: boolean }) => {
  try {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Jaygo AU.lnk');
    const exePath = app.getPath('exe');

    // 1. 如果桌面快捷方式存在，更新其 IconLocation 和修改时间
    if (fs.existsSync(shortcutPath)) {
      try {
        const script = `
          $sh = New-Object -ComObject WScript.Shell
          $sc = $sh.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
          $sc.TargetPath = '${exePath.replace(/'/g, "''")}'
          $sc.WorkingDirectory = '${path.dirname(exePath).replace(/'/g, "''")}'
          $sc.IconLocation = '${exePath.replace(/'/g, "''")},0'
          $sc.Save()
          (Get-Item '${shortcutPath.replace(/'/g, "''")}').LastWriteTime = Get-Date
        `;
        child_process.execSync(`powershell -NoProfile -Command "${script.replace(/\r?\n/g, ' ')}"`, { windowsHide: true });
      } catch (err) {
        dbg(`[IconCache] 更新快捷方式失败: ${err}`);
      }
    }

    // 2. Win32 SHChangeNotify 广播图标缓存变更
    try {
      const notifyScript = `
        $code = @'
        using System;
        using System.Runtime.InteropServices;
        public class WinShell {
            [DllImport("shell32.dll")]
            public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
        }
'@
        Add-Type -TypeDefinition $code
        [WinShell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
      `;
      child_process.execSync(`powershell -NoProfile -Command "${notifyScript.replace(/\r?\n/g, ' ')}"`, { windowsHide: true });
    } catch (err) {
      dbg(`[IconCache] SHChangeNotify 失败: ${err}`);
    }

    // 3. 执行 ie4uinit.exe -show
    try {
      child_process.exec('ie4uinit.exe -show', { windowsHide: true });
    } catch {
      /* ignore */
    }

    // 4. 如果用户请求深度清理
    if (args?.deep) {
      try {
        const deepScript = `
          Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
          Start-Sleep -Milliseconds 500
          Remove-Item -Path "$env:LOCALAPPDATA\\IconCache.db" -Force -ErrorAction SilentlyContinue
          Remove-Item -Path "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache*" -Force -ErrorAction SilentlyContinue
          if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) {
              Start-Process explorer
          }
        `;
        child_process.exec(`powershell -NoProfile -Command "${deepScript.replace(/\r?\n/g, ' ')}"`, { windowsHide: true });
        return { ok: true, message: '已执行深度清理并重启资源管理器，桌面图标已全面刷新！' };
      } catch (err: any) {
        return { ok: false, message: `深度刷新失败: ${err?.message}` };
      }
    }

    return { ok: true, message: '桌面图标缓存刷新指令已发送！' };
  } catch (e: any) {
    return { ok: false, message: e?.message || '刷新失败' };
  }
});


