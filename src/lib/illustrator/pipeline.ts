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
import { planIllustrationsUnified } from './unifiedPlanner';
import { createDirectorDiagnostics, type DirectorDiagnostics } from './visualDirector';
import { getStyleBible } from './styleBible';
import { compileScenePrompt } from './promptCompiler';

export interface PipelineOptions {
  scriptText: string;
  videoDuration: number;
  density: IllustrationDensity;
  /** 叙事/场景类画面的画风 */
  styleId: string;
  /**
   * v0.7.20：信息图（数据/对比/流程）专用画风。
   * 叙事图要插画质感、信息图要清晰的数据可视化，两者需求不同，
   * 用同一套画风是矛盾的（选水墨则信息图也变得不适合读数）。
   * 不传时回落到 styleId，保持向后兼容。
   */
  infographicStyleId?: string;
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
    infographicStyleId,
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

  // 2+3+4. 合并规划阶段（v0.7.15）
  //
  // 此前是「语义解析(LLM) → 本地打分挑选 → 分镜导演(LLM)」三段，
  // 同一段旁白被大模型读了两遍，第二轮还只拿到第一轮压缩后的产物，
  // 信息在传递中被削掉，耗时与 TPM 消耗也都是双份。
  // 现在合并为**一次调用**：模型直接输出「要不要配图 + 配什么图 + 怎么构图」。
  onProgress?.({
    stage: 'directing',
    stepNumber: 2,
    totalSteps: 4,
    stageName: 'AI 分镜规划',
    message: '大模型正在逐句理解旁白，并决定要不要配图、配什么图…',
    percent: 30,
  });

  const batchReporter = (
    stage: PipelineProgress['stage'],
    stepNumber: number,
    stageName: string,
    basePercent: number,
    spanPercent: number
  ) => (done: number, total: number) => {
    const pct = Math.round(basePercent + (spanPercent * done) / Math.max(1, total));
    onProgress?.({
      stage,
      stepNumber,
      totalSteps: 4,
      stageName,
      message: `${stageName}：第 ${done}/${total} 批…`,
      percent: Math.min(94, pct),
    });
  };

  const plannedItems = await planIllustrationsUnified(timelineSegments, {
    density,
    videoDuration,
    modelHubSettings,
    // v0.7.18：把画风传进规划阶段 —— 否则「选水墨风却画出水墨质感的现代白板」
    styleId,
    infographicStyleId,
    onBatch: batchReporter('directing', 2, 'AI 分镜规划', 30, 55),
  });

  if (plannedItems.length === 0) {
    throw new Error('大模型判定这段文案没有值得配图的句子，请检查文案内容或改用更密集的配图密度。');
  }

  const directorDiag = createDirectorDiagnostics();
  directorDiag.usedLLM = true;
  directorDiag.batches = Math.ceil(timelineSegments.length / 6);
  directorDiag.degradedBatches = 0;

  // 4. 风格圣经与提示词编译阶段
  onProgress?.({
    stage: 'compiling',
    stepNumber: 3,
    totalSteps: 4,
    stageName: '提示词编译',
    message: '正在基于 Style Bible 编译中文实体生图提示词…',
    percent: 92,
  });

  // v0.7.20：叙事画风与信息图画风分开取用
  const narrativeBible: StyleBible = getStyleBible(styleId);
  const infoBible: StyleBible = getStyleBible(infographicStyleId || styleId);

  // 整合并装配输出结果
  const results: PlannedIllustrationResult[] = plannedItems.map((item) => {
    const beat = { visualType: item.visualType };
    const plan = item.plan;

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
    // v0.7.20：按分支选用对应画风 —— 信息图用信息图画风，叙事图用叙事画风
    const promptBlocks = compileScenePrompt(plan, isInfo ? infoBible : narrativeBible, { type });

    // 映射 category：直接沿用真实 visualType，不再把
    // historical_recreation / product_showcase 静默塌缩成 scene_narrative
    const cat = beat.visualType;

    // 概念提取
    let concept = plan.communicationGoal.replace(/^1秒读懂[：:]?\s*/, '');
    if (concept.length > 16) concept = concept.slice(0, 16);

    return {
      beatId: item.beatId,
      startTime: item.startTime,
      endTime: item.endTime,
      contextText: item.sourceText,
      concept,
      communicationGoal: plan.communicationGoal,
      visualType: beat.visualType,
      type,
      model,
      category: cat,
      // v0.7.20：每个镜头带上**它自己该用的**画风。
      // 此前一律回传 styleId（叙事画风），导致信息图也被按叙事画风出图，
      // 用户选的「信息图画风」在生成阶段被完全忽略。
      styleId: isInfo ? infoBible.styleId : narrativeBible.styleId,
      ratio,
      prompt: promptBlocks.compiledPrompt,
      negativePrompt: promptBlocks.negativePrompt,
      promptBlocks,
      scenePlan: plan,
      visualScore: item.score,
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
    stepNumber: 4,
    totalSteps: 4,
    stageName: '规划完成',
    message: `成功完成 ${results.length} 个镜头分镜规划！`,
    percent: 100,
  });

  return results;
}
