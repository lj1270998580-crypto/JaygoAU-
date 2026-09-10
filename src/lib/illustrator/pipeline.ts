// =========================================================================
// AI 视觉导演总流水线 (AI Visual Director Pipeline)
// 统一协调 Timeline -> Semantic -> VisualBeat -> Director -> StyleBible -> Compiler
// 提供每阶段实时回调，确保前端有极佳的流式动态进度指示
// =========================================================================

import type {
  SemanticUnit,
  VisualBeat,
  ScenePlan,
  StyleBible,
  PromptBlocks,
  PipelineProgress,
} from './types';
import type { RawAsrUtterance } from './timelineAligner';
import type { IllustrationDensity } from '../../types';
import { alignScriptTimeline } from './timelineAligner';
import { parseSemanticUnits } from './semanticParser';
import { planVisualBeats } from './visualBeatPlanner';
import { directVisualScenes } from './visualDirector';
import { getStyleBible } from './styleBible';
import { compileScenePrompt } from './promptCompiler';

export interface PipelineOptions {
  scriptText: string;
  videoDuration: number;
  density: IllustrationDensity;
  styleId: string;
  ratio: string;
  routingMode: 'smart' | 'infographic' | 'standard';
  asrUtterances?: RawAsrUtterance[];
  modelHubSettings?: any;
  onProgress?: (progress: PipelineProgress) => void;
}

export interface PlannedIllustrationResult {
  beatId: string;
  startTime: number;
  endTime: number;
  contextText: string;
  concept: string;
  communicationGoal: string;
  visualType: string;
  type: 'infographic' | 'standard';
  model: 'sensenova-u1-fast' | 'sensenova-u1.5-lite';
  category: 'data_stat' | 'step_framework' | 'vs_comparison' | 'concept_metaphor' | 'scene_narrative';
  styleId: string;
  ratio: string;
  prompt: string;
  promptBlocks: PromptBlocks;
  scenePlan: ScenePlan;
  visualScore: number;
  shot: string;
}

/**
 * 运行完整的 AI 视觉导演分镜规划流水线
 */
export async function runIllustrationPipeline(
  options: PipelineOptions
): Promise<PlannedIllustrationResult[]> {
  const {
    scriptText,
    videoDuration,
    density,
    styleId,
    ratio,
    routingMode,
    asrUtterances,
    modelHubSettings,
    onProgress,
  } = options;

  // 1. 时间轴对齐阶段
  onProgress?.({
    stage: 'aligning',
    stepNumber: 1,
    totalSteps: 5,
    stageName: '时间轴对齐',
    message: asrUtterances && asrUtterances.length > 0
      ? '正在基于 ASR 真实语音切片毫秒级对齐时间轴…'
      : '正在计算自然口播语速与标点时间分布…',
    percent: 15,
  });

  const timelineSegments = alignScriptTimeline(scriptText, videoDuration, asrUtterances);
  if (timelineSegments.length === 0) {
    throw new Error('文案内容为空或无法识别有效段落');
  }

  // 2. 语义切块与实体提取阶段
  onProgress?.({
    stage: 'parsing',
    stepNumber: 2,
    totalSteps: 5,
    stageName: '语义事件解析',
    message: '正在切分原子语义事件并过滤推销话术…',
    percent: 35,
  });

  const semanticUnits: SemanticUnit[] = await parseSemanticUnits(timelineSegments, modelHubSettings);
  if (semanticUnits.length === 0) {
    throw new Error('未在文案中解析到可视觉化的有效正文内容');
  }

  // 3. 视觉节拍规划与打分阶段 (Visual Need Score V)
  onProgress?.({
    stage: 'planning',
    stepNumber: 3,
    totalSteps: 5,
    stageName: '视觉节拍规划',
    message: `正在基于 V 评分算法与【${density === 'dense' ? '紧凑密集' : density === 'sparse' ? '精炼聚焦' : '标准均衡'}】预算求解插图节点…`,
    percent: 60,
  });

  const visualBeats: VisualBeat[] = planVisualBeats(semanticUnits, {
    density,
    routingMode,
    totalDuration: videoDuration,
  });

  if (visualBeats.length === 0) {
    throw new Error('视觉节拍规划未产生入选分镜');
  }

  // 4. 视觉导演分镜规划阶段
  onProgress?.({
    stage: 'directing',
    stepNumber: 4,
    totalSteps: 5,
    stageName: '分镜导演构图',
    message: '视觉导演正在规划实体道具、环境空间与景别节奏…',
    percent: 80,
  });

  const scenePlans: ScenePlan[] = await directVisualScenes(visualBeats, modelHubSettings);

  // 5. 风格圣经与提示词编译阶段
  onProgress?.({
    stage: 'compiling',
    stepNumber: 5,
    totalSteps: 5,
    stageName: '提示词编译',
    message: '正在基于 Style Bible 编译纯净实体生图提示词…',
    percent: 95,
  });

  const styleBible: StyleBible = getStyleBible(styleId);

  // 整合并装配输出结果
  const results: PlannedIllustrationResult[] = visualBeats.map((beat, idx) => {
    const plan = scenePlans[idx] || scenePlans.find((p) => p.beatId === beat.beatId)!;
    const promptBlocks = compileScenePrompt(plan, styleBible);

    // 映射图种与模型
    let isInfo = false;
    if (routingMode === 'infographic') {
      isInfo = true;
    } else if (routingMode === 'standard') {
      isInfo = false;
    } else {
      // smart
      isInfo = beat.visualType === 'data_stat' || beat.visualType === 'step_framework' || beat.visualType === 'vs_comparison';
    }

    const model = isInfo ? 'sensenova-u1-fast' : 'sensenova-u1.5-lite';
    const type: 'infographic' | 'standard' = isInfo ? 'infographic' : 'standard';

    // 映射 category
    let cat: 'data_stat' | 'step_framework' | 'vs_comparison' | 'concept_metaphor' | 'scene_narrative' = 'scene_narrative';
    if (beat.visualType === 'data_stat') cat = 'data_stat';
    else if (beat.visualType === 'step_framework') cat = 'step_framework';
    else if (beat.visualType === 'vs_comparison') cat = 'vs_comparison';
    else if (beat.visualType === 'concept_metaphor') cat = 'concept_metaphor';
    else cat = 'scene_narrative';

    // 概念提取
    let concept = plan.communicationGoal.replace(/^1秒读懂[：:]?\s*/, '');
    if (concept.length > 16) concept = concept.slice(0, 16);

    return {
      beatId: beat.beatId,
      startTime: beat.timeline.recommendedStart,
      endTime: beat.timeline.recommendedEnd,
      contextText: beat.sourceText,
      concept,
      communicationGoal: plan.communicationGoal,
      visualType: beat.visualType,
      type,
      model,
      category: cat,
      styleId,
      ratio,
      prompt: promptBlocks.compiledPrompt,
      promptBlocks,
      scenePlan: plan,
      visualScore: beat.score.total,
      shot: plan.composition.shot,
    };
  });

  onProgress?.({
    stage: 'completed',
    stepNumber: 5,
    totalSteps: 5,
    stageName: '规划完成',
    message: `成功完成 ${results.length} 个镜头分镜规划！`,
    percent: 100,
  });

  return results;
}
