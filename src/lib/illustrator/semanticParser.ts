// =========================================================================
// 模块 2: Semantic Parser (语义事件解析器) - v3 中文母语 + 分片批处理
// 职责：将口播文案转化为原子语义事件 (Semantic Units)，提取物理主体、动作、实体道具与时空特征
// 严禁决定是否生成图片（那是 Visual Beat Planner 的工作）
//
// v3 升级：
// 1. 提示词全面中文化（原为英文，与中文生图模型及 StyleBible 不一致）
// 2. 分片批处理 + 截断二分重试
// 3. 宽容 JSON 提取（括号配平 + 截断抢救），不再依赖贪婪正则
// =========================================================================

import type { SemanticUnit } from './types';
import type { TimelineSegment } from './timelineAligner';
import { chatCompletion, resolveModelInfo } from '../modelHubService';
import { extractJsonArrayLoose, chunkArray } from './jsonExtract';
import { AdaptiveConcurrency, createAdaptiveConcurrency } from './modelConcurrency';

/** 安全解析当前生效的模型名，失败时返回空串（由并发控制器回落到保守值） */
function resolveActiveModelName(settings: any): string {
  if (!settings) return '';
  try {
    return resolveModelInfo(settings)?.model || '';
  } catch {
    return '';
  }
}

// -------------------------------------------------------------------------
// 营销推销话术过滤（v0.7.8 重构）
//
// 此前只有一条正则，对 27 条真实带货话术的拦截率仅 22%，主要缺口：
//   「扣个1」（原 `扣[0-9]` 被"个"断开）、「评论区扣666」、「领取资料」
//   （原只有"领资料"）、「名额有限/先到先得/仅限前50名」、「原价…现在…」、
//   「买它」「三连」「感谢大家观看」「需要的朋友」等。
//
// 同时改为**两级判定**，避免像「关注我」这类软标记误杀整句干货：
//   · 硬标记（明确带货/引流）→ 直接判定为推销
//   · 软标记（招呼/互动引导）→ 仅当该句本身很短（≤20 字）时才判定为推销
// -------------------------------------------------------------------------

/** 硬性推销标记：出现即判定该句为推销/带货内容 */
export const SALES_PITCH_HARD_REGEX =
  /(购买课程|点击下方|小黄车|购物车|下单|拍下|去买|买它|橱窗|私信|粉丝群|粉丝团|福利价|秒杀|原价.{0,12}(现价|现在|只要)|打折|左下角|下方链接|链接在|领\s*取?\s*资料|扣\s*个?\s*[0-9]|评论区.{0,6}(扣|回复|留言)|关注直播间|赶紧抢|优惠券|扫码|加.{0,6}(微信|群)|入群|三晚直播|纯干货.*名额|限额|名额有限|仅限.{0,8}名|先到先得|还加赠|报名|内部课|私房课|股权.*元|合规.*元|[0-9]+元.{0,8}课程|课程.{0,8}[0-9]+元|今天拍下|只要\s*[0-9]+|最后\s*[0-9]+\s*个名额|我在.*等你)/;

/** 软性标记：招呼/互动引导，单独出现不足以判定整句是推销 */
export const SALES_PITCH_SOFT_REGEX =
  /(关注我|点赞|收藏|转发|三连|家人们|感谢大家观看|感谢观看|需要的朋友|不迷路|限时|福利)/;

/** 兼容旧引用名 */
export const SALES_PITCH_REGEX = SALES_PITCH_HARD_REGEX;

/** 软标记判定时允许的最大句子长度（去标点后） */
const SOFT_SALES_MAX_CHARS = 20;

/**
 * 判断一段文案是否属于营销推销/带货内容
 */
export function isSalesPitch(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (SALES_PITCH_HARD_REGEX.test(t)) return true;
  if (SALES_PITCH_SOFT_REGEX.test(t)) {
    const bare = t.replace(/[\s，。！？、；：""''（）《》【】…—\-]/g, '');
    return bare.length <= SOFT_SALES_MAX_CHARS;
  }
  return false;
}

// 寒暄客套过滤正则
// v0.7.8 修复：原正则用 ^...$ 全匹配，导致「关注我，带你了解更多」这类
// 「招呼语 + 正文」的句子完全不命中。改为前缀匹配。
export const GREETING_REGEX =
  /^(大家好|欢迎大家|点赞关注|欢迎点赞|关注我|哈喽|感谢大家|感谢观看|我是[^\s，。]{0,4})([，。！？!\s]|$)/;

/**
 * 将时间对齐的文案切片解析为原子语义单元
 */
export async function parseSemanticUnits(
  segments: TimelineSegment[],
  modelHubSettings?: any,
  onBatch?: (done: number, total: number) => void
): Promise<SemanticUnit[]> {
  if (!segments || segments.length === 0) return [];

  // 1. 初步预过滤：剔除纯营销推销与纯寒暄
  // v0.7.8：改用 isSalesPitch（硬标记直接丢 / 软标记仅短句丢），避免误杀整句干货
  const candidateSegments = segments.filter((seg) => {
    const t = seg.text.trim();
    if (t.length < 4) return false;
    if (isSalesPitch(t)) return false;
    if (GREETING_REGEX.test(t) || (t.length < 12 && /(大家好|欢迎大家|记得点赞|点个关注)/.test(t))) return false;
    return true;
  });

  if (candidateSegments.length === 0) return [];

  // 2. 语义事件解析。
  //
  // v0.7.14：彻底移除「本地关键词规则兜底」。
  // 用户明确指出本地规则覆盖面太窄、判定不精准，要求内容一律由大模型产出。
  // 因此这里不再 catch 后返回 parseWithLocalRules，而是让错误直接向上抛，
  // 由 UI 明确告知「哪一批、为什么失败」，而不是悄悄给出一份劣质结果。
  if (!modelHubSettings) {
    throw new Error('未配置大模型服务，无法进行语义解析。请先前往 [模型中心] 配置并启用一个供应商。');
  }

  const unitsFromLLM = await parseWithLLM(candidateSegments, modelHubSettings, onBatch);
  if (!unitsFromLLM || unitsFromLLM.length === 0) {
    throw new Error('大模型未返回可用的语义解析结果，请检查模型配置或稍后重试。');
  }
  return unitsFromLLM;
}

/**
 * 通过大模型进行语义事件解析
 */
/**
 * 单次请求处理的片段数量。
 * v0.7.10：由 10 回调到 5 —— 服务商限制的是【每分钟 Token 数 (TPM)】，
 * 批量越大单次消耗的 token 越多，越容易直接撞上限。小批量 + 串行才稳。
 */
const LLM_BATCH_SIZE = 5;
const MAX_SPLIT_DEPTH = 4;

async function parseWithLLM(
  segments: TimelineSegment[],
  modelHubSettings: any,
  onBatch?: (done: number, total: number) => void,
  onCall?: (stage: string) => void
): Promise<SemanticUnit[] | null> {
  const batches = chunkArray(segments, LLM_BATCH_SIZE);
  let completed = 0;
  onBatch?.(0, batches.length);

  // v0.7.14：并发按模型 TPM 额度自适应，撞限流立即降级为串行。
  // 内容一律由大模型产出——不再有「本批改用本地关键词规则」的降级路径
  // （用户明确要求：本地规则覆盖面太窄、不精准）。单批失败改为**重试**，
  // 重试仍失败才抛出，让用户在实时状态里看到到底哪一次调用挂了。
  const model = resolveActiveModelName(modelHubSettings);
  const ctrl = createAdaptiveConcurrency(model);

  const results = await ctrl.run(batches, async (batch, bi) => {
    const units = await parseBatchWithRetry(batch, bi * LLM_BATCH_SIZE, modelHubSettings, ctrl, bi + 1, batches.length);
    onBatch?.(++completed, batches.length);
    return units;
  });

  return results.flat();
}

/**
 * 单批解析 + 有限次重试。
 * 失败直接抛出（不再静默降级到本地规则），错误信息里带上批次位置便于定位。
 */
async function parseBatchWithRetry(
  batch: TimelineSegment[],
  globalOffset: number,
  modelHubSettings: any,
  ctrl: AdaptiveConcurrency,
  batchNo: number,
  totalBatches: number
): Promise<SemanticUnit[]> {
  const MAX_ATTEMPTS = 3;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const units = await parseBatchWithSplit(batch, globalOffset, modelHubSettings, 0);
      if (units && units.length === batch.length) {
        return units;
      }
      lastErr = new Error(`模型返回的条目数与输入不匹配（期望 ${batch.length}，实际 ${units?.length ?? 0}）`);
    } catch (err: any) {
      lastErr = err;
    }
    if (attempt < MAX_ATTEMPTS) {
      // 线性退避：给额度恢复留时间
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  throw new Error(
    `语义解析第 ${batchNo}/${totalBatches} 批在 ${MAX_ATTEMPTS} 次尝试后仍失败：${lastErr?.message || lastErr}`
  );
}

/**
 * 单批解析；截断时二分重试，避免整条流水线因一批超限而整体退化
 */
async function parseBatchWithSplit(
  segments: TimelineSegment[],
  globalOffset: number,
  modelHubSettings: any,
  depth: number
): Promise<SemanticUnit[] | null> {
  try {
    return await parseChunkWithLLM(segments, globalOffset, modelHubSettings);
  } catch (err: any) {
    if (err?.name === 'LlmTruncationError' && segments.length > 1 && depth < MAX_SPLIT_DEPTH) {
      const mid = Math.ceil(segments.length / 2);
      const head = await parseBatchWithSplit(segments.slice(0, mid), globalOffset, modelHubSettings, depth + 1);
      if (!head) throw err;
      const tail = await parseBatchWithSplit(segments.slice(mid), globalOffset + mid, modelHubSettings, depth + 1);
      if (!tail) throw err;
      return [...head, ...tail];
    }
    throw err;
  }
}

/**
 * 单批（不做二分）的语义解析
 */
async function parseChunkWithLLM(
  segments: TimelineSegment[],
  globalOffset: number,
  modelHubSettings: any
): Promise<SemanticUnit[] | null> {
  const promptList = segments.map((s, idx) => ({
    seg_id: `SU_${String(globalOffset + idx + 1).padStart(2, '0')}`,
    时间起: s.startTime,
    时间止: s.endTime,
    旁白: s.text,
  }));

  const systemPrompt = `你是一位专业的视频语义分析师与视觉叙事专家。
你的任务不是生成图片。
你的任务是把旁白片段拆解为带有深度视觉理解的原子语义事件。

【核心原则】理解**含义**，而不是只做关键词匹配。
- 「这家公司最后被迫宣布破产」→ 不要只匹配"公司"+"破产"，要理解这意味着：空荡的办公室、抱着纸箱离开的员工、紧闭的门、萧条感。
- 「穿透制度」→ 不要只匹配关键词，要理解这意味着：一张连接多家公司的法律之网、债权人穿过公司层级追索。

【语言要求 —— 极其重要】
- 所有字段值必须使用**简体中文**。这是硬性要求。
- 不要输出英文描述。后续生图模型是中文原生模型。
- visual_anchors 的 concept 必须是中文。

请为每个事件识别：
1. subjects：核心行为者或关键实体 [{ name, type: 'person' | 'object' | 'concept' | 'organization' }]
2. action：正在发生什么（简洁的动词短语）
3. objects：关键实体道具或可触物件 [{ name, type }]
4. location：物理场所（若提及或可合理推断）
5. timePeriod：历史年代或时代背景（若提及）
6. isAbstract：布尔值（仅当是纯哲理抒情、无任何具体动作时才为 true；法律/商业内容一律为 false）
7. visual_goal：一句话描述观众应该在 1 秒内**看到并感受到**什么（这是最重要的字段）
8. visual_anchors：2~4 个**中文**视觉概念，是让观众一眼认出这段旁白的最关键视觉元素，每个带 priority（0.0~1.0）
9. 多维评分（0.0 ~ 1.0）：
   - importance：该事件对核心叙事的必要程度
   - visualizability：用具体实体人物呈现的难易程度
   - novelty：是否引入新概念或转折
   - emotionalIntensity：情绪强度或张力
   - sceneChange：环境或主体切换幅度
   - informationDensity：事实/数据信息的丰富度

只返回严格的 JSON 数组，格式如下：
[
  {
    "id": "SU_01",
    "subjects": [{ "name": "...", "type": "person" }],
    "action": "...",
    "objects": [{ "name": "...", "type": "object" }],
    "location": "...",
    "timePeriod": "...",
    "isAbstract": false,
    "visual_goal": "一张连接多栋公司大楼的法律之网，象征穿透制度",
    "visual_anchors": [
      { "concept": "连接多栋公司大楼的法律之网", "priority": 1.0 },
      { "concept": "债权人指向彼此关联的公司", "priority": 0.8 }
    ],
    "importance": 0.85,
    "visualizability": 0.90,
    "novelty": 0.70,
    "emotionalIntensity": 0.60,
    "sceneChange": 0.80,
    "informationDensity": 0.75
  }
]
不要输出任何解释文字。`;

  const userPrompt = `请分析以下视频旁白片段（共 ${segments.length} 个，必须返回同样数量的数组元素）：\n${JSON.stringify(promptList, null, 2)}`;

  const responseText = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2, rejectTruncation: true },
    modelHubSettings
  );

  // 宽容提取：括号配平扫描 + 截断抢救
  const extraction = extractJsonArrayLoose<any>(responseText);
  if (!extraction.ok || extraction.items.length === 0) return null;

  // 映射回带时间戳的完整 SemanticUnit
  return segments.map((seg, localIdx) => {
    const idx = globalOffset + localIdx;
    const expectedId = `SU_${String(idx + 1).padStart(2, '0')}`;
    const item =
      extraction.items[localIdx] ||
      extraction.items.find((p: any) => p && p.id === expectedId) ||
      {};
    return {
      id: item.id || expectedId,
      time: { start: seg.startTime, end: seg.endTime },
      rawText: seg.text,
      cleanText: seg.text.replace(/^[，,；;\s]+|[，,；;\s]+$/g, ''),
      subjects: Array.isArray(item.subjects) && item.subjects.length > 0
        ? item.subjects
        : [{ name: keyPhraseOf(seg.text), type: 'concept' as const }],
      action: item.action || `围绕「${keyPhraseOf(seg.text)}」展开`,
      objects: Array.isArray(item.objects) ? item.objects : [],
      location: item.location || undefined,
      timePeriod: item.timePeriod || undefined,
      isAbstract: typeof item.isAbstract === 'boolean' ? item.isAbstract : false,
      importance: typeof item.importance === 'number' ? item.importance : 0.7,
      visualizability: typeof item.visualizability === 'number' ? item.visualizability : 0.75,
      novelty: typeof item.novelty === 'number' ? item.novelty : 0.6,
      emotionalIntensity: typeof item.emotionalIntensity === 'number' ? item.emotionalIntensity : 0.5,
      sceneChange: typeof item.sceneChange === 'number' ? item.sceneChange : 0.5,
      informationDensity: typeof item.informationDensity === 'number' ? item.informationDensity : 0.6,
      // 语义理解增强字段
      visualGoal: typeof item.visual_goal === 'string' ? item.visual_goal : undefined,
      visualAnchors: Array.isArray(item.visual_anchors) ? item.visual_anchors : undefined,
    };
  });
}

/**
 * 取旁白的关键短语，用于兜底字段，避免所有片段共用同一句默认值
 */
function keyPhraseOf(text: string): string {
  const first = (text || '').split(/[，。！？；、]/).map((s) => s.trim()).filter((s) => s.length >= 4)[0];
  const base = first || (text || '').replace(/[\s，。！？、；：""''（）《》【】…—\-]/g, '');
  if (!base) return '当前内容';
  return base.length > 12 ? base.slice(0, 12) : base;
}

/**
 * 本地高精度规则解析兜底 - v2 (大幅扩充法律/公司架构/风险合规关键词)
 */
function parseWithLocalRules(segments: TimelineSegment[]): SemanticUnit[] {
  return segments.map((seg, idx) => {
    const text = seg.text;

    // ——— 内容特征研判（分类器） ———
    // 数据统计类
    const isData = /(百分之|[0-9]+%|[0-9]+[万千亿百]元?|[0-9]+倍|[0-9]+折|同比|环比|营收|利润率|税率|财报|200多万|20%|亿元|千元|万元|省钱|免税|享受.*税|企业所得税|个人所得税|扣税)/.test(text);
    // 步骤/框架/架构类
    const isFramework = /(第一步|第二步|第三步|第四步|第一|其次|然后|最后|首先|操作手册|执行体系|四层架构|三层|分层|层级|搭架构|布局|股权布局|设置.*公司|放.*上面|放.*下面|放.*中间|归集|让.*归集|怎么搭|怎么做|核心动作|关键设置|三独立|财务独立|人员独立|业务独立|一定要.*独立|做到.*独立|实缴到位|账目独立|对外签合同|用自己的印章|防火墙公司|主体公司|项目公司|控股公司|家族公司|香港.*公司|海南.*公司|股权代持|代持协议|签.*协议|估值.*协议|资产.*公司|走流水|主业.*公司|资产.*放)/.test(text);
    // 风险/对比/警告类
    const isRisk = /(穿透|击穿|横向穿透|纵向穿透|连带|追责|追着赔|连带责任|人格混同|人格击穿|财务混同|财务混同|人员交叉|业务交叉|混用|防火墙.*纸|失效|一张网|兜住|被追|被起诉|被认定|债权人|供应商起诉|法院|强制执行|破产|欠了.*还不上|还不上|出事|公司出事|出了事|那时候来不及|来不及了|要赔|被迫|风险|违规|陷阱|注意|千万|警惕|别等|保护不了|关键错误|大忌|搭进去|名下.*一起来还)/.test(text);
    // 历史还原类
    const isHistorical = /(年|代|世纪|王朝|当时|率领|爆发|战役|协议|条约|驶入|古代|近代|历史上)/.test(text) && !isRisk && !isFramework;
    // 场景叙事类（具体故事场景）
    const isCaseStory = /(有个老板|这个老板|名下三家|名下.*公司|案例|真实场景|讲个故事|场景还原|曾经|某公司|老板.*搞|以为.*结果|做了.*年|真实案例)/.test(text);
    // 具体动作类
    const isConcreteAction = /(走入|拿起|签字|开启|握手|讨论|签署|面对面|交涉|阅读|视察|访问|勘察)/.test(text);

    // ——— 核心主体推测 ———
    let primarySubjectName = '核心概念';
    let primarySubjectType: 'person' | 'object' | 'concept' | 'organization' = 'concept';

    if (isData) {
      primarySubjectName = '财务数据报表';
      primarySubjectType = 'object';
    } else if (isFramework) {
      primarySubjectName = '公司架构流程图';
      primarySubjectType = 'object';
    } else if (isRisk) {
      primarySubjectName = '法律风险警示图';
      primarySubjectType = 'object';
    } else if (isCaseStory || isConcreteAction) {
      primarySubjectName = '老板与法律顾问';
      primarySubjectType = 'person';
    } else if (isHistorical) {
      primarySubjectName = '历史场景人物';
      primarySubjectType = 'person';
    } else if (/(老板|企业家|创业者|股东|法人|合伙人)/.test(text)) {
      primarySubjectName = '企业经营者';
      primarySubjectType = 'person';
    }

    // ——— 多维量化打分（统一 0.0~1.0 小数，不用百分制整数） ———
    // isAbstract: 只有纯哲理/情感类才标记为 abstract，法律内容绝不 abstract
    const isAbstractContent = !isData && !isFramework && !isRisk && !isCaseStory && !isConcreteAction && !isHistorical &&
      /(心态|感悟|体会|感受|感触|人生|态度|境界|本质|认知|底层逻辑|思维方式|方法论|正能量|感恩|坚持|努力|相信|相信自己|伟大|成功|失败|时代)/.test(text);

    const importance =
      isRisk ? 0.93 :
      isFramework ? 0.90 :
      isData ? 0.88 :
      isCaseStory ? 0.85 :
      isConcreteAction ? 0.78 :
      isHistorical ? 0.75 :
      isAbstractContent ? 0.60 :
      0.70;

    const visualizability =
      isData ? 0.95 :
      isFramework ? 0.92 :
      isRisk ? 0.90 :
      isCaseStory ? 0.88 :
      isConcreteAction ? 0.88 :
      isHistorical ? 0.85 :
      isAbstractContent ? 0.45 :
      0.68;

    const novelty =
      idx === 0 ? 0.88 :
      isRisk || isFramework ? 0.82 :
      isData ? 0.78 :
      isCaseStory ? 0.75 :
      0.60;

    const emotionalIntensity =
      isRisk ? 0.88 :
      isCaseStory ? 0.78 :
      isData ? 0.55 :
      isFramework ? 0.50 :
      isAbstractContent ? 0.60 :
      0.50;

    const sceneChange =
      isHistorical ? 0.85 :
      isFramework ? 0.80 :
      isCaseStory ? 0.78 :
      isRisk ? 0.72 :
      isData ? 0.65 :
      0.50;

    const informationDensity =
      isData ? 0.96 :
      isFramework ? 0.90 :
      isRisk ? 0.85 :
      isCaseStory ? 0.75 :
      isAbstractContent ? 0.40 :
      0.65;

    return {
      id: `SU_${String(idx + 1).padStart(2, '0')}`,
      time: { start: seg.startTime, end: seg.endTime },
      rawText: seg.text,
      cleanText: seg.text.replace(/^[，,；;\s]+|[，,；;\s]+$/g, ''),
      subjects: [{ name: primarySubjectName, type: primarySubjectType }],
      action: isConcreteAction ? '实体动作交互' :
              isData ? '数据分析比对' :
              isFramework ? '流程架构展示' :
              isRisk ? '风险警示说明' :
              isCaseStory ? '案例场景还原' :
              '核心观点呈现',
      objects: isData
        ? [{ name: '财务报表', type: 'document' }, { name: '计算器', type: 'prop' }]
        : isFramework
        ? [{ name: '股权架构图', type: 'diagram' }, { name: '流程图', type: 'diagram' }]
        : isRisk
        ? [{ name: '法律文书', type: 'document' }, { name: '警告标志', type: 'prop' }]
        : [{ name: '文书资料', type: 'document' }],
      isAbstract: isAbstractContent,
      importance,
      visualizability,
      novelty,
      emotionalIntensity,
      sceneChange,
      informationDensity,
    };
  });
}
