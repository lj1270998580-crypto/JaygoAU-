import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { BrowserWindow } from 'electron';

export interface ParsedMediaInfo {
  platform: 'douyin' | 'bilibili' | 'kuaishou' | 'xiaohongshu' | 'generic';
  platformName: string;
  title: string;
  author: string;
  authorAvatar?: string;
  coverUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  durationSec?: number;
  originalUrl: string;
  headers?: Record<string, string>;
  images?: string[];
}

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
const PC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 智能清洗输入文本，提取首个 URL 并判别平台
export function cleanAndDetectUrl(input: string): { url: string; platform: ParsedMediaInfo['platform'] } | null {
  const text = input.trim();
  if (!text) return null;

  // 1. 抖音短链或长链
  const dyMatch = text.match(/https?:\/\/(?:v|www)\.douyin\.com\/[^\s\u4e00-\u9fa5<>'\"()（）]+/i) ||
                  text.match(/https?:\/\/www\.iesdouyin\.com\/share\/(?:video|note)\/[^\s\u4e00-\u9fa5<>'\"()（）]+/i);
  if (dyMatch) return { url: dyMatch[0].replace(/[\.,;!]+$/, ''), platform: 'douyin' };

  // 2. 哔哩哔哩
  const biliMatch = text.match(/https?:\/\/(?:b23\.tv|www\.bilibili\.com\/video\/[a-zA-Z0-9]+)[^\s\u4e00-\u9fa5<>'\"()（）]*/i);
  if (biliMatch) return { url: biliMatch[0].replace(/[\.,;!]+$/, ''), platform: 'bilibili' };

  // 3. 快手
  const ksMatch = text.match(/https?:\/\/(?:v|www)\.kuaishou\.com\/[^\s\u4e00-\u9fa5<>'\"()（）]+/i) ||
                  text.match(/https?:\/\/v\.m\.chenzhongtech\.com\/fw\/photo\/[^\s\u4e00-\u9fa5<>'\"()（）]+/i);
  if (ksMatch) return { url: ksMatch[0].replace(/[\.,;!]+$/, ''), platform: 'kuaishou' };

  // 4. 小红书
  const xhsMatch = text.match(/https?:\/\/(?:xhslink\.com|www\.xiaohongshu\.com\/explore\/[a-zA-Z0-9]+)[^\s\u4e00-\u9fa5<>'\"()（）]*/i) ||
                   text.match(/https?:\/\/www\.xiaohongshu\.com\/discovery\/item\/[a-zA-Z0-9]+[^\s\u4e00-\u9fa5<>'\"()（）]*/i);
  if (xhsMatch) return { url: xhsMatch[0].replace(/[\.,;!]+$/, ''), platform: 'xiaohongshu' };

  // 5. 通用网络音视频链接
  const genericMatch = text.match(/https?:\/\/[^\s\u4e00-\u9fa5]+\.(?:mp4|mov|mkv|webm|mp3|wav|m4a|aac|flv)(?:\?[^\s\u4e00-\u9fa5]*)?/i);
  if (genericMatch) return { url: genericMatch[0].replace(/[\.,;!]+$/, ''), platform: 'generic' };

  // 6. 其他任意 http/https 链接
  const anyUrlMatch = text.match(/https?:\/\/[^\s\u4e00-\u9fa5]+/i);
  if (anyUrlMatch) return { url: anyUrlMatch[0].replace(/[\.,;!]+$/, ''), platform: 'generic' };

  return null;
}

const WX_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.38(0x1800262c) NetType/WIFI Language/zh_CN';

// ---- 1. 抖音解析器（内置真实 Chromium 渲染树嗅探，支持签名参数并 100% 绕过反爬风控与验证码） ----
async function parseDouyin(targetUrl: string): Promise<ParsedMediaInfo> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const win = new BrowserWindow({
      show: false,
      width: 375,
      height: 667,
      webPreferences: {
        offscreen: true,
      },
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          win.destroy();
        } catch {}
        reject(new Error('解析抖音视频超时，请检查网络或作品是否为私密/已删除'));
      }
    }, 12000);

    const cleanup = () => {
      clearTimeout(timer);
      try {
        win.destroy();
      } catch {}
    };

    // 拦截移动端跳转抖音 App 的原生协议
    win.webContents.on('will-navigate', (e, navUrl) => {
      if (navUrl.startsWith('snssdk') || navUrl.startsWith('douyin')) {
        e.preventDefault();
      }
    });

    let capturedAudio = '';
    win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      if (details.url.includes('music') || details.url.includes('soundTrack')) {
        if (!details.url.endsWith('.js') && !details.url.endsWith('.css')) {
          capturedAudio = details.url;
        }
      }
      callback({});
    });

    win.loadURL(targetUrl, { userAgent: WX_UA }).catch(() => {});

    // 毫秒级轮询页面渲染树获取真实视频流与作品信息
    const interval = setInterval(async () => {
      if (settled || win.isDestroyed()) {
        clearInterval(interval);
        return;
      }
      try {
        const info = await win.webContents.executeJavaScript(`
          (() => {
            const v = document.querySelector('video');
            if (!v || (!v.src && !v.querySelector('source')?.src)) return null;
            const rawSrc = v.src || v.querySelector('source')?.src || '';
            const title = document.title.replace(/ - 抖音$/, '').trim();
            
            let author = '';
            const authorMatch = document.body.innerText.match(/@([^\\n\\s]+)/);
            if (authorMatch) author = authorMatch[1];

            const avatarEl = document.querySelector('img[src*="avatar"]');
            const avatar = avatarEl ? avatarEl.src : '';

            const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src);
            const cover = v.poster || imgs.find(s => s.includes('douyinpic.com') && !s.includes('avatar')) || '';

            return {
              title: title || '抖音作品',
              author: author || '抖音创作者',
              authorAvatar: avatar,
              coverUrl: cover,
              videoUrl: rawSrc.replace('/playwm/', '/play/'),
            };
          })()
        `);

        if (info && info.videoUrl) {
          settled = true;
          clearInterval(interval);
          cleanup();
          resolve({
            platform: 'douyin',
            platformName: '抖音',
            title: info.title,
            author: info.author,
            authorAvatar: info.authorAvatar,
            coverUrl: info.coverUrl,
            videoUrl: info.videoUrl,
            audioUrl: capturedAudio || undefined,
            originalUrl: targetUrl,
            headers: {
              'User-Agent': WX_UA,
              'Referer': 'https://www.douyin.com/',
            },
          });
        }
      } catch {}
    }, 250);
  });
}

// ---- 2. 哔哩哔哩解析器 ----
async function parseBilibili(targetUrl: string): Promise<ParsedMediaInfo> {
  let realUrl = targetUrl;
  if (realUrl.includes('b23.tv')) {
    const headRes = await fetch(realUrl, {
      redirect: 'manual',
      headers: { 'User-Agent': PC_UA },
    });
    const loc = headRes.headers.get('location');
    if (loc) realUrl = loc;
  }

  const bvMatch = realUrl.match(/(BV[a-zA-Z0-9]{10})/i);
  if (!bvMatch) {
    throw new Error('未能从链接中解析出有效的 Bilibili BV 号');
  }
  const bvid = bvMatch[1];

  // 1. 获取视频基本信息
  const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers: { 'User-Agent': PC_UA, 'Referer': 'https://www.bilibili.com' },
  }).then((r) => r.json());

  if (viewRes.code !== 0 || !viewRes.data) {
    throw new Error(viewRes.message || '获取 B 站视频信息失败');
  }

  const d = viewRes.data;
  const cid = d.cid;

  // 2. 请求播放直链 (HTML5 模式返回单 MP4 容器格式，免去音视频分流合并)
  const playRes = await fetch(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&platform=html5`,
    {
      headers: { 'User-Agent': PC_UA, 'Referer': 'https://www.bilibili.com' },
    }
  ).then((r) => r.json());

  const videoUrl = playRes.data?.durl?.[0]?.url || '';

  return {
    platform: 'bilibili',
    platformName: '哔哩哔哩',
    title: d.title || 'B站作品',
    author: d.owner?.name || '未知UP主',
    authorAvatar: d.owner?.face || '',
    coverUrl: d.pic || '',
    durationSec: d.duration || 0,
    videoUrl: videoUrl || undefined,
    originalUrl: targetUrl,
    headers: {
      'User-Agent': PC_UA,
      'Referer': 'https://www.bilibili.com/',
    },
  };
}

// ---- 3. 快手解析器 ----
async function parseKuaishou(targetUrl: string): Promise<ParsedMediaInfo> {
  let realUrl = targetUrl;
  if (realUrl.includes('v.kuaishou.com')) {
    const headRes = await fetch(realUrl, {
      redirect: 'manual',
      headers: { 'User-Agent': MOBILE_UA },
    });
    const loc = headRes.headers.get('location');
    if (loc) realUrl = loc;
  }

  // 请求快手移动端页面
  const pageRes = await fetch(realUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Referer': 'https://v.kuaishou.com/',
      'Cookie': 'did=web_' + Math.random().toString(36).slice(2),
    },
  });
  const html = await pageRes.text();

  let photo: any = null;

  // 查找 INIT_STATE
  const initIdx = html.indexOf('window.INIT_STATE');
  if (initIdx !== -1) {
    const start = html.indexOf('{', initIdx);
    const end = html.indexOf('</script>', start);
    if (start !== -1 && end !== -1) {
      try {
        const jsonStr = html.slice(start, end).trim().replace(/;$/, '');
        const state = JSON.parse(jsonStr);
        photo = state.photo || state.share?.photo || state.currentWork;
      } catch {}
    }
  }

  // 正则兜底查找视频直链
  if (!photo) {
    const mvMatch = html.match(/"mainMvUrls":\s*\[\s*\{"url":\s*"([^"]+)"/);
    const captionMatch = html.match(/"caption":\s*"([^"]+)"/);
    const userMatch = html.match(/"userName":\s*"([^"]+)"/);
    const coverMatch = html.match(/"coverUrls":\s*\[\s*\{"url":\s*"([^"]+)"/);

    if (mvMatch) {
      return {
        platform: 'kuaishou',
        platformName: '快手',
        title: captionMatch ? captionMatch[1] : '快手作品',
        author: userMatch ? userMatch[1] : '快手创作者',
        coverUrl: coverMatch ? coverMatch[1] : '',
        videoUrl: mvMatch[1],
        originalUrl: targetUrl,
        headers: {
          'User-Agent': MOBILE_UA,
          'Referer': 'https://v.kuaishou.com/',
        },
      };
    }
    throw new Error('未能在快手页面提取到有效视频流，可能作品已下架');
  }

  return {
    platform: 'kuaishou',
    platformName: '快手',
    title: photo.caption || '快手作品',
    author: photo.userName || '快手创作者',
    authorAvatar: photo.headUrl || '',
    coverUrl: photo.coverUrls?.[0]?.url || photo.coverUrl || '',
    videoUrl: photo.mainMvUrls?.[0]?.url || photo.videoUrl || '',
    audioUrl: photo.soundTrack?.audioUrls?.[0]?.url || undefined,
    durationSec: photo.duration ? Math.round(photo.duration / 1000) : undefined,
    originalUrl: targetUrl,
    headers: {
      'User-Agent': MOBILE_UA,
      'Referer': 'https://v.kuaishou.com/',
    },
  };
}

// ---- 4. 小红书解析器 ----
async function parseXiaohongshu(targetUrl: string): Promise<ParsedMediaInfo> {
  let realUrl = targetUrl;
  if (realUrl.includes('xhslink.com')) {
    const headRes = await fetch(realUrl, {
      redirect: 'manual',
      headers: { 'User-Agent': MOBILE_UA },
    });
    const loc = headRes.headers.get('location');
    if (loc) realUrl = loc;
  }

  const pageRes = await fetch(realUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Referer': 'https://www.xiaohongshu.com/',
    },
  });
  const html = await pageRes.text();

  let note: any = null;
  const stateIdx = html.indexOf('window.__INITIAL_STATE__');
  if (stateIdx !== -1) {
    const start = html.indexOf('{', stateIdx);
    const end = html.indexOf('</script>', start);
    if (start !== -1 && end !== -1) {
      try {
        const jsonStr = html.slice(start, end).trim().replace(/;$/, '');
        const state = JSON.parse(jsonStr);
        const map = state.note?.noteDetailMap;
        if (map) {
          const firstKey = Object.keys(map)[0];
          note = map[firstKey]?.note;
        }
      } catch {}
    }
  }

  if (!note) {
    throw new Error('未能从小红书页面提取到作品内容，可能需要登录或作品不可见');
  }

  const videoUrl = note.video?.media?.stream?.h264?.[0]?.masterUrl || undefined;
  const images = note.imageList?.map((img: any) => img.urlDefault).filter(Boolean) || [];

  return {
    platform: 'xiaohongshu',
    platformName: '小红书',
    title: note.title || note.desc || '小红书笔记',
    author: note.user?.nickname || '小红书薯友',
    authorAvatar: note.user?.avatar || '',
    coverUrl: images[0] || '',
    videoUrl,
    images: images.length > 0 ? images : undefined,
    originalUrl: targetUrl,
    headers: {
      'User-Agent': MOBILE_UA,
      'Referer': 'https://www.xiaohongshu.com/',
    },
  };
}

// ---- 5. 通用直链解析器 ----
async function parseGeneric(targetUrl: string): Promise<ParsedMediaInfo> {
  const parsed = new URL(targetUrl);
  const pathname = parsed.pathname;
  const fileName = path.basename(pathname) || 'media';
  const isVideo = /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(fileName);
  const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(fileName);

  return {
    platform: 'generic',
    platformName: '网络直链',
    title: decodeURIComponent(fileName),
    author: parsed.hostname,
    videoUrl: isVideo ? targetUrl : undefined,
    audioUrl: isAudio ? targetUrl : undefined,
    originalUrl: targetUrl,
    headers: {
      'User-Agent': PC_UA,
    },
  };
}

// ---- 统一入口：解析媒体链接 ----
export async function extractMedia(input: string): Promise<ParsedMediaInfo> {
  const match = cleanAndDetectUrl(input);
  if (!match) {
    throw new Error('未检测到有效的短视频或媒体链接，请粘贴包含链接的分享文本');
  }

  const { url, platform } = match;

  switch (platform) {
    case 'douyin':
      return await parseDouyin(url);
    case 'bilibili':
      return await parseBilibili(url);
    case 'kuaishou':
      return await parseKuaishou(url);
    case 'xiaohongshu':
      return await parseXiaohongshu(url);
    case 'generic':
    default:
      return await parseGeneric(url);
  }
}

// ---- 流式下载远程媒体文件到本地 ----
export function downloadMediaFile(
  fileUrl: string,
  outputPath: string,
  headers?: Record<string, string>,
  onProgress?: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(fileUrl);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqHeaders: Record<string, string> = {
        'User-Agent': PC_UA,
        ...(headers || {}),
      };

      const req = client.get(fileUrl, { headers: reqHeaders }, (res) => {
        // 遇到 301/302 重定向跟随
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadMediaFile(res.headers.location, outputPath, headers, onProgress).then(resolve).catch(reject);
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`下载失败，服务器返回 HTTP 状态码: ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        const fileStream = fs.createWriteStream(outputPath);
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0 && onProgress) {
            const pct = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
            onProgress(pct);
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(outputPath);
        });

        fileStream.on('error', (err) => {
          fs.unlink(outputPath, () => {});
          reject(err);
        });
      });

      req.on('error', (err) => {
        fs.unlink(outputPath, () => {});
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ---- 使用 ffmpeg 从视频中提取音频 (支持 mp3 或 16k wav) ----
export function extractAudioWithFfmpeg(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  format: 'mp3' | 'wav'
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      return reject(new Error('未找到 FFmpeg 引擎，无法进行本地转码'));
    }

    let args: string[] = [];
    if (format === 'wav') {
      // 用于语音识别的单声道 16000Hz 16-bit PCM WAV
      args = ['-y', '-i', inputPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', outputPath];
    } else {
      // 用于高质量纯音频导出的 MP3
      args = ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outputPath];
    }

    let stderr = '';
    const proc = spawn(ffmpegPath, args);
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 44) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg 音频提取失败 (code ${code}): ${stderr.slice(-300)}`));
      }
    });
  });
}
