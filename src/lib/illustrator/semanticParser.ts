// =========================================================================
// 模块 2: Semantic Parser (语义事件解析器)
// 职责：将口播文案转化为原子语义事件 (Semantic Units)，提取物理主体、动作、实体道具与时空特征
// 严禁决定是否生成图片（那是 Visual Beat Planner 的工作）
// =========================================================================

import type { SemanticUnit } from './types';
import type { TimelineSegment } from './timelineAligner';
import { chatCompletion } from '../modelHubService';

// 绝对禁配的营销推销话术正则（含课程招募/带货段落）
export const SALES_PITCH_REGEX =
  /(购买课程|点击下方|小黄车|拍下[0-9]|去买|下单|橱窗|私信我|粉丝群|粉丝团|福利价|限时特惠|限时秒杀|原价.*现价|左下角|购物车|链接在|领资料|扣[0-9]|评论区回复|关注直播间|赶紧抢|优惠券|我在.*等你|扫码|加.*群|入群|三晚直播|纯干货.*名额|限额.*招募|还加赠|报名|内部课|私房课.*元|股权.*元|合规.*元|[0-9]+元.*课程|今天拍下|拍下.*元)/;

// 寒暄客套过滤正则
export const GREETING_REGEX =
  /^(大家好|欢迎大家|点赞关注|欢迎点赞|关注我|哈喽|感谢大家|我是[^\s，。]+)[，。！？!\s]*$/;

/**
 * 将时间对齐的文案切片解析为原子语义单元
 */
export async function parseSemanticUnits(
  segments: TimelineSegment[],
  modelHubSettings?: any
): Promise<SemanticUnit[]> {
  if (!segments || segments.length === 0) return [];

  // 1. 初步预过滤：剔除纯营销推销与纯寒暄
  const candidateSegments = segments.filter((seg) => {
    const t = seg.text.trim();
    if (t.length < 4) return false;
    if (SALES_PITCH_REGEX.test(t)) return false;
    if (GREETING_REGEX.test(t) || (t.length < 12 && /(大家好|欢迎大家|记得点赞|点个关注)/.test(t))) return false;
    return true;
  });

  if (candidateSegments.length === 0) return [];

  // 2. 优先尝试调用大模型进行工业级高精度语义事件解析
  if (modelHubSettings) {
    try {
      const unitsFromLLM = await parseWithLLM(candidateSegments, modelHubSettings);
      if (unitsFromLLM && unitsFromLLM.length > 0) {
        return unitsFromLLM;
      }
    } catch (err) {
      console.warn('SemanticParser LLM 调用异常，使用本地高精度规则引擎兜底:', err);
    }
  }

  // 3. 本地高精度规则解析兜底（在无大模型或网络超时时保证 100% 可用）
  return parseWithLocalRules(candidateSegments);
}

/**
 * 通过大模型进行语义事件解析
 */
async function parseWithLLM(
  segments: TimelineSegment[],
  modelHubSettings: any
): Promise<SemanticUnit[] | null> {
  const promptList = segments.map((s, idx) => ({
    seg_id: `SU_${String(idx + 1).padStart(2, '0')}`,
    time_start: s.startTime,
    time_end: s.endTime,
    text: s.text,
  }));

  const systemPrompt = `You are a professional video semantic analyst and visual storytelling expert.
Your task is NOT to create images.
Your task is to convert narration segments into atomic semantic events with deep visual understanding.

CRITICAL PRINCIPLE: Understand the MEANING, not just keywords.
- "这家公司最后被迫宣布破产" → Don't just match "公司" + "破产". Understand this means: empty offices, employees carrying boxes, closed doors, desolation.
- "穿透制度" → Don't just match a keyword. Understand this means: a legal net connecting multiple companies, creditors reaching through corporate layers.

For every event identify:
1. subjects: core actors or key entities [{ name, type: 'person' | 'object' | 'concept' | 'organization' }]
2. action: what is happening (concise verb phrase)
3. objects: key physical props or tangible items [{ name, type }]
4. location: physical setting if mentioned or implied
5. timePeriod: historical era or setting time if mentioned
6. isAbstract: boolean (true ONLY for pure philosophical sentiment with no concrete action. Legal/financial content = false)
7. visual_goal: ONE sentence describing what the audience should SEE and FEEL in 1 second (this is the most important field!)
8. visual_anchors: 2-4 concrete visual concepts (in English) that would make the audience instantly recognize this narration segment. Each has a priority (0.0-1.0).
9. Multi-dimensional scores (0.0 to 1.0):
   - importance: how essential this event is to the core narration
   - visualizability: how easily this can be depicted with tangible physical objects/people
   - novelty: introduction of a new concept or turning point
   - emotionalIntensity: emotional weight or tension
   - sceneChange: degree of environment or subject shift
   - informationDensity: richness of factual/data content

Return ONLY a strict JSON array matching this format:
[
  {
    "id": "SU_01",
    "subjects": [{ "name": "...", "type": "person" }],
    "action": "...",
    "objects": [{ "name": "...", "type": "object" }],
    "location": "...",
    "timePeriod": "...",
    "isAbstract": false,
    "visual_goal": "Show a legal net stretching across multiple company buildings, symbolizing the piercing veil doctrine",
    "visual_anchors": [
      { "concept": "legal net connecting multiple company buildings", "priority": 1.0 },
      { "concept": "creditor pointing at linked companies", "priority": 0.8 }
    ],
    "importance": 0.85,
    "visualizability": 0.90,
    "novelty": 0.70,
    "emotionalIntensity": 0.60,
    "sceneChange": 0.80,
    "informationDensity": 0.75
  }
]`;

  const userPrompt = `Input segments to analyze:\n${JSON.stringify(promptList, null, 2)}`;

  const responseText = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2 },
    modelHubSettings
  );

  const cleaned = responseText.replace(/^```[a-z]*\s*/im, '').replace(/\s*```$/im, '').trim();
  const match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) return null;

  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  // 映射回带时间戳的完整 SemanticUnit
  return segments.map((seg, idx) => {
    const item = parsed[idx] || parsed.find((p: any) => p.id === `SU_${String(idx + 1).padStart(2, '0')}`) || {};
    return {
      id: item.id || `SU_${String(idx + 1).padStart(2, '0')}`,
      time: { start: seg.startTime, end: seg.endTime },
      rawText: seg.text,
      cleanText: seg.text.replace(/^[，,；;\s]+|[，,；;\s]+$/g, ''),
      subjects: Array.isArray(item.subjects) ? item.subjects : [{ name: '核心主体', type: 'concept' as const }],
      action: item.action || '展开叙事',
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
