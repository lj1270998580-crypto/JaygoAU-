import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Scissors,
  Sparkles,
  Zap,
  RotateCcw,
  Volume2,
  Trash2,
  AlertTriangle,
  FileText,
  Search,
  BrainCircuit,
  Check,
  Play,
  Layers,
  X,
  Bot,
  Settings,
  Lightbulb,
  Loader2,
  MousePointerClick,
  Info,
  Copy,
  LocateFixed,
  UploadCloud,
  FileSpreadsheet,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  Edit3,
  Link2,
  Plus,
  Minus,
  Undo2,
} from 'lucide-react';
import type { CutSegment, NarrativePreset, NarrativeAnalysisResult, WordItem } from '../../lib/talkEditor/types';
import type { ModelHubSettings } from '../../lib/modelHubTypes';
import { getActiveAiEngineInfo } from '../../lib/talkEditor/semanticPruner';
import { useStore } from '../../store';

interface TranscriptCutterProps {
  segments: CutSegment[];
  onUpdateSegments: (newSegments: CutSegment[]) => void;
  currentTime: number;
  onSeek: (timeSec: number) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onRunSilenceCut?: () => void;
  onRunFillerClean?: () => void;
  onRunStumbleClean?: () => void;
  onRunNarrativePruning?: (preset: NarrativePreset) => Promise<void>;
  isAnalyzingNarrative: boolean;
  narrativeAnalysis: NarrativeAnalysisResult | null;
  onApplyFullAiCut: (options: {
    cutSilence: boolean;
    cutFillers: boolean;
    cutStumbles: boolean;
    cutNarrative?: boolean;
    narrativePreset?: NarrativePreset;
  }) => void;
  modelSettings?: ModelHubSettings;
  onOpenModelHub?: () => void;
  hasVideo?: boolean;
  isTranscribing?: boolean;
  transcribeStage?: string;
  transcribeError?: string | null;
  onTriggerTranscribe?: () => void;
  onPickMediaFile?: () => void;
  onLoadVideoFile?: (file: File) => void;
  onImportSrt?: (file: File) => void;
  hasKey?: boolean;
  onGoSettings?: () => void;
  onLoadDemo?: () => void;
}

export const TranscriptCutter: React.FC<TranscriptCutterProps> = ({
  segments,
  onUpdateSegments,
  currentTime,
  onSeek,
  isPlaying,
  onTogglePlay,
  isAnalyzingNarrative,
  narrativeAnalysis,
  onApplyFullAiCut,
  modelSettings,
  onOpenModelHub,
  hasVideo,
  isTranscribing,
  transcribeStage,
  transcribeError,
  onTriggerTranscribe,
  onPickMediaFile,
  onLoadVideoFile,
  onImportSrt,
  hasKey,
  onGoSettings,
  onLoadDemo,
}) => {
  const { theme, showToast } = useStore();
  const isDark = theme !== 'light';

  const [selectedPreset, setSelectedPreset] = useState<NarrativePreset>('balanced');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hideSilences, setHideSilences] = useState<boolean>(false);

  // 🌟 视图模式：'all' (全览剪辑模式) | 'clean' (仅看成片精炼台词)
  const [viewMode, setViewMode] = useState<'all' | 'clean'>('all');

  // 🌟 提词器式平滑滚动跟随播放头
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // 🌟 拖拽文件进入投掷区视觉提示
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // 本地隐藏 SRT 上传 input
  const localSrtInputRef = useRef<HTMLInputElement>(null);

  // AI 一键全自动精剪预览弹窗
  const [showAiCutModal, setShowAiCutModal] = useState<boolean>(false);
  const [aiCutOptions, setAiCutOptions] = useState({
    cutSilence: true,
    cutFillers: true,
    cutStumbles: true,
    cutNarrative: true,
  });

  // 解析当前生效的语义分析引擎信息 (大模型 vs 本地启发式)
  const activeEngine = useMemo(() => getActiveAiEngineInfo(modelSettings), [modelSettings]);

  // 字词拖拽划选批量选区状态
  const [dragSelection, setDragSelection] = useState<{
    segId: string;
    startIdx: number;
    endIdx: number;
  } | null>(null);
  const [isMouseDownOnWord, setIsMouseDownOnWord] = useState<boolean>(false);
  const dragAnchorIdxRef = useRef<{ segId: string; idx: number } | null>(null);

  // 🌟 字幕在位改字与切分编辑
  const [editingSegId, setEditingSegId] = useState<string | null>(null);
  const [segEditText, setSegEditText] = useState<string>('');
  const [splittingSegId, setSplittingSegId] = useState<string | null>(null);

  // 4 步流水线当前激活步骤 (1: 音轨提取 -> 2: 云端暂存 -> 3: Seed-ASR 识别 -> 4: 毫秒停顿对齐)
  const currentPipelineStep = useMemo(() => {
    if (transcribeStage?.includes('对齐') || transcribeStage?.includes('停顿') || transcribeStage?.includes('字词')) return 4;
    if (transcribeStage?.includes('识别') || transcribeStage?.includes('ASR') || transcribeStage?.includes('任务') || transcribeStage?.includes('轮询')) return 3;
    if (transcribeStage?.includes('暂存') || transcribeStage?.includes('上传') || transcribeStage?.includes('云端')) return 2;
    return 1;
  }, [transcribeStage]);

  // 时长统计 (包含字级别删除)
  const totalDuration = useMemo(
    () => segments.reduce((acc, s) => acc + (s.endTime - s.startTime), 0),
    [segments]
  );

  const deletedDuration = useMemo(() => {
    let sum = 0;
    for (const s of segments) {
      if (s.isDeleted) {
        sum += s.endTime - s.startTime;
      } else if (s.words && s.words.length > 0) {
        for (const w of s.words) {
          if (w.isDeleted) {
            sum += Math.max(0, w.endTime - w.startTime);
          }
        }
      }
    }
    return sum;
  }, [segments]);

  const preservedDuration = Math.max(0, totalDuration - deletedDuration);
  const condensedRatio = totalDuration > 0 ? Math.round((preservedDuration / totalDuration) * 100) : 100;

  // 统计发现的问题数量
  const detectedIssues = useMemo(() => {
    let silencesCount = 0;
    let silenceSec = 0;
    let fillersCount = 0;
    let stumblesCount = 0;
    let tangentsCount = 0;

    for (const s of segments) {
      if (
        s.type === 'silence' ||
        s.deleteReason === 'silence' ||
        s.tagLabel?.includes('气口') ||
        s.tagLabel?.includes('停顿') ||
        s.id.startsWith('silence-')
      ) {
        silencesCount++;
        silenceSec += s.endTime - s.startTime;
      }
      if (s.deleteReason === 'filler' || s.tagLabel?.includes('语气词') || s.tagLabel?.includes('杂音')) {
        fillersCount++;
      }
      if (s.words) {
        for (const w of s.words) {
          if (w.deleteReason === 'filler') fillersCount++;
          if (w.deleteReason === 'stumble') stumblesCount++;
        }
      }
      if (s.deleteReason === 'stumble' || s.tagLabel?.includes('重录')) {
        stumblesCount++;
      }
      if (
        s.deleteReason === 'narrative_tangent' ||
        s.tagLabel?.includes('车轱辘') ||
        s.tagLabel?.includes('冗余') ||
        s.tagLabel?.includes('寒暄')
      ) {
        tangentsCount++;
      }
    }

    return { silencesCount, silenceSec, fillersCount, stumblesCount, tangentsCount };
  }, [segments]);

  // 🌟 撤销历史快照栈（容量 25 层，支持 Ctrl+Z / Cmd+Z 撤销）
  const undoStackRef = useRef<CutSegment[][]>([]);
  const [canUndo, setCanUndo] = useState<boolean>(false);

  const pushUndoSnapshot = () => {
    try {
      undoStackRef.current.push(JSON.parse(JSON.stringify(segments)));
      if (undoStackRef.current.length > 25) {
        undoStackRef.current.shift();
      }
      setCanUndo(true);
    } catch (_) {}
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop();
    setCanUndo(undoStackRef.current.length > 0);
    if (prev) {
      onUpdateSegments(prev);
      showToast('已撤销上一步操作 (Ctrl+Z)', 'info');
    }
  };

  // 全局监听鼠标释放与按键 (空格启停、Ctrl+Z 撤销、划选删除)
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsMouseDownOnWord(false);
      dragAnchorIdxRef.current = null;
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // 🌟 撤销快捷键：Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // 🌟 空格键 Space：快速切换音视频播放与暂停
      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay?.();
        return;
      }

      if (dragSelection) {
        if (e.code === 'Backspace' || e.code === 'Delete') {
          e.preventDefault();
          batchDeleteWords(dragSelection.segId, dragSelection.startIdx, dragSelection.endIdx, true);
          setDragSelection(null);
        } else if (e.code === 'Escape') {
          setDragSelection(null);
        }
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [dragSelection, segments, onTogglePlay]);

  // 🌟 提词器式平滑居中滚动跟随
  useEffect(() => {
    if (!autoScroll || !isPlaying || !listContainerRef.current) return;
    const activeItem = listContainerRef.current.querySelector('[data-is-active="true"]');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentTime, autoScroll, isPlaying]);

  // 批量修改指定区间的字词删除状态
  const batchDeleteWords = (segId: string, startIdx: number, endIdx: number, isDeleted: boolean) => {
    pushUndoSnapshot();
    onUpdateSegments(
      segments.map((seg) => {
        if (seg.id !== segId || !seg.words) return seg;
        const updatedWords = seg.words.map((w, idx) => {
          if (idx >= startIdx && idx <= endIdx) {
            return {
              ...w,
              isDeleted,
              deleteReason: isDeleted ? ('manual' as const) : undefined,
            };
          }
          return w;
        });

        const allWordsDeleted = updatedWords.every((w) => w.isDeleted);
        return {
          ...seg,
          words: updatedWords,
          isDeleted: allWordsDeleted ? true : seg.isDeleted && !isDeleted ? false : seg.isDeleted,
          deleteReason: allWordsDeleted ? 'manual' : seg.deleteReason,
          tagLabel: allWordsDeleted ? '[整句切除]' : seg.tagLabel,
          reasonDetail: isDeleted ? '手动划选连续切除字词' : undefined,
        };
      })
    );
  };

  // 单字双击切换删除状态
  const toggleWordDeleted = (segId: string, wordIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    pushUndoSnapshot();
    onUpdateSegments(
      segments.map((seg) => {
        if (seg.id !== segId || !seg.words) return seg;
        const targetWord = seg.words[wordIdx];
        if (!targetWord) return seg;

        const nextWordDeleted = !targetWord.isDeleted;
        const updatedWords = seg.words.map((w, i) =>
          i === wordIdx
            ? { ...w, isDeleted: nextWordDeleted, deleteReason: nextWordDeleted ? ('manual' as const) : undefined }
            : w
        );

        const allWordsDeleted = updatedWords.every((w) => w.isDeleted);
        return {
          ...seg,
          words: updatedWords,
          isDeleted: allWordsDeleted ? true : seg.isDeleted && !nextWordDeleted ? false : seg.isDeleted,
          deleteReason: allWordsDeleted ? 'manual' : seg.deleteReason,
          tagLabel: allWordsDeleted ? '[整句切除]' : seg.tagLabel,
          reasonDetail: nextWordDeleted ? `双击删除了单字“${targetWord.text}”` : undefined,
        };
      })
    );
  };

  // 划选拖拽鼠标按下
  const handleWordMouseDown = (segId: string, idx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsMouseDownOnWord(true);
    dragAnchorIdxRef.current = { segId, idx };
    setDragSelection({ segId, startIdx: idx, endIdx: idx });
  };

  // 划选拖拽鼠标移入
  const handleWordMouseEnter = (segId: string, idx: number) => {
    if (isMouseDownOnWord && dragAnchorIdxRef.current && dragAnchorIdxRef.current.segId === segId) {
      const anchor = dragAnchorIdxRef.current.idx;
      setDragSelection({
        segId,
        startIdx: Math.min(anchor, idx),
        endIdx: Math.max(anchor, idx),
      });
    }
  };

  // 切换整句删除状态
  const toggleSegmentDeleted = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    pushUndoSnapshot();
    onUpdateSegments(
      segments.map((s) => {
        if (s.id !== id) return s;
        const nextDeleted = !s.isDeleted;
        return {
          ...s,
          isDeleted: nextDeleted,
          deleteReason: nextDeleted ? ('manual' as const) : undefined,
          tagLabel: nextDeleted ? '[整句切除]' : undefined,
          reasonDetail: nextDeleted ? '用户手动一键切除整句' : undefined,
          words: s.words?.map((w) => ({
            ...w,
            isDeleted: nextDeleted,
            deleteReason: nextDeleted ? ('manual' as const) : undefined,
          })),
        };
      })
    );
  };

  // 全部恢复原样
  const handleResetAll = () => {
    pushUndoSnapshot();
    onUpdateSegments(
      segments.map((s) => ({
        ...s,
        isDeleted: false,
        deleteReason: undefined,
        tagLabel: undefined,
        reasonDetail: undefined,
        words: s.words?.map((w) => ({ ...w, isDeleted: false, deleteReason: undefined })),
      }))
    );
    showToast('已撤销所有切除，恢复原片完整台词！', 'ok');
  };

  // 用户点击主精剪按钮
  const handleMainAiCutClick = () => {
    const isUnTranscribed =
      (!segments || segments.length === 0 || (segments.length === 1 && segments[0].id === 'seg-init')) &&
      Boolean(onTriggerTranscribe);

    if (isUnTranscribed && onTriggerTranscribe) {
      onTriggerTranscribe();
    } else {
      setShowAiCutModal(true);
    }
  };

  // 执行 AI 一键精剪确认
  const handleConfirmAiCut = () => {
    pushUndoSnapshot();
    onApplyFullAiCut({
      ...aiCutOptions,
      narrativePreset: selectedPreset,
    });
    setShowAiCutModal(false);
  };

  // 复制保留的成片文本到剪贴板
  const handleCopyCleanText = () => {
    const cleanText = segments
      .filter((s) => !s.isDeleted && s.type !== 'silence')
      .map((s) => {
        if (s.words && s.words.length > 0) {
          return s.words.filter((w) => !w.isDeleted).map((w) => w.text).join('');
        }
        return s.text;
      })
      .filter((t) => t.trim().length > 0)
      .join('\n');

    if (!cleanText) {
      showToast('当前保留内容为空', 'err');
      return;
    }

    navigator.clipboard.writeText(cleanText).then(() => {
      showToast('已复制最终精炼成片文稿至剪贴板！', 'ok');
    });
  };

  // 过滤后的切片列表
  const filteredSegments = useMemo(() => {
    return segments.filter((s) => {
      if (viewMode === 'clean' && s.isDeleted) return false;
      if (viewMode === 'clean' && s.type === 'silence') return false;
      if (hideSilences && (s.deleteReason === 'silence' || s.type === 'silence')) return false;
      if (!searchQuery.trim()) return true;
      return s.text.toLowerCase().includes(searchQuery.toLowerCase().trim());
    });
  }, [segments, hideSilences, searchQuery, viewMode]);

  // 格式化时间 00:00
  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 🌟 启动台词改字
  const handleStartEditSegment = (seg: CutSegment, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSegId(seg.id);
    setSegEditText(seg.text);
    setSplittingSegId(null);
  };

  // 🌟 保存台词改字
  const handleSaveSegmentText = (segId: string) => {
    const trimmed = segEditText.trim();
    if (!trimmed) {
      setEditingSegId(null);
      return;
    }
    const updated = segments.map((seg) => {
      if (seg.id !== segId) return seg;
      if (seg.text === trimmed) return seg;

      let newWords: WordItem[] | undefined = undefined;
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
        words: newWords || seg.words,
      };
    });
    pushUndoSnapshot();
    onUpdateSegments(updated);
    setEditingSegId(null);
    showToast('已更新字幕文本', 'ok');
  };

  // 🌟 在当前播放进度处切分当前句
  const handleSplitSegmentAtPlayhead = (seg: CutSegment, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const segIdx = segments.findIndex((s) => s.id === seg.id);
    if (segIdx === -1) return;

    let splitTime = currentTime;
    const dur = seg.endTime - seg.startTime;
    if (splitTime <= seg.startTime + 0.05 || splitTime >= seg.endTime - 0.05) {
      splitTime = seg.startTime + dur / 2;
    }

    let wordsA: WordItem[] | undefined = undefined;
    let wordsB: WordItem[] | undefined = undefined;
    let textA = '';
    let textB = '';

    if (seg.words && seg.words.length >= 2) {
      let bestSplitWordIdx = 0;
      let minDiff = Infinity;
      seg.words.forEach((w, idx) => {
        if (idx < seg.words!.length - 1) {
          const diff = Math.abs(w.endTime - splitTime);
          if (diff < minDiff) {
            minDiff = diff;
            bestSplitWordIdx = idx;
          }
        }
      });

      wordsA = seg.words.slice(0, bestSplitWordIdx + 1);
      wordsB = seg.words.slice(bestSplitWordIdx + 1);
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

    const updated = [...segments];
    updated.splice(segIdx, 1, segA, segB);
    pushUndoSnapshot();
    onUpdateSegments(updated);
    setSplittingSegId(null);
    showToast('已在当前播放进度处切分字幕', 'ok');
  };

  // 🌟 拆词切分 (点击词间切断)
  const handleSplitSegmentAtWord = (segId: string, wordIdx: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const segIdx = segments.findIndex((s) => s.id === segId);
    if (segIdx === -1) return;
    const seg = segments[segIdx];
    if (!seg.words || wordIdx < 0 || wordIdx >= seg.words.length - 1) return;

    const wordsA = seg.words.slice(0, wordIdx + 1);
    const wordsB = seg.words.slice(wordIdx + 1);
    const splitTime = wordsA[wordsA.length - 1].endTime;

    const segA: CutSegment = {
      ...seg,
      id: `${seg.id}_a_${Date.now()}`,
      endTime: splitTime,
      text: wordsA.map((w) => w.text).join(''),
      words: wordsA,
    };
    const segB: CutSegment = {
      ...seg,
      id: `${seg.id}_b_${Date.now() + 1}`,
      startTime: splitTime,
      text: wordsB.map((w) => w.text).join(''),
      words: wordsB,
    };

    const updated = [...segments];
    updated.splice(segIdx, 1, segA, segB);
    pushUndoSnapshot();
    onUpdateSegments(updated);
    setSplittingSegId(null);
    showToast('已在此处拆分为两句字幕', 'ok');
  };

  // 🌟 与下一句合并
  const handleMergeWithNext = (segId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const segIdx = segments.findIndex((s) => s.id === segId);
    if (segIdx === -1 || segIdx >= segments.length - 1) return;

    const segA = segments[segIdx];
    const segB = segments[segIdx + 1];

    const mergedSeg: CutSegment = {
      ...segA,
      id: `${segA.id}_m_${Date.now()}`,
      startTime: Math.min(segA.startTime, segB.startTime),
      endTime: Math.max(segA.endTime, segB.endTime),
      text: `${segA.text}${segA.text && segB.text && /[a-zA-Z0-9]$/.test(segA.text) ? ' ' : ''}${segB.text}`,
      words: segA.words && segB.words ? [...segA.words, ...segB.words] : undefined,
      type: segA.type === 'silence' && segB.type === 'silence' ? 'silence' : 'sentence',
      isDeleted: segA.isDeleted && segB.isDeleted,
      tagLabel: segA.tagLabel || segB.tagLabel,
    };

    const updated = [...segments];
    updated.splice(segIdx, 2, mergedSeg);
    pushUndoSnapshot();
    onUpdateSegments(updated);
    showToast('已将当前句与下一句合并', 'ok');
  };

  // 🌟 起止时间微调 (±0.1s)
  const handleAdjustSegmentTime = (segId: string, edge: 'start' | 'end', delta: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = segments.map((seg) => {
      if (seg.id !== segId) return seg;
      if (edge === 'start') {
        const newStart = Math.max(0, Number((seg.startTime + delta).toFixed(2)));
        if (newStart >= seg.endTime - 0.05) return seg;
        return { ...seg, startTime: newStart };
      } else {
        const newEnd = Number((seg.endTime + delta).toFixed(2));
        if (newEnd <= seg.startTime + 0.05) return seg;
        return { ...seg, endTime: newEnd };
      }
    });
    pushUndoSnapshot();
    onUpdateSegments(updated);
  };

  // 判断是否处于未转录就绪状态
  const isPendingTranscribe =
    !isTranscribing &&
    hasVideo &&
    (segments.length === 0 || (segments.length === 1 && segments[0].id === 'seg-init'));

  // 拖拽文件投放
  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.srt') || file.name.toLowerCase().endsWith('.vtt')) {
      onImportSrt?.(file);
    } else {
      onLoadVideoFile?.(file);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={handleContainerDrop}
      className={`h-full flex flex-col select-none overflow-hidden text-xs relative ${
        isDark ? 'bg-[#111218] text-zinc-200' : 'bg-white text-zinc-800'
      }`}
    >
      <input
        ref={localSrtInputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportSrt?.(file);
          e.target.value = '';
        }}
      />

      {/* 拖拽进入全区域光晕提示 */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-indigo-950/80 border-2 border-dashed border-indigo-400 backdrop-blur-xs flex flex-col items-center justify-center text-center p-6 pointer-events-none animate-in fade-in">
          <UploadCloud className="w-12 h-12 text-indigo-300 animate-bounce mb-2" />
          <div className="text-sm font-bold text-white">释放鼠标以载入文件</div>
          <div className="text-xs text-indigo-300 mt-1">支持音视频素材 (MP4/MOV/MP3) 或外部字幕 (SRT/VTT)</div>
        </div>
      )}

      {/* 顶部标题、数据概览与 AI 引擎状态栏 */}
      <div
        className={`p-3 border-b shrink-0 space-y-2.5 ${
          isDark ? 'bg-[#14151f] border-zinc-800/80' : 'bg-zinc-50 border-zinc-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center border border-indigo-500/30">
              <Scissors className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold">文稿剪辑</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* 🌟 提词器自动居中跟随开关 (纯图标 + Tooltip) */}
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                autoScroll
                  ? isDark
                    ? 'bg-indigo-950/60 text-indigo-300 border-indigo-500/40'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 border-zinc-700/60'
                  : 'text-zinc-600 hover:text-zinc-900 bg-white border-zinc-300'
              }`}
              title={autoScroll ? '自动跟随：开启中 (点击关闭)' : '锁定视窗 (点击开启自动跟随)'}
            >
              <LocateFixed className="w-3 h-3" />
            </button>

            {/* 🌟 撤销上一步操作 (Ctrl+Z) 按钮 */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                !canUndo
                  ? 'opacity-30 cursor-not-allowed text-zinc-500 border-transparent'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 border-zinc-700/60 hover:bg-zinc-700'
                  : 'text-zinc-600 hover:text-zinc-900 bg-white border-zinc-300 hover:bg-zinc-100 shadow-xs'
              }`}
              title={canUndo ? '撤销上一步操作 (Ctrl+Z)' : '无可撤销的操作'}
            >
              <Undo2 className="w-3 h-3" />
            </button>

            {/* 全部恢复按钮 (纯图标 + Tooltip) */}
            <button
              type="button"
              onClick={handleResetAll}
              disabled={segments.length === 0}
              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                segments.length === 0
                  ? 'opacity-40 cursor-not-allowed text-zinc-500 border-transparent'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 border-zinc-700/60 hover:bg-zinc-700'
                  : 'text-zinc-600 hover:text-zinc-900 bg-white border-zinc-300 hover:bg-zinc-100 shadow-xs'
              }`}
              title="恢复所有被切除内容"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 🌟 AI 语义分析引擎透明化胶囊 */}
        <div
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-[11px] ${
            activeEngine.isCloud
              ? isDark
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-zinc-400'
              : 'bg-white border-zinc-200 text-zinc-600'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                activeEngine.isCloud ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="truncate font-medium">
              引擎: <strong className={activeEngine.isCloud ? (isDark ? 'text-emerald-200' : 'text-emerald-900 font-bold') : ''}>{activeEngine.engineName.replace(/^云端大模型 AI \((.*)\)$/, '$1')}</strong>
            </span>
          </div>

          {onOpenModelHub && (
            <button
              type="button"
              onClick={onOpenModelHub}
              className={`shrink-0 p-1 rounded transition cursor-pointer ${
                activeEngine.isCloud
                  ? isDark
                    ? 'hover:bg-emerald-500/20 text-emerald-300'
                    : 'hover:bg-emerald-100 text-emerald-700'
                  : isDark
                  ? 'hover:bg-zinc-700/40 text-indigo-400 hover:text-indigo-300'
                  : 'hover:bg-zinc-100 text-indigo-600 hover:text-indigo-800'
              }`}
              title="配置 AI 大模型供应商与 Key"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 时长精简对比胶囊 */}
        <div
          className={`grid grid-cols-3 gap-1.5 p-2 rounded-xl border text-center font-mono ${
            isDark ? 'bg-zinc-900/90 border-zinc-800/80' : 'bg-white border-zinc-200 shadow-xs'
          }`}
        >
          <div>
            <div className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>原片</div>
            <div className="text-xs font-bold">{formatTime(totalDuration)}</div>
          </div>
          <div>
            <div className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>保留</div>
            <div className="text-xs font-bold text-emerald-500">{formatTime(preservedDuration)}</div>
          </div>
          <div>
            <div className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>浓缩</div>
            <div className="text-xs font-bold text-indigo-500">{condensedRatio}%</div>
          </div>
        </div>

        {/* 🌟 核心：AI 一键精剪 主按钮 */}
        <button
          type="button"
          onClick={handleMainAiCutClick}
          disabled={isTranscribing || (!hasVideo && segments.length === 0)}
          className={`w-full py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 shadow cursor-pointer text-xs ${
            isTranscribing
              ? isDark
                ? 'bg-zinc-800 text-zinc-400 border border-zinc-700/50 cursor-wait'
                : 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-wait'
              : !hasVideo && segments.length === 0
              ? isDark
                ? 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/30 cursor-not-allowed'
                : 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed'
              : isPendingTranscribe
              ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:brightness-110 text-white shadow-indigo-500/20 animate-pulse'
              : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-500/20'
          }`}
        >
          {isTranscribing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>识别提取中，请稍候…</span>
            </>
          ) : isPendingTranscribe ? (
            <>
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>⚡ 提取文稿并 AI 精剪</span>
            </>
          ) : (
            <>
              <Bot className="w-4 h-4 text-amber-300" />
              <span>⚡ AI 一键精剪</span>
            </>
          )}
        </button>

        {/* 🌟 搜索栏与双模视图切换胶囊 */}
        <div className="flex items-center gap-2 pt-0.5">
          {/* 搜索框 */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索台词或字词…"
              className={`w-full pl-8 pr-3 py-1 rounded-lg border text-xs focus:outline-hidden transition ${
                isDark
                  ? 'bg-zinc-900/90 border-zinc-800 focus:border-indigo-500 text-zinc-200 placeholder-zinc-500'
                  : 'bg-white border-zinc-200 focus:border-indigo-500 text-zinc-800 placeholder-zinc-400'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 🌟 双模切换：全览 vs 成片 */}
          <div
            className={`flex items-center p-0.5 rounded-lg border text-[11px] ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                viewMode === 'all'
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
              title="显示全部停顿、语气词与删除标记，支持微调"
            >
              全览
            </button>
            <button
              type="button"
              onClick={() => setViewMode('clean')}
              className={`px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1 ${
                viewMode === 'clean'
                  ? 'bg-emerald-600 text-white font-bold shadow-xs'
                  : isDark
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
              title="滤除已删内容，仅看最终成片台词"
            >
              <span>成片</span>
            </button>
          </div>
        </div>
      </div>

      {/* AI 方案预览与确认 Modal 抽屉 */}
      {showAiCutModal && (
        <div
          className={`p-3.5 border-b shrink-0 space-y-2.5 shadow-lg animate-in fade-in ${
            isDark
              ? 'bg-gradient-to-br from-indigo-950/95 to-purple-950/95 border-indigo-500/40 text-white'
              : 'bg-gradient-to-br from-indigo-50/95 to-purple-50/95 border-indigo-200 text-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                AI 智能精剪诊断方案已就绪
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAiCutModal(false)}
              className={`p-1 rounded cursor-pointer transition ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-400 hover:text-zinc-700'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 4 大维度诊断卡片 */}
          <div
            className={`p-2.5 rounded-xl border space-y-1.5 text-[11px] ${
              isDark ? 'bg-black/40 border-white/10' : 'bg-white border-indigo-100 shadow-xs'
            }`}
          >
            <div
              className={`flex items-center justify-between font-medium ${
                isDark ? 'text-zinc-300' : 'text-zinc-600'
              }`}
            >
              <span>智能识别诊断结果：</span>
              <span className={`text-[10px] ${isDark ? 'text-indigo-300' : 'text-indigo-600 font-medium'}`}>
                分析引擎: {activeEngine.engineName}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 font-mono text-[10.5px]">
              <div className={`p-1.5 rounded text-center border ${isDark ? 'bg-white/5 border-transparent' : 'bg-amber-50/50 border-amber-200/60'}`}>
                <span className={`block text-[9.5px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>停顿气口</span>
                <span className={`font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{detectedIssues.silencesCount} 处</span>
              </div>
              <div className={`p-1.5 rounded text-center border ${isDark ? 'bg-white/5 border-transparent' : 'bg-sky-50/50 border-sky-200/60'}`}>
                <span className={`block text-[9.5px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>口癖与杂音</span>
                <span className={`font-bold ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>{detectedIssues.fillersCount} 处</span>
              </div>
              <div className={`p-1.5 rounded text-center border ${isDark ? 'bg-white/5 border-transparent' : 'bg-orange-50/50 border-orange-200/60'}`}>
                <span className={`block text-[9.5px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>嘴瓢重录</span>
                <span className={`font-bold ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>{detectedIssues.stumblesCount} 组</span>
              </div>
              <div className={`p-1.5 rounded text-center border ${isDark ? 'bg-white/5 border-transparent' : 'bg-purple-50/50 border-purple-200/60'}`}>
                <span className={`block text-[9.5px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>跑题车轱辘</span>
                <span className={`font-bold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{detectedIssues.tangentsCount || '待精炼'}</span>
              </div>
            </div>
          </div>

          {/* 可选项列表 */}
          <div className="space-y-1.5 text-[11px]">
            <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-zinc-200' : 'text-zinc-700'}`}>
              <input
                type="checkbox"
                checked={aiCutOptions.cutSilence}
                onChange={(e) => setAiCutOptions({ ...aiCutOptions, cutSilence: e.target.checked })}
                className="rounded accent-indigo-500 cursor-pointer"
              />
              <span>切除停顿气口（保留 120ms 自然呼吸缓冲）</span>
            </label>
            <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-zinc-200' : 'text-zinc-700'}`}>
              <input
                type="checkbox"
                checked={aiCutOptions.cutFillers}
                onChange={(e) => setAiCutOptions({ ...aiCutOptions, cutFillers: e.target.checked })}
                className="rounded accent-indigo-500 cursor-pointer"
              />
              <span>剔除语气词与咳嗽拟声杂音（呃、啊、然后、咳咳等）</span>
            </label>
            <label className={`flex items-center gap-2 cursor-pointer ${isDark ? 'text-zinc-200' : 'text-zinc-700'}`}>
              <input
                type="checkbox"
                checked={aiCutOptions.cutStumbles}
                onChange={(e) => setAiCutOptions({ ...aiCutOptions, cutStumbles: e.target.checked })}
                className="rounded accent-indigo-500 cursor-pointer"
              />
              <span>剔除多轮重录前序嘴瓢（自动保留最后一遍完整录制）</span>
            </label>
            <div className={`pt-1 border-t space-y-1 ${isDark ? 'border-white/10' : 'border-indigo-100'}`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiCutOptions.cutNarrative}
                  onChange={(e) => setAiCutOptions({ ...aiCutOptions, cutNarrative: e.target.checked })}
                  className="rounded accent-purple-500 cursor-pointer"
                />
                <span className={`font-bold ${isDark ? 'text-purple-300' : 'text-purple-800'}`}>
                  🧠 深度文案内容分析（剔除冗余跑题，保留主干逻辑）
                </span>
              </label>
              {aiCutOptions.cutNarrative && (
                <div className="pl-5 pt-1 flex items-center gap-1.5">
                  <span className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>精炼强度:</span>
                  {(['balanced', 'viral', 'light'] as NarrativePreset[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedPreset(p)}
                      className={`px-2 py-0.5 rounded text-[10px] transition cursor-pointer ${
                        selectedPreset === p
                          ? 'bg-purple-600 text-white font-bold shadow-xs'
                          : isDark
                          ? 'bg-white/10 text-zinc-300 hover:bg-white/20'
                          : 'bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 shadow-xs'
                      }`}
                    >
                      {p === 'balanced' ? '紧凑高效 (推荐)' : p === 'viral' ? '爆款极速' : '轻度微调'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={`flex items-center justify-end gap-2 pt-1 border-t ${isDark ? 'border-white/10' : 'border-indigo-100'}`}>
            <button
              type="button"
              onClick={() => setShowAiCutModal(false)}
              className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer border ${
                isDark
                  ? 'bg-white/10 hover:bg-white/20 text-zinc-300 border-white/10'
                  : 'bg-white hover:bg-zinc-100 text-zinc-600 border-zinc-300 shadow-xs'
              }`}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmAiCut}
              className="px-3.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>确认应用精剪</span>
            </button>
          </div>
        </div>
      )}

      {/* 可交互文稿列表 */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar relative">
        {/* 🌟 1. 正在提取台词转录状态 (4 步可视化流水线步进器) */}
        {isTranscribing && (
          <div
            className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center space-y-4 m-2 shadow-sm animate-in fade-in ${
              isDark ? 'bg-indigo-950/30 border-indigo-500/40' : 'bg-indigo-50/70 border-indigo-200'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner ${
                isDark
                  ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40'
                  : 'bg-indigo-100 text-indigo-600 border-indigo-200'
              }`}
            >
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>

            <div className="space-y-1 w-full max-w-sm">
              <div className={`text-xs font-bold ${isDark ? 'text-indigo-200' : 'text-indigo-900'}`}>
                正在提取音视频台词与字级时间戳…
              </div>
              <div className={`text-[11px] font-mono ${isDark ? 'text-indigo-400' : 'text-indigo-700'}`}>
                {transcribeStage || '火山引擎 Seed-ASR 2.0 毫秒级识别与停顿对齐中…'}
              </div>
            </div>

            {/* 4 步可视化流程胶囊 */}
            <div className="w-full max-w-sm grid grid-cols-4 gap-1.5 text-[10px] font-mono">
              <div
                className={`p-1.5 rounded-lg border transition text-center ${
                  currentPipelineStep >= 1
                    ? isDark
                      ? 'bg-indigo-900/50 border-indigo-500/60 text-indigo-200 font-bold'
                      : 'bg-indigo-100 border-indigo-300 text-indigo-900 font-bold'
                    : isDark
                    ? 'bg-white/5 border-white/10 text-zinc-500'
                    : 'bg-white border-zinc-200 text-zinc-400'
                }`}
              >
                <div>🎵 音轨提取</div>
                <div className="text-[8.5px] opacity-75">{currentPipelineStep > 1 ? '已完成' : '进行中'}</div>
              </div>
              <div
                className={`p-1.5 rounded-lg border transition text-center ${
                  currentPipelineStep >= 2
                    ? isDark
                      ? 'bg-indigo-900/50 border-indigo-500/60 text-indigo-200 font-bold'
                      : 'bg-indigo-100 border-indigo-300 text-indigo-900 font-bold'
                    : isDark
                    ? 'bg-white/5 border-white/10 text-zinc-500'
                    : 'bg-white border-zinc-200 text-zinc-400'
                }`}
              >
                <div>☁️ 云端暂存</div>
                <div className="text-[8.5px] opacity-75">
                  {currentPipelineStep > 2 ? '已完成' : currentPipelineStep === 2 ? '进行中' : '等待'}
                </div>
              </div>
              <div
                className={`p-1.5 rounded-lg border transition text-center ${
                  currentPipelineStep >= 3
                    ? isDark
                      ? 'bg-indigo-900/50 border-indigo-500/60 text-indigo-200 font-bold'
                      : 'bg-indigo-100 border-indigo-300 text-indigo-900 font-bold'
                    : isDark
                    ? 'bg-white/5 border-white/10 text-zinc-500'
                    : 'bg-white border-zinc-200 text-zinc-400'
                }`}
              >
                <div>🤖 ASR 识别</div>
                <div className="text-[8.5px] opacity-75">
                  {currentPipelineStep > 3 ? '已完成' : currentPipelineStep === 3 ? '进行中' : '等待'}
                </div>
              </div>
              <div
                className={`p-1.5 rounded-lg border transition text-center ${
                  currentPipelineStep >= 4
                    ? isDark
                      ? 'bg-indigo-900/50 border-indigo-500/60 text-indigo-200 font-bold'
                      : 'bg-indigo-100 border-indigo-300 text-indigo-900 font-bold'
                    : isDark
                    ? 'bg-white/5 border-white/10 text-zinc-500'
                    : 'bg-white border-zinc-200 text-zinc-400'
                }`}
              >
                <div>⏱️ 停顿对齐</div>
                <div className="text-[8.5px] opacity-75">{currentPipelineStep === 4 ? '进行中' : '等待'}</div>
              </div>
            </div>

            <p className={`text-[10px] max-w-xs leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              转录完成后将为您直接呈现文稿卡片，右侧视频监视器保持可用。
            </p>
          </div>
        )}

        {/* 🌟 2. 转录异常报错诊断卡片 (保留现场，提供明确重试与替代方案) */}
        {!isTranscribing && transcribeError && (
          <div
            className={`p-4 rounded-2xl border flex flex-col items-center justify-center text-center space-y-3 m-2 animate-in fade-in ${
              isDark ? 'bg-rose-950/30 border-rose-500/40' : 'bg-rose-50 border-rose-200'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-inner ${
                isDark
                  ? 'bg-rose-600/20 text-rose-400 border-rose-500/30'
                  : 'bg-rose-100 text-rose-600 border-rose-200'
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <div className="space-y-1 max-w-sm">
              <div className={`text-xs font-bold ${isDark ? 'text-rose-200' : 'text-rose-900'}`}>
                台词提取遇到问题
              </div>
              <div className={`text-[11px] leading-relaxed font-mono ${isDark ? 'text-rose-300' : 'text-rose-800'}`}>
                {transcribeError}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
              {transcribeError.includes('API Key') && onGoSettings && (
                <button
                  type="button"
                  onClick={onGoSettings}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow flex items-center gap-1 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>前往「设置」配置 API Key</span>
                </button>
              )}

              {onTriggerTranscribe && (
                <button
                  type="button"
                  onClick={() => onTriggerTranscribe()}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1 cursor-pointer transition ${
                    isDark
                      ? 'bg-white/10 hover:bg-white/20 text-zinc-200 border-white/10'
                      : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-300 shadow-xs'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>重试提取</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => localSrtInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer shadow"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>导入本地字幕 (免跑 ASR)</span>
              </button>
            </div>
          </div>
        )}

        {/* 🌟 3. 视频已导入但尚未点击转录的状态 */}
        {!isTranscribing && !transcribeError && isPendingTranscribe && (
          <div
            className={`p-6 rounded-2xl border border-dashed flex flex-col items-center justify-center text-center space-y-3 m-2 ${
              isDark ? 'border-zinc-700/60 bg-zinc-900/30' : 'border-zinc-300 bg-zinc-50'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isDark
                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                  : 'bg-indigo-50 text-indigo-600 border-indigo-200'
              }`}
            >
              <FileText className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className={`text-xs font-bold ${isDark ? 'text-zinc-100' : 'text-zinc-800'}`}>
                视频素材已载入，等待提取文稿
              </div>
              <div className={`text-[11px] max-w-xs leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                点击上方「⚡ 提取文稿并 AI 精剪」即可开始语音识别与气口、语气词智能扫描。
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => localSrtInputRef.current?.click()}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                  isDark
                    ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                    : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700 shadow-xs'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <span>导入 SRT 字幕</span>
              </button>
            </div>
          </div>
        )}

        {/* 🌟 4. 未导入素材时的空白初始大面积投放区 (Drop Zone Hero) */}
        {!isTranscribing && !transcribeError && !hasVideo && segments.length === 0 && (
          <div
            className={`p-8 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center text-center space-y-4 m-2 transition ${
              isDark
                ? 'border-zinc-700/60 hover:border-indigo-500/60 bg-zinc-900/20'
                : 'border-zinc-300 hover:border-indigo-400 bg-zinc-50/60'
            }`}
          >
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner ${
                isDark
                  ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/30'
                  : 'bg-indigo-50 text-indigo-600 border-indigo-200'
              }`}
            >
              <UploadCloud className="w-7 h-7" />
            </div>

            <div className="space-y-1 max-w-xs">
              <div className={`text-sm font-bold ${isDark ? 'text-zinc-100' : 'text-zinc-800'}`}>
                拖入口播视频开始智能精剪
              </div>
              <div className={`text-xs leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                自动识别气口停顿、口癖语气词与重录废话，双击删字，鼠标划选批量切除。
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
              {onPickMediaFile && (
                <button
                  type="button"
                  onClick={onPickMediaFile}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>选择本地音视频文件</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => localSrtInputRef.current?.click()}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                  isDark
                    ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                    : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700 shadow-xs'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <span>导入 SRT 字幕</span>
              </button>

              {onLoadDemo && (
                <button
                  type="button"
                  onClick={onLoadDemo}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
                    isDark
                      ? 'bg-indigo-950/40 hover:bg-indigo-900/60 border-indigo-500/30 text-indigo-300'
                      : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700 shadow-xs'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>体验爆款示例</span>
                </button>
              )}
            </div>

            {/* 格式标签 */}
            <div className={`flex items-center gap-1 text-[10px] font-mono pt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              <span>支持格式:</span>
              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-zinc-200/80 border-zinc-300 text-zinc-600'}`}>MP4</span>
              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-zinc-200/80 border-zinc-300 text-zinc-600'}`}>MOV</span>
              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-zinc-200/80 border-zinc-300 text-zinc-600'}`}>MKV</span>
              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-zinc-200/80 border-zinc-300 text-zinc-600'}`}>MP3</span>
              <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-zinc-200/80 border-zinc-300 text-zinc-600'}`}>SRT</span>
            </div>
          </div>
        )}

        {/* 🌟 5. 成片模式文稿顶栏 (一键复制最终成片干净文本) */}
        {viewMode === 'clean' && filteredSegments.length > 0 && (
          <div
            className={`p-2 px-3 rounded-xl border flex items-center justify-between text-xs mb-2 ${
              isDark
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 shadow-xs'
            }`}
          >
            <span className="flex items-center gap-1 font-medium">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span>当前为成片台词预览模式（已隐去全部切除废片）</span>
            </span>
            <button
              type="button"
              onClick={handleCopyCleanText}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10.5px] flex items-center gap-1 shadow cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              <span>复制成片文稿</span>
            </button>
          </div>
        )}

        {/* 🌟 6. 正常切片渲染列表 */}
        {!isTranscribing &&
          !transcribeError &&
          !isPendingTranscribe &&
          filteredSegments.length > 0 &&
          filteredSegments.map((seg) => {
            const isCurrent = currentTime >= seg.startTime && currentTime <= seg.endTime;
            const isSilence =
              seg.type === 'silence' ||
              seg.deleteReason === 'silence' ||
              seg.tagLabel?.includes('气口') ||
              seg.tagLabel?.includes('停顿') ||
              seg.id.startsWith('silence-');

            // 停顿气口条目
            if (isSilence) {
              return (
                <div
                  key={seg.id}
                  onClick={(e) => toggleSegmentDeleted(seg.id, e)}
                  data-is-active={isCurrent ? 'true' : 'false'}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-mono cursor-pointer transition border ${
                    seg.isDeleted
                      ? isDark
                        ? 'bg-zinc-900/30 border-zinc-800/50 text-zinc-500'
                        : 'bg-zinc-100 border-zinc-200 text-zinc-400'
                      : isDark
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
                  }`}
                  title="点击切换：切除或保留该自然呼吸停顿"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    <span>{seg.text}</span>
                  </span>
                  <span className="text-[9.5px] font-bold">
                    {seg.isDeleted ? '⚡ 已切除 (跳过)' : '保留'}
                  </span>
                </div>
              );
            }

            // 句子主体 (内部包含字词级切片与划选交互)
            const isSegSelectedByDrag = dragSelection && dragSelection.segId === seg.id;

            return (
              <div
                key={seg.id}
                onClick={() => onSeek(seg.startTime)}
                data-is-active={isCurrent ? 'true' : 'false'}
                className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                  isCurrent
                    ? isDark
                      ? 'border-indigo-500 ring-1 ring-indigo-500/40 shadow-sm bg-indigo-950/20'
                      : 'border-indigo-500 ring-1 ring-indigo-500/30 shadow-xs bg-indigo-50/40'
                    : seg.isDeleted
                    ? isDark
                      ? 'border-zinc-900 bg-zinc-950/40 opacity-60'
                      : 'border-zinc-200 bg-zinc-100 opacity-65'
                    : isDark
                    ? 'border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-800/60'
                    : 'bg-white border-zinc-200 hover:border-indigo-300 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex-1 min-w-0">
                    {/* 标签提示：嘴瓢重录分组 / 跑题 / 语气词 */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {seg.tagLabel && (
                        <span
                          className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono font-medium ${
                            seg.tagLabel.includes('保留')
                              ? isDark
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : seg.tagLabel.includes('重录')
                              ? isDark
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                : 'bg-orange-50 text-orange-700 border border-orange-200'
                              : seg.tagLabel.includes('车轱辘') || seg.tagLabel.includes('冗余')
                              ? isDark
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                              : seg.tagLabel.includes('语气词') || seg.tagLabel.includes('杂音')
                              ? isDark
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                : 'bg-sky-50 text-sky-700 border border-sky-200'
                              : isDark
                              ? 'bg-zinc-700/40 text-zinc-300'
                              : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                          }`}
                        >
                          {seg.tagLabel}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-indigo-500 text-white font-bold flex items-center gap-1 animate-pulse">
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>正在播放</span>
                        </span>
                      )}
                    </div>

                    {/* 🌟 文本内容：支持在位改字、字词级别双击单字删除、鼠标拖拽划选连续字切除、词间切断 */}
                    {editingSegId === seg.id ? (
                      <div
                        className="space-y-1.5 my-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <textarea
                          value={segEditText}
                          onChange={(e) => setSegEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveSegmentText(seg.id);
                            } else if (e.key === 'Escape') {
                              setEditingSegId(null);
                            }
                          }}
                          rows={2}
                          className={`w-full p-2 text-xs rounded-lg border focus:outline-none transition resize-none ${
                            isDark
                              ? 'bg-zinc-950 border-indigo-500/80 text-white focus:ring-1 focus:ring-indigo-500'
                              : 'bg-white border-indigo-400 text-zinc-900 focus:ring-1 focus:ring-indigo-500 shadow-inner'
                          }`}
                          placeholder="修改字幕台词..."
                          autoFocus
                        />
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500">按 Enter 保存，Esc 取消</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingSegId(null)}
                              className="px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-200 cursor-pointer shrink-0 whitespace-nowrap"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveSegmentText(seg.id)}
                              className="px-2.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer shrink-0 whitespace-nowrap"
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* 🌟 切分模式提示栏 */}
                        {splittingSegId === seg.id && (
                          <div
                            className={`my-1.5 p-1.5 px-2 rounded-lg border text-[10.5px] flex items-center justify-between gap-2 ${
                              isDark
                                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="flex items-center gap-1 shrink-0 whitespace-nowrap font-medium">
                              <Scissors className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>点击字词间剪刀拆分，或：</span>
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => handleSplitSegmentAtPlayhead(seg, e)}
                                className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] cursor-pointer shrink-0 whitespace-nowrap shadow-xs"
                              >
                                在当前播放进度处切断
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSplittingSegId(null);
                                }}
                                className="p-0.5 hover:text-zinc-200 cursor-pointer shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="text-xs leading-relaxed tracking-wide select-text">
                          {seg.words && seg.words.length > 0 ? (
                            seg.words.map((w, wIdx) => {
                              const isWordSelected =
                                isSegSelectedByDrag &&
                                wIdx >= dragSelection.startIdx &&
                                wIdx <= dragSelection.endIdx;

                              // 在成片台词模式下，过滤已被切除的字
                              if (viewMode === 'clean' && (seg.isDeleted || w.isDeleted)) {
                                return null;
                              }

                              return (
                                <React.Fragment key={wIdx}>
                                  <span
                                    onMouseDown={(e) => handleWordMouseDown(seg.id, wIdx, e)}
                                    onMouseEnter={() => handleWordMouseEnter(seg.id, wIdx)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSeek(w.startTime);
                                    }}
                                    onDoubleClick={(e) => toggleWordDeleted(seg.id, wIdx, e)}
                                    className={`inline-block px-0.5 rounded transition cursor-pointer ${
                                      isWordSelected
                                        ? 'bg-indigo-600 text-white font-bold'
                                        : seg.isDeleted || w.isDeleted
                                        ? isDark
                                          ? 'line-through opacity-40 text-rose-400 bg-rose-950/20 hover:opacity-80'
                                          : 'line-through opacity-50 text-rose-600 bg-rose-50 hover:opacity-80'
                                        : isCurrent
                                        ? isDark
                                          ? 'hover:bg-indigo-500/30 text-indigo-200'
                                          : 'hover:bg-indigo-100 text-indigo-700 font-semibold'
                                        : isDark
                                        ? 'hover:bg-indigo-500/20'
                                        : 'hover:bg-indigo-50'
                                    }`}
                                    title="单击: 定位播放 / 双击: 切除或恢复此字"
                                  >
                                    {w.text}
                                  </span>

                                  {/* 切分模式下的字间切分微按钮 */}
                                  {splittingSegId === seg.id && wIdx < seg.words!.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleSplitSegmentAtWord(seg.id, wIdx, e)}
                                      className="inline-flex items-center justify-center px-1 py-0.2 mx-0.5 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-400 hover:text-white transition text-[9px] font-mono cursor-pointer shrink-0"
                                      title={`在此处拆分为两句（切点: ${w.text} 之后）`}
                                    >
                                      ✂️
                                    </button>
                                  )}
                                </React.Fragment>
                              );
                            })
                          ) : (
                            <span
                              className={`${
                                seg.isDeleted
                                  ? isDark
                                    ? 'line-through opacity-50 text-zinc-400'
                                    : 'line-through opacity-50 text-zinc-500'
                                  : ''
                              }`}
                            >
                              {seg.text}
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {/* 🌟 划选后浮动快捷操作胶囊 */}
                    {isSegSelectedByDrag && dragSelection.endIdx >= dragSelection.startIdx && (
                      <div
                        className={`mt-2 inline-flex items-center gap-1.5 p-1 px-2 rounded-lg border shadow-lg text-[10.5px] animate-in fade-in shrink-0 whitespace-nowrap ${
                          isDark ? 'bg-indigo-900/95 border-indigo-400/80 text-white' : 'bg-indigo-700 border-indigo-600 text-white'
                        }`}
                      >
                        <span className="font-bold text-white mr-1 shrink-0 whitespace-nowrap">
                          已划选 {dragSelection.endIdx - dragSelection.startIdx + 1} 字:
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            batchDeleteWords(seg.id, dragSelection.startIdx, dragSelection.endIdx, true);
                            setDragSelection(null);
                          }}
                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>切除所选</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            batchDeleteWords(seg.id, dragSelection.startIdx, dragSelection.endIdx, false);
                            setDragSelection(null);
                          }}
                          className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>恢复</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDragSelection(null);
                          }}
                          className="p-0.5 hover:text-white/70 ml-1 text-white/60 cursor-pointer shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* 🌟 AI 删减理由卡片 */}
                    {seg.isDeleted && (
                      <div
                        className={`mt-2 p-2 rounded-lg border text-[10.5px] flex items-start gap-1.5 ${
                          isDark
                            ? 'bg-indigo-950/30 border-indigo-500/20 text-indigo-200'
                            : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
                        }`}
                      >
                        <Lightbulb
                          className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                            isDark ? 'text-amber-400' : 'text-amber-600'
                          }`}
                        />
                        <div className="leading-snug">
                          <span
                            className={`font-bold mr-1 ${
                              isDark ? 'text-amber-300' : 'text-amber-700'
                            }`}
                          >
                            AI 删减理由:
                          </span>
                          <span>
                            {seg.reasonDetail ||
                              (seg.deleteReason === 'silence'
                                ? '声学空白停顿，切除后节奏更紧凑'
                                : seg.deleteReason === 'stumble'
                                ? '多轮录制嘴瓢忘词，系统已自动保留最后完整一遍'
                                : seg.deleteReason === 'filler'
                                ? '口癖语气词/杂音，剔除以增强表达'
                                : seg.tagLabel || '智能精炼冗余文案')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 🌟 卡片快捷操作微工具栏 (防挤压 shrink-0 whitespace-nowrap) */}
                  <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                    {/* ✏️ 改字按钮 */}
                    <button
                      type="button"
                      onClick={(e) => handleStartEditSegment(seg, e)}
                      className={`p-1.5 rounded-lg transition shrink-0 cursor-pointer ${
                        editingSegId === seg.id
                          ? 'text-white bg-indigo-600'
                          : isDark
                          ? 'text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800'
                          : 'text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100'
                      }`}
                      title="修改当前字幕文字"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {/* ✂️ 切分模式按钮 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSplittingSegId(splittingSegId === seg.id ? null : seg.id);
                      }}
                      className={`p-1.5 rounded-lg transition shrink-0 cursor-pointer ${
                        splittingSegId === seg.id
                          ? 'text-white bg-amber-600 shadow'
                          : isDark
                          ? 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800'
                          : 'text-zinc-500 hover:text-amber-600 hover:bg-zinc-100'
                      }`}
                      title="切分字幕：拆词或在当前播放进度切断"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </button>

                    {/* 🔗 与下一句合并按钮 */}
                    {filteredSegments.findIndex((s) => s.id === seg.id) < filteredSegments.length - 1 && (
                      <button
                        type="button"
                        onClick={(e) => handleMergeWithNext(seg.id, e)}
                        className={`p-1.5 rounded-lg transition shrink-0 cursor-pointer ${
                          isDark
                            ? 'text-zinc-400 hover:text-sky-300 hover:bg-zinc-800'
                            : 'text-zinc-500 hover:text-sky-600 hover:bg-zinc-100'
                        }`}
                        title="将本句与下一句合并为一条字幕"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* 整句快捷切除 / 恢复按钮 */}
                    <button
                      type="button"
                      onClick={(e) => toggleSegmentDeleted(seg.id, e)}
                      className={`p-1.5 rounded-lg transition shrink-0 cursor-pointer ${
                        seg.isDeleted
                          ? 'text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20'
                          : 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/20'
                      }`}
                      title={seg.isDeleted ? '恢复整句' : '切除整句'}
                    >
                      {seg.isDeleted ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* 🌟 底部时间戳与起止毫秒微调栏 (绝对防挤压 shrink-0 whitespace-nowrap) */}
                <div
                  className={`flex items-center justify-between text-[9px] font-mono mt-2 pt-1 border-t shrink-0 whitespace-nowrap ${
                    isDark ? 'border-zinc-800/60 text-zinc-400' : 'border-zinc-100 text-zinc-500'
                  }`}
                >
                  {/* 起点微调 */}
                  <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <span className="opacity-60">起:</span>
                    <button
                      type="button"
                      onClick={(e) => handleAdjustSegmentTime(seg.id, 'start', -0.1, e)}
                      className="px-1 py-0.2 rounded hover:bg-indigo-500/20 hover:text-indigo-300 transition cursor-pointer"
                      title="起点提前 0.1s"
                    >
                      -0.1s
                    </button>
                    <span className="font-bold text-indigo-400">
                      {formatTime(seg.startTime)}.{String(Math.floor((seg.startTime % 1) * 10)).padStart(1, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleAdjustSegmentTime(seg.id, 'start', 0.1, e)}
                      className="px-1 py-0.2 rounded hover:bg-indigo-500/20 hover:text-indigo-300 transition cursor-pointer"
                      title="起点延后 0.1s"
                    >
                      +0.1s
                    </button>
                  </div>

                  {/* 终点微调 */}
                  <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <span className="opacity-60">止:</span>
                    <button
                      type="button"
                      onClick={(e) => handleAdjustSegmentTime(seg.id, 'end', -0.1, e)}
                      className="px-1 py-0.2 rounded hover:bg-indigo-500/20 hover:text-indigo-300 transition cursor-pointer"
                      title="终点提前 0.1s"
                    >
                      -0.1s
                    </button>
                    <span className="font-bold text-indigo-400">
                      {formatTime(seg.endTime)}.{String(Math.floor((seg.endTime % 1) * 10)).padStart(1, '0')}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleAdjustSegmentTime(seg.id, 'end', 0.1, e)}
                      className="px-1 py-0.2 rounded hover:bg-indigo-500/20 hover:text-indigo-300 transition cursor-pointer"
                      title="终点延后 0.1s"
                    >
                      +0.1s
                    </button>
                    <span className="opacity-60 ml-1 shrink-0">
                      ({(seg.endTime - seg.startTime).toFixed(1)}s)
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default TranscriptCutter;
