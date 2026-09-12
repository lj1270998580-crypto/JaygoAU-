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

  // 右侧栏活动 Tab
  const [activeRightTab, setActiveRightTab] = useState<'canvas' | 'subtitle'>('canvas');

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
      <div className="h-13 px-4 border-b border-zinc-800 bg-[#14151f] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Scissors className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide">
                AI 口播智能剪辑工坊
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
                声学防吞字 · 篇章完整性保障
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              一键去气口 · 删跑题闲话 · 9:16贴片横转竖 · 剪完直通视频插图
            </p>
          </div>
        </div>

        {/* 顶部操作按钮组 */}
        <div className="flex items-center gap-2">
          {/* 上传本地视频按钮 */}
          <label className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition cursor-pointer flex items-center gap-1.5 border border-zinc-700/60 shadow-sm">
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            <span>选择素材</span>
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLoadVideoFile(f);
              }}
              className="hidden"
            />
          </label>

          {/* 🌟 核心跨模块联动：一键推送到 AI 视频配图 */}
          <button
            type="button"
            onClick={handlePushToIllustrator}
            disabled={!videoSrc}
            className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-500/20 disabled:opacity-40"
            title="将剪辑后的视频与清洗好的高密度文案一键推送到 AI 视频配图工作台"
          >
            <span>🚀 推送到视频插图</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {/* 导出剪映草稿 */}
          <button
            type="button"
            onClick={handleExportJianyingDraft}
            disabled={!videoSrc}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border border-zinc-700 disabled:opacity-40"
            title="生成官方剪映工程，包含切片主轨、贴片与字幕轨"
          >
            <Film className="w-3.5 h-3.5 text-purple-400" />
            <span>导出剪映草稿</span>
          </button>
        </div>
      </div>

      {/* 主体三栏布局 (防挤压自适应布局) */}
      {!videoSrc ? (
        /* 未上传视频时的精美引导空状态 */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
            <Film className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white mb-2">
            载入您的口播视频，开启 AI 智能精剪
          </h3>
          <p className="text-xs text-zinc-400 max-w-md leading-relaxed mb-6">
            支持长视频拖拽导入。AI 将自动毫秒级识别语音停顿（100ms
            呼吸保护绝不吃字）、语气词与重录；并通过大模型深度分析篇章主线，剔除跑题闲聊，保全完整叙事。
          </p>
          <label className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center gap-2">
            <Upload className="w-4 h-4" />
            <span>选择本地口播素材开始</span>
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLoadVideoFile(f);
              }}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        /* 三栏工作台主体 */
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {/* 1. 左栏：文稿与智能剪辑流 (min 340px, max 440px) */}
          <div className="w-[360px] xl:w-[400px] h-full shrink-0 flex flex-col overflow-hidden">
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

          {/* 2. 中栏：画布监视器视窗 (flex-1 弹性延伸) */}
          <div className="flex-1 h-full min-w-[400px] flex flex-col overflow-hidden">
            <CanvasMonitor
              videoSrc={videoSrc}
              videoDuration={videoDuration}
              currentTime={currentTime}
              onSeek={setCurrentTime}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
              canvasConfig={canvasConfig}
              onChangeCanvasRatio={(r) => setCanvasConfig({ ...canvasConfig, aspectRatio: r })}
              subtitleConfig={subtitleConfig}
              subtitles={subtitles}
              segments={segments}
              videoDimensions={videoDimensions}
              onVideoLoaded={(dim) => {
                setVideoDimensions({ width: dim.width, height: dim.height });
                if (dim.duration && (!videoDuration || videoDuration <= 1)) {
                  setVideoDuration(dim.duration);
                }
              }}
            />
          </div>

          {/* 3. 右栏：画布贴片与字幕属性工作台 (固定 350px 防挤压) */}
          <div className="w-[350px] h-full bg-[#111218] border-l border-zinc-800/80 flex flex-col shrink-0 overflow-hidden">
            {/* 顶栏 Tab 切换 */}
            <div className="h-10 px-3 border-b border-zinc-800/80 bg-[#14151f] flex items-center justify-around shrink-0 text-xs">
              <button
                type="button"
                onClick={() => setActiveRightTab('canvas')}
                className={`flex-1 py-1.5 text-center font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeRightTab === 'canvas'
                    ? 'text-indigo-400 border-b-2 border-indigo-500'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>画布与贴片</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRightTab('subtitle')}
                className={`flex-1 py-1.5 text-center font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeRightTab === 'subtitle'
                    ? 'text-indigo-400 border-b-2 border-indigo-500'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>字幕模版与改字</span>
              </button>
            </div>

            {/* 右栏内容 */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeRightTab === 'canvas' ? (
                <CanvasSettingsPanel
                  config={canvasConfig}
                  onChangeConfig={setCanvasConfig}
                />
              ) : (
                <SubtitleEditorPanel
                  subtitles={subtitles}
                  onChangeSubtitles={setSubtitles}
                  config={subtitleConfig}
                  onChangeConfig={setSubtitleConfig}
                  currentTime={currentTime}
                  onSeek={setCurrentTime}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default TalkEditor;
