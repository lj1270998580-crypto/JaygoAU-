import React, { useState, useMemo } from 'react';
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
  CheckSquare,
  Square,
  X,
  Bot,
} from 'lucide-react';
import type { CutSegment, NarrativePreset, NarrativeAnalysisResult, WordItem } from '../../lib/talkEditor/types';
import { useStore } from '../../store';

interface TranscriptCutterProps {
  segments: CutSegment[];
  onUpdateSegments: (newSegments: CutSegment[]) => void;
  currentTime: number;
  onSeek: (timeSec: number) => void;
  onRunSilenceCut: () => void;
  onRunFillerClean: () => void;
  onRunStumbleClean: () => void;
  onRunNarrativePruning: (preset: NarrativePreset) => Promise<void>;
  isAnalyzingNarrative: boolean;
  narrativeAnalysis: NarrativeAnalysisResult | null;
  onApplyFullAiCut: (options: { cutSilence: boolean; cutFillers: boolean; cutStumbles: boolean }) => void;
}

export const TranscriptCutter: React.FC<TranscriptCutterProps> = ({
  segments,
  onUpdateSegments,
  currentTime,
  onSeek,
  onRunSilenceCut,
  onRunFillerClean,
  onRunStumbleClean,
  onRunNarrativePruning,
  isAnalyzingNarrative,
  narrativeAnalysis,
  onApplyFullAiCut,
}) => {
  const { theme } = useStore();
  const isDark = theme !== 'light';

  const [selectedPreset, setSelectedPreset] = useState<NarrativePreset>('balanced');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hideSilences, setHideSilences] = useState<boolean>(false);

  // AI 一键全自动精剪预览弹窗
  const [showAiCutModal, setShowAiCutModal] = useState<boolean>(false);
  const [aiCutOptions, setAiCutOptions] = useState({
    cutSilence: true,
    cutFillers: true,
    cutStumbles: true,
  });

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

    for (const s of segments) {
      if (s.deleteReason === 'silence' || s.tagLabel?.includes('气口')) {
        silencesCount++;
        silenceSec += s.endTime - s.startTime;
      }
      if (s.deleteReason === 'filler' || s.tagLabel?.includes('语气词')) {
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
    }

    return { silencesCount, silenceSec, fillersCount, stumblesCount };
  }, [segments]);

  // 切换单条切片的删除状态
  const toggleSegmentDeleted = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onUpdateSegments(
      segments.map((s) => {
        if (s.id !== id) return s;
        const willDelete = !s.isDeleted;
        return {
          ...s,
          isDeleted: willDelete,
          deleteReason: willDelete ? (s.deleteReason || 'manual') : undefined,
          // 同时同步字级别状态
          words: s.words?.map((w) => ({ ...w, isDeleted: willDelete })),
        };
      })
    );
  };

  // 切换单个字的删除状态 (🌟 字级别剪辑核心)
  const toggleWordDeleted = (segId: string, wordId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateSegments(
      segments.map((seg) => {
        if (seg.id !== segId || !seg.words) return seg;
        const updatedWords: WordItem[] = seg.words.map((w) =>
          w.id === wordId
            ? { ...w, isDeleted: !w.isDeleted, deleteReason: !w.isDeleted ? ('manual' as const) : undefined }
            : w
        );
        // 如果整句的所有字都被删除了，顺带把整句标为 deleted
        const allWordsDeleted = updatedWords.every((w) => w.isDeleted);
        return {
          ...seg,
          words: updatedWords,
          isDeleted: allWordsDeleted,
        };
      })
    );
  };

  // 恢复所有删除标记
  const handleResetAll = () => {
    onUpdateSegments(
      segments.map((s) => ({
        ...s,
        isDeleted: false,
        deleteReason: undefined,
        tagLabel: undefined,
        words: s.words?.map((w) => ({ ...w, isDeleted: false, deleteReason: undefined })),
      }))
    );
  };

  // 执行 AI 一键精剪确认
  const handleConfirmAiCut = () => {
    onApplyFullAiCut(aiCutOptions);
    setShowAiCutModal(false);
  };

  // 过滤后的切片列表
  const filteredSegments = useMemo(() => {
    return segments.filter((s) => {
      if (hideSilences && s.deleteReason === 'silence') return false;
      if (!searchQuery.trim()) return true;
      return s.text.toLowerCase().includes(searchQuery.toLowerCase().trim());
    });
  }, [segments, hideSilences, searchQuery]);

  // 格式化时间 00:00
  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      className={`h-full flex flex-col border-r select-none overflow-hidden text-xs ${
        isDark ? 'bg-[#111218] border-zinc-800/80 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-800'
      }`}
    >
      {/* 顶部标题与数据概览 */}
      <div
        className={`p-3.5 border-b shrink-0 space-y-3 ${
          isDark ? 'bg-[#14151f] border-zinc-800/80' : 'bg-zinc-50 border-zinc-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-500 flex items-center justify-center border border-indigo-500/30">
              <Scissors className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold">台词与文案智能剪辑</span>
          </div>

          <button
            type="button"
            onClick={handleResetAll}
            className={`text-[10px] px-2 py-0.5 rounded-md border transition flex items-center gap-1 cursor-pointer ${
              isDark
                ? 'text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 border-zinc-700/60 hover:bg-zinc-700'
                : 'text-zinc-600 hover:text-zinc-900 bg-white border-zinc-300 hover:bg-zinc-100 shadow-xs'
            }`}
            title="撤销所有删除标记，恢复原片状态"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>全部恢复</span>
          </button>
        </div>

        {/* 时长精简对比胶囊 */}
        <div
          className={`grid grid-cols-3 gap-1.5 p-2 rounded-xl border text-center font-mono ${
            isDark ? 'bg-zinc-900/90 border-zinc-800/80' : 'bg-white border-zinc-200 shadow-xs'
          }`}
        >
          <div>
            <div className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>原片时长</div>
            <div className="text-xs font-bold">{formatTime(totalDuration)}</div>
          </div>
          <div>
            <div className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>精剪保留</div>
            <div className="text-xs font-bold text-emerald-500">{formatTime(preservedDuration)}</div>
          </div>
          <div>
            <div className={`text-[9px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>浓缩比</div>
            <div className="text-xs font-bold text-indigo-500">{condensedRatio}%</div>
          </div>
        </div>

        {/* 🌟 核心：AI 一键全自动精剪 主按钮 (带方案预览弹窗) */}
        <button
          type="button"
          onClick={() => setShowAiCutModal(true)}
          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Bot className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>🤖 AI 一键全自动精剪 (预览后应用)</span>
        </button>

        {/* 4 大单项细切操作组 */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onRunSilenceCut}
            className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs ${
              isDark
                ? 'bg-zinc-800/90 hover:bg-zinc-700 border-zinc-700/60 text-zinc-200'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
            title="自动识别语音停顿并施加 120ms 自然呼吸缓冲保护"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>⚡ 一键去气口</span>
          </button>

          <button
            type="button"
            onClick={onRunFillerClean}
            className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs ${
              isDark
                ? 'bg-zinc-800/90 hover:bg-zinc-700 border-zinc-700/60 text-zinc-200'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
            title="一键标记并剔除语气词（呃、啊、然后、就是说）"
          >
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            <span>🧹 清语气词</span>
          </button>

          <button
            type="button"
            onClick={onRunStumbleClean}
            className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs ${
              isDark
                ? 'bg-zinc-800/90 hover:bg-zinc-700 border-zinc-700/60 text-zinc-200'
                : 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-700'
            }`}
            title="启发式识别相邻忘词嘴瓢，自动分组并保留最后一次完整录制"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            <span>🎯 剔除嘴瓢重录</span>
          </button>

          <button
            type="button"
            onClick={() => onRunNarrativePruning(selectedPreset)}
            disabled={isAnalyzingNarrative}
            className="py-1.5 px-2 rounded-lg bg-gradient-to-r from-purple-900/70 to-indigo-900/70 hover:from-purple-800 hover:to-indigo-800 border border-purple-500/40 text-white text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-xs disabled:opacity-50"
            title="大模型宏观分析篇章主线，剔除跑题冗余，保全逻辑完整"
          >
            <BrainCircuit className={`w-3.5 h-3.5 text-purple-300 ${isAnalyzingNarrative ? 'animate-spin' : ''}`} />
            <span>{isAnalyzingNarrative ? '分析中…' : '🧠 AI 叙事精炼'}</span>
          </button>
        </div>

        {/* 快速搜索与气口过滤控制条 */}
        <div className={`flex items-center gap-2 pt-1 border-t ${isDark ? 'border-zinc-800/60' : 'border-zinc-200'}`}>
          <div className="relative flex-1">
            <Search className={`w-3 h-3 absolute left-2.5 top-2 pointer-events-none ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索台词文字快速定位..."
              className={`w-full pl-7 pr-2 py-1 rounded-md border text-[11px] focus:outline-none focus:border-indigo-500 ${
                isDark
                  ? 'bg-zinc-950 border-zinc-800 text-zinc-200 placeholder:text-zinc-600'
                  : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => setHideSilences(!hideSilences)}
            className={`px-2 py-1 rounded-md text-[10px] font-medium border transition cursor-pointer shrink-0 ${
              hideSilences
                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-500/50'
                : isDark
                ? 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                : 'bg-white text-zinc-600 border-zinc-300 hover:bg-zinc-100'
            }`}
            title="点击切换：在列表中隐藏或展示停顿间隙"
          >
            {hideSilences ? '已隐藏气口' : '显示气口'}
          </button>
        </div>
      </div>

      {/* AI 方案预览与确认 Modal 抽屉 */}
      {showAiCutModal && (
        <div className="p-3.5 bg-gradient-to-br from-indigo-950/90 to-purple-950/90 border-b border-indigo-500/40 text-white shrink-0 space-y-2.5 shadow-lg animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span className="font-bold text-xs text-white">AI 智能剪辑方案已就绪</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAiCutModal(false)}
              className="p-1 text-zinc-400 hover:text-white rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2.5 bg-black/40 rounded-xl border border-white/10 space-y-1.5 text-[11px]">
            <div className="text-zinc-300 font-medium">智能识别诊断结果：</div>
            <div className="grid grid-cols-3 gap-2 font-mono text-[10.5px]">
              <div className="bg-white/5 p-1.5 rounded">
                <span className="text-zinc-400 block">停顿气口</span>
                <span className="font-bold text-amber-300">{detectedIssues.silencesCount} 处</span>
              </div>
              <div className="bg-white/5 p-1.5 rounded">
                <span className="text-zinc-400 block">口癖语气词</span>
                <span className="font-bold text-sky-300">{detectedIssues.fillersCount} 处</span>
              </div>
              <div className="bg-white/5 p-1.5 rounded">
                <span className="text-zinc-400 block">嘴瓢重录</span>
                <span className="font-bold text-orange-300">{detectedIssues.stumblesCount} 组</span>
              </div>
            </div>
          </div>

          <div className="space-y-1 text-[11px]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={aiCutOptions.cutSilence}
                onChange={(e) => setAiCutOptions({ ...aiCutOptions, cutSilence: e.target.checked })}
                className="rounded accent-indigo-500"
              />
              <span>切除 ≥0.4s 冗长气口（保留 120ms 自然呼吸）</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={aiCutOptions.cutFillers}
                onChange={(e) => setAiCutOptions({ ...aiCutOptions, cutFillers: e.target.checked })}
                className="rounded accent-indigo-500"
              />
              <span>剔除语气词（呃、啊、然后、就是说）</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={aiCutOptions.cutStumbles}
                onChange={(e) => setAiCutOptions({ ...aiCutOptions, cutStumbles: e.target.checked })}
                className="rounded accent-indigo-500"
              />
              <span>剔除多轮重录前序嘴瓢（保留最佳版本）</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowAiCutModal(false)}
              className="px-3 py-1 rounded-lg text-xs bg-white/10 hover:bg-white/20 text-zinc-300"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmAiCut}
              className="px-3.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>确认应用精剪</span>
            </button>
          </div>
        </div>
      )}

      {/* 可交互文稿列表 (Word 式字词级精确切除与高亮) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {filteredSegments.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-zinc-500 text-xs gap-2 text-center p-4">
            <FileText className="w-8 h-8 text-zinc-400" />
            <span>暂无文稿，请上传视频后自动提取台词</span>
          </div>
        ) : (
          filteredSegments.map((seg) => {
            const isCurrent = currentTime >= seg.startTime && currentTime <= seg.endTime;
            const isSilence = seg.deleteReason === 'silence' || seg.tagLabel?.includes('气口');

            // 停顿气口条目
            if (isSilence) {
              return (
                <div
                  key={seg.id}
                  onClick={(e) => toggleSegmentDeleted(seg.id, e)}
                  className={`flex items-center justify-between px-3 py-1 rounded-md text-[10px] font-mono cursor-pointer transition border ${
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

            // 句子主体 (内部包含字词级切片)
            return (
              <div
                key={seg.id}
                onClick={() => onSeek(seg.startTime)}
                className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                  isCurrent
                    ? 'border-indigo-500 ring-1 ring-indigo-500/40 shadow-sm'
                    : seg.isDeleted
                    ? isDark
                      ? 'border-zinc-900 bg-zinc-950/40 opacity-55'
                      : 'border-zinc-200 bg-zinc-100 opacity-60'
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
                          className={`inline-block text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                            seg.deleteReason === 'stumble'
                              ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                              : seg.deleteReason === 'narrative_tangent'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                              : seg.deleteReason === 'filler'
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                              : 'bg-zinc-500/10 text-zinc-400'
                          }`}
                        >
                          {seg.tagLabel}
                        </span>
                      )}

                      {seg.takeGroup && (
                        <span className="text-[9px] text-zinc-400 font-mono">
                          (重录第 {seg.takeIndex} 遍)
                        </span>
                      )}
                    </div>

                    {/* 🌟 字词级高灵敏交互 (Word / Character Tokens) */}
                    <div className="leading-relaxed flex flex-wrap gap-x-0.5 gap-y-1">
                      {seg.words && seg.words.length > 0 ? (
                        seg.words.map((word) => {
                          const isWordActive = currentTime >= word.startTime && currentTime <= word.endTime;
                          const isWordDel = word.isDeleted || seg.isDeleted;

                          return (
                            <span
                              key={word.id}
                              onClick={(e) => toggleWordDeleted(seg.id, word.id, e)}
                              className={`px-1 py-0.2 rounded transition cursor-pointer text-xs ${
                                isWordDel
                                  ? 'line-through text-rose-500 bg-rose-500/10 decoration-rose-500'
                                  : isWordActive
                                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                                  : isDark
                                  ? 'hover:bg-zinc-800 text-zinc-200 hover:text-white'
                                  : 'hover:bg-zinc-100 text-zinc-800'
                              }`}
                              title={`点击单独切除/保留此字词 (${word.startTime.toFixed(2)}s ~ ${word.endTime.toFixed(2)}s)`}
                            >
                              {word.text}
                            </span>
                          );
                        })
                      ) : (
                        <p
                          className={`text-xs leading-relaxed ${
                            seg.isDeleted ? 'line-through text-zinc-400 decoration-zinc-400' : ''
                          }`}
                        >
                          {seg.text}
                        </p>
                      )}
                    </div>
                  </div>

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

                {/* 底部时间戳与操作提示 */}
                <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 mt-2">
                  <span>
                    {formatTime(seg.startTime)}.{String(Math.floor((seg.startTime % 1) * 10)).padStart(1, '0')} ~{' '}
                    {formatTime(seg.endTime)}.{String(Math.floor((seg.endTime % 1) * 10)).padStart(1, '0')}
                  </span>
                  <span>
                    {(seg.endTime - seg.startTime).toFixed(1)}s
                    {seg.words?.some((w) => w.isDeleted) && (
                      <span className="text-rose-500 ml-1.5 font-bold">
                        (含单个删字)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TranscriptCutter;
