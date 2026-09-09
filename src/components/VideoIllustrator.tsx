import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import { chatCompletion } from '../lib/modelHubService';
import type { VideoIllustrationItem, IllustrationLayout } from '../types';
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
  Mic,
  CheckCircle2,
  BarChart2,
  GitFork,
  Scale,
  Lightbulb,
} from 'lucide-react';

// 官方主流风格预设
const STYLE_OPTIONS = [
  { id: 'realistic', label: '写实摄影', desc: '真实质感 · 商业光影' },
  { id: 'flat_vector', label: '扁平插画', desc: '利落几何 · 明快设计' },
  { id: 'infographic_clean', label: '知识信息图', desc: '结构排版 · 数据图解' },
  { id: '3d_render', label: '3D卡通渲染', desc: '皮克斯立体质感' },
  { id: 'chinese_ink', label: '水墨国风', desc: '东方意境 · 笔触晕染' },
  { id: 'cyberpunk', label: '赛博朋克', desc: '霓虹科技 · 高对比炫光' },
  { id: 'minimalist', label: '商业极简', desc: '高级留白 · 杂志美学' },
];

// 比例尺寸预设（对齐商汤 SenseNova 官方推荐规格，并提供数值比例与 CSS 格式）
const RATIO_OPTIONS = [
  { id: '16:9', label: '16:9 横屏', size: '2752x1536', desc: '宽屏演示/信息图', ratioNum: 16 / 9, cssRatio: '16 / 9' },
  { id: '9:16', label: '9:16 竖屏', size: '1536x2752', desc: '短视频/手机竖卡', ratioNum: 9 / 16, cssRatio: '9 / 16' },
  { id: '1:1', label: '1:1 方形', size: '2048x2048', desc: '画中画封面', ratioNum: 1, cssRatio: '1 / 1' },
  { id: '3:4', label: '3:4 竖卡', size: '1760x2368', desc: '知识清单卡片', ratioNum: 3 / 4, cssRatio: '3 / 4' },
  { id: '4:3', label: '4:3 横卡', size: '2368x1760', desc: '平板信息图', ratioNum: 4 / 3, cssRatio: '4 / 3' },
];

// 四维视觉价值类型定义
const VISUAL_CATEGORIES = {
  data_stat: {
    id: 'data_stat',
    label: '数据图表',
    icon: BarChart2,
    color: 'emerald',
    desc: '统计数字 / 占比趋势 / 数据对比',
    defaultType: 'infographic' as const,
    defaultModel: 'sensenova-u1-fast' as const,
  },
  step_framework: {
    id: 'step_framework',
    label: '步骤法则',
    icon: GitFork,
    color: 'indigo',
    desc: '进阶流程 / 架构图解 / 拆解步骤',
    defaultType: 'infographic' as const,
    defaultModel: 'sensenova-u1-fast' as const,
  },
  vs_comparison: {
    id: 'vs_comparison',
    label: '正反对比',
    icon: Scale,
    color: 'amber',
    desc: '避坑红线 / 错误与正确 / 对比清单',
    defaultType: 'infographic' as const,
    defaultModel: 'sensenova-u1-fast' as const,
  },
  concept_metaphor: {
    id: 'concept_metaphor',
    label: '概念隐喻',
    icon: Lightbulb,
    color: 'purple',
    desc: '具象隐喻 / 商业意象 / 电影质感',
    defaultType: 'standard' as const,
    defaultModel: 'sensenova-u1.5-lite' as const,
  },
};

// 动态根据视频宽高比与插图比例自适应计算预设安全坐标与尺寸
function calculatePresetLayout(
  presetId: string,
  vidW: number,
  vidH: number,
  imgRatioVal: number
): IllustrationLayout {
  const isLandscape = vidW >= vidH;
  const vidRatio = vidW / Math.max(1, vidH);

  let targetWPct = isLandscape ? 0.28 : 0.38;
  if (presetId === 'center') {
    targetWPct = isLandscape ? 0.52 : 0.78;
  }

  // 计算对应高度百分比
  let targetHPct = targetWPct * (vidRatio / imgRatioVal);
  const maxHPct = presetId === 'center' ? 0.75 : 0.62;
  if (targetHPct > maxHPct) {
    targetWPct = (maxHPct * imgRatioVal) / vidRatio;
    targetHPct = targetWPct * (vidRatio / imgRatioVal);
  }

  const padX = isLandscape ? 0.04 : 0.05;
  const padY = isLandscape ? 0.06 : 0.08;

  let x = padX;
  let y = padY;

  switch (presetId) {
    case 'top-right':
      x = Math.max(0, 1 - targetWPct - padX);
      y = padY;
      break;
    case 'top-left':
      x = padX;
      y = padY;
      break;
    case 'bottom-right':
      x = Math.max(0, 1 - targetWPct - padX);
      y = Math.max(0, 1 - targetHPct - (isLandscape ? 0.12 : 0.15));
      break;
    case 'bottom-left':
      x = padX;
      y = Math.max(0, 1 - targetHPct - (isLandscape ? 0.12 : 0.15));
      break;
    case 'center':
      x = Math.max(0, (1 - targetWPct) / 2);
      y = Math.max(0, (1 - targetHPct) / 2);
      break;
    default:
      x = 1 - targetWPct - padX;
      y = padY;
  }

  return {
    xPercent: Math.round(x * 1000) / 1000,
    yPercent: Math.round(y * 1000) / 1000,
    widthPercent: Math.round(targetWPct * 1000) / 1000,
    heightPercent: Math.round(targetHPct * 1000) / 1000,
    positionPreset: presetId as any,
  };
}

export default function VideoIllustrator() {
  const {
    settings,
    patchSettings,
    modelHubSettings,
    showToast,
    pendingIllustrator,
    setPendingIllustrator,
  } = useStore();

  // 1. 视频与台词基础状态
  const [videoPath, setVideoPath] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [scriptText, setScriptText] = useState<string>('');
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 1080,
    height: 1920,
  });

  const [asrUtterances, setAsrUtterances] = useState<
    Array<{
      text: string;
      startTime: number;
      endTime: number;
      speaker?: string;
      words?: Array<{ text: string; startTime: number; endTime: number }>;
    }>
  >([]);

  // 2. 商汤 TokenPlan 密匙与参数
  const [snApiKey, setSnApiKey] = useState<string>(settings?.sensenovaApiKey || '');
  const [showKeyConfig, setShowKeyConfig] = useState<boolean>(false);
  const [testingKey, setTestingKey] = useState<boolean>(false);

  // 3. 路由与生图偏好
  const [routingMode, setRoutingMode] = useState<'smart' | 'standard' | 'infographic'>('smart');
  const [defaultStyle, setDefaultStyle] = useState<string>(settings?.sensenovaDefaultStyle || 'infographic_clean');
  const [defaultRatio, setDefaultRatio] = useState<string>(settings?.sensenovaDefaultRatio || '1:1');

  // 4. 插图分镜列表与状态
  const [illustrations, setIllustrations] = useState<VideoIllustrationItem[]>([]);
  const [planning, setPlanning] = useState<boolean>(false);
  const [batchGenerating, setBatchGenerating] = useState<boolean>(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // 5. 联动位置布局状态（核心：调整一个联动所有，100% 所见即所得）
  const [linkAllPositions, setLinkAllPositions] = useState<boolean>(true);
  const [globalLayout, setGlobalLayout] = useState<IllustrationLayout>({
    xPercent: 0.62,
    yPercent: 0.08,
    widthPercent: 0.34,
    heightPercent: 0.20,
    positionPreset: 'top-right',
  });

  // 6. 导出合成状态
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportResultPath, setExportResultPath] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startW: number;
    stageW: number;
    stageH: number;
    imgRatio: number;
  } | null>(null);

  // 监听外部跳转传入（如数字人出片完成一键跳转）
  useEffect(() => {
    if (pendingIllustrator) {
      if (pendingIllustrator.videoPath) {
        setVideoPath(pendingIllustrator.videoPath);
        setVideoUrl(`file:///${pendingIllustrator.videoPath.replace(/\\/g, '/')}`);
      } else if (pendingIllustrator.videoUrl) {
        setVideoUrl(pendingIllustrator.videoUrl);
      }
      if (pendingIllustrator.scriptText) {
        setScriptText(pendingIllustrator.scriptText);
      }
      if (pendingIllustrator.title) {
        setVideoTitle(pendingIllustrator.title);
      }
      setPendingIllustrator(null);
    }
  }, [pendingIllustrator, setPendingIllustrator]);

  // 同步 settings 密匙
  useEffect(() => {
    if (settings?.sensenovaApiKey) {
      setSnApiKey(settings.sensenovaApiKey);
    }
  }, [settings?.sensenovaApiKey]);

  // 监听视频导出进度
  useEffect(() => {
    const off = api.onExportVideoProgress?.((data) => {
      if (videoDuration > 0 && data?.currentTimeSec) {
        const pct = Math.min(99, Math.round((data.currentTimeSec / videoDuration) * 100));
        setExportProgress(pct);
      }
    });
    return () => {
      if (off) off();
    };
  }, [videoDuration]);

  // 选择本地视频
  const handlePickVideo = async () => {
    try {
      const p = await api.pickMediaFile();
      if (p) {
        setVideoPath(p);
        setVideoUrl(`file:///${p.replace(/\\/g, '/')}`);
        setVideoTitle(p.split(/[/\\]/).pop() || '本地视频');
        setIllustrations([]);
        setExportResultPath(null);
        showToast('视频已载入', 'ok');
      }
    } catch (e: any) {
      showToast(e?.message || '选择视频失败', 'err');
    }
  };

  // 视频拖放
  const handleDropVideo = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const p = api.getPathForFile ? api.getPathForFile(file) : (file as any).path || '';
      if (p) {
        setVideoPath(p);
        setVideoUrl(`file:///${p.replace(/\\/g, '/')}`);
        setVideoTitle(file.name);
        setIllustrations([]);
        setExportResultPath(null);
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
    const ratioId = activeIllustration?.ratio || defaultRatio || '1:1';
    return RATIO_OPTIONS.find((r) => r.id === ratioId) || RATIO_OPTIONS[2];
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
        const st = Math.round((bestMatch.startTime / 1000) * 10) / 10;
        let et = Math.round((bestMatch.endTime / 1000) * 10) / 10;
        if (et - st < 2.5) et = Math.min(dur, Math.round((st + 3.5) * 10) / 10);
        return {
          ...item,
          startTime: st,
          endTime: et,
        };
      }
      return item;
    });
    setIllustrations(updated);
    return updated;
  };

  // 智能语音识别 ASR 获取台词与毫秒级时间戳
  const handleExtractSpeech = async () => {
    const targetSource = videoPath || (videoUrl?.startsWith('file:///') ? videoUrl.replace('file:///', '') : videoUrl);
    if (!targetSource) {
      showToast('请先载入或选择视频', 'err');
      return;
    }
    setTranscribing(true);
    try {
      showToast('正在提取音轨并调用语音大模型进行词句级时间戳打标…', 'info');
      const res = await api.transcribe({ filePath: targetSource, enableSpeakerInfo: false });
      if (res && res.text) {
        setScriptText(res.text);
        const utts = res.utterances || [];
        setAsrUtterances(utts);

        if (illustrations.length > 0 && utts.length > 0) {
          applyAsrAlignmentToIllustrations(illustrations, utts);
          showToast(`台词提取成功，已根据 ${utts.length} 处语音时间轴毫秒级对齐！`, 'ok');
        } else {
          showToast(`台词与精准时间轴提取成功（共 ${utts.length} 处分句）！`, 'ok');
        }
      } else {
        showToast('未识别到有效语音内容', 'info');
      }
    } catch (err: any) {
      showToast(`语音识别失败: ${err?.message || '未知错误'}`, 'err');
    } finally {
      setTranscribing(false);
    }
  };

  // 切换模型路由偏好（即时响应同步所有插图）
  const handleSwitchRoutingMode = (mode: 'smart' | 'standard' | 'infographic') => {
    setRoutingMode(mode);
    if (illustrations.length > 0) {
      setIllustrations((prev) =>
        prev.map((item) => {
          let newModel = item.model;
          let newType = item.type;
          let newPrompt = item.prompt;
          if (mode === 'infographic') {
            newModel = 'sensenova-u1-fast';
            newType = 'infographic';
          } else if (mode === 'standard') {
            newModel = 'sensenova-u1.5-lite';
            newType = 'standard';
          } else {
            const isInfo = item.category !== 'concept_metaphor';
            newModel = isInfo ? 'sensenova-u1-fast' : 'sensenova-u1.5-lite';
            newType = isInfo ? 'infographic' : 'standard';
          }
          return {
            ...item,
            model: newModel,
            type: newType,
            prompt: newPrompt,
          };
        })
      );
      showToast(
        mode === 'infographic'
          ? '已全量切换为 sensenova-u1-fast (信息图模式)'
          : mode === 'standard'
          ? '已全量切换为 sensenova-u1.5-lite (标准图模式)'
          : '已开启四维智能动态路由',
        'ok'
      );
    }
  };

  // 切换官方风格预设
  const handleChangeDefaultStyle = (newStyle: string) => {
    setDefaultStyle(newStyle);
    if (illustrations.length > 0) {
      setIllustrations((prev) => prev.map((it) => ({ ...it, style: newStyle })));
      const styleName = STYLE_OPTIONS.find((s) => s.id === newStyle)?.label || newStyle;
      showToast(`已切换风格为「${styleName}」`, 'ok');
    }
  };

  // 切换画幅比例（响应式同步所有插图与预览舞台）
  const handleChangeDefaultRatio = (newRatio: string) => {
    setDefaultRatio(newRatio);
    const rObj = RATIO_OPTIONS.find((r) => r.id === newRatio) || RATIO_OPTIONS[2];
    if (illustrations.length > 0) {
      setIllustrations((prev) => prev.map((it) => ({ ...it, ratio: newRatio })));
    }
    // 联动调整当前浮层的 heightPercent 以严防溢出
    const vidRatio = videoDimensions.width / Math.max(1, videoDimensions.height);
    const newHPct = globalLayout.widthPercent * (vidRatio / rObj.ratioNum);
    setGlobalLayout((prev) => ({
      ...prev,
      heightPercent: Math.round(newHPct * 1000) / 1000,
      yPercent: Math.min(prev.yPercent, Math.max(0, 1 - newHPct)),
    }));
    showToast(`已切换插图画幅比例为 ${newRatio}`, 'ok');
  };

  // 联动修改位置预设（横竖屏动态安全计算）
  const handleApplyPresetPosition = (presetId: string) => {
    const newLayout = calculatePresetLayout(
      presetId,
      videoDimensions.width,
      videoDimensions.height,
      activeRatioObj.ratioNum
    );
    setGlobalLayout(newLayout);
    showToast(`已应用【${presetId}】位置预设（全片联动）`, 'ok');
  };

  // 预览区鼠标拖拽与缩放（100% 严密防溢出与所见即所得）
  const handleMouseDown = (e: React.MouseEvent, isResize: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const stageEl = videoContainerRef.current;
    if (!stageEl) return;
    const stageRect = stageEl.getBoundingClientRect();
    const stageW = stageRect.width;
    const stageH = stageRect.height;
    const ratioVal = activeRatioObj.ratioNum;

    dragRef.current = {
      isDragging: !isResize,
      isResizing: isResize,
      startX: e.clientX,
      startY: e.clientY,
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

        const newLeft = Math.max(0, Math.min(maxLeft, dragRef.current.startLeft + dx));
        const newTop = Math.max(0, Math.min(maxTop, dragRef.current.startTop + dy));

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
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 全新四维高价值插图规划引擎（去除废话，合理节奏，四要素工业级提示词）
  const handleAiPlanIllustrations = async () => {
    if (!scriptText.trim()) {
      showToast('请先提取或粘贴视频口播台词', 'err');
      return;
    }
    const dur = videoDuration > 0 ? videoDuration : 60;
    setPlanning(true);

    try {
      showToast('AI 正在深度解析口播文案，过滤无效废话并锚定高价值插图时刻…', 'info');

      const systemPrompt = `你是一名顶级商业短视频视觉导演。你的任务是根据视频时长与口播台词，【精选最具视觉信息增量的高价值时刻】规划画中画插图。

【核心原则：宁缺毋滥，拒绝无脑堆图】
1. 绝对不要为以下废话配图（负向过滤）：
   - 开场寒暄、客套（如“大家好”、“今天给大家分享”、“欢迎关注”等）；
   - 口语过渡词与无意义短句（如“其实很简单”、“也就是说”、“接下来看”等）；
   - 无实体、无法具象化的空泛表达。
2. 必须且仅在以下 4 大【高价值视觉时刻】安排插图（category）：
   - data_stat（数据与趋势）：出现百分比、倍数、数字统计、趋势走势。视觉上呈现为现代专业数据图表、占比环形图、对比折线。
   - step_framework（步骤与框架）：出现“第1/2/3步”、“核心法则”、“底层逻辑架构”。视觉上呈现为递进阶梯卡片、流程箭头图解、模块架构。
   - vs_comparison（正反对比与避坑）：出现“雷区/陷阱/不要做/正确做法 vs 错误做法”。视觉上呈现为左右红绿对比清单、打叉警示与打勾合规表。
   - concept_metaphor（核心概念隐喻）：抽象行业概念、商业模式、转折高潮。视觉上呈现为极具电影质感的实体视觉隐喻（如放大镜聚焦账本、平衡天平、精密齿轮组）。
3. 节奏与密度铁律：
   - 单张插图展示时长严格控制在 3.0 ~ 4.5 秒；
   - 两张插图之间必须保留至少 4 ~ 8 秒的视频原生画面呼吸留白，严禁连续霸屏；
   - 60秒视频通常规划 3~5 张精选插图，90秒视频 4~7 张，拒绝泛滥。
4. 商汤 SenseNova 双模型工业级路由与四要素提示词规范：
   - 类别 data_stat, step_framework, vs_comparison ➔ type: "infographic", model: "sensenova-u1-fast"
   - 类别 concept_metaphor ➔ type: "standard", model: "sensenova-u1.5-lite"
   - 提示词 prompt 必须遵循四要素结构：
     [版式与构图] + [画面核心主体及细节] + [配色质感与光影] + [商业级无杂乱乱码约束]
     （例如信息图：清晰指明是“现代极简信息图卡片，中心展示三阶流程图解，左附数据卡，米白商务底，深蓝与橙色微渐变，精致矢量立体质感，图形化表达，避免生僻杂乱小字”；
      标准图：“商业电影级写实摄影，极简构图，主体为深色木质桌面上的一台精密金色天平与审计放大镜，柔和侧光，景深微虚，8k超清画质”）。

必须输出严格合法的纯 JSON 数组，绝不要包含 markdown 围栏或其它对话寒暄，数组格式：
[
  {
    "startTime": 2.5,
    "endTime": 6.5,
    "contextText": "对应台词原句（完整保留）",
    "concept": "插图核心概念 (8-16字简练概括)",
    "category": "data_stat",
    "type": "infographic",
    "model": "sensenova-u1-fast",
    "prompt": "符合四要素规范的商汤高质感生图提示词"
  }
]`;

      const userContent = `视频总时长：约 ${Math.round(dur)} 秒。\n官方选定风格：${STYLE_OPTIONS.find((s) => s.id === defaultStyle)?.label || defaultStyle}。\n路由偏好：${routingMode === 'infographic' ? '全量信息图(u1-fast)' : routingMode === 'standard' ? '全量标准图(u1.5-lite)' : '四维智能路由'}。\n完整口播台词：\n${scriptText}\n\n请精选规划最具价值的插图分镜，输出严格 JSON 数组：`;

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
        console.warn('ModelHub 调用失败，启动智能规则引擎保底规划:', e);
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

      // 本地高质量规则评分引擎（智能过滤废话，提取高价值视觉时刻）
      if (!parsedItems || parsedItems.length === 0) {
        const rawSentences = scriptText
          .split(/[。！？!?；;\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 6);

        // 评分与分类
        const scoredCandidates: Array<{
          sentence: string;
          score: number;
          category: 'data_stat' | 'step_framework' | 'vs_comparison' | 'concept_metaphor';
          concept: string;
          prompt: string;
        }> = [];

        for (const rawSent of rawSentences) {
          // 1. 严格过滤纯寒暄与无意义废话短句
          if (
            /^(大家好|欢迎大家|点赞关注|欢迎点赞|关注我|哈喽|感谢大家|我是[^\s，。]+)[，。！？!\s]*$/.test(rawSent) ||
            (rawSent.length < 15 && /(大家好|点赞|关注|欢迎|哈喽)/.test(rawSent))
          ) {
            continue;
          }

          // 清洗开头的口语过渡前缀
          const cleanSent = rawSent.replace(
            /^(其实很多人不知道[，,\s]*|其实[，,\s]*|我们来看[，,\s]*|接下来[，,\s]*|大家知道[，,\s]*)/,
            ''
          );

          let score = 10;
          let cat: 'data_stat' | 'step_framework' | 'vs_comparison' | 'concept_metaphor' = 'concept_metaphor';
          let cpt = '核心认知与商业隐喻';
          let pmt = `商业电影级写实摄影，极简构图。画面主体生动呈现“${cleanSent.slice(0, 24)}”的核心意象，现代商务环境微景深虚化，高级光影，精致立体质感，8k超清`;

          // 避免“千万别”、“千万不要”误伤为数字
          const withoutQianwan = cleanSent.replace(/千万(别|不要|不能)/g, '');

          if (
            /[0-9%亿倍元折]/.test(withoutQianwan) ||
            /(百分之|\d+万|\d+千|增长|下滑|占比|同比|翻倍|成本|营收|利润)/.test(withoutQianwan)
          ) {
            score += 45;
            cat = 'data_stat';
            cpt = '核心数据指标与趋势图解';
            pmt = `现代商业信息图卡片设计。居中呈现“${cleanSent.slice(0, 24)}”的清晰数据图表与占比圆环，附带对比指标卡片，浅色极简商务背景，科技蓝与活力橙配色，精致微立体矢量质感，无杂乱文字`;
          } else if (
            /(第一|第二|第三|步骤|法则|方法|体系|逻辑|框架|三步|四维|流程|第[一二三四五六七八九十])/.test(cleanSent)
          ) {
            score += 40;
            cat = 'step_framework';
            cpt = '关键进阶步骤与架构图解';
            pmt = `现代极简信息图设计。以模块化流程图解形式清晰展现“${cleanSent.slice(0, 24)}”的步骤要点，递进式箭头排版，商务米白背景，质感深灰与蓝紫点缀，留白充足，层次分明，图形化表达`;
          } else if (
            /(千万别|千万不要|千万不能|不要|不能|避坑|陷阱|风险|对比|区别|相较于|红线|违规|警惕|作弊)/.test(cleanSent)
          ) {
            score += 35;
            cat = 'vs_comparison';
            cpt = '避坑红线与正反对比清单';
            pmt = `专业正反对比信息图卡片。采用左右分栏排版，左侧红色警示打叉列出避坑要点，右侧绿色合规打勾展示正确方案，围绕“${cleanSent.slice(0, 24)}”展开，现代极简设计风格，图标化表达`;
          } else if (/(核心|本质|真相|关键|痛点|破局|爆发|重构|底层|永续)/.test(cleanSent)) {
            score += 25;
            cat = 'concept_metaphor';
            cpt = '核心认知与商业隐喻';
          }

          if (score >= 25) {
            scoredCandidates.push({ sentence: rawSent, score, category: cat, concept: cpt, prompt: pmt });
          }
        }

        // 选取 Top 3~6 张插图，并保证时间间隔
        const targetCount = Math.max(2, Math.min(6, Math.floor(dur / 12)));
        const sorted = [...scoredCandidates].sort((a, b) => b.score - a.score).slice(0, targetCount);

        // 按在文本中出现的先后次序排序
        sorted.sort((a, b) => scriptText.indexOf(a.sentence) - scriptText.indexOf(b.sentence));

        const totalChars = Math.max(1, scriptText.length);
        parsedItems = sorted.map((cand, idx) => {
          const charPos = scriptText.indexOf(cand.sentence);
          const ratio = charPos >= 0 ? charPos / totalChars : idx / Math.max(1, sorted.length);
          let st = Math.max(1.5, Math.min(dur - 4.5, Math.round(ratio * dur * 10) / 10));
          let et = Math.min(dur, Math.round((st + 4.0) * 10) / 10);

          if (asrUtterances.length > 0) {
            const uttIdx = Math.min(asrUtterances.length - 1, Math.floor((idx / sorted.length) * asrUtterances.length));
            const matchedUtt = asrUtterances[uttIdx];
            if (matchedUtt) {
              st = Math.round((matchedUtt.startTime / 1000) * 10) / 10;
              et = Math.round((matchedUtt.endTime / 1000) * 10) / 10;
              if (et - st < 2.5) et = Math.min(dur, Math.round((st + 3.8) * 10) / 10);
            }
          }

          const isInfo = cand.category !== 'concept_metaphor';
          return {
            startTime: st,
            endTime: et,
            contextText: cand.sentence,
            concept: cand.concept,
            category: cand.category,
            type: isInfo ? 'infographic' : 'standard',
            model: isInfo ? 'sensenova-u1-fast' : 'sensenova-u1.5-lite',
            prompt: cand.prompt,
          };
        });
      }

      // 格式化与策略约束
      let formatted: VideoIllustrationItem[] = parsedItems.map((item, idx) => {
        const cat = (item.category as any) in VISUAL_CATEGORIES ? item.category : 'concept_metaphor';
        let finalModel = item.model || 'sensenova-u1-fast';
        let finalType: 'infographic' | 'standard' = item.type === 'standard' ? 'standard' : 'infographic';

        if (routingMode === 'standard') {
          finalModel = 'sensenova-u1.5-lite';
          finalType = 'standard';
        } else if (routingMode === 'infographic') {
          finalModel = 'sensenova-u1-fast';
          finalType = 'infographic';
        } else {
          finalType = cat === 'concept_metaphor' ? 'standard' : 'infographic';
          finalModel = finalType === 'infographic' ? 'sensenova-u1-fast' : 'sensenova-u1.5-lite';
        }

        return {
          id: `ill_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          startTime: Number(item.startTime) || idx * 8,
          endTime: Number(item.endTime) || idx * 8 + 4,
          contextText: item.contextText || '',
          concept: item.concept || '核心插图视觉化',
          category: cat,
          prompt: item.prompt || '现代高清插画，构图优美，细腻光影质感',
          type: finalType,
          model: finalModel as any,
          style: defaultStyle,
          ratio: defaultRatio,
          status: 'idle',
        };
      });

      // 若有 ASR 数据，自动强吸附
      if (asrUtterances.length > 0) {
        formatted = applyAsrAlignmentToIllustrations(formatted, asrUtterances);
      }

      setIllustrations(formatted);
      if (formatted.length > 0) {
        setSelectedItemId(formatted[0].id);
      }
      showToast(`🎯 AI 成功精选规划了 ${formatted.length} 处高价值视觉分镜！`, 'ok');
    } catch (err: any) {
      showToast(`AI 规划失败: ${err?.message || '未知错误'}`, 'err');
    } finally {
      setPlanning(false);
    }
  };

  // 生成单张插图
  const handleGenerateSingle = async (item: VideoIllustrationItem) => {
    if (!snApiKey.trim()) {
      setShowKeyConfig(true);
      showToast('请先配置商汤 TokenPlan API Key', 'err');
      return;
    }

    setIllustrations((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: 'generating', error: undefined } : it))
    );

    try {
      const targetSize = RATIO_OPTIONS.find((r) => r.id === item.ratio)?.size || '2048x2048';
      const res = await api.sensenovaGenerateImage({
        apiKey: snApiKey.trim(),
        model: item.model,
        prompt: item.prompt,
        size: targetSize,
        style: item.style,
        imageBase64: item.referenceImage,
      });

      if (res.ok && (res.localPath || res.imageUrl)) {
        setIllustrations((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'success',
                  localPath: res.localPath,
                  imageUrl: res.imageUrl,
                }
              : it
          )
        );
        showToast('插图生成成功！', 'ok');
      } else {
        throw new Error(res.error || '生成失败');
      }
    } catch (err: any) {
      setIllustrations((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: 'failed', error: err?.message || '生成失败' } : it
        )
      );
      showToast(`插图生成失败: ${err?.message || '未知错误'}`, 'err');
    }
  };

  // 批量并发生成所有未生成的插图
  const handleBatchGenerate = async () => {
    if (!snApiKey.trim()) {
      setShowKeyConfig(true);
      showToast('请先配置商汤 TokenPlan API Key', 'err');
      return;
    }
    const pending = illustrations.filter((it) => it.status !== 'success');
    if (pending.length === 0) {
      showToast('所有插图均已生成完毕', 'info');
      return;
    }

    setBatchGenerating(true);
    let successCount = 0;
    try {
      for (const item of pending) {
        await handleGenerateSingle(item);
        successCount++;
      }
      showToast(`批量生图完毕，成功生成 ${successCount} 张插图！`, 'ok');
    } finally {
      setBatchGenerating(false);
    }
  };

  // 增加一张插图（在当前播放时间点）
  const handleAddIllustration = () => {
    const cur = Math.round(currentTime * 10) / 10;
    const dur = videoDuration > 0 ? videoDuration : 60;
    const end = Math.min(dur, Math.round((cur + 4.0) * 10) / 10);
    const newIt: VideoIllustrationItem = {
      id: `ill_manual_${Date.now()}`,
      startTime: cur,
      endTime: end,
      contextText: '手动插入分镜时刻',
      concept: '自选要点视觉化',
      category: 'concept_metaphor',
      prompt: '现代极简商业插图，主体明确，构图精炼，层次分明，8k细节',
      type: routingMode === 'standard' ? 'standard' : 'infographic',
      model: routingMode === 'standard' ? 'sensenova-u1.5-lite' : 'sensenova-u1-fast',
      style: defaultStyle,
      ratio: defaultRatio,
      status: 'idle',
    };
    setIllustrations((prev) => [...prev, newIt].sort((a, b) => a.startTime - b.startTime));
    setSelectedItemId(newIt.id);
    showToast('已在当前播放时刻打点插入新插图', 'ok');
  };

  // 删除插图
  const handleDeleteIllustration = (id: string) => {
    setIllustrations((prev) => prev.filter((it) => it.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
    showToast('已移除该分镜插图', 'info');
  };

  // 测试商汤 TokenPlan API Key
  const handleTestKey = async () => {
    if (!snApiKey.trim()) {
      showToast('请先输入商汤 TokenPlan 密匙', 'err');
      return;
    }
    setTestingKey(true);
    try {
      const res = await api.sensenovaTestKey(snApiKey.trim());
      if (res.ok) {
        showToast(res.message, 'ok');
        await patchSettings({ sensenovaApiKey: snApiKey.trim() });
      } else {
        showToast(res.message, 'err');
      }
    } catch (e: any) {
      showToast(`连接失败: ${e?.message || '网络异常'}`, 'err');
    } finally {
      setTestingKey(false);
    }
  };

  // 保存商汤密匙
  const handleSaveKey = async () => {
    if (!snApiKey.trim()) {
      showToast('请输入密匙', 'err');
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

  // 导出合成带插图视频
  const handleExportVideo = async () => {
    const targetSource = videoPath || (videoUrl?.startsWith('file:///') ? videoUrl.replace('file:///', '') : videoUrl);
    if (!targetSource) {
      showToast('请先加载视频源文件', 'err');
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
      showToast('正在调用 FFmpeg 高清合成视频轨道与插图序列…', 'info');
      const overlays = readyItems.map((it) => ({
        imagePath: it.localPath!,
        startTime: it.startTime,
        endTime: it.endTime,
        xPercent: globalLayout.xPercent,
        yPercent: globalLayout.yPercent,
        widthPercent: globalLayout.widthPercent,
        heightPercent: globalLayout.heightPercent,
      }));

      const res = await api.exportVideoWithOverlays({
        videoPath: targetSource,
        overlays,
      });

      if (res.ok && res.outputPath) {
        setExportProgress(100);
        setExportResultPath(res.outputPath);
        showToast('🎉 视频合成导出成功！', 'ok');
      } else {
        throw new Error(res.error || '合成导出失败');
      }
    } catch (err: any) {
      showToast(`导出失败: ${err?.message || '未知错误'}`, 'err');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-50 dark:bg-[#0c0d11] text-zinc-800 dark:text-zinc-200 overflow-hidden select-none">
      {/* 顶部标题栏与商汤 TokenPlan 配置状态 */}
      <div className="h-13 border-b border-zinc-200 dark:border-zinc-800/80 px-5 flex items-center justify-between bg-white dark:bg-[#111217] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 via-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">智能视频配插图</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium border border-indigo-200/60 dark:border-indigo-800/60">
                v0.6.8 · 四维高价值规划
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-200/60 dark:border-emerald-800/60">
                100% 所见即所得舞台
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              精准锚定高价值时刻 · 真实画幅防溢出 · 预览全片联动 · FFmpeg 高清无损合成
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowKeyConfig((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
              snApiKey.trim()
                ? 'border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30'
                : 'border-amber-300 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 animate-pulse'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>{snApiKey.trim() ? '商汤 TokenPlan 密匙就绪' : '配置商汤 TokenPlan 密匙'}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showKeyConfig ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* 商汤 TokenPlan 快速配置抽屉 */}
      {showKeyConfig && (
        <div className="px-5 py-3 border-b border-indigo-100 dark:border-indigo-950/80 bg-indigo-50/40 dark:bg-[#131520] animate-in slide-in-from-top-2 duration-150 shrink-0">
          <div className="max-w-4xl flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">API Key:</span>
              <input
                type="password"
                value={snApiKey}
                onChange={(e) => setSnApiKey(e.target.value)}
                placeholder="输入商汤 TokenPlan API Key (可从 platform.sensenova.cn 获取)..."
                className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="button"
              disabled={testingKey}
              onClick={handleTestKey}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 transition cursor-pointer"
            >
              {testingKey ? '测试中…' : '测试连接'}
            </button>
            <button
              type="button"
              onClick={handleSaveKey}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition cursor-pointer"
            >
              保存配置
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-zinc-400 flex items-center gap-2">
            <span>驱动 sensenova-u1-fast（信息图）与 sensenova-u1.5-lite（高质感标准图）</span>
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
        <div className="flex-1 flex flex-col p-4 border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-[#090a0f] overflow-y-auto">
          {videoUrl ? (
            <div className="flex-1 flex flex-col items-center justify-start max-w-2xl mx-auto w-full">
              {/* 舞台顶栏信息：分辨率、画幅与坐标提示 */}
              <div className="w-full flex items-center justify-between mb-2 px-1 text-[11px] text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 font-mono text-zinc-700 dark:text-zinc-300 font-medium">
                    {videoDimensions.width}×{videoDimensions.height} · {videoDimensions.width >= videoDimensions.height ? '横屏视频' : '竖屏视频'}
                  </span>
                  <span className="truncate max-w-[180px] text-zinc-500">{videoTitle}</span>
                </div>
                <div className="font-mono text-[10.5px] text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200/50 dark:border-indigo-900/40">
                  浮层坐标: X {Math.round(globalLayout.xPercent * 100)}% · Y {Math.round(globalLayout.yPercent * 100)}% · 宽 {Math.round(globalLayout.widthPercent * 100)}%
                </div>
              </div>

              {/* 核心视频舞台 (Video Stage)：宽高比 100% 等同于视频原生尺寸，彻底消灭黑边偏移 */}
              <div className="relative w-full flex items-center justify-center bg-zinc-950/40 rounded-2xl p-2 border border-zinc-200 dark:border-zinc-800 shadow-inner">
                <div
                  ref={videoContainerRef}
                  className="relative rounded-xl overflow-hidden shadow-2xl bg-black select-none max-w-full"
                  style={{
                    aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}`,
                    maxHeight: '54vh',
                    width: videoDimensions.width >= videoDimensions.height ? '100%' : 'auto',
                    height: videoDimensions.width >= videoDimensions.height ? 'auto' : '54vh',
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

                  {/* 真实画幅插图浮层（跟随选择的 ratio 呈现真正比例，100% 贴合视频坐标） */}
                  {activeIllustration && (
                    <div
                      ref={previewBoxRef}
                      style={{
                        left: `${globalLayout.xPercent * 100}%`,
                        top: `${globalLayout.yPercent * 100}%`,
                        width: `${globalLayout.widthPercent * 100}%`,
                        aspectRatio: activeRatioObj.cssRatio,
                      }}
                      onMouseDown={(e) => handleMouseDown(e, false)}
                      className="absolute cursor-move group z-20 transition-all select-none rounded-xl overflow-hidden shadow-2xl border-2 border-indigo-400 hover:border-indigo-300 ring-2 ring-indigo-500/20 bg-zinc-900/95 flex items-center justify-center"
                    >
                      {activeIllustration.imageUrl ? (
                        <img
                          src={activeIllustration.imageUrl}
                          alt={activeIllustration.concept}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        <div className="p-2 text-center text-[10px] text-zinc-400">
                          <ImageIcon className="w-5 h-5 mx-auto mb-1 opacity-70 text-indigo-400 animate-pulse" />
                          <div className="font-semibold text-white truncate max-w-[120px]">
                            {activeIllustration.concept}
                          </div>
                          <div className="text-[9px] mt-0.5 text-zinc-400 font-mono">
                            {activeIllustration.status === 'generating' ? '商汤生成中…' : '待生成插图'}
                          </div>
                        </div>
                      )}

                      {/* 标头标签：价值分类与比例 */}
                      <div className="absolute top-1 left-1 px-1.5 py-0.2 rounded bg-black/70 backdrop-blur-md text-[9px] text-white font-medium flex items-center gap-1 pointer-events-none border border-white/10">
                        <span>{VISUAL_CATEGORIES[activeIllustration.category || 'concept_metaphor']?.label || '插图'}</span>
                        <span className="opacity-60">·</span>
                        <span className="font-mono opacity-80">{activeRatioObj.id}</span>
                      </div>

                      {/* 右下角等比拉伸缩放控柄 */}
                      <div
                        onMouseDown={(e) => handleMouseDown(e, true)}
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-indigo-500 hover:bg-indigo-400 rounded-tl flex items-center justify-center text-white shadow-md transition-colors"
                        title="按住拖拽调节尺寸"
                      >
                        <Maximize className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  )}

                  {/* 播放器内置简易控制条 */}
                  <div className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center gap-2.5 text-white">
                    <button
                      type="button"
                      onClick={() => {
                        if (videoRef.current) {
                          if (isPlaying) videoRef.current.pause();
                          else videoRef.current.play();
                        }
                      }}
                      className="p-1 rounded-full hover:bg-white/20 transition cursor-pointer"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>

                    <span className="text-[11px] font-mono text-zinc-300">
                      {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} /{' '}
                      {Math.floor(videoDuration / 60)}:{String(Math.floor(videoDuration % 60)).padStart(2, '0')}
                    </span>

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
                      className="flex-1 accent-indigo-500 cursor-pointer h-1 rounded-lg"
                    />

                    <button
                      type="button"
                      onClick={handleAddIllustration}
                      className="px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-[11px] flex items-center gap-1 transition cursor-pointer"
                      title="在当前时间点增加一个新插图分镜"
                    >
                      <Plus className="w-3 h-3" />
                      <span>打点插图</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 舞台下方：插图排版与全片位置联动控制台 */}
              <div className="w-full mt-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111217] shadow-sm space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                      <span>画中画布局与排版</span>
                    </span>
                    <label className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={linkAllPositions}
                        onChange={(e) => setLinkAllPositions(e.target.checked)}
                        className="rounded accent-indigo-600 cursor-pointer"
                      />
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        调整一个联动全片所有插图
                      </span>
                    </label>
                  </div>

                  <span className="text-[10.5px] text-zinc-400">
                    画布内支持自由鼠标拖拽与角标缩放
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                  {/* 插图画幅比例快捷切换 */}
                  <div>
                    <label className="text-[10.5px] font-semibold text-zinc-500 mb-1.5 block">
                      插图真实画幅比例（彻底告别强制方形）
                    </label>
                    <div className="flex items-center gap-1 flex-wrap">
                      {RATIO_OPTIONS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleChangeDefaultRatio(r.id)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                            (activeIllustration?.ratio || defaultRatio) === r.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {r.id}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 方位快速吸附预设 */}
                  <div>
                    <label className="text-[10.5px] font-semibold text-zinc-500 mb-1.5 block">
                      智能吸附方位（根据横竖屏安全适配）
                    </label>
                    <div className="flex items-center gap-1 flex-wrap">
                      {[
                        { id: 'top-right', label: '↗️ 右上' },
                        { id: 'top-left', label: '↖️ 左上' },
                        { id: 'bottom-right', label: '↘️ 右下' },
                        { id: 'bottom-left', label: '↙️ 左下' },
                        { id: 'center', label: '🔲 居中' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleApplyPresetPosition(p.id)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                            globalLayout.positionPreset === p.id
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                              : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropVideo}
              onClick={handlePickVideo}
              className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl bg-white/50 dark:bg-zinc-900/30 transition cursor-pointer text-center group"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Video className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-1">
                点击选择或将视频文件拖放到此处
              </h3>
              <p className="text-xs text-zinc-400 max-w-sm mb-4">
                自适应横屏（16:9）、竖屏（9:16）等各种视频规格。可直接使用蝉镜数字人出片，或自主上传任意口播原视频
              </p>
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
              >
                选择本地视频
              </button>
            </div>
          )}
        </div>

        {/* 右侧：分镜策划台与插图分镜清单 (Storyboard & Generation) */}
        <div className="w-[440px] flex flex-col bg-white dark:bg-[#111217] shrink-0 overflow-hidden">
          {/* 右侧顶部控制区：路由模式、风格预设与文案输入 */}
          <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800/80 space-y-3 shrink-0">
            {/* 模型路由分段选择 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-500" />
                  <span>商汤 SenseNova 路由策略</span>
                </span>
                <span className="text-[10px] text-zinc-400">智能分流两款专精模型</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSwitchRoutingMode('smart')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-center ${
                    routingMode === 'smart'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  title="自动分析：图表数据/步骤清单匹配 u1-fast；场景隐喻匹配 u1.5-lite"
                >
                  ⚡ 四维智能路由
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchRoutingMode('infographic')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-center ${
                    routingMode === 'infographic'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  title="全片专精知识图表、对比清单与步骤架构 (sensenova-u1-fast)"
                >
                  📊 全量信息图
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchRoutingMode('standard')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-center ${
                    routingMode === 'standard'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  title="全片专精4K高质感写实场景与商业隐喻 (sensenova-u1.5-lite)"
                >
                  🎨 全量标准图
                </button>
              </div>
            </div>

            {/* 官方风格选择 */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-500 shrink-0">设计风格预设:</span>
              <select
                value={defaultStyle}
                onChange={(e) => handleChangeDefaultStyle(e.target.value)}
                className="flex-1 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 outline-none"
              >
                {STYLE_OPTIONS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label} ({st.desc})
                  </option>
                ))}
              </select>
            </div>

            {/* 台词与 ASR 精准打轴 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  视频口播文案 ({scriptText.length} 字)
                </span>
                {(videoUrl || videoPath) && (
                  <div className="flex items-center gap-2">
                    {asrUtterances.length > 0 && illustrations.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          applyAsrAlignmentToIllustrations(illustrations, asrUtterances);
                          showToast(`已根据 ASR 时间轴吸附对齐 ${illustrations.length} 处分镜！`, 'ok');
                        }}
                        className="text-[10.5px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Wand2 className="w-3 h-3" />
                        <span>🎯 声文打轴吸附</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={transcribing}
                      onClick={handleExtractSpeech}
                      className="text-[10.5px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                      title="调用火山语音大模型提取台词并保留毫秒级时间戳"
                    >
                      <Mic className={`w-3 h-3 ${transcribing ? 'animate-spin' : ''}`} />
                      <span>
                        {transcribing
                          ? '正在语音识别…'
                          : asrUtterances.length > 0
                          ? '🎙️ 重新提取 ASR 打轴'
                          : '🎙️ 一键 ASR 提取台词与打轴'}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="粘贴口播台词，或点击右上角 ASR 自动转录原声并提取精准时间戳…"
                rows={2}
                className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 outline-none focus:border-indigo-500 resize-none"
              />

              {asrUtterances.length > 0 ? (
                <div className="flex items-center justify-between text-[10.5px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30 px-2 py-1 rounded-md border border-emerald-200/50 dark:border-emerald-800/40">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>已加载 ASR 毫秒级时间轴（共 {asrUtterances.length} 句）</span>
                  </span>
                  <span className="font-mono text-[10px]">高精度对齐</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[10.5px] text-zinc-400 bg-zinc-100/60 dark:bg-zinc-800/40 px-2 py-1 rounded-md">
                  <span>💡 纯文案模式按字符相对偏移量自适应打轴；点击 ASR 升级为声画完全卡点</span>
                </div>
              )}

              {/* 操作按钮组：AI 规划与一键全部生成 */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={planning || !scriptText.trim()}
                  onClick={handleAiPlanIllustrations}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:opacity-90 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Wand2 className={`w-3.5 h-3.5 ${planning ? 'animate-spin' : ''}`} />
                  <span>{planning ? '正在精选高价值插图点位…' : '✨ AI 智能规划高价值插图 (去废话)'}</span>
                </button>

                {illustrations.length > 0 && (
                  <button
                    type="button"
                    disabled={batchGenerating}
                    onClick={handleBatchGenerate}
                    className="px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                    title="一键并发生成所有未就绪的插图"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${batchGenerating ? 'animate-spin' : ''}`} />
                    <span>全部生成 ({illustrations.filter((it) => it.status === 'success').length}/{illustrations.length})</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 右侧主体：影视级分镜清单 (Shot List) */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3">
            {illustrations.length > 0 ? (
              illustrations.map((item, idx) => {
                const catInfo = VISUAL_CATEGORIES[item.category || 'concept_metaphor'] || VISUAL_CATEGORIES.concept_metaphor;
                const CatIcon = catInfo.icon;
                const isSelected = selectedItemId === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 shadow-md ring-1 ring-indigo-500/30'
                        : 'border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/20 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {/* 分镜标头：序号、起止时段、价值标签与模型快速切换 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[10px] font-bold flex items-center justify-center text-zinc-700 dark:text-zinc-300 font-mono">
                          #{idx + 1}
                        </span>

                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {item.startTime.toFixed(1)}s - {item.endTime.toFixed(1)}s (~{(item.endTime - item.startTime).toFixed(1)}s)
                        </span>

                        {/* 价值类型徽标 */}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                          <CatIcon className="w-2.5 h-2.5" />
                          <span>{catInfo.label}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* 模型快速单键秒切 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextModel = item.model === 'sensenova-u1-fast' ? 'sensenova-u1.5-lite' : 'sensenova-u1-fast';
                            const nextType = nextModel === 'sensenova-u1-fast' ? 'infographic' : 'standard';
                            setIllustrations((prev) =>
                              prev.map((it) => (it.id === item.id ? { ...it, model: nextModel, type: nextType } : it))
                            );
                          }}
                          className={`text-[9.5px] px-2 py-0.5 rounded font-medium transition cursor-pointer hover:opacity-80 border ${
                            item.type === 'infographic'
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                              : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
                          }`}
                          title="点击快速切换模型"
                        >
                          {item.type === 'infographic' ? 'u1-fast (信息图)' : 'u1.5-lite (标准图)'}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteIllustration(item.id);
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-rose-500 transition cursor-pointer"
                          title="删除该分镜"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* 台词抓手原句引用 */}
                    {item.contextText && (
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 bg-zinc-100/70 dark:bg-zinc-800/50 p-2 rounded-lg mb-2 italic border border-zinc-200/40 dark:border-zinc-700/40">
                        “{item.contextText}”
                      </p>
                    )}

                    {/* 分镜主体：左侧缩略图/占位，右侧提示词与生成按钮 */}
                    <div className="flex gap-2.5">
                      {/* 缩略图视窗 */}
                      <div className="w-20 h-20 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 shrink-0 flex items-center justify-center relative group">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.concept} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center p-1 text-[9px] text-zinc-400">
                            <ImageIcon className="w-4 h-4 mx-auto mb-0.5 opacity-50 text-indigo-400" />
                            <span>{item.status === 'generating' ? '生图中…' : '待生成'}</span>
                          </div>
                        )}
                        {item.status === 'success' && (
                          <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[9px]">
                            <Check className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>

                      {/* 提示词与单张操作 */}
                      <div className="flex-1 flex flex-col justify-between">
                        <textarea
                          value={item.prompt}
                          onChange={(e) => {
                            const p = e.target.value;
                            setIllustrations((prev) =>
                              prev.map((it) => (it.id === item.id ? { ...it, prompt: p } : it))
                            );
                          }}
                          rows={2}
                          placeholder="商汤生图提示词（遵循四要素工业规范）…"
                          className="w-full p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[11px] text-zinc-900 dark:text-zinc-100 outline-none resize-none"
                        />

                        <div className="flex items-center justify-between pt-1 mt-1">
                          <span className="text-[10px] text-zinc-400 font-mono">
                            比例: {item.ratio}
                          </span>

                          <button
                            type="button"
                            disabled={item.status === 'generating'}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateSingle(item);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{item.status === 'success' ? '重新生成' : '立即生成'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-zinc-400 space-y-2">
                <Layers className="w-8 h-8 mx-auto opacity-30 text-indigo-400" />
                <p className="text-xs font-semibold">暂无插图分镜</p>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  载入视频与文案后，点击上方【✨ AI 智能规划高价值插图】，系统将自动提炼核心视觉时刻
                </p>
              </div>
            )}
          </div>

          {/* 右侧底部：合成导出控制台 */}
          <div className="p-3.5 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-[#13141a] shrink-0 space-y-2">
            {exporting && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>FFmpeg 高清视频合成中...</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}

            {exportResultPath && (
              <div className="p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/20 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <div className="truncate mr-2">
                  <div className="font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>导出成功！</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate mt-0.5">{exportResultPath}</div>
                </div>
                <button
                  type="button"
                  onClick={() => api.showItemInFolder?.(exportResultPath)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-medium shrink-0 hover:bg-emerald-700 transition cursor-pointer"
                >
                  打开文件
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={exporting || !videoUrl || illustrations.filter((it) => it.status === 'success').length === 0}
              onClick={handleExportVideo}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
              <span>
                {exporting
                  ? '视频合成导出中…'
                  : `🚀 一键合成导出视频 (${illustrations.filter((it) => it.status === 'success').length} 张插图已就绪)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
