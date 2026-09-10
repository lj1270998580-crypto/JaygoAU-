// =========================================================================
// 模块 4: Visual Director (视觉导演) - v3 中文母语 + 反同质化版
// 核心升级（v3）：
// 1. 导演提示词与场景描述全面中文化（原为英文，导致英文骨架 + 中文血肉的混血提示词）
// 2. 景别/机位/占比/景深四维多样性强制器（解决"每张图都长得差不多"）
// 3. 缺少字段时从原文派生场景，不再填入统一模板
// 4. LLM 静默降级可诊断（DirectorDiagnostics 透出到 UI）
// =========================================================================

import type { VisualBeat, ScenePlan, ShotType, VisualType } from './types';
import { chatCompletion } from '../modelHubService';

/**
 * 为全片所有选定的视觉节拍规划具体镜头画面
 */
/**
 * 视觉导演诊断信息
 * 修复「LLM 静默降级」问题：此前 LLM 未配置 / JSON 解析失败 / 长度不匹配时
 * 会悄悄退回关键词模板，界面完全无感知，用户无法判断哪几张图是 AI 规划的。
 * 现在把这些事实记录下来，由流水线透出到 UI。
 */
export interface DirectorDiagnostics {
  usedLLM: boolean;
  fallbackReason?: string;
  diversityAdjusted: number;
}

export function createDirectorDiagnostics(): DirectorDiagnostics {
  return { usedLLM: false, diversityAdjusted: 0 };
}

export async function directVisualScenes(
  beats: VisualBeat[],
  modelHubSettings?: any,
  diag?: DirectorDiagnostics
): Promise<ScenePlan[]> {
  if (!beats || beats.length === 0) return [];

  const d = diag || createDirectorDiagnostics();
  let plans: ScenePlan[] | null = null;

  // 1. 优先尝试通过大模型进行专业级分镜导演规划
  if (!modelHubSettings) {
    d.usedLLM = false;
    d.fallbackReason = '未配置统一大模型中心（ModelHub），已退回关键词规则模板';
  } else {
    try {
      plans = await directWithLLM(beats, modelHubSettings, d);
      if (!plans || plans.length !== beats.length) {
        d.usedLLM = false;
        d.fallbackReason = plans
          ? `大模型返回分镜数量与节拍数量不一致（${plans.length} ≠ ${beats.length}）`
          : '大模型未返回可解析的 JSON 分镜结果';
        plans = null;
      } else {
        d.usedLLM = true;
      }
    } catch (err: any) {
      d.usedLLM = false;
      d.fallbackReason = `大模型调用异常：${err?.message || err}`;
      console.warn('VisualDirector LLM 调用异常，使用语义规则引擎兜底:', err);
      plans = null;
    }
  }

  // 2. 本地语义驱动规则引擎兜底
  if (!plans) {
    plans = directWithLocalRules(beats);
  }

  // 3. 统一执行「构图多样性」后处理（对 LLM 与兜底两条路径同时生效）
  d.diversityAdjusted = enforceVisualDiversity(plans);

  return plans;
}

/**
 * LLM 导演规划器 - v2 增强版
 * 要求 LLM 输出 visual_goal + visual_anchors + 具体场景
 */
async function directWithLLM(
  beats: VisualBeat[],
  modelHubSettings: any,
  diag: DirectorDiagnostics
): Promise<ScenePlan[] | null> {
  const promptList = beats.map((b, i) => ({
    beat_id: b.beatId,
    narration: b.sourceText,
    visual_type: b.visualType,
    序号: i + 1,
  }));

  const systemPrompt = `你是一位世界级的电影与动态影像视觉导演，具备极深的语义理解能力。

【核心原则】你必须理解每段旁白的**含义**，而不是只抽取关键词。
- 「穿透制度」= 债权人可以穿过公司层级直接触达个人资产的法律机制
- 「四层架构」= 家族公司 → 控股公司 → 经营公司 → 项目公司的四级结构
- 「人格混同」= 公司人格与个人人格混同，从而丧失有限责任保护

【你的任务】把视频旁白节拍转化为具体、可拍摄、有实体的视觉画面。

【语言要求 —— 极其重要】
- 所有字段值必须使用**简体中文**。这是硬性要求。
- 不要输出英文描述。目标生图模型是中文原生模型，中文描述能获得更好的画面还原度。
- visualAnchors 的 concept 也必须是中文。

【规则】
1. 不要编写生图提示词，只输出结构化的分镜规划（Scene Plan）。
2. 画面必须让观众在 1 秒内看懂旁白含义。
3. 用具体物理实体、真实建筑、人物姿态与环境来构建画面。
4. 生成 visualAnchors —— 2~4 个**中文**视觉概念，是让观众一眼认出这段旁白的最关键视觉元素。
5. 【反同质化 —— 极其重要】不要使用固定的景别循环。你必须根据内容主动变化镜头语言：
   - 连续两个分镜不得使用相同的 shot + cameraAngle 组合。
   - 整组分镜中，wide / medium / close / extreme_close / overhead 应尽量都出现。
   - 连续分镜的 primarySubject 与 background 不得重复雷同（除非旁白本身就在描述同一场景的延续）。
   - 数据、图表、流程类内容优先考虑 overhead（俯拍平铺）或 wide。
   - 情绪强烈、关键细节处优先考虑 close 或 extreme_close。
6. 避免悬浮的抽象符号、通用美元符号、混乱的假文字。

对每个节拍输出如下 JSON（字段值一律中文）：
{
  "beatId": "VB_01",
  "communicationGoal": "观众 1 秒内应感知到什么",
  "visualType": "与输入保持一致",
  "scene": {
    "primarySubject": "画面核心物理主体",
    "action": "主体动作或核心状态",
    "foreground": "前景道具与细节",
    "background": "背景空间或环境",
    "period": "时代或场所特征",
    "weatherOrAmbience": "光影与氛围"
  },
  "composition": {
    "shot": "wide|medium|close|extreme_close|overhead",
    "cameraAngle": "eye_level|slightly_elevated|low_angle|top_down",
    "subjectScale": "dominant|balanced|environmental",
    "depth": "deep|shallow|layered"
  },
  "emotion": { "primary": "主要情绪", "secondary": "次要情绪" },
  "mustInclude": ["必须出现的中文具体实体"],
  "mustAvoid": ["会破坏可信度的元素"],
  "visualAnchors": [
    { "concept": "中文视觉概念一", "priority": 1.0 },
    { "concept": "中文视觉概念二", "priority": 0.8 }
  ]
}

只返回严格的 JSON 数组，不要任何解释文字。`;

  const userPrompt = `请为以下视频旁白节拍做分镜导演规划（共 ${beats.length} 个，必须返回同样数量的数组元素）：\n${JSON.stringify(promptList, null, 2)}`;

  const responseText = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3 },
    modelHubSettings
  );

  const cleaned = responseText.replace(/^```[a-z]*\s*/im, '').replace(/\s*```$/im, '').trim();
  const match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) return null;

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  const llmUsedSubjects = new Map<string, number>();

  return beats.map((b, idx) => {
    const item = parsed[idx] || parsed.find((p: any) => p.beatId === b.beatId) || {};
    // 修复同质化：缺失字段不再填统一模板，改为从「该节拍自己的旁白原文」派生，
    // 否则每个漏答字段都会变成同一句"核心角色与主体 / 采光通透的现代室内空间"。
    const derived = deriveSceneFromText(b.sourceText, b.visualType, llmUsedSubjects);
    const llmShot = item.composition?.shot;
    const shot: ShotType = isShotType(llmShot) ? llmShot : getAlternatingShot(idx);
    return {
      beatId: b.beatId,
      communicationGoal: item.communicationGoal || `1秒读懂：${trimForGoal(b.sourceText)}`,
      visualType: b.visualType,
      scene: {
        primarySubject: item.scene?.primarySubject || derived.primarySubject,
        action: item.scene?.action || derived.action,
        foreground: item.scene?.foreground || derived.foreground,
        background: item.scene?.background || derived.background,
        period: item.scene?.period || derived.period || '当代',
        weatherOrAmbience: item.scene?.weatherOrAmbience || '通透自然光影，层次分明',
      },
      composition: {
        shot,
        cameraAngle: isCameraAngle(item.composition?.cameraAngle) ? item.composition.cameraAngle : cameraAngleForShot(shot, idx),
        subjectScale: isSubjectScale(item.composition?.subjectScale) ? item.composition.subjectScale : subjectScaleForShot(shot),
        depth: isDepthLevel(item.composition?.depth) ? item.composition.depth : depthForShot(shot),
      },
      emotion: {
        primary: item.emotion?.primary || derived.emotion,
        secondary: item.emotion?.secondary || '沉稳',
      },
      mustInclude:
        Array.isArray(item.mustInclude) && item.mustInclude.length > 0
          ? item.mustInclude
          : derived.mustInclude,
      mustAvoid:
        Array.isArray(item.mustAvoid) && item.mustAvoid.length > 0
          ? item.mustAvoid
          : ['三维塑料感', '漂浮的乱码色块', '低质错位汉字', '浮动无意义符号'],
      visualAnchors:
        Array.isArray(item.visualAnchors) && item.visualAnchors.length > 0
          ? item.visualAnchors
          : extractAnchorsFromText(b.sourceText, b.visualType),
    };
  });
}

// =========================================================================
// 本地语义驱动场景生成引擎 — 基于原文内容动态生成，而非模板映射
// =========================================================================

/**
 * 中文关键概念 → 中文视觉描述映射表
 * v3：由英文改为中文。目标生图模型（商汤日日新 U1 系列）为中文原生模型，
 * 英文描述会损失画面还原度，且与 StyleBible（全中文）混用会造成语言漂移。
 */
const CONCEPT_VISUAL_MAP: Record<string, { subject: string; action: string; anchors: Array<{ concept: string; priority: number }> }> = {
  // 法律穿透类
  '穿透': {
    subject: '一张巨大的法律之网从上方笼罩住多栋彼此关联的公司大楼',
    action: '网格将所有公司收拢进同一条责任链条',
    anchors: [
      { concept: '俯视视角下连接多栋公司大楼的法律之网', priority: 1.0 },
      { concept: '穿透公司外墙的箭头', priority: 0.9 },
    ],
  },
  '横向穿透': {
    subject: '三栋独立的公司大楼被粗重的红色锁链在地面层连成一体',
    action: '一名债权人在锁链一端发力，拉动三栋大楼同时倾斜',
    anchors: [
      { concept: '被横向红色锁链连接的三栋公司大楼', priority: 1.0 },
      { concept: '债权人拉动连接各家公司的锁链', priority: 0.85 },
    ],
  },
  '纵向穿透': {
    subject: '一张纵向剖面图，从顶层的个人资产一路贯通到底层的子公司',
    action: '箭头逐层向下钻透，最终指向顶端的住宅与银行账户',
    anchors: [
      { concept: '纵向箭头穿透各层公司结构直抵个人资产', priority: 1.0 },
      { concept: '位于结构顶端被瞄准的住宅与存款', priority: 0.9 },
    ],
  },
  '人格混同': {
    subject: '一个商人的剪影与一栋公司大楼的剪影相互重叠，融成模糊的一体',
    action: '个人与公司之间的边界正在溶解消失',
    anchors: [
      { concept: '商人剪影与公司大楼融为一体', priority: 1.0 },
      { concept: '个人与企业身份之间模糊的边界', priority: 0.85 },
    ],
  },
  '连带责任': {
    subject: '多名被锁链系住手腕的人并排站在法官席前',
    action: '其中一人倒下时，锁链把其余人一并拖倒',
    anchors: [
      { concept: '在法官席前被锁链系在一起的人群', priority: 1.0 },
      { concept: '一人倒下通过锁链拖倒其他人', priority: 0.9 },
    ],
  },
  // 公司架构类
  '四层架构': {
    subject: '一张清晰的四层金字塔结构图：顶层家族信托，其下控股公司，再下经营公司，底层项目公司',
    action: '每一层之间都有明显的防火墙阻隔标识',
    anchors: [
      { concept: '带有防火墙阻隔的四层公司金字塔', priority: 1.0 },
      { concept: '从家族信托到项目公司的清晰层级', priority: 0.9 },
    ],
  },
  '防火墙公司': {
    subject: '一道厚重的实体防火墙矗立在燃烧的建筑与安然无恙的建筑之间',
    action: '火焰被防火墙挡住，墙体后方的资产完好无损',
    anchors: [
      { concept: '挡住大火、矗立在两栋建筑之间的实体防火墙', priority: 1.0 },
      { concept: '防火墙后方受到保护的资产', priority: 0.85 },
    ],
  },
  '三独立': {
    subject: '三个彼此独立的办公空间，各自拥有独立的办公桌、公章与档案柜',
    action: '以物理方式清晰呈现财务独立、人员独立、业务独立',
    anchors: [
      { concept: '三间各自独立、各有公章与档案的办公室', priority: 1.0 },
      { concept: '各业务单元之间清晰的物理分隔', priority: 0.8 },
    ],
  },
  '实缴': {
    subject: '一只手正把真实的金币放入公司注册文件的保险柜中',
    action: '实有资本正在被缴入，另一只手持着已盖章的回执',
    anchors: [
      { concept: '金币被放入公司保险柜', priority: 1.0 },
      { concept: '已加盖印章的实缴登记回执', priority: 0.8 },
    ],
  },
  // 风险场景类
  '破产': {
    subject: '一间空荡的办公室，椅子翻倒在地，文件散落各处，门上贴着停业告示',
    action: '最后一名员工抱着纸箱走出已经关闭的办公室',
    anchors: [
      { concept: '椅子翻倒、文件散落的空荡办公室', priority: 1.0 },
      { concept: '抱着纸箱离开已关闭办公室的人', priority: 0.9 },
    ],
  },
  '债权人': {
    subject: '一位神情坚定的西装男子手持法律文书，站在公司门口',
    action: '他出示正式的法院文书，要求清偿债务',
    anchors: [
      { concept: '站在公司门口手持法院文书的债权人', priority: 1.0 },
      { concept: '正式的法院催告文书', priority: 0.8 },
    ],
  },
  // 数据财务类
  '免税': {
    subject: '一张清晰的资金流向对比图：左侧承担沉重税负，右侧是合规的税务优化路径',
    action: '箭头标出优化路径所节省下的大笔金额',
    anchors: [
      { concept: '税负与优化路径的资金流向对比图', priority: 1.0 },
      { concept: '通过合规优化节省下来的资金', priority: 0.85 },
    ],
  },
  '分红': {
    subject: '会议室长桌上摆放着一叠分红凭证与利润分配文件',
    action: '公司利润正通过正式渠道分配给股东',
    anchors: [
      { concept: '会议室长桌上的分红凭证', priority: 1.0 },
      { concept: '利润分配的流向示意', priority: 0.8 },
    ],
  },
};

/**
 * 从原文中提取最匹配的视觉概念
 */
function findBestConceptMatch(text: string): { key: string; match: typeof CONCEPT_VISUAL_MAP[string] } | null {
  // 按关键词长度降序匹配（优先匹配更具体的词）
  const keys = Object.keys(CONCEPT_VISUAL_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (text.includes(key)) {
      return { key, match: CONCEPT_VISUAL_MAP[key] };
    }
  }
  return null;
}

/**
 * 从原文提取视觉锚点（无 LLM 时使用）— v3 中文版
 */
function extractAnchorsFromText(
  text: string,
  visualType: string
): Array<{ concept: string; priority: number }> {
  const conceptMatch = findBestConceptMatch(text);
  if (conceptMatch) {
    return conceptMatch.match.anchors;
  }

  const key = extractKeyPhrase(text);

  // 通用锚点兜底（中文，且带上本句关键短语，避免所有节拍锚点完全一样）
  switch (visualType) {
    case 'data_stat':
      return [
        { concept: `呈现「${key}」的图表数据与关键指标`, priority: 1.0 },
        { concept: '报表上的趋势线与醒目数值', priority: 0.7 },
      ];
    case 'step_framework':
      return [
        { concept: `表达「${key}」的分步流程结构`, priority: 1.0 },
        { concept: '带编号的步骤节点与方向箭头', priority: 0.7 },
      ];
    case 'vs_comparison':
      return [
        { concept: `「${key}」的正反两种做法对比`, priority: 1.0 },
        { concept: '一侧红色警示、一侧绿色通过的明确对照', priority: 0.8 },
      ];
    case 'historical_recreation':
      return [
        { concept: `还原「${key}」所处年代的场景与人物`, priority: 1.0 },
        { concept: '符合时代特征的建筑、服饰与器物', priority: 0.8 },
      ];
    case 'concept_metaphor':
      return [
        { concept: `把「${key}」具象化的实体隐喻物`, priority: 1.0 },
        { concept: '沉静而有启示感的光影氛围', priority: 0.6 },
      ];
    case 'product_showcase':
      return [
        { concept: `「${key}」的实体陈列与材质细节`, priority: 1.0 },
        { concept: '干净的陈列台面与侧向布光', priority: 0.7 },
      ];
    default:
      return [
        { concept: `表现「${key}」的真实场景与人物状态`, priority: 1.0 },
        { concept: '有生活痕迹的真实环境细节', priority: 0.7 },
      ];
  }
}

/**
 * 从旁白中提取一个短关键短语（用于锚点/目标，保证每个节拍各不相同）
 */
function extractKeyPhrase(text: string): string {
  const cleaned = (text || '').replace(/[\s，。！？、；：""''（）《》【】…—\-]/g, '');
  if (!cleaned) return '当前内容';
  // 优先按标点切出的第一个有实义的短句
  const firstChunk = (text || '').split(/[，。！？；、]/).map((s) => s.trim()).filter((s) => s.length >= 4)[0];
  const base = firstChunk || cleaned;
  return base.length > 14 ? base.slice(0, 14) : base;
}

/**
 * 生成 communicationGoal 用的短句
 */
function trimForGoal(text: string): string {
  const t = (text || '').trim();
  return t.length > 20 ? t.slice(0, 20) + '…' : t;
}

// ---- 组合类型守卫（LLM 可能返回非法枚举值） ----
function isShotType(v: any): v is ShotType {
  return typeof v === 'string' && ['wide', 'medium', 'close', 'extreme_close', 'overhead'].includes(v);
}
function isCameraAngle(v: any): v is ScenePlan['composition']['cameraAngle'] {
  return typeof v === 'string' && ['eye_level', 'slightly_elevated', 'low_angle', 'top_down'].includes(v);
}
function isSubjectScale(v: any): v is ScenePlan['composition']['subjectScale'] {
  return typeof v === 'string' && ['dominant', 'balanced', 'environmental'].includes(v);
}
function isDepthLevel(v: any): v is ScenePlan['composition']['depth'] {
  return typeof v === 'string' && ['deep', 'shallow', 'layered'].includes(v);
}

/**
 * 本地语义驱动场景引擎 — 基于原文内容动态生成具体场景
 */
function directWithLocalRules(beats: VisualBeat[]): ScenePlan[] {
  const usedSubjects = new Map<string, number>();
  return beats.map((b, idx) => {
    const text = b.sourceText;
    const shot = pickShotForBeat(b, idx);

    // 1. 尝试从原文找到最匹配的语义概念
    const conceptMatch = findBestConceptMatch(text);

    // 2. 基于语义概念 + visualType 动态生成场景
    let commGoal: string;
    let primarySubject: string;
    let action: string;
    let foreground: string;
    let background: string;
    let period = '当代现代';
    let primaryEmotion = '严谨专业';
    const mustInclude: string[] = [];
    const mustAvoid = ['三维塑料感', '漂浮的乱码色块', '低质错位汉字', '浮动无意义符号'];
    let anchors: Array<{ concept: string; priority: number }>;

    if (conceptMatch) {
      // ——— 有具体语义概念匹配：使用语义驱动的具体场景 ———
      commGoal = `1秒读懂：${text.slice(0, 20)}`;
      primarySubject = conceptMatch.match.subject;
      action = conceptMatch.match.action;
      anchors = conceptMatch.match.anchors;

      // 根据概念类别补充前景背景（中文）
      if (/穿透|连带|混同|击穿|追责/.test(conceptMatch.key)) {
        foreground = '带有法院印章的法律文书';
        background = '楼宇林立的现代商务区的多栋公司大楼';
        primaryEmotion = '紧迫警示';
      } else if (/架构|防火墙|独立|实缴/.test(conceptMatch.key)) {
        foreground = '公司注册文件与官方印章';
        background = '整洁现代办公室，墙面挂着组织结构图';
        primaryEmotion = '条理清晰';
      } else if (/破产|债权/.test(conceptMatch.key)) {
        foreground = '散落的文件与翻倒的物件';
        background = '光线昏暗的办公走廊';
        primaryEmotion = '紧张压迫';
      } else {
        foreground = '桌面上摊开的财务文件与办公用具';
        background = '采光良好的现代商务环境';
      }
    } else {
      // ——— 无具体匹配：从原文派生出与该节拍内容相符的场景（中文，且逐条不同） ———
      anchors = extractAnchorsFromText(text, b.visualType);
      commGoal = `1秒读懂：${trimForGoal(text)}`;

      const derived = deriveSceneFromText(text, b.visualType, usedSubjects);
      primarySubject = derived.primarySubject;
      action = derived.action;
      foreground = derived.foreground;
      background = derived.background;
      primaryEmotion = derived.emotion;
      if (derived.period) period = derived.period;
      for (const item of derived.mustInclude) mustInclude.push(item);
      for (const item of derived.mustAvoid) mustAvoid.push(item);
    }

    // 3. 检查原文中是否有案例故事人物（动态覆盖主体）
    if (/(有个老板|这个老板|名下三家|名下.*公司|真实.*场景|真实案例)/.test(text) && !conceptMatch) {
      primarySubject = '一位中年企业主坐在办公室里，神情凝重地面对桌上摊开的几份公司文件';
      action = '逐份翻阅材料，眉头越锁越紧，其中几页被红笔圈出';
      primaryEmotion = '焦虑不安';
    }

    return {
      beatId: b.beatId,
      communicationGoal: commGoal,
      visualType: b.visualType,
      scene: {
        primarySubject,
        action,
        foreground,
        background,
        period,
        weatherOrAmbience: '通透自然光影，层次分明',
      },
      composition: {
        shot,
        cameraAngle: cameraAngleForShot(shot, idx),
        subjectScale: subjectScaleForShot(shot),
        depth: depthForShot(shot),
      },
      emotion: {
        primary: primaryEmotion,
        secondary: '沉稳',
      },
      mustInclude: mustInclude.length > 0 ? mustInclude : ['与该句内容直接相关的实体道具', '真实可信的场景细节'],
      mustAvoid: Array.from(new Set(mustAvoid)),
      visualAnchors: anchors,
    };
  });
}

/**
 * 根据景别推导机位角度（避免所有图都是 eye_level）
 */
function cameraAngleForShot(shot: ShotType, idx: number): ScenePlan['composition']['cameraAngle'] {
  switch (shot) {
    case 'wide':
      return idx % 2 === 0 ? 'slightly_elevated' : 'eye_level';
    case 'overhead':
      return 'top_down';
    case 'close':
    case 'extreme_close':
      return 'eye_level';
    default:
      return idx % 3 === 0 ? 'low_angle' : 'eye_level';
  }
}

/**
 * 根据景别推导主体占比
 */
function subjectScaleForShot(shot: ShotType): ScenePlan['composition']['subjectScale'] {
  if (shot === 'close' || shot === 'extreme_close') return 'dominant';
  if (shot === 'wide' || shot === 'overhead') return 'environmental';
  return 'balanced';
}

/**
 * 根据景别推导景深层次（避免清一色 layered）
 */
function depthForShot(shot: ShotType): ScenePlan['composition']['depth'] {
  if (shot === 'extreme_close' || shot === 'close') return 'shallow';
  if (shot === 'wide' || shot === 'overhead') return 'deep';
  return 'layered';
}

/**
 * 镜头景别节奏算法（LLM 缺省字段时使用）
 * 由原来只有 3 种景别的 4 拍死循环，扩展为覆盖全部 5 种景别的 6 拍节奏，
 * 解锁此前永远不可能出现的 extreme_close（微距特写）与 overhead（俯拍平铺）。
 */
function getAlternatingShot(index: number): ShotType {
  const rhythm: ShotType[] = ['wide', 'medium', 'close', 'overhead', 'medium', 'extreme_close'];
  return rhythm[index % rhythm.length];
}

/**
 * 内容感知的景别分配
 * 修复「所有图都是中景人物说明图」的问题：按内容类型与情绪强度主动选择景别，
 * 而不是无脑套用固定循环。
 */
function pickShotForBeat(beat: VisualBeat, index: number): ShotType {
  const t = beat.visualType;

  // 数据 / 流程类：俯拍平铺最能承载信息结构
  if (t === 'data_stat') return index % 2 === 0 ? 'overhead' : 'close';
  if (t === 'step_framework') return index % 2 === 0 ? 'overhead' : 'medium';
  if (t === 'vs_comparison') return index % 2 === 0 ? 'wide' : 'overhead';

  // 历史重现：建立镜头与叙事镜头交替
  if (t === 'historical_recreation') return index % 2 === 0 ? 'wide' : 'medium';

  // 概念隐喻：用近景/微距强化象征物
  if (t === 'concept_metaphor') return index % 2 === 0 ? 'close' : 'extreme_close';

  // 产品陈列：近景细节
  if (t === 'product_showcase') return index % 2 === 0 ? 'close' : 'extreme_close';

  // 场景叙事：按情绪强度与场景切换幅度变化
  if (beat.score.emotionalIntensity > 0.6) return index % 2 === 0 ? 'close' : 'extreme_close';
  if (beat.score.sceneChange > 0.6) return 'wide';
  return index % 2 === 0 ? 'medium' : 'close';
}

/**
 * 构图多样性强制执行器
 * 修复「统一风格 = 统一到一模一样」：对 LLM 与本地方案统一做后处理，
 * 消除相邻分镜在景别 / 机位 / 主体占比上的重复堆叠。
 * @returns 被调整的分镜数量
 */
function enforceVisualDiversity(plans: ScenePlan[]): number {
  if (plans.length < 2) return 0;

  const ALL_SHOTS: ShotType[] = ['wide', 'medium', 'close', 'extreme_close', 'overhead'];
  const ALL_ANGLES: ScenePlan['composition']['cameraAngle'][] = [
    'eye_level',
    'slightly_elevated',
    'low_angle',
    'top_down',
  ];
  let adjusted = 0;

  for (let i = 0; i < plans.length; i++) {
    const cur = plans[i];
    const prev = i > 0 ? plans[i - 1] : null;
    const prev2 = i > 1 ? plans[i - 2] : null;

    // 1) 连续两个分镜不得使用相同 shot + cameraAngle 组合
    if (prev && cur.composition.shot === prev.composition.shot && cur.composition.cameraAngle === prev.composition.cameraAngle) {
      const alt = ALL_SHOTS.find((s) => s !== cur.composition.shot && s !== prev.composition.shot);
      if (alt) {
        cur.composition.shot = alt;
        adjusted++;
      }
    }

    // 2) 连续三个分镜不得是同一景别
    if (prev && prev2 && prev2.composition.shot === prev.composition.shot && prev.composition.shot === cur.composition.shot) {
      const alt = ALL_SHOTS.find((s) => s !== cur.composition.shot);
      if (alt) {
        cur.composition.shot = alt;
        adjusted++;
      }
    }

    // 3) 机位角度轮换，避免清一色平视
    if (prev && cur.composition.cameraAngle === prev.composition.cameraAngle) {
      const alt = ALL_ANGLES.find(
        (a) => a !== cur.composition.cameraAngle && (!prev2 || a !== prev2.composition.cameraAngle)
      );
      if (alt) {
        cur.composition.cameraAngle = alt;
        adjusted++;
      }
    }

    // 4) 主体占比轮换，避免清一色 balanced
    if (prev && cur.composition.subjectScale === prev.composition.subjectScale) {
      cur.composition.subjectScale = prev.composition.subjectScale === 'balanced' ? 'dominant' : 'balanced';
      adjusted++;
    }

    // 5) 景深轮换
    if (prev && cur.composition.depth === prev.composition.depth) {
      cur.composition.depth = prev.composition.depth === 'layered' ? 'shallow' : 'layered';
      adjusted++;
    }
  }

  return adjusted;
}

/**
 * 从旁白原文派生场景（替代原先「所有图共用同一套模板」的兜底）
 *
 * 关键修复：原实现在 LLM 缺字段时填入固定的
 * 「核心角色与主体 / 专注研讨交互 / 办公案头文书资料 / 采光通透的现代室内空间」，
 * 这就是「每张图看起来都差不多」的直接来源。
 * 现在改为按内容线索选择场景原型，并把该句的关键短语带进画面描述。
 */
/**
 * 重复场景的差异化改写
 * 当同一场景原型在一组分镜中被反复命中时（例如连续多句都属"财务"或"房产"话题），
 * 仅靠原型本身仍会产出雷同画面，这里按命中次数做主体视角 / 背景细节的轮换。
 */
const SUBJECT_LEAD = ['', '近观', '换个角度，', '远看'];
const BG_SUFFIX = [
  '',
  '，环境细节丰富、留有真实使用痕迹',
  '，空间开阔，以大面积留白衬托主体',
  '，画面纵深明显，前后景层次分明',
];

function deriveSceneFromText(
  text: string,
  visualType: VisualType,
  usedSubjects?: Map<string, number>
): {
  primarySubject: string;
  action: string;
  foreground: string;
  background: string;
  emotion: string;
  period?: string;
  mustInclude: string[];
  mustAvoid: string[];
} {
  const base = deriveSceneBase(text, visualType);
  if (!usedSubjects) return base;

  const occ = usedSubjects.get(base.primarySubject) || 0;
  usedSubjects.set(base.primarySubject, occ + 1);
  if (occ === 0) return base;

  const key = extractKeyPhrase(text);
  return {
    ...base,
    primarySubject: `${SUBJECT_LEAD[occ % SUBJECT_LEAD.length]}${base.primarySubject}`,
    background: `${base.background}${BG_SUFFIX[occ % BG_SUFFIX.length]}`,
    mustInclude: [...base.mustInclude, `与「${key}」直接对应的独特画面元素`],
  };
}

function deriveSceneBase(
  text: string,
  visualType: VisualType
): {
  primarySubject: string;
  action: string;
  foreground: string;
  background: string;
  emotion: string;
  period?: string;
  mustInclude: string[];
  mustAvoid: string[];
} {
  const key = extractKeyPhrase(text);
  const base = {
    mustInclude: [`与「${key}」直接相关的实体道具`],
    mustAvoid: [] as string[],
  };

  // ---- 内容线索 → 场景原型（覆盖多领域，避免只认法律财务词） ----
  const ARCHETYPES: Array<{
    cue: RegExp;
    primarySubject: string;
    action: string;
    foreground: string;
    background: string;
    emotion: string;
    mustInclude?: string[];
  }> = [
    {
      cue: /破产|倒闭|清算|亏损|失败|崩盘/,
      primarySubject: '一间已停止运作的办公场所，工位空置、椅子翻倒、文件散落一地',
      action: '最后离开的人抱着纸箱走过空荡的走廊',
      foreground: '散落的账册、翻倒的办公椅与未拆封的纸箱',
      background: '光线昏暗、窗帘半掩的办公走廊',
      emotion: '萧条压抑',
      mustInclude: ['空置工位', '散落文件'],
    },
    {
      cue: /法院|法官|诉讼|判决|开庭|强制执行|律师/,
      primarySubject: '庄重的法庭内部，法官席高高在上，双方席位分立两侧',
      action: '法槌落下，宣告裁决结果',
      foreground: '桌面上的案卷、法槌与当事人名牌',
      background: '高挑的法庭空间与木质护墙板',
      emotion: '庄严紧张',
      mustInclude: ['法槌', '案卷文书'],
    },
    {
      cue: /合同|协议|签字|盖章|文书|条款|约定/,
      primarySubject: '一份摊开在桌面上的正式合同文本，关键条款被折角标记',
      action: '一只手握笔停顿在签名栏上方，旁边是已蘸好印泥的公章',
      foreground: '签字笔、印泥盒与公章',
      background: '安静的办公桌面，柔和顶光',
      emotion: '审慎专注',
      mustInclude: ['合同文本', '公章'],
    },
    {
      cue: /税|财务|账|报表|成本|利润|分红|资金|现金流/,
      primarySubject: '一张铺开的资金流向图，多条支线清晰标注去向与金额层级',
      action: '手指沿资金路径逐段推进，最终停在核心节点',
      foreground: '计算器、钢笔与标注过的财务报表',
      background: '明亮的财务办公环境',
      emotion: '清晰严谨',
      mustInclude: ['资金流向图', '数据标注'],
    },
    {
      cue: /股权|股东|架构|控股|家族|持股|董事会/,
      primarySubject: '一面墙上的公司股权结构图，多家公司以清晰的层级关系相连',
      action: '手指点向结构图上的关键节点，说明控制权归属',
      foreground: '指示棒、组织结构图打印件与图钉',
      background: '现代会议室，墙面为整块白板',
      emotion: '条理清晰',
      mustInclude: ['股权结构图', '层级连线'],
    },
    {
      cue: /历史|古代|王朝|民国|年代|旧社会|当年|过去/,
      primarySubject: '一处符合所讲述年代的真实历史场景，建筑、陈设与器物均为当时形制',
      action: '画面中的人物以当时的姿态从事典型活动',
      foreground: '具有年代特征的器物与手工工具',
      background: '历史原貌的建筑空间或街巷',
      emotion: '厚重沉静',
      mustInclude: ['年代特征建筑', '时代器物'],
    },
    {
      cue: /女性|婚姻|家庭|母亲|妻子|女儿|情感|爱情/,
      primarySubject: '一位身处具体生活情境中的女性，姿态与神情传达出内心的处境',
      action: '在窗边停顿、望向远处，手中仍握着未放下的日常物件',
      foreground: '承载生活痕迹的日常物件',
      background: '有生活气息的居所内景，自然光从窗口斜入',
      emotion: '克制而深沉',
      mustInclude: ['人物神态', '生活场景细节'],
    },
    {
      cue: /人工智能|AI|算法|模型|数据|科技|互联网|系统/,
      primarySubject: '一处真实可见的技术工作场景，屏幕阵列、服务器机柜或数据看板清晰可辨',
      action: '技术人员专注调试，屏幕上的数据结构逐步成型',
      foreground: '键盘、终端界面与走线',
      background: '现代技术工作空间，冷色环境光',
      emotion: '冷静专注',
      mustInclude: ['技术设备', '屏幕界面'],
    },
    {
      cue: /房产|买房|楼盘|城市|建筑|物业|房子|土地/,
      primarySubject: '一片真实的城市建筑群或住宅楼盘，体量关系清晰可辨',
      action: '视线自下而上掠过建筑立面，最终停留在关键部位',
      foreground: '楼盘沙盘、产权文件或钥匙',
      background: '城市天际线或住宅小区实景',
      emotion: '现实理性',
      mustInclude: ['建筑实体', '空间关系'],
    },
    {
      cue: /老板|企业家|创业者|员工|职场|公司|生意|经营/,
      primarySubject: '一位企业经营者身处真实办公场景中，面前摊开着待处理的材料',
      action: '正低头审视材料并做出判断，手边放着已批注的文件',
      foreground: '批注过的文件、签字笔与办公桌面物件',
      background: '有真实使用痕迹的办公室',
      emotion: '专注而承压',
      mustInclude: ['人物状态', '办公场景细节'],
    },
  ];

  const hit = ARCHETYPES.find((a) => a.cue.test(text));

  if (hit) {
    return {
      primarySubject: hit.primarySubject,
      action: hit.action,
      foreground: hit.foreground,
      background: hit.background,
      emotion: hit.emotion,
      mustInclude: hit.mustInclude ? [...hit.mustInclude, `与「${key}」相关的实体细节`] : base.mustInclude,
      mustAvoid: base.mustAvoid,
    };
  }

  // ---- 无内容线索：按 visualType 给出领域中性的原型（仍然带该句关键短语） ----
  switch (visualType) {
    case 'data_stat':
      return {
        primarySubject: `用于说明「${key}」的数据图版，关键数值与趋势关系一目了然`,
        action: '视线沿趋势线推进，最终落在最关键的数值节点上',
        foreground: '标注过的报表与辅助测算工具',
        background: '简洁纯净的中性背景',
        emotion: '清晰严谨',
        mustInclude: ['数据图版', '关键数值标注'],
        mustAvoid: base.mustAvoid,
      };
    case 'step_framework':
      return {
        primarySubject: `表达「${key}」的分步结构，各阶段以明确顺序依次排布`,
        action: '沿箭头方向逐级推进，层次递进清晰',
        foreground: '带编号的阶段标识与说明标签',
        background: '简洁纯净的中性背景',
        emotion: '条理清晰',
        mustInclude: ['分步结构', '方向箭头'],
        mustAvoid: base.mustAvoid,
      };
    case 'vs_comparison':
      return {
        primarySubject: `「${key}」的两种做法并置对照，差异一眼可辨`,
        action: '视线在左右两种结果之间来回比较',
        foreground: '两侧各自的结论标识',
        background: '中性对半分割的背景',
        emotion: '鲜明对照',
        mustInclude: ['对照双方', '明确差异标识'],
        mustAvoid: base.mustAvoid,
      };
    case 'historical_recreation':
      return {
        primarySubject: `还原「${key}」所处的历史情境，人物与场景均符合当时形制`,
        action: '人物以当时的姿态处于关键历史瞬间',
        foreground: '具有年代特征的器物',
        background: '历史原貌的建筑或自然环境',
        emotion: '厚重沉静',
        period: '历史时期',
        mustInclude: ['年代特征服饰', '时代建筑'],
        mustAvoid: ['现代电子设备', '现代玻璃幕墙建筑'],
      };
    case 'concept_metaphor':
      return {
        primarySubject: `一件把「${key}」具象化的实体物件，形态明确、可触可感`,
        action: '物件处于被凝视或正在发生变化的状态',
        foreground: '承载物件的真实台面与旁边的小物件',
        background: '安静柔和、留白充足的环境',
        emotion: '沉静睿智',
        mustInclude: ['具象隐喻物'],
        mustAvoid: base.mustAvoid,
      };
    case 'product_showcase':
      return {
        primarySubject: `「${key}」所指的实体物品，材质与结构细节清晰可见`,
        action: '物品以展示姿态静置于台面上',
        foreground: '陈列台面与辅助衬布',
        background: '干净的纯色背景',
        emotion: '精致克制',
        mustInclude: ['实体物品', '材质细节'],
        mustAvoid: base.mustAvoid,
      };
    default:
      return {
        primarySubject: `与「${key}」直接对应的真实场景，主体为具体的人或物，而非抽象符号`,
        action: '主体正在完成与该句内容直接相关的具体行为',
        foreground: '能够交代情境的日常物件',
        background: '有真实使用痕迹的环境，空间关系明确',
        emotion: '真实自然',
        mustInclude: base.mustInclude,
        mustAvoid: base.mustAvoid,
      };
  }
}
