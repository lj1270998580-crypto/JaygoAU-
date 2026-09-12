import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { chatCompletion, resolveModelInfo, subscribeModelCalls, type ModelCallEvent } from '../lib/modelHubService';
import type { ModelHubSettings, ModelProviderType } from '../lib/modelHubTypes';
import { PRESET_PROVIDERS } from '../lib/modelHubTypes';
import { runIllustrationPipeline, type PipelineProgress, type PipelineDiagnostics } from '../lib/illustrator';
import { enforceStrictSequentialTimeline, MAX_ILLUSTRATION_DURATION, MIN_ILLUSTRATION_DURATION } from '../lib/illustrator/timelineAligner';
import { useAdaptiveColumns } from '../lib/useAdaptiveColumns';
import type { VideoIllustrationItem, IllustrationLayout, IllustrationDensity, IllustrationHistoryRecord, CharacterConsistencyMode } from '../types';
import { AdvancedTimelineModal } from './AdvancedTimelineModal';
import { buildJianyingDraftData, createJianyingZipBlob } from '../lib/illustrator/jianyingExporter';
import {
  Sparkles,
  Wand2,
  Video,
  Upload,
  Play,
  // v0.7.16：历史作品 / 保存 / 重置（History 与 DOM 全局类型同名，故加别名）
  History as HistoryIcon,
  Save,
  RotateCcw,
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
  ChevronRight,
  ChevronLeft,
  GripVertical,
  UserCheck,
  ImagePlus,
} from 'lucide-react';

// =========================================================================
// 官方图片画风预设库 (风格仅约束纯画风与艺术媒介，不绑死信息图/非信息图)
// =========================================================================
import {
  LAYOUTS,
  type LayoutSpec,
} from '../lib/illustrator/layoutBible';
import LayoutSelectorModal from './LayoutSelectorModal';
import StyleSelectorModal from './StyleSelectorModal';

export interface StyleConfig {
  id: string;
  label: string;
  badge: string;
  desc: string;
  stylePrompt: string; // 纯粹的美术画风与媒介渲染规范（不绑死信息图/非信息图）
}

export const STYLE_OPTIONS: StyleConfig[] = [
  {
    id: 'auto',
    label: '自动 (AI 语义分析匹配)',
    badge: '智能统一',
    desc: '大模型通读全文案调性，智能匹配最契合的全片统一画风',
    stylePrompt: '由 AI 视觉导演根据全文文案调性自动匹配最契合的全片统一画风',
  },
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
  // v0.7.18 新增：专为「信息图」分支准备的信息图表风。
  // 此前 10 个风格全是插画艺术风，路由判定某句该出对比图/流程图时，
  // 风格却可能是古典油画或水墨，最终编出「用油画笔触画数据对比图」这种组合。
  {
    id: 'infographic_clean',
    label: '现代信息图表',
    badge: '数据可视化',
    desc: '网格对齐 · 层级清晰 · 克制的强调色',
    stylePrompt: '现代专业信息图表设计，干净的网格对齐与清晰的视觉层级，克制的强调色，图形化表达取代写实描绘，平滑纯色块与精准几何描边',
  },
  // v0.7.19 新增：对齐官方 sn-infographic 的 66 种风格，补齐实际缺口
  {
    id: 'chinese-guochao',
    label: '新中式国潮',
    badge: '国潮',
    desc: '朱砂描金 · 东方纹样 · 古典新潮',
    stylePrompt: '新中式国潮视觉设计，传统东方纹样与当代平面构成结合，朱砂红石青描金配色，宣纸底纹与烫金线条',
  },
  {
    id: 'claymation',
    label: '黏土定格',
    badge: '手工质感',
    desc: '手捏肌理 · 圆润造型 · 温暖亲切',
    stylePrompt: '黏土定格动画质感，手工捏塑的圆润造型与可见指痕肌理，柔和影棚打光，微缩场景构图',
  },
  {
    id: 'chalkboard',
    label: '黑板教学',
    badge: '知识科普',
    desc: '粉笔笔迹 · 板书布局 · 讲解感强',
    stylePrompt: '黑板粉笔手绘教学风格，深墨绿板面与白色粉笔笔迹颗粒质感，板书式布局，重点用粉笔圈画强调',
  },
  {
    id: 'swiss-style',
    label: '瑞士国际主义',
    badge: '理性排版',
    desc: '严格网格 · 理性留白 · 克制的红黑',
    stylePrompt: '瑞士国际主义平面设计，严格网格系统与无衬线字体，大量理性留白，克制的黑白红配色，纯净平涂',
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
    // 保留段落换行，规避行内连续空格，并将过多空行收缩为双换行
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 课程带货与推销类内容禁配正则
// v0.7.8：此前这里是第二份独立定义（且更窄、从未被使用），会与 semanticParser
// 里的那一份各自漂移。现统一从 semanticParser 复用，保证全链路一套规则。
export { SALES_PITCH_REGEX, isSalesPitch } from '../lib/illustrator/semanticParser';


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
  historical_recreation: {
    label: '历史还原',
    icon: Film,
    color: 'text-stone-500 bg-stone-500/10 border-stone-500/20',
    desc: '年代场景 · 纪实还原 · 时代器物',
  },
  product_showcase: {
    label: '实体陈列',
    icon: Layers,
    color: 'text-teal-500 bg-teal-500/10 border-teal-500/20',
    desc: '材质细节 · 产品特写 · 静物陈列',
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

  // 当前生效模型的清晰可读名称（包含自定义供应商名，如 [OpenRouter] openrouter/free）
  const activeModelDisplay = useMemo(() => {
    if (!activeModel) return 'AI 规划：未配置模型';
    const conf = modelSettings?.providers?.[activeModel.providerType as ModelProviderType];
    const provName = (activeModel.providerType === 'custom' && conf?.customProviderName?.trim())
      ? conf.customProviderName.trim()
      : (PRESET_PROVIDERS[activeModel.providerType as ModelProviderType]?.name?.split(' ')[0] || activeModel.providerType);
    return `AI 规划: [${provName}] ${activeModel.model}`;
  }, [activeModel, modelSettings]);

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
    const provName = (providerType === 'custom' && target?.customProviderName?.trim())
      ? target.customProviderName.trim()
      : (preset?.name?.split(' ')[0] || providerType);
    const modelObj = preset?.models.find((m) => m.id === modelId);
    const label = `${provName} · ${modelObj?.name || modelId}`;
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
  const [defaultStyle, setDefaultStyle] = useState<string>('auto');
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>('auto');
  const [showLayoutModal, setShowLayoutModal] = useState<boolean>(false);
  const [showStyleModal, setShowStyleModal] = useState<boolean>(false);
  // v0.7.20：信息图（数据/对比/流程）单独一套画风。
  // 叙事图要插画质感、信息图要清晰可读的数据可视化，用同一套是矛盾的
  //（选水墨则信息图也变得不适合读数；选信息图表则叙事图没有人物场景）。
  const [infographicStyle, setInfographicStyle] = useState<string>('infographic_clean');
  const [defaultRatio, setDefaultRatio] = useState<string>('16:9');
  const [density, setDensity] = useState<IllustrationDensity>('standard');
  /** v0.7.26：故事角色一致性模式 */
  const [characterMode, setCharacterMode] = useState<CharacterConsistencyMode>('auto');
  /** v0.7.26：用户指定全局主角设定描述 */
  const [customCharacterPrompt, setCustomCharacterPrompt] = useState<string>('');
  /** v0.7.26：宽屏双栏工作台模式（隐藏设置侧边栏） */
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  /** v0.7.26：专业波形时间轴抽屉模态框 */
  const [showAdvancedTimeline, setShowAdvancedTimeline] = useState<boolean>(false);
  /** v0.7.26：剪映导出与菜单状态 */
  const [isExportingJianying, setIsExportingJianying] = useState<boolean>(false);
  const [jianyingDraftResult, setJianyingDraftResult] = useState<{ path?: string; isZip?: boolean } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  const [scriptText, setScriptText] = useState<string>('');
  const [asrUtterances, setAsrUtterances] = useState<Array<{ text: string; startTime: number; endTime: number }>>([]);
  const [isAsrExtracting, setIsAsrExtracting] = useState<boolean>(false);
  const [illustrations, setIllustrations] = useState<VideoIllustrationItem[]>([]);
  const [selectedIllustrationId, setSelectedIllustrationId] = useState<string | null>(null);
  // 规划诊断：让「大模型是否真的参与」可见（v0.7.5 起不再静默降级）
  const [planDiagnostics, setPlanDiagnostics] = useState<PipelineDiagnostics | null>(null);
  // v0.7.12：诊断横幅默认收成一行，避免长期占据右栏大量纵向空间
  const [diagExpanded, setDiagExpanded] = useState<boolean>(false);
  // v0.7.12：悬停放大预览跟随鼠标位置
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // v0.7.14：大模型调用实时状态。
  // 规划阶段可能串行跑十几轮请求、持续数分钟，中途限流/超时/Key 失效时
  // 此前界面上毫无反馈，用户只能看到进度条不动。现在每次调用结束都实时显示。
  const [modelCalls, setModelCalls] = useState<ModelCallEvent[]>([]);
  // v0.7.14：规划失败的完整原因（不再只弹一个会被截断的 toast）
  const [planError, setPlanError] = useState<string | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeModelCalls((event) => {
      // 只保留最近 8 条，避免长时间运行时无限增长
      setModelCalls((prev) => [...prev, event].slice(-8));
    });
    return unsubscribe;
  }, []);

  // 全局排版、动效、边框与交互控制
  const [linkAllPositions, setLinkAllPositions] = useState<boolean>(true);
  const [transitionEffect, setTransitionEffect] = useState<'fade' | 'slide' | 'zoom' | 'none'>('fade');
  const [borderStyle, setBorderStyle] = useState<'none' | 'clean_white' | 'rounded_card' | 'star_badge' | 'cyber_glow'>('none');
  const [isEditingOverlay, setIsEditingOverlay] = useState<boolean>(false);

  // 三栏工作台：自适应栏宽 + 布局模式（v0.7.32：扩容右栏默认宽度至 400px，彻底消灭界面挤压）
  const cols = useAdaptiveColumns({
    storageKey: 'jaygo_illustrator_studio_v2',
    defaultLeft: 310,
    defaultRight: 400,
    minLeft: 250,
    maxLeft: 480,
    minRight: 320,
    maxRight: 640,
    minCenter: 320,
    dividerTotal: 14,
    twoColumnBelow: 860,
    focusBelow: 580,
  });
  const { containerRef: columnsRef, effectiveMode, leftWidth, rightWidth, squeezed } = cols;
  const [isPackagingExpanded, setIsPackagingExpanded] = useState<boolean>(false);

  // 舞台容器高度自适应（替代写死的 66vh，避免大屏浪费 / 小窗溢出）
  // v0.7.8 修复：ref 之前挂在带 p-3 的外层容器上，而计算只减了 16px，
  // 导致横向高估 26px、纵向高估约 51px（还漏算了顶部信息栏），
  // 使视频容器大于真实可用空间 —— 中窗口被 flex 压缩变形、大窗口溢出被裁切。
  // 现改为直接测量「视频槽位」这一层（p-2 + 1px 边框），只扣它自己的内边距。
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const [stageBox, setStageBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageBoxRef.current;
    if (!el) return;
    const update = () => {
      // clientWidth/Height 含 padding 不含 border；槽位内边距为 p-2 = 8px × 2
      const cs = window.getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
      const padY = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0');
      setStageBox({
        w: Math.max(0, el.clientWidth - padX),
        h: Math.max(0, el.clientHeight - padY),
      });
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [effectiveMode, videoUrl]);

  // 依据槽位实测尺寸计算视频尺寸（横屏撑满宽度、竖屏贴合高度，均不溢出）
  // 高度严格由取整后的宽度按画幅推导，保证宽高比精确；外层再用 object-contain 兜底，
  // 即使有 ±1px 误差也只会留边，绝不会拉伸变形。
  const stageSize = useMemo(() => {
    const availW = stageBox.w;
    const availH = stageBox.h;
    if (availW <= 0 || availH <= 0) return null;
    const ratio = videoDimensions.width / videoDimensions.height;
    if (!Number.isFinite(ratio) || ratio <= 0) return null;

    let w = availW;
    let h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    const rw = Math.max(1, Math.floor(w));
    const rh = Math.max(1, Math.round(rw / ratio));
    return { width: rw, height: rh };
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

  // v0.7.16：重置所用的初始布局（避免每次重置都手写一遍常量而漂移）
  const DEFAULT_LAYOUT: IllustrationLayout = useMemo(() => ({
    xPercent: 0.11,
    yPercent: 0.26,
    widthPercent: 0.78,
    heightPercent: 0.44,
    positionPreset: 'center',
    transitionEffect: 'fade',
    borderStyle: 'none',
  }), []);

  // v0.7.16：历史作品。此前工作台是纯内存状态，点重置或关掉应用就全丢，
  // 而重新规划一次要跑好几分钟的大模型请求。
  const [historyRecords, setHistoryRecords] = useState<IllustrationHistoryRecord[]>([]);
  // v0.7.17：历史作品改为整页切换（与「数字人」板块一致）。
  // 此前是塞在左栏里的一个 max-h-56 小面板，左栏本来就窄，一屏看不到两条，
  // 缩略信息也挤成一团，基本没法用。
  const [activeView, setActiveView] = useState<'create' | 'history'>('create');

  // 导出合成状态与画质控制
  const [isExporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportResultPath, setExportResultPath] = useState<string | null>(null);
  const [exportQuality, setExportQuality] = useState<'master' | 'high' | 'fast'>('master');
  const [removeOriginalWatermark, setRemoveOriginalWatermark] = useState<boolean>(false);

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
    // v0.7.24：严格校验已保存的标准画风，若为旧版遗留的 infographic_clean 或无效值，一律默认使用 auto
    const savedStyle = (settings as any).sensenovaDefaultStyle;
    if (savedStyle && savedStyle !== 'infographic_clean' && STYLE_OPTIONS.some((s) => s.id === savedStyle)) {
      setDefaultStyle(savedStyle);
    } else {
      setDefaultStyle('auto');
    }
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
    // v0.7.17 修复：此前只在非 http 时才 setVideoPath，导致「先载入本地视频 A、
    // 再载入网络视频 B」时 videoPath 仍残留 A —— 而导出用的是
    // `videoPath || videoUrl`，于是会拿 A 去合成，用户完全看不出为什么导出的
    // 是自己上一个视频。现在明确区分：网络视频必须清空本地路径。
    setVideoPath(url.startsWith('http') ? '' : url);
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
  // v0.7.8：用户上传的图片优先使用其**原始宽高比**（customAspect），
  // 与模型生成图共用的 RATIO_OPTIONS 彻底解耦 —— 比例挂在 item 上，
  // defaultRatio 只对生成图生效。
  const activeRatioObj = useMemo(() => {
    const custom = activeIllustration?.customAspect;
    if (typeof custom === 'number' && Number.isFinite(custom) && custom > 0) {
      return {
        id: 'custom',
        label: '原始比例',
        size: '',
        desc: '跟随上传图片的原始比例',
        ratioNum: custom,
        cssRatio: `${custom}`,
      };
    }
    const ratioId = activeIllustration?.ratio || defaultRatio || '16:9';
    return RATIO_OPTIONS.find((r) => r.id === ratioId) || RATIO_OPTIONS[0];
  }, [activeIllustration?.ratio, activeIllustration?.customAspect, defaultRatio]);

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
        // 单图时长严格限制在 [2.5s, 6.0s] 黄金区间，绝不超过 6 秒 (v0.7.32 修复长句膨胀问题)
        let targetDur = item.endTime - item.startTime;
        if (!targetDur || targetDur > MAX_ILLUSTRATION_DURATION || targetDur < MIN_ILLUSTRATION_DURATION) {
          targetDur = 3.8;
        }
        const asrDuration = Math.min(
          MAX_ILLUSTRATION_DURATION,
          Math.max(MIN_ILLUSTRATION_DURATION, bestMatch.endTime - bestMatch.startTime)
        );
        const finalDuration = Math.min(MAX_ILLUSTRATION_DURATION, Math.max(targetDur, asrDuration));
        const newStart = Math.max(0, bestMatch.startTime);
        const newEnd = Math.min(dur, newStart + finalDuration);
        return {
          ...item,
          startTime: Math.round(newStart * 10) / 10,
          endTime: Math.round(newEnd * 10) / 10,
        };
      }
      return item;
    });

    // 运行严格单调防重叠时序算法，彻底根除出入点冲突重叠
    return enforceStrictSequentialTimeline(updated, dur, MAX_ILLUSTRATION_DURATION, MIN_ILLUSTRATION_DURATION, 0.1);
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
        // v0.7.11 修复：原先对 startTime / endTime **各自独立**判断是否 >1000 决定要不要除以 1000，
        // 一旦两个字段量级不同（一个已是秒、一个是毫秒），就会把 start 转成 370 而 end 转成 161.9，
        // 产生 start > end 的负时长分镜。现改为按两个字段的共同量级统一判断单位。
        const utts = rawUtts.map((u: any) => {
          const rawStart = typeof u.startTime === 'number' ? u.startTime : 0;
          const rawEnd = typeof u.endTime === 'number' ? u.endTime : 0;
          const looksLikeMs = Math.max(Math.abs(rawStart), Math.abs(rawEnd)) > 1000;
          return {
            text: u.text || '',
            startTime: looksLikeMs ? rawStart / 1000 : rawStart,
            endTime: looksLikeMs ? rawEnd / 1000 : rawEnd,
          };
        });
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

    // v0.7.12 修复：此前竖屏用 defaultW = 0.78，导致左上/上中/右上算出的 x 全是 0.11
    // （0.11 / (1-0.78)/2=0.11 / 1-0.78-0.11=0.11），三个预设横向位置完全一致，
    // 表现就是「只能上下移动、点左右没反应」。
    // 现改为：角位与边位使用较小尺寸，保证左右确实能分开；正中保留较大尺寸。
    const isCornerOrEdge = preset !== 'center';
    const defaultW = isCornerOrEdge
      ? (isVertical ? 0.54 : 0.34)
      : (isVertical ? 0.78 : 0.44);
    const defaultH = defaultW / (activeRatioObj.ratioNum || 16 / 9);

    const margin = isVertical ? 0.05 : 0.04;
    const topY = isVertical ? 0.08 : 0.06;
    const bottomY = (isVertical ? 0.92 : 0.94) - defaultH;

    let xp = margin;
    let yp = topY;
    switch (preset) {
      case 'top-left':
        xp = margin;
        yp = topY;
        break;
      case 'top':
        xp = Math.max(0, (1 - defaultW) / 2);
        yp = topY;
        break;
      case 'top-right':
        xp = 1 - defaultW - margin;
        yp = topY;
        break;
      case 'bottom-left':
        xp = margin;
        yp = bottomY;
        break;
      case 'bottom':
        xp = Math.max(0, (1 - defaultW) / 2);
        yp = bottomY;
        break;
      case 'bottom-right':
        xp = 1 - defaultW - margin;
        yp = bottomY;
        break;
      case 'center':
      default:
        xp = Math.max(0, (1 - defaultW) / 2);
        yp = isVertical ? 0.26 : Math.max(0, (1 - defaultH) / 2);
        break;
    }

    setGlobalLayout((prev) => ({
      ...prev,
      xPercent: Math.round(Math.max(0, Math.min(1 - defaultW, xp)) * 1000) / 1000,
      yPercent: Math.round(Math.max(0, Math.min(1 - defaultH, yp)) * 1000) / 1000,
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
    const modelHubSettings = modelSettings || (settings as any).modelHubSettings;
    const currentStyleObj = STYLE_OPTIONS.find((s) => s.id === defaultStyle) || STYLE_OPTIONS[0];

    setIsPlanning(true);
    setPlanDiagnostics(null);
    setModelCalls([]);
    setPlanError(null);
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
        infographicStyleId: infographicStyle,
        infographicLayout: selectedLayoutId,
        characterMode,
        customCharacterPrompt,
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
        negativePrompt: it.negativePrompt,
        promptBlocks: it.promptBlocks,
        scenePlan: it.scenePlan,
        visualScore: it.visualScore,
        shot: it.shot,
        type: it.type,
        model: it.model,
        category: it.category,
        style: it.styleId,
        ratio: it.ratio,
        storyArcId: it.storyArcId,
        characterAnchor: it.characterAnchor,
        status: 'idle',
      }));

      // 如果有已提取的 ASR 真实发音时间轴，再次对齐微调
      if (asrUtterances.length > 0) {
        formatted = applyAsrAlignmentToIllustrations(formatted, asrUtterances);
      }

      // v0.7.32：全局单调递增防碰撞与时长硬限（单图 ≤6 秒，相邻保留 100ms 间隙，彻底杜绝重叠与出入点错乱）
      const knownDur = videoDuration > 0 ? videoDuration : 0;
      formatted = enforceStrictSequentialTimeline(
        formatted,
        knownDur,
        MAX_ILLUSTRATION_DURATION,
        MIN_ILLUSTRATION_DURATION,
        0.1
      );

      setIllustrations(formatted);
      if (formatted.length > 0) {
        setSelectedIllustrationId(formatted[0].id);
      }
      const d = diagBox.value;
      if (d && !d.usedLLM) {
        // 不再静默降级：明确告知用户本次规划未经过大模型
        showToast(
          `已规划 ${formatted.length} 个分镜，但大模型未参与（${d.fallbackReason || '未知原因'}）`,
          'info'
        );
      } else {
        showToast(
          `AI 导演已规划 ${formatted.length} 个镜头分镜！已锁定【${currentStyleObj.label}】画风`,
          'ok'
        );
      }
    } catch (err: any) {
      // v0.7.14：失败原因完整保留在面板里（toast 放不下长文本，且会自动消失）
      const msg = err?.message || '规划分镜失败';
      setPlanError(msg);
      showToast(msg.length > 60 ? `${msg.slice(0, 60)}…（详见右侧面板）` : msg, 'err');
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
        negativePrompt: item.negativePrompt,
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

  // v0.7.26：并发生成 3 个候选变体供用户挑选
  const generateItemVariants = async (itemId: string) => {
    const item = illustrations.find((it) => it.id === itemId);
    if (!item) return;

    setIllustrations((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: 'generating', error: undefined } : it))
    );
    showToast(`正在为【${item.concept}】并发生成 3 个候选变体…`, 'info');

    const ratioObj = RATIO_OPTIONS.find((r) => r.id === item.ratio) || RATIO_OPTIONS[0];

    try {
      const res = await api.sensenovaGenerateImage({
        apiKey: snApiKey.trim(),
        model: item.model,
        prompt: sanitizePromptForImageGen(item.prompt),
        negativePrompt: item.negativePrompt,
        size: ratioObj.size,
        style: item.style,
        imageBase64: item.referenceImage,
        n: 3,
      });

      if (res.ok && res.variants && res.variants.length > 0) {
        setIllustrations((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  status: 'success',
                  imageUrl: res.imageUrl,
                  localPath: res.localPath,
                  variants: res.variants,
                }
              : it
          )
        );
        showToast(`成功生成 ${res.variants.length} 个候选变体！可点击下方缩略图切换选用`, 'ok');
      } else if (res.ok && (res.imageUrl || res.localPath)) {
        setIllustrations((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  status: 'success',
                  imageUrl: res.imageUrl,
                  localPath: res.localPath,
                  variants: [res.imageUrl!],
                }
              : it
          )
        );
        showToast('已生成候选图片', 'ok');
      } else {
        throw new Error(res.error || '未生成有效变体');
      }
    } catch (err: any) {
      setIllustrations((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, status: 'failed', error: err?.message || '生成变体失败' } : it
        )
      );
      showToast(`生成变体失败：${err?.message || '未知错误'}`, 'err');
    }
  };

  // 选用指定候选变体
  const handleSelectVariant = (itemId: string, variantUrl: string) => {
    const localP = variantUrl.replace(/^file:\/\/\//, '').replace(/\//g, '\\');
    setIllustrations((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              imageUrl: variantUrl,
              localPath: localP,
            }
          : it
      )
    );
    showToast('已切换为此候选变体！', 'ok');
  };

  // v0.7.26：单张分镜上传垫图参考
  const handleUploadItemReferenceImage = async (itemId: string) => {
    try {
      const filePath = await api.pickImageFile();
      if (!filePath) return;
      const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;
      const blob = await fetch(fileUrl).then((r) => r.blob());
      const reader = new FileReader();
      reader.onload = () => {
        const base64Uri = reader.result as string;
        setIllustrations((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, referenceImage: base64Uri } : it))
        );
        showToast('垫图参考已绑定！生成时将结合此图作为垫图参考', 'ok');
      };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      showToast(`垫图载入失败：${err?.message || '未知错误'}`, 'err');
    }
  };

  // 移除垫图参考
  const handleRemoveItemReferenceImage = (itemId: string) => {
    setIllustrations((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, referenceImage: undefined } : it))
    );
    showToast('已移除垫图参考', 'ok');
  };

  // v0.7.26：导出为剪映工程草稿 (直存项目目录 或 ZIP 下载)
  const handleExportJianying = async (mode: 'direct' | 'zip') => {
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

    setIsExportingJianying(true);
    try {
      showToast('正在构建剪映专业版多轨草稿工程…', 'info');
      const draftName = (videoTitle || 'JaygoAI_插图草稿')
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();

      let framedImagePaths: Record<string, string> | undefined = undefined;
      if (borderStyle && borderStyle !== 'none') {
        const borderLabel = BORDER_OPTIONS.find((b) => b.id === borderStyle)?.label || '边框';
        showToast(`正在为剪映预合成【${borderLabel}】高保真圆角图…`, 'info');
        const itemsToFrame = readyItems
          .filter((it) => it.localPath || it.imageUrl)
          .map((it) => ({
            id: it.id,
            imagePath: it.localPath || it.imageUrl || '',
            boxWidth: Math.round((videoDimensions.width || 1080) * (globalLayout.widthPercent || 0.65)),
          }));
        const frameRes = await api.illustratorRenderFramedImages({
          items: itemsToFrame,
          borderStyle,
        });
        if (frameRes.ok && frameRes.framedPaths) {
          framedImagePaths = frameRes.framedPaths;
        }
      }

      const exportOpts = {
        projectName: draftName,
        videoPath: targetSource,
        videoDuration,
        videoDimensions,
        illustrations: readyItems,
        globalLayout,
        transitionEffect,
        borderStyle,
        framedImagePaths,
      };

      if (mode === 'direct') {
        const { draftContent, draftMeta } = buildJianyingDraftData(exportOpts);
        const res = await api.illustratorExportJianying({
          draftDirName: `${draftName}_${Date.now()}`,
          draftContent,
          draftMeta,
        });

        if (res.ok && res.draftPath) {
          setJianyingDraftResult({ path: res.draftPath, isZip: false });
          showToast('已成功导出至剪映草稿目录！打开剪映即可直接看到', 'ok');
        } else {
          throw new Error(res.error || '写入剪映草稿目录失败');
        }
      } else {
        const zipBlob = await createJianyingZipBlob(exportOpts);
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${draftName}_剪映草稿_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('剪映草稿 ZIP 包已开始下载！', 'ok');
      }
    } catch (err: any) {
      showToast(err?.message || '导出剪映工程失败', 'err');
    } finally {
      setIsExportingJianying(false);
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

  /**
   * 上传自己的图片（v0.7.8）
   * 读取图片原始宽高比写入 customAspect，使其按自身比例显示，
   * 不与模型生成图共用「画幅比例」设置。
   */
  const handleUploadOwnImage = async (targetId?: string) => {
    try {
      const filePath = await api.pickImageFile();
      if (!filePath) return;

      const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;

      // 必须等图片真正解码完成才能读到 naturalWidth/Height
      const aspect = await new Promise<number>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || 0;
          const h = img.naturalHeight || 0;
          resolve(w > 0 && h > 0 ? w / h : 16 / 9);
        };
        img.onerror = () => resolve(16 / 9);
        img.src = fileUrl;
      });

      const applyTo = (item: VideoIllustrationItem): VideoIllustrationItem => ({
        ...item,
        imageUrl: fileUrl,
        localPath: filePath,
        status: 'success',
        source: 'upload',
        customAspect: aspect,
        error: undefined,
      });

      if (targetId) {
        setIllustrations((prev) => prev.map((it) => (it.id === targetId ? applyTo(it) : it)));
        showToast('已为该分镜替换为你的图片（按原图比例显示）', 'ok');
      } else {
        const dur = videoDuration > 0 ? videoDuration : 60;
        const st = Math.max(0, Math.round(currentTime * 10) / 10);
        const et = Math.min(dur, Math.round((st + 4.0) * 10) / 10);
        const newItem: VideoIllustrationItem = applyTo({
          id: `ill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          startTime: st,
          endTime: et,
          contextText: '手动上传图片',
          concept: '我的图片',
          prompt: '',
          type: 'standard',
          model: 'sensenova-u1.5-lite',
          category: 'scene_narrative',
          style: defaultStyle,
          ratio: defaultRatio,
          status: 'success',
        });
        setIllustrations((prev) => [...prev, newItem].sort((a, b) => a.startTime - b.startTime));
        setSelectedIllustrationId(newItem.id);
        showToast('已插入你的图片（按原图比例显示，不影响模型生图比例）', 'ok');
      }
    } catch (err: any) {
      showToast(err?.message || '上传图片失败', 'err');
    }
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
      // v0.7.11：导出前先用 Canvas 预合成叠加层（圆角/星标/光晕/缩放）。
      // 此前导出端完全没有圆角实现，star_badge/cyber_glow 也只是画纯色方框；
      // 且 ffmpeg overlay 要求输入尺寸恒定，无法逐帧改框大小实现真缩放。
      // 预合成后输出尺寸恒定的帧序列，两个问题一并解决。
      const boxWidth = Math.max(
        16,
        Math.round((videoDimensions.width * globalLayout.widthPercent) / 2) * 2
      );
      const overlays = await Promise.all(
        readyItems.map(async (it) => {
          const base = {
            imagePath: it.localPath!,
            startTime: it.startTime,
            endTime: it.endTime,
            xPercent: globalLayout.xPercent,
            yPercent: globalLayout.yPercent,
            widthPercent: globalLayout.widthPercent,
            heightPercent: globalLayout.heightPercent,
            aspect: it.source === 'upload' ? it.customAspect : undefined,
            transitionEffect,
            borderStyle,
          };
          try {
            const prep = await api.prepareOverlayFrames({
              imagePath: it.localPath!,
              borderStyle,
              boxWidth,
              mode: transitionEffect,
            });
            if (prep?.ok && prep.framePaths?.length > 0) {
              const frames: string[] = prep.framePaths;
              return {
                ...base,
                imagePath: frames[0],
                framePattern: prep.framePattern,
                // v0.7.13：序列只有 0.5 秒，出场淡出必须挂在「静止末帧」这一路
                // （-loop 1 无限流）上，否则 fade=t=out 永远触发不到。
                holdImagePath: frames[frames.length - 1],
                seqDuration: frames.length / 10,
                pad: prep.pad ?? 0,
                precomposed: true,
              };
            }
          } catch (e) {
            console.warn('[Illustrator] 叠加层预合成失败，回退为原始图片叠加:', e);
          }
          return base;
        })
      );

      const res = await api.exportVideoWithOverlays({
        videoPath: targetSource,
        removeOriginalWatermark,
        quality: exportQuality,
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

  // ===== v0.7.16：历史作品与重置 =====

  /** 收集当前工作台的完整快照 */
  const buildSnapshot = (): IllustrationHistoryRecord => {
    const now = Date.now();
    const firstLine = (scriptText || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
    return {
      id: `ih_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: firstLine.slice(0, 24) || `未命名作品 ${new Date(now).toLocaleString('zh-CN')}`,
      createdAt: now,
      updatedAt: now,
      scriptText,
      videoDuration: videoDuration || 0,
      // v0.7.24：保存视频路径、网络直链、标题与原始尺寸，载入时完整恢复
      videoUrl: videoUrl || undefined,
      videoPath: videoPath || undefined,
      videoTitle: videoTitle || undefined,
      videoDimensions: videoDimensions || undefined,
      density,
      styleId: defaultStyle,
      infographicStyleId: infographicStyle,
      infographicLayout: selectedLayoutId,
      ratio: defaultRatio,
      routingMode,
      characterMode,
      customCharacterPrompt: customCharacterPrompt || undefined,
      transitionEffect,
      borderStyle,
      globalLayout,
      // 只保存有意义的字段，避免把巨大的 base64 参考图写进历史文件
      illustrations: illustrations.map((it) => ({
        ...it,
        referenceImage: undefined,
        imageUrl: it.source === 'upload' ? undefined : it.imageUrl,
      })),
    };
  };

  const persistHistory = async (records: IllustrationHistoryRecord[]) => {
    setHistoryRecords(records);
    try {
      const res = await api.saveIllustrationHistory(records);
      if (!res?.ok) console.warn('[Illustrator] 历史保存失败:', res?.error);
    } catch (e) {
      console.warn('[Illustrator] 历史保存异常:', e);
    }
  };

  /** 保存当前工作到历史；同一份文案已存在则覆盖，避免刷出一堆重复条目 */
  const handleSaveHistory = async () => {
    if (illustrations.length === 0) {
      showToast('当前还没有配图内容可保存', 'err');
      return;
    }
    const snap = buildSnapshot();
    const key = snap.scriptText.trim();
    const existingIdx = historyRecords.findIndex((r) => r.scriptText.trim() === key);
    let next: IllustrationHistoryRecord[];
    if (existingIdx >= 0) {
      const old = historyRecords[existingIdx];
      next = [...historyRecords];
      next[existingIdx] = { ...snap, id: old.id, createdAt: old.createdAt };
      showToast('已更新同名作品的历史记录', 'ok');
    } else {
      next = [snap, ...historyRecords].slice(0, 30);
      showToast(`已保存到历史作品（共 ${next.length} 份）`, 'ok');
    }
    await persistHistory(next);
  };

  /** 载入一份历史作品，完整恢复现场 */
  const handleLoadHistory = (rec: IllustrationHistoryRecord) => {
    setScriptText(rec.scriptText || '');
    setVideoDuration(rec.videoDuration || 0);
    // v0.7.24：恢复作品关联的视频播放舞台与尺寸
    if (rec.videoPath || rec.videoUrl) {
      const vUrl = rec.videoPath || rec.videoUrl!;
      setVideoUrl(vUrl);
      setVideoPath(rec.videoPath || (vUrl.startsWith('http') ? '' : vUrl));
      setVideoTitle(rec.videoTitle || '已载入作品关联视频');
    }
    if (rec.videoDimensions) {
      setVideoDimensions(rec.videoDimensions);
    }
    setDensity(rec.density || 'standard');
    setDefaultStyle(rec.styleId || 'auto');
    if (rec.infographicStyleId) setInfographicStyle(rec.infographicStyleId);
    if (rec.infographicLayout) setSelectedLayoutId(rec.infographicLayout);
    if (rec.characterMode) setCharacterMode(rec.characterMode);
    if (rec.customCharacterPrompt) setCustomCharacterPrompt(rec.customCharacterPrompt);
    setDefaultRatio(rec.ratio || '16:9');
    setRoutingMode(rec.routingMode || 'smart');
    setTransitionEffect(rec.transitionEffect || 'fade');
    setBorderStyle(rec.borderStyle || 'none');
    if (rec.globalLayout) setGlobalLayout({ ...DEFAULT_LAYOUT, ...rec.globalLayout });
    setIllustrations(rec.illustrations || []);
    setSelectedIllustrationId(rec.illustrations?.[0]?.id || null);
    setPlanDiagnostics(null);
    setPlanError(null);
    setModelCalls([]);
    setActiveView('create');
    showToast(`已载入作品「${rec.title}」（${rec.illustrations?.length || 0} 张插图）`, 'ok');
  };

  /** 删除一份历史作品，并清理它独占的插图文件 */
  const handleDeleteHistory = async (rec: IllustrationHistoryRecord) => {
    const next = historyRecords.filter((r) => r.id !== rec.id);
    const removedPaths = (rec.illustrations || [])
      .map((it) => it.localPath)
      .filter((p): p is string => Boolean(p));
    setHistoryRecords(next);
    try {
      const res = await api.deleteIllustrationHistory({ id: rec.id, records: next, removedPaths });
      if (!res?.ok) showToast(`删除失败：${res?.error || '未知错误'}`, 'err');
      else showToast('已删除该历史作品', 'ok');
    } catch (e: any) {
      showToast(`删除异常：${e?.message || e}`, 'err');
    }
  };

  /** 重置工作台（历史记录保留，可随时载回） */
  const handleResetWorkspace = () => {
    // v0.7.17：连**视频一起清空**。
    // 此前重置只清了文案与插图，视频仍然留在预览区里，用户无法上传一个新视频
    // 开始新一轮配图 —— 必须先手动重新选文件，而且旧视频的时长/尺寸还残留着。
    setVideoUrl('');
    setVideoPath('');
    setVideoTitle('');
    setVideoDuration(0);
    setVideoDimensions({ width: 1080, height: 1920 });
    setCurrentTime(0);
    setIsPlaying(false);
    setAsrUtterances([]);

    setScriptText('');
    setIllustrations([]);
    setSelectedIllustrationId(null);
    setPlanDiagnostics(null);
    setPlanError(null);
    setModelCalls([]);
    setPipelineProgress(null);
    setGlobalLayout({ ...DEFAULT_LAYOUT });
    setTransitionEffect('fade');
    setBorderStyle('none');
    setCharacterMode('auto');
    setCustomCharacterPrompt('');
    showToast('工作台已重置，可以上传新视频了（历史作品仍保留）', 'ok');
  };

  // 启动时载入历史作品
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.loadIllustrationHistory();
        if (!cancelled && res?.ok && Array.isArray(res.records)) {
          setHistoryRecords(res.records);
        }
      } catch {
        /* 读不到历史不影响使用 */
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // 退场动效 class（v0.7.8：四种动效都有对应退场，不再只有 fade）
  const getExitAnimClass = (nearExit: boolean | undefined) => {
    if (!nearExit) return '';
    switch (transitionEffect) {
      case 'fade':
        return 'anim-ill-exit-fade';
      case 'slide':
        return 'anim-ill-exit-slide';
      case 'zoom':
        return 'anim-ill-exit-zoom';
      default:
        return '';
    }
  };

  // 当前激活插图是否处于末尾 0.35s 退场阶段
  const isNearExit = activeIllustration && activeIllustration.endTime - currentTime <= 0.35;
  // v0.7.8：退场动效不再限定 fade；改由 getExitAnimClass 按当前动效给出对应退场类
  const exitFadeClass = getExitAnimClass(isNearExit);

  // 播放到新的插图时自动退出编辑态，避免编辑态长期吞掉动效预览
  useEffect(() => {
    if (isEditingOverlay) setIsEditingOverlay(false);
    // 仅在切换到不同插图时复位
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIllustration?.id]);

  // 动态生成状态监控
  const generatingIndex = illustrations.findIndex((it) => it.status === 'generating');
  const generatingItem = generatingIndex >= 0 ? illustrations[generatingIndex] : null;

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-50 dark:bg-[#0c0d11] text-zinc-800 dark:text-zinc-200 overflow-hidden select-none">
      {/* 顶部标题栏：呼吸感良好，中窗口防挤压 */}
      <div className="py-2.5 px-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-white dark:bg-[#111217] shrink-0 min-h-[52px] gap-2 overflow-visible relative z-30">
        <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 via-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-sm shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">智能视频配插图</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200/60 dark:border-indigo-800/60 whitespace-nowrap">
                v0.7.30
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden xl:block whitespace-nowrap">
              AI 视觉导演 · 智能分镜规划与实体插图
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          {/* 窄屏降级提示 */}
          {effectiveMode !== cols.mode && (
            <span
              title={`当前可用宽度约 ${cols.containerWidth}px，已自动降级以保证内容完整显示`}
              className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60 whitespace-nowrap hidden md:inline-block"
            >
              已降级为{effectiveMode === 'two' ? '双栏' : '专注'}
            </span>
          )}

          {/* 视图切换 */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-200/60 dark:border-zinc-700/60 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('create')}
              className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                activeView === 'create'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              制作配图
            </button>
            <button
              type="button"
              onClick={() => setActiveView('history')}
              className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1 cursor-pointer ${
                activeView === 'history'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <HistoryIcon className="w-3.5 h-3.5" />
              <span>历史作品</span>
              {historyRecords.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-mono">
                  {historyRecords.length}
                </span>
              )}
            </button>
          </div>

          {/* 宽屏双栏工作台切换 */}
          {activeView === 'create' && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-1 shrink-0 ${
                isSidebarCollapsed
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500/60 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100'
              }`}
              title={isSidebarCollapsed ? '展开左侧设置栏' : '收起左侧设置栏，进入双栏宽屏编辑工作台'}
            >
              {isSidebarCollapsed ? (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-indigo-500" />
                  <span>展开设置</span>
                </>
              ) : (
                <>
                  <ChevronLeft className="w-3.5 h-3.5 text-zinc-400" />
                  <span>宽屏工作台</span>
                </>
              )}
            </button>
          )}

          {/* AI 规划模型胶囊：展示 [供应商] 模型名称，中窗口自适应宽度截断 */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowModelPicker((v) => !v)}
              title={activeModelDisplay}
              className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition cursor-pointer flex items-center gap-1.5 max-w-[160px] xl:max-w-[240px]"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span className="truncate">
                {activeModelDisplay}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
            </button>

            {showModelPicker && (
              <div className="absolute right-0 top-full mt-1.5 w-[330px] max-h-[380px] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#15161d] shadow-2xl z-50 p-1.5 animate-in fade-in slide-in-from-top-1">
                <div className="px-2 py-1.5 text-[10.5px] text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                  与「AI 文案工坊」共用同一份模型设置，切换后两边一致
                </div>
                {Object.entries(PRESET_PROVIDERS).map(([ptype, preset]) => {
                  const conf = modelSettings?.providers?.[ptype as ModelProviderType];
                  const hasKey = Boolean(conf?.apiKey?.trim());
                  const provTitle = (ptype === 'custom' && conf?.customProviderName?.trim())
                    ? conf.customProviderName.trim()
                    : preset.name;
                  const models = (ptype === 'custom'
                    ? (conf?.customModelName?.trim()
                        ? [{ id: conf.customModelName.trim(), name: conf.customModelName.trim() }]
                        : preset.models)
                    : (conf?.customModelName?.trim()
                        ? [{ id: conf.customModelName.trim(), name: `${conf.customModelName.trim()} (自定义覆盖)` }, ...preset.models]
                        : preset.models)).slice(0, 6);

                  return (
                    <div key={ptype} className="mb-1">
                      <div className="px-2 py-1 text-[10px] font-semibold text-zinc-500 flex items-center justify-between gap-1.5">
                        <span className="truncate font-bold">{provTitle}</span>
                        {hasKey ? (
                          <span className="text-emerald-500 shrink-0 text-[9.5px]">已配密匙</span>
                        ) : (
                          <span className="text-zinc-400 shrink-0 text-[9.5px]">未配密匙</span>
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
            className="px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition cursor-pointer flex items-center gap-1.5 shrink-0"
            title="商汤 TokenPlan API Key 配置"
          >
            <Key className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate max-w-[110px] lg:max-w-none">{snApiKey ? 'TokenPlan 密匙就绪' : '配置密匙'}</span>
            <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
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
      <div
        ref={columnsRef}
        className={`flex-1 overflow-hidden min-h-0 ${activeView === 'create' ? 'flex' : 'hidden'}`}
      >
        {/* ========================================================================= */}
        {/* 左栏：常规设置、文案大输入框与排版包装 (宽度自适应，可拖拽调节) */}
        {/* ========================================================================= */}
        {effectiveMode !== 'focus' && !isSidebarCollapsed && (
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

          {/* 图片画风 & 信息图版式 并排同一行 (Point 6) */}
          <div className="grid grid-cols-2 gap-2">
            {/* 图片画风 */}
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 truncate">
                  <Palette className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>图片画风</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowStyleModal(true)}
                  className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline flex items-center cursor-pointer font-medium shrink-0"
                >
                  <span>大厅</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </button>
              </div>

              <div
                onClick={() => setShowStyleModal(true)}
                className="w-full px-2 py-1.5 rounded-lg border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 hover:border-rose-400 dark:hover:border-rose-700 transition cursor-pointer flex items-center justify-between text-xs group"
                title="点击打开图片画风参考大厅"
              >
                <div className="truncate text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                  {defaultStyle === 'auto' ? '✨ 自动' : (STYLE_OPTIONS.find((s) => s.id === defaultStyle)?.label || defaultStyle)}
                </div>
                <span className="text-[10px] text-rose-600 dark:text-rose-400 shrink-0 font-medium ml-1">
                  选 ›
                </span>
              </div>
            </div>

            {/* 信息图版式 */}
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 truncate">
                  <LayoutGrid className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                  <span>信息图版式</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowLayoutModal(true)}
                  className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center cursor-pointer font-medium shrink-0"
                >
                  <span>88+库</span>
                  <ChevronRight className="w-2.5 h-2.5" />
                </button>
              </div>

              <div
                onClick={() => setShowLayoutModal(true)}
                className="w-full px-2 py-1.5 rounded-lg border border-cyan-200/80 dark:border-cyan-900/60 bg-cyan-50/40 dark:bg-cyan-950/20 hover:border-cyan-400 dark:hover:border-cyan-700 transition cursor-pointer flex items-center justify-between text-xs group"
                title="点击打开 88+ 种信息图版式大厅"
              >
                <div className="truncate text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                  {selectedLayoutId === 'auto' ? '🤖 自动' : (LAYOUTS[selectedLayoutId]?.label || selectedLayoutId)}
                </div>
                <span className="text-[10px] text-cyan-600 dark:text-cyan-400 shrink-0 font-medium ml-1">
                  选 ›
                </span>
              </div>
            </div>
          </div>

          {/* 配图密度 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span>配图密度</span>
              </label>
              <span className="text-[9.5px] text-zinc-400">
                {DENSITY_OPTIONS.find((d) => d.id === density)?.desc.split('，')[0]}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800">
              {DENSITY_OPTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDensity(d.id);
                    showToast(`已选择【${d.label}】配图`, 'ok');
                  }}
                  title={`${d.label}：${d.desc}`}
                  className={`py-1 rounded-md text-[11px] font-medium transition cursor-pointer text-center ${
                    density === d.id
                      ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* v0.7.26：故事弧线角色主体一致性锁 (✨ 智能分段 / 🔒 全局锁定 / ⚡ 独立生成) */}
          <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 bg-indigo-50/30 dark:bg-indigo-950/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-1">
              <label className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 shrink-0">
                <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                <span>角色主体一致性</span>
              </label>
              <span className="text-[9.5px] font-medium text-indigo-600 dark:text-indigo-400 shrink-0 whitespace-nowrap">
                {characterMode === 'auto' ? '✨ 智能自适应' : characterMode === 'custom' ? '🔒 全局固定' : '⚡ 独立生图'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800">
              {[
                { id: 'auto', label: '✨ 智能分段', desc: 'AI 自动研判连贯故事弧线，同一故事保持人物一致，多故事自适应设计，信息图自动免污染' },
                { id: 'custom', label: '🔒 全局锁定', desc: '自定义固定主角形象，全片叙事镜头保持统一主角' },
                { id: 'off', label: '⚡ 独立生成', desc: '关闭一致性，每个叙事镜头独立生图' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setCharacterMode(m.id as any);
                    showToast(`角色一致性已切换为【${m.label}】`, 'ok');
                  }}
                  title={m.desc}
                  className={`py-1 px-1 rounded-md text-[10.5px] font-medium transition cursor-pointer text-center truncate ${
                    characterMode === m.id
                      ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {characterMode === 'custom' && (
              <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                <input
                  type="text"
                  value={customCharacterPrompt}
                  onChange={(e) => setCustomCharacterPrompt(e.target.value)}
                  placeholder="输入主角设定：如穿白卫衣的25岁短发男生，戴黑框眼镜"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            )}

            <div className="text-[10px] text-zinc-400 leading-tight">
              💡 信息图/图表分镜具备免污染铁律，系统将绝对禁止注入人物设定，确保图表纯净专业。
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

          {/* v0.7.17：历史作品已改为整页切换，左栏这里只保留「保存 / 重置」两个动作 */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleSaveHistory}
              disabled={illustrations.length === 0}
              className="py-1.5 px-2 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
              title="把当前分镜、插图与排版设置保存到历史作品"
            >
              <Save className="w-3 h-3 shrink-0" />
              保存作品
            </button>
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="py-1.5 px-2 rounded-lg text-[11px] font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 dark:hover:border-rose-900 cursor-pointer flex items-center justify-center gap-1"
              title="清空当前工作台（含视频），历史作品会保留"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              重置
            </button>
          </div>

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
        {effectiveMode !== 'focus' && !isSidebarCollapsed && (
        <div
          onMouseDown={(e) => cols.startResize('left', e)}
          title="按住左右拖拽调节左侧设置栏宽度"
          className="w-2 hover:w-2.5 bg-zinc-200/80 dark:bg-zinc-800/80 hover:bg-indigo-500 active:bg-indigo-600 cursor-col-resize transition-all shrink-0 flex items-center justify-center group relative z-20 select-none shadow-sm"
        >
          <div className="w-1 h-8 rounded-full bg-zinc-400 dark:bg-zinc-600 group-hover:bg-white transition-colors shadow" />
        </div>
        )}

        {/* ========================================================================= */}
        {/* 中栏：视频预览舞台 (居中大视窗、真实画幅、无多余遮挡、纯图标控制) */}
        {/* ========================================================================= */}
        <div
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

              {/* 核心视频舞台：尺寸由本层实测内容盒计算（ref 挂在这里，避免层级猜测） */}
              <div
                ref={stageBoxRef}
                className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-zinc-950/40 rounded-2xl p-2 border border-zinc-200 dark:border-zinc-800 shadow-inner overflow-hidden"
              >
                <div
                  ref={videoContainerRef}
                  className="relative rounded-xl overflow-hidden shadow-2xl bg-black select-none shrink-0"
                  style={{
                    width: stageSize ? `${stageSize.width}px` : undefined,
                    height: stageSize ? `${stageSize.height}px` : undefined,
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
                    className="w-full h-full object-contain block pointer-events-auto"
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
                      className={`absolute select-none overflow-hidden z-20 flex items-center justify-center transition-all duration-200 ${getTransitionAnimClass()} ${exitFadeClass} ${
                        isEditingOverlay
                          ? `cursor-move ring-2 ring-indigo-500 border-2 border-indigo-400 bg-zinc-900/95 shadow-2xl ${borderStyle === 'none' ? 'rounded-none' : 'rounded-xl'}`
                          : `cursor-pointer ${getContainerBorderClass()}`
                      }`}
                      title={isEditingOverlay ? '拖拽调整位置' : '点击激活编辑控柄调整位置与尺寸'}
                    >
                      {activeIllustration.imageUrl ? (
                        <img
                          src={activeIllustration.imageUrl}
                          alt={activeIllustration.concept}
                          className={`w-full h-full pointer-events-none block ${
                            activeIllustration.source === 'upload' ? 'object-contain bg-black/40' : 'object-cover'
                          }`}
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
                        {/* v0.7.26：专业波形时间轴展开按钮 */}
                        <button
                          type="button"
                          onClick={() => setShowAdvancedTimeline(true)}
                          className="px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 text-amber-200 hover:text-white transition cursor-pointer shrink-0 flex items-center gap-1"
                          title="展开专业波形时间轴，微调起止时间与口播停顿磁吸吸附"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-semibold">专业时间轴</span>
                        </button>

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
                          onClick={() => handleUploadOwnImage()}
                          className="p-1.5 rounded-md bg-white/20 hover:bg-white/30 text-emerald-200 hover:text-white transition cursor-pointer shrink-0"
                          title="上传你自己的图片 (按原图比例显示，不占用模型生图比例)"
                        >
                          <Upload className="w-3.5 h-3.5" />
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
          title="按住左右拖拽调节右侧分镜栏宽度"
          className="w-2 hover:w-2.5 bg-zinc-200/80 dark:bg-zinc-800/80 hover:bg-indigo-500 active:bg-indigo-600 cursor-col-resize transition-all shrink-0 flex items-center justify-center group relative z-20 select-none shadow-sm"
        >
          <div className="w-1 h-8 rounded-full bg-zinc-400 dark:bg-zinc-600 group-hover:bg-white transition-colors shadow" />
        </div>
        )}

        {/* ========================================================================= */}
        {/* 右栏：插图分镜清单、实时动态状态看板与导出区域 (宽度自适应，可拖拽调节) */}
        {/* ========================================================================= */}
        {effectiveMode === 'three' && (
        <div
          style={{ width: `${isSidebarCollapsed ? Math.max(rightWidth + 240, 560) : rightWidth}px`, minWidth: 0 }}
          className="flex flex-col bg-white dark:bg-[#111217] border-l border-zinc-200 dark:border-zinc-800/80 overflow-hidden shrink transition-all duration-200"
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
                    {pipelineProgress ? pipelineProgress.message : `正在以【${STYLE_OPTIONS.find((s) => s.id === defaultStyle)?.label || '统一'}】推进分镜规划`}
                  </div>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${pipelineProgress?.percent || 25}%` }}
                />
              </div>

              {/* v0.7.14：大模型调用实时状态 —— 每次请求结束立刻显示成功/失败 */}
              {modelCalls.length > 0 && (() => {
                const okCount = modelCalls.filter((c) => c.ok).length;
                const failCount = modelCalls.length - okCount;
                const last = modelCalls[modelCalls.length - 1];
                return (
                  <div className="pt-1.5 border-t border-indigo-200/70 dark:border-indigo-800/50 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          last.ok ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'
                        }`}
                      />
                      <span className="text-indigo-600 dark:text-indigo-300">大模型调用</span>
                      <span className="text-emerald-600 dark:text-emerald-400">成功 {okCount}</span>
                      {failCount > 0 && (
                        <span className="text-rose-600 dark:text-rose-400">失败 {failCount}</span>
                      )}
                      <span className="ml-auto font-mono text-indigo-400">{modelCalls.length} 次</span>
                    </div>
                    <div className="space-y-0.5 max-h-24 overflow-y-auto">
                      {modelCalls.slice().reverse().map((c) => (
                        <div
                          key={c.id}
                          className={`flex items-start gap-1.5 text-[9.5px] leading-tight rounded px-1.5 py-1 ${
                            c.ok
                              ? 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                              : 'bg-rose-50/90 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          <span className="shrink-0 font-bold">{c.ok ? '✓' : '✕'}</span>
                          <span className="shrink-0 max-w-[92px] truncate" title={`${c.providerLabel} / ${c.model}`}>
                            {c.model || c.providerLabel}
                          </span>
                          <span className="shrink-0 font-mono opacity-70">
                            {(c.ms / 1000).toFixed(1)}s
                            {c.attempts > 1 ? ` ·${c.attempts}试` : ''}
                          </span>
                          {!c.ok && (
                            <span className="min-w-0 flex-1 truncate" title={c.error}>
                              {c.error}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* v0.7.14：规划失败时显示完整原因（toast 会被截断且自动消失） */}
          {!isPlanning && planError && (
            <div className="mx-3 mt-3 p-3 rounded-xl border border-rose-300 dark:border-rose-800/80 bg-rose-50/90 dark:bg-rose-950/40 space-y-1.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-bold text-rose-700 dark:text-rose-300">
                    规划失败：大模型未能完成本次调用
                  </div>
                  <div className="text-[10.5px] text-rose-700/90 dark:text-rose-400/90 mt-1 leading-relaxed break-words">
                    {planError}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPlanError(null)}
                  className="shrink-0 text-[10px] text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                  title="关闭"
                >
                  ✕
                </button>
              </div>
              <div className="text-[10px] text-rose-600/80 dark:text-rose-400/70 leading-relaxed pl-6">
                本次未使用任何本地关键词规则兜底（你已要求内容一律由大模型产出）。
                请检查上方实时调用记录中的报错，或前往 [模型中心] 更换一个额度更充足的模型后重试。
              </div>
            </div>
          )}

          {/* 规划诊断：默认一行紧凑徽章，点击展开详情（v0.7.12 收窄版） */}
          {!isPlanning && planDiagnostics && (
            <div
              className={`mx-3 mt-3 px-2.5 py-1.5 rounded-xl border text-[10.5px] ${
                planDiagnostics.usedLLM && !planDiagnostics.fallbackReason
                  ? 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30'
                  : 'border-amber-300 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/30'
              }`}
            >
              <button
                type="button"
                onClick={() => setDiagExpanded((v) => !v)}
                className="w-full flex items-center gap-1.5 text-left cursor-pointer"
                title="点击展开/收起规划诊断详情"
              >
                {planDiagnostics.usedLLM && !planDiagnostics.fallbackReason ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <span
                  className={`font-bold truncate ${
                    planDiagnostics.usedLLM && !planDiagnostics.fallbackReason
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {planDiagnostics.usedLLM
                    ? planDiagnostics.fallbackReason
                      ? '大模型已参与（部分批次降级）'
                      : '大模型已参与规划'
                    : '关键词规则兜底'}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400 font-mono truncate">
                  {planDiagnostics.totalBeats} 分镜 · 信息图 {planDiagnostics.infographicCount}
                </span>
                {/* v0.7.14：规划结束后仍能看到本次调用成功/失败次数，失败不会被面板收起后吞掉 */}
                {modelCalls.length > 0 && (() => {
                  const ok = modelCalls.filter((c) => c.ok).length;
                  const bad = modelCalls.length - ok;
                  return (
                    <span
                      className={`font-mono shrink-0 ${
                        bad > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      调用 {ok}✓{bad > 0 ? ` ${bad}✕` : ''}
                    </span>
                  );
                })()}
                <ChevronDown
                  className={`w-3 h-3 ml-auto shrink-0 text-zinc-400 transition-transform ${diagExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {diagExpanded && (
                <div className="mt-1.5 pt-1.5 border-t border-current/10 space-y-1">
                  {planDiagnostics.fallbackReason && (
                    <div className="text-amber-700/90 dark:text-amber-400/90 leading-relaxed whitespace-pre-wrap">
                      {planDiagnostics.fallbackReason}
                    </div>
                  )}
                  {/* v0.7.14：展开后可见每一次失败的模型调用及原始报错 */}
                  {modelCalls.some((c) => !c.ok) && (
                    <div className="space-y-0.5">
                      {modelCalls.filter((c) => !c.ok).map((c) => (
                        <div
                          key={c.id}
                          className="text-rose-700/90 dark:text-rose-400/90 leading-relaxed break-words"
                        >
                          ✕ {c.providerLabel} / {c.model}（{(c.ms / 1000).toFixed(1)}s
                          {c.attempts > 1 ? `，重试 ${c.attempts} 次` : ''}）：{c.error}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-600 dark:text-zinc-400 font-mono">
                    {activeModel && (
                      <span className="text-purple-600 dark:text-purple-400">模型 {activeModel.model}</span>
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
                    {/* v0.7.14：本次实际生效的并发档位 */}
                    {planDiagnostics.concurrency && (
                      <span
                        className={
                          planDiagnostics.concurrency.finalLimit < planDiagnostics.concurrency.initialLimit
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-indigo-600 dark:text-indigo-400'
                        }
                        title={
                          planDiagnostics.concurrency.rateLimitHits > 0
                            ? `运行中命中限流 ${planDiagnostics.concurrency.rateLimitHits} 次，已自动降并发`
                            : '按该模型 TPM 额度自动选择的并发档位'
                        }
                      >
                        并发 {planDiagnostics.concurrency.initialLimit}
                        {planDiagnostics.concurrency.finalLimit < planDiagnostics.concurrency.initialLimit
                          ? ` → ${planDiagnostics.concurrency.finalLimit}（限流降级）`
                          : ''}
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

                        {item.scenePlan?.layout && (
                          <span
                            className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-medium"
                            title={LAYOUTS[item.scenePlan.layout]?.desc || item.scenePlan.layout}
                          >
                            📐 {LAYOUTS[item.scenePlan.layout]?.label || item.scenePlan.layout}
                          </span>
                        )}

                        {item.storyArcId && (
                          <span
                            className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-medium truncate max-w-[90px]"
                            title={item.characterAnchor ? `角色主体: ${item.characterAnchor}` : `故事弧线: ${item.storyArcId}`}
                          >
                            👤 {item.characterAnchor ? item.characterAnchor.slice(0, 6) : item.storyArcId.replace('arc_', '故事#')}
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
                        onMouseEnter={(e) => {
                          setHoveredIllustrationId(item.id);
                          setHoverPos({ x: e.clientX, y: e.clientY });
                        }}
                        onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
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

                        {/* 悬停浮动放大查看 Tooltip（v0.7.12：跟随鼠标并做边界翻转） */}
                        {isHovered && item.imageUrl && (() => {
                          const TIP_W = 300;
                          const TIP_H = 320;
                          const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
                          const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
                          // 靠近右边缘时翻到鼠标左侧；靠近下边缘时上移
                          const left = hoverPos.x + 24 + TIP_W > vw
                            ? Math.max(8, hoverPos.x - TIP_W - 24)
                            : hoverPos.x + 24;
                          const top = Math.max(8, Math.min(hoverPos.y - 60, vh - TIP_H - 8));
                          return (
                            <div
                              className="fixed z-50 pointer-events-none p-2 rounded-xl bg-zinc-900/95 border border-zinc-700 shadow-2xl backdrop-blur-md"
                              style={{ left, top }}
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
                          );
                        })()}
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

                      {/* v0.7.26：单张垫图、3候选变体与重新生成按钮 */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* 垫图参考 */}
                        {item.referenceImage ? (
                          <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md text-[10px] text-amber-600 dark:text-amber-400">
                            <img src={item.referenceImage} alt="垫图" className="w-3.5 h-3.5 rounded object-cover" />
                            <span className="text-[9px]">已垫图</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveItemReferenceImage(item.id);
                              }}
                              className="text-zinc-400 hover:text-rose-500 ml-0.5 cursor-pointer font-bold"
                              title="移除垫图参考"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUploadItemReferenceImage(item.id);
                            }}
                            className="px-1.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 transition cursor-pointer shrink-0 flex items-center gap-0.5"
                            title="为该分镜上传参考垫图（图生图微调）"
                          >
                            <ImagePlus className="w-3 h-3 text-amber-500" />
                            <span>垫图</span>
                          </button>
                        )}

                        {/* 并发生成 3 个候选变体 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateItemVariants(item.id);
                          }}
                          disabled={item.status === 'generating'}
                          className="px-1.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/60 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 text-[10px] font-medium transition cursor-pointer shrink-0 flex items-center gap-0.5 disabled:opacity-50"
                          title="并发生成 3 个候选变体供挑选"
                        >
                          <Sparkles className="w-3 h-3 text-indigo-500" />
                          <span>3变体</span>
                        </button>

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
                    </div>

                    {/* v0.7.26：候选变体横向排开，点击直接切换选用 */}
                    {item.variants && item.variants.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1 text-[10px] text-zinc-400">
                          <span className="flex items-center gap-1 font-medium">
                            <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                            <span>候选变体 ({item.variants.length} 个，点击立即选用):</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                          {item.variants.map((vUrl, vIdx) => {
                            const isCur = item.imageUrl === vUrl;
                            return (
                              <div
                                key={vIdx}
                                onClick={() => handleSelectVariant(item.id, vUrl)}
                                className={`relative w-11 h-11 rounded-lg border-2 overflow-hidden shrink-0 cursor-pointer transition-all ${
                                  isCur
                                    ? 'border-indigo-500 ring-2 ring-indigo-500/50 scale-105 shadow'
                                    : 'border-zinc-200 dark:border-zinc-700 opacity-70 hover:opacity-100'
                                }`}
                                title={`点击选用候选变体 #${vIdx + 1}`}
                              >
                                <img src={vUrl} alt={`变体 ${vIdx + 1}`} className="w-full h-full object-cover" />
                                {isCur && (
                                  <div className="absolute top-0 right-0 bg-indigo-500 text-white p-0.5 rounded-bl">
                                    <Check className="w-2 h-2" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 可编辑的提示词结构化多行文本框 (v0.7.32：排版清晰，方便一眼定位修改) */}
                    <div className="mt-2 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                          <Edit3 className="w-3 h-3 text-indigo-400" />
                          <span>结构化分段提示词 (可直接定位修改)</span>
                        </span>
                      </div>
                      <textarea
                        rows={Math.max(6, Math.min(18, (item.prompt || '').split('\n').length + 2))}
                        value={item.prompt}
                        onChange={(e) => {
                          const val = e.target.value;
                          setIllustrations((prev) =>
                            prev.map((it) => (it.id === item.id ? { ...it, prompt: val } : it))
                          );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="输入或微调提示词…"
                        className="w-full px-2.5 py-2 text-[11px] leading-relaxed font-sans rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-[#15161e] text-zinc-800 dark:text-zinc-200 focus:ring-1.5 focus:ring-indigo-500 focus:bg-white dark:focus:bg-zinc-900 outline-none resize-y transition min-h-[92px] whitespace-pre-wrap selection:bg-indigo-500/30"
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

            {jianyingDraftResult && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs animate-in fade-in">
                <div className="flex items-center gap-2 truncate mr-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-emerald-700 dark:text-emerald-300">
                      {jianyingDraftResult.isZip ? '剪映草稿 ZIP 已下载' : '已成功写入剪映草稿目录！'}
                    </div>
                    {jianyingDraftResult.path && (
                      <div className="text-[10px] text-zinc-400 truncate">
                        {jianyingDraftResult.path}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {jianyingDraftResult.path && !jianyingDraftResult.isZip && (
                    <button
                      type="button"
                      onClick={() => api.illustratorOpenFolder?.(jianyingDraftResult.path!)}
                      className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition cursor-pointer flex items-center gap-1 text-[11px]"
                      title="在文件资源管理器中打开该剪映草稿目录"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>打开目录</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setJianyingDraftResult(null)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
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

            {/* 导出画质档位与智能去水印控制 (v0.7.32：防挤压专业排版) */}
            <div className="p-2.5 rounded-xl bg-zinc-100/90 dark:bg-[#181922] border border-zinc-200/80 dark:border-zinc-800/80 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
                  导出画质:
                </span>
                <select
                  value={exportQuality}
                  onChange={(e) => setExportQuality(e.target.value as any)}
                  className="flex-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 text-[11px] font-semibold outline-none cursor-pointer shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 transition"
                >
                  <option value="master">👑 超清原画 (CRF 14 大师母带)</option>
                  <option value="high">💎 高清品质 (CRF 17 推荐)</option>
                  <option value="fast">⚡ 极速导出 (CRF 22)</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50 text-[11px]">
                <label
                  className="flex items-center gap-1.5 cursor-pointer select-none text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition"
                  title="仅在原视频左上角包含平台台标水印时勾选；若原片无水印，请保持关闭以避免左上角被局部模糊"
                >
                  <input
                    type="checkbox"
                    checked={removeOriginalWatermark}
                    onChange={(e) => setRemoveOriginalWatermark(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="font-medium">消除原片左上角水印</span>
                </label>

                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                  {exportQuality === 'master' ? 'CRF 14 · BT.709' : exportQuality === 'high' ? 'CRF 17 均衡' : 'CRF 22 极速'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 relative">
              <button
                type="button"
                onClick={handleExportVideo}
                disabled={isExporting || illustrations.filter((i) => i.status === 'success').length === 0}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                title="通过 FFmpeg 压制包含所有画中画插图与动效的成品 MP4 视频"
              >
                <Download className="w-4 h-4" />
                <span>{isExporting ? '合成导出中…' : '导出视频'}</span>
              </button>

              {/* 剪映工程草稿快捷导出 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowExportMenu((v) => !v)}
                  disabled={illustrations.filter((i) => i.status === 'success').length === 0}
                  className="px-2.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold border border-zinc-200 dark:border-zinc-700 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  title="导出为剪映 Pro 草稿或下载 ZIP 工程包"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>剪映草稿</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 bottom-full mb-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#181a22] shadow-2xl z-50 p-2 space-y-1 animate-in fade-in slide-in-from-bottom-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportJianying('direct');
                      }}
                      disabled={isExportingJianying}
                      className="w-full text-left p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer flex items-center gap-2"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">直存剪映工程草稿</div>
                        <div className="text-[10px] text-zinc-400 truncate">写入本地剪映，打开立见</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleExportJianying('zip');
                      }}
                      disabled={isExportingJianying}
                      className="w-full text-left p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer flex items-center gap-2"
                    >
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Download className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">下载剪映工程 ZIP 包</div>
                        <div className="text-[10px] text-zinc-400 truncate">解压放入剪映草稿目录</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center leading-tight pt-0.5">
              💡 追求 100% 绝对原画无损？推荐点击「<span className="text-emerald-500 font-medium">剪映草稿</span>」，原片 0 重采样直连！
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 历史作品整页视图（v0.7.17） */}
      {/* ========================================================================= */}
      {activeView === 'history' && (
        <div className="flex-1 overflow-y-auto min-h-0 p-5">
          <div className="max-w-[1400px] mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <HistoryIcon className="w-4 h-4 text-indigo-500" />
                  历史作品
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                    {historyRecords.length} 份
                  </span>
                </h2>
                <p className="text-[11.5px] text-zinc-400 mt-1">
                  每份存档包含文案、分镜、插图、排版位置、动效与边框设置，点击卡片即可恢复整个现场
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveHistory}
                disabled={illustrations.length === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                title="把当前工作台存为新的一份历史作品"
              >
                <Save className="w-3.5 h-3.5" />
                把当前工作另存为一份
              </button>
            </div>

            {historyRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mb-3">
                  <HistoryIcon className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />
                </div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">还没有历史作品</p>
                <p className="text-[11.5px] text-zinc-400 mt-1">
                  在「制作配图」页配好插图后点【保存作品】，之后随时可以回到这里载入
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                {historyRecords.map((rec) => {
                  const previews = (rec.illustrations || []).filter((it) => it.localPath || it.imageUrl).slice(0, 4);
                  const okCount = (rec.illustrations || []).filter((it) => it.status === 'success').length;
                  return (
                    <div
                      key={rec.id}
                      className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111217] overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-800 hover:shadow-lg transition flex flex-col"
                    >
                      {/* 缩略图拼贴：最多 4 张 */}
                      <button
                        type="button"
                        onClick={() => handleLoadHistory(rec)}
                        className="block w-full aspect-video bg-zinc-100 dark:bg-zinc-900 relative overflow-hidden cursor-pointer"
                        title="点击载入这份作品"
                      >
                        {previews.length === 0 ? (
                          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-400">
                            无插图预览
                          </div>
                        ) : (
                          <div className={`absolute inset-0 grid gap-0.5 ${previews.length === 1 ? 'grid-cols-1' : 'grid-cols-2 grid-rows-2'}`}>
                            {previews.map((it) => (
                              <div key={it.id} className="overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                                {it.localPath || it.imageUrl ? (
                                  <img
                                    src={it.imageUrl || `file:///${(it.localPath || '').replace(/\\/g, '/')}`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/20 transition flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition px-3 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium shadow">
                            载入这份作品
                          </span>
                        </div>
                      </button>

                      <div className="p-2.5 flex-1 flex flex-col gap-1.5">
                        <div className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2" title={rec.title}>
                          {rec.title}
                        </div>
                        {rec.videoTitle && (
                          <div className="flex items-center gap-1 text-[10.5px] text-indigo-600 dark:text-indigo-400 font-medium truncate" title={`关联原视频: ${rec.videoTitle}`}>
                            <Video className="w-3 h-3 shrink-0" />
                            <span className="truncate">{rec.videoTitle}</span>
                          </div>
                        )}
                        <div className="text-[10px] text-zinc-400 font-mono">
                          {new Date(rec.createdAt).toLocaleString('zh-CN')}
                        </div>
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            {rec.illustrations?.length || 0} 张分镜
                          </span>
                          {okCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                              已生成 {okCount}
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            {rec.videoDuration ? `${Math.round(rec.videoDuration)}s` : '—'}
                          </span>
                          {(rec.videoUrl || rec.videoPath) && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-0.5">
                              <Video className="w-2.5 h-2.5" />
                              含原视频
                            </span>
                          )}
                          {rec.density && (
                            <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              {rec.density === 'dense' ? '密集' : rec.density === 'sparse' ? '精炼' : '标准'}
                            </span>
                          )}
                        </div>
                        <div className="mt-auto pt-1.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleLoadHistory(rec)}
                            className="flex-1 py-1 rounded-lg text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
                          >
                            载入
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHistory(rec)}
                            className="px-2 py-1 rounded-lg text-[11px] border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-900 transition cursor-pointer"
                            title="删除该作品（同时清理它独占的插图文件）"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* 88+ 种信息图版式可视化选择弹窗 */}
      <LayoutSelectorModal
        open={showLayoutModal}
        onClose={() => setShowLayoutModal(false)}
        selectedLayoutId={selectedLayoutId}
        onSelect={(layoutId) => {
          setSelectedLayoutId(layoutId);
          const name = layoutId === 'auto' ? 'AI 智能自适应匹配' : LAYOUTS[layoutId]?.label || layoutId;
          showToast(`已选定信息图版式：【${name}】`, 'ok');
        }}
      />

      {/* 图片画风全景参考大厅弹窗（带具象化艺术预览、调色盘、质感说明） */}
      <StyleSelectorModal
        open={showStyleModal}
        onClose={() => setShowStyleModal(false)}
        selectedStyleId={defaultStyle}
        onSelect={(styleId) => {
          setDefaultStyle(styleId);
          const st = STYLE_OPTIONS.find((s) => s.id === styleId);
          const name = styleId === 'auto' ? '自动 (AI 语义分析匹配)' : (st?.label || styleId);
          showToast(`已选定图片画风：【${name}】`, 'ok');
        }}
      />

      {/* v0.7.26：专业波形时间轴全屏/抽屉模态框 */}
      <AdvancedTimelineModal
        isOpen={showAdvancedTimeline}
        onClose={() => setShowAdvancedTimeline(false)}
        videoDuration={videoDuration}
        currentTime={currentTime}
        onSeek={(t) => {
          if (videoRef.current) {
            videoRef.current.currentTime = t;
          }
          setCurrentTime(t);
        }}
        isPlaying={isPlaying}
        onTogglePlay={() => {
          if (videoRef.current) {
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play();
          }
        }}
        illustrations={illustrations}
        onUpdateIllustration={(id, patch) => {
          setIllustrations((prev) =>
            prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
          );
        }}
        asrUtterances={asrUtterances}
        videoSrc={videoUrl || undefined}
        globalLayout={globalLayout}
        aspectRatio={activeRatioObj.cssRatio}
        videoDimensions={videoDimensions}
      />
    </div>
  );
};

export default VideoIllustrator;

