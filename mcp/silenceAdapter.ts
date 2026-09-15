import fs from 'fs';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';

export interface SilenceDetectResult {
  totalDurationSec: number;
  silenceCount: number;
  speechCount: number;
  silenceSegments: Array<{ startSec: number; endSec: number; durationSec: number }>;
  speechSegments: Array<{ startSec: number; endSec: number; durationSec: number }>;
}

export function detectSilenceWithFfmpeg(
  filePath: string,
  thresholdDb = -35,
  minDurationSec = 0.5
): Promise<SilenceDetectResult> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`文件不存在: ${filePath}`));
    }

    const ffmpegPath = ffmpegStatic as unknown as string;
    if (!ffmpegPath) {
      return reject(new Error('未找到系统 FFmpeg 引擎'));
    }

    const args = [
      '-i', filePath,
      '-af', `silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`,
      '-f', 'null',
      '-',
    ];

    let stderr = '';
    const proc = spawn(ffmpegPath, args);
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (e) => reject(e));

    proc.on('close', (code) => {
      // ffmpeg silencedetect returns 0 on success
      let totalDurationSec = 0;
      const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch) {
        totalDurationSec =
          parseInt(durMatch[1], 10) * 3600 +
          parseInt(durMatch[2], 10) * 60 +
          parseFloat(durMatch[3]);
      }

      const silenceSegments: Array<{ startSec: number; endSec: number; durationSec: number }> = [];
      const lines = stderr.split('\n');

      let currentStart: number | null = null;
      for (const line of lines) {
        const startM = line.match(/silence_start:\s*([\d\.]+)/);
        if (startM) {
          currentStart = parseFloat(startM[1]);
        }
        const endM = line.match(/silence_end:\s*([\d\.]+)\s*\|\s*silence_duration:\s*([\d\.]+)/);
        if (endM) {
          const endSec = parseFloat(endM[1]);
          const durationSec = parseFloat(endM[2]);
          const startSec = currentStart !== null ? currentStart : Math.max(0, endSec - durationSec);
          silenceSegments.push({
            startSec: parseFloat(startSec.toFixed(3)),
            endSec: parseFloat(endSec.toFixed(3)),
            durationSec: parseFloat(durationSec.toFixed(3)),
          });
          currentStart = null;
        }
      }

      // 根据静音段推导人声有效发音段
      const speechSegments: Array<{ startSec: number; endSec: number; durationSec: number }> = [];
      let lastEnd = 0;

      for (const sil of silenceSegments) {
        if (sil.startSec > lastEnd + 0.05) {
          const spDuration = parseFloat((sil.startSec - lastEnd).toFixed(3));
          speechSegments.push({
            startSec: parseFloat(lastEnd.toFixed(3)),
            endSec: parseFloat(sil.startSec.toFixed(3)),
            durationSec: spDuration,
          });
        }
        lastEnd = sil.endSec;
      }

      if (totalDurationSec > lastEnd + 0.05) {
        speechSegments.push({
          startSec: parseFloat(lastEnd.toFixed(3)),
          endSec: parseFloat(totalDurationSec.toFixed(3)),
          durationSec: parseFloat((totalDurationSec - lastEnd).toFixed(3)),
        });
      }

      resolve({
        totalDurationSec: parseFloat(totalDurationSec.toFixed(2)),
        silenceCount: silenceSegments.length,
        speechCount: speechSegments.length,
        silenceSegments,
        speechSegments,
      });
    });
  });
}
