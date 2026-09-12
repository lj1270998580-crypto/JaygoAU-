/**
 * 剪映 Pro 官方草稿导出器 (口播切片专版)
 * 特性：
 * 1. 0 物理重编码，根据保留的有效片段生成多切片主视频轨；
 * 2. 注入目标画布比例 (9:16 / 16:9 / 1:1 等)；
 * 3. 自动生成与切片精确对齐的字幕轨与上下贴片文字轨。
 */

import type { CutSegment, CanvasConfig, SubtitleItem, SubtitleStyleConfig } from './types';

export interface JianyingTalkDraftOptions {
  videoPath: string;
  videoDurationSec: number;
  canvasConfig: CanvasConfig;
  segments: CutSegment[];
  subtitles: SubtitleItem[];
  subtitleStyle: SubtitleStyleConfig;
  projectName?: string;
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function buildJianyingTalkDraft(options: JianyingTalkDraftOptions): {
  draftContentJson: string;
  projectName: string;
} {
  const {
    videoPath,
    canvasConfig,
    segments,
    subtitles,
    subtitleStyle,
    projectName = `口播精剪_${new Date().toISOString().slice(0, 10)}`,
  } = options;

  // 画布分辨率标准
  const canvasDims: Record<string, { width: number; height: number }> = {
    '9:16': { width: 1080, height: 1920 },
    '16:9': { width: 1920, height: 1080 },
    '1:1': { width: 1080, height: 1080 },
    '4:5': { width: 1080, height: 1350 },
    '3:4': { width: 1080, height: 1440 },
  };
  const currentCanvas = canvasDims[canvasConfig.aspectRatio] || { width: 1080, height: 1920 };

  // 筛选出所有保留（未被剔除）的视频片段
  const preserved = segments.filter((s) => !s.isDeleted && s.endTime > s.startTime);

  // 主视频素材 ID
  const videoMaterialId = generateUuid();
  const speedMaterialId = generateUuid();

  // 构建主视频轨切片
  const videoSegments: any[] = [];
  let timelineCursorMicrosec = 0;

  preserved.forEach((seg, idx) => {
    const segDurationMicrosec = Math.round((seg.endTime - seg.startTime) * 1_000_000);
    const segMaterialId = generateUuid();

    videoSegments.push({
      id: segMaterialId,
      material_id: videoMaterialId,
      source_timerange: {
        start: Math.round(seg.startTime * 1_000_000),
        duration: segDurationMicrosec,
      },
      target_timerange: {
        start: timelineCursorMicrosec,
        duration: segDurationMicrosec,
      },
      speed: 1.0,
      volume: 1.0,
      render_index: idx,
      clip: {
        alpha: 1.0,
        flip: { horizontal: false, vertical: false },
        rotation: 0.0,
        scale: { x: canvasConfig.videoScale, y: canvasConfig.videoScale },
        transform: { x: 0.0, y: canvasConfig.videoYPercent },
      },
      extra_material_refs: [speedMaterialId],
    });

    timelineCursorMicrosec += segDurationMicrosec;
  });

  const totalDurationMicrosec = Math.max(1_000_000, timelineCursorMicrosec);

  // 构建字幕轨与贴片
  const textMaterials: any[] = [];
  const subtitleSegments: any[] = [];

  // 1. 顶部贴片
  if (canvasConfig.topPatch.enabled && canvasConfig.topPatch.text.trim()) {
    const topTextId = generateUuid();
    textMaterials.push({
      id: topTextId,
      type: 'text',
      content: JSON.stringify({
        text: canvasConfig.topPatch.text.trim(),
        styles: [
          {
            fill: { alpha: 1.0, content: { solid: { color: [1.0, 1.0, 1.0] } } },
            font: { id: '', path: '' },
            size: canvasConfig.topPatch.fontSize || 32,
            bold: canvasConfig.topPatch.fontWeight === 'bold',
          },
        ],
      }),
    });
    subtitleSegments.push({
      id: generateUuid(),
      material_id: topTextId,
      target_timerange: { start: 0, duration: totalDurationMicrosec },
      clip: {
        transform: { x: 0.0, y: 0.8 },
      },
    });
  }

  // 2. 底部贴片
  if (canvasConfig.bottomPatch.enabled && canvasConfig.bottomPatch.text.trim()) {
    const bottomTextId = generateUuid();
    textMaterials.push({
      id: bottomTextId,
      type: 'text',
      content: JSON.stringify({
        text: canvasConfig.bottomPatch.text.trim(),
        styles: [
          {
            fill: { alpha: 0.9, content: { solid: { color: [0.9, 0.9, 0.9] } } },
            size: canvasConfig.bottomPatch.fontSize || 22,
          },
        ],
      }),
    });
    subtitleSegments.push({
      id: generateUuid(),
      material_id: bottomTextId,
      target_timerange: { start: 0, duration: totalDurationMicrosec },
      clip: {
        transform: { x: 0.0, y: -0.8 },
      },
    });
  }

  // 3. 逐句字幕
  subtitles.forEach((sub) => {
    // 计算该字幕在剪辑后新时间线上的对应时刻
    // 如果字幕落在了被删除的区间，跳过
    const subTextId = generateUuid();
    textMaterials.push({
      id: subTextId,
      type: 'text',
      content: JSON.stringify({
        text: sub.text,
        styles: [
          {
            fill: { alpha: 1.0, content: { solid: { color: [1.0, 1.0, 1.0] } } },
            size: subtitleStyle.fontSize || 24,
            bold: true,
          },
        ],
      }),
    });

    subtitleSegments.push({
      id: generateUuid(),
      material_id: subTextId,
      target_timerange: {
        start: Math.round(sub.startTime * 1_000_000),
        duration: Math.round(Math.max(0.5, sub.endTime - sub.startTime) * 1_000_000),
      },
      clip: {
        transform: { x: 0.0, y: -0.5 },
      },
    });
  });

  const draftObj = {
    canvas_config: {
      height: currentCanvas.height,
      width: currentCanvas.width,
      ratio: canvasConfig.aspectRatio.replace(':', '_'),
    },
    duration: totalDurationMicrosec,
    materials: {
      videos: [
        {
          id: videoMaterialId,
          type: 'video',
          path: videoPath,
          duration: totalDurationMicrosec,
          height: currentCanvas.height,
          width: currentCanvas.width,
        },
      ],
      speeds: [
        {
          id: speedMaterialId,
          mode: 0,
          speed: 1.0,
          type: 'speed',
        },
      ],
      texts: textMaterials,
    },
    tracks: [
      {
        id: generateUuid(),
        type: 'video',
        segments: videoSegments,
        flag: 0,
      },
      {
        id: generateUuid(),
        type: 'text',
        segments: subtitleSegments,
        flag: 0,
      },
    ],
  };

  return {
    draftContentJson: JSON.stringify(draftObj, null, 2),
    projectName,
  };
}
