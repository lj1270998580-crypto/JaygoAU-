import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { BrowserWindow } from 'electron';

export interface MediaResolutionOption {
  id: string;             // e.g. '1080p', '720p', '480p', '360p', 'h265', 'h264'
  label: string;          // e.g. '1080P 超清', '720P 高清', '360P 流畅'
  videoUrl?: string;      // 该清晰度对应的视频流直链
  audioUrl?: string;      // 对应的独立音频流（若有）
  quality?: number;       // 如 B站 qn: 80, 64, 32, 16
  bitrate?: number;       // 码率 (bps)
  width?: number;         // 分辨率宽
  height?: number;        // 分辨率高
  format?: string;        // mp4, h264, h265
  sizeEstimated?: number | string; // 预估文件大小 (bytes 或 MB 字符串)
  isDefault?: boolean;    // 是否为默认推荐项（最高画质）
  needsAudioMerge?: boolean; // 标识该清晰度流是否为纯视频无声流，需要由 FFmpeg 合并音频
}

export interface ParsedMediaInfo {
  platform: 'douyin' | 'bilibili' | 'kuaishou' | 'xiaohongshu' | 'generic';
  platformName: string;
  mediaType?: 'video' | 'images';
  title: string;
  desc?: string;
  author: string;
  authorAvatar?: string;
  coverUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  durationSec?: number;
  originalUrl: string;
  headers?: Record<string, string>;
  images?: string[];
  rawImages?: string[]; // 100% 超清无损原图列表 (去除 CDN 缩放/WebP压缩后的原图)
  resolutions?: MediaResolutionOption[]; // 可选清晰度列表（按画质从高到低排序）
  selectedResolutionId?: string;        // 默认选中的清晰度 ID
  needsAudioMerge?: boolean;            // 是否需要音视频合并
}

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
export const PC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

  // 3. 快手 (支持 v.kuaishou.com, www.kuaishou.com, v.m.chenzhongtech.com, kuaishou.com)
  const ksMatch = text.match(/https?:\/\/(?:v|www)\.kuaishou\.com\/[^\s\u4e00-\u9fa5<>'\"()（）]+/i) ||
                  text.match(/https?:\/\/v\.m\.chenzhongtech\.com\/fw\/photo\/[^\s\u4e00-\u9fa5<>'\"()（）]+/i) ||
                  text.match(/https?:\/\/kuaishou\.com\/[^\s\u4e00-\u9fa5<>'\"()（）]+/i);
  if (ksMatch) return { url: ksMatch[0].replace(/[\.,;!]+$/, ''), platform: 'kuaishou' };

  // 4. 小红书 (支持 xhslink.com, xhslink.cn, www.xiaohongshu.com/discovery/item, explore)
  const xhsMatch = text.match(/https?:\/\/(?:xhslink\.(?:com|cn)\/[^\s\u4e00-\u9fa5<>'\"()（）]+|www\.xiaohongshu\.com\/(?:discovery\/item|explore)\/[a-zA-Z0-9]+[^\s\u4e00-\u9fa5<>'\"()（）]*)/i);
  if (xhsMatch) return { url: xhsMatch[0].replace(/[\.,;!]+$/, ''), platform: 'xiaohongshu' };

  // 5. 通用网络音视频链接
  const genericMatch = text.match(/https?:\/\/[^\s\u4e00-\u9fa5]+\.(?:mp4|mov|mkv|webm|mp3|wav|m4a|aac|flv)(?:\?[^\s\u4e00-\u9fa5]*)?/i);
  if (genericMatch) return { url: genericMatch[0].replace(/[\.,;!]+$/, ''), platform: 'generic' };

  // 6. 其他任意 http/https 链接
  const anyUrlMatch = text.match(/https?:\/\/[^\s\u4e00-\u9fa5]+/i);
  if (anyUrlMatch) return { url: anyUrlMatch[0].replace(/[\.,;!]+$/, ''), platform: 'generic' };

  return null;
}

const CLEAN_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

// 递归跟随 HTTP 302 重定向获取抖音 itemId 或最终长链
async function resolveDouyinRedirect(url: string): Promise<{ targetUrl: string; itemId: string | null; isNote: boolean }> {
  let cur = url;
  let itemId: string | null = null;
  let isNote = false;

  // 先从传入链接本身检查是否有 itemId
  const directMatch = cur.match(/(video|note)\/(\d+)/);
  if (directMatch) {
    return { targetUrl: cur, itemId: directMatch[2], isNote: directMatch[1] === 'note' };
  }

  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(cur, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': PC_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const loc = res.headers.get('location');
      if (loc) {
        cur = loc.startsWith('http') ? loc : new URL(loc, cur).href;
        const m = cur.match(/(video|note)\/(\d+)/);
        if (m) {
          itemId = m[2];
          isNote = m[1] === 'note';
          break; // 只要提取到了 itemId，立刻停止重定向，节省网络延迟
        }
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return { targetUrl: cur, itemId, isNote };
}

// 抖音流质量打分函数：综合分辨率、真实文件体积（字节）、码率与编码格式，严惩降质自适应流
function computeDouyinQualityScore(c: {
  width: number;
  height: number;
  dataSize: number;
  bitrate: number;
  gearName: string;
  fps: number;
  isMaster: boolean;
}): number {
  const pixels = c.width * c.height;
  const gear = (c.gearName || '').toLowerCase();
  let score = pixels; // 基础分辨率分：1080×1920 = 2,073,600

  // 1. 真实文件体积（字节）权重最高，是母带真画质的核心衡量标准
  if (c.dataSize > 0) {
    score += c.dataSize; // 35MB = +35,000,000
  } else if (c.bitrate > 0) {
    score += c.bitrate * 4; // 4000kbps = +16,000,000
  }

  // 2. 60 帧高刷原画加分
  if (c.fps >= 50) {
    score += 5000000;
  }

  // 3. 原生上传母带 / 正常 1080P 加分
  if (c.isMaster || gear.includes('normal_1080') || gear.includes('origin')) {
    score += 10000000;
  }

  // 4. 严厉惩罚自适应降质流（杜绝用户拿到 2~4MB 虚假 1080P/720P 预览流）
  if (gear.includes('adapt_lowest')) {
    score -= 50000000;
  } else if (gear.includes('adapt_low')) {
    score -= 25000000;
  } else if (gear.includes('adapt')) {
    score -= 10000000;
  }

  return score;
}

// ---- 1. 抖音解析器（内置短链重定向、持久化会话、CDP时序修复、SSR数据穿透与原画母带评分提取） ----
async function parseDouyin(rawUrl: string, retryCount = 1): Promise<ParsedMediaInfo> {
  const { targetUrl, itemId, isNote } = await resolveDouyinRedirect(rawUrl);
  // 针对抖音风控，强行切换至桌面端页面（视频为 /video/{itemId}，图文为 /note/{itemId}）
  const desktopUrl = itemId
    ? isNote
      ? `https://www.douyin.com/note/${itemId}`
      : `https://www.douyin.com/video/${itemId}`
    : targetUrl;

  return new Promise((resolve, reject) => {
    let settled = false;
    // 使用持久化分区保留 ByteDance 风控 ttwid 与状态 Cookie，避免被当成受限新访客而降质
    const sessionPartition = 'persist:douyin_web_session';
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        partition: sessionPartition,
      },
    });

    win.webContents.setAudioMuted(true);
    win.webContents.setBackgroundThrottling(false);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const cleanup = () => {
      clearTimeout(timer);
      try {
        if (win.webContents.debugger.isAttached()) {
          win.webContents.debugger.detach();
        }
      } catch {}
      try {
        win.destroy();
      } catch {}
    };

    const timer = setTimeout(async () => {
      if (!settled) {
        settled = true;
        cleanup();
        if (retryCount > 0) {
          try {
            const retryRes = await parseDouyin(rawUrl, retryCount - 1);
            return resolve(retryRes);
          } catch (retryErr) {
            return reject(retryErr);
          }
        }
        reject(new Error('解析抖音视频超时，请检查网络或作品是否为私密/已删除'));
      }
    }, 18000);

    // 拦截移动端跳转抖音 App 的原生协议
    win.webContents.on('will-navigate', (e, navUrl) => {
      if (navUrl.startsWith('snssdk') || navUrl.startsWith('douyin://')) {
        e.preventDefault();
      }
    });

    let capturedVideo = '';
    let capturedAudio = '';
    const capturedVideos: string[] = [];
    const capturedVideoSizes = new Map<string, number>(); // url -> bytes
    let awemeDetailData: any = null;

    // 挂载 Chrome DevTools Protocol 监听抖音核心接口回包（正确等待 Network.loadingFinished）
    const pendingDetailRequests = new Map<string, string>(); // requestId -> url
    try {
      const cdp = win.webContents.debugger;
      cdp.attach('1.3');
      cdp.sendCommand('Network.enable');
      cdp.on('message', async (_event, method, params) => {
        if (method === 'Network.responseReceived') {
          const u = params.response?.url || '';
          if (
            u.includes('/aweme/v1/web/aweme/detail/') ||
            u.includes('/aweme/v1/web/item/detail/') ||
            u.includes('/aweme/v1/web/aweme/post/') ||
            u.includes('/aweme/v1/web/feed/')
          ) {
            pendingDetailRequests.set(params.requestId, u);
          }
        } else if (method === 'Network.loadingFinished') {
          if (pendingDetailRequests.has(params.requestId)) {
            try {
              const bodyObj = await cdp.sendCommand('Network.getResponseBody', { requestId: params.requestId });
              if (bodyObj && bodyObj.body) {
                const bodyStr = bodyObj.base64Encoded
                  ? Buffer.from(bodyObj.body, 'base64').toString('utf-8')
                  : bodyObj.body;
                const parsed = JSON.parse(bodyStr);
                if (parsed.aweme_detail) {
                  awemeDetailData = parsed.aweme_detail;
                } else if (parsed.item_list && parsed.item_list[0]) {
                  awemeDetailData = parsed.item_list[0];
                } else if (parsed.aweme_list && parsed.aweme_list[0]) {
                  awemeDetailData = parsed.aweme_list[0];
                }
              }
            } catch (err) {
              console.warn('[Douyin CDP] loadingFinished getResponseBody failed:', err);
            }
          }
        }
      });
    } catch {}

    // 网络请求全流量嗅探与真实 Content-Length 尺寸记录
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const u = details.url;
      const cl = details.responseHeaders?.['content-length']?.[0] || details.responseHeaders?.['Content-Length']?.[0];
      if (cl) {
        const bytes = parseInt(cl, 10);
        if (bytes > 0) {
          capturedVideoSizes.set(u, bytes);
        }
      }
      callback({});
    });

    win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      const u = details.url;
      if (u.startsWith('snssdk') || u.startsWith('douyin://')) {
        return callback({ cancel: true });
      }

      // 过滤 H265 解码能力探测视频及静态非媒体流
      if (u.includes('uuu_265.mp4') || u.includes('douyin-pc-web/uuu') || u.includes('static')) {
        return callback({});
      }

      // 捕获真实 CDN 视频流并收集多清晰度候选
      if (
        (u.includes('media-video') ||
         (u.includes('douyinvod.com') && !u.includes('media-audio')) ||
         u.includes('/video/tos/')) &&
        !u.includes('.js') &&
        !u.includes('.css') &&
        !u.includes('.json')
      ) {
        if (!capturedVideo) {
          capturedVideo = u;
        }
        if (!capturedVideos.includes(u)) {
          capturedVideos.push(u);
        }
      }

      // 捕获原声或独立音频流
      if (
        (u.includes('media-audio') ||
         u.includes('soundTrack') ||
         (u.includes('music') && u.includes('douyinvod.com'))) &&
        !u.includes('.js') &&
        !u.includes('.css')
      ) {
        if (!capturedAudio) {
          capturedAudio = u;
        }
      }

      callback({});
    });

    win.loadURL(desktopUrl, { userAgent: PC_UA }).catch((err) => {
      if (!settled && retryCount > 0) {
        settled = true;
        cleanup();
        parseDouyin(rawUrl, retryCount - 1).then(resolve).catch(reject);
      }
    });

    // 毫秒级轮询页面渲染树与 CDP 详情回包
    let pollCount = 0;
    const interval = setInterval(async () => {
      if (settled || win.isDestroyed()) {
        clearInterval(interval);
        return;
      }
      pollCount++;

      // 尝试在页面内注入执行：读取 RENDER_DATA / SSR 并通知播放器提升画质
      let domExtracted: any = null;
      try {
        domExtracted = await win.webContents.executeJavaScript(`
          (() => {
            let domAwemeDetail = null;
            try {
              const renderEl = document.getElementById('RENDER_DATA');
              if (renderEl && renderEl.innerText) {
                const text = decodeURIComponent(renderEl.innerText.trim());
                const data = JSON.parse(text);
                const findDetail = (obj) => {
                  if (!obj || typeof obj !== 'object') return null;
                  if (obj.aweme_detail) return obj.aweme_detail;
                  if (obj.video && (obj.video.play_addr || obj.video.bit_rate)) return obj;
                  for (const k of Object.keys(obj)) {
                    const res = findDetail(obj[k]);
                    if (res) return res;
                  }
                  return null;
                };
                domAwemeDetail = findDetail(data);
              }
            } catch (e) {}

            if (!domAwemeDetail && window._ROUTER_DATA) {
              try {
                const findDetail = (obj) => {
                  if (!obj || typeof obj !== 'object') return null;
                  if (obj.aweme_detail) return obj.aweme_detail;
                  if (obj.video && (obj.video.play_addr || obj.video.bit_rate)) return obj;
                  for (const k of Object.keys(obj)) {
                    const res = findDetail(obj[k]);
                    if (res) return res;
                  }
                  return null;
                };
                domAwemeDetail = findDetail(window._ROUTER_DATA);
              } catch (e) {}
            }

            // 触发播放器最高清晰度切换（促使拉取 1080P 真高清流）
            try {
              const playerEl = document.querySelector('xg-video-container');
              const player = (playerEl && playerEl.__player) || window.player;
              if (player && player.plugins && player.plugins.definition) {
                const defConfig = player.plugins.definition.config;
                if (defConfig && defConfig.list && defConfig.list.length > 0) {
                  const bestDef = defConfig.list.find(d => d.definition === '1080p') || defConfig.list[0];
                  if (bestDef && player.changeDefinition) {
                    player.changeDefinition(bestDef);
                  }
                }
              }
            } catch (e) {}

            const title = (document.title || '').replace(/ - 抖音$/, '').replace(/\\| 抖音$/, '').trim() || '抖音作品';
            const descEl = document.querySelector('meta[name="description"]');
            const desc = descEl ? descEl.getAttribute('content') || '' : '';

            let author = '';
            const authorMatch = desc.match(/ - (.*?)于\\d{8}发布/);
            if (authorMatch) author = authorMatch[1].trim();
            if (!author) {
              const el = document.querySelector('[class*="account-name"]') || document.querySelector('[class*="author-name"]');
              if (el) author = (el.textContent || '').trim();
            }

            const imgs = Array.from(document.querySelectorAll('img')).map(i => i.src);
            const rawImages = imgs
              .filter(s => s.includes('douyinpic.com') && !s.includes('avatar') && !s.includes('icon') && !s.includes('user-avatar'))
              .map(s => s.replace(/~.*$/, ''));

            const uniqueRaw = Array.from(new Set(rawImages));
            const cover = uniqueRaw[0] || (imgs.find(s => s.includes('douyinpic.com') && !s.includes('avatar')) || '');
            const avatar = imgs.find(s => s.includes('avatar')) || '';
            const isNotePage = window.location.href.includes('/note/');

            return {
              domAwemeDetail,
              title,
              desc,
              author: author || '抖音创作者',
              authorAvatar: avatar,
              coverUrl: cover,
              images: uniqueRaw.length > 0 ? uniqueRaw : undefined,
              rawImages: uniqueRaw.length > 0 ? uniqueRaw : undefined,
              isNotePage,
            };
          })()
        `);
        if (domExtracted && domExtracted.domAwemeDetail && !awemeDetailData) {
          awemeDetailData = domExtracted.domAwemeDetail;
        }
      } catch {}

      // 优先通道：成功拦截到 aweme_detail 原生高清数据字典（来自 CDP 或 SSR 提取）
      if (awemeDetailData) {
        settled = true;
        clearInterval(interval);
        cleanup();

        const item = awemeDetailData;
        const title = (item.desc || domExtracted?.title || '抖音作品').trim();
        const author = item.author?.nickname || domExtracted?.author || '抖音创作者';
        const authorAvatar = item.author?.avatar_thumb?.url_list?.[0] || domExtracted?.authorAvatar || '';
        const coverUrl = item.video?.cover?.url_list?.[0] || item.video?.origin_cover?.url_list?.[0] || domExtracted?.coverUrl || '';
        const durationSec = item.video?.duration ? Math.round(item.video.duration / 1000) : undefined;

        // 图文作品图片集合
        let images: string[] | undefined = undefined;
        let rawImages: string[] | undefined = undefined;
        if (item.images && item.images.length > 0) {
          images = item.images.map((img: any) => img.url_list?.[0]).filter(Boolean);
          rawImages = images?.map((u: string) => u.replace(/~.*$/, ''));
        } else if (domExtracted?.images && domExtracted.images.length > 0) {
          images = domExtracted.images;
          rawImages = domExtracted.rawImages;
        }

        // 音频流提取（供独立音频导出/试听）
        const audioUrl =
          capturedAudio ||
          item.video?.bit_rate_audio?.[0]?.audio_meta?.url_list?.[0] ||
          item.music?.play_url?.url_list?.[0] ||
          undefined;

        // 构建包含原生母带 (play_addr) 与全规格码率 (bit_rate) 的候选池
        interface StreamCandidate {
          url: string;
          width: number;
          height: number;
          bitrate: number;
          dataSize: number;
          gearName: string;
          fps: number;
          isH265: boolean;
          isMaster: boolean;
          score: number;
        }

        const candidates: StreamCandidate[] = [];

        // 1. 抖音创作者原生上传的母带流 (play_addr，通常为最高码率高保真原片，无二次压缩)
        if (item.video?.play_addr?.url_list?.[0]) {
          const pa = item.video.play_addr;
          const w = pa.width || 0;
          const h = pa.height || 0;
          const dataSize = pa.data_size || 0;
          const estBitrate = dataSize > 0 && durationSec ? Math.round((dataSize * 8) / durationSec) : 8000000;
          const c: StreamCandidate = {
            url: pa.url_list[0],
            width: w,
            height: h,
            bitrate: estBitrate,
            dataSize,
            gearName: 'origin_master',
            fps: 30,
            isH265: false,
            isMaster: true,
            score: 0,
          };
          c.score = computeDouyinQualityScore(c);
          candidates.push(c);
        }

        // 2. 遍历 bit_rate 各规格流
        const bitrates: any[] = item.video?.bit_rate || [];
        for (const b of bitrates) {
          const pa = b.play_addr;
          if (!pa?.url_list?.[0]) continue;
          const w = pa.width || 0;
          const h = pa.height || 0;
          const dataSize = pa.data_size || 0;
          const bitrate = b.bit_rate || 0;
          const gearName = b.gear_name || '';
          const fps = b.FPS || 30;
          const isH265 = Boolean(b.is_h265 || gearName.includes('bytevc1') || gearName.includes('h265'));
          const c: StreamCandidate = {
            url: pa.url_list[0],
            width: w,
            height: h,
            bitrate,
            dataSize,
            gearName,
            fps,
            isH265,
            isMaster: false,
            score: 0,
          };
          c.score = computeDouyinQualityScore(c);
          candidates.push(c);
        }

        // 3. 去重与精简：相同直链去重；相同分辨率只保留得分最高的最佳流（防低码压缩流混入）
        const uniqueByUrl = new Map<string, StreamCandidate>();
        for (const c of candidates) {
          if (!uniqueByUrl.has(c.url) || (c.score > (uniqueByUrl.get(c.url)!.score))) {
            uniqueByUrl.set(c.url, c);
          }
        }

        const resMap = new Map<string, StreamCandidate>();
        for (const c of uniqueByUrl.values()) {
          const key = `${Math.min(c.width, c.height)}x${Math.max(c.width, c.height)}_${c.isH265 ? 'h265' : 'h264'}`;
          const existing = resMap.get(key);
          if (!existing || c.score > existing.score) {
            resMap.set(key, c);
          }
        }

        const sortedCandidates = Array.from(resMap.values()).sort((a, b) => b.score - a.score);

        // 4. 生成清晰度选项
        const resolutions: MediaResolutionOption[] = sortedCandidates.map((c, idx) => {
          const w = c.width;
          const h = c.height;
          const minDim = Math.min(w, h);
          const maxDim = Math.max(w, h);
          const sizeEstimated = c.dataSize > 0
            ? `${(c.dataSize / (1024 * 1024)).toFixed(1)} MB`
            : c.bitrate > 0 && durationSec
            ? `${((c.bitrate * durationSec) / (8 * 1024 * 1024)).toFixed(1)} MB`
            : undefined;

          let pTag = `${minDim}P`;
          if (minDim >= 2160 || maxDim >= 3840) pTag = '4K (2160P)';
          else if (minDim >= 1440 || maxDim >= 2560) pTag = '2K (1440P)';
          else if (minDim >= 1080 || maxDim >= 1920) pTag = '1080P';
          else if (minDim >= 720 || maxDim >= 1280) pTag = '720P';
          else if (minDim >= 540 || maxDim >= 960) pTag = '540P';

          let label = `${pTag} (${w}×${h})`;
          if (idx === 0) {
            label += ' · 最佳超清原画';
          } else if (c.gearName.includes('adapt_lowest')) {
            label += ' · 极速压缩流';
          }

          return {
            id: `dy_${minDim}_${c.isH265 ? 'h265' : 'h264'}_${idx}`,
            label,
            videoUrl: c.url,
            audioUrl,
            width: w,
            height: h,
            bitrate: c.bitrate,
            format: c.isH265 ? 'h265' : 'mp4',
            sizeEstimated,
            isDefault: idx === 0,
            needsAudioMerge: c.url.includes('media-video'),
          };
        });

        if (resolutions.length > 0 && !resolutions.some(o => o.isDefault)) {
          resolutions[0].isDefault = true;
        }

        // 若未提取到任何清晰度则降级使用 play_addr
        if (resolutions.length === 0 && item.video?.play_addr?.url_list?.[0]) {
          const fallbackUrl = item.video.play_addr.url_list[0];
          const sizeBytes = item.video.play_addr.data_size || 0;
          resolutions.push({
            id: 'dy_default',
            label: '超清无水印原片 · 最佳画质',
            videoUrl: fallbackUrl,
            audioUrl,
            format: 'mp4',
            sizeEstimated: sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : undefined,
            isDefault: true,
            needsAudioMerge: false,
          });
        }

        const primaryVideo = resolutions[0]?.videoUrl || capturedVideo || undefined;

        return resolve({
          platform: 'douyin',
          platformName: '抖音',
          mediaType: (images && images.length > 0 && !primaryVideo) ? 'images' : 'video',
          title,
          desc: item.desc || title,
          author,
          authorAvatar,
          coverUrl,
          durationSec,
          videoUrl: primaryVideo,
          audioUrl,
          images,
          rawImages,
          resolutions: resolutions.length > 0 ? resolutions : undefined,
          selectedResolutionId: resolutions[0]?.id,
          needsAudioMerge: resolutions[0]?.needsAudioMerge ?? false,
          originalUrl: targetUrl,
          headers: {
            'User-Agent': PC_UA,
            'Referer': 'https://www.douyin.com/',
          },
        });
      }

      // 降级备用通道：当 CDP 轮询超过 6 秒且未能截取到原生字典时，使用捕获流按真实文件体积排序保底
      const info = domExtracted;
      const isPhotoNoteReady = info && (info.isNotePage || (info.images && info.images.length > 1)) && pollCount >= 15;

      if ((capturedVideo || capturedAudio || isPhotoNoteReady) && pollCount >= 30) {
        settled = true;
        clearInterval(interval);
        cleanup();

        // 按真实捕获的 Content-Length 降序排列，确保最大文件（如 25MB 原画）排在首位，杜绝 2MB 预览流
        const sortedVideos = [...capturedVideos].sort((a, b) => {
          const sizeA = capturedVideoSizes.get(a) || 0;
          const sizeB = capturedVideoSizes.get(b) || 0;
          if (sizeA !== sizeB) return sizeB - sizeA;
          return b.length - a.length;
        });

        const resolutions: MediaResolutionOption[] = [];
        if (sortedVideos.length > 0) {
          sortedVideos.forEach((vUrl, idx) => {
            const sizeBytes = capturedVideoSizes.get(vUrl);
            const sizeEstimated = sizeBytes && sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : undefined;
            const isTop = idx === 0;

            let label = isTop ? '超清原画直连流' : `备用规格 ${idx + 1}`;
            if (sizeEstimated) {
              label += ` (${sizeEstimated})`;
            }

            resolutions.push({
              id: `dy_sniff_${idx}`,
              label,
              videoUrl: vUrl,
              audioUrl: capturedAudio || undefined,
              sizeEstimated,
              isDefault: isTop,
              needsAudioMerge: vUrl.includes('media-video'),
            });
          });
        }

        const primaryVideo = resolutions[0]?.videoUrl || capturedVideo || undefined;

        resolve({
          platform: 'douyin',
          platformName: '抖音',
          mediaType: primaryVideo ? 'video' : 'images',
          title: info?.title || '抖音作品',
          desc: info?.desc || '',
          author: info?.author || '抖音创作者',
          authorAvatar: info?.authorAvatar || '',
          coverUrl: info?.coverUrl || '',
          videoUrl: primaryVideo,
          audioUrl: capturedAudio || undefined,
          images: info?.images && info.images.length > 0 ? info.images : undefined,
          rawImages: info?.rawImages && info.rawImages.length > 0 ? info.rawImages : undefined,
          resolutions: resolutions.length > 0 ? resolutions : undefined,
          selectedResolutionId: resolutions[0]?.id,
          needsAudioMerge: resolutions[0]?.needsAudioMerge ?? false,
          originalUrl: targetUrl,
          headers: {
            'User-Agent': PC_UA,
            'Referer': 'https://www.douyin.com/',
          },
        });
      }
    }, 200);
  });
}

// ---- 2. 哔哩哔哩解析器（解除 720P 限制，全面接入 DASH 模式支持 1080P/1080P60 原画与独立高品质音频） ----
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

  // 1. 获取视频基本信息与分 P cid
  const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers: { 'User-Agent': PC_UA, 'Referer': 'https://www.bilibili.com' },
  }).then((r) => r.json());

  if (viewRes.code !== 0 || !viewRes.data) {
    throw new Error(viewRes.message || '获取 B 站视频信息失败');
  }

  const d = viewRes.data;
  const cid = d.cid;
  const durationSec = d.duration || 0;

  // 2. 请求 DASH 模式 (fnval=4048&fourk=1) 支持 1080P/1080P60 及独立 320kbps 音频流
  const playRes = await fetch(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=4048&fourk=1`,
    {
      headers: { 'User-Agent': PC_UA, 'Referer': 'https://www.bilibili.com' },
    }
  ).then((r) => r.json());

  const resolutions: MediaResolutionOption[] = [];
  let primaryAudioUrl: string | undefined = undefined;
  let audioBandwidth = 128000;

  const qnDescMap: Record<number, string> = {
    127: '8K 超高清',
    120: '4K 超清',
    116: '1080P 60帧',
    80: '1080P 高清',
    64: '720P 高清',
    32: '480P 清晰',
    16: '360P 流畅',
  };

  // 优先解析 DASH 格式视频轨与音频轨
  if (playRes.data?.dash) {
    const dash = playRes.data.dash;
    const audios: any[] = (dash.audio || []).sort((a: any, b: any) => (b.bandwidth || 0) - (a.bandwidth || 0));
    if (audios.length > 0) {
      primaryAudioUrl = audios[0].baseUrl || audios[0].backupUrl?.[0];
      audioBandwidth = audios[0].bandwidth || 128000;
    }

    // 按清晰度分组：优先保留 H.264/AVC (codecid: 7) 兼容性最佳流或更高码率流
    const videos: any[] = dash.video || [];
    const qnMap = new Map<number, any>();
    for (const v of videos) {
      const qn = v.id;
      const existing = qnMap.get(qn);
      if (!existing) {
        qnMap.set(qn, v);
      } else {
        // 如果当前是 AVC (7) 且已存不是，或当前码率更高，则更新
        if (v.codecid === 7 && existing.codecid !== 7) {
          qnMap.set(qn, v);
        } else if ((v.bandwidth || 0) > (existing.bandwidth || 0)) {
          qnMap.set(qn, v);
        }
      }
    }

    const sortedQns = Array.from(qnMap.keys()).sort((a, b) => b - a);
    sortedQns.forEach((qn, idx) => {
      const v = qnMap.get(qn)!;
      const desc = qnDescMap[qn] || `${qn}P`;
      const w = v.width;
      const h = v.height;
      const vUrl = v.baseUrl || v.backupUrl?.[0];
      if (!vUrl) return;

      const totalBandwidth = (v.bandwidth || 0) + (primaryAudioUrl ? audioBandwidth : 0);
      const estBytes = durationSec > 0 && totalBandwidth > 0 ? (totalBandwidth * durationSec) / 8 : undefined;
      const sizeEstimated = estBytes ? `${(estBytes / (1024 * 1024)).toFixed(1)} MB` : undefined;

      let format = 'mp4';
      if (v.codecs?.includes('hev') || v.codecid === 12) format = 'h265';
      else if (v.codecs?.includes('avc') || v.codecid === 7) format = 'h264';
      else if (v.codecs?.includes('av01') || v.codecid === 13) format = 'av1';

      resolutions.push({
        id: `bili_${qn}`,
        label: `${desc}${w && h ? ` (${w}×${h})` : ''}${idx === 0 ? ' · 最佳超清' : ''}`,
        quality: qn,
        videoUrl: vUrl,
        audioUrl: primaryAudioUrl,
        width: w,
        height: h,
        bitrate: v.bandwidth,
        format,
        sizeEstimated,
        isDefault: idx === 0,
        needsAudioMerge: Boolean(primaryAudioUrl),
      });
    });
  }

  // 若 DASH 为空或受限，平滑降级使用 durl 直连
  if (resolutions.length === 0 && playRes.data?.durl?.[0]?.url) {
    const curQn = playRes.data.quality || 80;
    const curSize = playRes.data.durl[0].size;
    resolutions.push({
      id: `${curQn}p`,
      label: `${qnDescMap[curQn] || curQn + 'P'} · 兼容直连`,
      quality: curQn,
      videoUrl: playRes.data.durl[0].url,
      sizeEstimated: curSize ? `${(curSize / (1024 * 1024)).toFixed(1)} MB` : undefined,
      isDefault: true,
      needsAudioMerge: false,
    });
  }

  const primaryVideoUrl = resolutions[0]?.videoUrl || playRes.data?.durl?.[0]?.url || undefined;

  return {
    platform: 'bilibili',
    platformName: '哔哩哔哩',
    title: d.title || 'B站作品',
    desc: d.desc || '',
    author: d.owner?.name || '未知UP主',
    authorAvatar: d.owner?.face || '',
    coverUrl: d.pic || '',
    durationSec: d.duration || 0,
    videoUrl: primaryVideoUrl,
    audioUrl: primaryAudioUrl,
    resolutions: resolutions.length > 0 ? resolutions : undefined,
    selectedResolutionId: resolutions[0]?.id,
    needsAudioMerge: resolutions[0]?.needsAudioMerge ?? false,
    originalUrl: targetUrl,
    headers: {
      'User-Agent': PC_UA,
      'Referer': 'https://www.bilibili.com/',
    },
  };
}

// ---- 3. 快手解析器（支持短链多级跳转与 Apollo GraphQL 状态解析） ----
async function parseKuaishou(targetUrl: string): Promise<ParsedMediaInfo> {
  let target = targetUrl;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(target, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': PC_UA,
          'Referer': 'https://v.kuaishou.com/',
        },
      });
      const loc = res.headers.get('location');
      if (loc) {
        target = loc.startsWith('http') ? loc : new URL(loc, target).href;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  const pageRes = await fetch(target, {
    headers: {
      'User-Agent': PC_UA,
      'Referer': 'https://www.kuaishou.com/',
      'Cookie': 'did=web_' + Math.random().toString(36).slice(2),
    },
  });
  const html = await pageRes.text();

  const apolloIdx = html.indexOf('window.__APOLLO_STATE__');
  if (apolloIdx === -1) {
    throw new Error('未能在快手页面提取到有效数据结构，可能作品已下架');
  }

  const start = html.indexOf('{', apolloIdx);
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error('解析快手数据结构失败');
  }

  const rawStr = html.slice(start, end).trim();
  const data = JSON.parse(rawStr);
  const client = data['defaultClient'] || data;

  let photo: any = null;
  let authorObj: any = null;

  for (const k of Object.keys(client)) {
    const item = client[k];
    if (k.startsWith('VisionVideoDetailPhoto:')) {
      photo = item;
    } else if (k.startsWith('VisionVideoDetailAuthor:')) {
      authorObj = item;
    }
  }

  if (!photo) {
    throw new Error('未能在快手作品中找到视频或图文资源');
  }

  const title = photo.caption || '快手作品';
  const desc = photo.caption || '';
  const author = authorObj?.name || '快手创作者';
  const authorAvatar = authorObj?.headerUrl || '';
  const coverUrl = photo.coverUrl || '';
  const durationSec = photo.duration ? Math.round(photo.duration / 1000) : undefined;

  const resolutions: MediaResolutionOption[] = [];

  // 1. 尝试从 photo.manifest 或 photo.manifestStr 中解析出多分辨率 representation 集合
  let manifestObj: any = photo.manifest || null;
  if (typeof manifestObj === 'string') {
    try {
      manifestObj = JSON.parse(manifestObj);
    } catch {}
  }
  if (!manifestObj && photo.manifestStr) {
    try {
      manifestObj = JSON.parse(photo.manifestStr);
    } catch {}
  }

  const representations: any[] = [];
  if (manifestObj && Array.isArray(manifestObj.adaptationSet)) {
    for (const ad of manifestObj.adaptationSet) {
      if (Array.isArray(ad.representation)) {
        representations.push(...ad.representation);
      }
    }
  }

  if (representations.length > 0) {
    // 按码率与分辨率降序排列
    representations.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0) || (b.height || 0) - (a.height || 0));
    representations.forEach((rep, idx) => {
      const u = rep.url;
      if (!u) return;
      const w = rep.width;
      const h = rep.height;
      const qLabel = rep.qualityLabel || (h ? `${h}P` : `规格 ${idx + 1}`);
      const estBytes = rep.bitrate && durationSec ? (rep.bitrate * durationSec) / 8 : undefined;
      const sizeEstimated = estBytes ? `${(estBytes / (1024 * 1024)).toFixed(1)} MB` : undefined;
      const isH265 = rep.mediaType?.includes('hevc') || rep.id?.includes('h265') || rep.url?.includes('h265');

      resolutions.push({
        id: `ks_${rep.id || idx}`,
        label: `${qLabel}${w && h ? ` (${w}×${h})` : ''}${idx === 0 ? ' · 最佳超清' : ''}`,
        videoUrl: u,
        width: w,
        height: h,
        bitrate: rep.bitrate,
        format: isH265 ? 'h265' : 'mp4',
        sizeEstimated,
        isDefault: idx === 0,
        needsAudioMerge: false,
      });
    });
  }

  // 2. 若未从 manifest 解析出多清晰度，保底使用 photoH265Url 与 photoUrl
  if (resolutions.length === 0) {
    if (photo.photoH265Url) {
      resolutions.push({
        id: 'h265',
        label: '超清原画 (H.265 编码)',
        videoUrl: photo.photoH265Url,
        format: 'h265',
        isDefault: true,
        needsAudioMerge: false,
      });
    }
    if (photo.photoUrl && photo.photoUrl !== photo.photoH265Url) {
      resolutions.push({
        id: 'h264',
        label: '标准高清 (H.264 编码)',
        videoUrl: photo.photoUrl,
        format: 'h264',
        isDefault: resolutions.length === 0,
        needsAudioMerge: false,
      });
    }
  }

  const primaryVideoUrl = resolutions[0]?.videoUrl || photo.photoUrl || photo.photoH265Url || undefined;

  return {
    platform: 'kuaishou',
    platformName: '快手',
    mediaType: 'video',
    title,
    desc,
    author,
    authorAvatar,
    coverUrl,
    videoUrl: primaryVideoUrl,
    durationSec,
    resolutions: resolutions.length > 0 ? resolutions : undefined,
    selectedResolutionId: resolutions[0]?.id,
    originalUrl: targetUrl,
    headers: {
      'User-Agent': PC_UA,
      'Referer': 'https://www.kuaishou.com/',
    },
  };
}

// ---- 4. 小红书解析器（全参数保留跳转、图文/视频双模态与超清无损原图提取） ----
async function parseXiaohongshu(targetUrl: string): Promise<ParsedMediaInfo> {
  let fullUrl = targetUrl;

  // 追踪多级重定向并完整保留包括 xsec_token 在内的所有 query 参数
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(fullUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': PC_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const loc = res.headers.get('location');
      if (loc) {
        fullUrl = loc.startsWith('http') ? loc : new URL(loc, fullUrl).href;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  const pageRes = await fetch(fullUrl, {
    headers: {
      'User-Agent': PC_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.xiaohongshu.com/',
    },
  });
  const html = await pageRes.text();

  const stateIdx = html.indexOf('window.__INITIAL_STATE__');
  if (stateIdx === -1) {
    throw new Error('未在小红书页面找到有效数据，请检查链接或网络');
  }

  const start = html.indexOf('{', stateIdx);
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) {
    throw new Error('解析小红书页面数据结构失败');
  }

  const rawStr = html.slice(start, end).trim();
  const data = JSON.parse(rawStr.replace(/:\s*undefined/g, ':null'));
  const noteMap = data.note?.noteDetailMap || {};
  const noteId = Object.keys(noteMap)[0];
  if (!noteId || !noteMap[noteId]?.note) {
    throw new Error('未能在小红书状态中获取到笔记数据，可能作品已删除或受隐私保护');
  }

  const note = noteMap[noteId].note;
  const isVideo = note.type === 'video' || Boolean(note.video);
  const title = note.title || (note.desc ? note.desc.slice(0, 30) : '小红书笔记');
  const desc = note.desc || '';
  const author = note.user?.nickname || '小红书薯友';
  const authorAvatar = note.user?.avatar || '';

  let videoUrl: string | undefined = undefined;
  const resolutions: MediaResolutionOption[] = [];

  if (isVideo && note.video?.media?.stream) {
    const stream = note.video.media.stream;
    const h264List: any[] = stream.h264 || [];
    const h265List: any[] = stream.h265 || [];

    const allStreams = [
      ...h264List.map((s) => ({ ...s, codec: 'h264' })),
      ...h265List.map((s) => ({ ...s, codec: 'h265' })),
    ];

    allStreams.forEach((st, idx) => {
      const u = st.masterUrl || st.mainUrl || st.url;
      if (!u) return;
      const w = st.width || 0;
      const h = st.height || 0;
      let label = '';
      if (h) {
        label = (h >= 1080 ? '1080P 超清' : h >= 720 ? '720P 高清' : `${h}P 标清`) + (w ? ` (${w}×${h})` : '');
      } else {
        label = st.qualityType || (idx === 0 ? '超清无水印流' : `清晰度规格 ${idx + 1}`);
      }
      if (st.codec === 'h265') label += ' (H.265)';

      const sizeBytes = st.size || st.videoSize;
      const sizeEstimated = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : undefined;

      resolutions.push({
        id: `xhs_${st.codec}_${idx}`,
        label,
        videoUrl: u,
        bitrate: st.bitrate || st.videoBitrate,
        width: w,
        height: h,
        format: st.codec,
        sizeEstimated,
      });
    });

    if (resolutions.length > 0) {
      // 优先按分辨率高度降序，再按码率降序
      resolutions.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));
      resolutions[0].isDefault = true;
      videoUrl = resolutions[0].videoUrl;
    } else {
      videoUrl = h264List[0]?.masterUrl || stream.h265?.[0]?.masterUrl || undefined;
    }
  }

  // 1. 网页端自适应预览图片列表
  const images: string[] = (note.imageList || [])
    .map((img: any) => {
      const dft = img.infoList?.find((it: any) => it.imageScene === 'WB_DFT')?.url;
      const prv = img.infoList?.find((it: any) => it.imageScene === 'WB_PRV')?.url;
      return dft || img.urlDefault || prv || img.url;
    })
    .filter(Boolean);

  // 2. 超清无损母带原图直连（通过 ci.xiaohongshu.com/${fileId} 获取未经有损压缩的 3000px+ 相机母带原画）
  const rawImages: string[] = (note.imageList || [])
    .map((img: any) => {
      let fileId = img.fileId;
      const anyUrl = img.infoList?.[0]?.url || img.urlDefault || img.url || '';
      if (!fileId && anyUrl) {
        const m = anyUrl.match(/\/(notes_pre_post\/[^!/?]+|spectrum\/[^!/?]+|[a-zA-Z0-9_-]{20,})(!|\?|$)/);
        if (m) fileId = m[1];
      }
      if (fileId) {
        // ci.xiaohongshu.com 提供官方相机原画直连，单张达 5~20MB JPEG，无防盗链 403 阻断
        return `https://ci.xiaohongshu.com/${fileId}`;
      }
      return img.urlDefault || anyUrl;
    })
    .filter(Boolean);

  const coverUrl = images[0] || note.cover?.url || '';

  return {
    platform: 'xiaohongshu',
    platformName: '小红书',
    mediaType: isVideo && videoUrl ? 'video' : 'images',
    title,
    desc,
    author,
    authorAvatar,
    coverUrl,
    videoUrl,
    images: images.length > 0 ? images : undefined,
    rawImages: rawImages.length > 0 ? rawImages : undefined,
    resolutions: resolutions.length > 0 ? resolutions : undefined,
    selectedResolutionId: resolutions[0]?.id,
    originalUrl: targetUrl,
    headers: {
      'User-Agent': PC_UA,
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

// ---- 使用 ffmpeg 快速无损合并视频流与音频流 (针对 DASH 格式) ----
export function mergeVideoAndAudioWithFfmpeg(
  ffmpegPath: string,
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      return reject(new Error('未找到 FFmpeg 引擎，无法合并音视频'));
    }

    const args = [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-movflags', '+faststart',
      outputPath,
    ];

    let stderr = '';
    const proc = spawn(ffmpegPath, args);
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (e) => reject(e));
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 100) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg 音视频合并失败 (code ${code}): ${stderr.slice(-300)}`));
      }
    });
  });
}

