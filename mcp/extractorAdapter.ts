import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import {
  cleanAndDetectUrl,
  extractMedia as coreExtractMedia,
  downloadMediaFile,
  mergeVideoAndAudioWithFfmpeg,
  type ParsedMediaInfo,
} from '../electron/mediaExtractor';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG_PATH = ffmpegStatic as unknown as string;

// 当在纯 Node.js CLI 环境下运行（没有原生 BrowserWindow 全局上下文）时，通过轻量子进程唤起 Electron 完成抖音嗅探
async function extractDouyinViaElectronWorker(url: string): Promise<ParsedMediaInfo> {
  const electronPkg = require('electron');
  const electronPath = typeof electronPkg === 'string' ? electronPkg : 'electron';

  const workerScript = `
    const { app } = require('electron');
    const path = require('path');
    app.whenReady().then(async () => {
      try {
        const { extractMedia } = require('${path.resolve(__dirname, '../dist-electron/mediaExtractor.js').replace(/\\/g, '/')}');
        const res = await extractMedia(${JSON.stringify(url)});
        process.stdout.write('__RESULT__' + JSON.stringify(res) + '__RESULT__');
        app.exit(0);
      } catch (err) {
        process.stderr.write('__ERROR__' + (err.message || String(err)) + '__ERROR__');
        app.exit(1);
      }
    });
  `;

  return new Promise((resolve, reject) => {
    const proc = spawn(electronPath, ['-e', workerScript], {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      const match = stdout.match(/__RESULT__([\s\S]*?)__RESULT__/);
      if (match) {
        try {
          return resolve(JSON.parse(match[1]));
        } catch (e: any) {
          return reject(new Error(`解析子进程结果失败: ${e.message}`));
        }
      }
      const errMatch = stderr.match(/__ERROR__([\s\S]*?)__ERROR__/);
      const errMsg = errMatch ? errMatch[1] : stderr.slice(-300) || `子进程退出 code ${code}`;
      reject(new Error(`抖音解析失败: ${errMsg}`));
    });

    setTimeout(() => {
      try {
        proc.kill();
      } catch {}
      reject(new Error('抖音解析超时 (25s)'));
    }, 25000);
  });
}

// 统一对外提取入口
export async function mcpExtractMedia(inputUrl: string): Promise<ParsedMediaInfo> {
  const match = cleanAndDetectUrl(inputUrl);
  if (!match) {
    throw new Error('未检测到有效的短视频或媒体链接，请提供包含分享链接的文本');
  }

  const isElectronRuntime = Boolean(process.versions.electron);

  // 如果是抖音且在纯 Node 环境下执行，走 Electron Worker 桥接
  if (match.platform === 'douyin' && !isElectronRuntime) {
    // 检查编译产物是否存在
    const distExtractor = path.resolve(__dirname, '../dist-electron/mediaExtractor.js');
    if (fs.existsSync(distExtractor)) {
      try {
        return await extractDouyinViaElectronWorker(match.url);
      } catch (e) {
        console.warn('[MCP] Worker 提取失败，降级到默认引擎:', e);
      }
    }
  }

  return await coreExtractMedia(inputUrl);
}

export interface DownloadMediaOptions {
  url: string;
  outputPath?: string;
  resolutionId?: string;
  type?: 'video' | 'audio';
}

export async function mcpDownloadMedia(options: DownloadMediaOptions): Promise<{
  path: string;
  sizeBytes: number;
  sizeMb: string;
  title: string;
  resolutionLabel?: string;
}> {
  const media = await mcpExtractMedia(options.url);
  const type = options.type || 'video';

  // 匹配选定的清晰度
  let chosenVideoUrl = media.videoUrl;
  let chosenAudioUrl = media.audioUrl;
  let activeResolution = media.resolutions?.find((r) => r.isDefault) || media.resolutions?.[0];

  if (options.resolutionId && media.resolutions) {
    const match = media.resolutions.find((r) => r.id === options.resolutionId);
    if (match) {
      activeResolution = match;
      if (match.videoUrl) chosenVideoUrl = match.videoUrl;
      if (match.audioUrl) chosenAudioUrl = match.audioUrl;
    }
  }

  // 默认保存路径
  const safeTitle = (media.title || 'media').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
  const ext = type === 'video' ? 'mp4' : 'mp3';
  let targetPath = options.outputPath?.trim();

  if (!targetPath) {
    const downloadsDir = path.join(
      process.env.USERPROFILE || process.env.HOME || '.',
      'Downloads'
    );
    targetPath = path.join(downloadsDir, `${safeTitle}_${Date.now()}.${ext}`);
  } else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    targetPath = path.join(targetPath, `${safeTitle}_${Date.now()}.${ext}`);
  }

  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const needsMerge = Boolean(
    activeResolution?.needsAudioMerge ??
    media.needsAudioMerge ??
    (chosenVideoUrl && (chosenVideoUrl.includes('media-video') || (chosenVideoUrl.includes('bilibili') && Boolean(chosenAudioUrl))))
  );

  if (type === 'video') {
    if (!chosenVideoUrl) throw new Error('未解析出可用视频流');

    if (needsMerge && chosenAudioUrl) {
      const tempDir = path.join(process.env.TEMP || process.env.TMPDIR || '.', `jaygo_mcp_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const tempV = path.join(tempDir, 'video.mp4');
      const tempA = path.join(tempDir, 'audio.mp4');
      try {
        await downloadMediaFile(chosenVideoUrl, tempV, media.headers);
        await downloadMediaFile(chosenAudioUrl, tempA, media.headers);
        await mergeVideoAndAudioWithFfmpeg(FFMPEG_PATH, tempV, tempA, targetPath);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } else {
      await downloadMediaFile(chosenVideoUrl, targetPath, media.headers);
    }
  } else {
    // 提取纯音频
    const audioSrc = chosenAudioUrl || chosenVideoUrl;
    if (!audioSrc) throw new Error('未解析出可用音频资源');
    await downloadMediaFile(audioSrc, targetPath, media.headers);
  }

  const sizeBytes = fs.statSync(targetPath).size;
  return {
    path: targetPath,
    sizeBytes,
    sizeMb: `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`,
    title: media.title,
    resolutionLabel: activeResolution?.label,
  };
}
