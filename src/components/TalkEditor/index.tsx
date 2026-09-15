import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Scissors,
  Sparkles,
  Upload,
  ArrowRight,
  ArrowLeft,
  Film,
  Zap,
  Layers,
  FileText,
  Type,
  FolderArchive,
  Loader2,
  Bot,
  Trash2,
  FileSpreadsheet,
  ImageIcon,
} from 'lucide-react';
import { useStore } from '../../store';
import { api } from '../../lib/ipc';
import type {
  CanvasConfig,
  CanvasRatio,
  CutSegment,
  SubtitleItem,
  SubtitleStyleConfig,
  NarrativePreset,
  NarrativeAnalysisResult,
  CustomStickerPatch,
} from '../../lib/talkEditor/types';
import { scanSilenceSegments, detectFillerSegments } from '../../lib/talkEditor/audioSilenceScanner';
import { runNarrativePruning, detectRetakeAndStumbles } from '../../lib/talkEditor/semanticPruner';
import { buildJianyingTalkDraft } from '../../lib/talkEditor/jianyingTalkExporter';
import { parseSrtContent } from '../../lib/talkEditor/srtParser';
import { refineUtterancesToSubtitleUnits } from '../../lib/talkEditor/sentenceSplitter';
import { TranscriptCutter } from './TranscriptCutter';
import { CanvasMonitor } from './CanvasMonitor';
import { PolishExportPanel } from './PolishExportPanel';
import type { ModelHubSettings } from '../../lib/modelHubTypes';
import type { PendingIllustratorData } from '../../store';

interface TalkEditorProps {
  modelSettings?: ModelHubSettings;
  onUpdateModelHubSettings?: (s: ModelHubSettings) => void;
  onOpenModelHub?: () => void;
  onPushToIllustrator?: (data: PendingIllustratorData) => void;
}

export const TalkEditor: React.FC<TalkEditorProps> = ({
  modelSettings,
  onOpenModelHub,
  onPushToIllustrator,
}) => {
  const { showToast, setPendingIllustrator, setTab, theme, hasKey } = useStore();
  const isDark = theme !== 'light';

  // 阶段状态：'rough_cut' (AI 智能粗剪) | 'polish_export' (视觉包装与导出)
  const [activeStep, setActiveStep] = useState<'rough_cut' | 'polish_export'>('rough_cut');

  // 基础媒体与播放状态
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [videoPath, setVideoPath] = useState<string>('');
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 1080,
    height: 1920,
  });
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // 核心剪辑切片与字幕列表
  const [segments, setSegments] = useState<CutSegment[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);

  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribeStage, setTranscribeStage] = useState<string>('');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [isAnalyzingNarrative, setIsAnalyzingNarrative] = useState<boolean>(false);
  const [narrativeAnalysis, setNarrativeAnalysis] = useState<NarrativeAnalysisResult | null>(null);

  // 🌟 两栏比例自由拖拽宽度 (自适应屏幕宽度，支持左右拖拽，最小 320px，最大 760px)
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.min(440, Math.max(340, Math.round((window.innerWidth - 220) * 0.40)));
    }
    return 420;
  });
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);

  // 监听主进程实时转录阶段变化
  useEffect(() => {
    if (api.onTranscribeStatus) {
      const unsub = api.onTranscribeStatus((msg) => {
        setTranscribeStage(msg);
      });
      return unsub;
    }
  }, []);

  // 两栏左右拖拽监听
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(340, Math.min(760, e.clientX));
      setLeftPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // 画布与贴片设置 (默认 9:16 竖屏，默认关闭贴片避免遮挡画面)
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>({
    aspectRatio: '9:16',
    backgroundType: 'blur',
    backgroundColor: '#09090b',
    blurIntensity: 25,
    videoScale: 1.0,
    videoYPercent: 0,
    topPatch: {
      enabled: false,
      text: 'AI 口播精剪 · 爆款结构速成',
      fontSize: 26,
      textColor: '#000000',
      backgroundColor: '#facc15',
      borderRadius: 10,
      fontWeight: '900',
      yOffsetPercent: 0.06,
      xOffsetPercent: 0.5,
      stylePreset: 'viral_yellow',
    },
    bottomPatch: {
      enabled: false,
      text: '关注我 · 获取自媒体全套生产力工具',
      fontSize: 16,
      textColor: '#d4d4d8',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      borderRadius: 8,
      fontWeight: 'normal',
      yOffsetPercent: 0.05,
      xOffsetPercent: 0.5,
    },
    stickerPatch: undefined,
  });

  // 字幕样式配置
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleStyleConfig>({
    templateId: 'viral_double',
    fontSize: 26,
    textColor: '#ffffff',
    highlightColor: '#facc15',
    strokeColor: '#000000',
    strokeWidth: 2.5,
    yPercent: 0.18,
    visible: true,
  });

  // 🌟 清空重置当前工程，支持用户随时继续制作下一个视频
  const handleResetProject = () => {
    if (videoSrc && videoSrc.startsWith('blob:')) {
      URL.revokeObjectURL(videoSrc);
    }
    setVideoSrc('');
    setVideoPath('');
    setVideoTitle('');
    setVideoDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setSegments([]);
    setSubtitles([]);
    setNarrativeAnalysis(null);
    setIsTranscribing(false);
    setTranscribeStage('');
    setTranscribeError(null);
    setActiveStep('rough_cut');
    showToast('工程已清空，可直接导入新视频素材开始下一个剪辑！', 'ok');
  };

  // 🌟 根据绝对文件路径载入视频 (安全可靠，100% 具备真实操作系统路径)
  const handleLoadVideoPath = (absPath: string) => {
    const fileName = absPath.split(/[\\/]/).pop() || '视频素材';
    const fileUrl = `file:///${absPath.replace(/\\/g, '/')}`;
    setVideoSrc(fileUrl);
    setVideoPath(absPath);
    setVideoTitle(fileName);
    setCurrentTime(0);
    setIsPlaying(false);
    setSegments([]);
    setSubtitles([]);
    setNarrativeAnalysis(null);
    setIsTranscribing(false);
    setTranscribeStage('');
    setTranscribeError(null);
    showToast(`已载入视频：${fileName}，点击「🤖 AI 一键全自动精剪」开始分析`, 'ok');
  };

  // 🌟 原生系统文件选择对话框 (dialog.showOpenDialog)
  const handlePickMediaFile = async () => {
    try {
      const p = await api.pickMediaFile?.();
      if (p) {
        handleLoadVideoPath(p);
      }
    } catch (err: any) {
      console.error('选择音视频文件异常:', err);
    }
  };

  // 🌟 拖拽或 input 载入视频文件 (自动通过 api.getPathForFile 解析真实物理路径)
  const handleLoadVideoFile = (file: File) => {
    const localPath = api.getPathForFile ? api.getPathForFile(file) : (file as any).path || '';
    if (localPath) {
      handleLoadVideoPath(localPath);
    } else {
      // 极端兜底：无原生路径时使用 blob 预览视频，并友好提醒用户
      const objUrl = URL.createObjectURL(file);
      setVideoSrc(objUrl);
      setVideoPath('');
      setVideoTitle(file.name);
      setCurrentTime(0);
      setIsPlaying(false);
      setSegments([]);
      setSubtitles([]);
      setNarrativeAnalysis(null);
      setIsTranscribing(false);
      setTranscribeStage('');
      setTranscribeError('未能获取到该视频的磁盘真实路径，请使用顶部「导入音视频」原生对话框选择该文件。');
      showToast('已载入视频画面，请使用「导入音视频」选择以支持 AI 文本提取', 'info');
    }
  };

  // 🌟 导入外部 SRT/VTT 字幕文件 (免跑 ASR，零网络消耗即刻剪辑)
  const handleImportSrtFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        try {
          const res = parseSrtContent(text, videoDuration);
          if (!res.segments.length) {
            showToast('未能从字幕文件中识别出有效台词', 'err');
            return;
          }
          setSegments(res.segments);
          setSubtitles(res.subtitles);
          if (res.durationSec > 0 && videoDuration === 0) {
            setVideoDuration(res.durationSec);
          }
          setTranscribeError(null);
          showToast(`成功解析字幕（${file.name}）：已生成 ${res.subtitles.length} 句切片！`, 'ok');
        } catch (err: any) {
          showToast(`字幕解析失败: ${err?.message || err}`, 'err');
        }
      }
    };
    reader.readAsText(file);
  };

  // 🌟 上传图片贴片 (Logo/水印，全片覆盖，支持多张同时导入、无尺寸限制)
  const handleUploadStickers = (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    setCanvasConfig((prev) => {
      const existingStickers: CustomStickerPatch[] = prev.stickers && prev.stickers.length > 0
        ? [...prev.stickers]
        : prev.stickerPatch && prev.stickerPatch.imageUrl
        ? [{ ...prev.stickerPatch, id: prev.stickerPatch.id || 'sticker-default' }]
        : [];

      fileArr.forEach((file, fIdx) => {
        const localPath = api.getPathForFile ? api.getPathForFile(file) : (file as any).path || '';
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          if (dataUrl) {
            const img = new Image();
            img.onload = () => {
              const id = `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const offset = (existingStickers.length + fIdx) * 0.05;
              const newSticker: CustomStickerPatch = {
                id,
                imageUrl: dataUrl,
                localPath: localPath || '',
                name: file.name,
                xPercent: Math.min(0.85, 0.5 + (offset % 0.35)),
                yPercent: Math.min(0.85, 0.15 + (offset % 0.35)),
                scale: 1.0,
                aspectRatio: img.width / Math.max(1, img.height),
                enabled: true,
              };
              setCanvasConfig((latest) => {
                const cur = latest.stickers && latest.stickers.length > 0 ? [...latest.stickers] : [];
                cur.push(newSticker);
                return {
                  ...latest,
                  stickers: cur,
                  stickerPatch: cur[0],
                };
              });
            };
            img.src = dataUrl;
          }
        };
        reader.readAsDataURL(file);
      });

      return prev;
    });
    showToast(`已开始导入 ${fileArr.length} 张贴片，尺寸与数量无限制！`, 'ok');
  };

  const handleUploadSticker = (file: File) => {
    handleUploadStickers([file]);
  };

  // 🌟 ASR 分句提取与降级自愈（通过 refineUtterancesToSubtitleUnits 拆解为 6~14 字自媒体黄金口播短句）
  const getEffectiveUtterances = (
    result: { text?: string; utterances?: any[]; durationMs?: number } | null,
    videoDurationSec?: number
  ): Array<{
    id: string;
    text: string;
    cleanText: string;
    startTime: number;
    endTime: number;
    words?: Array<{ text: string; startTime: number; endTime: number }>;
  }> => {
    if (!result) return [];

    let rawList: Array<{
      id?: string;
      text: string;
      startTime: number;
      endTime: number;
      words?: Array<{ text: string; startTime: number; endTime: number }>;
    }> = [];

    // 如果火山 ASR 下发了原生 utterances 分句，直接做单位标准化 (ms -> s)
    if (Array.isArray(result.utterances) && result.utterances.length > 0) {
      const lastUtt = result.utterances[result.utterances.length - 1];
      const isMs = (result.durationMs && result.durationMs > 1000) || (lastUtt?.endTime > 600);
      const factor = isMs ? 1000 : 1;

      rawList = result.utterances.map((u: any, i: number) => {
        const start = Number((u.startTime / factor).toFixed(3));
        const end = Number((u.endTime / factor).toFixed(3));
        const words = Array.isArray(u.words) && u.words.length > 0
          ? u.words.map((w: any) => ({
              text: w.text,
              startTime: Number((w.startTime / factor).toFixed(3)),
              endTime: Number((w.endTime / factor).toFixed(3)),
            }))
          : undefined;

        return {
          id: `utt-${i}`,
          text: u.text,
          startTime: start,
          endTime: end,
          words,
        };
      });
    } else {
      // 🌟 自愈降级：火山 ASR 仅返回了全文 text 时
      const rawText = (result.text || '').trim();
      if (!rawText) return [];

      const durSec = (result.durationMs && result.durationMs > 0)
        ? result.durationMs / 1000
        : (videoDurationSec && videoDurationSec > 0)
        ? videoDurationSec
        : 60;

      rawList = [{
        id: 'utt-raw-0',
        text: rawText,
        startTime: 0.15,
        endTime: durSec,
      }];
    }

    // 🌟 核心升级：经过短视频口播黄金节奏断句器，将长段/长句切成 6~14 字精炼短语
    return refineUtterancesToSubtitleUnits(rawList, videoDurationSec);
  };

  // 🌟 ASR 转录触发逻辑：内嵌在左侧文稿列表区，无遮挡全屏弹窗，右侧监视器可正常播放
  const handleTriggerTranscribe = async (autoCutAfter = false) => {
    if (!hasKey) {
      const errMsg = '您尚未在「设置」中配置火山引擎 API Key。';
      setTranscribeError(errMsg);
      showToast(errMsg, 'err');
      return;
    }

    if (!videoPath) {
      const errMsg = '未获取到本地视频真实磁盘路径，请点击「导入音视频」重新选择文件。';
      setTranscribeError(errMsg);
      showToast(errMsg, 'err');
      return;
    }

    setIsTranscribing(true);
    setTranscribeStage('正在提取本地音轨并提交火山引擎 Seed-ASR 2.0…');
    setTranscribeError(null);

    try {
      if (api.transcribe) {
        const res = await api.transcribe({
          filePath: videoPath,
          enableSpeakerInfo: false,
        });

        // 🌟 使用自愈提取器 + 黄金口播短句切分器：无论服务端返回 utterances 还是仅返回 text，都能稳定提取出紧凑短句
        const rawUtterances = getEffectiveUtterances(res, videoDuration);

        if (rawUtterances.length > 0) {
          setTranscribeStage('正在毫秒级解析字词时间戳与气口停顿…');

          const dur = (res?.durationMs && res.durationMs > 0)
            ? Number((res.durationMs / 1000).toFixed(2))
            : videoDuration > 0
            ? videoDuration
            : rawUtterances[rawUtterances.length - 1].endTime + 0.3;

          if (dur > 0 && dur !== videoDuration) setVideoDuration(dur);

          // 1. 初始化切片（带有 120ms~150ms 黄金自然呼吸保护，且默认保持 isDeleted: false 完整呈现）
          const initialSegments = scanSilenceSegments(rawUtterances, dur, {
            silenceThresholdSec: 0.4,
            headPaddingSec: 0.12,
            tailPaddingSec: 0.15,
          });
          setSegments(initialSegments);

          // 2. 初始化字幕列表（纯净短句，每句 6~14 字，杜绝整大段塞入）
          setSubtitles(
            rawUtterances.map((u, i) => ({
              id: `sub-${i}`,
              startTime: u.startTime,
              endTime: u.endTime,
              text: u.cleanText || u.text,
            }))
          );

          setTranscribeError(null);
          showToast(`台词提取完成！共解析 ${rawUtterances.length} 句口播台词`, 'ok');

          if (autoCutAfter) {
            // 自动应用 AI 精剪（传入 initialSegments 突破 React 闭包旧状态陷阱）
            await handleApplyFullAiCut({
              cutSilence: true,
              cutFillers: true,
              cutStumbles: true,
              cutNarrative: true,
              narrativePreset: 'balanced',
              baseSegments: initialSegments,
            });
          }
          return;
        } else {
          throw new Error('未能在音频中识别到有效台词文本，请检查音视频是否有清晰人声发音。');
        }
      } else {
        throw new Error('当前客户端环境缺少 ASR 转录通信接口。');
      }
    } catch (err: any) {
      console.warn('[TalkEditor] ASR 提取异常:', err);
      const errMsg = err?.message || String(err);
      setTranscribeError(errMsg);
      showToast(`ASR 语音转录遇到问题: ${errMsg}`, 'err');
    } finally {
      setIsTranscribing(false);
      setTranscribeStage('');
    }
  };

  // 用户点击“体验演示示例”时才加载演示数据
  const generateFallbackDemoSegments = () => {
    const mockDur = 42;
    setVideoDuration(mockDur);
    setVideoTitle('自媒体口播爆款选题实战 (演示示例)');
    const mockUtterances = [
      { id: '1', startTime: 0.4, endTime: 3.6, text: '今天我一定要跟你聊一个非常扎心的真相。' },
      { id: '2', startTime: 4.5, endTime: 7.0, text: '很多做自媒体的朋友，每天都在苦苦死撑……呃……' },
      { id: '3', startTime: 7.4, endTime: 11.2, text: '很多做自媒体的朋友，每天都在苦苦死撑却没有流量。' },
      { id: '4', startTime: 12.2, endTime: 16.8, text: '其实根本不是你不够努力，而是你一开始的选题框架就彻底跑偏了。' },
      { id: '5', startTime: 17.6, endTime: 21.8, text: '顺便说一句，昨天我邻居小李还问我关于短视频的事，我跟他聊了半天。' },
      { id: '6', startTime: 22.5, endTime: 27.2, text: '接下来我给你总结 3 个必须立刻掌握的破局核心。' },
      { id: '7', startTime: 28.0, endTime: 33.5, text: '第一点，也是最关键的，是前三秒必须直接亮出利益点。' },
      { id: '8', startTime: 34.5, endTime: 40.5, text: '只要把这套逻辑吃透，你的完播率起码能翻三倍以上。' },
    ];

    const refinedUnits = refineUtterancesToSubtitleUnits(mockUtterances, mockDur);
    const initialSegs = scanSilenceSegments(refinedUnits, mockDur, {
      silenceThresholdSec: 0.4,
      headPaddingSec: 0.12,
      tailPaddingSec: 0.15,
    });
    setSegments(initialSegs);
    setSubtitles(
      refinedUnits.map((u, idx) => ({
        id: `sub-${idx}`,
        startTime: u.startTime,
        endTime: u.endTime,
        text: u.cleanText || u.text,
      }))
    );
    setTranscribeError(null);
    showToast('已载入 42 秒自媒体口播演示素材，包含气口、语气词、嘴瓢与跑题！', 'ok');
  };

  // 🌟 AI 一键全自动精剪 (执行确认后的批量剪切，涵盖声学、发音与深度内容主线)
  const handleApplyFullAiCut = async ({
    cutSilence,
    cutFillers,
    cutStumbles,
    cutNarrative,
    narrativePreset,
    baseSegments,
  }: {
    cutSilence: boolean;
    cutFillers: boolean;
    cutStumbles: boolean;
    cutNarrative?: boolean;
    narrativePreset?: NarrativePreset;
    baseSegments?: CutSegment[];
  }) => {
    let next = [...(baseSegments || segments)];

    // 1. 去除停顿气口 (匹配所有声学空白与停顿标记)
    if (cutSilence) {
      next = next.map((s) => {
        if (
          s.type === 'silence' ||
          s.deleteReason === 'silence' ||
          s.tagLabel?.includes('气口') ||
          s.tagLabel?.includes('停顿') ||
          s.id.startsWith('silence-')
        ) {
          return {
            ...s,
            isDeleted: true,
            deleteReason: 'silence' as const,
            tagLabel: s.tagLabel || '[气口停顿]',
            reasonDetail: s.reasonDetail || '声学停顿空白，切除以保持紧凑节奏',
          };
        }
        return s;
      });
    }

    // 2. 清理语气助词口癖与咳嗽杂音 (呃、啊、那个、咳咳等)
    if (cutFillers) {
      next = detectFillerSegments(next);
    }

    // 3. 剔除多轮录制嘴瓢忘词 (保留最后完整一遍，切除前面尝试)
    if (cutStumbles) {
      next = detectRetakeAndStumbles(next);
    }

    // 4. 深度文案内容与主线分析 (剔除寒暄、跑题与车轱辘话)
    if (cutNarrative) {
      setIsAnalyzingNarrative(true);
      try {
        const res = await runNarrativePruning(next, narrativePreset || 'balanced', modelSettings);
        next = res.updatedSegments;
        setNarrativeAnalysis(res.analysis);
      } catch (err) {
        console.warn('深度文案分析异常:', err);
      } finally {
        setIsAnalyzingNarrative(false);
      }
    }

    setSegments(next);
    showToast('AI 全自动精剪方案已应用！可在左侧微调，或直接试听播放', 'ok');
  };

  // 单独触发去气口
  const handleRunSilenceCut = () => {
    const updated = segments.map((s) => {
      if (
        s.type === 'silence' ||
        s.deleteReason === 'silence' ||
        s.tagLabel?.includes('气口') ||
        s.tagLabel?.includes('停顿') ||
        s.id.startsWith('silence-')
      ) {
        return {
          ...s,
          isDeleted: true,
          deleteReason: 'silence' as const,
          tagLabel: s.tagLabel || '[气口停顿]',
          reasonDetail: s.reasonDetail || '声学自然呼吸空隙',
        };
      }
      return s;
    });
    setSegments(updated);
    showToast('已一键切除所有气口停顿（保留黄金呼吸缓冲）', 'ok');
  };

  // 单独触发清语气词
  const handleRunFillerClean = () => {
    const updated = detectFillerSegments(segments);
    setSegments(updated);
    showToast('已识别并剔除语气词与口头禅', 'ok');
  };

  // 单独触发嘴瓢清洗
  const handleRunStumbleClean = () => {
    const updated = detectRetakeAndStumbles(segments);
    setSegments(updated);
    showToast('已识别并剔除多次重录的嘴瓢废片，保留最佳版本', 'ok');
  };

  // 单独触发篇章精炼
  const handleRunNarrativePruning = async (preset: NarrativePreset) => {
    setIsAnalyzingNarrative(true);
    try {
      const res = await runNarrativePruning(segments, preset, modelSettings);
      setSegments(res.updatedSegments);
      setNarrativeAnalysis(res.analysis);
      showToast(`文案深度精炼完成！剔除 ${(res.analysis.prunedDurationSec || 0).toFixed(1)}s 旁枝冗余`, 'ok');
    } catch (err: any) {
      showToast(`文案深度精炼失败: ${err?.message || err}`, 'err');
    } finally {
      setIsAnalyzingNarrative(false);
    }
  };

  // 🌟 核心联动：由当前实际生效的文稿切片实时派生出最新口播字幕 (实时反映双击删除字、切除片段，彻底杜绝已删字出现在画面与导出中)
  const effectiveSubtitles = useMemo<SubtitleItem[]>(() => {
    if (segments && segments.length > 0) {
      const result: SubtitleItem[] = [];
      segments.forEach((seg, idx) => {
        if (seg.isDeleted || seg.type === 'silence') return;
        if (seg.words && seg.words.length > 0) {
          const activeWords = seg.words.filter((w) => !w.isDeleted);
          if (activeWords.length > 0) {
            const cleanTxt = activeWords.map((w) => w.text).join('').trim();
            if (cleanTxt) {
              result.push({
                id: seg.id || `sub-seg-${idx}`,
                startTime: activeWords[0].startTime,
                endTime: activeWords[activeWords.length - 1].endTime,
                text: cleanTxt,
                words: activeWords.map((w) => ({
                  word: w.text,
                  startTime: w.startTime,
                  endTime: w.endTime,
                })),
              });
            }
          }
        } else {
          const cleanTxt = (seg.text || '').trim();
          if (cleanTxt) {
            result.push({
              id: seg.id || `sub-seg-${idx}`,
              startTime: seg.startTime,
              endTime: seg.endTime,
              text: cleanTxt,
            });
          }
        }
      });
      if (result.length > 0) return result;
    }
    return subtitles;
  }, [segments, subtitles]);

  // 阶段二：推送至 AI 爆款插画师 (全量保留视频、文案、毫秒级字幕时间轴、多张上传贴片与画布包装)
  const handlePushToIllustrator = () => {
    const preservedText = segments
      .filter((s) => !s.isDeleted && s.type !== 'silence')
      .map((s) => {
        if (s.words && s.words.length > 0) {
          return s.words.filter((w) => !w.isDeleted).map((w) => w.text).join('');
        }
        return s.text;
      })
      .join('\n');

    if (!preservedText.trim()) {
      showToast('当前精剪内容为空，无法推送插画师', 'err');
      return;
    }

    const effectiveUtterances = effectiveSubtitles.map((sub) => ({
      text: sub.text,
      startTime: sub.startTime,
      endTime: sub.endTime,
    }));

    const activeStickersList =
      canvasConfig.stickers && canvasConfig.stickers.length > 0
        ? canvasConfig.stickers
        : canvasConfig.stickerPatch?.imageUrl
        ? [{ ...canvasConfig.stickerPatch, id: 'sticker-primary' }]
        : [];

    const pushData: PendingIllustratorData = {
      videoPath: videoPath || videoSrc,
      videoUrl: videoSrc,
      scriptText: preservedText,
      title: videoTitle || 'AI 口播精剪',
      stickerPatch: canvasConfig.stickerPatch,
      stickers: activeStickersList,
      subtitles: effectiveSubtitles,
      canvasConfig,
      subtitleConfig,
      asrUtterances: effectiveUtterances,
    };

    if (onPushToIllustrator) {
      onPushToIllustrator(pushData);
    } else {
      setPendingIllustrator(pushData);
      setTab('illustrator');
    }
    showToast('已全量推送至「AI 爆款插画师」（包含视频、文稿、时间轴字幕与贴片）！', 'ok');
  };

  // 阶段二：一键导出剪映专业版草稿 (严格采用剔除已删字后的 effectiveSubtitles)
  const handleExportJianyingDraft = async (draftName?: string) => {
    const name = draftName || videoTitle || 'Jaygo 口播精剪';
    const activeSubtitles = subtitleConfig.visible === false ? [] : effectiveSubtitles;

    try {
      const res = buildJianyingTalkDraft({
        projectName: name,
        videoPath: videoPath || videoSrc,
        videoDurationSec: videoDuration,
        canvasConfig,
        segments,
        subtitles: activeSubtitles,
        subtitleStyle: subtitleConfig,
      });

      // 触发下载剪映草稿配置文件 draft_content.json
      const blob = new Blob([res.draftContentJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `draft_content_${res.projectName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`已成功生成剪映 Pro 草稿配置文件: draft_content_${res.projectName}.json`, 'ok');
    } catch (err: any) {
      showToast(`导出剪映草稿失败: ${err?.message || err}`, 'err');
    }
  };

  // 🌟 从监视器在位改字
  const handleUpdateSubtitleText = (subId: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) return;

    setSegments((prev) =>
      prev.map((seg) => {
        if (seg.id === subId) {
          let newWords = seg.words;
          if (seg.words && seg.words.length > 0) {
            const chars = Array.from(trimmed);
            const totalDur = Math.max(0.1, seg.endTime - seg.startTime);
            const charDur = totalDur / Math.max(1, chars.length);
            newWords = chars.map((char, idx) => ({
              id: `w-${seg.id}-${idx}-${Date.now()}`,
              text: char,
              startTime: Number((seg.startTime + idx * charDur).toFixed(3)),
              endTime: Number((seg.startTime + (idx + 1) * charDur).toFixed(3)),
              isDeleted: false,
            }));
          }
          return {
            ...seg,
            text: trimmed,
            words: newWords,
          };
        }
        return seg;
      })
    );
    showToast('已更新字幕文本', 'ok');
  };

  // 🌟 从监视器在当前播放位置一键切分字幕
  const handleSplitSegmentAtTime = (timeSec: number) => {
    setSegments((prev) => {
      const segIdx = prev.findIndex((s) => timeSec >= s.startTime && timeSec <= s.endTime);
      if (segIdx === -1) {
        showToast('当前播放进度处未检测到可切分的字幕片段', 'info');
        return prev;
      }
      const seg = prev[segIdx];
      const dur = seg.endTime - seg.startTime;
      let splitTime = timeSec;
      if (splitTime <= seg.startTime + 0.05 || splitTime >= seg.endTime - 0.05) {
        splitTime = seg.startTime + dur / 2;
      }

      let wordsA = undefined;
      let wordsB = undefined;
      let textA = '';
      let textB = '';

      if (seg.words && seg.words.length >= 2) {
        let bestIdx = 0;
        let minDiff = Infinity;
        seg.words.forEach((w, idx) => {
          if (idx < seg.words!.length - 1) {
            const diff = Math.abs(w.endTime - splitTime);
            if (diff < minDiff) {
              minDiff = diff;
              bestIdx = idx;
            }
          }
        });
        wordsA = seg.words.slice(0, bestIdx + 1);
        wordsB = seg.words.slice(bestIdx + 1);
        splitTime = wordsA[wordsA.length - 1].endTime;
        textA = wordsA.map((w) => w.text).join('');
        textB = wordsB.map((w) => w.text).join('');
      } else {
        const ratio = (splitTime - seg.startTime) / Math.max(0.01, dur);
        const charIdx = Math.max(1, Math.min(seg.text.length - 1, Math.round(seg.text.length * ratio)));
        textA = seg.text.slice(0, charIdx);
        textB = seg.text.slice(charIdx);
      }

      const segA: CutSegment = {
        ...seg,
        id: `${seg.id}_a_${Date.now()}`,
        endTime: splitTime,
        text: textA,
        words: wordsA,
      };
      const segB: CutSegment = {
        ...seg,
        id: `${seg.id}_b_${Date.now() + 1}`,
        startTime: splitTime,
        text: textB,
        words: wordsB,
      };

      const updated = [...prev];
      updated.splice(segIdx, 1, segA, segB);
      showToast('已在当前播放进度处切分字幕', 'ok');
      return updated;
    });
  };

  return (
    <div
      className={`h-full flex flex-col select-none overflow-hidden ${
        isDark ? 'bg-[#0b0c10] text-zinc-100' : 'bg-zinc-50 text-zinc-800'
      }`}
    >
      {/* 隐藏的文件输入组件 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleLoadVideoFile(file);
          e.target.value = '';
        }}
      />
      <input
        ref={srtInputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportSrtFile(file);
          e.target.value = '';
        }}
      />
      <input
        ref={stickerInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleUploadStickers(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* 顶栏控制条：两阶段切换、工程导入/清空与核心状态 */}
      <div
        className={`h-12 border-b px-3 sm:px-4 flex items-center justify-between shrink-0 z-20 backdrop-blur gap-2 overflow-x-auto no-scrollbar ${
          isDark ? 'bg-[#13141c]/95 border-zinc-800/80' : 'bg-white/95 border-zinc-200 shadow-xs'
        }`}
      >
        {/* 左侧：标题与当前视频信息 + 快捷工具 */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="flex items-center gap-2 shrink-0 select-none">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div className="shrink-0 flex flex-col justify-center">
              <div className="text-sm font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <span className="shrink-0 whitespace-nowrap">AI 口播智能剪辑</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full border shrink-0 whitespace-nowrap ${
                    isDark
                      ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  }`}
                >
                  字级精剪
                </span>
              </div>
              <div className={`text-[10.5px] truncate max-w-[120px] sm:max-w-[180px] shrink-0 whitespace-nowrap ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {videoTitle || '未载入素材 · 请导入视频'}
              </div>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-700/40 mx-0.5 shrink-0 hidden sm:block" />

          {/* 🌟 导入视频按钮 */}
          <button
            type="button"
            onClick={handlePickMediaFile}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition border shadow-xs shrink-0 whitespace-nowrap ${
              isDark
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700/60'
                : 'bg-white hover:bg-zinc-100 text-zinc-800 border-zinc-300'
            }`}
            title="选择本地音视频文件开始剪辑"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="shrink-0 whitespace-nowrap">导入视频</span>
          </button>

          {/* 🌟 导入外部字幕按钮 */}
          <button
            type="button"
            onClick={() => srtInputRef.current?.click()}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition border shadow-xs shrink-0 whitespace-nowrap ${
              isDark
                ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
                : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'
            }`}
            title="导入剪映已导出的 SRT/VTT 字幕，免 ASR 直接剪辑"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="shrink-0 whitespace-nowrap">字幕</span>
          </button>

          {/* 🌟 贴片图片上传快捷入口 (多贴片无限制) */}
          <button
            type="button"
            onClick={() => stickerInputRef.current?.click()}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition border shadow-xs shrink-0 whitespace-nowrap ${
              (canvasConfig.stickers && canvasConfig.stickers.length > 0) || canvasConfig.stickerPatch?.imageUrl
                ? isDark
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                : isDark
                ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
                : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'
            }`}
            title="上传图片贴片 / 水印 Logo（支持多张同时选、无尺寸限制，全片覆盖并可在预览框中直接拖拽缩放）"
          >
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="shrink-0 whitespace-nowrap">
              {canvasConfig.stickers && canvasConfig.stickers.length > 0
                ? `贴片 (${canvasConfig.stickers.length})`
                : canvasConfig.stickerPatch?.imageUrl
                ? '贴片 (1)'
                : '贴片'}
            </span>
          </button>

          {/* 🌟 清空重置工程按钮 (纯图标 + Tooltip) */}
          {(videoSrc || segments.length > 0) && (
            <button
              type="button"
              onClick={handleResetProject}
              className={`p-1.5 rounded-lg text-xs font-medium cursor-pointer transition border shadow-xs flex items-center justify-center shrink-0 ${
                isDark
                  ? 'bg-zinc-800/80 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border-zinc-700/60 hover:border-rose-500/40'
                  : 'bg-white hover:bg-rose-50 text-zinc-500 hover:text-rose-600 border-zinc-300 hover:border-rose-200'
              }`}
              title="清空当前视频与剪辑数据，开启下一个视频"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>

        {/* 中间：两阶段步骤导航指示器 */}
        <div
          className={`flex items-center p-0.5 rounded-xl border text-xs font-medium shrink-0 whitespace-nowrap select-none ${
            isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveStep('rough_cut')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition cursor-pointer shrink-0 whitespace-nowrap ${
              activeStep === 'rough_cut'
                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span className="shrink-0 whitespace-nowrap">1. 智能粗剪</span>
          </button>

          <ArrowRight className="w-3 h-3 text-zinc-500 mx-0.5 shrink-0" />

          <button
            type="button"
            onClick={() => setActiveStep('polish_export')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition cursor-pointer shrink-0 whitespace-nowrap ${
              activeStep === 'polish_export'
                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                : isDark
                ? 'text-zinc-400 hover:text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="shrink-0 whitespace-nowrap">2. 视觉包装</span>
          </button>
        </div>

        {/* 右侧：快捷流转操作 */}
        <div className="flex items-center gap-2 shrink-0">
          {activeStep === 'rough_cut' ? (
            <button
              type="button"
              onClick={() => setActiveStep('polish_export')}
              disabled={segments.length === 0}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow cursor-pointer shrink-0 whitespace-nowrap ${
                segments.length === 0
                  ? isDark
                    ? 'opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-500'
                    : 'opacity-40 cursor-not-allowed bg-zinc-200 text-zinc-400'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white'
              }`}
            >
              <span className="shrink-0 whitespace-nowrap">下一步 ➔</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveStep('rough_cut')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer shrink-0 whitespace-nowrap ${
                isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700' : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="shrink-0 whitespace-nowrap">➔ 上一步</span>
            </button>
          )}
        </div>
      </div>

      {/* 主工作区两栏布局 (支持 Resizable Split 左右拖拽自由调节) */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {activeStep === 'rough_cut' ? (
          <>
            {/* 阶段一 左栏：Descript 风格文稿剪辑区 (支持自由拖拽调节宽度) */}
            <div style={{ width: `${leftPanelWidth}px` }} className="shrink-0 min-h-0 flex flex-col relative">
              <TranscriptCutter
                segments={segments}
                onUpdateSegments={setSegments}
                currentTime={currentTime}
                onSeek={setCurrentTime}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                onRunSilenceCut={handleRunSilenceCut}
                onRunFillerClean={handleRunFillerClean}
                onRunStumbleClean={handleRunStumbleClean}
                onRunNarrativePruning={handleRunNarrativePruning}
                isAnalyzingNarrative={isAnalyzingNarrative}
                narrativeAnalysis={narrativeAnalysis}
                onApplyFullAiCut={handleApplyFullAiCut}
                modelSettings={modelSettings}
                onOpenModelHub={onOpenModelHub}
                hasVideo={Boolean(videoSrc)}
                isTranscribing={isTranscribing}
                transcribeStage={transcribeStage}
                transcribeError={transcribeError}
                onTriggerTranscribe={() => handleTriggerTranscribe(true)}
                onPickMediaFile={handlePickMediaFile}
                onLoadVideoFile={handleLoadVideoFile}
                onImportSrt={handleImportSrtFile}
                hasKey={hasKey}
                onGoSettings={() => setTab('settings')}
                onLoadDemo={generateFallbackDemoSegments}
              />
            </div>

            {/* 🌟 优雅的可拖拽分割手柄 (Splitter Handle) */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizing(true);
              }}
              className={`w-1.5 cursor-col-resize select-none shrink-0 relative transition-colors group z-20 ${
                isResizing
                  ? 'bg-indigo-500'
                  : isDark
                  ? 'bg-zinc-800/80 hover:bg-indigo-500/60'
                  : 'bg-zinc-200 hover:bg-indigo-400'
              }`}
              title="左右拖拽调节文稿与监视器栏宽"
            >
              <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-3.5 h-8 rounded-full bg-zinc-700/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition pointer-events-none shadow">
                <div className="w-0.5 h-3 bg-white/90 rounded" />
              </div>
            </div>

            {/* 阶段一 右栏：高响应单视频监视器 + 紧凑单轨波形 (自适应 flex-1) */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 relative">
              <CanvasMonitor
                videoSrc={videoSrc}
                videoDuration={videoDuration}
                currentTime={currentTime}
                onSeek={setCurrentTime}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                canvasConfig={canvasConfig}
                onChangeCanvasConfig={setCanvasConfig}
                onChangeCanvasRatio={(ratio) =>
                  setCanvasConfig((prev) => ({ ...prev, aspectRatio: ratio }))
                }
                subtitleConfig={subtitleConfig}
                onChangeSubtitleConfig={setSubtitleConfig}
                subtitles={effectiveSubtitles}
                segments={segments}
                videoDimensions={videoDimensions}
                onVideoLoaded={(dim) => {
                  setVideoDimensions({ width: dim.width, height: dim.height });
                  if (dim.duration && dim.duration > 0) {
                    setVideoDuration(dim.duration);
                  }
                }}
                onDropVideoFile={handleLoadVideoFile}
                onUpdateSubtitleText={handleUpdateSubtitleText}
                onSplitSegmentAtTime={handleSplitSegmentAtTime}
              />
            </div>
          </>
        ) : (
          <>
            {/* 阶段二 左栏：专属包装配置面板 (宽度 380px) */}
            <div className="w-[380px] shrink-0 min-h-0 flex flex-col">
              <PolishExportPanel
                canvasConfig={canvasConfig}
                onChangeCanvasConfig={setCanvasConfig}
                subtitleConfig={subtitleConfig}
                onChangeSubtitleConfig={setSubtitleConfig}
                subtitles={effectiveSubtitles}
                segments={segments}
                videoPath={videoPath}
                videoDuration={videoDuration}
                onPushToIllustrator={handlePushToIllustrator}
                onExportJianyingDraft={handleExportJianyingDraft}
              />
            </div>

            {/* 阶段二 右栏：全要素实时渲染监视器 (画布贴片 + 爆款字幕) */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 relative">
              <CanvasMonitor
                videoSrc={videoSrc}
                videoDuration={videoDuration}
                currentTime={currentTime}
                onSeek={setCurrentTime}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                canvasConfig={canvasConfig}
                onChangeCanvasConfig={setCanvasConfig}
                onChangeCanvasRatio={(ratio) =>
                  setCanvasConfig((prev) => ({ ...prev, aspectRatio: ratio }))
                }
                subtitleConfig={subtitleConfig}
                onChangeSubtitleConfig={setSubtitleConfig}
                subtitles={effectiveSubtitles}
                segments={segments}
                videoDimensions={videoDimensions}
                onVideoLoaded={(dim) => {
                  setVideoDimensions({ width: dim.width, height: dim.height });
                }}
                onDropVideoFile={handleLoadVideoFile}
                onUpdateSubtitleText={handleUpdateSubtitleText}
                onSplitSegmentAtTime={handleSplitSegmentAtTime}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TalkEditor;
