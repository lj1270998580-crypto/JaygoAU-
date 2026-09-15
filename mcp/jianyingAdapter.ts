import fs from 'fs';
import path from 'path';

export function getJianyingDraftRoots(): string[] {
  const roots: string[] = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    if (localAppData) {
      roots.push(path.join(localAppData, 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'));
      roots.push(path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'));
    }
  } else if (process.platform === 'darwin') {
    const home = process.env.HOME || '';
    if (home) {
      roots.push(path.join(home, 'Movies', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'));
      roots.push(path.join(home, 'Movies', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'));
    }
  }
  return roots;
}

export function detectJianyingInstallation(): { installed: boolean; draftRootPath: string | null } {
  const candidates = getJianyingDraftRoots();
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return { installed: true, draftRootPath: p };
    }
  }
  return { installed: false, draftRootPath: candidates[0] || null };
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ExportJianyingOptions {
  projectName?: string;
  videoPaths?: string[];
  audioPath?: string;
  scriptText?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  subtitles?: Array<{ text: string; startMs: number; endMs: number }>;
  customRootPath?: string;
}

export function exportJianyingDraft(options: ExportJianyingOptions): {
  ok: boolean;
  draftPath?: string;
  projectName?: string;
  error?: string;
} {
  try {
    const detected = detectJianyingInstallation();
    let rootPath = options.customRootPath?.trim() || detected.draftRootPath;
    if (!rootPath) {
      throw new Error('未检测到本地剪映草稿目录，请确认已安装剪映 Pro，或指定 customRootPath');
    }

    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(rootPath, { recursive: true });
    }

    const safeProjectName = (options.projectName || `Jaygo_MCP_${Date.now()}`)
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();
    const projectDir = path.join(rootPath, safeProjectName);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // 画布比例
    const ratio = options.aspectRatio || '9:16';
    const canvasDims: Record<string, { width: number; height: number }> = {
      '9:16': { width: 1080, height: 1920 },
      '16:9': { width: 1920, height: 1080 },
      '1:1': { width: 1080, height: 1080 },
      '4:3': { width: 1440, height: 1080 },
      '3:4': { width: 1080, height: 1440 },
    };
    const { width: canvasWidth, height: canvasHeight } = canvasDims[ratio] || { width: 1080, height: 1920 };

    // 素材池与轨道结构
    const materials: any = {
      videos: [],
      audios: [],
      texts: [],
      speeds: [],
      canvases: [
        {
          album_image: '',
          blur: 0.0,
          color: '',
          id: generateUuid(),
          image: '',
          image_id: '',
          image_name: '',
          source_platform: 0,
          team_id: '',
          type: 'canvas_color',
        },
      ],
    };

    const tracks: any[] = [];
    let currentTimelineOffsetUs = 0;

    // 1. 处理视频素材与视频轨
    if (options.videoPaths && options.videoPaths.length > 0) {
      const videoSegments: any[] = [];
      for (const vPath of options.videoPaths) {
        if (!fs.existsSync(vPath)) continue;
        const videoId = generateUuid();
        const speedId = generateUuid();

        // 默认按 10 秒估算时长（剪映打开后会重新自检视频元数据）
        const durationUs = 10 * 1000 * 1000;

        materials.videos.push({
          id: videoId,
          type: 'video',
          path: path.resolve(vPath),
          duration: durationUs,
          width: canvasWidth,
          height: canvasHeight,
          material_name: path.basename(vPath),
        });

        materials.speeds.push({
          id: speedId,
          type: 'speed',
          speed: 1.0,
        });

        videoSegments.push({
          id: generateUuid(),
          material_id: videoId,
          source_timerange: { start: 0, duration: durationUs },
          target_timerange: { start: currentTimelineOffsetUs, duration: durationUs },
          speed_id: speedId,
          render_index: 0,
          visible: true,
          volume: 1.0,
        });

        currentTimelineOffsetUs += durationUs;
      }

      if (videoSegments.length > 0) {
        tracks.push({
          id: generateUuid(),
          type: 'video',
          segments: videoSegments,
        });
      }
    }

    // 2. 处理独立音频轨
    if (options.audioPath && fs.existsSync(options.audioPath)) {
      const audioId = generateUuid();
      const speedId = generateUuid();
      const audioDurationUs = Math.max(currentTimelineOffsetUs, 15 * 1000 * 1000);

      materials.audios.push({
        id: audioId,
        type: 'audio',
        path: path.resolve(options.audioPath),
        duration: audioDurationUs,
        material_name: path.basename(options.audioPath),
      });

      materials.speeds.push({
        id: speedId,
        type: 'speed',
        speed: 1.0,
      });

      tracks.push({
        id: generateUuid(),
        type: 'audio',
        segments: [
          {
            id: generateUuid(),
            material_id: audioId,
            source_timerange: { start: 0, duration: audioDurationUs },
            target_timerange: { start: 0, duration: audioDurationUs },
            speed_id: speedId,
            volume: 1.0,
          },
        ],
      });
    }

    // 3. 处理字幕文字轨
    if (options.subtitles && options.subtitles.length > 0) {
      const textSegments: any[] = [];
      for (const sub of options.subtitles) {
        if (!sub.text?.trim()) continue;
        const textId = generateUuid();
        const startUs = Math.round(sub.startMs * 1000);
        const durationUs = Math.max(Math.round((sub.endMs - sub.startMs) * 1000), 500 * 1000);

        materials.texts.push({
          id: textId,
          type: 'text',
          content: JSON.stringify({
            styles: [
              {
                fill: { alpha: 1.0, content: { render_type: 'solid', solid: { color: [1.0, 1.0, 1.0] } } },
                font: { id: '', path: '' },
                size: 6.5,
              },
            ],
            text: sub.text.trim(),
          }),
          typesetting: 0,
          alignment: 1,
        });

        textSegments.push({
          id: generateUuid(),
          material_id: textId,
          target_timerange: { start: startUs, duration: durationUs },
          render_index: 10000,
          clip: {
            transform: {
              x: 0.0,
              y: -0.75, // 放置于画面底部黄金字幕位
            },
          },
        });
      }

      if (textSegments.length > 0) {
        tracks.push({
          id: generateUuid(),
          type: 'text',
          segments: textSegments,
        });
      }
    }

    // 构造 draft_content.json
    const draftContent = {
      canvas_config: {
        width: canvasWidth,
        height: canvasHeight,
        ratio,
      },
      duration: Math.max(currentTimelineOffsetUs, 5 * 1000 * 1000),
      materials,
      tracks,
      version: 2,
    };

    // 构造 draft_meta_info.json
    const draftMeta = {
      draft_id: generateUuid(),
      draft_name: safeProjectName,
      draft_fold_path: projectDir,
      draft_timeline_materials_size: 0,
      tm_draft_create: Date.now() * 1000,
      tm_draft_modified: Date.now() * 1000,
      draft_root_path: rootPath,
    };

    fs.writeFileSync(path.join(projectDir, 'draft_content.json'), JSON.stringify(draftContent, null, 2), 'utf-8');
    fs.writeFileSync(path.join(projectDir, 'draft_meta_info.json'), JSON.stringify(draftMeta, null, 2), 'utf-8');

    return {
      ok: true,
      draftPath: projectDir,
      projectName: safeProjectName,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || '导出剪映草稿工程失败',
    };
  }
}
