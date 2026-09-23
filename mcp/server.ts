#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { mcpExtractMedia, mcpDownloadMedia } from './extractorAdapter';
import { detectJianyingInstallation, exportJianyingDraft } from './jianyingAdapter';
import { detectSilenceWithFfmpeg } from './silenceAdapter';
import { planScriptIllustrations } from './illustratorAdapter';
import ffmpegStatic from 'ffmpeg-static';

const APP_VERSION = '0.7.48';

// 创建标准 MCP 服务端实例
const server = new Server(
  {
    name: 'jaygo-au-mcp',
    version: APP_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 1. 定义对外暴露的 6 大工具元数据
const TOOLS: Tool[] = [
  {
    name: 'jaygo_extract_media',
    description:
      '解析短视频或图文分享链接（全面支持抖音、哔哩哔哩、快手、小红书及网络直链），提取 100% 真实无水印超清 1080P/原画母带直链、真实文件预估体积、多清晰度规格列表、作品完整正文文案与高清无损图集。',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '短视频或作品的分享链接，或包含分享链接的任意文本（如抖音/小红书分享口令）',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'jaygo_download_media',
    description:
      '将无水印超清原画视频或原声音频流式下载到本地磁盘。若视频为 DASH 纯画面分离流，将自动调用 FFmpeg 无损混音；普通 MP4 原片秒级高速直存，100% 完整保留创作者口播原声。',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '短视频作品分享链接',
        },
        output_path: {
          type: 'string',
          description: '保存的本地完整文件路径或目标文件夹路径（若留空则自动保存至系统的 Downloads 目录）',
        },
        resolution_id: {
          type: 'string',
          description: '指定的清晰度规格 ID（如 bili_80, dy_1080_0, h265 等，留空则默认选择最高超清原画母带）',
        },
        type: {
          type: 'string',
          enum: ['video', 'audio'],
          description: '下载类型：video 为超清视频，audio 为提取纯原声音频，默认为 video',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'jaygo_export_jianying',
    description:
      '将给定的视频素材、配音音频、台词字幕一键打包生成为标准的剪映 Pro (CapCut) 本地草稿工程。自动写入 draft_content.json，用户打开剪映软件即可直接成片！',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: '剪映草稿工程名称',
        },
        video_paths: {
          type: 'array',
          items: { type: 'string' },
          description: '要放入主视频轨的本地视频文件路径列表',
        },
        audio_path: {
          type: 'string',
          description: '配音音频文件本地路径（如 TTS 生成的 mp3/wav）',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['9:16', '16:9', '1:1', '3:4', '4:3'],
          description: '画布宽高比例，默认为 9:16（竖屏短视频）',
        },
        subtitles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: '字幕台词文本' },
              startMs: { type: 'number', description: '开始时间（毫秒）' },
              endMs: { type: 'number', description: '结束时间（毫秒）' },
            },
            required: ['text', 'startMs', 'endMs'],
          },
          description: '字幕轨时间轴切片列表',
        },
        custom_root_path: {
          type: 'string',
          description: '自定义剪映草稿存放根目录（留空则自动探测系统默认安装路径）',
        },
      },
      required: ['project_name'],
    },
  },
  {
    name: 'jaygo_plan_illustrations',
    description:
      '根据输入的台词文案智能规划 AI 视频分镜与视觉提示词。自动切分分镜节拍，生成精美构图、镜头景别（特写/全景/中景）以及高质量中英文 AI 绘画提示词。',
    inputSchema: {
      type: 'object',
      properties: {
        script_text: {
          type: 'string',
          description: '口播台词、小说故事或解说文案正文',
        },
        style_slug: {
          type: 'string',
          enum: [
            'chinese-guochao',
            'cinematic_real',
            'claymation',
            'anime_cartoon',
            'cyberpunk',
            'watercolor_book',
          ],
          description: '分镜画面艺术风格，默认为 cinematic_real（电影级写实）',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['9:16', '16:9', '1:1'],
          description: '画面画幅比例，默认为 9:16',
        },
      },
      required: ['script_text'],
    },
  },
  {
    name: 'jaygo_detect_silence',
    description:
      '使用 FFmpeg 高精度声学算法分析音视频中的停顿气口与有效人声段落，返回毫秒级时间戳切片，供 AI Agent 进行自动口播粗剪、声学气口去除或字幕时间轴校准。',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '本地音频或视频文件的完整绝对路径',
        },
        threshold_db: {
          type: 'number',
          description: '静音判定阈值（单位：分贝 dB），默认为 -35dB（越低越严格）',
        },
        min_silence_ms: {
          type: 'number',
          description: '最小静音持续时间（毫秒），默认为 500ms',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'jaygo_system_status',
    description:
      '探测本地 Jaygo AU 运行环境与安装状态，返回系统版本、本地剪映 Pro 草稿目录路径、FFmpeg 引擎状态及受支持的平台与艺术画风列表。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// 2. 响应工具列表请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// 3. 响应工具调用请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'jaygo_extract_media': {
        const { url } = args as { url: string };
        if (!url) throw new Error('缺少必要参数: url');
        const media = await mcpExtractMedia(url);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: true,
                  platform: media.platform,
                  platformName: media.platformName,
                  title: media.title,
                  author: media.author,
                  desc: media.desc,
                  coverUrl: media.coverUrl,
                  durationSec: media.durationSec,
                  primaryVideoUrl: media.videoUrl,
                  primaryAudioUrl: media.audioUrl,
                  resolutions: media.resolutions?.map((r) => ({
                    id: r.id,
                    label: r.label,
                    sizeEstimated: r.sizeEstimated,
                    format: r.format,
                    isDefault: r.isDefault,
                    videoUrl: r.videoUrl,
                  })),
                  imagesCount: media.images?.length || 0,
                  rawImages: media.rawImages || media.images,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'jaygo_download_media': {
        const { url, output_path, resolution_id, type } = args as any;
        if (!url) throw new Error('缺少必要参数: url');
        const res = await mcpDownloadMedia({
          url,
          outputPath: output_path,
          resolutionId: resolution_id,
          type: type || 'video',
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: true,
                  message: `媒体文件已成功保存到本地`,
                  savedPath: res.path,
                  sizeMb: res.sizeMb,
                  sizeBytes: res.sizeBytes,
                  title: res.title,
                  resolution: res.resolutionLabel || '最高超清',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'jaygo_export_jianying': {
        const { project_name, video_paths, audio_path, script_text, aspect_ratio, subtitles, custom_root_path } =
          args as any;
        if (!project_name) throw new Error('缺少必要参数: project_name');
        const res = exportJianyingDraft({
          projectName: project_name,
          videoPaths: video_paths,
          audioPath: audio_path,
          scriptText: script_text,
          aspectRatio: aspect_ratio,
          subtitles,
          customRootPath: custom_root_path,
        });
        if (!res.ok) throw new Error(res.error || '导出剪映草稿失败');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: true,
                  message: '剪映 Pro 草稿工程已成功创建，打开剪映软件即可在首页查看编辑',
                  draftPath: res.draftPath,
                  projectName: res.projectName,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'jaygo_plan_illustrations': {
        const { script_text, style_slug, aspect_ratio } = args as any;
        if (!script_text) throw new Error('缺少必要参数: script_text');
        const res = planScriptIllustrations({
          scriptText: script_text,
          styleSlug: style_slug,
          aspectRatio: aspect_ratio,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(res, null, 2),
            },
          ],
        };
      }

      case 'jaygo_detect_silence': {
        const { file_path, threshold_db, min_silence_ms } = args as any;
        if (!file_path) throw new Error('缺少必要参数: file_path');
        const res = await detectSilenceWithFfmpeg(
          file_path,
          threshold_db ?? -35,
          (min_silence_ms ?? 500) / 1000
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: true,
                  totalDurationSec: res.totalDurationSec,
                  silenceCount: res.silenceCount,
                  speechCount: res.speechCount,
                  silenceSegments: res.silenceSegments,
                  speechSegments: res.speechSegments,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'jaygo_system_status': {
        const jianying = detectJianyingInstallation();
        const ffmpegOk = Boolean(ffmpegStatic);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: true,
                  app: 'Jaygo AU Model Context Protocol (MCP) Server',
                  version: APP_VERSION,
                  protocolVersion: '2024-11-05',
                  system: {
                    platform: process.platform,
                    nodeVersion: process.version,
                  },
                  jianyingPro: {
                    detected: jianying.installed,
                    draftRootPath: jianying.draftRootPath,
                  },
                  ffmpeg: {
                    available: ffmpegOk,
                    binaryPath: ffmpegStatic as unknown as string,
                  },
                  supportedPlatforms: ['douyin', 'bilibili', 'kuaishou', 'xiaohongshu', 'generic'],
                  supportedIllustrationStyles: [
                    'chinese-guochao (国潮新中式)',
                    'cinematic_real (电影级写实)',
                    'claymation (黏土定格动画)',
                    'anime_cartoon (二次元日漫)',
                    'cyberpunk (赛博朋克)',
                    'watercolor_book (绘本水彩)',
                  ],
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`未知的工具请求: ${name}`);
    }
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `[Jaygo MCP Error] ${err?.message || String(err)}`,
        },
      ],
    };
  }
});

// 4. 启动 Stdio 传输通道连接
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 向 stderr 打印启动信息（注意：stdio 通信中 stdout 只能传输 JSON-RPC，日志必须走 stderr）
  console.error(`[Jaygo AU MCP Server v${APP_VERSION}] Stdio 管道已建立，就绪等待 Agent 调用。`);
}

run().catch((err) => {
  console.error('[Jaygo AU MCP Server] 启动致命错误:', err);
  process.exit(1);
});
