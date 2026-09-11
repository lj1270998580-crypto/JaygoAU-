import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, net, Tray, Menu, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as child_process from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { extractMedia, downloadMediaFile, extractAudioWithFfmpeg, mergeVideoAndAudioWithFfmpeg, PC_UA, type ParsedMediaInfo } from './mediaExtractor';

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
  modelHubSettings?: any;
  customSkills?: any[];
  workflowProjects?: any[];
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

/**
 * v0.7.16：AI 配图「历史作品」持久化。
 *
 * 此前配图工作台是纯内存状态：一旦点「重置」或关掉应用，已经规划好的分镜、
 * 生成好的插图、调好的位置与边框全部丢失，用户只能重头再来一遍（而重新规划
 * 一次要跑好几分钟的大模型请求）。
 *
 * 生成出来的图片本身已经落在 userData/illustrations/ 下，是持久的，
 * 所以历史记录只需要保存元数据 + 文件路径即可，不需要复制图片。
 */
const historyPath = () => path.join(app.getPath('userData'), 'jaygo-illustration-history.json');
const HISTORY_LIMIT = 30;

ipcMain.handle('load-illustration-history', async () => {
  try {
    if (!fs.existsSync(historyPath())) return { ok: true, records: [] };
    const raw = fs.readFileSync(historyPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed) ? parsed : [];
    return { ok: true, records };
  } catch (err: any) {
    return { ok: false, records: [], error: err?.message || String(err) };
  }
});

ipcMain.handle('save-illustration-history', async (_, records: unknown) => {
  try {
    const list = Array.isArray(records) ? records.slice(0, HISTORY_LIMIT) : [];
    // 先写临时文件再改名，避免写一半断电导致整个历史文件损坏
    const tmp = `${historyPath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tmp, historyPath());
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
});

/** 删除某条历史；同时清理它独占的插图文件（同一文件被其他记录引用时保留） */
ipcMain.handle('delete-illustration-history', async (_, args: { id: string; records: unknown[] }) => {
  try {
    const list = Array.isArray(args?.records) ? args.records.slice(0, HISTORY_LIMIT) : [];
    fs.writeFileSync(historyPath(), JSON.stringify(list, null, 2), 'utf-8');

    const removed = (Array.isArray((args as any)?.removedPaths) ? (args as any).removedPaths : []) as string[];
    const stillUsed = new Set<string>();
    for (const rec of list as any[]) {
      for (const it of rec?.illustrations || []) {
        if (it?.localPath) stillUsed.add(String(it.localPath));
      }
    }
    for (const p of removed) {
      if (stillUsed.has(p)) continue;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* 文件被占用或已删除，忽略 */
      }
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
});

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
    words: Array.isArray(u?.words)
      ? u.words.map((w: any) => ({
          text: typeof w?.text === 'string' ? w.text : '',
          startTime: Number(w?.start_time) || 0,
          endTime: Number(w?.end_time) || 0,
        }))
      : undefined,
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
    path.join(path.dirname(process.execPath), 'icon.ico'),
    path.join(__dirname, 'icon.ico'),
    path.join(process.resourcesPath, 'build', 'icon.ico'),
    path.join(process.resourcesPath, 'icon.ico'),
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
  const iconPath = getAppIconPath();
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: 'Jaygo AU',
    icon: iconPath,
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

  // 配置全局网络请求头，允许渲染进程直接播放抖音、B站等防盗链媒体与封面
  try {
    const { session } = require('electron');
    session.defaultSession.webRequest.onBeforeSendHeaders((details: any, callback: any) => {
      const u = details.url || '';
      if (u.includes('douyinvod.com') || u.includes('douyinpic.com') || u.includes('douyin.com')) {
        details.requestHeaders['Referer'] = 'https://www.douyin.com/';
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      } else if (u.includes('bilibili.com') || u.includes('hdslb.com') || u.includes('bilivideo.com')) {
        details.requestHeaders['Referer'] = 'https://www.bilibili.com/';
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      } else if (u.includes('xhscdn.com') || u.includes('xiaohongshu.com')) {
        details.requestHeaders['Referer'] = 'https://www.xiaohongshu.com/';
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      } else if (u.includes('kwaicdn.com') || u.includes('kuaishou.com') || u.includes('yximgs.com') || u.includes('kwimgs.com') || u.includes('kuaishouzt.com') || u.includes('oskwai.com')) {
        details.requestHeaders['Referer'] = 'https://www.kuaishou.com/';
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      }
      callback({ requestHeaders: details.requestHeaders });
    });
  } catch (err) {
    dbg('[webRequest] onBeforeSendHeaders 配置异常: ' + err);
  }

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

/**
 * 选择本地图片文件（v0.7.8 新增）
 * 用于「打点后上传自己的图片」：返回绝对路径，渲染层据此读取原始宽高比
 * 并直接以 file:// 显示（与模型生图同一套显示通道）。
 */
ipcMain.handle('pick-image-file', async () => {
  const r = await dialog.showOpenDialog({
    title: '选择要插入的图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});

ipcMain.handle(
  'download-extracted-media',
  async (
    e,
    args: {
      mediaInfo: ParsedMediaInfo;
      type: 'video' | 'audio';
      selectedResolutionId?: string;
      selectedVideoUrl?: string;
      selectedAudioUrl?: string;
    }
  ) => {
    const { mediaInfo, type, selectedResolutionId, selectedVideoUrl, selectedAudioUrl } = args;

    // 匹配用户选定的清晰度规格直链
    let chosenVideoUrl = selectedVideoUrl || mediaInfo.videoUrl;
    let chosenAudioUrl = selectedAudioUrl || mediaInfo.audioUrl;

    if (selectedResolutionId && mediaInfo.resolutions && mediaInfo.resolutions.length > 0) {
      const matchOpt = mediaInfo.resolutions.find((r) => r.id === selectedResolutionId);
      if (matchOpt) {
        if (matchOpt.videoUrl) chosenVideoUrl = matchOpt.videoUrl;
        if (matchOpt.audioUrl) chosenAudioUrl = matchOpt.audioUrl;
      }
    }

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
      if (!chosenVideoUrl) throw new Error('该作品未解析出有效视频流');

      // 若包含独立音频流（如抖音 DASH 模式），分别下载后自动用 FFmpeg 快速无损合并
      if (chosenAudioUrl && (chosenVideoUrl.includes('media-video') || mediaInfo.platform === 'douyin')) {
        const tempVideo = path.join(app.getPath('temp'), `jaygo-v-${Date.now()}.mp4`);
        const tempAudio = path.join(app.getPath('temp'), `jaygo-a-${Date.now()}.mp4`);
        try {
          await downloadMediaFile(chosenVideoUrl, tempVideo, mediaInfo.headers);
          await downloadMediaFile(chosenAudioUrl, tempAudio, mediaInfo.headers);
          await mergeVideoAndAudioWithFfmpeg(FFMPEG_PATH, tempVideo, tempAudio, targetPath);
          return { path: targetPath, size: fs.statSync(targetPath).size };
        } finally {
          fs.unlink(tempVideo, () => {});
          fs.unlink(tempAudio, () => {});
        }
      } else {
        await downloadMediaFile(chosenVideoUrl, targetPath, mediaInfo.headers);
        return { path: targetPath, size: fs.statSync(targetPath).size };
      }
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

ipcMain.handle('download-extracted-image', async (e, args: { imageUrl: string; defaultName?: string }) => {
  const { imageUrl, defaultName } = args;
  const safeName = (defaultName || `image_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
  const defaultPath = path.join(settings.outputDir || app.getPath('downloads'), `${safeName}.jpg`);

  const win = winOf(e) || mainWindow;
  const saveRes = await dialog.showSaveDialog(win!, {
    title: '保存高清无水印图片',
    defaultPath,
    filters: [{ name: '图片文件', extensions: ['jpg', 'png', 'webp'] }],
  });
  if (saveRes.canceled || !saveRes.filePath) return null;

  const isXhs = imageUrl.includes('xiaohongshu.com') || imageUrl.includes('xhscdn.com');
  const headers = {
    'User-Agent': PC_UA,
    'Referer': isXhs ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/',
  };

  await downloadMediaFile(imageUrl, saveRes.filePath, headers);
  return { path: saveRes.filePath, size: fs.statSync(saveRes.filePath).size };
});

ipcMain.handle('download-all-extracted-images', async (e, args: { images: string[]; title: string }) => {
  const { images, title } = args;
  if (!images || images.length === 0) throw new Error('没有可下载的图片');

  const win = winOf(e) || mainWindow;
  const openRes = await dialog.showOpenDialog(win!, {
    title: '选择保存全部图片的文件夹',
    defaultPath: settings.outputDir || app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (openRes.canceled || !openRes.filePaths?.[0]) return null;

  const baseDir = openRes.filePaths[0];
  const safeFolder = (title || `images_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const targetFolder = path.join(baseDir, safeFolder);
  fs.mkdirSync(targetFolder, { recursive: true });

  for (let i = 0; i < images.length; i++) {
    const imgUrl = images[i];
    const pad = String(i + 1).padStart(2, '0');
    const outPath = path.join(targetFolder, `${pad}.jpg`);
    const isXhs = imgUrl.includes('xiaohongshu.com') || imgUrl.includes('xhscdn.com');
    const headers = {
      'User-Agent': PC_UA,
      'Referer': isXhs ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/',
    };
    await downloadMediaFile(imgUrl, outPath, headers);
  }

  return { folderPath: targetFolder, count: images.length };
});

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

  let actualFilePath = filePath;
  let isTempDownloaded = false;
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    e.sender.send('transcribe-status', '正在缓存网络视频至本地…');
    actualFilePath = path.join(app.getPath('temp'), `jaygo-remote-asr-${Date.now()}.mp4`);
    await downloadMediaFile(filePath, actualFilePath);
    isTempDownloaded = true;
  } else if (!fs.existsSync(actualFilePath)) {
    throw new Error('文件不存在：' + actualFilePath);
  }

  let audio: { localPath: string; format: string; codec?: string; isTemp: boolean } | null = null;
  let uploadKey: string | null = null;
  try {
    audio = await resolveAudioForAsr(actualFilePath);
    dbg(`[ASR prepare] src=${actualFilePath} -> ${audio.localPath} format=${audio.format} codec=${audio.codec || '-'} size=${(fs.statSync(audio.localPath).size / 1024).toFixed(1)}KB`);
    e.sender.send('transcribe-status', '正在上传到云端临时存储…');
    const upload = await uploadAudioToOss(audio.localPath);
    uploadKey = upload.key;

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
    if (uploadKey) {
      await deleteOssObject(uploadKey);
    }
    if (audio?.isTemp) {
      try { fs.unlinkSync(audio.localPath); } catch { /* ignore */ }
    }
    if (isTempDownloaded) {
      try { fs.unlinkSync(actualFilePath); } catch { /* ignore */ }
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
    add_compliance_watermark: false,
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
    title: '保存数字人视频（已默认自动消除平台水印）',
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
  const rawBuffer = Buffer.from(arrayBuffer);

  // 默认静默去标：若本地具备 FFmpeg，则自动对数字人成片左上角执行智能 delogo 去水印
  if (FFMPEG_PATH && fs.existsSync(FFMPEG_PATH)) {
    const tempRaw = path.join(app.getPath('temp'), `raw-avatar-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp4`);
    try {
      fs.writeFileSync(tempRaw, rawBuffer);
      let W = 1080;
      let H = 1920;
      try {
        const dim = await new Promise<{ width: number; height: number }>((resolve) => {
          const p = spawn(FFMPEG_PATH, ['-i', tempRaw]);
          let err = '';
          p.stderr.on('data', (d) => (err += d.toString()));
          p.on('close', () => {
            const match = err.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);
            if (match) {
              resolve({ width: parseInt(match[1]), height: parseInt(match[2]) });
            } else {
              resolve({ width: 1080, height: 1920 });
            }
          });
        });
        W = dim.width;
        H = dim.height;
      } catch {}

      const isVertical = H > W;
      const delogoW = isVertical ? 180 : 230;
      const delogoH = isVertical ? 70 : 80;
      const delogoX = isVertical ? 20 : 28;
      const delogoY = isVertical ? 24 : 28;

      await new Promise<void>((resolve, reject) => {
        const p = spawn(FFMPEG_PATH, [
          '-y',
          '-i', tempRaw,
          '-vf', `delogo=x=${delogoX}:y=${delogoY}:w=${delogoW}:h=${delogoH}:show=0`,
          '-c:a', 'copy',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '18',
          saveRes.filePath!,
        ]);
        let err = '';
        p.stderr.on('data', (d) => (err += d.toString()));
        p.on('close', (code) => {
          if (code === 0 && fs.existsSync(saveRes.filePath!) && fs.statSync(saveRes.filePath!).size > 1000) {
            resolve();
          } else {
            // 若转码未产出，保底写入原流
            fs.writeFileSync(saveRes.filePath!, rawBuffer);
            resolve();
          }
        });
        p.on('error', () => {
          fs.writeFileSync(saveRes.filePath!, rawBuffer);
          resolve();
        });
      });
    } catch {
      fs.writeFileSync(saveRes.filePath, rawBuffer);
    } finally {
      if (fs.existsSync(tempRaw)) {
        try { fs.unlinkSync(tempRaw); } catch {}
      }
    }
  } else {
    fs.writeFileSync(saveRes.filePath, rawBuffer);
  }

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

// ---- 历史文章与多格式文档解析 (.txt, .md, .pdf, .docx, .json, .csv) ----
ipcMain.handle('parse-document-file', async (_event, filePath: string) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { ok: false, error: '文件不存在或路径无效' };
    }
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const stat = await fs.promises.stat(filePath);

    if (['.txt', '.md', '.json', '.csv', '.text'].includes(ext)) {
      const text = await fs.promises.readFile(filePath, 'utf-8');
      return { ok: true, name: fileName, path: filePath, size: stat.size, text };
    }

    if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return { ok: true, name: fileName, path: filePath, size: stat.size, text: result.value || '' };
    }

    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buffer = await fs.promises.readFile(filePath);
      const data = await pdfParse(buffer);
      return { ok: true, name: fileName, path: filePath, size: stat.size, text: data.text || '' };
    }

    return { ok: false, error: `暂不支持的文件格式: ${ext}，请上传 .txt, .md, .pdf 或 .docx` };
  } catch (err: any) {
    return { ok: false, error: err?.message || '文档解析失败' };
  }
});

ipcMain.handle('pick-document-files', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: '选择历史文章或爆款素材文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文档与文案资料 (*.txt, *.md, *.pdf, *.docx)', extensions: ['txt', 'md', 'pdf', 'docx', 'json', 'csv'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });

    if (res.canceled || res.filePaths.length === 0) {
      return [];
    }

    const results = [];
    for (const fp of res.filePaths) {
      try {
        const ext = path.extname(fp).toLowerCase();
        const fileName = path.basename(fp);
        const stat = await fs.promises.stat(fp);

        let text = '';
        if (['.txt', '.md', '.json', '.csv', '.text'].includes(ext)) {
          text = await fs.promises.readFile(fp, 'utf-8');
        } else if (ext === '.docx') {
          const mammoth = require('mammoth');
          const r = await mammoth.extractRawText({ path: fp });
          text = r.value || '';
        } else if (ext === '.pdf') {
          const pdfParse = require('pdf-parse');
          const buffer = await fs.promises.readFile(fp);
          const d = await pdfParse(buffer);
          text = d.text || '';
        }

        results.push({
          ok: true,
          name: fileName,
          path: fp,
          size: stat.size,
          text: text.trim(),
        });
      } catch (err: any) {
        results.push({
          ok: false,
          name: path.basename(fp),
          path: fp,
          size: 0,
          text: '',
          error: err?.message || '解析失败',
        });
      }
    }
    return results;
  } catch (err: any) {
    return [];
  }
});

// =========================================================================
// 商汤日日新 (SenseNova TokenPlan) & 智能视频配插图 IPC 接口
// =========================================================================

// 1. 测试商汤 TokenPlan API Key 连通性
ipcMain.handle('sensenova-test-key', async (_, args: { apiKey: string }) => {
  try {
    const key = (args.apiKey || '').trim();
    if (!key) return { ok: false, message: '请提供商汤日日新 TokenPlan API Key' };
    
    // 调用 SenseNova TokenPlan models 端点探测密匙有效性
    const res = await fetch('https://token.sensenova.cn/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 200) {
      return { ok: true, message: '✅ 商汤日日新 TokenPlan 验证成功，服务正常！' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `鉴权失败（HTTP ${res.status}）：API Key 无效或未开通权限` };
    }
    const resText = await res.text().catch(() => '');
    try {
      const j = JSON.parse(resText);
      if (j?.error?.message) {
        return { ok: false, message: `商汤提示：${j.error.message}` };
      }
    } catch {}
    // 非 401/403 状态说明连通正常
    return { ok: true, message: `✅ 商汤 TokenPlan 密匙连接正常（状态码 ${res.status}）` };
  } catch (err: any) {
    return { ok: false, message: `网络连接异常：${err?.message || '未知错误'}` };
  }
});

// 2. 调用商汤日日新生成插图 (文生图 & 图生图)
/**
 * 判断提示词中是否已经包含该风格的描述，避免同一段风格被重复注入两次。
 * 渲染层可能已通过 STYLE_OPTIONS.stylePrompt 或 StyleBible.visualMedium 写入风格文本。
 */
function isStyleAlreadyPresent(prompt: string, styleId: string, stylePhrase: string): boolean {
  if (prompt.includes(styleId)) return true;
  const head = stylePhrase.slice(0, 12);
  if (head && prompt.includes(head)) return true;
  // 以 4 字步长做 8 字片段比对，覆盖风格短语被改写或插入标点的情况
  for (let i = 0; i + 8 <= stylePhrase.length; i += 4) {
    if (prompt.includes(stylePhrase.slice(i, i + 8))) return true;
  }
  return false;
}

ipcMain.handle('sensenova-generate-image', async (_, args: {
  apiKey: string;
  model: string;
  prompt: string;
  /** v0.7.9：负向提示词，独立参数下发 */
  negativePrompt?: string;
  size?: string;
  style?: string;
  imageBase64?: string;
}) => {
  try {
    const key = (args.apiKey || '').trim();
    if (!key) throw new Error('未配置商汤日日新 TokenPlan API Key，请在设置中配置');
    const model = args.model || 'sensenova-u1-fast';
    let prompt = (args.prompt || '').trim();
    if (!prompt) throw new Error('提示词 prompt 不能为空');

    // 风格修饰词增强
    // v0.7.5 修复：原映射表的键（realistic / flat_vector / 3d_render / infographic_clean /
    // minimalist）与应用真实风格 ID 只有 2 个交集，导致 8/10 种风格的注入静默失效。
    // 现改为与渲染层 STYLE_OPTIONS 完全一致的 10 个真实 ID 与中文描述。
    if (args.style) {
      const stylePrompts: Record<string, string> = {
        modern_business: '现代商业扁平插画风格，现代办公场景与写实商务元素，干净利落线条，高级克制莫兰迪商务配色，优雅留白，画面主体清晰生动',
        colored_pencil: '细腻彩铅手绘插画风格，彩色铅笔质感排线与柔和颗粒叠色，笔触温润细腻，色调温馨，画面主体轮廓生动',
        classical_oil: '欧洲古典油画风格，厚重油画颜料笔触肌理，伦勃朗明暗对照光，庄重沉稳，古典艺术典雅质感',
        cinematic_real: '电影级商业写实摄影，真实自然侧光，细腻材质质感，浅景深虚化背景，主体清晰锐利',
        chinese_ink: '中国传统写意水墨画风格，宣纸微质感肌理，气韵生动，淡墨晕染与浓墨勾勒，东方美学留白，意境悠远',
        anime_cartoon: '精美现代日漫插画风格，干净平滑的描线，明快通透的赛璐璐上色，丰富生动的情绪张力，治愈系现代卡通质感',
        isometric_3d: '3D立体建模渲染，柔和立体环境光照，细腻材质与微光漫反射，空间景深真实生动',
        watercolor_book: '手绘清新水彩插画，水色自然渗透晕染，通透纯净，水彩纸纹理质感，温柔轻盈',
        minimal_line: '现代极简单线手绘艺术风格，优雅流畅的轮廓线条，极简留白构图，局部柔和纯色点缀，时尚艺术感',
        cyberpunk: '未来赛博朋克科技概念艺术，深邃暗色背景，霓虹蓝紫氛围光晕，全息光影质感，未来科幻张力',
        // v0.7.18 新增：信息图表风（专供信息图分支）
        infographic_clean: '现代专业信息图表设计，干净的网格对齐与清晰的视觉层级，克制的强调色，图形化表达取代写实描绘，平滑纯色块与精准几何描边',
        // v0.7.19 新增：对齐官方 sn-infographic 的 66 种风格
        'chinese-guochao': '新中式国潮视觉设计，传统东方纹样与当代平面构成结合，朱砂红石青描金配色，宣纸底纹与烫金线条',
        claymation: '黏土定格动画质感，手工捏塑的圆润造型与可见指痕肌理，柔和影棚打光，微缩场景构图',
        chalkboard: '黑板粉笔手绘教学风格，深墨绿板面与白色粉笔笔迹颗粒质感，板书式布局，重点用粉笔圈画强调',
        'swiss-style': '瑞士国际主义平面设计，严格网格系统与无衬线字体，大量理性留白，克制的黑白红配色，纯净平涂',
      };
      const stylePhrase = stylePrompts[args.style];
      // 重复注入防护：渲染层可能已把风格描述写进 prompt，避免同一段风格出现两次
      if (stylePhrase && !isStyleAlreadyPresent(prompt, args.style, stylePhrase)) {
        prompt = `${prompt}。${stylePhrase}`;
      }
    }

    // v0.7.5 修复：此处不再追加任何含「水印」字样的负向词。
    // 渲染层净化器（promptCompiler.sanitizePromptStrict）会主动剔除「无水印 / 去水印」等
    // 中文元词，因为生图模型会把这类词直接绘制成画面上的水印状伪影与乱码字；
    // 主进程若在净化之后再把「避免任何水印」追加回去，等于反向抵消，且几乎每张图都会中招。

    const isImg2Img = Boolean(args.imageBase64 && model === 'sensenova-u1.5-lite');
    // TokenPlan 官方生图与图生图端点
    const endpoint = isImg2Img
      ? 'https://token.sensenova.cn/v1/images/edits'
      : 'https://token.sensenova.cn/v1/images/generations';

    const reqBody: any = {
      model,
      prompt,
      size: args.size || '2048x2048',
      n: 1,
      watermark: false,
    };
    // v0.7.9：负向提示词改为独立参数下发。
    // 此前「禁止出现：三维塑料感、漂浮的乱码色块…」混在正向提示词里，
    // 这些词本身会被模型当成画面内容，反而加剧杂乱。
    const negativePrompt = (args.negativePrompt || '').trim();
    if (negativePrompt) {
      reqBody.negative_prompt = negativePrompt;
    }
    if (isImg2Img) {
      reqBody.image = args.imageBase64;
    }

    dbg(`[SenseNova] calling ${endpoint} model=${model} prompt="${prompt.slice(0, 60)}..."`);

    const doRequest = async (body: any) =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

    let res = await doRequest(reqBody);
    let resText = await res.text();

    // 兼容性兜底：若服务端不接受 negative_prompt 参数（4xx），去掉后重试一次，
    // 保证不会因为新增参数导致生图整体失败。
    if (!res.ok && res.status >= 400 && res.status < 500 && negativePrompt) {
      dbg(`[SenseNova] negative_prompt 被拒（HTTP ${res.status}），去掉该参数重试`);
      delete reqBody.negative_prompt;
      res = await doRequest(reqBody);
      resText = await res.text();
    }

    let json: any = {};
    try {
      json = JSON.parse(resText);
    } catch {
      throw new Error(`商汤接口响应解析失败（HTTP ${res.status}）：${resText.slice(0, 300)}`);
    }

    if (!res.ok) {
      const errMsg = json?.error?.message || json?.message || json?.msg || `商汤生图请求失败（HTTP ${res.status}）`;
      throw new Error(errMsg);
    }

    const imgUrl = json?.data?.[0]?.url || json?.data?.[0]?.image_url || json?.data?.url || json?.url || json?.image_url;
    const b64 = json?.data?.[0]?.b64_json || json?.data?.b64_json || json?.b64_json;
    if (!imgUrl && !b64) {
      throw new Error('商汤接口未返回有效图片 URL 或 Base64 数据');
    }

    // 将图片保存到本地缓存目录
    const illDir = path.join(app.getPath('userData'), 'illustrations');
    if (!fs.existsSync(illDir)) fs.mkdirSync(illDir, { recursive: true });
    const localFileName = `sn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
    const localPath = path.join(illDir, localFileName);

    if (b64) {
      fs.writeFileSync(localPath, Buffer.from(b64, 'base64'));
    } else if (imgUrl) {
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) throw new Error(`下载生成的图片失败（HTTP ${imgRes.status}）`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(localPath, buf);
    }

    dbg(`[SenseNova] image generated & saved to: ${localPath}`);
    return {
      ok: true,
      localPath,
      imageUrl: `file:///${localPath.replace(/\\/g, '/')}`,
      model,
      prompt,
    };
  } catch (err: any) {
    dbg(`[SenseNova] error: ${err?.message || err}`);
    return {
      ok: false,
      error: err?.message || '生成插图失败',
    };
  }
});

// 3. 使用 FFmpeg 将插图序列按时间轴合成到视频中并导出
/**
 * 叠加层预合成（v0.7.11）
 *
 * 背景：此前导出端完全没有实现圆角（rounded_card 连分支都没有），star_badge /
 * cyber_glow 也只是画了个纯色方框；而"缩放"动效受限于 ffmpeg overlay 滤镜
 * 要求输入尺寸恒定，无法逐帧改框大小。
 *
 * 思路：既然动画本来就要逐帧采样（预览与导出共用同一套数学），那就把
 * 圆角 / 星标 / 光晕 / 缩放全部在 Canvas 里一次性画好，输出**尺寸恒定**的 PNG：
 *   · fade / slide / none → 只需 1 帧
 *   · zoom               → 输出 N 帧（内容由小放大），作为图片序列喂给 ffmpeg
 * 这样预览怎么画、导出就怎么画，两边不会再分叉。
 */
function roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawStarPath(ctx: any, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** 生成叠加层帧序列，返回帧文件路径（按顺序）与画布尺寸 */
async function renderOverlayFrames(opts: {
  imagePath: string;
  borderStyle: string;
  boxWidth: number;
  scales: number[];
  tag: string;
}): Promise<{ paths: string[]; width: number; height: number; pad: number; innerWidth: number; innerHeight: number }> {
  // 延迟 require，避免未使用导出功能时加载原生模块
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createCanvas, loadImage } = require('@napi-rs/canvas');

  const img = await loadImage(opts.imagePath);
  const srcW = img.width || 1;
  const srcH = img.height || 1;
  const aspect = srcW / srcH;

  const boxW = Math.max(16, Math.round(opts.boxWidth / 2) * 2);
  const boxH = Math.max(16, Math.round(boxW / aspect / 2) * 2);

  const tmpDir = path.join(app.getPath('temp'), `jaygo-ovl-${opts.tag}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const radius = Math.round(Math.min(boxW, boxH) * 0.06);
  const borderW = Math.max(4, Math.round(Math.min(boxW, boxH) * 0.016));
  const scales = opts.scales.length > 0 ? opts.scales : [1];
  const paths: string[] = [];

  // v0.7.13 修复「导出只看到圆角、看不到边框」：
  // 此前画布尺寸恰好等于 boxW×boxH，图片铺满到边缘，而 stroke 是以路径为中心的
  // ——一半线宽落在画布之外被裁掉，cyber_glow 的外发光更是整圈被裁。
  // 现在画布四周各留 PAD，图片本身仍是 boxW×boxH（视觉尺寸不变），
  // 边框/光晕画在外扩区域，导出时把叠加层位置回退 PAD 像素即可。
  const PAD = Math.ceil(borderW * 2 + 16);
  const canvasW = boxW + PAD * 2;
  const canvasH = boxH + PAD * 2;

  scales.forEach((scale, fi) => {
    const canvas = createCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    const iw = Math.max(8, Math.round((boxW * scale) / 2) * 2);
    const ih = Math.max(8, Math.round((boxH * scale) / 2) * 2);
    const ix = Math.round((canvasW - iw) / 2);
    const iy = Math.round((canvasH - ih) / 2);
    const r = Math.max(2, Math.round(radius * scale));

    // 霓虹光晕：外扩若干圈递减透明度的描边
    if (opts.borderStyle === 'cyber_glow') {
      for (let g = 6; g >= 1; g--) {
        ctx.save();
        ctx.globalAlpha = (0.1 * (7 - g)) / 6;
        ctx.strokeStyle = '#6366F1';
        ctx.lineWidth = borderW + g * 3;
        roundRectPath(ctx, ix - g * 1.5, iy - g * 1.5, iw + g * 3, ih + g * 3, r + g * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 圆角裁剪后绘制图片
    ctx.save();
    roundRectPath(ctx, ix, iy, iw, ih, r);
    ctx.clip();
    ctx.drawImage(img, ix, iy, iw, ih);
    ctx.restore();

    // 边框：整条线宽画在图片矩形**之外**，图片本身不被压边，
    // 这样在视频上看就是一圈干净的外框（此前居中描边有一半被裁掉）。
    const bx = ix - borderW / 2;
    const by = iy - borderW / 2;
    const bw = iw + borderW;
    const bh = ih + borderW;
    const br = r + borderW / 2;
    if (opts.borderStyle === 'clean_white') {
      ctx.save();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = borderW;
      roundRectPath(ctx, bx, by, bw, bh, br);
      ctx.stroke();
      ctx.restore();
    } else if (opts.borderStyle === 'cyber_glow') {
      ctx.save();
      ctx.strokeStyle = '#818CF8';
      ctx.lineWidth = borderW;
      roundRectPath(ctx, bx, by, bw, bh, br);
      ctx.stroke();
      ctx.restore();
    } else if (opts.borderStyle === 'star_badge') {
      // v0.7.13：星标预设此前只画了星星、没画琥珀色外框（预合成后 ffmpeg 的
      // drawbox 又被跳过），导致导出效果与预览不符。
      ctx.save();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = borderW;
      roundRectPath(ctx, bx, by, bw, bh, br);
      ctx.stroke();
      ctx.restore();
    } else if (opts.borderStyle === 'rounded_card') {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = Math.max(1, Math.round(borderW / 2));
      roundRectPath(ctx, bx, by, bw, bh, br);
      ctx.stroke();
      ctx.restore();
    }

    // 顶部星标徽章
    if (opts.borderStyle === 'star_badge') {
      const cx = ix + iw / 2;
      const cy = iy + Math.max(7, borderW + 4);
      const outer = Math.max(8, Math.round(Math.min(iw, ih) * 0.06));
      ctx.save();
      ctx.fillStyle = '#F59E0B';
      drawStarPath(ctx, cx, cy, outer, outer * 0.45);
      ctx.fill();
      ctx.restore();
    }

    const out = path.join(tmpDir, `f${String(fi).padStart(3, '0')}.png`);
    fs.writeFileSync(out, canvas.encodeSync('png'));
    paths.push(out);
  });

  return { paths, width: canvasW, height: canvasH, pad: PAD, innerWidth: boxW, innerHeight: boxH };
}

ipcMain.handle(
  'prepare-overlay-frames',
  async (_e, args: { imagePath: string; borderStyle: string; boxWidth: number; mode: string }) => {
    const scales =
      args.mode === 'zoom' ? [0.82, 0.88, 0.93, 0.97, 1.0] : [1];
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const r = await renderOverlayFrames({
      imagePath: args.imagePath,
      borderStyle: args.borderStyle,
      boxWidth: args.boxWidth,
      scales,
      tag,
    });
    return {
      ok: true,
      framePaths: r.paths,
      // ffmpeg 图片序列输入需要 printf 形式路径
      framePattern: r.paths.length > 1 ? r.paths[0].replace(/f\d{3}\.png$/, 'f%03d.png') : null,
      width: r.width,
      height: r.height,
      pad: r.pad,
      innerWidth: r.innerWidth,
      innerHeight: r.innerHeight,
    };
  }
);

ipcMain.handle('export-video-with-overlays', async (event, args: {
  videoPath: string;
  outputPath?: string;
  removeOriginalWatermark?: boolean;
  overlays: Array<{
    imagePath: string;
    startTime: number;
    endTime: number;
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent?: number;
    /** v0.7.8：上传图的原始宽高比（w/h），用于高度钳制 */
    aspect?: number;
    /** v0.7.11：Canvas 预合成的帧序列（printf 路径）；存在时按图片序列输入 */
    framePattern?: string | null;
    /** v0.7.13：入场序列的静止末帧路径，用于保持与淡出（序列本身太短，fade 跑不到出场） */
    holdImagePath?: string | null;
    /** v0.7.13：入场序列的播放时长（秒），= 帧数 / 帧率 */
    seqDuration?: number;
    /** v0.7.13：预合成画布相对图片外扩的像素，导出时需把叠加层位置回退该值 */
    pad?: number;
    /** v0.7.11：已由 Canvas 预合成（圆角/星标/光晕/缩放均已烘焙），导出端不再重复处理 */
    precomposed?: boolean;
    transitionEffect?: 'fade' | 'slide' | 'zoom' | 'none';
    borderStyle?: 'none' | 'clean_white' | 'rounded_card' | 'star_badge' | 'cyber_glow';
  }>;
}) => {
  let isTempDownloaded = false;
  let actualVideoPath = args.videoPath;
  try {
    if (!FFMPEG_PATH || !fs.existsSync(FFMPEG_PATH)) {
      throw new Error('未找到 FFmpeg 引擎，无法进行视频合成');
    }
    const { videoPath, overlays, removeOriginalWatermark } = args;
    if (videoPath && (videoPath.startsWith('http://') || videoPath.startsWith('https://'))) {
      actualVideoPath = path.join(app.getPath('temp'), `jaygo-export-input-${Date.now()}.mp4`);
      await downloadMediaFile(videoPath, actualVideoPath);
      isTempDownloaded = true;
    }
    if (!actualVideoPath || !fs.existsSync(actualVideoPath)) {
      throw new Error(`原视频文件不存在：${actualVideoPath}`);
    }
    if (!overlays || overlays.length === 0) {
      throw new Error('未指定任何要叠加的插图');
    }

    // 默认输出路径
    let targetPath = args.outputPath;
    if (!targetPath) {
      const outDir = settings.outputDir || path.join(os.homedir(), 'Desktop');
      const baseName = path.basename(actualVideoPath, path.extname(actualVideoPath));
      targetPath = path.join(outDir, `${baseName}_智能配图_${Date.now()}.mp4`);
    }

    // 先用 ffmpeg 获取原视频尺寸
    const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
      const p = spawn(FFMPEG_PATH, ['-i', actualVideoPath]);
      let err = '';
      p.stderr.on('data', (d) => err += d.toString());
      p.on('close', () => {
        const match = err.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);
        if (match) {
          resolve({ width: parseInt(match[1]), height: parseInt(match[2]) });
        } else {
          resolve({ width: 1080, height: 1920 });
        }
      });
      p.on('error', () => resolve({ width: 1080, height: 1920 }));
    });

    const W = dimensions.width;
    const H = dimensions.height;
    dbg(`[VideoOverlay] input=${actualVideoPath} W=${W} H=${H} overlaysCount=${overlays.length} removeWatermark=${Boolean(removeOriginalWatermark)}`);

    // 构建 FFmpeg 输入参数
    // v0.7.12：带动画的叠加层拆成两路输入：
    //   ① 入场帧序列（有限帧，只负责弹入）
    //   ② 静止末帧（-loop 1 无限循环，负责保持与淡出）
    // 这样拆分的原因：fade 滤镜在 overlay **之前**处理，序列只有 0.5 秒，
    // 设在第 3.5 秒的 fade=t=out 根本执行不到（repeatlast 是在 overlay 内部补帧，
    // 补出来的帧不经过 fade），表现就是「弹入有动效、结束时没有」。
    const ffmpegArgs = ['-y', '-i', actualVideoPath];
    const inputPlan: Array<{ seq?: number; hold?: number }> = [];
    let inputCursor = 1;
    for (const ov of overlays) {
      if (ov.framePattern && ov.holdImagePath) {
        ffmpegArgs.push('-start_number', '0', '-framerate', '10', '-i', ov.framePattern);
        const seqIdx = inputCursor++;
        ffmpegArgs.push('-loop', '1', '-i', ov.holdImagePath);
        const holdIdx = inputCursor++;
        inputPlan.push({ seq: seqIdx, hold: holdIdx });
      } else {
        ffmpegArgs.push('-loop', '1', '-i', ov.imagePath);
        inputPlan.push({ hold: inputCursor++ });
      }
    }

    // 滤镜处理各插图
    const filterParts: string[] = [];
    let prevVideoTag = '0:v';

    // 智能去除原片左上角水印（如蝉镜等水印标志，默认全自动静默消除）
    if (removeOriginalWatermark !== false) {
      const isVertical = H > W;
      const delogoW = isVertical ? 180 : 230;
      const delogoH = isVertical ? 70 : 80;
      const delogoX = isVertical ? 20 : 28;
      const delogoY = isVertical ? 24 : 28;
      filterParts.push(`[0:v]delogo=x=${delogoX}:y=${delogoY}:w=${delogoW}:h=${delogoH}:show=0[v_base]`);
      prevVideoTag = 'v_base';
    }

    overlays.forEach((ov, idx) => {
      const plan = inputPlan[idx] || {};
      const seqInput = typeof plan.seq === 'number' ? plan.seq : null;
      const holdInput = typeof plan.hold === 'number' ? plan.hold : -1;
      let targetW = Math.max(16, Math.round((W * ov.widthPercent) / 2) * 2);

      // v0.7.8 高度钳制：叠加层按宽度缩放后高度由图片自身比例决定（h=-2），
      // 一张 9:16 竖图在 widthPercent=0.78 下会算出 1.39 倍画面高度而溢出。
      // 这里在上传图带有 aspect 时，按画面高度上限反推最大宽度。
      // v0.7.11：若该层已由 Canvas 预合成，尺寸与圆角均已烘焙，无需再钳制。
      if (!ov.precomposed && typeof ov.aspect === 'number' && Number.isFinite(ov.aspect) && ov.aspect > 0) {
        const maxHPercent = typeof ov.heightPercent === 'number' && ov.heightPercent > 0
          ? ov.heightPercent
          : 0.92;
        const maxH = H * maxHPercent;
        const widthLimitedByHeight = Math.floor((maxH * ov.aspect) / 2) * 2;
        if (widthLimitedByHeight > 0) {
          targetW = Math.max(16, Math.min(targetW, widthLimitedByHeight));
        }
      }
      const scaledTag = `ov_${idx}`;
      const scaledTagB = `ovh_${idx}`;
      const nextVideoTag = idx === overlays.length - 1 ? 'outv' : `v_${idx}`;
      const midVideoTag = seqInput !== null ? `vm_${idx}` : nextVideoTag;
      // v0.7.13：预合成画布四周留了 PAD，图片本身仍按 widthPercent 定尺寸，
      // 这里把贴图位置回退 PAD，保证图片的视觉位置与预览一致。
      const pad = ov.precomposed && typeof ov.pad === 'number' ? Math.max(0, ov.pad) : 0;
      const posX = Math.max(0, Math.min(W - 20, Math.round(W * ov.xPercent) - pad));
      const posY = Math.max(0, Math.min(H - 20, Math.round(H * ov.yPercent) - pad));
      const st = Math.max(0, ov.startTime).toFixed(2);
      const et = Math.max(ov.startTime + 0.5, ov.endTime).toFixed(2);

      const dur = Math.max(0.6, ov.endTime - ov.startTime);
      const fadeDur = Math.min(0.35, dur / 3);
      const fadeOutSt = Math.max(Number(st), Number(et) - fadeDur).toFixed(2);
      const seqDur = Math.max(0.2, Number(ov.seqDuration) || 0.5);
      const seqEnd = (Number(st) + seqDur).toFixed(2);

      const effect = ov.transitionEffect || 'fade';
      const wantFade = effect === 'fade' || effect === 'zoom';

      const baseChain = (inputIdx: number) =>
        ov.precomposed
          ? `[${inputIdx}:v]format=rgba,setpts=PTS-STARTPTS+${st}/TB`
          : `[${inputIdx}:v]scale=w=${targetW}:h=-2,format=rgba,setpts=PTS-STARTPTS+${st}/TB`;

      let overlayX = `${posX}`;
      if (effect === 'slide') {
        overlayX = `'if(lt(t,${st}+${fadeDur.toFixed(2)}),${posX}+(1-(t-${st})/${fadeDur.toFixed(2)})*120,${posX})'`;
      }

      // 边框预设（v0.7.11：预合成时圆角/星标/光晕已烘焙进 PNG，不再由 ffmpeg 重复绘制）
      const borderChain = ov.precomposed
        ? ''
        : ov.borderStyle === 'clean_white'
          ? `,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=4`
          : ov.borderStyle === 'star_badge'
            ? `,drawbox=x=0:y=0:w=iw:h=ih:color=0xF59E0B:t=4`
            : ov.borderStyle === 'cyber_glow'
              ? `,drawbox=x=0:y=0:w=iw:h=ih:color=0x6366F1:t=4`
              : '';

      if (seqInput !== null) {
        // —— 阶段 A：入场帧序列（有限帧，只负责弹入）——
        // fade 滤镜在 overlay 之前处理，序列只有 0.5 秒；把出场淡出挂在这里
        // 会因为滤镜早已结束而永远不触发（v0.7.12 的「结束没有动效」）。
        let seqFilters = baseChain(seqInput) + borderChain;
        if (wantFade) {
          seqFilters += `,fade=t=in:st=${st}:d=${fadeDur.toFixed(2)}:alpha=1`;
        }
        seqFilters += `[${scaledTag}]`;
        filterParts.push(seqFilters);
        filterParts.push(
          `[${prevVideoTag}][${scaledTag}]overlay=x=${overlayX}:y=${posY}:enable='between(t,${st},${seqEnd})':eof_action=repeat:repeatlast=1[${midVideoTag}]`
        );

        // —— 阶段 B：静止末帧（-loop 1 无限流，负责保持与淡出）——
        // 从 seqEnd 接管，内容与阶段 A 的末帧逐像素一致，交接无跳变。
        let holdFilters = baseChain(holdInput) + borderChain;
        if (wantFade) {
          holdFilters += `,fade=t=out:st=${fadeOutSt}:d=${fadeDur.toFixed(2)}:alpha=1`;
        }
        holdFilters += `[${scaledTagB}]`;
        filterParts.push(holdFilters);
        filterParts.push(
          `[${midVideoTag}][${scaledTagB}]overlay=x=${overlayX}:y=${posY}:enable='between(t,${seqEnd},${et})':eof_action=pass[${nextVideoTag}]`
        );
      } else {
        // 静帧叠加（-loop 1，永不 EOF）：入场 + 出场可挂在同一条滤镜链上
        let imgFilters = baseChain(holdInput) + borderChain;
        if (wantFade) {
          imgFilters += `,fade=t=in:st=${st}:d=${fadeDur.toFixed(2)}:alpha=1,fade=t=out:st=${fadeOutSt}:d=${fadeDur.toFixed(2)}:alpha=1`;
        }
        imgFilters += `[${scaledTag}]`;
        filterParts.push(imgFilters);
        filterParts.push(
          `[${prevVideoTag}][${scaledTag}]overlay=x=${overlayX}:y=${posY}:enable='between(t,${st},${et})':eof_action=pass[${nextVideoTag}]`
        );
      }
      prevVideoTag = nextVideoTag;
    });

    ffmpegArgs.push(
      '-filter_complex', filterParts.join(';'),
      '-map', '[outv]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '18',
      '-c:a', 'copy',
      '-shortest',
      targetPath
    );

    // 执行合成
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_PATH, ffmpegArgs);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        const text = d.toString();
        stderr += text;
        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch && event?.sender) {
          const secs = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
          event.sender.send('export-video-progress', { currentTimeSec: secs });
        }
      });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
          resolve();
        } else {
          reject(new Error(`FFmpeg 视频导出失败（退出码 ${code}）：${stderr.slice(-500)}`));
        }
      });
      proc.on('error', reject);
    });

    dbg(`[VideoOverlay] export finished -> ${targetPath}`);
    return {
      ok: true,
      outputPath: targetPath,
    };
  } catch (err: any) {
    dbg(`[VideoOverlay] export error: ${err?.message || err}`);
    return {
      ok: false,
      error: err?.message || '视频导出失败',
    };
  } finally {
    if (isTempDownloaded) {
      try { fs.unlinkSync(actualVideoPath); } catch {}
    }
  }
});



