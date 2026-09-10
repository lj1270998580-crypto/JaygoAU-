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
  VisualType,
} from './types';
import type { RawAsrUtterance } from './timelineAligner';
import type { IllustrationDensity } from '../../types';
import { alignScriptTimeline } from './timelineAligner';
import { parseSemanticUnits } from './semanticParser';
import { planVisualBeats } from './visualBeatPlanner';
import { directVisualScenes, createDirectorDiagnostics, type DirectorDiagnostics } from './visualDirector';
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
  onDiagnostics?: (diag: PipelineDiagnostics) => void;
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
  category: VisualType;
  styleId: string;
  ratio: string;
  prompt: string;
  /** v0.7.9：负向提示词，作为独立参数下发，不再混在正向提示词里 */
  negativePrompt: string;
  promptBlocks: PromptBlocks;
  scenePlan: ScenePlan;
  visualScore: number;
  shot: string;
}

/**
 * 整条流水线的运行诊断（透出到 UI，避免 LLM 静默降级无人知晓）
 */
export interface PipelineDiagnostics extends DirectorDiagnostics {
  totalBeats: number;
  infographicCount: number;
  standardCount: number;
  averageCoverage: number;
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
    onDiagnostics,
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

  const directorDiag = createDirectorDiagnostics();
  const scenePlans: ScenePlan[] = await directVisualScenes(
    visualBeats,
    modelHubSettings,
    directorDiag
  );

  // 5. 风格圣经与提示词编译阶段
  onProgress?.({
    stage: 'compiling',
    stepNumber: 5,
    totalSteps: 5,
    stageName: '提示词编译',
    message: '正在基于 Style Bible 编译中文实体生图提示词…',
    percent: 95,
  });

  const styleBible: StyleBible = getStyleBible(styleId);

  // 整合并装配输出结果
  const results: PlannedIllustrationResult[] = visualBeats.map((beat, idx) => {
    const plan = scenePlans[idx] || scenePlans.find((p) => p.beatId === beat.beatId)!;

    // 先判定图种与模型（信息图需要走独立编译分支）
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

    // 关键修复：把图种传入编译器，信息图使用独立的图表化编译分支
    const promptBlocks = compileScenePrompt(plan, styleBible, { type });

    // 映射 category：直接沿用真实 visualType，不再把
    // historical_recreation / product_showcase 静默塌缩成 scene_narrative
    const cat = beat.visualType;

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
      negativePrompt: promptBlocks.negativePrompt,
      promptBlocks,
      scenePlan: plan,
      visualScore: beat.score.total,
      shot: plan.composition.shot,
    };
  });

  const infographicCount = results.filter((r) => r.type === 'infographic').length;
  const avgCoverage = results.length > 0
    ? results.reduce((sum, r) => sum + (r.promptBlocks.coverageScore || 0), 0) / results.length
    : 0;

  const diagnostics: PipelineDiagnostics = {
    ...directorDiag,
    totalBeats: results.length,
    infographicCount,
    standardCount: results.length - infographicCount,
    averageCoverage: Math.round(avgCoverage * 100) / 100,
  };
  onDiagnostics?.(diagnostics);

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
