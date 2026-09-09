import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { chatCompletion } from '../lib/modelHubService';
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
} from 'lucide-react';

// =========================================================================
// 官方视觉风格预设库与全片统一调色板系统 (对齐豆包等专业生成工具 + 风格色彩严密统一)
// =========================================================================
export interface StyleConfig {
  id: string;
  label: string;
  badge: string;
  desc: string;
  paletteTitle: string;
  bgTone: string;
  primaryColor: string;
  accentColor: string;
  standardPrompt: string;
  infographicPrompt: string;
}

export const STYLE_OPTIONS: StyleConfig[] = [
  {
    id: 'modern_business',
    label: '现代商务扁平',
    badge: '结构化图解',
    desc: '极简白底 · 商务宝蓝与警示红点缀 · 清晰2.5D微立体图解',
    paletteTitle: '现代商务色系',
    bgTone: '极简浅米白色商务底色，干净留白',
    primaryColor: '深邃商务宝蓝',
    accentColor: '珊瑚警示红与琥珀金高亮',
    standardPrompt: '现代商业极简插画风格，极简浅米白背景，商务宝蓝色调，精致扁平矢量质感，优雅留白，现代商务隐喻，8k超清，无水印',
    infographicPrompt: '现代高质感商业信息图设计，左右或上下结构化卡片排版。极简浅米白商务底色，商务宝蓝为主色调，珊瑚红用于警示风险与禁止事项，琥珀金用于关键数据高亮。包含清晰的流程导向箭头、对比模块看板与结构化数据卡片，微立体矢量质感，实体标注丰富清晰，专业可信，无任何水印',
  },
  {
    id: 'isometric_3d',
    label: '3D立体渲染',
    badge: '等距建模光影',
    desc: '柔光 3D 渲染 · 阶梯图层 · 水晶质感立体卡片',
    paletteTitle: '3D等距科技色系',
    bgTone: '浅柔灰白底色与温和立体环境光',
    primaryColor: '科技青蓝',
    accentColor: '活力橙红与高光青柠',
    standardPrompt: '3D卡通高精度建模渲染，柔和立体光照，细腻材质，温和环境光，现代商务科技，精致细节，8k超清，无水印',
    infographicPrompt: '3D立体等距商业信息图解。浅灰白立体展示台，包含高光水晶材质的3D阶梯层叠架构、三维柱状图与立体流向导管，科技青蓝色为主，橙红高亮关键节点，精致立体光影，现代科技感，无水印',
  },
  {
    id: 'cinematic_real',
    label: '商业写实摄影',
    badge: '写实纪实大片',
    desc: '超清商业纪实摄影 · 微景深虚化 · 高保真写实光影',
    paletteTitle: '电影商业写实影调',
    bgTone: '高端商务办公环境微景深虚化背景',
    primaryColor: '自然侧光冷暖对比',
    accentColor: '高光强调色与深沉暗部',
    standardPrompt: '商业电影级写实摄影，自然侧光，真实细腻微距质感，现代高端办公环境微景深虚化，8k超清画质，商业大片视觉，无水印',
    infographicPrompt: '商业写实风格信息看板，真实高端会议室磨砂玻璃白板上的高清数据图表投影，精细手绘商务流程与真实报表对比，真实自然光照，质感清晰逼真，无水印',
  },
  {
    id: 'chinese_ink',
    label: '中国风水墨',
    badge: '宣纸意境流转',
    desc: '水墨写意 · 黑白留白 · 朱砂印章点缀',
    paletteTitle: '东方典雅水墨色系',
    bgTone: '温润宣纸米黄底色与淡墨晕染',
    primaryColor: '浓淡相间松烟墨黑',
    accentColor: '传统朱砂红印与落日淡赭',
    standardPrompt: '中国传统写意水墨画风格，宣纸肌理，气韵生动，淡墨晕染，朱砂印章点缀，东方美学留白，意境悠远，无水印',
    infographicPrompt: '中国风古典手卷信息图。古色宣纸底色，以写意水墨山水线稿为框架，古籍雕版字体模块排版，朱砂印章标注核心要点，淡墨虚线指引流向，典雅东方知识图谱，无水印',
  },
  {
    id: 'cyberpunk',
    label: '未来科技赛博',
    badge: '暗黑全息数据',
    desc: '深邃暗夜黑底 · 蓝紫全息流光与荧光青绿',
    paletteTitle: '未来赛博全息色系',
    bgTone: '深邃暗夜哑光黑底与微光网格',
    primaryColor: '全息电光青蓝与霓虹紫',
    accentColor: '荧光柠檬绿与警示高亮粉',
    standardPrompt: '未来赛博朋克科技概念艺术，深邃暗黑背景，电光蓝与霓虹紫流光，全息悬浮质感，未来科幻张力，8k超清，无水印',
    infographicPrompt: '未来科技全息数据驾驶舱信息图。暗夜哑光黑底，悬浮三维全息数据图表、发光导轨线条与矩阵卡片，电光蓝为主色，荧光绿高亮关键数字，高精细度科幻UI视觉，无水印',
  },
  {
    id: 'anime_cartoon',
    label: '现代动漫卡通',
    badge: '明快治愈描线',
    desc: '清爽赛璐璐平涂 · 利落描线 · 鲜艳明快',
    paletteTitle: '明快现代动漫色系',
    bgTone: '清透奶白底色与微蓝天光',
    primaryColor: '活力天空蓝与明朗藏青',
    accentColor: '活力珊瑚橙与向日葵暖黄',
    standardPrompt: '精美现代日漫插画风格，干净平滑的描线，明快通透的赛璐璐上色，丰富的情绪张力，治愈系现代卡通质感，无水印',
    infographicPrompt: '趣味漫画科普信息图卡片。清爽明亮卡通背景，手绘描线风格的趣味卡片与向导气泡，鲜活明快的箭头与红黄绿配色指示，知识点清晰有趣，易读易懂，无水印',
  },
  {
    id: 'classical_oil',
    label: '古典艺术油画',
    badge: '欧洲典藏质感',
    desc: '古典主义厚涂肌理 · 经典明暗对比',
    paletteTitle: '古典学院油画色系',
    bgTone: '深沉暖褐与古典亚麻底色',
    primaryColor: '深沉群青与赭石',
    accentColor: '威尼斯红与古典金黄',
    standardPrompt: '欧洲古典油画风格，厚重笔触肌理，伦勃朗明暗对照光，庄重沉稳，古典艺术馆典藏油画质感，无水印',
    infographicPrompt: '复古羊皮纸手绘手稿信息图。复古羊皮纸纹理，古典达芬奇式手绘草图结构线与手写体批注，深褐墨水流程分支，典雅复古，无水印',
  },
  {
    id: 'watercolor_book',
    label: '清新水彩绘本',
    badge: '通透自然晕染',
    desc: '水色自然交融 · 温润柔和 · 轻盈灵动',
    paletteTitle: '温润水彩绘本色系',
    bgTone: '水彩纸颗粒质感浅白底色',
    primaryColor: '柔和湖蓝与橄榄绿',
    accentColor: '温润绯红与落日金黄',
    standardPrompt: '手绘清新水彩插画，水色自然渗透晕染，透明感十足，水彩纸质感纹理，温柔轻盈，无水印',
    infographicPrompt: '手绘水彩风格知识手账信息图。浅色水彩纸背景，手绘温和彩铅箭头与水彩渐变分栏卡片，柔和色彩标注对比与步骤，温暖亲和，无水印',
  },
];

// 彻底清除 HEX 码、RGB 码与指令元词的净化器，防止大模型将色码印在图片卡片上
export function sanitizePromptForImageGen(p: string): string {
  if (!p) return '';
  return p
    .replace(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/g, '')
    .replace(/rgba?\([^)]+\)/gi, '')
    .replace(/[（(]\s*#[^）)]*[）)]/g, '')
    .replace(/[（(]\s*(图[0-9]|标杆|推荐)[^）)]*[）)]/g, '')
    .replace(/统一背景底色基调[：:]?/g, '')
    .replace(/统一核心主色调[：:]?/g, '')
    .replace(/统一辅助高亮\/警示色[：:]?/g, '')
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

// 四维高价值视觉类型映射
export const VISUAL_CATEGORIES: Record<string, { label: string; icon: any; color: string; desc: string }> = {
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
  concept_metaphor: {
    label: '概念隐喻',
    icon: Lightbulb,
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    desc: '实体隐喻 · 商业电影 · 意象具象',
  },
};

export const VideoIllustrator: React.FC = () => {
  const { settings, patchSettings, showToast, pendingIllustrator, setPendingIllustrator } = useStore();

  // 核心状态
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoPath, setVideoPath] = useState<string>('');
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);
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

  // 全局排版、动效、边框与交互控制
  const [linkAllPositions, setLinkAllPositions] = useState<boolean>(true);
  const [transitionEffect, setTransitionEffect] = useState<'fade' | 'slide' | 'zoom' | 'none'>('fade');
  const [borderStyle, setBorderStyle] = useState<'none' | 'clean_white' | 'rounded_card' | 'star_badge' | 'cyber_glow'>('none');
  const [isEditingOverlay, setIsEditingOverlay] = useState<boolean>(false);

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
  // AI 智能规划插图分镜 (三级语义链条 + 全片统一色彩风格 + 3档密集度)
  // =========================================================================
  const handleAiPlanIllustrations = async () => {
    if (!scriptText.trim()) {
      showToast('请先输入或加载视频口播文案', 'err');
      return;
    }

    const dur = videoDuration > 0 ? videoDuration : 60;
    const modelHubSettings = (settings as any).modelHubSettings;
    const currentStyleObj = STYLE_OPTIONS.find((s) => s.id === defaultStyle) || STYLE_OPTIONS[0];
    const currentDensityObj = DENSITY_OPTIONS.find((d) => d.id === density) || DENSITY_OPTIONS[1];

    setIsPlanning(true);
    showToast(`AI 正在执行三级语义分析，基于【${currentStyleObj.label}】与【${currentDensityObj.label}】规划分镜…`, 'info');

    try {
      const systemPrompt = `你是一位国际顶尖的影视级短视频分镜视觉导演与信息架构设计大师。
你的任务是深度理解用户的视频完整口播台词，基于全局上下文和专业因果逻辑，规划最具视觉价值与干货含量的视频插图（Illustration Storyboard）。

【全片统一视觉基调（全片插图色彩与质感高度统一）】
全片选定统一视觉风格：【${currentStyleObj.label}】
- 视觉基调描述：${currentStyleObj.bgTone}，以${currentStyleObj.primaryColor}为主色调，以${currentStyleObj.accentColor}作为高亮与警示色。
- 标准插图规范：${currentStyleObj.standardPrompt}
- 信息图解规范：${currentStyleObj.infographicPrompt}

【带货营销与推销转化话术绝对禁配令（铁律）】
严禁为任何涉及“点击小黄车、购买课程、下单抢购、橱窗、领资料、私信我、关注直播间、扣1领福利、原价现价优惠”等纯带货营销或转化导流话术规划插图！
凡遇到此类推销话术，必须直接跳过，保持纯净留白，绝不生成任何无效插图。

【生图提示词（prompt）纯净度与结构化提炼铁律（重中之重）】
1. 绝对严禁在 prompt 中出现任何 '#' 十六进制色码（如 #FAF9F6、#1E40AF 等）或 RGB 数值！生图模型会把这些代码当成文字直接印在图片上！
2. 绝对严禁在 prompt 中出现“统一背景底色基调”、“统一核心主色调”、“辅助高亮”等指令元词！
3. 绝对严禁直接照抄口播整句台词作为标题！必须由你对该时刻的核心信息进行【深度结构化提炼与总结】：
   - 必须提炼出简明专业的主标题（6-12字，例如：“新公司法股东连带清偿穿透机制”）
   - 提炼出核心结构卡片（如：左侧【业务与资金混同风险】、右侧【独立法人隔离架构】）
   - 包含对比符号（打叉/打勾）、流程导向箭头、数据卡片等图解实体
4. 提示词标准规范范例：
   "现代商务信息图，极简浅米白商务底色，深邃商务宝蓝与珊瑚警示红双色模块排版。画面正中展示结构化图解看板，主标题为“新公司法股东连带清偿穿透机制”，左侧卡片展示“业务与资金混同风险”，右侧卡片展示“独立法人防火墙隔离架构”，配有清晰对比指引箭头，扁平矢量设计，专业出版物排版，8k超清，无水印"

【密集度规划节奏（${currentDensityObj.label}）】
- 目标密度模式：${currentDensityObj.badge}
- 规划目标：${currentDensityObj.desc}
- 两张插图之间的最小安全呼吸间隔：${currentDensityObj.minGap} 秒
- 单张插图展示时长：3.0 ~ 4.5 秒，绝不连续霸屏。

【核心规则：三级上下文深度理解，严禁断章取义】
1. 必须先理解全片宏观主旨（例如：企业股权架构设计与新公司法下的债务穿透风险、股东合法分红税务合规）。
2. 在确定每个分镜概念（concept）时，必须结合【前一句背景 + 当前句核心 + 后一句结论】综合研判。
   严禁孤立截取口语词（例如文案说“那转到个人卡大概每年可以转多少？500万以内，还有完税证明”，绝不能理解为普通的个人银行卡或消费转账，而必须理解为“股东税后合法分红资金流转与完税凭证合规架构”）。
3. 必须且仅在以下 4 大【高价值视觉时刻】规划插图：
   - data_stat（数据与指标）：准确呈现税率、比例、财务数字、数据对比看板。
   - step_framework（步骤与框架）：多阶流程、持股架构图、防火墙层叠、业务分支导向。
   - vs_comparison（正反对比与避坑）：左右红绿对比清单、违规穿透风险 vs 合规安全方案。
   - concept_metaphor（核心概念隐喻）：商业意象、天平合规、放大镜穿透审视、精密机械运转。

输出格式：严格合法的纯 JSON 数组，绝不要包含 markdown 围栏或其它对话寒暄：
[
  {
    "startTime": 2.5,
    "endTime": 6.5,
    "contextText": "前文背景+当前句完整语义原句",
    "concept": "基于全局上下文的精准核心概念 (8-16字)",
    "category": "data_stat",
    "type": "infographic",
    "model": "sensenova-u1-fast",
    "prompt": "融入统一色系与提炼出的结构化模块实体的专业提示词 (0色码0指令泄露)"
  }
]`;

      const userContent = `视频总时长：约 ${Math.round(dur)} 秒。
当前风格预设：${currentStyleObj.label}
密集度：${currentDensityObj.label} (${currentDensityObj.badge})
路由偏好：${routingMode === 'infographic' ? '全量信息图(u1-fast)' : routingMode === 'standard' ? '全量标准图(u1.5-lite)' : '四维智能路由'}
完整口播台词：
${scriptText}

请精选规划最具价值的插图分镜，输出严格 JSON 数组：`;

      let jsonStr = '';
      try {
        jsonStr = await chatCompletion(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          { temperature: 0.3 },
          modelHubSettings
        );
      } catch (e: any) {
        console.warn('ModelHub 调用失败，启动三级上下文智能规则引擎保底规划:', e);
      }

      let parsedItems: any[] = [];
      try {
        const cleaned = jsonStr.replace(/^```[a-z]*\s*/im, '').replace(/\s*```$/im, '').trim();
        const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
          parsedItems = JSON.parse(jsonMatch[0]);
        }
      } catch {
        console.warn('JSON 解析未命中，转为智能规则引擎保底');
      }

      // 本地三级上下文滑动窗口高质量规则引擎（在无大模型或网络断开时提供工业级高水准保底）
      if (!parsedItems || parsedItems.length === 0) {
        const rawSentences = scriptText
          .split(/[。！？!?；;\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 6);

        const scoredCandidates: Array<{
          sentence: string;
          contextWindow: string;
          score: number;
          category: 'data_stat' | 'step_framework' | 'vs_comparison' | 'concept_metaphor';
          concept: string;
          prompt: string;
        }> = [];

        for (let i = 0; i < rawSentences.length; i++) {
          const rawSent = rawSentences[i];
          // 过滤客套寒暄
          if (
            /^(大家好|欢迎大家|点赞关注|欢迎点赞|关注我|哈喽|感谢大家|我是[^\s，。]+)[，。！？!\s]*$/.test(rawSent) ||
            (rawSent.length < 15 && /(大家好|点赞|关注|欢迎|哈喽)/.test(rawSent))
          ) {
            continue;
          }

          // 严格禁配令：凡涉及带货、小黄车、卖课、优惠、下单话术，一律不配图
          if (SALES_PITCH_REGEX.test(rawSent)) {
            continue;
          }

          // 上下文滑动窗口：前一句 + 当前句 + 后一句
          const prevSent = i > 0 ? rawSentences[i - 1] : '';
          const nextSent = i < rawSentences.length - 1 ? rawSentences[i + 1] : '';
          const contextWindow = [prevSent, rawSent, nextSent].filter(Boolean).join('；');

          const cleanSent = rawSent.replace(
            /^(其实很多人不知道[，,\s]*|其实[，,\s]*|我们来看[，,\s]*|接下来[，,\s]*|大家知道[，,\s]*)/,
            ''
          );

          let titleEntity = cleanSent.replace(/[，。！？!?]/g, ' ').replace(/\s+/g, ' ').trim();
          if (titleEntity.length > 14) titleEntity = titleEntity.slice(0, 14);

          let score = 10;
          let cat: 'data_stat' | 'step_framework' | 'vs_comparison' | 'concept_metaphor' = 'concept_metaphor';
          let cpt = '核心认知与商业隐喻';
          let pmt = sanitizePromptForImageGen(
            `${currentStyleObj.standardPrompt}。画面核心生动呈现围绕【${titleEntity}】的隐喻意象，${currentStyleObj.bgTone}，${currentStyleObj.primaryColor}为主调，${currentStyleObj.accentColor}点缀，细节丰富，无水印`
          );

          const withoutQianwan = cleanSent.replace(/千万(别|不要|不能)/g, '');

          if (
            /[0-9%亿倍元折]/.test(withoutQianwan) ||
            /(百分之|\d+万|\d+千|增长|下滑|占比|同比|翻倍|成本|营收|利润|税率|个税)/.test(withoutQianwan)
          ) {
            score += 45;
            cat = 'data_stat';
            cpt = '核心数据指标与对比图解';
            pmt = sanitizePromptForImageGen(
              `${currentStyleObj.infographicPrompt}。画面正中展示【${titleEntity}】结构化数据对比看板，内嵌精准指标数值与比例卡片，附带导向箭头，${currentStyleObj.bgTone}，${currentStyleObj.primaryColor}为主色，${currentStyleObj.accentColor}突出关键数值，无水印`
            );
          } else if (
            /(第一|第二|第三|步骤|法则|方法|体系|逻辑|框架|三步|四维|流程|架构|穿透|隔离|第[一二三四五六七八九十])/.test(cleanSent)
          ) {
            score += 40;
            cat = 'step_framework';
            cpt = '关键进阶步骤与架构图解';
            pmt = sanitizePromptForImageGen(
              `${currentStyleObj.infographicPrompt}。以模块化多阶层叠图解清晰展现【${titleEntity}】的核心架构与流向分支，各节点标注具体业务名称与导向箭头，${currentStyleObj.bgTone}，${currentStyleObj.primaryColor}为主，${currentStyleObj.accentColor}点缀重点，层次分明，无水印`
            );
          } else if (
            /(千万别|千万不要|千万不能|不要|不能|避坑|陷阱|风险|对比|区别|相较于|红线|违规|警惕|连带|清偿)/.test(cleanSent)
          ) {
            score += 35;
            cat = 'vs_comparison';
            cpt = '避坑红线与正反对比清单';
            pmt = sanitizePromptForImageGen(
              `${currentStyleObj.infographicPrompt}。采用左右双栏对比排版，左侧红色警示打叉列出【${titleEntity}】中的严重风险与违规点，右侧绿色合规打勾展示正确方案与安全防火墙架构，${currentStyleObj.bgTone}，${currentStyleObj.primaryColor}统一基调，无水印`
            );
          } else if (/(核心|本质|真相|关键|痛点|破局|爆发|重构|底层|永续)/.test(cleanSent)) {
            score += 25;
            cat = 'concept_metaphor';
            cpt = '核心认知与商业隐喻';
          }

          if (score >= 25) {
            scoredCandidates.push({
              sentence: rawSent,
              contextWindow,
              score,
              category: cat,
              concept: cpt,
              prompt: pmt,
            });
          }
        }

        // 根据 3 档密集度动态计算目标数量
        let targetCount = Math.max(3, Math.min(6, Math.floor(dur / 12)));
        if (density === 'sparse') targetCount = Math.max(2, Math.min(4, Math.floor(dur / 20)));
        else if (density === 'dense') targetCount = Math.max(5, Math.min(12, Math.floor(dur / 7)));

        const sorted = [...scoredCandidates].sort((a, b) => b.score - a.score).slice(0, targetCount);
        sorted.sort((a, b) => scriptText.indexOf(a.sentence) - scriptText.indexOf(b.sentence));

        const totalChars = Math.max(1, scriptText.length);
        parsedItems = sorted.map((cand, idx) => {
          const charPos = scriptText.indexOf(cand.sentence);
          const ratio = charPos >= 0 ? charPos / totalChars : idx / Math.max(1, sorted.length);
          const estimatedStart = Math.min(Math.max(0, dur - 4.5), ratio * dur);
          const isInfo = cand.category !== 'concept_metaphor';

          return {
            startTime: Math.round(estimatedStart * 10) / 10,
            endTime: Math.round((estimatedStart + 3.8) * 10) / 10,
            contextText: cand.contextWindow || cand.sentence,
            concept: cand.concept,
            category: cand.category,
            type: isInfo ? 'infographic' : 'standard',
            model: isInfo ? 'sensenova-u1-fast' : 'sensenova-u1.5-lite',
            prompt: cand.prompt,
          };
        });
      }

      // 转换为正式 VideoIllustrationItem
      let formatted: VideoIllustrationItem[] = parsedItems.map((it: any, idx: number) => {
        const isInfo = routingMode === 'infographic' ? true : routingMode === 'standard' ? false : it.type === 'infographic' || it.category !== 'concept_metaphor';
        const modelName = isInfo ? 'sensenova-u1-fast' : 'sensenova-u1.5-lite';
        const ratioToUse = defaultRatio || '16:9';

        return {
          id: `ill_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          startTime: typeof it.startTime === 'number' ? it.startTime : idx * 10,
          endTime: typeof it.endTime === 'number' ? it.endTime : idx * 10 + 4.0,
          contextText: it.contextText || '',
          concept: it.concept || '核心视觉分镜',
          prompt: it.prompt || `${currentStyleObj.standardPrompt}，画面清晰，无水印`,
          type: isInfo ? 'infographic' : 'standard',
          model: modelName,
          category: it.category || 'concept_metaphor',
          style: defaultStyle,
          ratio: ratioToUse,
          status: 'idle',
        };
      });

      // 如果有已提取的 ASR 真实发音时间轴，立即吸附精准对齐
      if (asrUtterances.length > 0) {
        formatted = applyAsrAlignmentToIllustrations(formatted, asrUtterances);
      }

      setIllustrations(formatted);
      if (formatted.length > 0) {
        setSelectedIllustrationId(formatted[0].id);
      }
      showToast(`成功规划 ${formatted.length} 个高价值插图分镜！已锁定【${currentStyleObj.label}】统一配色体系`, 'ok');
    } catch (err: any) {
      showToast(err?.message || '规划分镜失败', 'err');
    } finally {
      setIsPlanning(false);
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

    const newItem: VideoIllustrationItem = {
      id: `ill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      startTime: st,
      endTime: et,
      contextText: '手动打点插图分镜',
      concept: '重点补充插图',
      prompt: sanitizePromptForImageGen(`${currentStyleObj.infographicPrompt}，画面纯净，高分辨率，无水印`),
      type: routingMode === 'standard' ? 'standard' : 'infographic',
      model: routingMode === 'standard' ? 'sensenova-u1.5-lite' : 'sensenova-u1-fast',
      category: 'step_framework',
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

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-50 dark:bg-[#0c0d11] text-zinc-800 dark:text-zinc-200 overflow-hidden select-none">
      {/* 顶部标题栏：呼吸感良好，展示 v0.7.0 特性 */}
      <div className="py-3 px-5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-white dark:bg-[#111217] shrink-0 min-h-[58px]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 via-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-md shrink-0">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">智能视频配插图</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200/60 dark:border-indigo-800/60">
                v0.7.1 · 紧凑排版与智能去标
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-200/60 dark:border-emerald-800/60">
                多图无损导出
              </span>
            </div>
            <p className="text-[11.5px] text-zinc-400 mt-0.5">
              深度上下文提炼 · 全片统一调色板 · 3档密集度 · 视频放大预览 · 0遗漏导出
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
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

      {/* 主创作工作区：左侧视频舞台与导演台，右侧分镜策划与生成清单 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：专业视频导演舞台（Video Stage） */}
        <div
          onClick={() => setIsEditingOverlay(false)} // 点击背景区域退出编辑模式，返回纯净无边框预览
          className="flex-1 flex flex-col p-3 border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-[#090a0f] overflow-y-auto min-w-0"
        >
          {videoUrl ? (
            <div className="flex-1 flex flex-col items-center justify-start max-w-2xl mx-auto w-full">
              {/* 舞台顶栏信息：分辨率、画幅、坐标提示 */}
              <div className="w-full flex items-center justify-between mb-2 px-1 text-[11px] text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 font-mono text-zinc-700 dark:text-zinc-300 font-medium">
                    {videoDimensions.width}×{videoDimensions.height} · {videoDimensions.width >= videoDimensions.height ? '横屏视频' : '竖屏视频'}
                  </span>
                  <span className="truncate max-w-[150px] text-zinc-500">{videoTitle}</span>
                </div>

                <div className="font-mono text-[10.5px] text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200/50 dark:border-indigo-900/40">
                  X {Math.round(globalLayout.xPercent * 100)}% · Y {Math.round(globalLayout.yPercent * 100)}% · 宽 {Math.round(globalLayout.widthPercent * 100)}%
                </div>
              </div>

              {/* 核心视频舞台 (Video Stage)：宽高比 100% 等同于视频原生尺寸，彻底消灭黑边偏移 */}
              <div className="relative w-full flex items-center justify-center bg-zinc-950/40 rounded-2xl p-2 border border-zinc-200 dark:border-zinc-800 shadow-inner">
                <div
                  ref={videoContainerRef}
                  className="relative rounded-xl overflow-hidden shadow-2xl bg-black select-none max-w-full"
                  style={{
                    aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}`,
                    maxHeight: '52vh',
                    width: videoDimensions.width >= videoDimensions.height ? '100%' : 'auto',
                    height: videoDimensions.width >= videoDimensions.height ? 'auto' : '52vh',
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

                  {/* 播放器内置双行自适应控制条：彻底杜绝 9:16 窄屏下的横向溢出，并新增放大预览 */}
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

                    {/* 第二行：操作控制与时间戳、放大预览按钮 */}
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
                          className="px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-[10.5px] flex items-center gap-1 transition cursor-pointer shrink-0 whitespace-nowrap"
                          title="在当前时间点增加一个新插图分镜"
                        >
                          <Plus className="w-3 h-3" />
                          <span>打点插图</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowExpandedVideo(true)}
                          className="px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-[10.5px] flex items-center gap-1 transition cursor-pointer shrink-0 whitespace-nowrap"
                          title="大视窗全屏放大预览视频成片与动效"
                        >
                          <Maximize2 className="w-3 h-3 text-indigo-300" />
                          <span>放大预览</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 舞台下方：插图包装与全片位置联动控制台 */}
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full mt-2.5 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111217] shadow-sm space-y-2.5"
              >
                {/* 顶层开关：全片联动与静默去水印状态 */}
                <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                      <span>插图包装与排版</span>
                    </span>

                    <label className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={linkAllPositions}
                        onChange={(e) => setLinkAllPositions(e.target.checked)}
                        className="rounded accent-indigo-600 cursor-pointer"
                      />
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        调整一个联动全片
                      </span>
                    </label>
                  </div>

                  {/* 默认全自动静默消除原片水印标签 */}
                  <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span>导出全自动静默消除水印</span>
                  </span>
                </div>

                {/* 动效选择与边框样式 */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10.5px] font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      <span>插图进退主动效</span>
                    </label>
                    <div className="flex items-center gap-1 flex-wrap">
                      {TRANSITION_OPTIONS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTransitionEffect(t.id as any);
                            setGlobalLayout((prev) => ({ ...prev, transitionEffect: t.id as any }));
                            showToast(`已应用【${t.label}】视觉动效`, 'ok');
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition cursor-pointer ${
                            transitionEffect === t.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                          title={t.desc}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                      <Sparkle className="w-3 h-3 text-indigo-500" />
                      <span>图片边框容器预设 (选无边框为直角)</span>
                    </label>
                    <div className="flex items-center gap-1 flex-wrap">
                      {BORDER_OPTIONS.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setBorderStyle(b.id as any);
                            setGlobalLayout((prev) => ({ ...prev, borderStyle: b.id as any }));
                            showToast(`已应用【${b.label}】边框样式`, 'ok');
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition cursor-pointer ${
                            borderStyle === b.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                          title={b.desc}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 画幅规格与 7 方位精准吸附 */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                  <div>
                    <label className="text-[10.5px] font-semibold text-zinc-500 mb-1 block">
                      画幅比例（选什么预览呈现什么）
                    </label>
                    <div className="flex items-center gap-1 flex-wrap">
                      {RATIO_OPTIONS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleChangeDefaultRatio(r.id)}
                          className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition cursor-pointer ${
                            (activeIllustration?.ratio || defaultRatio) === r.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                          title={r.desc}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold text-zinc-500 mb-1 block">
                      智能吸附方位 (7 点安全矩阵)
                    </label>
                    <div className="flex items-center gap-1 flex-wrap">
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
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                            globalLayout.positionPreset === pos.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
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

        {/* 右侧：分镜策划、统一风格库、3档密集度与插图清单 (紧凑自适应排版 w-[340px] xl:w-[380px]) */}
        <div className="w-[340px] xl:w-[380px] flex flex-col bg-white dark:bg-[#111217] shrink-0 border-l border-zinc-200 dark:border-zinc-800/80 min-w-0">
          {/* 策划配置区 */}
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80 space-y-2 shrink-0">
            {/* 路由模式切换 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11.5px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                  <SplitSquareVertical className="w-3 h-3 text-indigo-500" />
                  <span>SenseNova 路由策略</span>
                </label>
                <span className="text-[9.5px] text-zinc-400">两款专精模型分流</span>
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

            {/* 全片统一视觉风格选择 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11.5px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                  <Palette className="w-3 h-3 text-rose-500" />
                  <span>全片统一视觉风格</span>
                </label>
                <span className="text-[9.5px] text-indigo-500 font-medium">全片风格严格统一</span>
              </div>

              <select
                value={defaultStyle}
                onChange={(e) => setDefaultStyle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-[11.5px] text-zinc-800 dark:text-zinc-200 font-medium focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                {STYLE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {s.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* 3 档配图密集度选择 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11.5px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                  <LayoutGrid className="w-3 h-3 text-amber-500" />
                  <span>配图密集程度</span>
                </label>
                <span className="text-[9.5px] text-zinc-400">控制出图节奏</span>
              </div>
              <div className="grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800">
                {DENSITY_OPTIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDensity(d.id);
                      showToast(`已选择【${d.label}】配图节奏`, 'ok');
                    }}
                    className={`py-1 px-0.5 rounded-md text-[11px] font-medium transition cursor-pointer flex flex-col items-center justify-center gap-0.2 ${
                      density === d.id
                        ? 'border border-indigo-500 bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    <span>{d.label}</span>
                    <span className="text-[8.5px] opacity-75">{d.badge}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 口播文案输入与 ASR 毫秒级时间戳对齐 */}
            <div>
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
                    <span>去星号抽吸附</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExtractAsr}
                    disabled={isAsrExtracting}
                    className="text-[10.5px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                    title="从视频中精准提取毫秒级句子与发音时间戳"
                  >
                    <Mic className="w-3 h-3 text-indigo-500" />
                    <span>{isAsrExtracting ? '提取中…' : '重新提取 ASR 打轴'}</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={3}
                placeholder="粘贴口播台词或点击重新提取 ASR 打轴，AI 将三级深度研判上下文并规划插图…"
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />

              {asrUtterances.length > 0 && (
                <div className="mt-1 flex items-center justify-between text-[10.5px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-900/30">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>已加载 ASR 毫秒级时间轴 (共 {asrUtterances.length} 句)</span>
                  </span>
                  <span className="font-mono text-[9.5px]">高精度对齐</span>
                </div>
              )}
            </div>

            {/* 操作触发按钮组 */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleAiPlanIllustrations}
                disabled={isPlanning || !scriptText.trim()}
                className="flex-1 py-1.5 px-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-[11.5px] font-bold shadow-sm transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5 shrink-0" />
                <span>AI 智能规划高价值插图</span>
              </button>

              {illustrations.length > 0 && (
                <button
                  type="button"
                  onClick={handleBatchGenerateAll}
                  className="px-2.5 py-1.5 rounded-lg border border-indigo-500/50 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 text-[11px] font-semibold transition cursor-pointer shrink-0 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>全部生成 ({illustrations.filter((i) => i.status === 'success').length}/{illustrations.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* 分镜清单列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {illustrations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400">
                <Layers className="w-8 h-8 mb-2 opacity-40 text-indigo-500" />
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  暂无规划插图
                </p>
                <p className="text-[11px] mt-1 max-w-[200px]">
                  输入口播文案后点击【AI 智能规划高价值插图】，即可体验三级上下文与统一色系视觉体系
                </p>
              </div>
            ) : (
              illustrations.map((item, idx) => {
                const categoryObj = VISUAL_CATEGORIES[item.category || 'concept_metaphor'] || VISUAL_CATEGORIES.concept_metaphor;
                const CatIcon = categoryObj.icon;
                const isSelected = selectedIllustrationId === item.id;
                const isHovered = hoveredIllustrationId === item.id;

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
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 ring-1 ring-indigo-500 shadow-sm'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#14151c] hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {/* 分镜头部：序号、起止时段、分类标签与删除 */}
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <div className="flex items-center gap-1.5">
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
                          {item.model === 'sensenova-u1-fast' ? 'u1-fast (信息图)' : 'u1.5-lite (标准图)'}
                        </span>
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
                    <p className="text-[11.5px] text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed mb-2 font-script-reading">
                      “{item.contextText}”
                    </p>

                    {/* 画面概念与缩略图预览（支持鼠标悬停浮动放大与点击全屏大图灯箱） */}
                    <div className="flex items-center gap-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                      <div
                        className="relative w-14 h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center shrink-0 cursor-zoom-in group"
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
                              <ZoomIn className="w-4 h-4" />
                            </div>
                          </>
                        ) : (
                          <ImageIcon className="w-5 h-5 text-zinc-400" />
                        )}

                        {item.status === 'success' && (
                          <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow">
                            <Check className="w-2.5 h-2.5" />
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
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.concept}
                        </p>
                        <p className="text-[10.5px] text-zinc-400 line-clamp-2 mt-0.5" title={item.prompt}>
                          {item.prompt}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            比例: {item.ratio}
                          </span>
                          {item.status === 'generating' && (
                            <span className="text-[10px] text-indigo-500 font-medium animate-pulse">
                              正在调用商汤日日新绘图中…
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <span className="text-[10px] text-rose-500 font-medium">
                              生成失败: {item.error}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 重新生成按钮 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateSingleItem(item.id);
                        }}
                        disabled={item.status === 'generating'}
                        className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-medium transition cursor-pointer shrink-0 flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${item.status === 'generating' ? 'animate-spin text-indigo-500' : ''}`} />
                        <span>{item.status === 'success' ? '重新生成' : '生成图片'}</span>
                      </button>
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
              <span>{isExporting ? '视频合成导出中…' : '一键导出带插图成片视频 (FFmpeg 0遗漏)'}</span>
            </button>
          </div>
        </div>
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

