import React, { useState } from 'react';
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
  CheckCircle2,
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
import { PolishExportPanel } from './PolishExportPanel';
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
  const [isAnalyzingNarrative, setIsAnalyzingNarrative] = useState<boolean>(false);
  const [narrativeAnalysis, setNarrativeAnalysis] = useState<NarrativeAnalysisResult | null>(null);

  // 画布与贴片设置 (默认 9:16 竖屏)
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
      fontSize: 24,
      textColor: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      borderRadius: 10,
      fontWeight: 'bold',
      yOffsetPercent: 0.06,
    },
    bottomPatch: {
      enabled: true,
      text: '关注我 · 获取自媒体全套生产力工具',
      fontSize: 16,
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

          // 1. 初始化切片（带有 120ms~150ms 黄金自然呼吸保护）
          const initialSegments = scanSilenceSegments(rawUtterances, dur, {
            silenceThresholdSec: 0.45,
            headPaddingSec: 0.12,
            tailPaddingSec: 0.15,
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
      console.warn('[TalkEditor] ASR 提取异常:', err);
    } finally {
      setIsTranscribing(false);
    }

    // 兜底：保留用户的真实视频轨道供剪辑，绝不强制覆盖测试假文案
    setSegments([
      {
        id: 'seg-init',
        startTime: 0,
        endTime: videoDuration > 0 ? videoDuration : 60,
        text: `${file.name}（已载入，可直接进行智能剪辑与文案修整）`,
        isDeleted: false,
      },
    ]);
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

    const initialSegs = scanSilenceSegments(mockUtterances, mockDur, {
      silenceThresholdSec: 0.45,
      headPaddingSec: 0.12,
      tailPaddingSec: 0.15,
    });
    setSegments(initialSegs);
    setSubtitles(
      mockUtterances.map((u) => ({
        id: `sub-${u.id}`,
        startTime: u.startTime,
        endTime: u.endTime,
        text: u.text,
      }))
    );
    showToast('已载入 42 秒自媒体口播演示素材，包含气口、嘴瓢与跑题！', 'ok');
  };

  // 1. 一键去气口
  const handleRunSilenceCut = () => {
    setSegments((prev) =>
      prev.map((s) => (s.deleteReason === 'silence' ? { ...s, isDeleted: true } : s))
    );
    showToast('已一键剔除所有冗长停顿，保留 120ms 自然呼吸缓冲！', 'ok');
  };

  // 2. 一键清语气词
  const handleRunFillerClean = () => {
    setSegments((prev) => detectFillerSegments(prev));
    showToast('已标记并剔除常见语气词（呃、啊、然后、就是说）！', 'ok');
  };

  // 3. 一键清嘴瓢重录
  const handleRunStumbleClean = () => {
    setSegments((prev) => detectRetakeAndStumbles(prev));
    showToast('已智能识别嘴瓢并完成重录分组，自动保留最佳版本！', 'ok');
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

  // 跨模块一键推送到 AI 视频插图
  const handlePushToIllustrator = () => {
    if (!videoSrc) {
      showToast('请先载入视频素材', 'err');
      return;
    }

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
    <div className="h-full flex flex-col bg-[#0f1016] select-none overflow-hidden text-xs">
      {/* 顶部总控导航条 */}
      <div className="h-12 border-b border-zinc-800/80 px-4 flex items-center justify-between shrink-0 bg-[#13141c]/95 backdrop-blur z-20">
        {/* 左侧：标题与当前视频信息 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>AI 口播智能剪辑</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Descript & Gling 架构
                </span>
              </div>
              <div className="text-[10.5px] text-zinc-400 truncate max-w-[240px]">
                {videoTitle || '未载入素材 · 请点击右侧导入视频'}
              </div>
            </div>
          </div>

          {/* 导入素材按钮 */}
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

          {/* 体验演示示例按钮 */}
          {segments.length === 0 && (
            <button
              type="button"
              onClick={generateFallbackDemoSegments}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/30 text-xs transition cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>载入演示示例</span>
            </button>
          )}
        </div>

        {/* 中间：两阶段步骤导航指示器 */}
        <div className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveStep('rough_cut')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeStep === 'rough_cut'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>① AI 智能粗剪</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveStep('polish_export')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeStep === 'polish_export'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>② 视觉包装与导出</span>
          </button>
        </div>

        {/* 右侧：下一步推进按钮 */}
        <div className="flex items-center gap-2">
          {activeStep === 'rough_cut' ? (
            <button
              type="button"
              onClick={() => setActiveStep('polish_export')}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>下一步：视觉包装与导出</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveStep('rough_cut')}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs border border-zinc-700/60 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回台词精剪</span>
            </button>
          )}
        </div>
      </div>

      {/* 主工作区：根据当前步骤呈现清晰的两栏架构 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {activeStep === 'rough_cut' ? (
          <>
            {/* 阶段一 左栏：交互式智能文稿 (占宽 58%) */}
            <div className="w-7/12 shrink-0 min-h-0 border-r border-zinc-800/80 bg-[#111218] flex flex-col">
              <TranscriptCutter
                segments={segments}
                onUpdateSegments={setSegments}
                currentTime={currentTime}
                onSeek={setCurrentTime}
                onRunSilenceCut={handleRunSilenceCut}
                onRunFillerClean={handleRunFillerClean}
                onRunStumbleClean={handleRunStumbleClean}
                onRunNarrativePruning={handleRunNarrativePruning}
                isAnalyzingNarrative={isAnalyzingNarrative}
                narrativeAnalysis={narrativeAnalysis}
              />
            </div>

            {/* 阶段一 右栏：高响应单视频监视器 + 紧凑单轨波形 (自适应 flex-1) */}
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
                  if (dim.duration && dim.duration > 0) {
                    setVideoDuration(dim.duration);
                    setSegments((prev) => {
                      if (prev.length === 1 && prev[0].id === 'seg-init') {
                        return [{ ...prev[0], endTime: dim.duration }];
                      }
                      return prev;
                    });
                  }
                }}
              />
            </div>
          </>
        ) : (
          <>
            {/* 阶段二 左栏：专属包装配置面板 (宽度 380px) */}
            <div className="w-[380px] shrink-0 min-h-0 border-r border-zinc-800/80 bg-[#111218] flex flex-col">
              <PolishExportPanel
                canvasConfig={canvasConfig}
                onChangeCanvasConfig={setCanvasConfig}
                subtitleConfig={subtitleConfig}
                onChangeSubtitleConfig={setSubtitleConfig}
                subtitles={subtitles}
                segments={segments}
                videoPath={videoPath}
                videoDuration={videoDuration}
                onPushToIllustrator={handlePushToIllustrator}
                onExportJianyingDraft={handleExportJianyingDraft}
              />
            </div>

            {/* 阶段二 右栏：全要素实时渲染监视器 (画布贴片 + 爆款字幕) */}
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
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TalkEditor;
