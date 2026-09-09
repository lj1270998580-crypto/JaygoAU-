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
  Maximize2,
  Minimize2,
  Sliders,
  ChevronDown,
  Info,
  Link,
  SplitSquareVertical,
  Maximize,
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

// 比例尺寸预设（对齐商汤 SenseNova 官方推荐规格）
const RATIO_OPTIONS = [
  { id: '16:9', label: '16:9 横屏', size: '2752x1536', desc: '宽屏演示/信息图' },
  { id: '9:16', label: '9:16 竖屏', size: '1536x2752', desc: '短视频/手机竖卡' },
  { id: '1:1', label: '1:1 方形', size: '2048x2048', desc: '画中画封面' },
  { id: '3:4', label: '3:4 竖卡', size: '1760x2368', desc: '知识清单卡片' },
  { id: '4:3', label: '4:3 横卡', size: '2368x1760', desc: '平板信息图' },
];

// 位置预设
const POSITION_PRESETS = [
  { id: 'top-right', label: '↗️ 右上角', x: 0.65, y: 0.06, w: 0.30 },
  { id: 'top-left', label: '↖️ 左上角', x: 0.05, y: 0.06, w: 0.30 },
  { id: 'bottom-right', label: '↘️ 右下角', x: 0.65, y: 0.62, w: 0.30 },
  { id: 'bottom-left', label: '↙️ 左下角', x: 0.05, y: 0.62, w: 0.30 },
  { id: 'center', label: '🔲 居中浮层', x: 0.15, y: 0.25, w: 0.70 },
];

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

  // 2. 商汤 TokenPlan 密匙与参数
  const [snApiKey, setSnApiKey] = useState<string>(settings?.sensenovaApiKey || '');
  const [showKeyConfig, setShowKeyConfig] = useState<boolean>(false);
  const [testingKey, setTestingKey] = useState<boolean>(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);

  // 3. 路由与生图偏好
  const [routingMode, setRoutingMode] = useState<'smart' | 'standard' | 'infographic'>('smart');
  const [defaultStyle, setDefaultStyle] = useState<string>(settings?.sensenovaDefaultStyle || 'infographic_clean');
  const [defaultRatio, setDefaultRatio] = useState<string>(settings?.sensenovaDefaultRatio || '1:1');

  // 4. 插图列表与规划
  const [illustrations, setIllustrations] = useState<VideoIllustrationItem[]>([]);
  const [planning, setPlanning] = useState<boolean>(false);
  const [batchGenerating, setBatchGenerating] = useState<boolean>(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // 5. 联动位置布局状态（核心：调整一个联动所有）
  const [linkAllPositions, setLinkAllPositions] = useState<boolean>(true);
  const [globalLayout, setGlobalLayout] = useState<IllustrationLayout>({
    xPercent: 0.65,
    yPercent: 0.06,
    widthPercent: 0.30,
    heightPercent: 0.30,
    positionPreset: 'top-right',
  });

  // 6. 导出合成状态
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportResultPath, setExportResultPath] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ isDragging: boolean; isResizing: boolean; startX: number; startY: number; startLeft: number; startTop: number; startW: number } | null>(null);

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

  // 智能语音识别 ASR 获取台词
  const handleExtractSpeech = async () => {
    if (!videoPath) {
      showToast('当前视频为远程网络链接，请先下载或选择本地视频文件进行转录', 'err');
      return;
    }
    setTranscribing(true);
    try {
      showToast('正在提取音轨并进行语音大模型识别…', 'info');
      const res = await api.transcribe({ filePath: videoPath, enableSpeakerInfo: false });
      if (res && res.text) {
        setScriptText(res.text);
        showToast('台词提取成功！', 'ok');
      } else {
        showToast('未识别到有效语音内容', 'info');
      }
    } catch (err: any) {
      showToast(`语音识别失败: ${err?.message || '未知错误'}`, 'err');
    } finally {
      setTranscribing(false);
    }
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
        setKeyValid(true);
        showToast(res.message, 'ok');
        await patchSettings({ sensenovaApiKey: snApiKey.trim() });
      } else {
        setKeyValid(false);
        showToast(res.message, 'err');
      }
    } catch (e: any) {
      setKeyValid(false);
      showToast(`连接失败: ${e?.message || '网络异常'}`, 'err');
    } finally {
      setTestingKey(false);
    }
  };

  // 保存商汤密匙与默认配置
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

  // 当前播放时间命中哪个插图
  const activeIllustration = useMemo(() => {
    return illustrations.find(
      (item) => currentTime >= item.startTime && currentTime <= item.endTime
    );
  }, [illustrations, currentTime]);

  // AI 智能自适应插图规划（不限图片数量，根据内容与时长推演）
  const handleAiPlanIllustrations = async () => {
    if (!scriptText.trim()) {
      showToast('请先提取或粘贴视频口播台词', 'err');
      return;
    }
    const dur = videoDuration > 0 ? videoDuration : 60;
    setPlanning(true);
    try {
      showToast('AI 正在深度分析视频节奏、知识点与场景，规划插图时机与提示词…', 'info');
      
      const systemPrompt = `你是一个顶尖的短视频视觉包装总监。你的任务是根据给出的视频总时长和口播台词，智能推演并在关键节点安排视觉插图（配图/画中画）。
【关键铁律】
1. 不限制图片数量！根据视频时长、信息密度与场景演进自适应决定：
   - 寻找台词中的“核心论点、对比转折、数据事实、步骤清单、行业避坑、具象场景、情绪高潮”；
   - 每张插图展示 3~5 秒，前后保持适当呼吸留白，避免视觉疲劳或长时间画面枯燥。
2. 商汤日日新双模型智能路由标准：
   - 知识数据/数字百分比/操作步骤/思维导图/对比清单 -> type: "infographic", model: "sensenova-u1-fast"（专精信息图与海报排版）；
   - 画面场景/人物故事情境/摄影质感/氛围概念/具象隐喻 -> type: "standard", model: "sensenova-u1.5-lite"（专精原生4K高质感与生图）；
3. 必须输出严格合法的纯 JSON 数组，绝不要包含 markdown 围栏或其它对话寒暄，数组项格式如下：
[
  {
    "startTime": 2.0,
    "endTime": 6.0,
    "contextText": "对应台词原句",
    "concept": "插图核心概念 (10-20字)",
    "type": "infographic",
    "model": "sensenova-u1-fast",
    "prompt": "精细的商汤日日新生图提示词，描述主体画面、构图光影、要素排版"
  }
]`;

      const userContent = `视频总时长约：${Math.round(dur)} 秒。\n视频口播完整台词：\n${scriptText}\n\n请按要求规划所有关键插图点位，输出 JSON 数组：`;

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
        console.warn('ModelHub 调用失败，采用自适应算法打底规划:', e);
      }

      // 解析 JSON 响应，若大模型未返回合法 JSON 则自适应保底
      let parsedItems: any[] = [];
      try {
        const cleaned = jsonStr.replace(/^```[a-z]*\s*/im, '').replace(/\s*```$/im, '').trim();
        const jsonMatch = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
          parsedItems = JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        console.warn('JSON 解析异常，执行本地语意分段规划');
      }

      // 若未解析出，提供精准的本地智能分句兜底
      if (!parsedItems || parsedItems.length === 0) {
        const sentences = scriptText.split(/[。！？!?；;\n]+/).map(s => s.trim()).filter(s => s.length > 6);
        const count = Math.max(2, Math.min(12, Math.floor(dur / 8)));
        const step = dur / count;
        parsedItems = Array.from({ length: count }).map((_, idx) => {
          const st = Math.round((idx * step + 1.5) * 10) / 10;
          const et = Math.min(dur - 0.5, Math.round((st + 4.0) * 10) / 10);
          const sent = sentences[idx % sentences.length] || `视频第 ${idx + 1} 核心观点`;
          const isInfo = /[0-9%万千亿条步比图表清单规则]/.test(sent);
          return {
            startTime: st,
            endTime: et,
            contextText: sent,
            concept: isInfo ? '数据与要点可视化' : '场景氛围具象图解',
            type: isInfo ? 'infographic' : 'standard',
            model: isInfo ? 'sensenova-u1-fast' : 'sensenova-u1.5-lite',
            prompt: isInfo
              ? `高质量信息图设计，围绕“${sent.slice(0, 25)}”展开，现代结构化排版，清晰图表与数据卡片，高清信息视觉化`
              : `高质量写实场景画面，描绘“${sent.slice(0, 25)}”意境，影视级光影质感，构图精美，细腻真实`,
          };
        });
      }

      // 根据当前用户的全局路由策略做最终收敛调整
      const formatted: VideoIllustrationItem[] = parsedItems.map((item, idx) => {
        let finalModel = item.model || 'sensenova-u1-fast';
        let finalType: 'infographic' | 'standard' = item.type === 'standard' ? 'standard' : 'infographic';

        if (routingMode === 'standard') {
          finalModel = 'sensenova-u1.5-lite';
          finalType = 'standard';
        } else if (routingMode === 'infographic') {
          finalModel = 'sensenova-u1-fast';
          finalType = 'infographic';
        }

        return {
          id: `ill_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          startTime: Number(item.startTime) || idx * 5,
          endTime: Number(item.endTime) || (idx * 5 + 4),
          contextText: item.contextText || '',
          concept: item.concept || '插图设计',
          prompt: item.prompt || '',
          type: finalType,
          model: finalModel as any,
          style: defaultStyle,
          ratio: defaultRatio,
          status: 'idle',
        };
      });

      setIllustrations(formatted);
      if (formatted.length > 0) {
        setSelectedItemId(formatted[0].id);
      }
      showToast(`AI 成功自适应规划了 ${formatted.length} 处关键插图！`, 'ok');
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

  // 一键批量生成所有未生成的插图
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
      contextText: '手动新增插图时机',
      concept: '自定义插图',
      prompt: '高质量现代插画，清晰明快，构图美观，细腻质感',
      type: routingMode === 'standard' ? 'standard' : 'infographic',
      model: routingMode === 'standard' ? 'sensenova-u1.5-lite' : 'sensenova-u1-fast',
      style: defaultStyle,
      ratio: defaultRatio,
      status: 'idle',
    };
    setIllustrations((prev) => [...prev, newIt].sort((a, b) => a.startTime - b.startTime));
    setSelectedItemId(newIt.id);
    showToast('已在当前时间添加新插图点位', 'ok');
  };

  // 删除插图
  const handleDeleteIllustration = (id: string) => {
    setIllustrations((prev) => prev.filter((it) => it.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
    showToast('已移除该插图', 'info');
  };

  // 联动修改位置预设（满足诉求：调整一个联动所有图片位置）
  const handleApplyPresetPosition = (presetId: string) => {
    const p = POSITION_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    const newLayout: IllustrationLayout = {
      xPercent: p.x,
      yPercent: p.y,
      widthPercent: p.w,
      heightPercent: p.w,
      positionPreset: presetId as any,
    };
    setGlobalLayout(newLayout);
    showToast(`已应用【${p.label}】位置预设（已全片联动生效）`, 'ok');
  };

  // 预览区鼠标拖拽位置更新
  const handleMouseDown = (e: React.MouseEvent, isResize: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const box = previewBoxRef.current?.parentElement?.getBoundingClientRect();
    if (!box) return;

    dragRef.current = {
      isDragging: !isResize,
      isResizing: isResize,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: globalLayout.xPercent * box.width,
      startTop: globalLayout.yPercent * box.height,
      startW: globalLayout.widthPercent * box.width,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!dragRef.current || !box) return;
      const dx = moveEvt.clientX - dragRef.current.startX;
      const dy = moveEvt.clientY - dragRef.current.startY;

      if (dragRef.current.isDragging) {
        const newLeft = Math.max(0, Math.min(box.width - 50, dragRef.current.startLeft + dx));
        const newTop = Math.max(0, Math.min(box.height - 50, dragRef.current.startTop + dy));
        const xPct = Math.round((newLeft / box.width) * 100) / 100;
        const yPct = Math.round((newTop / box.height) * 100) / 100;
        setGlobalLayout((prev) => ({ ...prev, xPercent: xPct, yPercent: yPct, positionPreset: 'custom' }));
      } else if (dragRef.current.isResizing) {
        const newW = Math.max(60, Math.min(box.width * 0.9, dragRef.current.startW + dx));
        const wPct = Math.round((newW / box.width) * 100) / 100;
        setGlobalLayout((prev) => ({ ...prev, widthPercent: wPct, heightPercent: wPct, positionPreset: 'custom' }));
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

  // 导出合成带插图视频
  const handleExportVideo = async () => {
    if (!videoPath) {
      showToast('请先加载本地视频源文件', 'err');
      return;
    }
    const readyItems = illustrations.filter((it) => it.status === 'success' && it.localPath);
    if (readyItems.length === 0) {
      showToast('尚无已成功生成的插图，请先生成插图', 'err');
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
        videoPath,
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
      {/* 顶部标题与商汤 TokenPlan 密匙配置状态栏 */}
      <div className="h-13 border-b border-zinc-200 dark:border-zinc-800/80 px-5 flex items-center justify-between bg-white dark:bg-[#111217] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 to-indigo-500 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">智能视频配插图</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium border border-indigo-200/60 dark:border-indigo-800/60">
                商汤日日新 SenseNova 双模型
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              根据台词语义规划插图时机 · 标准图与信息图智能路由 · 预览联动调位 · 高清合成导出
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
            <span>{snApiKey.trim() ? 'TokenPlan 密匙已配置' : '配置商汤 TokenPlan 密匙'}</span>
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
                placeholder="输入商汤日日新 TokenPlan API Key (可从 platform.sensenova.cn 获取)..."
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
            <span>支持商汤文生图与图生图服务</span>
            <span>•</span>
            <a
              href="https://platform.sensenova.cn/docs"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 hover:underline flex items-center gap-1"
            >
              获取商汤密匙与文档
            </a>
          </div>
        </div>
      )}

      {/* 主工作区：左侧预览与联动控制，右侧规划与生图工作台 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：视频播放器与可视化画中画联动拖拽画布 */}
        <div className="flex-1 flex flex-col p-4 border-r border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/60 dark:bg-[#0c0d11] overflow-y-auto">
          {videoUrl ? (
            <div className="flex-1 flex flex-col">
              {/* 播放器容器 */}
              <div className="relative w-full aspect-[9/16] max-h-[58vh] mx-auto bg-black rounded-2xl overflow-hidden shadow-lg border border-zinc-800 flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) setVideoDuration(videoRef.current.duration);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="w-full h-full object-contain pointer-events-auto"
                />

                {/* 活跃插图浮层（支持鼠标拖拽位移与右下角缩放 handle） */}
                {activeIllustration && (
                  <div
                    ref={previewBoxRef}
                    style={{
                      left: `${globalLayout.xPercent * 100}%`,
                      top: `${globalLayout.yPercent * 100}%`,
                      width: `${globalLayout.widthPercent * 100}%`,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, false)}
                    className="absolute cursor-move group z-20 transition-shadow select-none"
                  >
                    <div className="relative rounded-xl overflow-hidden shadow-2xl border-2 border-indigo-400 bg-zinc-900/90 aspect-square flex items-center justify-center">
                      {activeIllustration.imageUrl ? (
                        <img
                          src={activeIllustration.imageUrl}
                          alt={activeIllustration.concept}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        <div className="p-2 text-center text-[10px] text-zinc-400">
                          <ImageIcon className="w-5 h-5 mx-auto mb-1 opacity-60 text-indigo-400" />
                          <div className="font-semibold text-white truncate">{activeIllustration.concept}</div>
                          <div className="text-[9px] mt-0.5 text-zinc-500">
                            {activeIllustration.status === 'generating' ? '正在生图中…' : '待生成插图'}
                          </div>
                        </div>
                      )}

                      {/* 标头标签 */}
                      <div className="absolute top-1 left-1 px-1.5 py-0.2 rounded bg-black/60 backdrop-blur-sm text-[9px] text-white font-mono pointer-events-none">
                        {activeIllustration.type === 'infographic' ? '📊 信息图' : '🎨 场景图'}
                      </div>

                      {/* 右下角等比缩放控柄 */}
                      <div
                        onMouseDown={(e) => handleMouseDown(e, true)}
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-indigo-500 rounded-tl flex items-center justify-center text-white"
                        title="拖拽调节大小"
                      >
                        <Maximize className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  </div>
                )}

                {/* 视频控制条叠加层 */}
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-3 text-white">
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

                  <span className="text-[11px] font-mono">
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
                    title="在当前时间插入新配图"
                  >
                    <Plus className="w-3 h-3" />
                    <span>打点插图</span>
                  </button>
                </div>
              </div>

              {/* 画布位置联动控制条（满足诉求：调整一个联动所有图片位置） */}
              <div className="mt-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111217] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-indigo-500" />
                      <span>插图位置与尺寸规划</span>
                    </span>
                    <label className="flex items-center gap-1 text-[11px] text-zinc-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={linkAllPositions}
                        onChange={(e) => setLinkAllPositions(e.target.checked)}
                        className="rounded accent-indigo-600 cursor-pointer"
                      />
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">调整一个联动所有图片位置</span>
                    </label>
                  </div>

                  <span className="text-[10.5px] text-zinc-400">
                    可在预览框直接用鼠标拖动或拉伸
                  </span>
                </div>

                {/* 快速方位预设按钮 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {POSITION_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleApplyPresetPosition(p.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                        globalLayout.positionPreset === p.id
                          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
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
                支持 MP4、MOV 等格式。可直接使用蝉镜数字人生成的视频，或主动上传任意自媒体口播视频
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

        {/* 右侧：AI 规划、商汤双模型智能路由与插图工作台 */}
        <div className="w-[420px] flex flex-col bg-white dark:bg-[#111217] shrink-0 overflow-hidden">
          {/* 右侧顶部：路由策略与生图参数 */}
          <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800/80 space-y-3 shrink-0">
            {/* 智能路由模式切换 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-500" />
                  <span>模型路由偏好</span>
                </span>
                <span className="text-[10px] text-zinc-400">智能匹配商汤擅长模型</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setRoutingMode('smart')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-center ${
                    routingMode === 'smart'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  title="自动分析台词：知识数据归为信息图(u1-fast)，画面场景归为标准图(u1.5-lite)"
                >
                  ⚡ 智能动态路由
                </button>
                <button
                  type="button"
                  onClick={() => setRoutingMode('infographic')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-center ${
                    routingMode === 'infographic'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  title="全片专精知识图表、清单与海报排版"
                >
                  📊 全量信息图
                </button>
                <button
                  type="button"
                  onClick={() => setRoutingMode('standard')}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer text-center ${
                    routingMode === 'standard'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                      : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  title="全片专精原生4K高质感场景与图生图"
                >
                  🎨 全量标准图
                </button>
              </div>
            </div>

            {/* 风格与画幅比例选择 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-zinc-500 mb-1 block">官方风格预设</label>
                <select
                  value={defaultStyle}
                  onChange={(e) => setDefaultStyle(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 outline-none"
                >
                  {STYLE_OPTIONS.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.label} ({st.desc})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-500 mb-1 block">画幅比例规格</label>
                <select
                  value={defaultRatio}
                  onChange={(e) => setDefaultRatio(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 outline-none"
                >
                  {RATIO_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} - {r.size}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 台词与 AI 规划触发区 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  视频口播台词 ({scriptText.length} 字)
                </span>
                {videoPath && !scriptText && (
                  <button
                    type="button"
                    disabled={transcribing}
                    onClick={handleExtractSpeech}
                    className="text-[10.5px] text-indigo-500 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {transcribing ? '正在语音识别…' : '🎙️ 一键提取台词(ASR)'}
                  </button>
                )}
              </div>
              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="粘贴或通过 ASR 提取当前视频的口播台词，AI 将自动分析节奏并规划插图…"
                rows={2}
                className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 outline-none focus:border-indigo-500 resize-none"
              />

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={planning || !scriptText.trim()}
                  onClick={handleAiPlanIllustrations}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Wand2 className={`w-3.5 h-3.5 ${planning ? 'animate-spin' : ''}`} />
                  <span>{planning ? 'AI 正在自适应推演插图点位…' : '🧠 AI 智能规划插图时机与提示词'}</span>
                </button>

                {illustrations.length > 0 && (
                  <button
                    type="button"
                    disabled={batchGenerating}
                    onClick={handleBatchGenerate}
                    className="px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                    title="一键并发生成所有未完成的插图"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${batchGenerating ? 'animate-spin' : ''}`} />
                    <span>全部生成</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 右侧主体：规划卡片列表（动态自适应数量） */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-2.5">
            {illustrations.length > 0 ? (
              illustrations.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`p-3 rounded-xl border transition cursor-pointer ${
                    selectedItemId === item.id
                      ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-sm'
                      : 'border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[10px] font-bold flex items-center justify-center text-zinc-700 dark:text-zinc-300 font-mono">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[140px]">
                        {item.concept}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                          item.type === 'infographic'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        {item.type === 'infographic' ? '📊 信息图' : '🎨 场景图'}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteIllustration(item.id);
                        }}
                        className="p-1 rounded text-zinc-400 hover:text-rose-500 transition cursor-pointer"
                        title="删除该插图"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* 时间起止区间 */}
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-2 font-mono">
                    <span>区间:</span>
                    <input
                      type="number"
                      step={0.1}
                      value={item.startTime}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setIllustrations((prev) =>
                          prev.map((it) => (it.id === item.id ? { ...it, startTime: val } : it))
                        );
                      }}
                      className="w-14 px-1 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-center"
                    />
                    <span>-</span>
                    <input
                      type="number"
                      step={0.1}
                      value={item.endTime}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setIllustrations((prev) =>
                          prev.map((it) => (it.id === item.id ? { ...it, endTime: val } : it))
                        );
                      }}
                      className="w-14 px-1 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-center"
                    />
                    <span>秒 (~{(item.endTime - item.startTime).toFixed(1)}s)</span>
                  </div>

                  {/* 台词语境 */}
                  {item.contextText && (
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-100/60 dark:bg-zinc-800/40 p-1.5 rounded-lg mb-2 italic line-clamp-2">
                      “{item.contextText}”
                    </p>
                  )}

                  {/* 提示词与模型选择 */}
                  <div className="space-y-1 mb-2">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-zinc-400">商汤生图模型:</span>
                      <select
                        value={item.model}
                        onChange={(e) => {
                          const m = e.target.value as any;
                          setIllustrations((prev) =>
                            prev.map((it) => (it.id === item.id ? { ...it, model: m } : it))
                          );
                        }}
                        className="px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10.5px]"
                      >
                        <option value="sensenova-u1-fast">sensenova-u1-fast (信息图加速)</option>
                        <option value="sensenova-u1.5-lite">sensenova-u1.5-lite (标准图/编辑)</option>
                      </select>
                    </div>

                    <textarea
                      value={item.prompt}
                      onChange={(e) => {
                        const p = e.target.value;
                        setIllustrations((prev) =>
                          prev.map((it) => (it.id === item.id ? { ...it, prompt: p } : it))
                        );
                      }}
                      rows={2}
                      className="w-full p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[11px] text-zinc-900 dark:text-zinc-100 outline-none resize-none"
                    />
                  </div>

                  {/* 状态与单张生成按钮 */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {item.status === 'success' && (
                        <span className="text-emerald-500 font-medium flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> 已生成
                        </span>
                      )}
                      {item.status === 'generating' && (
                        <span className="text-indigo-500 font-medium flex items-center gap-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 生成中…
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="text-rose-500 font-medium flex items-center gap-1" title={item.error}>
                          <AlertCircle className="w-3.5 h-3.5" /> 失败
                        </span>
                      )}
                      {item.status === 'idle' && <span className="text-zinc-400">待生成</span>}
                    </div>

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
              ))
            ) : (
              <div className="p-8 text-center text-zinc-400 space-y-2">
                <Layers className="w-8 h-8 mx-auto opacity-40 text-indigo-400" />
                <p className="text-xs">暂无插图规划记录</p>
                <p className="text-[11px] text-zinc-500">
                  载入视频与台词后，点击上方【🧠 AI 智能规划】即可自适应规划全片插图
                </p>
              </div>
            )}
          </div>

          {/* 右侧底部：合成导出视频控制区 */}
          <div className="p-3.5 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-[#13141a] shrink-0 space-y-2">
            {exporting && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>FFmpeg 高清视频合成中...</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
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
                  className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-medium shrink-0 hover:bg-emerald-700 transition cursor-pointer"
                >
                  打开文件
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={exporting || !videoPath || illustrations.filter((it) => it.status === 'success').length === 0}
              onClick={handleExportVideo}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
              <span>
                {exporting
                  ? '视频合成中…'
                  : `🚀 一键合成导出视频 (${illustrations.filter((it) => it.status === 'success').length} 张插图已就绪)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
