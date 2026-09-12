import React, { useState } from 'react';
import {
  Scissors,
  Sparkles,
  Zap,
  RotateCcw,
  Volume2,
  Trash2,
  AlertTriangle,
  FileText,
  ChevronDown,
  BrainCircuit,
  Check,
} from 'lucide-react';
import type { CutSegment, NarrativePreset, NarrativeAnalysisResult } from '../../lib/talkEditor/types';

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
}) => {
  const [selectedPreset, setSelectedPreset] = useState<NarrativePreset>('balanced');
  const [showNarrativeMenu, setShowNarrativeMenu] = useState<boolean>(false);

  // 计算时长统计
  const totalDuration = segments.reduce((acc, s) => acc + (s.endTime - s.startTime), 0);
  const deletedDuration = segments.reduce(
    (acc, s) => acc + (s.isDeleted ? s.endTime - s.startTime : 0),
    0
  );
  const preservedDuration = Math.max(0, totalDuration - deletedDuration);
  const condensedRatio = totalDuration > 0 ? Math.round((preservedDuration / totalDuration) * 100) : 100;

  // 切换单条切片的删除状态
  const toggleSegmentDeleted = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateSegments(
      segments.map((s) => (s.id === id ? { ...s, isDeleted: !s.isDeleted, deleteReason: s.isDeleted ? undefined : 'manual' } : s))
    );
  };

  // 恢复所有删除
  const handleResetAll = () => {
    onUpdateSegments(segments.map((s) => ({ ...s, isDeleted: false, deleteReason: undefined, tagLabel: undefined })));
  };

  return (
    <div className="h-full flex flex-col bg-[#111218] border-r border-zinc-800/80 select-none overflow-hidden">
      {/* 顶部标题与时长统计面板 */}
      <div className="p-3.5 border-b border-zinc-800/80 bg-[#14151f] shrink-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Scissors className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-zinc-100">台词与文案剪辑流</span>
          </div>
          <button
            type="button"
            onClick={handleResetAll}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded bg-zinc-800/70 hover:bg-zinc-700 transition flex items-center gap-1 cursor-pointer"
            title="撤销所有删除标记，恢复原片状态"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>重置</span>
          </button>
        </div>

        {/* 时长精简对比胶囊 */}
        <div className="grid grid-cols-3 gap-1.5 p-2 bg-zinc-900/80 rounded-xl border border-zinc-800/60 text-center font-mono">
          <div>
            <div className="text-[9px] text-zinc-500">原片时长</div>
            <div className="text-xs font-bold text-zinc-300">
              {Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500">精剪保留</div>
            <div className="text-xs font-bold text-emerald-400">
              {Math.floor(preservedDuration / 60)}:{String(Math.floor(preservedDuration % 60)).padStart(2, '0')}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-500">浓缩比</div>
            <div className="text-xs font-bold text-indigo-400">{condensedRatio}%</div>
          </div>
        </div>

        {/* 4 大核心一键精简操作组 */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onRunSilenceCut}
            className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-200 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            title="自动识别语音停顿并施加 100ms 呼吸缓冲保护"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>⚡ 智能去气口</span>
          </button>

          <button
            type="button"
            onClick={onRunFillerClean}
            className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-200 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            title="一键标记并剔除语气词（呃、啊、然后、就是说）"
          >
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            <span>🧹 清语气词</span>
          </button>

          <button
            type="button"
            onClick={onRunStumbleClean}
            className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-200 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            title="启发式识别相邻忘词嘴瓢与重复句"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            <span>✂️ 清理重录</span>
          </button>

          {/* AI 宏观叙事精炼（带篇章完整性保障） */}
          <div className="relative">
            <button
              type="button"
              onClick={() => onRunNarrativePruning(selectedPreset)}
              disabled={isAnalyzingNarrative}
              className="w-full py-1.5 px-2 rounded-lg bg-gradient-to-r from-purple-900/80 to-indigo-900/80 hover:from-purple-800 hover:to-indigo-800 border border-purple-500/50 text-white text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
              title="大模型宏观分析篇章主线，剔除跑题冗余，保全逻辑完整"
            >
              <BrainCircuit className={`w-3.5 h-3.5 text-purple-300 ${isAnalyzingNarrative ? 'animate-spin' : ''}`} />
              <span>{isAnalyzingNarrative ? '篇章分析中…' : '🧠 AI 叙事精炼'}</span>
            </button>
          </div>
        </div>

        {/* 叙事精简目标档位切换 */}
        <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px]">
          <span className="text-zinc-400">精炼目标偏好:</span>
          <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-md border border-zinc-800">
            {(['viral', 'balanced', 'light'] as NarrativePreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPreset(p)}
                className={`px-1.5 py-0.5 rounded text-[9.5px] transition cursor-pointer ${
                  selectedPreset === p
                    ? 'bg-purple-600 text-white font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {p === 'viral' ? '爆款(~55%)' : p === 'balanced' ? '深度(~80%)' : '轻度(~90%)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI 叙事精炼分析反馈摘要卡片 */}
      {narrativeAnalysis && (
        <div className="p-3 border-b border-zinc-800/80 bg-purple-950/20 text-xs text-zinc-300 shrink-0 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-purple-300">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>篇章完整性评估：{narrativeAnalysis.coherenceScore}分</span>
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              已精简 {narrativeAnalysis.prunedDurationSec}s
            </span>
          </div>
          <p className="text-[10.5px] text-zinc-400 leading-relaxed">
            {narrativeAnalysis.summaryFeedback}
          </p>
        </div>
      )}

      {/* 可交互文稿列表 (Word 级删除线修订模式) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {segments.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-zinc-500 text-xs gap-2 text-center p-4">
            <FileText className="w-8 h-8 text-zinc-600" />
            <span>暂无文稿，请上传视频后自动提取台词</span>
          </div>
        ) : (
          segments.map((seg, idx) => {
            const isCurrent = currentTime >= seg.startTime && currentTime <= seg.endTime;
            const isSilence = seg.deleteReason === 'silence';

            if (isSilence) {
              return (
                <div
                  key={seg.id}
                  onClick={(e) => toggleSegmentDeleted(seg.id, e)}
                  className={`flex items-center justify-between px-2.5 py-1 rounded-md text-[10px] font-mono cursor-pointer transition border ${
                    seg.isDeleted
                      ? 'bg-zinc-900/60 border-zinc-800/80 text-zinc-500 hover:text-zinc-300'
                      : 'bg-amber-950/30 border-amber-500/40 text-amber-300 font-bold'
                  }`}
                  title="点击切换：切除或保留该气口停顿"
                >
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    <span>{seg.text}</span>
                  </span>
                  <span className="text-[9px] text-zinc-400">
                    {seg.isDeleted ? '已切除 (跳过)' : '保留'}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={seg.id}
                onClick={() => onSeek(seg.startTime)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer group ${
                  isCurrent
                    ? 'border-indigo-500/90 bg-indigo-950/30 ring-1 ring-indigo-500/30'
                    : seg.isDeleted
                    ? 'border-zinc-900 bg-zinc-950/40 opacity-55'
                    : 'border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* 标签提示：跑题/语气词/嘴瓢 */}
                    {seg.tagLabel && (
                      <span
                        className={`inline-block text-[9px] px-1.5 py-0.2 rounded font-semibold mr-1.5 mb-1 ${
                          seg.deleteReason === 'narrative_tangent'
                            ? 'bg-purple-900/60 text-purple-300 border border-purple-500/40'
                            : seg.deleteReason === 'stumble'
                            ? 'bg-orange-900/60 text-orange-300 border border-orange-500/40'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {seg.tagLabel}
                      </span>
                    )}

                    {/* 文案内容 (带删除线效果) */}
                    <p
                      className={`text-xs leading-relaxed transition-all ${
                        seg.isDeleted
                          ? 'line-through text-zinc-500 decoration-zinc-500'
                          : isCurrent
                          ? 'text-white font-semibold'
                          : 'text-zinc-200'
                      }`}
                    >
                      {seg.text}
                    </p>
                  </div>

                  {/* 快捷切换剔除按钮 */}
                  <button
                    type="button"
                    onClick={(e) => toggleSegmentDeleted(seg.id, e)}
                    className={`p-1 rounded transition shrink-0 cursor-pointer ${
                      seg.isDeleted
                        ? 'text-zinc-500 hover:text-emerald-400 bg-zinc-800/50 hover:bg-emerald-950/40'
                        : 'text-zinc-400 hover:text-rose-400 bg-zinc-800/50 hover:bg-rose-950/40'
                    }`}
                    title={seg.isDeleted ? '点击恢复此句' : '点击切除此句'}
                  >
                    {seg.isDeleted ? <RotateCcw className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>

                {/* 底部时间戳 */}
                <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 mt-1.5">
                  <span>
                    {Math.floor(seg.startTime / 60)}:{String(Math.floor(seg.startTime % 60)).padStart(2, '0')}.
                    {String(Math.floor((seg.startTime % 1) * 10)).padStart(1, '0')}
                  </span>
                  <span>{(seg.endTime - seg.startTime).toFixed(1)}s</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
