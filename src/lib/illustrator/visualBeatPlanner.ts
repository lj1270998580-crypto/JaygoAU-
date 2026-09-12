// =========================================================================
// 模块 3: Visual Beat Planner (视觉节拍规划器) - v2 修复版
// 核心修复:
//   1. Beat Consolidator 不再基于绝对时间 gap 合并（无 ASR 时 gap≈0 导致全部合并）
//      改为: 每个语义单元单独作为候选节拍，在后续预算求解中通过 minGap 约束筛选
//   2. routeVisualType 大幅扩充法律/公司法/公司架构/风险合规等关键词体系
//   3. 语义打分算法加强法律与商业内容的识别精度
// =========================================================================

import type { SemanticUnit, VisualBeat, VisualScoreBreakdown, VisualType } from './types';
import { isSalesPitch } from './semanticParser';
import type { IllustrationDensity } from '../../types';

export interface BeatPlannerOptions {
  density: IllustrationDensity;
  routingMode: 'smart' | 'infographic' | 'standard';
  totalDuration: number;
}

/**
 * 密集度与节奏配置
 */
export const DENSITY_BUDGETS: Record<
  IllustrationDensity,
  {
    targetInterval: number; // 目标平均间隔 (秒)
    minGap: number;         // 两张插图之间的最小呼吸间隔 (秒)
    minDuration: number;    // 单张插图最小展示时长
    maxDuration: number;    // 单张插图最大展示时长
    threshold: number;      // 基础入选分数线
  }
> = {
  sparse: {
    targetInterval: 20,
    minGap: 12,
    minDuration: 3.5,
    maxDuration: 4.5,
    threshold: 0.72,
  },
  standard: {
    targetInterval: 12,
    minGap: 6,
    minDuration: 3.0,
    maxDuration: 4.0,
    threshold: 0.58,  // 降低阈值，确保更多有价值内容入选
  },
  dense: {
    targetInterval: 7,
    minGap: 3.5,
    minDuration: 2.5,
    maxDuration: 3.5,
    threshold: 0.50,  // 密集模式更低阈值
  },
};

/**
 * 计算单个语义单元的 Visual Need Score (V)
 * V = 0.25 × Importance + 0.25 × Visualizability + 0.15 × Novelty
 *   + 0.10 × EmotionalIntensity + 0.15 × SceneChange + 0.10 × InformationDensity
 */
export function calculateVisualScore(unit: SemanticUnit): VisualScoreBreakdown {
  const imp = unit.importance;
  const vis = unit.visualizability;
  const nov = unit.novelty;
  const emo = unit.emotionalIntensity;
  const scn = unit.sceneChange;
  const inf = unit.informationDensity;

  const total =
    0.25 * imp +
    0.25 * vis +
    0.15 * nov +
    0.10 * emo +
    0.15 * scn +
    0.10 * inf;

  return {
    importance: Math.round(imp * 100) / 100,
    visualizability: Math.round(vis * 100) / 100,
    novelty: Math.round(nov * 100) / 100,
    emotionalIntensity: Math.round(emo * 100) / 100,
    sceneChange: Math.round(scn * 100) / 100,
    informationDensity: Math.round(inf * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

// =========================================================================
// 视觉类型分类用的语义特征（v3 修复）
//
// ⚠️ 此前历史判定用的是 /(年|代|世纪|王朝|战役|协议|条约|驶入|建立|起源|历史上)/，
// 其中裸「年」「代」「协议」「建立」过宽：
//   「股权代持」「代表人物」「去年」「时代」都会被判成历史重现。
// 而历史重现不在信息图集合 {data_stat, step_framework, vs_comparison} 内，
// 于是大量商业内容被路由成普通场景图 —— 这就是「商业化内容缺少信息图」的根因。
// 现将历史判定收紧为真正的历史语境词，并单独扩充商业结构特征。
// =========================================================================

/** 真正的历史语境（刻意收紧） */
const HISTORICAL_RE =
  /(世纪|王朝|朝代|古代|近代|民国|清代|清朝|明朝|宋朝|唐朝|汉朝|春秋|战国|封建|史料|历史上|当年|古人|旧时代|旧社会|战乱|条约|驶入|工业革命|文艺复兴)/;

/** 数据 / 金额 / 财务 —— 适合数据信息图 */
const DATA_RE =
  /(百分之|[0-9]+%|[0-9]+[万千亿百]元?|[0-9]+倍|[0-9]+折|同比|环比|营收|利润率|税率|财报|资产|欠了|欠款|亏损|债务|金额|万元|亿元|多少万|企业所得税|个人所得税|分红|免税|省钱|成本|利润|现金流|预算|费率)/;

/** 流程 / 架构 / 并列拆解 —— 适合步骤框架信息图 */
const FRAMEWORK_RE =
  /(第一步|第二步|第三步|第四步|第一|第二|第三|第四|其次|最后|流程|框架|架构|手册|体系|闭环|阶段|层级|分层|股权|控股|代持|实缴|三独立|独立|归集|布局|主体公司|项目公司|家族公司|防火墙公司|估值|怎么搭|怎么做|怎么设|分几步)/;

/** 并列 / 列举 —— 明确的「几条要点」结构 */
const ENUM_RE =
  /(三种|两类|分成|分为|第一种|第二种|第三种|几个要点|几个条件|几个步骤|几点|几个坑|三个方面|两个层面|四种|五种)/;

/** 对比 / 正反 / 风险红线 —— 适合对比信息图 */
const COMPARE_RE =
  /(区别|差异|对比|相比|优劣|正反|一方面|另一方面|而不是|误区|避坑|风险|违规|陷阱|穿透|击穿|横向穿透|纵向穿透|连带|追责|混同|失效|不达标|出事|破产|被追|被执行|被起诉|被认定|警告|注意|千万|禁止|别等|来不及|搭进去)/;

/** 因果结构 —— 也适合用结构化信息图表达 */
const CAUSAL_RE = /(因为.*所以|导致|造成|结果是|原因在于|从而|因此|才会|就会|一旦.*就)/;

/**
 * 视觉类型智能分类路由 (v3 - 收紧历史误判 + 扩充商业信息图特征)
 */
export function routeVisualType(
  unit: SemanticUnit,
  routingMode: 'smart' | 'infographic' | 'standard'
): VisualType {
  const text = unit.rawText;

  // 1. 若用户锁定为标准图模式
  if (routingMode === 'standard') {
    if (unit.isAbstract) return 'concept_metaphor';
    if (HISTORICAL_RE.test(text)) return 'historical_recreation';
    return 'scene_narrative';
  }

  // 2. 若用户锁定为全量信息图模式
  if (routingMode === 'infographic') {
    if (COMPARE_RE.test(text)) return 'vs_comparison';
    if (FRAMEWORK_RE.test(text) || ENUM_RE.test(text)) return 'step_framework';
    return 'data_stat';
  }

  // 3. 智能路由：商业结构优先识别为信息图（此处顺序决定信息图占比）
  // ——— 数据统计类 ———
  if (DATA_RE.test(text)) return 'data_stat';

  // ——— 步骤框架 / 并列拆解类 ———
  if (FRAMEWORK_RE.test(text) || ENUM_RE.test(text)) return 'step_framework';

  // ——— 正反对比 / 因果结构类 ———
  if (COMPARE_RE.test(text) || CAUSAL_RE.test(text)) return 'vs_comparison';

  // ——— 历史还原类（收紧后仅匹配真正的历史语境） ———
  if (HISTORICAL_RE.test(text)) return 'historical_recreation';

  // ——— 抽象概念 / 哲理隐喻类 ———
  if (unit.isAbstract || /(核心|本质|认知|真相|关键|底层|哲学|思维|方法论|逻辑)/.test(text)) {
    return 'concept_metaphor';
  }

  // ——— 默认场景叙事 ———
  return 'scene_narrative';
}

/**
 * 语义单元打分 - 增强版法律/商业内容识别
 */
function scoreSemanticContent(unit: SemanticUnit): VisualScoreBreakdown {
  const text = unit.rawText;

  // 法律与公司法内容拥有更高的 importance 和 visualizability
  const isLegalRisk = /(穿透|击穿|连带|追责|强制执行|被起诉|破产|债权人|人格混同|财务混同)/.test(text);
  const isCorporateStructure = /(四层架构|防火墙|三独立|实缴|家族公司|主体公司|控股|布局|股权|分红|税|资产|风险隔离)/.test(text);
  const isDataComparison = /([0-9]+[万千亿百]元?|[0-9]+%|200多万|329元|亏了|欠了|省钱|免税|20%)/.test(text);
  const isWarning = /(千万|注意|警惕|别等|来不及|以为.*结果|防火墙.*纸|一张网|全搭进去)/.test(text);
  const isCaseStory = /(老板|供应商|债权人|起诉|法院|执行|场景|真实)/.test(text);

  let imp = unit.importance;
  let vis = unit.visualizability;
  let nov = unit.novelty;
  let emo = unit.emotionalIntensity;
  let scn = unit.sceneChange;
  let inf = unit.informationDensity;

  if (isLegalRisk) { imp = Math.min(1, imp + 0.25); vis = Math.min(1, vis + 0.20); emo = Math.min(1, emo + 0.20); }
  if (isCorporateStructure) { imp = Math.min(1, imp + 0.20); inf = Math.min(1, inf + 0.25); scn = Math.min(1, scn + 0.15); }
  if (isDataComparison) { imp = Math.min(1, imp + 0.15); inf = Math.min(1, inf + 0.25); vis = Math.min(1, vis + 0.15); }
  if (isWarning) { emo = Math.min(1, emo + 0.30); imp = Math.min(1, imp + 0.20); }
  if (isCaseStory) { vis = Math.min(1, vis + 0.20); emo = Math.min(1, emo + 0.15); imp = Math.min(1, imp + 0.15); }

  const total =
    0.25 * imp +
    0.25 * vis +
    0.15 * nov +
    0.10 * emo +
    0.15 * scn +
    0.10 * inf;

  return {
    importance: Math.round(imp * 100) / 100,
    visualizability: Math.round(vis * 100) / 100,
    novelty: Math.round(nov * 100) / 100,
    emotionalIntensity: Math.round(emo * 100) / 100,
    sceneChange: Math.round(scn * 100) / 100,
    informationDensity: Math.round(inf * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * 规划视觉节拍核心流水线 - v2 修复版
 *
 * 关键修复：移除基于绝对时间 gap 的 Beat Consolidator
 * 原因：无 ASR 时各段落 gap≈0，会将所有片段合并成 1-2 个节拍
 * 新策略：每个语义单元作为独立候选，通过预算求解器 + minGap 约束来精选最优节拍
 */
export function planVisualBeats(
  units: SemanticUnit[],
  options: BeatPlannerOptions
): VisualBeat[] {
  if (!units || units.length === 0) return [];

  // 节拍级第二道闸门（v0.7.8 新增）
  // 此前全链路只有片段级一层过滤，节拍规划阶段没有任何准入判断；
  // 且片段=一个句子，命中即整句丢弃、未命中则整句放行，
  // 加上「低分同类型单元合并」会把推销句并进干货节拍 —— 推销内容于是仍会出图。
  // 这里在进入导演阶段前再兜一道。
  units = units.filter((u) => !isSalesPitch(u.rawText));
  if (units.length === 0) return [];

  const budget = DENSITY_BUDGETS[options.density] || DENSITY_BUDGETS.standard;

  // 使用最后一个单元的结束时间作为总时长（更准确）
  const estimatedDur = units[units.length - 1].time.end;
  const dur = options.totalDuration > 0
    ? Math.max(options.totalDuration, estimatedDur)
    : estimatedDur;

  // 1. 对每个语义单元独立评分
  const scoredUnits = units.map((u) => ({
    unit: u,
    score: scoreSemanticContent(u), // 使用增强版评分器
    visualType: routeVisualType(u, options.routingMode),
  }));

  // 2. 目标插图数量计算（基于视频时长与密度预算）
  const targetCount = Math.max(
    2,
    Math.min(
      Math.ceil(dur / budget.targetInterval),
      // 上限：不超过可用单元数的 80%（保留呼吸空间）
      Math.floor(scoredUnits.length * 0.8)
    )
  );

  // 3. 【已修复】不再使用时间 gap 合并，每个单元独立作为候选节拍
  //    只做轻量语义相似聚合：若连续两个单元属于同一视觉类型且都是低分，合并成一个
  const candidateBeats: Array<{
    sourceUnits: SemanticUnit[];
    combinedScore: VisualScoreBreakdown;
    visualType: VisualType;
  }> = [];

  let i = 0;
  while (i < scoredUnits.length) {
    const curr = scoredUnits[i];

    // 仅当当前和下一单元都低于阈值且视觉类型相同时才语义合并（避免信息过于碎片化）
    // 这样高价值内容各自独立成节拍，低价值内容可以合并跳过
    const next = i + 1 < scoredUnits.length ? scoredUnits[i + 1] : null;
    const shouldMergeWithNext =
      next &&
      curr.score.total < budget.threshold * 0.85 &&
      next.score.total < budget.threshold * 0.85 &&
      curr.visualType === next.visualType;

    if (shouldMergeWithNext && next) {
      candidateBeats.push({
        sourceUnits: [curr.unit, next.unit],
        combinedScore: averageScores([curr.score, next.score]),
        visualType: curr.visualType,
      });
      i += 2;
    } else {
      candidateBeats.push({
        sourceUnits: [curr.unit],
        combinedScore: curr.score,
        visualType: curr.visualType,
      });
      i += 1;
    }
  }

  // 4. 按 V 评分降序排列，然后用 minGap 约束贪心选取最优节拍集合
  const sortedCandidates = [...candidateBeats].sort(
    (a, b) => b.combinedScore.total - a.combinedScore.total
  );

  const selectedBeats: typeof candidateBeats = [];

  for (const candidate of sortedCandidates) {
    const candStart = candidate.sourceUnits[0].time.start;
    const candEnd = candidate.sourceUnits[candidate.sourceUnits.length - 1].time.end;

    // 检查与已选节拍是否存在时间重叠或间距不足
    const hasCollision = selectedBeats.some((sel) => {
      const selStart = sel.sourceUnits[0].time.start;
      const selEnd = sel.sourceUnits[sel.sourceUnits.length - 1].time.end;
      return (
        candStart < selEnd + budget.minGap &&
        candEnd > selStart - budget.minGap
      );
    });

    if (!hasCollision) {
      selectedBeats.push(candidate);
      if (selectedBeats.length >= targetCount) break;
    }
  }

  // 若结果过少（minGap 约束太严），放宽 50% 重试
  if (selectedBeats.length < Math.min(3, targetCount) && candidateBeats.length > selectedBeats.length) {
    const relaxedGap = budget.minGap * 0.5;
    const extraCandidates = sortedCandidates.filter(
      (c) => !selectedBeats.includes(c)
    );
    for (const candidate of extraCandidates) {
      const candStart = candidate.sourceUnits[0].time.start;
      const candEnd = candidate.sourceUnits[candidate.sourceUnits.length - 1].time.end;
      const hasCollision = selectedBeats.some((sel) => {
        const selStart = sel.sourceUnits[0].time.start;
        const selEnd = sel.sourceUnits[sel.sourceUnits.length - 1].time.end;
        return candStart < selEnd + relaxedGap && candEnd > selStart - relaxedGap;
      });
      if (!hasCollision) {
        selectedBeats.push(candidate);
        if (selectedBeats.length >= targetCount) break;
      }
    }
  }

  // 5. 按时间顺序排序，计算精准时间戳与提前量
  selectedBeats.sort((a, b) => a.sourceUnits[0].time.start - b.sourceUnits[0].time.start);

  const anticipationOffset = 0.25; // 提前 250ms 切入画面

  const finalBeats: VisualBeat[] = selectedBeats.map((b, idx) => {
    const firstUnit = b.sourceUnits[0];
    const lastUnit = b.sourceUnits[b.sourceUnits.length - 1];

    const contextStart = firstUnit.time.start;
    const unitDur = firstUnit.time.end - firstUnit.time.start;
    const semanticTrigger = Math.round((contextStart + Math.min(1.2, unitDur * 0.4)) * 100) / 100;

    // v0.7.11 修复：recommendedStart 必须同时钳制上下限。
    // 此前只写了 Math.max(0, ...) —— 当累计时间轴超出视频时长时（timelineAligner 每句
    // 强制最少 1.2 秒，句子多时累计时长会远超视频长度），recommendedStart 会大于 dur，
    // 而 recommendedEnd 被 Math.min(dur, ...) 钳到 dur，于是产生 start > end 的负时长分镜：
    //   预览 currentTime>=start && <=end 永远为假 → 永远不显示
    //   导出 enable='between(t,start,end)' 永远不触发 → 视频里也没有
    const maxStart = Math.max(0, Math.round((dur - budget.minDuration) * 10) / 10);
    const recommendedStart = Math.min(
      maxStart,
      Math.max(0, Math.round((semanticTrigger - anticipationOffset) * 10) / 10)
    );

    const duration = Math.min(budget.maxDuration, Math.max(budget.minDuration,
      Math.round((lastUnit.time.end - recommendedStart) * 10) / 10)
    );
    const recommendedEnd = Math.min(dur, Math.round((recommendedStart + duration) * 10) / 10);
    // 最终兜底：无论剩余时长多紧张，都保证 end 严格大于 start
    const safeEnd = Math.max(recommendedStart + 0.3, recommendedEnd);
    const sourceText = b.sourceUnits.map((u) => u.cleanText).join(' ');

    return {
      beatId: `VB_${String(idx + 1).padStart(2, '0')}`,
      sourceUnitIds: b.sourceUnits.map((u) => u.id),
      sourceText,
      timeline: {
        contextStart: Math.round(contextStart * 10) / 10,
        semanticTrigger,
        recommendedStart,
        recommendedEnd: Math.round(safeEnd * 10) / 10,
        duration: Math.round((safeEnd - recommendedStart) * 10) / 10,
      },
      score: b.combinedScore,
      visualType: b.visualType,
      priority: b.combinedScore.total >= 0.80 ? 'high' : b.combinedScore.total >= 0.62 ? 'medium' : 'low',
    };
  });

  // v0.7.29 修复：相邻分镜时间严格防重叠 pass。
  // 杜绝前一分镜 recommendedEnd 侵入后一分镜 recommendedStart，避免剪映拆分为多轨道并产生画面重叠
  for (let i = 0; i < finalBeats.length - 1; i++) {
    const cur = finalBeats[i];
    const next = finalBeats[i + 1];
    const maxAllowedEnd = Math.max(cur.timeline.recommendedStart + 0.8, Math.round((next.timeline.recommendedStart - 0.15) * 10) / 10);
    if (cur.timeline.recommendedEnd > maxAllowedEnd) {
      cur.timeline.recommendedEnd = maxAllowedEnd;
      cur.timeline.duration = Math.round((cur.timeline.recommendedEnd - cur.timeline.recommendedStart) * 10) / 10;
    }
  }

  return finalBeats;
}

function averageScores(scores: VisualScoreBreakdown[]): VisualScoreBreakdown {
  if (scores.length === 0) {
    return {
      importance: 0.7, visualizability: 0.7, novelty: 0.6,
      emotionalIntensity: 0.5, sceneChange: 0.5, informationDensity: 0.6, total: 0.65,
    };
  }
  const sum = scores.reduce(
    (acc, s) => ({
      importance: acc.importance + s.importance,
      visualizability: acc.visualizability + s.visualizability,
      novelty: acc.novelty + s.novelty,
      emotionalIntensity: acc.emotionalIntensity + s.emotionalIntensity,
      sceneChange: acc.sceneChange + s.sceneChange,
      informationDensity: acc.informationDensity + s.informationDensity,
      total: acc.total + s.total,
    }),
    { importance: 0, visualizability: 0, novelty: 0, emotionalIntensity: 0, sceneChange: 0, informationDensity: 0, total: 0 }
  );
  const len = scores.length;
  return {
    importance: Math.round((sum.importance / len) * 100) / 100,
    visualizability: Math.round((sum.visualizability / len) * 100) / 100,
    novelty: Math.round((sum.novelty / len) * 100) / 100,
    emotionalIntensity: Math.round((sum.emotionalIntensity / len) * 100) / 100,
    sceneChange: Math.round((sum.sceneChange / len) * 100) / 100,
    informationDensity: Math.round((sum.informationDensity / len) * 100) / 100,
    total: Math.round((sum.total / len) * 100) / 100,
  };
}
