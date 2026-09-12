import React, { useState, useRef, useEffect } from 'react';
import {
  Scissors,
  Sparkles,
  Upload,
  ArrowRight,
  FolderOpen,
  Film,
  Zap,
  Layers,
  FileText,
  Sliders,
  Type,
  Check,
} from 'lucide-react';
import { useStore } from '../../store';
import type {
  CanvasConfig,
  CanvasRatio,
  CutSegment,
  SubtitleItem,
  SubtitleStyleConfig,
  NarrativePreset,
  NarrativeAnalysisResult,
} from '../../lib/talkEditor/types';
import { scanSilenceSegments, detectFillerSegments } from '../../lib/talkEditor/audioSilenceScanner';
import { runNarrativePruning, detectRetakeAndStumbles } from '../../lib/talkEditor/semanticPruner';
import { buildJianyingTalkDraft } from '../../lib/talkEditor/jianyingTalkExporter';
import { TranscriptCutter } from './TranscriptCutter';
import { CanvasMonitor } from './CanvasMonitor';
import { CanvasSettingsPanel } from './CanvasSettingsPanel';
import { SubtitleEditorPanel } from './SubtitleEditorPanel';
import { TalkTimeline } from './TalkTimeline';
import type { ModelHubSettings } from '../../lib/modelHubTypes';

interface TalkEditorProps {
  modelSettings?: ModelHubSettings;
  onUpdateModelHubSettings?: (s: ModelHubSettings) => void;
  onOpenModelHub?: () => void;
  onPushToIllustrator?: (data: { videoPath: string; scriptText: string; title?: string }) => void;
}

export const TalkEditor: React.FC<TalkEditorProps> = ({
  modelSettings,
  onOpenModelHub,
  onPushToIllustrator,
}) => {
  const { showToast, setPendingIllustrator, setTab } = useStore();

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
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);

  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isAnalyzingNarrative, setIsAnalyzingNarrative] = useState<boolean>(false);
  const [narrativeAnalysis, setNarrativeAnalysis] = useState<NarrativeAnalysisResult | null>(null);

  // 画布与贴片设置 (默认 9:16 竖屏，毛玻璃背景)
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>({
    aspectRatio: '9:16',
    backgroundType: 'blur',
    backgroundColor: '#09090b',
    blurIntensity: 25,
    videoScale: 1.0,
    videoYPercent: 0,
    topPatch: {
      enabled: true,
      text: 'AI 口播精剪 · 爆款结构速成',
      fontSize: 26,
      textColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      borderRadius: 10,
      fontWeight: 'bold',
      yOffsetPercent: 0.06,
    },
    bottomPatch: {
      enabled: true,
      text: '关注我 · 获取自媒体全套生产力工具',
      fontSize: 18,
      textColor: '#d4d4d8',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      borderRadius: 8,
      fontWeight: 'normal',
      yOffsetPercent: 0.05,
    },
  });

  // 字幕样式配置 (默认爆款双行强化模版)
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleStyleConfig>({
    templateId: 'viral_double',
    fontSize: 26,
    textColor: '#ffffff',
    highlightColor: '#facc15',
    strokeColor: '#000000',
    strokeWidth: 2.5,
    yPercent: 0.18,
  });

  // 右侧属性面板活动 Tab
  const [activeRightTab, setActiveRightTab] = useState<'canvas' | 'subtitle'>('subtitle');

  // 时间轴面板高度调节 (180px ~ 480px, 默认 260px)
  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('jaygo_talk_timeline_h');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 180 && val <= 480) return val;
      }
    } catch (_) {}
    return 260;
  });
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);

  // 监听水平分割条上下拖动
  useEffect(() => {
    if (!isResizingTimeline) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowHeight = window.innerHeight;
      const newHeight = Math.max(180, Math.min(480, windowHeight - e.clientY));
      setTimelineHeight(newHeight);
      try {
        localStorage.setItem('jaygo_talk_timeline_h', String(newHeight));
      } catch (_) {}
    };

    const handleMouseUp = () => {
      setIsResizingTimeline(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingTimeline]);

  // 文件导入逻辑
  const handleLoadVideoFile = async (file: File) => {
    const localPath = (file as any).path || '';
    const objUrl = URL.createObjectURL(file);
    setVideoSrc(objUrl);
    setVideoPath(localPath || objUrl);
    setVideoTitle(file.name);
    setCurrentTime(0);
    setIsPlaying(false);
    showToast(`已载入视频：${file.name}`, 'ok');

    // 自动发起 ASR 转录
    setIsTranscribing(true);
    try {
      if (localPath && (window as any).JaygoAPI?.transcribe) {
        showToast('正在通过火山引擎 Seed-ASR 2.0 毫秒级提取台词与气口…', 'info');
        const res = await (window as any).JaygoAPI.transcribe({
          filePath: localPath,
          enableSpeakerInfo: false,
        });
        if (res?.utterances && res.utterances.length > 0) {
          const rawUtterances = res.utterances.map((u: any, i: number) => ({
            id: `utt-${i}`,
            text: u.text,
            startTime: u.startTime,
            endTime: u.endTime,
          }));

          const dur = rawUtterances[rawUtterances.length - 1].endTime + 1;
          setVideoDuration(dur);

          // 1. 初始化切片（包含呼吸保护）
          const initialSegments = scanSilenceSegments(rawUtterances, dur, {
            silenceThresholdSec: 0.45,
            headPaddingSec: 0.10,
            tailPaddingSec: 0.12,
          });
          setSegments(initialSegments);

          // 2. 初始化字幕列表
          setSubtitles(
            rawUtterances.map((u: any, i: number) => ({
              id: `sub-${i}`,
              startTime: u.startTime,
              endTime: u.endTime,
              text: u.text,
            }))
          );

          showToast('台词与停顿气口解析完成！已自动标记冗长空白。', 'ok');
          return;
        }
      }
    } catch (err: any) {
      console.warn('[TalkEditor] ASR 失败，启用演示模式:', err);
    } finally {
      setIsTranscribing(false);
    }

    // 兜底：若未联网或无配置，生成测试台词切片供预览体验
    generateFallbackDemoSegments(file.name);
  };

  const generateFallbackDemoSegments = (fileName: string) => {
    const mockDur = 45;
    setVideoDuration(mockDur);
    const mockUtterances = [
      { id: '1', startTime: 0.5, endTime: 3.8, text: '今天我一定要跟你聊一个非常扎心的真相。' },
      { id: '2', startTime: 4.8, endTime: 7.2, text: '很多做自媒体的朋友，每天都在苦苦死撑……呃……' },
      { id: '3', startTime: 7.6, endTime: 11.2, text: '很多做自媒体的朋友，每天都在苦苦死撑却没有流量。' },
      { id: '4', startTime: 12.5, endTime: 17.0, text: '其实根本不是你不够努力，而是你一开始的选题框架就彻底跑偏了。' },
      { id: '5', startTime: 18.0, endTime: 22.5, text: '顺便说一句，昨天我邻居小李还问我关于做短视频的事，我跟他聊了半天。' },
      { id: '6', startTime: 23.2, endTime: 28.0, text: '接下来我给你总结 3 个必须立刻掌握的破局核心。' },
      { id: '7', startTime: 29.0, endTime: 34.2, text: '第一点，也是最关键的，是前三秒必须直接亮出利益点。' },
      { id: '8', startTime: 35.5, endTime: 41.0, text: '只要把这套逻辑吃透，你的完播率起码能翻三倍以上。' },
    ];

    const initialSegs = scanSilenceSegments(mockUtterances, mockDur);
    setSegments(initialSegs);
    setSubtitles(
      mockUtterances.map((u) => ({
        id: `sub-${u.id}`,
        startTime: u.startTime,
        endTime: u.endTime,
        text: u.text,
      }))
    );
  };

  // 1. 一键去气口
  const handleRunSilenceCut = () => {
    setSegments((prev) =>
      prev.map((s) => (s.deleteReason === 'silence' ? { ...s, isDeleted: true } : s))
    );
    showToast('已一键切除所有冗长停顿，保留自然呼吸气口！', 'ok');
  };

  // 2. 一键清语气词
  const handleRunFillerClean = () => {
    setSegments((prev) => detectFillerSegments(prev));
    showToast('已标记并切除常见语气词（呃、啊、然后、就是说）！', 'ok');
  };

  // 3. 一键清嘴瓢重录
  const handleRunStumbleClean = () => {
    setSegments((prev) => detectRetakeAndStumbles(prev));
    showToast('已智能识别并标记相邻忘词与重复句！', 'ok');
  };

  // 4. AI 宏观叙事篇章精炼
  const handleRunNarrativePruning = async (preset: NarrativePreset) => {
    setIsAnalyzingNarrative(true);
    showToast('AI 正在深度研判篇章主干与逻辑完整性…', 'info');
    try {
      const res = await runNarrativePruning(segments, preset, modelSettings);
      setSegments(res.updatedSegments);
      setNarrativeAnalysis(res.analysis);
      showToast(`篇章精炼完成！完整性评分: ${res.analysis.coherenceScore}分`, 'ok');
    } catch (e: any) {
      showToast(`精炼分析失败: ${e?.message || e}`, 'err');
    } finally {
      setIsAnalyzingNarrative(false);
    }
  };

  // 剃刀在当前播放头处剪断切片
  const handleSplitSegmentAtPlayhead = () => {
    if (!segments.length) return;
    const splitTime = currentTime;
    const targetIdx = segments.findIndex(
      (s) => splitTime > s.startTime + 0.1 && splitTime < s.endTime - 0.1
    );
    if (targetIdx === -1) {
      showToast('当前播放头位置无法分割（距离片段边界太近或不在有效片段内）', 'info');
      return;
    }
    const target = segments[targetIdx];
    const part1: CutSegment = {
      ...target,
      endTime: Number(splitTime.toFixed(2)),
    };
    const part2: CutSegment = {
      ...target,
      id: `seg-split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startTime: Number(splitTime.toFixed(2)),
    };

    const nextSegs = [...segments];
    nextSegs.splice(targetIdx, 1, part1, part2);
    setSegments(nextSegs);
    setSelectedSegmentId(part2.id);
    showToast('✂️ 已在当前播放头处完成剃刀分割！', 'ok');
  };

  // 拉伸微调切片入出点
  const handleTrimSegment = (id: string, newStart: number, newEnd: number) => {
    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, startTime: Number(newStart.toFixed(2)), endTime: Number(newEnd.toFixed(2)) }
          : s
      )
    );
  };

  // 切换切片删除状态
  const handleToggleSegmentDelete = (id: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isDeleted: !s.isDeleted } : s))
    );
  };

  // 更新指定字幕属性
  const handleUpdateSubtitle = (id: string, updates: Partial<SubtitleItem>) => {
    setSubtitles((prev) =>
      prev.map((sub) => (sub.id === id ? { ...sub, ...updates } : sub))
    );
  };

  // 选中字幕并自动跳转与激活检查器
  const handleSelectSubtitle = (id: string) => {
    setSelectedSubtitleId(id);
    setActiveRightTab('subtitle');
  };

  // 🌟 跨模块联动核心：一键推送到 AI 视频配图
  const handlePushToIllustrator = () => {
    if (!videoSrc) {
      showToast('请先载入视频素材', 'err');
      return;
    }

    // 提取精简清洗后的纯净台词全文
    const cleanedScript = segments
      .filter((s) => !s.isDeleted && s.deleteReason !== 'silence')
      .map((s) => s.text)
      .join('\n');

    const targetPayload = {
      videoPath: videoPath || videoSrc,
      scriptText: cleanedScript,
      title: `${videoTitle || '口播视频'} (精剪版)`,
    };

    if (onPushToIllustrator) {
      onPushToIllustrator(targetPayload);
    } else {
      setPendingIllustrator(targetPayload);
      setTab('illustrator');
    }
    showToast('已将精剪视频与高密度台词一键推送到 AI 视频配图！', 'ok');
  };

  // 导出剪映 Pro 官方草稿
  const handleExportJianyingDraft = async () => {
    if (!videoPath) {
      showToast('请先选择本地视频文件', 'err');
      return;
    }
    try {
      const draftResult = buildJianyingTalkDraft({
        videoPath,
        videoDurationSec: videoDuration,
        canvasConfig,
        segments,
        subtitles,
        subtitleStyle: subtitleConfig,
        projectName: `${videoTitle.replace(/\.[^/.]+$/, '')}_口播精剪`,
      });

      const exportFn = (window as any).JaygoAPI?.illustratorExportJianying;
      if (exportFn) {
        showToast('正在组装剪映官方工程…', 'info');
        const res = await exportFn({
          draftDirName: draftResult.projectName,
          draftContent: JSON.parse(draftResult.draftContentJson),
          draftMeta: { draft_name: draftResult.projectName },
        });
        if (res.ok) {
          showToast('🎉 已成功导出剪映草稿工程！打开剪映即可直接查看切片轨与字幕轨。', 'ok');
        } else {
          showToast(`剪映草稿导出失败: ${res.error || '未知错误'}`, 'err');
        }
      } else {
        showToast('未检测到剪映导出底层环境', 'err');
      }
    } catch (err: any) {
      showToast(`导出失败: ${err?.message || err}`, 'err');
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0f1016] select-none overflow-hidden">
      {/* 顶部总控导航条 */}
      <div className="h-12 border-b border-zinc-800/80 px-4 flex items-center justify-between shrink-0 bg-[#13141c]/90 backdrop-blur z-20">
        {/* 左侧：模块标题与素材状态 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>AI 口播专业剪辑</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  NLE 专业时间轴
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 truncate max-w-[260px]">
                {videoTitle || '未载入素材 · 请点击右侧导入音视频'}
              </div>
            </div>
          </div>

          {/* 载入素材按钮 */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer transition border border-zinc-700/60 shadow-sm ml-2">
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>导入音视频</span>
            <input
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLoadVideoFile(file);
              }}
            />
          </label>
        </div>

        {/* 中间：AI 自动化快捷指令胶囊 */}
        {videoSrc && (
          <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800/90 text-xs shadow-inner">
            <button
              type="button"
              onClick={handleRunSilenceCut}
              className="px-2.5 py-1 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition flex items-center gap-1 cursor-pointer"
              title="一键切除所有 ≥300ms 沉默停顿"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>去气口</span>
            </button>
            <button
              type="button"
              onClick={handleRunFillerClean}
              className="px-2.5 py-1 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition flex items-center gap-1 cursor-pointer"
              title="标记并切除常见语气词（呃、啊、然后、就是说）"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>清语气词</span>
            </button>
            <button
              type="button"
              onClick={handleRunStumbleClean}
              className="px-2.5 py-1 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition flex items-center gap-1 cursor-pointer"
              title="识别口误与反复重读语句"
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>清嘴瓢</span>
            </button>
          </div>
        )}

        {/* 右侧：导出与跨模块一键推送 */}
        <div className="flex items-center gap-2">
          {videoSrc && (
            <>
              <button
                type="button"
                onClick={handleExportJianyingDraft}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-medium transition cursor-pointer flex items-center gap-1.5 border border-zinc-700/60"
                title="导出标准剪映 Pro 草稿工程（包含切片轨、贴片轨与时间对齐字幕轨）"
              >
                <Film className="w-3.5 h-3.5 text-cyan-400" />
                <span>导出剪映工程</span>
              </button>

              <button
                type="button"
                onClick={handlePushToIllustrator}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
                title="将精修视频与高密度台词一键推送至 AI 视频配图"
              >
                <span>🚀 推送到视频插图</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 主体工作区 */}
      {!videoSrc ? (
        /* 空状态提示与快速引导 */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#0d0e14]">
          <div className="w-20 h-20 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
            <Film className="w-10 h-10 stroke-1" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">欢迎使用 AI 口播专业剪辑</h2>
          <p className="text-zinc-400 text-sm max-w-md mb-6 leading-relaxed">
            导入录制好的口播视频，系统将自动扫描声学停顿气口、识别嘴瓢重录，并通过大模型提炼宏观篇章。
            下方配备全宽专业多轨时间轴，支持剃刀切割、拉伸入出点、多画幅贴片与 5 款爆款字幕模版！
          </p>

          <div className="flex items-center gap-3">
            <label className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm cursor-pointer transition shadow-lg shadow-indigo-600/30 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <span>选择本地视频开始剪辑</span>
              <input
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLoadVideoFile(file);
                }}
              />
            </label>

            <button
              type="button"
              onClick={() => generateFallbackDemoSegments('口播演示示例.mp4')}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition"
            >
              载入演示示例体验
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
          {/* 上半工作区：三栏布局 (左栏文稿 + 中栏监视器 + 右栏属性检查器) */}
          <div className="flex-1 flex min-h-0 relative overflow-hidden">
            {/* 左栏：文稿修订剪辑区 (width: 320px) */}
            <div className="w-80 border-r border-zinc-800/80 bg-[#111218] flex flex-col shrink-0 min-h-0">
              <TranscriptCutter
                segments={segments}
                onUpdateSegments={setSegments}
                currentTime={currentTime}
                onSeek={(time) => {
                  setCurrentTime(time);
                  const seg = segments.find((s) => time >= s.startTime && time <= s.endTime);
                  if (seg) setSelectedSegmentId(seg.id);
                }}
                onRunSilenceCut={handleRunSilenceCut}
                onRunFillerClean={handleRunFillerClean}
                onRunStumbleClean={handleRunStumbleClean}
                onRunNarrativePruning={handleRunNarrativePruning}
                isAnalyzingNarrative={isAnalyzingNarrative}
                narrativeAnalysis={narrativeAnalysis}
              />
            </div>

            {/* 中栏：多画幅实时跳切监视器 (自适应 flex-1) */}
            <div className="flex-1 min-w-0 bg-[#0a0b0f] flex flex-col min-h-0 relative">
              <CanvasMonitor
                videoSrc={videoSrc}
                videoDuration={videoDuration}
                currentTime={currentTime}
                onSeek={setCurrentTime}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying(!isPlaying)}
                canvasConfig={canvasConfig}
                onChangeCanvasRatio={(ratio) =>
                  setCanvasConfig((prev) => ({ ...prev, aspectRatio: ratio }))
                }
                subtitleConfig={subtitleConfig}
                subtitles={subtitles}
                segments={segments}
                videoDimensions={videoDimensions}
                onVideoLoaded={(dim) => {
                  setVideoDimensions({ width: dim.width, height: dim.height });
                  if (dim.duration && dim.duration > 0) setVideoDuration(dim.duration);
                }}
              />
            </div>

            {/* 右栏：属性检查器（🌟 用户强调：字幕设置与模版、画布与贴片全功能） (width: 340px) */}
            <div className="w-84 border-l border-zinc-800/80 bg-[#111218] flex flex-col shrink-0 min-h-0">
              {/* 顶部 Tab 切换 */}
              <div className="h-10 border-b border-zinc-800 flex items-center px-2 shrink-0 bg-[#13141c]">
                <button
                  type="button"
                  onClick={() => setActiveRightTab('subtitle')}
                  className={`flex-1 py-1.5 text-xs font-bold transition rounded-md flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeRightTab === 'subtitle'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Type className="w-3.5 h-3.5 text-amber-400" />
                  <span>字幕设置与模版</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRightTab('canvas')}
                  className={`flex-1 py-1.5 text-xs font-bold transition rounded-md flex items-center justify-center gap-1.5 cursor-pointer ${
                    activeRightTab === 'canvas'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>画布与上下贴片</span>
                </button>
              </div>

              {/* 属性检查器内容区 */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {activeRightTab === 'subtitle' ? (
                  <SubtitleEditorPanel
                    subtitles={subtitles}
                    onChangeSubtitles={setSubtitles}
                    config={subtitleConfig}
                    onChangeConfig={setSubtitleConfig}
                    currentTime={currentTime}
                    onSeek={setCurrentTime}
                  />
                ) : (
                  <CanvasSettingsPanel
                    config={canvasConfig}
                    onChangeConfig={setCanvasConfig}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 水平拖拽分割条 (上下自由拖拽调节时间轴高度) */}
          <div
            onMouseDown={() => setIsResizingTimeline(true)}
            className="h-2 bg-zinc-950 hover:bg-indigo-600/70 cursor-row-resize transition-colors shrink-0 flex items-center justify-center group border-y border-zinc-800/80"
            title="上下拖拽调整专业时间轴高度 (180px ~ 480px)"
          >
            <div className="w-10 h-1 bg-zinc-700 group-hover:bg-white rounded-full transition shadow" />
          </div>

          {/* 下半工作区：专业多轨时间轴 */}
          <TalkTimeline
            duration={videoDuration}
            currentTime={currentTime}
            onSeek={setCurrentTime}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            segments={segments}
            onToggleSegmentDelete={handleToggleSegmentDelete}
            onSplitSegmentAtPlayhead={handleSplitSegmentAtPlayhead}
            onTrimSegment={handleTrimSegment}
            onBatchDeleteSilences={handleRunSilenceCut}
            onBatchDeleteStumbles={handleRunStumbleClean}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={setSelectedSegmentId}
            subtitles={subtitles}
            onUpdateSubtitle={handleUpdateSubtitle}
            onSelectSubtitle={handleSelectSubtitle}
            selectedSubtitleId={selectedSubtitleId}
            canvasConfig={canvasConfig}
            videoSrc={videoSrc}
            height={timelineHeight}
          />
        </div>
      )}
    </div>
  );
};
export default TalkEditor;
