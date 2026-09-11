/**
 * 剪映专业版 (JianYing Pro Windows) 草稿工程导出器
 *
 * 规范遵循剪映 PC 版项目协议（draft_content.json 与 draft_meta_info.json）：
 * - 时间单位：微秒 (microseconds, 1秒 = 1,000,000 微秒)
 * - 主轨道：原视频轨道（底层）
 * - 画中画轨道：AI 插图贴图轨道（顶层叠加），按起止时间对齐
 * - 转场与动效：支持为插图自动绑定淡入淡出（fade_in / fade_out）动效
 */

import type { VideoIllustrationItem, IllustrationLayout } from '../../types';
import JSZip from 'jszip';

export interface JianyingExportOptions {
  projectName: string;
  videoPath?: string;
  videoDuration?: number;
  videoDimensions?: { width: number; height: number };
  illustrations: VideoIllustrationItem[];
  transitionEffect?: 'fade' | 'slide' | 'zoom' | 'none';
  globalLayout?: IllustrationLayout;
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * 构造剪映 draft_content.json 与 draft_meta_info.json 数据
 */
export function buildJianyingDraftData(opts: JianyingExportOptions) {
  const width = opts.videoDimensions?.width || 1080;
  const height = opts.videoDimensions?.height || 1920;
  const totalDurationUs = Math.round((opts.videoDuration || 30) * 1000000);
  const nowUs = Date.now() * 1000;
  const draftId = generateId();

  // 1. 材料库 (Materials)
  const videosMaterial: any[] = [];
  const speedsMaterial: any[] = [];
  const canvasesMaterial: any[] = [];
  const soundMappingsMaterial: any[] = [];
  const animationsMaterial: any[] = [];

  // 主视频素材 (若有)
  let mainVideoMaterialId = '';
  if (opts.videoPath) {
    mainVideoMaterialId = generateId();
    videosMaterial.push({
      category_id: '',
      category_name: 'local',
      check_flag: 63487,
      crop: {
        lower_left_x: 0.0,
        lower_left_y: 1.0,
        lower_right_x: 1.0,
        lower_right_y: 1.0,
        upper_left_x: 0.0,
        upper_left_y: 0.0,
        upper_right_x: 1.0,
        upper_right_y: 0.0,
      },
      crop_ratio: 'free',
      crop_scale: 1.0,
      duration: totalDurationUs,
      extra_type_option: 0,
      formula_id: '',
      freeze: null,
      gameplay: null,
      has_audio: true,
      height: height,
      id: mainVideoMaterialId,
      intensifies_audio_path: '',
      intensifies_path: '',
      is_ai_generate_content: false,
      is_unified_beauty_mode: false,
      local_id: '',
      local_material_id: '',
      material_id: '',
      material_name: opts.videoPath.split(/[\\/]/).pop() || 'main_video.mp4',
      material_url: '',
      matting: { flag: 0, has_handled: false, interactive: null, path: '', strokes: [] },
      media_path: opts.videoPath,
      object_locked: null,
      origin_material_id: '',
      path: opts.videoPath,
      reverse_intensifies_path: '',
      reverse_path: '',
      source: 0,
      source_platform: 0,
      stable: null,
      team_id: '',
      type: 'video',
      video_algorithm: { algorithms: [], deflicker: null, motion_blur_config: null, noise_reduction: null, path: '', quality_enhance: null, time_range: null },
      width: width,
    });
  }

  // 轨道片段 (Segments)
  const mainTrackSegments: any[] = [];
  if (mainVideoMaterialId) {
    const speedId = generateId();
    speedsMaterial.push({ curve_speed: null, id: speedId, mode: 0, speed: 1.0, type: 'speed' });
    const canvasId = generateId();
    canvasesMaterial.push({ album_image: '', blur: 0.0, color: '', id: canvasId, image: '', image_id: '', radius: 0.0, scale: 1.0, type: 'canvas_color' });
    const soundId = generateId();
    soundMappingsMaterial.push({ audio_channel_mapping: 0, id: soundId, is_config_open: false, type: '' });

    mainTrackSegments.push({
      caption_info: null,
      cartoon: false,
      clip: { alpha: 1.0, flip: { horizontal: false, vertical: false }, rotation: 0.0, scale: { x: 1.0, y: 1.0 }, transform: { x: 0.0, y: 0.0 } },
      common_keyframes: [],
      enable_adjust: true,
      enable_color_curves: true,
      enable_color_match_adjust: false,
      enable_color_wheels: true,
      enable_lut: true,
      enable_smart_color_adjust: false,
      extra_material_refs: [speedId, canvasId, soundId],
      group_id: '',
      hdr_settings: null,
      id: generateId(),
      intensifies_audio: false,
      is_placeholder: false,
      is_tone_modify: false,
      keyframe_refs: [],
      last_nonzero_volume: 1.0,
      material_id: mainVideoMaterialId,
      render_index: 0,
      reverse: false,
      source_timerange: { duration: totalDurationUs, start: 0 },
      speed: 1.0,
      target_timerange: { duration: totalDurationUs, start: 0 },
      template_id: '',
      template_scene_no: 0,
      track_attribute: 0,
      track_render_index: 0,
      visible: true,
      volume: 1.0,
    });
  }

  // 插图画中画轨道片段
  const overlayTrackSegments: any[] = [];
  const validIllustrations = (opts.illustrations || []).filter(
    (it) => it.status === 'success' && (it.localPath || it.imageUrl)
  );

  // 默认缩放与位置参数
  const scaleRatio = opts.globalLayout?.widthPercent || 0.65;
  const transX = opts.globalLayout ? (opts.globalLayout.xPercent - 0.5 + (opts.globalLayout.widthPercent / 2)) * 2 : 0;
  const transY = opts.globalLayout ? -(opts.globalLayout.yPercent - 0.5 + (opts.globalLayout.heightPercent / 2)) * 2 : 0;

  for (const ill of validIllustrations) {
    const illPath = ill.localPath || ill.imageUrl || '';
    const illStartUs = Math.round(ill.startTime * 1000000);
    const illDurationUs = Math.max(500000, Math.round((ill.endTime - ill.startTime) * 1000000));

    const matId = generateId();
    videosMaterial.push({
      category_id: '',
      category_name: 'local',
      check_flag: 63487,
      crop: { lower_left_x: 0.0, lower_left_y: 1.0, lower_right_x: 1.0, lower_right_y: 1.0, upper_left_x: 0.0, upper_left_y: 0.0, upper_right_x: 1.0, upper_right_y: 0.0 },
      crop_ratio: 'free',
      crop_scale: 1.0,
      duration: illDurationUs,
      extra_type_option: 0,
      formula_id: '',
      freeze: null,
      gameplay: null,
      has_audio: false,
      height: 1536,
      id: matId,
      intensifies_audio_path: '',
      intensifies_path: '',
      is_ai_generate_content: false,
      is_unified_beauty_mode: false,
      local_id: '',
      local_material_id: '',
      material_id: '',
      material_name: illPath.split(/[\\/]/).pop() || `illustration_${ill.id}.jpg`,
      material_url: '',
      matting: { flag: 0, has_handled: false, interactive: null, path: '', strokes: [] },
      media_path: illPath,
      object_locked: null,
      origin_material_id: '',
      path: illPath,
      reverse_intensifies_path: '',
      reverse_path: '',
      source: 0,
      source_platform: 0,
      stable: null,
      team_id: '',
      type: 'photo',
      video_algorithm: { algorithms: [], deflicker: null, motion_blur_config: null, noise_reduction: null, path: '', quality_enhance: null, time_range: null },
      width: 2752,
    });

    const speedId = generateId();
    speedsMaterial.push({ curve_speed: null, id: speedId, mode: 0, speed: 1.0, type: 'speed' });
    const canvasId = generateId();
    canvasesMaterial.push({ album_image: '', blur: 0.0, color: '', id: canvasId, image: '', image_id: '', radius: 0.0, scale: 1.0, type: 'canvas_color' });

    const extraRefs = [speedId, canvasId];

    // 淡入淡出动画绑定
    if (opts.transitionEffect !== 'none') {
      const animId = generateId();
      const animFadeDur = Math.min(350000, Math.floor(illDurationUs / 3));
      animationsMaterial.push({
        animations: [
          {
            category_id: 'in',
            category_name: '入场',
            duration: animFadeDur,
            id: generateId(),
            material_type: 'video',
            name: '渐显',
            path: '',
            request_id: '',
            resource_id: 'fade_in',
            start: 0,
            type: 'in',
          },
          {
            category_id: 'out',
            category_name: '出场',
            duration: animFadeDur,
            id: generateId(),
            material_type: 'video',
            name: '渐隐',
            path: '',
            request_id: '',
            resource_id: 'fade_out',
            start: Math.max(0, illDurationUs - animFadeDur),
            type: 'out',
          },
        ],
        id: animId,
        type: 'sticker_animation',
      });
      extraRefs.push(animId);
    }

    overlayTrackSegments.push({
      caption_info: null,
      cartoon: false,
      clip: {
        alpha: 1.0,
        flip: { horizontal: false, vertical: false },
        rotation: 0.0,
        scale: { x: scaleRatio, y: scaleRatio },
        transform: { x: transX, y: transY },
      },
      common_keyframes: [],
      enable_adjust: true,
      enable_color_curves: true,
      enable_color_match_adjust: false,
      enable_color_wheels: true,
      enable_lut: true,
      enable_smart_color_adjust: false,
      extra_material_refs: extraRefs,
      group_id: '',
      hdr_settings: null,
      id: generateId(),
      intensifies_audio: false,
      is_placeholder: false,
      is_tone_modify: false,
      keyframe_refs: [],
      last_nonzero_volume: 1.0,
      material_id: matId,
      render_index: 1,
      reverse: false,
      source_timerange: { duration: illDurationUs, start: 0 },
      speed: 1.0,
      target_timerange: { duration: illDurationUs, start: illStartUs },
      template_id: '',
      template_scene_no: 0,
      track_attribute: 0,
      track_render_index: 1,
      visible: true,
      volume: 1.0,
    });
  }

  // 组装 Tracks 轨道列表
  const tracks: any[] = [];
  if (mainTrackSegments.length > 0) {
    tracks.push({
      attribute: 0,
      flag: 0,
      id: generateId(),
      is_default_name: true,
      name: '原视频主轨',
      segments: mainTrackSegments,
      type: 'video',
    });
  }

  if (overlayTrackSegments.length > 0) {
    tracks.push({
      attribute: 0,
      flag: 0,
      id: generateId(),
      is_default_name: true,
      name: 'AI 插图分镜轨',
      segments: overlayTrackSegments,
      type: 'video',
    });
  }

  // 构造最终 draft_content.json
  const draftContent = {
    canvas_config: {
      height: height,
      ratio: width >= height ? '16:9' : '9:16',
      width: width,
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: nowUs,
    duration: totalDurationUs,
    extra_info: null,
    fps: 30.0,
    free_render_index_mode_on: false,
    group_container: null,
    id: draftId,
    keyframe_graph_list: [],
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    last_modified_platform: { app_id: 3704, app_source: 'lv', app_version: '5.9.0', os: 'windows' },
    materials: {
      audio_balances: [],
      audio_effects: [],
      audio_fades: [],
      audios: [],
      beats: [],
      canvases: canvasesMaterial,
      chromas: [],
      color_curves: [],
      drafts: [],
      effects: [],
      flowers: [],
      green_screens: [],
      handwrites: [],
      hsl: [],
      images: [],
      log_color_wheels: [],
      loudnesses: [],
      manual_deformations: [],
      masks: [],
      material_animations: animationsMaterial,
      material_colors: [],
      placeholders: [],
      plugin_effects: [],
      primary_color_wheels: [],
      realtime_denoises: [],
      shapes: [],
      smart_crops: [],
      smart_relights: [],
      sound_channel_mappings: soundMappingsMaterial,
      speeds: speedsMaterial,
      stickers: [],
      tail_leaders: [],
      text_templates: [],
      texts: [],
      time_marks: [],
      transitions: [],
      video_effects: [],
      video_trackings: [],
      videos: videosMaterial,
      vocal_beautifys: [],
      vocal_separations: [],
    },
    mutable_config: null,
    name: opts.projectName,
    new_version: '116.0.0',
    platform: { app_id: 3704, app_source: 'lv', app_version: '5.9.0', os: 'windows' },
    relationships: [],
    render_index_mode_on: false,
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    tracks: tracks,
    update_time: nowUs,
    version: 360000,
  };

  // 构造 draft_meta_info.json
  const draftMeta = {
    draft_cloud_capcut_id: '',
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: 'draft_cover.jpg',
    draft_fold_path: '',
    draft_id: draftId,
    draft_is_ai_shorts: false,
    draft_is_invisible_in_project_list: false,
    draft_is_read_only: false,
    draft_materials: [],
    draft_materials_copied_info: [],
    draft_name: opts.projectName,
    draft_new_version: '',
    draft_remake_info: null,
    draft_root_path: '',
    draft_timeline_materials_size_: 0,
    draft_type: '',
    tm_draft_cloud_completed: '',
    tm_draft_cloud_modified: 0,
    tm_draft_create: nowUs,
    tm_draft_modified: nowUs,
    tm_draft_removed: 0,
  };

  return { draftContent, draftMeta, draftId };
}

/**
 * 将剪映草稿工程打包为 ZIP 供用户下载保存
 */
export async function createJianyingZipBlob(opts: JianyingExportOptions): Promise<Blob> {
  const { draftContent, draftMeta } = buildJianyingDraftData(opts);
  const zip = new JSZip();
  const folder = zip.folder(opts.projectName) || zip;

  folder.file('draft_content.json', JSON.stringify(draftContent, null, 2));
  folder.file('draft_meta_info.json', JSON.stringify(draftMeta, null, 2));

  return await zip.generateAsync({ type: 'blob' });
}
