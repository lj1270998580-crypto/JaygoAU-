import type { TimelineSegment } from './timelineAligner';
import type { ScenePlan, ShotType, VisualType } from './types';
import type { IllustrationDensity } from '../../types';
import { chatCompletion, resolveModelInfo } from '../modelHubService';
import { extractJsonArrayLoose, chunkArray } from './jsonExtract';
import { AdaptiveConcurrency, createAdaptiveConcurrency } from './modelConcurrency';
import { enforceVisualDiversity } from './visualDirector';
import { getStyleBible, STYLE_BIBLES, STYLE_PLANNER_GUIDANCE } from './styleBible';

/**
 * v0.7.15：语义解析 + 视觉导演 合并为**单次**大模型调用。
 *
 * 合并前是两段式：
 *   ① 语义解析（LLM）→ 逐句输出 subjects/action/visual_anchors + 6 项评分
 *   ② 视觉节拍规划（本地打分挑选）
 *   ③ 分镜导演（LLM）→ 再读一遍旁白，输出 scene/composition/emotion
 *
 * 问题很明显：同一段旁白被大模型读了两遍（第①步和第③步），第二遍拿到的
 * 还只是第①步压缩后的产物，信息在传递中被削掉了；两轮请求还意味着两倍的
 * 耗时与两倍的 TPM 消耗，更容易撞限流。
 *
 * 现在合并为一次调用：同一批旁白只送进模型一次，模型直接输出
 * 「这一句要不要配图 + 配什么图 + 怎么构图」的完整决策。
 *
 * 分工说明（与「一切交给大模型」不冲突）：
 *   - **内容判断**（值不值得配图、画什么、什么景别、什么风格）全部由大模型给出；
 *   - **时间轴算术**（最小间隔、最小时长、不重叠）仍由本地计算，
 *     这是纯粹的区间运算，不属于「关键词规则」。
 */

/** 单次请求处理的片段数量 */
const BATCH_SIZE = 6;

/** 各密集度对应的目标插图数量区间（张/分钟） */
const DENSITY_RATE: Record<IllustrationDensity, { perMinute: number; minGap: number; minDuration: number; maxDuration: number }> = {
  sparse: { perMinute: 3, minGap: 12, minDuration: 3.5, maxDuration: 4.5 },
  standard: { perMinute: 5, minGap: 6, minDuration: 3.0, maxDuration: 4.0 },
  dense: { perMinute: 8.5, minGap: 3.5, minDuration: 2.5, maxDuration: 3.5 },
};

const VISUAL_TYPES: VisualType[] = [
  'scene_narrative',
  'concept_metaphor',
  'data_stat',
  'step_framework',
  'vs_comparison',
  'historical_recreation',
  'product_showcase',
];

const SHOTS: ShotType[] = ['wide', 'medium', 'close', 'extreme_close', 'overhead'];
const ANGLES = ['eye_level', 'slightly_elevated', 'low_angle', 'top_down'] as const;
const SCALES = ['dominant', 'balanced', 'environmental'] as const;
const DEPTHS = ['deep', 'shallow', 'layered'] as const;

/** 合并规划的最终产物：一个可直接进入提示词编译的镜头 */
export interface UnifiedPlanItem {
  beatId: string;
  segId: string;
  startTime: number;
  endTime: number;
  sourceText: string;
  visualType: VisualType;
  score: number;
  priority: 'high' | 'medium' | 'low';
  /** 模型给出的配图理由，用于 UI 展示与问题排查 */
  reason: string;
  plan: ScenePlan;
}

/** 模型返回的单条原始结构（做尽量的宽容解析） */
interface RawItem {
  seg_id?: string;
  illustrate?: boolean;
  score?: number;
  visual_type?: string;
  communication_goal?: string;
  primary_subject?: string;
  action?: string;
  foreground?: string;
  background?: string;
  period?: string;
  weather_or_ambience?: string;
  shot?: string;
  camera_angle?: string;
  subject_scale?: string;
  depth?: string;
  emotion_primary?: string;
  emotion_secondary?: string;
  must_include?: string[];
  must_avoid?: string[];
  visual_anchors?: Array<{ concept?: string; priority?: number }>;
  text_labels?: string[];
  visual_elements?: Array<{ desc?: string; corresponds_to?: string }>;
  reason?: string;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(value ?? '').trim() as T;
  return allowed.includes(v) ? v : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function strArray(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * 执行合并规划。
 *
 * @param segments 已时间对齐的旁白片段
 * @param opts.density 密集度（决定总预算）
 * @param opts.videoDuration 视频总时长（秒）
 */
export async function planIllustrationsUnified(
  segments: TimelineSegment[],
  opts: {
    density: IllustrationDensity;
    videoDuration: number;
    modelHubSettings: any;
    /** v0.7.18：当前画风。规划阶段必须知道它，否则会出现「画风对但内容违和」 */
    styleId?: string;
    onBatch?: (done: number, total: number) => void;
  }
): Promise<UnifiedPlanItem[]> {
  const { density, videoDuration, modelHubSettings, styleId, onBatch } = opts;

  if (!segments || segments.length === 0) return [];
  if (!modelHubSettings) {
    throw new Error('未配置大模型服务，无法进行分镜规划。请先前往 [模型中心] 配置并启用一个供应商。');
  }

  const styleBlock = buildStyleBlock(styleId);

  const batches = chunkArray(segments, BATCH_SIZE);
  const totalBudget = resolveTotalBudget(density, videoDuration, batches.length);

  let completed = 0;
  onBatch?.(0, batches.length);

  const model = resolveActiveModelName(modelHubSettings);
  const ctrl = createAdaptiveConcurrency(model);

  // 每批的预算按片段占比分配，最后一批兜住余数，避免四舍五入把预算吞掉
  const perBatchBudget = batches.map((b, i) =>
    i === batches.length - 1
      ? Math.max(1, totalBudget - estimateBudget(batches.slice(0, i), segments.length, totalBudget))
      : Math.max(1, Math.round((totalBudget * b.length) / segments.length))
  );

  const batchItems = await ctrl.run(batches, async (batch, bi) => {
    const items = await planBatchWithRetry(batch, bi, modelHubSettings, perBatchBudget[bi], ctrl, batches.length, styleBlock);
    onBatch?.(++completed, batches.length);
    return items;
  });

  const all = batchItems.flat();

  const scheduled = selectAndSchedule(all, segments, density, videoDuration);

  // v0.7.15：跨批次统一执行构图多样性后处理。
  // 每个批次是独立请求，模型看不到其他批次用过什么景别，因此跨批次的
  // 景别/机位仍可能连续重复；这里做一次全局校正（只调整镜头语言，
  // 不改动模型决定的画面内容）。
  enforceVisualDiversity(scheduled.map((s) => s.plan));

  return scheduled;
}

function estimateBudget(done: TimelineSegment[][], totalSegments: number, totalBudget: number): number {
  const used = done.reduce((s, b) => s + b.length, 0);
  return Math.round((totalBudget * used) / Math.max(1, totalSegments));
}

/** 总预算：按时长与密集度换算，并给一个合理的上下限 */
function resolveTotalBudget(density: IllustrationDensity, videoDuration: number, batchCount: number): number {
  const cfg = DENSITY_RATE[density] || DENSITY_RATE.standard;
  const minutes = Math.max(0.25, videoDuration / 60);
  const raw = Math.round(minutes * cfg.perMinute);
  // 下限 3 张（再少就不叫配图了），上限不超过批次数 × 每批 4 张（避免模型被迫硬凑）
  const upper = Math.max(3, batchCount * 4);
  return Math.max(3, Math.min(upper, raw));
}

async function planBatchWithRetry(
  batch: TimelineSegment[],
  batchIndex: number,
  modelHubSettings: any,
  budget: number,
  ctrl: AdaptiveConcurrency,
  totalBatches: number,
  styleBlock: string
): Promise<UnifiedPlanItem[]> {
  const MAX_ATTEMPTS = 3;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const items = await planBatchOnce(batch, batchIndex, modelHubSettings, budget, styleBlock);
      if (items) return items;
      lastErr = new Error('模型未返回可解析的 JSON 结果');
    } catch (err: any) {
      lastErr = err;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  throw new Error(
    `分镜规划第 ${batchIndex + 1}/${totalBatches} 批在 ${MAX_ATTEMPTS} 次尝试后仍失败：${lastErr?.message || lastErr}`
  );
}

async function planBatchOnce(
  batch: TimelineSegment[],
  batchIndex: number,
  modelHubSettings: any,
  budget: number,
  styleBlock: string
): Promise<UnifiedPlanItem[] | null> {
  const promptList = batch.map((s, idx) => ({
    seg_id: `SU_${String(batchIndex * BATCH_SIZE + idx + 1).padStart(2, '0')}`,
    时间起: Number(s.startTime.toFixed(2)),
    时间止: Number(s.endTime.toFixed(2)),
    旁白: s.text,
  }));

  const systemPrompt = `你是一位世界级的视频视觉导演，同时具备极强的中文语义理解能力。
你的任务：读一段口播旁白，直接决定「这一句要不要配图、配什么图、怎么构图」。

【第一步 —— 先听懂，再判断】
旁白来自语音识别，**一定存在同音字错误**。你必须先根据上下文还原真实含义，再据此设计画面。
例如：「不要用自己的粤语碰别人的专业」实为「不要用自己的业余挑战别人的专业」；
「拍脑袋」被识别成「拍老门」、「金税四期」被识别成「今世」、「轮胎」被识别成「人胎」，
都属于同类错误。**不要照着错别字画图**。

【第二步 —— 决定要不要配图】
不是每句话都值得配图。以下情况 illustrate 应为 false：
- 口头禅、寒暄、语气词、无信息量的过渡句（如「好了」「其实呢」「对吧」「嗯 对 不对」）
- 与相邻句子表达同一件事、画面会高度重复的句子
- 纯情绪感叹、没有可视内容的句子
值得配图的是：有具体信息、有数据、有对比、有步骤、有明确场景或强比喻的句子。
本批共 ${batch.length} 句，请从中挑选**大约 ${budget} 句**配图（可上下浮动 1 句）。

【第三步 —— 设计画面】
画面必须让观众在 1 秒内看懂这句话在讲什么。
用具体物理实体、真实场景、人物姿态与环境来构建，不要悬浮的抽象符号。
${styleBlock}

【反同质化 —— 极其重要，实测最容易被违反的一条】
最容易出现的毛病不是「主体重复」，而是**构图套路重复**：
一讲对比就画「左右分栏」，一讲钱就画「成堆现金」，一讲流程就画「从左到右箭头」。
这类画面单独看没问题，连着放六张就会显得极其廉价。
因此：
- 同一批内，**最多只能有 1 张**使用「左右分栏 / 左右对半」的构图。
- 同一批内，**最多只能有 1 张**使用「成堆现金 / 钞票」作为主体。
- 同一批内，**最多只能有 1 张**使用「文档 + 印章 + 身份证平铺桌面（overhead）」的套路。
- 表达「对比」时，优先想别的视觉方案：天平、岔路口、两个人背向而立、
  一高一矮两栋楼、同一只手拿两样东西、镜面反射、温度计刻度……
  左右分栏只是众多方案里最偷懒的一种。
- 表达「金额」时，优先用具象场景（合同上的数字、计算器屏幕、账户余额界面、
  房产证上的金额）而不是钞票堆。
- 连续两个分镜的 shot 不得相同；整批里 wide / medium / close / overhead 都要用到。
- 相邻分镜的 primary_subject 与 background 不得雷同。

【语言要求 —— 硬性】
所有字段值必须使用**简体中文**。目标生图模型是中文原生模型。
visual_anchors 的 concept 也必须是中文。

visual_type 只能取以下值之一：
scene_narrative(场景叙事) / concept_metaphor(概念隐喻) / data_stat(数据图表)
/ step_framework(步骤流程) / vs_comparison(正反对比) / historical_recreation(历史重现)
/ product_showcase(实体陈列)

shot 只能取：wide / medium / close / extreme_close / overhead
camera_angle 只能取：eye_level / slightly_elevated / low_angle / top_down
subject_scale 只能取：dominant / balanced / environmental
depth 只能取：deep / shallow / layered

【text_labels —— 极其重要】
只写**确实需要出现在画面上**的少量文字，宁可少不可多。
优先硬信息（数字、金额、百分比、专有名词），最多 3 条，每条不超过 10 个字。
绝大多数分镜应该留空数组 []。不需要文字就不要写。

【visual_elements】
描述画面中要出现的图标或图形元素时，必须写清**具体图形内容**，
不要只写「一个图标」。例如写「一栋带红色屋顶的独栋房子插画」而不是「房子图标」。
每个元素用 corresponds_to 说明它对应哪条文字或哪个概念。

只返回严格的 JSON 数组，每个输入片段对应一个元素，顺序与输入一致：
[
  {
    "seg_id": "SU_01",
    "illustrate": true,
    "score": 0.82,
    "reason": "给出了具体的税负对比，值得配图",
    "visual_type": "vs_comparison",
    "communication_goal": "1秒读懂：公司持有房产与个人持有的税负差异",
    "primary_subject": "一张分成左右两半的对比桌面",
    "action": "左侧堆放公司文件与印章，右侧放着身份证与房产证",
    "foreground": "桌面上的计算器与一叠发票",
    "background": "简洁的浅灰色办公室墙面",
    "period": "",
    "weather_or_ambience": "明亮的顶光，冷静理性",
    "shot": "overhead",
    "camera_angle": "top_down",
    "subject_scale": "balanced",
    "depth": "layered",
    "emotion_primary": "理性",
    "emotion_secondary": "审慎",
    "must_include": ["公司印章", "身份证", "房产证"],
    "must_avoid": ["美元符号", "杂乱文字", "悬浮图标"],
    "visual_anchors": [
      { "concept": "左右分栏的税负对比桌面", "priority": 1.0 },
      { "concept": "公司印章与房产证的对峙", "priority": 0.8 }
    ],
    "text_labels": ["公司买房", "个人买房"],
    "visual_elements": [
      { "desc": "一枚红色圆形公司印章插画", "corresponds_to": "公司买房" }
    ]
  }
]
不要输出任何解释文字或 markdown 代码块。`;

  const userPrompt = `请处理以下 ${batch.length} 个旁白片段（必须返回 ${batch.length} 个元素，seg_id 与输入一一对应）：\n${JSON.stringify(promptList, null, 2)}`;

  const responseText = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.5, maxTokens: 8192, rejectTruncation: true },
    modelHubSettings
  );

  const extraction = extractJsonArrayLoose<RawItem>(responseText);
  if (!extraction.ok || extraction.items.length === 0) return null;

  const out: UnifiedPlanItem[] = [];
  batch.forEach((seg, localIdx) => {
    const expectedId = `SU_${String(batchIndex * BATCH_SIZE + localIdx + 1).padStart(2, '0')}`;
    const raw =
      extraction.items.find((it) => it && it.seg_id === expectedId) ||
      extraction.items[localIdx];
    if (!raw) return;
    // 模型明确说不需要配图 → 跳过（这是合并后新增的能力）
    if (raw.illustrate === false) return;

    const visualType = pickEnum<VisualType>(raw.visual_type, VISUAL_TYPES, 'scene_narrative');
    const shot = pickEnum<ShotType>(raw.shot, SHOTS, 'medium');
    const cameraAngle = pickEnum(raw.camera_angle, ANGLES, 'eye_level');
    const subjectScale = pickEnum(raw.subject_scale, SCALES, 'balanced');
    const depth = pickEnum(raw.depth, DEPTHS, 'layered');

    const anchors = Array.isArray(raw.visual_anchors)
      ? raw.visual_anchors
          .map((a) => ({ concept: str(a?.concept), priority: typeof a?.priority === 'number' ? a.priority : 0.7 }))
          .filter((a) => a.concept)
          .slice(0, 4)
      : [];

    const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? Math.max(0, Math.min(1, raw.score)) : 0.7;

    const plan: ScenePlan = {
      beatId: expectedId,
      communicationGoal: str(raw.communication_goal, `1秒读懂：${seg.text.slice(0, 16)}`),
      visualType,
      scene: {
        primarySubject: str(raw.primary_subject, seg.text.slice(0, 12)),
        action: str(raw.action, '静态呈现'),
        foreground: str(raw.foreground, ''),
        background: str(raw.background, '简洁的室内环境'),
        period: str(raw.period, ''),
        weatherOrAmbience: str(raw.weather_or_ambience, ''),
      },
      composition: { shot, cameraAngle, subjectScale, depth },
      emotion: {
        primary: str(raw.emotion_primary, '平实'),
        secondary: str(raw.emotion_secondary, '') || undefined,
      },
      mustInclude: strArray(raw.must_include, 6),
      mustAvoid: strArray(raw.must_avoid, 6),
      visualAnchors: anchors,
      textLabels: strArray(raw.text_labels, 3),
      visualElements: Array.isArray(raw.visual_elements)
        ? raw.visual_elements
            .map((e) => ({ desc: str(e?.desc), corresponds_to: str(e?.corresponds_to, '') }))
            .filter((e) => e.desc)
            .slice(0, 5)
        : [],
    };

    out.push({
      beatId: expectedId,
      segId: expectedId,
      startTime: seg.startTime,
      endTime: seg.endTime,
      sourceText: seg.text,
      visualType,
      score,
      priority: score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : 'low',
      reason: str(raw.reason, ''),
      plan,
    });
  });

  return out;
}

/**
 * 从模型给出的候选中挑选最终镜头，并计算互不重叠的时间区间。
 *
 * 内容判断（要不要配图、画什么）完全由模型给出；这里只做两件事：
 *   1. 候选数超过预算时，按模型自评分从高到低取舍；
 *   2. 计算不重叠的展示区间（纯区间运算，非内容规则）。
 */
function selectAndSchedule(
  candidates: UnifiedPlanItem[],
  segments: TimelineSegment[],
  density: IllustrationDensity,
  videoDuration: number
): UnifiedPlanItem[] {
  const cfg = DENSITY_RATE[density] || DENSITY_RATE.standard;
  const budget = resolveTotalBudget(density, videoDuration, Math.ceil(segments.length / BATCH_SIZE));

  // 按分数优先，同分按时间先后
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.startTime - b.startTime);

  const chosen: UnifiedPlanItem[] = [];
  for (const item of ranked) {
    if (chosen.length >= budget) break;
    // 最小间隔：与已选中的任一镜头冲突则跳过
    const conflict = chosen.some(
      (c) => Math.abs(c.startTime - item.startTime) < cfg.minGap
    );
    if (conflict) continue;
    chosen.push(item);
  }

  // 恢复时间顺序
  chosen.sort((a, b) => a.startTime - b.startTime);

  // 计算展示区间：以片段自身时长为基准，钳制到 [minDuration, maxDuration]，且不重叠
  const limit = videoDuration > 0 ? videoDuration : Number.POSITIVE_INFINITY;
  const scheduled: UnifiedPlanItem[] = [];
  for (let i = 0; i < chosen.length; i++) {
    const it = chosen[i];
    const next = chosen[i + 1];
    let start = Math.max(0, it.startTime);
    let end = it.endTime;

    // 太短则补足到最小时长；太长则截到最大时长
    if (end - start < cfg.minDuration) end = start + cfg.minDuration;
    if (end - start > cfg.maxDuration) end = start + cfg.maxDuration;

    // 不超过下一个镜头的起点（各留 0.2 秒交接）
    if (next) {
      const cap = Math.max(start + 0.8, next.startTime - 0.2);
      if (end > cap) end = cap;
    }
    // 不超过视频总时长
    if (end > limit) end = limit;
    // 最终安全兜底
    if (end - start < 0.8) {
      end = Math.min(limit, start + Math.max(0.8, cfg.minDuration));
    }
    if (end <= start) {
      start = Math.max(0, end - Math.max(0.8, cfg.minDuration));
    }

    scheduled.push({ ...it, startTime: start, endTime: end });
  }

  return scheduled;
}

/** 安全解析当前生效的模型名，失败时返回空串（由并发控制器回落到保守值） */
function resolveActiveModelName(settings: any): string {
  if (!settings) return '';
  try {
    return resolveModelInfo(settings)?.model || '';
  } catch {
    return '';
  }
}

/**
 * v0.7.18：构造注入规划提示词的「画风约束」段落。
 *
 * 这是修「画风对但内容违和」的核心。此前风格只写进出图提示词，
 * 规划阶段完全不知道用户选了什么，于是选水墨风照样会规划出现代白板表格。
 */
export function buildStyleBlock(styleId?: string): string {
  const bible = getStyleBible(styleId);
  const guide = STYLE_PLANNER_GUIDANCE[bible.styleId];
  const lines: string[] = [];
  lines.push('');
  lines.push('【本片画风约束 —— 必须遵守】');
  lines.push(`全片统一使用【${bible.label}】画风：${bible.visualMedium}`);
  if (guide) {
    lines.push(
      `该画风下，优先选择这类主体与道具：${guide.suitableSubjects.join('、')}。`
    );
    lines.push(
      `该画风下，**禁止**规划这些主体：${guide.avoidSubjects.join('、')}。` +
        `如果某句旁白本身就在讲这些被禁止的事物，请用同一含义的、符合画风的实体来转译表达，` +
        `而不是照搬现代物件。`
    );
  }
  lines.push('不同画风对同一句话的取景完全不同，你的主体选择必须贴合上述画风。');
  return lines.join('\n');
}

/**
 * v0.7.18：根据文案内容推荐一个画风。
 *
 * 只跑一次、读全文，返回一个全局风格 —— 绝不能按句/按批推荐，
 * 否则同一条视频里会出现多种画风，整片直接废掉。
 */
export async function recommendStyle(
  scriptText: string,
  modelHubSettings: any,
  availableStyleIds: string[]
): Promise<{ styleId: string; reason: string; alternatives: string[] }> {
  if (!modelHubSettings) {
    throw new Error('未配置大模型服务，无法推荐画风。');
  }
  const catalog = availableStyleIds
    .map((id) => {
      const b = STYLE_BIBLES[id];
      return b ? `- ${id}：${b.label} —— ${b.visualMedium}` : null;
    })
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `你是一位短视频视觉总监，负责为一条口播视频选定**全片统一**的画风。

【可选画风】
${catalog}

【判断依据】
- 题材调性：财经/职场/知识科普 vs 历史人文 vs 情感生活 vs 科技前沿
- 内容形态：如果是数据、对比、流程图为主，优先考虑信息图表类画风；
  如果是人物故事、场景叙事为主，优先考虑插画/写实类画风
- 受众与平台：面向大众的知识口播，画风要清晰易读、不喧宾夺主

【重要】
全片只能用**一个**画风，所以请选最能覆盖整条视频的，而不是只看开头几句。

只返回严格的 JSON，不要任何解释文字或 markdown：
{ "style_id": "上面列表里的 id", "reason": "一句话说明为什么适合（30字以内）", "alternatives": ["次选 id", "再次选 id"] }`;

  const text = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请为以下口播文案推荐一个全片画风：\n\n${scriptText.slice(0, 6000)}` },
    ],
    { temperature: 0.3, maxTokens: 512, rejectTruncation: false },
    modelHubSettings
  );

  // 宽容提取单个 JSON 对象
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('模型未返回可解析的推荐结果');
  let parsed: any;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    throw new Error('模型返回的推荐结果不是合法 JSON');
  }

  const pick = String(parsed?.style_id || '').trim();
  const styleId = availableStyleIds.includes(pick) ? pick : availableStyleIds[0];
  const alternatives = Array.isArray(parsed?.alternatives)
    ? parsed.alternatives.map((a: any) => String(a).trim()).filter((a: string) => availableStyleIds.includes(a)).slice(0, 2)
    : [];

  return {
    styleId,
    reason: typeof parsed?.reason === 'string' ? parsed.reason.trim().slice(0, 40) : '',
    alternatives,
  };
}
