import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { chatCompletion, resolveModelInfo } from '../lib/modelHubService';
import type { ModelHubSettings, ModelProviderType } from '../lib/modelHubTypes';
import { PRESET_PROVIDERS } from '../lib/modelHubTypes';
import { runIllustrationPipeline, type PipelineProgress, type PipelineDiagnostics } from '../lib/illustrator';
import { useAdaptiveColumns } from '../lib/useAdaptiveColumns';
import type { VideoIllustrationItem, IllustrationLayout, IllustrationDensity } from '../types';
import {
  Sparkles,
  Wand2,
  Video,
  Upload,
  Play,
  Pause,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Check,
  AlertCircle,
  FolderOpen,
  Image as ImageIcon,
  Key,
  Layers,
  Sliders,
  ChevronDown,
  SplitSquareVertical,
  Maximize,
  Maximize2,
  Mic,
  CheckCircle2,
  BarChart2,
  GitFork,
  Scale,
  Lightbulb,
  Eye,
  X,
  Sparkle,
  Zap,
  ZoomIn,
  ShieldAlert,
  Palette,
  LayoutGrid,
  Film,
  Edit3,
  ChevronUp,
  GripVertical,
} from 'lucide-react';

// =========================================================================
// 官方图片画风预设库 (风格仅约束纯画风与艺术媒介，不绑死信息图/非信息图)
// =========================================================================
export interface StyleConfig {
  id: string;
  label: string;
  badge: string;
  desc: string;
  stylePrompt: string; // 纯粹的美术画风与媒介渲染规范（不绑死信息图/非信息图）
}

export const STYLE_OPTIONS: StyleConfig[] = [
  {
    id: 'modern_business',
    label: '现代商务扁平',
    badge: '现代商务',
    desc: '干净线条 · 莫兰迪商务配色 · 现代留白',
    stylePrompt: '现代商业扁平插画风格，现代办公场景与写实商务元素，干净利落线条，高级克制莫兰迪商务配色，优雅留白，画面主体清晰生动',
  },
  {
    id: 'colored_pencil',
    label: '彩铅手绘插画',
    badge: '温馨手绘',
    desc: '细腻笔触 · 柔和叠色 · 温馨治愈',
    stylePrompt: '细腻彩铅手绘插画风格，彩色铅笔质感排线与柔和颗粒叠色，笔触温润细腻，色调温馨，画面主体轮廓生动',
  },
  {
    id: 'classical_oil',
    label: '古典艺术油画',
    badge: '油画典藏',
    desc: '厚涂肌理 · 伦勃朗光 · 庄重典雅',
    stylePrompt: '欧洲古典油画风格，厚重油画颜料笔触肌理，伦勃朗明暗对照光，庄重沉稳，古典艺术典雅质感',
  },
  {
    id: 'cinematic_real',
    label: '商业写实摄影',
    badge: '真实质感',
    desc: '真实光影 · 微距景深 · 电影质感',
    stylePrompt: '电影级商业写实摄影，真实自然侧光，细腻材质质感，浅景深虚化背景，主体清晰锐利',
  },
  {
    id: 'chinese_ink',
    label: '中国风水墨',
    badge: '东方美学',
    desc: '写意水墨 · 宣纸留白 · 东方意境',
    stylePrompt: '中国传统写意水墨画风格，宣纸微质感肌理，气韵生动，淡墨晕染与浓墨勾勒，东方美学留白，意境悠远',
  },
  {
    id: 'anime_cartoon',
    label: '现代动漫卡通',
    badge: '明快生动',
    desc: '清爽描线 · 赛璐璐平涂 · 鲜艳明快',
    stylePrompt: '精美现代日漫插画风格，干净平滑的描线，明快通透的赛璐璐上色，丰富生动的情绪张力，治愈系现代卡通质感',
  },
  {
    id: 'isometric_3d',
    label: '3D立体渲染',
    badge: '等距建模',
    desc: '等距建模 · 柔光材质 · 立体空间',
    stylePrompt: '3D立体建模渲染，柔和立体环境光照，细腻材质与微光漫反射，空间景深真实生动',
  },
  {
    id: 'watercolor_book',
    label: '清新水彩绘本',
    badge: '通透自然',
    desc: '水色交融 · 纸质纹理 · 温润轻盈',
    stylePrompt: '手绘清新水彩插画，水色自然渗透晕染，通透纯净，水彩纸纹理质感，温柔轻盈',
  },
  {
    id: 'minimal_line',
    label: '极简线条插画',
    badge: '极简艺术',
    desc: '单线手绘 · 极简留白 · 现代艺术',
    stylePrompt: '现代极简单线手绘艺术风格，优雅流畅的轮廓线条，极简留白构图，局部柔和纯色点缀，时尚艺术感',
  },
  {
    id: 'cyberpunk',
    label: '未来科技赛博',
    badge: '未来科技',
    desc: '暗黑冷调 · 霓虹流光 · 未来科幻',
    stylePrompt: '未来赛博朋克科技概念艺术，深邃暗色背景，霓虹蓝紫氛围光晕，全息光影质感，未来科幻张力',
  },
];

// 彻底清除 HEX 码、RGB 码、排版/无水印元词与几何拼图词，防止大模型将指令直接画到画面上
export function sanitizePromptForImageGen(p: string): string {
  if (!p) return '';
  return p
    // 去除十六进制颜色码与 RGB
    .replace(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/g, '')
    .replace(/rgba?\([^)]+\)/gi, '')
    .replace(/[（(]\s*#[^）)]*[）)]/g, '')
    // 去除内部标杆交流词汇
    .replace(/[（(]\s*(图[0-9]|标杆|推荐)[^）)]*[）)]/g, '')
    // 彻底清除导致 SenseNova 印出乱码汉字、水印字样与拼图的指令元词
    .replace(/(8k超清|8k高清|8k|4k|超高清|超清画质|超高分辨率|无水印|无水平|0水印|去除水印|去水印)/gi, '')
    .replace(/(排版整洁有序|排版整洁|排版整齐|整洁有序|排版规范|精致排版|版面整齐)/g, '')
    .replace(/(精致几何矢量构图|几何矢量构图|几何色块|几何拼接|七巧板式构图|七巧板|色块拼接)/g, '')
    .replace(/(指标卡片与数值对比|指标卡片|数值对比|指标卡|卡片看板)/g, '')
    .replace(/统一背景底色基调[：:]?/g, '')
    .replace(/统一核心主色调[：:]?/g, '')
    .replace(/统一辅助高亮\/警示色[：:]?/g, '')
    // 清理标点残余
    .replace(/([，,；;、]){2,}/g, '$1')
    .replace(/[，,；;、]\s*[。！!]/g, '。')
    .replace(/^[，,；;、\s]+/, '')
    .replace(/[，,；;、\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// 课程带货与推销类内容绝对禁配正则
export const SALES_PITCH_REGEX =
  /(购买课程|点击下方|小黄车|拍下|去买|下单|橱窗|私信我|粉丝群|粉丝团|福利价|限时特惠|限时秒杀|原价.*现价|左下角|购物车|链接在|领资料|扣[0-9]|评论区回复|关注直播间|赶紧抢)/;


// 比例尺寸预设（对齐商汤 SenseNova 官方推荐规格）
export const RATIO_OPTIONS = [
  { id: '16:9', label: '16:9 横屏', size: '2752x1536', desc: '宽屏演示/信息图', ratioNum: 16 / 9, cssRatio: '16 / 9' },
  { id: '9:16', label: '9:16 竖屏', size: '1536x2752', desc: '短视频/手机竖卡', ratioNum: 9 / 16, cssRatio: '9 / 16' },
  { id: '1:1', label: '1:1 方形', size: '2048x2048', desc: '画中画封面', ratioNum: 1, cssRatio: '1 / 1' },
  { id: '3:4', label: '3:4 竖卡', size: '1760x2368', desc: '知识清单卡片', ratioNum: 3 / 4, cssRatio: '3 / 4' },
  { id: '4:3', label: '4:3 横卡', size: '2368x1760', desc: '平板信息图', ratioNum: 4 / 3, cssRatio: '4 / 3' },
];

// 3 档密集度选择（满足不同视频节奏与用户风格）
export const DENSITY_OPTIONS: Array<{
  id: IllustrationDensity;
  label: string;
  badge: string;
  interval: number;
  minGap: number;
  desc: string;
}> = [
  {
    id: 'sparse',
    label: '精炼聚焦',
    badge: '抓核心爆点',
    interval: 20,
    minGap: 12,
    desc: '约每 18~25 秒 1 张，只抓全片最核心的 2~3 个关键转折与爆点，留白充分',
  },
  {
    id: 'standard',
    label: '标准均衡',
    badge: '推荐 · 口播教程',
    interval: 12,
    minGap: 6,
    desc: '约每 10~15 秒 1 张，平衡覆盖数据、框架与对比，节奏舒畅自然',
  },
  {
    id: 'dense',
    label: '紧凑密集',
    badge: '高频视觉 · 干货满格',
    interval: 7,
    minGap: 3.5,
    desc: '约每 6~9 秒 1 张，高频视觉化，干货密集吸睛，适合快节奏爆款短视频',
  },
];

// 进出场动效选项
export const TRANSITION_OPTIONS = [
  { id: 'fade', label: '渐隐渐出 (Fade)', desc: '0.35s 柔和淡入淡出，优雅自然' },
  { id: 'slide', label: '侧向滑入 (Slide)', desc: '平滑从侧边滑入画面，动感呈现' },
  { id: 'zoom', label: '弹性弹出 (Zoom)', desc: '微小弹性缩放弹出，吸睛活泼' },
  { id: 'none', label: '直接呈现 (None)', desc: '经典硬切呈现，朴素利落' },
];

// 边框容器预设
export const BORDER_OPTIONS = [
  { id: 'none', label: '经典纯净 (无边框)', desc: '无任何边框，画面自然无痕融合' },
  { id: 'clean_white', label: '极简白边', desc: '精致白色边框配柔和阴影，杂志质感' },
  { id: 'rounded_card', label: '大圆角卡片', desc: '优雅圆角半透明外边，现代感强' },
  { id: 'star_badge', label: '星标徽章', desc: '顶部金黄星标点缀，强化要点' },
  { id: 'cyber_glow', label: '霓虹光晕', desc: '赛博青蓝发光双色边，科技质感' },
];

// 视觉类型映射
export const VISUAL_CATEGORIES: Record<string, { label: string; icon: any; color: string; desc: string }> = {
  scene_narrative: {
    label: '场景叙事',
    icon: Film,
    color: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
    desc: '故事画面 · 人物情感 · 具象镜头',
  },
  concept_metaphor: {
    label: '概念隐喻',
    icon: Lightbulb,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    desc: '商业隐喻 · 抽象具象化 · 视觉意象',
  },
  data_stat: {
    label: '数据图表',
    icon: BarChart2,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    desc: '数值趋势 · 占比圆环 · 统计对比',
  },
  step_framework: {
    label: '步骤框架',
    icon: GitFork,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    desc: '递进阶梯 · 流程导向 · 架构拆解',
  },
  vs_comparison: {
    label: '正反对比',
    icon: Scale,
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    desc: '避坑红线 · 左右优劣 · 打勾打叉',
  },
};

interface VideoIllustratorProps {
  /** 统一大模型中心设置（与 AI 文案工坊共用同一份，保证规划模型一致） */
  modelSettings?: ModelHubSettings;
  onUpdateModelHubSettings?: (s: ModelHubSettings) => void;
  onOpenModelHub?: () => void;
}

export const VideoIllustrator: React.FC<VideoIllustratorProps> = ({
  modelSettings,
  onUpdateModelHubSettings,
  onOpenModelHub,
}) => {
  const { settings, patchSettings, showToast, pendingIllustrator, setPendingIllustrator } = useStore();

  // 当前 AI 规划实际会调用的供应商与模型（此前完全不可见）
  const activeModel = useMemo(() => {
    if (!modelSettings) return null;
    try {
      return resolveModelInfo(modelSettings);
    } catch {
      return null;
    }
  }, [modelSettings]);

  // 规划模型快捷切换（与 AI 文案工坊共用同一份设置，切换后两边一致）
  const [showModelPicker, setShowModelPicker] = useState<boolean>(false);

  const handleQuickSwitchModel = (providerType: ModelProviderType, modelId: string) => {
    if (!modelSettings || !onUpdateModelHubSettings) return;
    const target = modelSettings.providers?.[providerType];
    const hasKey = Boolean(target?.apiKey?.trim());
    const nextSettings: ModelHubSettings = {
      ...modelSettings,
      defaultProvider: providerType,
      providers: {
        ...modelSettings.providers,
        [providerType]: {
          ...(target || {
            type: providerType,
            enabled: true,
            apiKey: '',
            baseUrl: PRESET_PROVIDERS[providerType]?.defaultBaseUrl || '',
            selectedModel: modelId,
          }),
          selectedModel: modelId,
          enabled: true,
        },
      },
    };
    onUpdateModelHubSettings(nextSettings);
    setShowModelPicker(false);

    const preset = PRESET_PROVIDERS[providerType];
    const modelObj = preset?.models.find((m) => m.id === modelId);
    const label = `${preset?.name?.split(' ')[0] || providerType} · ${modelObj?.name || modelId}`;
    if (!hasKey) {
      showToast(`已切换至【${label}】，尚未配置 API Key，正在开启配置…`);
      onOpenModelHub?.();
    } else {
      showToast(`AI 规划模型已切换：【${label}】`);
    }
  };

  // 核心状态
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoPath, setVideoPath] = useState<string>('');
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({ width: 1080, height: 1920 });

  // 规划与生成配置
  const [routingMode, setRoutingMode] = useState<'smart' | 'infographic' | 'standard'>('smart');
  const [defaultStyle, setDefaultStyle] = useState<string>('modern_business');
  const [defaultRatio, setDefaultRatio] = useState<string>('16:9');
  const [density, setDensity] = useState<IllustrationDensity>('standard');
  const [scriptText, setScriptText] = useState<string>('');
  const [asrUtterances, setAsrUtterances] = useState<Array<{ text: string; startTime: number; endTime: number }>>([]);
  const [isAsrExtracting, setIsAsrExtracting] = useState<boolean>(false);
  const [illustrations, setIllustrations] = useState<VideoIllustrationItem[]>([]);
  const [selectedIllustrationId, setSelectedIllustrationId] = useState<string | null>(null);
  // 规划诊断：让「大模型是否真的参与」可见（v0.7.5 起不再静默降级）
  const [planDiagnostics, setPlanDiagnostics] = useState<PipelineDiagnostics | null>(null);

  // 全局排版、动效、边框与交互控制
  const [linkAllPositions, setLinkAllPositions] = useState<boolean>(true);
  const [transitionEffect, setTransitionEffect] = useState<'fade' | 'slide' | 'zoom' | 'none'>('fade');
  const [borderStyle, setBorderStyle] = useState<'none' | 'clean_white' | 'rounded_card' | 'star_badge' | 'cyber_glow'>('none');
  const [isEditingOverlay, setIsEditingOverlay] = useState<boolean>(false);

  // 三栏工作台：自适应栏宽 + 布局模式（v0.7.6）
  // 修复此前「内联固定 px + shrink-0 + 父容器 overflow-hidden」导致中窗口被裁切的问题
  const cols = useAdaptiveColumns({
    storageKey: 'jaygo_illustrator_studio',
    defaultLeft: 330,
    defaultRight: 370,
    minLeft: 260,
    maxLeft: 460,
    minRight: 300,
    maxRight: 560,
    minCenter: 330,
    dividerTotal: 12,
    // 容器宽度（窗口宽 − 侧栏 196px）阈值：
    // 三栏最小可行 = 260 + 12 + 330 + 12 + 300 = 914，故低于 940 降为双栏；
    // 双栏最小可行 = 260 + 12 + 330 = 602，故低于 620 降为专注舞台。
    twoColumnBelow: 940,
    focusBelow: 620,
  });
  const { containerRef: columnsRef, effectiveMode, leftWidth, rightWidth, squeezed } = cols;
  const [isPackagingExpanded, setIsPackagingExpanded] = useState<boolean>(false);

  // 舞台容器高度自适应（替代写死的 66vh，避免大屏浪费 / 小窗溢出）
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const [stageBox, setStageBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageBoxRef.current;
    if (!el) return;
    const update = () => setStageBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [effectiveMode, videoUrl]);

  // 依据容器实测尺寸计算视频舞台尺寸（横屏撑满宽度、竖屏贴合高度，均不溢出）
  const stageSize = useMemo(() => {
    const pad = 16;
    const availW = Math.max(0, stageBox.w - pad);
    const availH = Math.max(0, stageBox.h - pad);
    if (availW <= 0 || availH <= 0) return null;
    const ratio = videoDimensions.width / videoDimensions.height;
    let w = availW;
    let h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    return { width: Math.round(w), height: Math.round(h) };
  }, [stageBox, videoDimensions]);

  // 拖拽居中辅助参考线对齐状态
  const [isSnappingV, setIsSnappingV] = useState<boolean>(false);
  const [isSnappingH, setIsSnappingH] = useState<boolean>(false);

  // 放大视频预览 Modal 控制
  const [showExpandedVideo, setShowExpandedVideo] = useState<boolean>(false);
  const expandedVideoRef = useRef<HTMLVideoElement | null>(null);

  // 全局画面布局（百分比）
  const [globalLayout, setGlobalLayout] = useState<IllustrationLayout>({
    xPercent: 0.11,
    yPercent: 0.26,
    widthPercent: 0.78,
    heightPercent: 0.44,
    positionPreset: 'center',
    transitionEffect: 'fade',
    borderStyle: 'none',
  });

  // 导出合成状态
  const [isExporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportResultPath, setExportResultPath] = useState<string | null>(null);

  // 商汤 API Key 配置浮层
  const [showKeyConfig, setShowKeyConfig] = useState<boolean>(false);
  const [snApiKey, setSnApiKey] = useState<string>('');
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);

  // 悬浮放大与灯箱大图预览状态
  const [hoveredIllustrationId, setHoveredIllustrationId] = useState<string | null>(null);
  const [lightboxItem, setLightboxItem] = useState<VideoIllustrationItem | null>(null);

  // 引用
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startW: number;
    stageW: number;
    stageH: number;
    imgRatio: number;
    isDragging: boolean;
    isResizing: boolean;
  } | null>(null);

  // 响应来自数字人等模块的一键推送视频与文案
  useEffect(() => {
    if (pendingIllustrator) {
      if (pendingIllustrator.videoUrl || pendingIllustrator.videoPath) {
        loadFromUrl(
          pendingIllustrator.videoUrl || pendingIllustrator.videoPath!,
          pendingIllustrator.title || '数字人成片'
        );
      }
      if (pendingIllustrator.scriptText) {
        setScriptText(pendingIllustrator.scriptText);
      }
      setPendingIllustrator(null);
      showToast('已从数字人工坊载入视频与文案！', 'ok');
    }
  }, [pendingIllustrator]);

  // 初始化加载配置与流转中心媒体
  useEffect(() => {
    const key = (settings as any).sensenovaApiKey || '';
    setSnApiKey(key);
    if ((settings as any).sensenovaDefaultStyle) setDefaultStyle((settings as any).sensenovaDefaultStyle);
    if ((settings as any).sensenovaDefaultRatio) setDefaultRatio((settings as any).sensenovaDefaultRatio);
    if ((settings as any).sensenovaRoutingMode) setRoutingMode((settings as any).sensenovaRoutingMode);

    const checkTransferHub = () => {
      try {
        const raw = sessionStorage.getItem('jaygo_transfer_media');
        if (raw) {
          const data = JSON.parse(raw);
          if (data && (data.videoUrl || data.path)) {
            loadFromUrl(data.videoUrl || data.path, data.title || '流转中心带入视频');
            if (data.desc || data.text) {
              setScriptText(data.desc || data.text);
            }
            sessionStorage.removeItem('jaygo_transfer_media');
          }
        }
      } catch {}
    };
    checkTransferHub();
  }, []);

  // 监听 FFmpeg 合成进度
  useEffect(() => {
    const unsub = api.onExportVideoProgress?.((data) => {
      if (videoDuration > 0 && data.currentTimeSec) {
        const pct = Math.min(99, Math.round((data.currentTimeSec / videoDuration) * 100));
        setExportProgress(pct);
      }
    });
    return () => {
      unsub?.();
    };
  }, [videoDuration]);

  // 从本地文件或网络直链载入视频
  const loadFromUrl = (url: string, title?: string) => {
    setVideoUrl(url);
    if (!url.startsWith('http')) {
      setVideoPath(url);
    }
    setVideoTitle(title || '本地导入视频');
    setCurrentTime(0);
    setIsPlaying(false);
    setIllustrations([]);
    setSelectedIllustrationId(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const localPath = (file as any).path;
      if (localPath) {
        loadFromUrl(localPath, file.name);
        showToast(`已载入本地视频：${file.name}`, 'ok');
      } else {
        const objUrl = URL.createObjectURL(file);
        loadFromUrl(objUrl, file.name);
        showToast(`已载入：${file.name}`, 'ok');
      }
    }
  };

  // 当前播放时间命中哪个插图
  const activeIllustration = useMemo(() => {
    return illustrations.find(
      (item) => currentTime >= item.startTime && currentTime <= item.endTime
    );
  }, [illustrations, currentTime]);

  // 当前选定插图的画幅比例对象
  const activeRatioObj = useMemo(() => {
    const ratioId = activeIllustration?.ratio || defaultRatio || '16:9';
    return RATIO_OPTIONS.find((r) => r.id === ratioId) || RATIO_OPTIONS[0];
  }, [activeIllustration?.ratio, defaultRatio]);

  // 将 ASR 提取到的真实发音时间轴吸附对齐到插图列表
  const applyAsrAlignmentToIllustrations = (
    items: VideoIllustrationItem[],
    utts: Array<{ text: string; startTime: number; endTime: number }>
  ) => {
    if (!items.length || !utts.length) return items;
    const dur = videoDuration > 0 ? videoDuration : 60;
    const updated = items.map((item) => {
      const query = (item.contextText || item.concept || '').replace(/[，。！？,.!?\s]/g, '');
      let bestMatch: (typeof utts)[0] | null = null;
      let maxOverlap = 0;

      for (const u of utts) {
        const uText = (u.text || '').replace(/[，。！？,.!?\s]/g, '');
        if (query && uText && (query.includes(uText) || uText.includes(query))) {
          bestMatch = u;
          break;
        }
        let overlap = 0;
        for (const ch of query) {
          if (uText.includes(ch)) overlap++;
        }
        if (overlap > maxOverlap && overlap >= 2) {
          maxOverlap = overlap;
          bestMatch = u;
        }
      }

      if (bestMatch) {
        const itemDur = Math.max(3.0, item.endTime - item.startTime || 4.0);
        const newStart = Math.max(0, bestMatch.startTime);
        const newEnd = Math.min(dur, Math.max(newStart + itemDur, bestMatch.endTime + 0.8));
        return {
          ...item,
          startTime: Math.round(newStart * 10) / 10,
          endTime: Math.round(newEnd * 10) / 10,
        };
      }
      return item;
    });

    return updated;
  };

  // 提取视频音频并执行 ASR 毫秒级对齐
  const handleExtractAsr = async () => {
    const targetSource = videoPath || (videoUrl?.startsWith('file:///') ? videoUrl.replace('file:///', '') : videoUrl);
    if (!targetSource) {
      showToast('请先选择或载入本地视频文件', 'err');
      return;
    }
    setIsAsrExtracting(true);
    showToast('正在提取视频音轨并进行毫秒级文字与时间戳对齐…', 'info');
    try {
      const res = await api.transcribe({ filePath: targetSource, enableSpeakerInfo: false });
      if (res && res.text) {
        if (!scriptText.trim()) {
          setScriptText(res.text);
        }
        const rawUtts = res.utterances || [];
        const utts = rawUtts.map((u: any) => ({
          text: u.text || '',
          startTime: typeof u.startTime === 'number' ? (u.startTime > 1000 ? u.startTime / 1000 : u.startTime) : 0,
          endTime: typeof u.endTime === 'number' ? (u.endTime > 1000 ? u.endTime / 1000 : u.endTime) : 0,
        }));
        setAsrUtterances(utts);
        showToast(`ASR 语音转录完成！共获取 ${utts.length} 句毫秒级时间轴`, 'ok');
        if (illustrations.length > 0) {
          const aligned = applyAsrAlignmentToIllustrations(illustrations, utts);
          setIllustrations(aligned);
          showToast('已将毫秒级发音时间戳自动对齐到现有分镜！', 'ok');
        }
      } else {
        showToast('未识别到有效台词，请确保已配置火山语音识别 API 密匙', 'err');
      }
    } catch (err: any) {
      showToast(err?.message || 'ASR 提取失败', 'err');
    } finally {
      setIsAsrExtracting(false);
    }
  };

  // 拖拽与尺寸调整处理
  const handleMouseDown = (e: React.MouseEvent, isResize: boolean = false) => {
    e.stopPropagation();
    if (!videoContainerRef.current) return;
    const stageRect = videoContainerRef.current.getBoundingClientRect();
    const stageW = stageRect.width;
    const stageH = stageRect.height;
    const ratioVal = activeRatioObj.ratioNum || 16 / 9;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      isDragging: !isResize,
      isResizing: isResize,
      startLeft: globalLayout.xPercent * stageW,
      startTop: globalLayout.yPercent * stageH,
      startW: globalLayout.widthPercent * stageW,
      stageW,
      stageH,
      imgRatio: ratioVal,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvt.clientX - dragRef.current.startX;
      const dy = moveEvt.clientY - dragRef.current.startY;
      const { stageW: sw, stageH: sh, imgRatio: rVal } = dragRef.current;

      if (dragRef.current.isDragging) {
        const currentW = globalLayout.widthPercent * sw;
        const currentH = currentW / rVal;
        const maxLeft = Math.max(0, sw - currentW);
        const maxTop = Math.max(0, sh - currentH);

        let newLeft = Math.max(0, Math.min(maxLeft, dragRef.current.startLeft + dx));
        let newTop = Math.max(0, Math.min(maxTop, dragRef.current.startTop + dy));

        // 磁吸居中对齐检测 (Snap to Center & Guidelines)
        const centerLeft = (sw - currentW) / 2;
        const centerTop = (sh - currentH) / 2;
        let snapV = false;
        let snapH = false;

        // 水平居中吸附阈值（±14px）
        if (Math.abs(newLeft - centerLeft) <= 14) {
          newLeft = centerLeft;
          snapV = true;
        }
        // 垂直居中吸附阈值（±14px）
        if (Math.abs(newTop - centerTop) <= 14) {
          newTop = centerTop;
          snapH = true;
        }

        setIsSnappingV(snapV);
        setIsSnappingH(snapH);

        const xPct = Math.round((newLeft / sw) * 1000) / 1000;
        const yPct = Math.round((newTop / sh) * 1000) / 1000;

        setGlobalLayout((prev) => ({
          ...prev,
          xPercent: xPct,
          yPercent: yPct,
          positionPreset: 'custom',
        }));
      } else if (dragRef.current.isResizing) {
        const rawW = dragRef.current.startW + dx;
        const minW = sw * 0.12;
        const maxW = Math.min(sw * 0.92, (sh * 0.92) * rVal);
        const clampedW = Math.max(minW, Math.min(maxW, rawW));

        const wPct = Math.round((clampedW / sw) * 1000) / 1000;
        const hPct = Math.round((clampedW / rVal / sh) * 1000) / 1000;

        setGlobalLayout((prev) => {
          const safeX = Math.max(0, Math.min(1 - wPct, prev.xPercent));
          const safeY = Math.max(0, Math.min(1 - hPct, prev.yPercent));
          return {
            ...prev,
            xPercent: safeX,
            yPercent: safeY,
            widthPercent: wPct,
            heightPercent: hPct,
            positionPreset: 'custom',
          };
        });
      }
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setIsSnappingV(false);
      setIsSnappingH(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 快速方位吸附预设 (7 点安全停靠矩阵)
  const applyPositionPreset = (
    preset: 'top-left' | 'top' | 'top-right' | 'bottom-left' | 'bottom' | 'bottom-right' | 'center'
  ) => {
    const isVertical = videoDimensions.height > videoDimensions.width;
    const defaultW = isVertical ? 0.78 : 0.44;
    const defaultH = defaultW / (activeRatioObj.ratioNum || 16 / 9);

    let xp = 0.05;
    let yp = 0.05;
    switch (preset) {
      case 'top-left':
        xp = isVertical ? 0.11 : 0.04;
        yp = isVertical ? 0.10 : 0.06;
        break;
      case 'top':
        xp = Math.max(0, (1 - defaultW) / 2);
        yp = isVertical ? 0.10 : 0.06;
        break;
      case 'top-right':
        xp = isVertical ? 1 - defaultW - 0.11 : 1 - defaultW - 0.04;
        yp = isVertical ? 0.10 : 0.06;
        break;
      case 'bottom-left':
        xp = isVertical ? 0.11 : 0.04;
        yp = isVertical ? 0.88 - defaultH : 0.92 - defaultH;
        break;
      case 'bottom':
        xp = Math.max(0, (1 - defaultW) / 2);
        yp = isVertical ? 0.88 - defaultH : 0.92 - defaultH;
        break;
      case 'bottom-right':
        xp = isVertical ? 1 - defaultW - 0.11 : 1 - defaultW - 0.04;
        yp = isVertical ? 0.88 - defaultH : 0.92 - defaultH;
        break;
      case 'center':
      default:
        xp = Math.max(0, (1 - defaultW) / 2);
        yp = isVertical ? 0.26 : Math.max(0, (1 - defaultH) / 2);
        break;
    }

    setGlobalLayout((prev) => ({
      ...prev,
      xPercent: Math.round(xp * 1000) / 1000,
      yPercent: Math.round(yp * 1000) / 1000,
      widthPercent: Math.round(defaultW * 1000) / 1000,
      heightPercent: Math.round(defaultH * 1000) / 1000,
      positionPreset: preset,
    }));
  };

  // 切换默认画幅
  const handleChangeDefaultRatio = (newRatio: string) => {
    setDefaultRatio(newRatio);
    if (activeIllustration) {
      setIllustrations((prev) =>
        prev.map((it) => (it.id === activeIllustration.id ? { ...it, ratio: newRatio } : it))
      );
    }
  };

  // =========================================================================
  // AI 视觉导演分镜规划核心流水线 (基于 7/8 层解耦架构)
  // =========================================================================
  const handleAiPlanIllustrations = async () => {
    if (!scriptText.trim()) {
      showToast('请先输入或加载视频口播文案', 'err');
      return;
    }

    const dur = videoDuration > 0 ? videoDuration : 60;
    const modelHubSettings = (settings as any).modelHubSettings;
    const currentStyleObj = STYLE_OPTIONS.find((s) => s.id === defaultStyle) || STYLE_OPTIONS[0];

    setIsPlanning(true);
    setPlanDiagnostics(null);
    setPipelineProgress({
      stage: 'aligning',
      stepNumber: 1,
      totalSteps: 5,
      stageName: '启动导演流水线',
      message: '正在初始化时间轴与上下文…',
      percent: 10,
    });

    try {
      const diagBox: { value: PipelineDiagnostics | null } = { value: null };
      const planResults = await runIllustrationPipeline({
        scriptText,
        videoDuration: dur,
        density,
        styleId: defaultStyle,
        ratio: defaultRatio || '16:9',
        routingMode,
        asrUtterances: asrUtterances.length > 0 ? asrUtterances : undefined,
        modelHubSettings,
        onProgress: (prog) => {
          setPipelineProgress(prog);
        },
        onDiagnostics: (diag) => {
          diagBox.value = diag;
          setPlanDiagnostics(diag);
        },
      });

      let formatted: VideoIllustrationItem[] = planResults.map((it, idx) => ({
        id: `ill_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        beatId: it.beatId,
        startTime: it.startTime,
        endTime: it.endTime,
        contextText: it.contextText,
        concept: it.concept,
        communicationGoal: it.communicationGoal,
        prompt: it.prompt,
        promptBlocks: it.promptBlocks,
        scenePlan: it.scenePlan,
        visualScore: it.visualScore,
        shot: it.shot,
        type: it.type,
        model: it.model,
        category: it.category,
        style: it.styleId,
        ratio: it.ratio,
        status: 'idle',
      }));

      // 如果有已提取的 ASR 真实发音时间轴，再次对齐微调
      if (asrUtterances.length > 0) {
        formatted = applyAsrAlignmentToIllustrations(formatted, asrUtterances);
      }

      setIllustrations(formatted);
      if (formatted.length > 0) {
        setSelectedIllustrationId(formatted[0].id);
      }
      const d = diagBox.value;
      if (d && !d.usedLLM) {
        // 不再静默降级：明确告知用户本次规划未经过大模型
        showToast(
          `已规划 ${formatted.length} 个分镜，但大模型未参与（${d.fallbackReason || '未知原因'}），本次使用关键词规则兜底`,
          'info'
        );
      } else {
        showToast(
          `AI 导演已规划 ${formatted.length} 个镜头分镜！已锁定【${currentStyleObj.label}】画风`,
          'ok'
        );
      }
    } catch (err: any) {
      showToast(err?.message || '规划分镜失败', 'err');
    } finally {
      setIsPlanning(false);
      setPipelineProgress(null);
    }
  };

  // 批量生成所有待处理插图
  const handleBatchGenerateAll = async () => {
    if (!snApiKey.trim()) {
      setShowKeyConfig(true);
      showToast('请先配置商汤日日新 TokenPlan API Key', 'err');
      return;
    }
    const idleList = illustrations.filter((it) => it.status === 'idle' || it.status === 'failed');
    if (idleList.length === 0) {
      showToast('所有插图均已生成完成', 'ok');
      return;
    }

    showToast(`开始批量生成 ${idleList.length} 张插图…`, 'info');
    for (const item of idleList) {
      await generateSingleItem(item.id);
    }
    showToast('批量生成完成！', 'ok');
  };

  // 生成单张插图
  const generateSingleItem = async (itemId: string) => {
    const item = illustrations.find((it) => it.id === itemId);
    if (!item) return;

    setIllustrations((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: 'generating', error: undefined } : it))
    );

    const ratioObj = RATIO_OPTIONS.find((r) => r.id === item.ratio) || RATIO_OPTIONS[0];

    try {
      const res = await api.sensenovaGenerateImage({
        apiKey: snApiKey.trim(),
        model: item.model,
        prompt: sanitizePromptForImageGen(item.prompt),
        size: ratioObj.size,
        style: item.style,
        imageBase64: item.referenceImage,
      });

      if (res.ok && (res.imageUrl || res.localPath)) {
        setIllustrations((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  status: 'success',
                  imageUrl: res.imageUrl,
                  localPath: res.localPath,
                }
              : it
          )
        );
      } else {
        throw new Error(res.error || '未生成有效图片');
      }
    } catch (err: any) {
      setIllustrations((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, status: 'failed', error: err?.message || '生图失败' } : it
        )
      );
      showToast(`插图【${item.concept}】生成失败：${err?.message || '未知错误'}`, 'err');
    }
  };

  // 手动打点添加一个插图分镜
  const handleAddIllustration = () => {
    const dur = videoDuration > 0 ? videoDuration : 60;
    const st = Math.max(0, Math.round(currentTime * 10) / 10);
    const et = Math.min(dur, Math.round((st + 4.0) * 10) / 10);
    const currentStyleObj = STYLE_OPTIONS.find((s) => s.id === defaultStyle) || STYLE_OPTIONS[0];

    const isInfo = routingMode === 'infographic';
    const newItem: VideoIllustrationItem = {
      id: `ill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      startTime: st,
      endTime: et,
      contextText: '手动打点插图分镜',
      concept: isInfo ? '结构化信息图解' : '重点视觉插画',
      prompt: sanitizePromptForImageGen(
        isInfo
          ? `${currentStyleObj.stylePrompt}。画面呈现实体展板风格的清晰图解：包含核心主题要点与导向指引箭头，光影清晰自然`
          : `${currentStyleObj.stylePrompt}。画面生动展现主体视觉意象与真实场景细节，构图富有张力，光影自然细腻，层次生动丰富`
      ),
      type: isInfo ? 'infographic' : 'standard',
      model: isInfo ? 'sensenova-u1-fast' : 'sensenova-u1.5-lite',
      category: isInfo ? 'step_framework' : 'scene_narrative',
      style: defaultStyle,
      ratio: defaultRatio,
      status: 'idle',
    };

    setIllustrations((prev) => {
      const next = [...prev, newItem].sort((a, b) => a.startTime - b.startTime);
      return next;
    });
    setSelectedIllustrationId(newItem.id);
    showToast('已在当前时间点增加一个插图打点分镜', 'ok');
  };

  // 删除单张插图分镜
  const handleDeleteIllustration = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIllustrations((prev) => prev.filter((it) => it.id !== id));
    if (selectedIllustrationId === id) {
      setSelectedIllustrationId(null);
    }
    showToast('已删除该分镜', 'info');
  };

  // 测试商汤 TokenPlan API Key
  const handleTestKey = async () => {
    if (!snApiKey.trim()) {
      showToast('请输入商汤日日新 TokenPlan API Key', 'err');
      return;
    }
    setIsTestingKey(true);
    try {
      const res = await api.sensenovaTestKey(snApiKey.trim());
      if (res.ok) {
        showToast(res.message || '商汤 TokenPlan 验证成功！', 'ok');
      } else {
        showToast(res.message || '验证失败，请检查 API Key', 'err');
      }
    } catch (err: any) {
      showToast(err?.message || '网络连接异常', 'err');
    } finally {
      setIsTestingKey(false);
    }
  };

  // 保存商汤配置
  const handleSaveConfig = async () => {
    if (!snApiKey.trim()) {
      showToast('API Key 不能为空', 'err');
      return;
    }
    await patchSettings({
      sensenovaApiKey: snApiKey.trim(),
      sensenovaDefaultStyle: defaultStyle,
      sensenovaDefaultRatio: defaultRatio,
      sensenovaRoutingMode: routingMode,
    });
    showToast('商汤配置已保存', 'ok');
    setShowKeyConfig(false);
  };

  // 一键合成导出全部插图到最终视频成片
  const handleExportVideo = async () => {
    const targetSource = videoPath || videoUrl;
    if (!targetSource) {
      showToast('请先载入视频文件', 'err');
      return;
    }

    const readyItems = illustrations.filter((it) => it.status === 'success' && it.localPath);
    if (readyItems.length === 0) {
      showToast('尚无已生成的插图，请先生成插图', 'err');
      return;
    }

    setExporting(true);
    setExportProgress(5);
    setExportResultPath(null);

    try {
      showToast('正在调用 FFmpeg 高清合成视频轨道、进退动效与全部插图序列…', 'info');
      const overlays = readyItems.map((it) => ({
        imagePath: it.localPath!,
        startTime: it.startTime,
        endTime: it.endTime,
        xPercent: globalLayout.xPercent,
        yPercent: globalLayout.yPercent,
        widthPercent: globalLayout.widthPercent,
        heightPercent: globalLayout.heightPercent,
        transitionEffect,
        borderStyle,
      }));

      const res = await api.exportVideoWithOverlays({
        videoPath: targetSource,
        removeOriginalWatermark: true,
        overlays,
      });

      if (res.ok && res.outputPath) {
        setExportProgress(100);
        setExportResultPath(res.outputPath);
        showToast(`视频合成导出完成！共精准叠加 ${overlays.length} 张插图`, 'ok');
      } else {
        throw new Error(res.error || '合成导出失败');
      }
    } catch (err: any) {
      showToast(err?.message || '导出视频失败', 'err');
    } finally {
      setExporting(false);
    }
  };

  // 根据当前选择的边框预设计算 CSS class (经典纯净无边框下彻底去除圆角)
  const getContainerBorderClass = () => {
    switch (borderStyle) {
      case 'clean_white':
        return 'rounded-xl ring-2 ring-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.35)]';
      case 'rounded_card':
        return 'rounded-3xl ring-2 ring-zinc-200/80 dark:ring-zinc-700/80 shadow-2xl';
      case 'star_badge':
        return 'rounded-2xl ring-2 ring-amber-400/90 shadow-[0_0_25px_rgba(245,158,11,0.3)]';
      case 'cyber_glow':
        return 'rounded-xl ring-2 ring-indigo-500/90 shadow-[0_0_25px_rgba(99,102,241,0.45)]';
      default: // 'none'
        return 'rounded-none shadow-xl';
    }
  };

  // 根据当前进出动效计算 CSS 动画 class
  const getTransitionAnimClass = () => {
    switch (transitionEffect) {
      case 'fade':
        return 'anim-ill-fade';
      case 'slide':
        return 'anim-ill-slide';
      case 'zoom':
        return 'anim-ill-zoom';
      default:
        return '';
    }
  };

  // 当前激活插图是否处于末尾 0.35s 退场阶段
  const isNearExit = activeIllustration && activeIllustration.endTime - currentTime <= 0.35;
  const exitFadeClass = isNearExit && transitionEffect === 'fade' ? 'opacity-0 transition-opacity duration-300' : '';

  // 动态生成状态监控
  const generatingIndex = illustrations.findIndex((it) => it.status === 'generating');
  const generatingItem = generatingIndex >= 0 ? illustrations[generatingIndex] : null;

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-50 dark:bg-[#0c0d11] text-zinc-800 dark:text-zinc-200 overflow-hidden select-none">
      {/* 顶部标题栏：呼吸感良好，展示 v0.7.3 特性 */}
      <div className="py-3 px-5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-white dark:bg-[#111217] shrink-0 min-h-[58px]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 via-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-md shrink-0">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">智能视频配插图</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200/60 dark:border-indigo-800/60">
                v0.7.6 · 三栏专业工作台
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/60">
                中文母语提示词
              </span>
            </div>
            <p className="text-[11.5px] text-zinc-400 mt-0.5">
              三栏可调节布局 · 深度上下文物理实体规划 · 实时动态看板 · 提示词自由编辑 · 0乱码去标导出
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* 布局模式切换：三栏 / 双栏 / 专注舞台（窄窗口自动降级并给出提示） */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            {([
              { id: 'three', label: '三栏', title: '配置 + 预览舞台 + 分镜清单（完整工作台）' },
              { id: 'two', label: '双栏', title: '隐藏分镜栏，预览舞台更宽' },
              { id: 'focus', label: '专注', title: '只保留预览舞台，沉浸式核对画面与插图' },
            ] as const).map((m) => {
              const active = cols.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  title={m.title}
                  onClick={() => cols.setMode(m.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {effectiveMode !== cols.mode && (
            <span
              title={`当前可用宽度约 ${cols.containerWidth}px，已自动降级以保证内容完整显示`}
              className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60 whitespace-nowrap"
            >
              窄屏已自动降级为{effectiveMode === 'two' ? '双栏' : '专注舞台'}
            </span>
          )}

          {/* AI 规划模型胶囊：明确显示当前实际调用的供应商与模型，并可快捷切换 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowModelPicker((v) => !v)}
              title="AI 规划所调用的大模型（与 AI 文案工坊共用同一份设置）"
              className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition cursor-pointer flex items-center gap-1.5 max-w-[280px]"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span className="truncate">
                {activeModel ? `AI 规划：${activeModel.model}` : 'AI 规划：未配置模型'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
            </button>

            {showModelPicker && (
              <div className="absolute right-0 top-full mt-1.5 w-[320px] max-h-[380px] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#15161d] shadow-2xl z-50 p-1.5 animate-in fade-in slide-in-from-top-1">
                <div className="px-2 py-1.5 text-[10.5px] text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                  与「AI 文案工坊」共用同一份模型设置，切换后两边一致
                </div>
                {Object.entries(PRESET_PROVIDERS).map(([ptype, preset]) => {
                  const conf = modelSettings?.providers?.[ptype as ModelProviderType];
                  const hasKey = Boolean(conf?.apiKey?.trim());
                  const models = (conf?.customModelName
                    ? preset.models
                    : preset.models).slice(0, 5);
                  return (
                    <div key={ptype} className="mb-1">
                      <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 flex items-center gap-1.5">
                        <span className="truncate">{preset.name}</span>
                        {hasKey ? (
                          <span className="text-emerald-500 shrink-0">已配密匙</span>
                        ) : (
                          <span className="text-zinc-400 shrink-0">未配密匙</span>
                        )}
                      </div>
                      {models.map((m) => {
                        const isActive =
                          activeModel?.providerType === ptype && activeModel?.model === m.id;
                        return (
                          <button
                            key={`${ptype}-${m.id}`}
                            type="button"
                            onClick={() => handleQuickSwitchModel(ptype as ModelProviderType, m.id)}
                            className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] transition cursor-pointer flex items-center justify-between gap-2 ${
                              isActive
                                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 font-semibold'
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <span className="truncate">{m.name || m.id}</span>
                            {isActive && <Check className="w-3 h-3 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setShowModelPicker(false);
                    onOpenModelHub?.();
                  }}
                  className="w-full mt-1 px-2 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
                >
                  打开统一大模型中心（配置密匙 / 自定义模型）
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowKeyConfig((v) => !v)}
            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition cursor-pointer flex items-center gap-1.5"
          >
            <Key className="w-3.5 h-3.5 text-indigo-500" />
            <span>商汤 TokenPlan {snApiKey ? '密匙就绪' : '配置密匙'}</span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* 商汤配置下拉面板 */}
      {showKeyConfig && (
        <div className="bg-zinc-100 dark:bg-[#16171f] border-b border-zinc-200 dark:border-zinc-800 p-4 transition-all animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3 max-w-3xl">
            <div className="flex-1">
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1 block">
                商汤日日新 TokenPlan API Key
              </label>
              <input
                type="password"
                placeholder="输入以 sk- 开头的商汤 TokenPlan API Key"
                value={snApiKey}
                onChange={(e) => setSnApiKey(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleTestKey}
              disabled={isTestingKey}
              className="mt-5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isTestingKey ? '验证中…' : '测试连通性'}
            </button>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="mt-5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow transition cursor-pointer shrink-0"
            >
              保存配置
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-400 flex items-center gap-2">
            <span>驱动 sensenova-u1-fast（信息图）与 sensenova-u1.5-lite（高质感标准图），已开启 watermark: false 去除水印</span>
            <span>•</span>
            <a
              href="https://platform.sensenova.cn/docs"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 hover:underline flex items-center gap-1"
            >
              商汤文档与 TokenPlan 开通
            </a>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 主创作工作区：全新三栏布局（左栏配置文案 + 中栏视频预览 + 右栏分镜详情，支持拖拽调节宽度） */}
      {/* ========================================================================= */}
      <div ref={columnsRef} className="flex-1 flex overflow-hidden min-h-0">
        {/* ========================================================================= */}
        {/* 左栏：常规设置、文案大输入框与排版包装 (宽度自适应，可拖拽调节) */}
        {/* ========================================================================= */}
        {effectiveMode !== 'focus' && (
        <div
          style={{ width: `${leftWidth}px`, minWidth: 0 }}
          className="flex flex-col bg-white dark:bg-[#111217] border-r border-zinc-200 dark:border-zinc-800/80 overflow-y-auto overflow-x-hidden p-3 space-y-3 shrink"
        >
          {/* 路由模式切换 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                <SplitSquareVertical className="w-3 h-3 text-indigo-500" />
                <span>路由模式</span>
              </label>
              <span className="text-[9.5px] text-zinc-400">专精模型分流</span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800">
              {[
                { id: 'smart', label: '智能路由', icon: Sparkles },
                { id: 'infographic', label: '信息图', icon: BarChart2 },
                { id: 'standard', label: '标准图', icon: ImageIcon },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setRoutingMode(m.id as any)}
                  className={`py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1 ${
                    routingMode === m.id
                      ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                  }`}
                >
                  <m.icon className="w-3 h-3" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 图片风格与配图密度同行并列 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                  <Palette className="w-3 h-3 text-rose-500" />
                  <span>图片风格</span>
                </label>
              </div>
              <select
                value={defaultStyle}
                onChange={(e) => setDefaultStyle(e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-[11px] text-zinc-800 dark:text-zinc-200 font-medium focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer truncate"
              >
                {STYLE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                  <LayoutGrid className="w-3 h-3 text-amber-500" />
                  <span>配图密度</span>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-0.5 bg-zinc-100 dark:bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800">
                {DENSITY_OPTIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDensity(d.id);
                      showToast(`已选择【${d.label}】配图`, 'ok');
                    }}
                    title={`${d.label}：${d.desc}`}
                    className={`py-1 rounded-md text-[10.5px] font-medium transition cursor-pointer text-center ${
                      density === d.id
                        ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    {d.label.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 口播文案输入与 ASR 毫秒级时间戳对齐 (显著提升高度至 140px，支持垂直自由拖动拉伸) */}
          <div className="flex flex-col flex-1 min-h-[180px]">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                <span>视频口播文案</span>
                <span className="text-[10px] font-normal text-zinc-400">({scriptText.length} 字)</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cleaned = scriptText.replace(/[*＊]/g, '');
                    setScriptText(cleaned);
                    showToast('已净洗文案中的星号 * 字符', 'ok');
                  }}
                  className="text-[10.5px] text-zinc-400 hover:text-indigo-500 flex items-center gap-0.5 cursor-pointer"
                  title="彻底消除星号，避免语音朗读被污染"
                >
                  <Wand2 className="w-3 h-3 text-purple-500" />
                  <span>去星号</span>
                </button>

                <button
                  type="button"
                  onClick={handleExtractAsr}
                  disabled={isAsrExtracting}
                  className="text-[10.5px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                  title="从视频中精准提取毫秒级句子与发音时间戳"
                >
                  <Mic className="w-3 h-3 text-indigo-500" />
                  <span>{isAsrExtracting ? '提取中…' : 'ASR 打轴'}</span>
                </button>
              </div>
            </div>

            <textarea
              placeholder="粘贴口播台词或点击 ASR 打轴，AI 将深入研判上下文并规划插图…"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              className="w-full h-36 min-h-[140px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y leading-relaxed"
            />

            {asrUtterances.length > 0 && (
              <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded border border-emerald-200/50 dark:border-emerald-900/30">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>已加载 ASR 毫秒级时间轴 ({asrUtterances.length} 句)</span>
                </span>
                <span className="font-mono text-[9.5px]">高精度对齐</span>
              </div>
            )}
          </div>

          {/* AI 智能规划触发大按钮 (带规划中动态波纹与光斑) */}
          <button
            type="button"
            onClick={handleAiPlanIllustrations}
            disabled={isPlanning || !scriptText.trim()}
            className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 ${
              isPlanning
                ? 'bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-700 animate-pulse text-white ring-2 ring-indigo-400/50'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white'
            }`}
          >
            <Wand2 className={`w-4 h-4 shrink-0 ${isPlanning ? 'animate-spin' : ''}`} />
            <span>{isPlanning ? (pipelineProgress ? `${pipelineProgress.stageName} (${pipelineProgress.percent}%)` : 'AI 智能规划中…') : 'AI 智能规划'}</span>
          </button>

          {/* 折叠式“插图包装与排版设置”卡片 */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-2.5 space-y-2">
            <div
              onClick={() => setIsPackagingExpanded((v) => !v)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  插图包装与排版设置
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-500 font-medium">
                  {TRANSITION_OPTIONS.find((t) => t.id === transitionEffect)?.label.slice(0, 4)}
                </span>
                {isPackagingExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                )}
              </div>
            </div>

            {/* 展开的包装排版设置 */}
            {isPackagingExpanded && (
              <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800 space-y-2.5 text-xs animate-in fade-in">
                {/* 顶层开关：全片联动与静默去水印 */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={linkAllPositions}
                      onChange={(e) => setLinkAllPositions(e.target.checked)}
                      className="rounded accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                      全片联动
                    </span>
                  </label>

                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <Check className="w-2.5 h-2.5 text-emerald-500" />
                    <span>静默去水印</span>
                  </span>
                </div>

                {/* 进退动效 */}
                <div>
                  <label className="text-[10.5px] font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500" />
                    <span>插图进退主动效</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {TRANSITION_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTransitionEffect(t.id as any);
                          setGlobalLayout((prev) => ({ ...prev, transitionEffect: t.id as any }));
                          showToast(`已应用【${t.label}】动效`, 'ok');
                        }}
                        className={`px-1.5 py-1 rounded-md text-[10px] font-medium border transition cursor-pointer text-center truncate ${
                          transitionEffect === t.id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                        title={t.desc}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 边框容器预设 */}
                <div>
                  <label className="text-[10.5px] font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                    <Sparkle className="w-3 h-3 text-indigo-500" />
                    <span>边框容器预设 (选无边框为直角)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    {BORDER_OPTIONS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setBorderStyle(b.id as any);
                          setGlobalLayout((prev) => ({ ...prev, borderStyle: b.id as any }));
                          showToast(`已应用【${b.label}】边框`, 'ok');
                        }}
                        className={`px-1.5 py-1 rounded-md text-[10px] font-medium border transition cursor-pointer text-center truncate ${
                          borderStyle === b.id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                        title={b.desc}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 画幅规格 */}
                <div>
                  <label className="text-[10.5px] font-semibold text-zinc-500 mb-1 block">
                    画幅比例
                  </label>
                  <div className="flex items-center gap-1 flex-wrap">
                    {RATIO_OPTIONS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleChangeDefaultRatio(r.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                          (activeIllustration?.ratio || defaultRatio) === r.id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                        title={r.desc}
                      >
                        {r.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 智能吸附方位 (7 点安全停靠矩阵) */}
                <div>
                  <label className="text-[10.5px] font-semibold text-zinc-500 mb-1 block">
                    智能吸附方位 (7点矩阵)
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: 'top-left', label: '左上' },
                      { id: 'top', label: '上中' },
                      { id: 'top-right', label: '右上' },
                      { id: 'center', label: '正中' },
                      { id: 'bottom-left', label: '左下' },
                      { id: 'bottom', label: '下中' },
                      { id: 'bottom-right', label: '右下' },
                    ].map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => applyPositionPreset(pos.id as any)}
                        className={`py-0.5 rounded-md text-[10px] font-medium border transition cursor-pointer text-center ${
                          globalLayout.positionPreset === pos.id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                            : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* 左栏与中栏调节把手 (按住左右拖拽调节左栏宽度) */}
        {effectiveMode !== 'focus' && (
        <div
          onMouseDown={(e) => cols.startResize('left', e)}
          title="按住左右拖拽调节左栏宽度"
          className="w-1.5 hover:w-2 bg-zinc-200/80 dark:bg-zinc-800/80 hover:bg-indigo-500 active:bg-indigo-600 cursor-col-resize transition-all shrink-0 flex items-center justify-center group relative z-10 select-none"
        >
          <div className="w-0.5 h-6 rounded-full bg-zinc-400 dark:bg-zinc-600 group-hover:bg-white transition-colors" />
        </div>
        )}

        {/* ========================================================================= */}
        {/* 中栏：视频预览舞台 (居中大视窗、真实画幅、无多余遮挡、纯图标控制) */}
        {/* ========================================================================= */}
        <div
          ref={stageBoxRef}
          onClick={() => setIsEditingOverlay(false)} // 点击背景区域退出编辑模式，返回纯净无边框预览
          className="flex-1 flex flex-col p-3 bg-zinc-100/50 dark:bg-[#090a0f] overflow-hidden min-w-0 items-center justify-center select-none"
        >
          {videoUrl ? (
            <div className="flex-1 flex flex-col items-center justify-center w-full h-full min-w-0 min-h-0">
              {/* 舞台顶栏信息：分辨率、画幅、坐标提示 */}
              <div className="w-full flex items-center justify-between mb-2 px-1 text-[11px] text-zinc-400 shrink-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 font-mono text-zinc-700 dark:text-zinc-300 font-medium shrink-0">
                    {videoDimensions.width}×{videoDimensions.height} · {videoDimensions.width >= videoDimensions.height ? '横屏视频' : '竖屏视频'}
                  </span>
                  <span className="truncate text-zinc-500">{videoTitle}</span>
                </div>

                <div className="font-mono text-[10.5px] text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200/50 dark:border-indigo-900/40 shrink-0">
                  X {Math.round(globalLayout.xPercent * 100)}% · Y {Math.round(globalLayout.yPercent * 100)}% · 宽 {Math.round(globalLayout.widthPercent * 100)}%
                </div>
              </div>

              {/* 核心视频舞台：尺寸由实测容器宽高计算，横竖屏均自适应且永不溢出 */}
              <div className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-zinc-950/40 rounded-2xl p-2 border border-zinc-200 dark:border-zinc-800 shadow-inner">
                <div
                  ref={videoContainerRef}
                  className="relative rounded-xl overflow-hidden shadow-2xl bg-black select-none"
                  style={{
                    aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}`,
                    width: stageSize ? `${stageSize.width}px` : undefined,
                    height: stageSize ? `${stageSize.height}px` : undefined,
                    maxWidth: '100%',
                    maxHeight: '100%',
                  }}
                >
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onTimeUpdate={() => {
                      if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                    }}
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        setVideoDuration(videoRef.current.duration);
                        const vw = videoRef.current.videoWidth || 1080;
                        const vh = videoRef.current.videoHeight || 1920;
                        setVideoDimensions({ width: vw, height: vh });
                      }
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    className="w-full h-full object-fill block pointer-events-auto"
                  />

                  {/* 拖拽居中吸附辅助对齐参考线 */}
                  {isSnappingV && <div className="snap-line-v" />}
                  {isSnappingH && <div className="snap-line-h" />}

                  {/* 真实画幅插图浮层（默认纯净展示无遮挡，点击后进入编辑模式；经典纯净下无圆角） */}
                  {activeIllustration && (
                    <div
                      key={activeIllustration.id}
                      ref={previewBoxRef}
                      style={{
                        left: `${globalLayout.xPercent * 100}%`,
                        top: `${globalLayout.yPercent * 100}%`,
                        width: `${globalLayout.widthPercent * 100}%`,
                        aspectRatio: activeRatioObj.cssRatio,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsEditingOverlay(true);
                      }}
                      onMouseDown={(e) => {
                        if (isEditingOverlay) {
                          handleMouseDown(e, false);
                        }
                      }}
                      className={`absolute select-none overflow-hidden transition-all duration-200 z-20 flex items-center justify-center ${
                        isEditingOverlay
                          ? `cursor-move ring-2 ring-indigo-500 border-2 border-indigo-400 bg-zinc-900/95 shadow-2xl ${borderStyle === 'none' ? 'rounded-none' : 'rounded-xl'}`
                          : `cursor-pointer ${getContainerBorderClass()} ${getTransitionAnimClass()} ${exitFadeClass}`
                      }`}
                      title={isEditingOverlay ? '拖拽调整位置' : '点击激活编辑控柄调整位置与尺寸'}
                    >
                      {activeIllustration.imageUrl ? (
                        <img
                          src={activeIllustration.imageUrl}
                          alt={activeIllustration.concept}
                          className="w-full h-full object-cover pointer-events-none block"
                        />
                      ) : (
                        <div className="w-full h-full p-2 bg-zinc-900/85 backdrop-blur-md flex flex-col items-center justify-center text-center">
                          <ImageIcon className="w-6 h-6 text-zinc-500 mb-1" />
                          <span className="text-[11px] font-bold text-zinc-200 line-clamp-1">
                            {activeIllustration.concept}
                          </span>
                          <span className="text-[9.5px] text-indigo-400 mt-0.5">
                            {activeIllustration.status === 'generating' ? '生成中…' : '待生成图'}
                          </span>
                        </div>
                      )}

                      {/* 仅在点击激活【编辑模式】后才显示的辅助标签与拉伸控柄（彻底消除平时遮挡） */}
                      {isEditingOverlay && (
                        <>
                          <div className="absolute top-1 left-1 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-md text-[9px] text-white font-medium flex items-center gap-1 pointer-events-none border border-white/10">
                            <span>{VISUAL_CATEGORIES[activeIllustration.category || 'concept_metaphor']?.label || '插图'}</span>
                            <span className="opacity-60">·</span>
                            <span className="font-mono opacity-80">{activeRatioObj.id}</span>
                          </div>

                          <div
                            onMouseDown={(e) => handleMouseDown(e, true)}
                            className="absolute bottom-0 right-0 w-4.5 h-4.5 cursor-se-resize bg-indigo-500 hover:bg-indigo-400 rounded-tl flex items-center justify-center text-white shadow-md transition-colors"
                            title="按住拖拽调节尺寸"
                          >
                            <Maximize className="w-2.5 h-2.5" />
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 播放器内置双行自适应控制条：彻底杜绝 9:16 窄屏下的横向溢出，并提供纯图标按钮 */}
                  <div className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-black/90 via-black/45 to-transparent flex flex-col gap-1.5 text-white">
                    {/* 第一行：全宽独立的播放进度滑动条（彻底防挤压溢出） */}
                    <div className="w-full flex items-center min-w-0">
                      <input
                        type="range"
                        min={0}
                        max={videoDuration || 100}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setCurrentTime(v);
                          if (videoRef.current) videoRef.current.currentTime = v;
                        }}
                        className="w-full min-w-0 accent-indigo-500 cursor-pointer h-1.5 rounded-lg"
                      />
                    </div>

                    {/* 第二行：操作控制与时间戳、图标化按钮 */}
                    <div className="w-full flex items-center justify-between min-w-0 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (videoRef.current) {
                              if (isPlaying) videoRef.current.pause();
                              else videoRef.current.play();
                            }
                          }}
                          className="p-1 rounded-full hover:bg-white/20 transition cursor-pointer shrink-0"
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>

                        <span className="text-[11px] font-mono text-zinc-300 shrink-0 select-none whitespace-nowrap">
                          {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} /{' '}
                          {Math.floor(videoDuration / 60)}:{String(Math.floor(videoDuration % 60)).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleAddIllustration}
                          className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-white transition cursor-pointer shrink-0"
                          title="打点插图 (在当前时间点增加插图)"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowExpandedVideo(true)}
                          className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-indigo-200 hover:text-white transition cursor-pointer shrink-0"
                          title="放大预览 (大视窗全屏播放)"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center max-w-lg mx-auto w-full my-auto">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-500 mb-4 shadow-inner">
                <Video className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-100 mb-1">
                载入需要配插图的视频
              </h3>
              <p className="text-xs text-zinc-400 max-w-xs mb-6">
                支持数字人成片、口播实拍视频（MP4/MOV/WebM），100% 真实画幅舞台呈现
              </p>

              <label className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition cursor-pointer flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>选择本地视频文件</span>
                <input type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
              </label>
            </div>
          )}
        </div>

        {/* 中栏与右栏调节把手 (按住左右拖拽调节右栏宽度) */}
        {effectiveMode === 'three' && (
        <div
          onMouseDown={(e) => cols.startResize('right', e)}
          title="按住左右拖拽调节右栏宽度"
          className="w-1.5 hover:w-2 bg-zinc-200/80 dark:bg-zinc-800/80 hover:bg-indigo-500 active:bg-indigo-600 cursor-col-resize transition-all shrink-0 flex items-center justify-center group relative z-10 select-none"
        >
          <div className="w-0.5 h-6 rounded-full bg-zinc-400 dark:bg-zinc-600 group-hover:bg-white transition-colors" />
        </div>
        )}

        {/* ========================================================================= */}
        {/* 右栏：插图分镜清单、实时动态状态看板与导出区域 (宽度自适应，可拖拽调节) */}
        {/* ========================================================================= */}
        {effectiveMode === 'three' && (
        <div
          style={{ width: `${rightWidth}px`, minWidth: 0 }}
          className="flex flex-col bg-white dark:bg-[#111217] border-l border-zinc-200 dark:border-zinc-800/80 overflow-hidden shrink"
        >
          {/* 顶栏：分镜数量与全部生成按钮 */}
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                插图分镜清单
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">
                {illustrations.length} 个分镜
              </span>
            </div>

            {illustrations.length > 0 && (
              <button
                type="button"
                onClick={handleBatchGenerateAll}
                disabled={illustrations.some((i) => i.status === 'generating')}
                className="px-2.5 py-1 rounded-lg border border-indigo-500/50 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${illustrations.some((i) => i.status === 'generating') ? 'animate-spin' : ''}`} />
                <span>
                  全部生成 ({illustrations.filter((i) => i.status === 'success').length}/{illustrations.length})
                </span>
              </button>
            )}
          </div>

          {/* AI 规划中或图片生成中动态状态看板 */}
          {isPlanning && (
            <div className="mx-3 mt-3 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/40 dark:to-purple-950/40 shadow-sm space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow">
                  <Wand2 className="w-3.5 h-3.5 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-bold text-indigo-700 dark:text-indigo-300 truncate">
                      {pipelineProgress ? `阶段 ${pipelineProgress.stepNumber}/${pipelineProgress.totalSteps}: ${pipelineProgress.stageName}` : 'AI 导演系统正在规划分镜…'}
                    </span>
                    <span className="text-[10px] font-mono text-indigo-500 font-bold">
                      {pipelineProgress?.percent || 20}%
                    </span>
                  </div>
                  <div className="text-[10px] text-indigo-500/80 dark:text-indigo-400/80 mt-0.5 truncate">
                    {pipelineProgress ? pipelineProgress.message : `锁定【${STYLE_OPTIONS.find((s) => s.id === defaultStyle)?.label}】画风`}
                  </div>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${pipelineProgress?.percent || 25}%` }}
                />
              </div>
            </div>
          )}

          {/* 规划诊断看板：明确区分「大模型参与」与「关键词规则兜底」，避免静默降级 */}
          {!isPlanning && planDiagnostics && (
            <div
              className={`mx-3 mt-3 p-2.5 rounded-xl border text-[10.5px] space-y-1 ${
                planDiagnostics.usedLLM
                  ? 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30'
                  : 'border-amber-300 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                {planDiagnostics.usedLLM ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-300">大模型视觉导演已参与规划</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="text-amber-700 dark:text-amber-300">大模型未参与，本次为关键词规则兜底</span>
                  </>
                )}
              </div>
              {!planDiagnostics.usedLLM && planDiagnostics.fallbackReason && (
                <div className="text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                  原因：{planDiagnostics.fallbackReason}
                </div>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-600 dark:text-zinc-400 font-mono">
                {activeModel && (
                  <span className="text-purple-600 dark:text-purple-400">
                    模型 {activeModel.model}
                  </span>
                )}
                <span>分镜 {planDiagnostics.totalBeats}</span>
                <span>信息图 {planDiagnostics.infographicCount}</span>
                <span>标准图 {planDiagnostics.standardCount}</span>
                <span>锚点覆盖 {Math.round(planDiagnostics.averageCoverage * 100)}%</span>
                {typeof planDiagnostics.batches === 'number' && planDiagnostics.batches > 1 && (
                  <span>分片 {planDiagnostics.batches} 批</span>
                )}
                {(planDiagnostics.splits || 0) > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    截断自动降片 {planDiagnostics.splits} 次
                  </span>
                )}
                {planDiagnostics.diversityAdjusted > 0 && (
                  <span className="text-indigo-600 dark:text-indigo-400">
                    多样性校正 {planDiagnostics.diversityAdjusted} 处
                  </span>
                )}
              </div>
            </div>
          )}

          {generatingItem && !isPlanning && (
            <div className="mx-3 mt-3 p-3 rounded-xl border border-indigo-400 dark:border-indigo-600/80 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 shadow-sm space-y-1.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>正在绘制第 {generatingIndex + 1}/{illustrations.length} 张插图</span>
                </div>
                <span className="text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400">
                  {generatingItem.ratio} · {generatingItem.model === 'sensenova-u1-fast' ? 'u1-fast' : 'u1.5-lite'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate font-medium">
                正在绘制：【{generatingItem.concept}】
              </p>
              <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-pulse transition-all duration-300"
                  style={{
                    width: `${Math.max(10, Math.round(((generatingIndex + 0.5) / Math.max(1, illustrations.length)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* 分镜清单列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {illustrations.length === 0 && !isPlanning ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400">
                <Layers className="w-8 h-8 mb-2 opacity-40 text-indigo-500" />
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  暂无规划插图
                </p>
                <p className="text-[11px] mt-1 max-w-[200px]">
                  在左栏输入口播文案后点击【AI 智能规划】，即可生成具象实体插图分镜
                </p>
              </div>
            ) : (
              illustrations.map((item, idx) => {
                const categoryObj = VISUAL_CATEGORIES[item.category || 'concept_metaphor'] || VISUAL_CATEGORIES.concept_metaphor;
                const CatIcon = categoryObj.icon;
                const isSelected = selectedIllustrationId === item.id;
                const isHovered = hoveredIllustrationId === item.id;
                const isItemGenerating = item.status === 'generating';

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedIllustrationId(item.id);
                      if (videoRef.current) {
                        videoRef.current.currentTime = item.startTime;
                      }
                      setCurrentTime(item.startTime);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                      isItemGenerating
                        ? 'border-indigo-500 ring-2 ring-indigo-500/80 ring-offset-2 dark:ring-offset-zinc-900 bg-indigo-50/50 dark:bg-indigo-950/40 shadow-md animate-pulse'
                        : isSelected
                        ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 ring-1 ring-indigo-500 shadow-sm'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#14151c] hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {/* 分镜头部：序号、起止时段、分类标签与删除 */}
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          #{idx + 1}
                        </span>
                        <span className="font-mono text-zinc-600 dark:text-zinc-400">
                          {item.startTime}s - {item.endTime}s (~{(item.endTime - item.startTime).toFixed(1)}s)
                        </span>

                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium flex items-center gap-1 border ${categoryObj.color}`}>
                          <CatIcon className="w-2.5 h-2.5" />
                          <span>{categoryObj.label}</span>
                        </span>

                        <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          {item.model === 'sensenova-u1-fast' ? 'u1-fast' : 'u1.5-lite'}
                        </span>

                        {typeof item.visualScore === 'number' && (
                          <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-bold" title="Visual Need Score (视觉需求价值评分)">
                            🎯 V:{item.visualScore.toFixed(2)}
                          </span>
                        )}

                        {item.shot && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-500 dark:text-purple-400 border border-purple-500/20 font-medium">
                            {item.shot === 'wide' ? '全景' : item.shot === 'medium' ? '中景' : item.shot === 'close' ? '特写' : item.shot === 'overhead' ? '俯瞰' : item.shot}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteIllustration(item.id, e)}
                        className="p-1 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        title="删除该分镜"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* 台词语义原句 */}
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed mb-1 font-script-reading">
                      “{item.contextText}”
                    </p>

                    {item.communicationGoal && (
                      <div className="text-[9.5px] text-amber-600 dark:text-amber-400/90 font-medium mb-1.5 flex items-center gap-1 bg-amber-50/60 dark:bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-200/50 dark:border-amber-800/30">
                        <span className="shrink-0">🎬 目标:</span>
                        <span className="truncate">{item.communicationGoal.replace(/^1秒读懂[：:]?\s*/, '')}</span>
                      </div>
                    )}

                    {/* 概念、缩略图与重新生成微型按钮 */}
                    <div className="flex items-center gap-2 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
                      <div
                        className="relative w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center shrink-0 cursor-zoom-in group"
                        onMouseEnter={() => setHoveredIllustrationId(item.id)}
                        onMouseLeave={() => setHoveredIllustrationId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxItem(item);
                        }}
                      >
                        {item.imageUrl ? (
                          <>
                            <img src={item.imageUrl} alt={item.concept} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <ZoomIn className="w-3.5 h-3.5" />
                            </div>
                          </>
                        ) : (
                          <ImageIcon className="w-4 h-4 text-zinc-400" />
                        )}

                        {item.status === 'success' && (
                          <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                            <Check className="w-2 h-2" />
                          </div>
                        )}

                        {/* 悬停浮动放大查看 Tooltip */}
                        {isHovered && item.imageUrl && (
                          <div
                            className="fixed z-50 pointer-events-none p-2 rounded-xl bg-zinc-900/95 border border-zinc-700 shadow-2xl backdrop-blur-md"
                            style={{
                              transform: 'translate(-110%, -50%)',
                            }}
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.concept}
                              className="max-w-[280px] max-h-[280px] rounded-lg object-contain block shadow-lg"
                            />
                            <div className="mt-1 text-[10px] text-zinc-300 font-medium truncate">
                              {item.concept} · {item.ratio}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.concept}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            比例: {item.ratio}
                          </span>
                          {item.status === 'generating' && (
                            <span className="text-[9.5px] text-indigo-500 font-medium animate-pulse flex items-center gap-1">
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              <span>绘制中…</span>
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <span className="text-[9.5px] text-rose-500 font-medium truncate max-w-[110px]" title={item.error}>
                              失败: {item.error}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 重新生成微型按钮 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateSingleItem(item.id);
                        }}
                        disabled={item.status === 'generating'}
                        className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[10.5px] font-medium transition cursor-pointer shrink-0 flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${item.status === 'generating' ? 'animate-spin text-indigo-500' : ''}`} />
                        <span>{item.status === 'success' ? '重新生成' : '生成'}</span>
                      </button>
                    </div>

                    {/* 可编辑的提示词多行文本框 */}
                    <div className="mt-2 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-zinc-400 flex items-center gap-0.5">
                          <Edit3 className="w-2.5 h-2.5 text-indigo-400" />
                          <span>提示词 (可直接修改)</span>
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        value={item.prompt}
                        onChange={(e) => {
                          const val = e.target.value;
                          setIllustrations((prev) =>
                            prev.map((it) => (it.id === item.id ? { ...it, prompt: val } : it))
                          );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="输入或微调提示词…"
                        className="w-full px-2 py-1 text-[10.5px] leading-snug rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-zinc-800 dark:text-zinc-200 focus:ring-1 focus:ring-indigo-500 focus:bg-white dark:focus:bg-zinc-900 outline-none resize-y transition"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 底部导出操作区 */}
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-[#13141a] space-y-2 shrink-0">
            {isExporting && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                  <span>FFmpeg 高清视频合成中 (含进退动效与去水印)…</span>
                  <span className="font-mono text-indigo-400">{exportProgress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}

            {exportResultPath && !isExporting && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate mr-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="truncate text-emerald-700 dark:text-emerald-300 font-medium">
                    {exportResultPath}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => api.showItemInFolder?.(exportResultPath)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium shrink-0 transition cursor-pointer flex items-center gap-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>定位文件</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportVideo}
              disabled={isExporting || illustrations.filter((i) => i.status === 'success').length === 0}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? '合成导出中…' : '导出视频'}</span>
            </button>
          </div>
        </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 视频大视窗全屏放大预览 Modal (响应用户诉求 1：支持大屏沉浸播放与插图动效精细核对) */}
      {/* ========================================================================= */}
      {showExpandedVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowExpandedVideo(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full max-h-[92vh] bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* 顶栏 */}
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between text-zinc-200">
              <div className="flex items-center gap-2 truncate mr-4">
                <span className="font-bold text-sm text-white truncate">{videoTitle}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {videoDimensions.width}×{videoDimensions.height} · 放大预览模式
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowExpandedVideo(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
                title="关闭大屏预览"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 大视窗视频播放与同步插图浮层 */}
            <div className="flex-1 min-h-[55vh] max-h-[70vh] bg-black flex items-center justify-center p-4 relative overflow-hidden">
              <div
                className="relative rounded-xl overflow-hidden shadow-2xl bg-black select-none max-w-full max-h-full"
                style={{
                  aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}`,
                  height: '65vh',
                }}
              >
                <video
                  ref={expandedVideoRef}
                  src={videoUrl}
                  onTimeUpdate={() => {
                    if (expandedVideoRef.current) setCurrentTime(expandedVideoRef.current.currentTime);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="w-full h-full object-fill block"
                  controls={false}
                  autoPlay={isPlaying}
                />

                {/* 同步渲染插图浮层 */}
                {activeIllustration && (
                  <div
                    key={activeIllustration.id}
                    style={{
                      left: `${globalLayout.xPercent * 100}%`,
                      top: `${globalLayout.yPercent * 100}%`,
                      width: `${globalLayout.widthPercent * 100}%`,
                      aspectRatio: activeRatioObj.cssRatio,
                    }}
                    className={`absolute select-none overflow-hidden transition-all duration-200 z-20 flex items-center justify-center ${getContainerBorderClass()} ${getTransitionAnimClass()} ${exitFadeClass}`}
                  >
                    {activeIllustration.imageUrl ? (
                      <img
                        src={activeIllustration.imageUrl}
                        alt={activeIllustration.concept}
                        className="w-full h-full object-cover pointer-events-none block"
                      />
                    ) : (
                      <div className="w-full h-full p-2 bg-zinc-900/85 backdrop-blur-md flex flex-col items-center justify-center text-center">
                        <ImageIcon className="w-6 h-6 text-zinc-500 mb-1" />
                        <span className="text-[11px] font-bold text-zinc-200 line-clamp-1">
                          {activeIllustration.concept}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 大屏底栏控制条 */}
            <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/90 flex flex-col gap-2">
              <div className="w-full flex items-center min-w-0">
                <input
                  type="range"
                  min={0}
                  max={videoDuration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setCurrentTime(v);
                    if (expandedVideoRef.current) expandedVideoRef.current.currentTime = v;
                    if (videoRef.current) videoRef.current.currentTime = v;
                  }}
                  className="w-full min-w-0 accent-indigo-500 cursor-pointer h-1.5 rounded-lg"
                />
              </div>

              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (expandedVideoRef.current) {
                        if (isPlaying) expandedVideoRef.current.pause();
                        else expandedVideoRef.current.play();
                      }
                    }}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <span className="text-xs font-mono text-zinc-300">
                    {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} /{' '}
                    {Math.floor(videoDuration / 60)}:{String(Math.floor(videoDuration % 60)).padStart(2, '0')}
                  </span>
                </div>

                <div className="text-xs text-zinc-400">
                  动效：{TRANSITION_OPTIONS.find((t) => t.id === transitionEffect)?.label} · 边框：{BORDER_OPTIONS.find((b) => b.id === borderStyle)?.label}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 插图大图灯箱 Lightbox Modal (点击图片缩略图查看) */}
      {/* ========================================================================= */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl w-full max-h-[90vh] bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl overflow-hidden flex flex-col"
          >
            {/* 灯箱顶栏 */}
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between text-zinc-200">
              <div className="flex items-center gap-2 truncate mr-4">
                <span className="font-bold text-sm text-white truncate">{lightboxItem.concept}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {lightboxItem.ratio} · {lightboxItem.model}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {lightboxItem.localPath && (
                  <button
                    type="button"
                    onClick={() => {
                      if (lightboxItem.localPath) api.showItemInFolder?.(lightboxItem.localPath);
                    }}
                    className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>查看原文件</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLightboxItem(null)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 大图主体 */}
            <div className="flex-1 min-h-[50vh] max-h-[70vh] bg-black/40 flex items-center justify-center p-4 overflow-hidden">
              {lightboxItem.imageUrl ? (
                <img
                  src={lightboxItem.imageUrl}
                  alt={lightboxItem.concept}
                  className="max-w-full max-h-[66vh] object-contain rounded-lg shadow-2xl block"
                />
              ) : (
                <div className="text-zinc-500 text-xs">暂无图片数据</div>
              )}
            </div>

            {/* 提示词详情展示 */}
            <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400 space-y-1">
              <div className="text-zinc-300 font-medium flex items-center justify-between">
                <span>生成提示词 Prompt:</span>
                <span className="text-[11px] text-zinc-500">时段: {lightboxItem.startTime}s - {lightboxItem.endTime}s</span>
              </div>
              <p className="line-clamp-2 select-text font-mono text-[11px] text-zinc-300 bg-zinc-900 p-2 rounded border border-zinc-800">
                {lightboxItem.prompt}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoIllustrator;

