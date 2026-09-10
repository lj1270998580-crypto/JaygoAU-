// =========================================================================
// 模块 4: Visual Director (视觉导演) - v2 语义优先版
// 核心升级：从死板 switch/case 模板改为基于原文内容动态生成场景描述
// 关键原则：不要让本地程序"创造画面"，让本地程序"保证画面描述完整、稳定、有优先级"
// =========================================================================

import type { VisualBeat, ScenePlan, ShotType } from './types';
import { chatCompletion } from '../modelHubService';

/**
 * 为全片所有选定的视觉节拍规划具体镜头画面
 */
export async function directVisualScenes(
  beats: VisualBeat[],
  modelHubSettings?: any
): Promise<ScenePlan[]> {
  if (!beats || beats.length === 0) return [];

  // 1. 优先尝试通过大模型进行专业级分镜导演规划
  if (modelHubSettings) {
    try {
      const plansFromLLM = await directWithLLM(beats, modelHubSettings);
      if (plansFromLLM && plansFromLLM.length === beats.length) {
        return plansFromLLM;
      }
    } catch (err) {
      console.warn('VisualDirector LLM 调用异常，使用语义规则引擎兜底:', err);
    }
  }

  // 2. 本地语义驱动规则引擎兜底
  return directWithLocalRules(beats);
}

/**
 * LLM 导演规划器 - v2 增强版
 * 要求 LLM 输出 visual_goal + visual_anchors + 具体场景
 */
async function directWithLLM(
  beats: VisualBeat[],
  modelHubSettings: any
): Promise<ScenePlan[] | null> {
  const promptList = beats.map((b) => ({
    beat_id: b.beatId,
    narration: b.sourceText,
    visual_type: b.visualType,
  }));

  const systemPrompt = `You are a world-class film & motion visual director with deep semantic understanding.

CRITICAL PRINCIPLE: You must UNDERSTAND the meaning of each narration segment, not just extract keywords.
- "穿透制度" means: a legal mechanism where creditors can reach through corporate layers to personal assets
- "四层架构" means: a 4-tier company structure (family co → holding co → operating co → project co)
- "人格混同" means: when corporate identity merges with personal identity, losing legal protection

Your task: translate video narration beats into concrete, tangible physical visual scenes.

RULES:
1. Do NOT write image generation prompts. Output structured Scene Plans.
2. The scene must communicate the narration clearly within 1 second of viewing.
3. Build scenes using physical tangible objects, real architecture, human posture, and environment.
4. CRITICAL: Generate visual_anchors — 2-4 English concepts that would make the audience instantly recognize this narration. These are the most important visual elements.
5. Alternate shots: wide → medium → close → medium for visual rhythm.
6. Avoid floating abstract symbols, generic dollar signs, or chaotic fake text.

For each beat, output JSON:
{
  "beatId": "VB_01",
  "communicationGoal": "what audience perceives in 1 second",
  "visualType": "matching input",
  "scene": {
    "primarySubject": "main physical entity",
    "action": "core posture/movement/interaction",
    "foreground": "props, documents in front",
    "background": "architectural interior or landscape",
    "period": "era",
    "weatherOrAmbience": "atmospheric mood"
  },
  "composition": {
    "shot": "wide|medium|close|extreme_close|overhead",
    "cameraAngle": "eye_level|slightly_elevated|low_angle|top_down",
    "subjectScale": "dominant|balanced|environmental",
    "depth": "deep|shallow|layered"
  },
  "emotion": { "primary": "...", "secondary": "..." },
  "mustInclude": ["concrete physical items"],
  "mustAvoid": ["things that ruin credibility"],
  "visualAnchors": [
    { "concept": "legal net connecting multiple company buildings", "priority": 1.0 },
    { "concept": "creditor hand reaching through corporate layers", "priority": 0.8 }
  ]
}

Return ONLY a strict JSON array.`;

  const userPrompt = `Input visual beats to direct:\n${JSON.stringify(promptList, null, 2)}`;

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

  return beats.map((b, idx) => {
    const item = parsed[idx] || parsed.find((p: any) => p.beatId === b.beatId) || {};
    return {
      beatId: b.beatId,
      communicationGoal: item.communicationGoal || `清晰传达：${b.sourceText.slice(0, 16)}`,
      visualType: b.visualType,
      scene: {
        primarySubject: item.scene?.primarySubject || '核心角色与主体',
        action: item.scene?.action || '专注研讨交互',
        foreground: item.scene?.foreground || '办公案头文书资料',
        background: item.scene?.background || '采光通透的现代室内空间',
        period: item.scene?.period || '当代',
        weatherOrAmbience: item.scene?.weatherOrAmbience || '明朗自然光照',
      },
      composition: {
        shot: item.composition?.shot || getAlternatingShot(idx),
        cameraAngle: item.composition?.cameraAngle || 'eye_level',
        subjectScale: item.composition?.subjectScale || 'balanced',
        depth: item.composition?.depth || 'layered',
      },
      emotion: {
        primary: item.emotion?.primary || '专注',
        secondary: item.emotion?.secondary || '坚定',
      },
      mustInclude: Array.isArray(item.mustInclude) ? item.mustInclude : ['实体文书', '工作台'],
      mustAvoid: Array.isArray(item.mustAvoid)
        ? item.mustAvoid
        : ['浮动无意义符号', '乱码错字', '色块拼图'],
      visualAnchors: Array.isArray(item.visualAnchors)
        ? item.visualAnchors
        : extractAnchorsFromText(b.sourceText, b.visualType),
    };
  });
}

// =========================================================================
// 本地语义驱动场景生成引擎 — 基于原文内容动态生成，而非模板映射
// =========================================================================

/**
 * 中文关键概念 → 英文视觉描述映射表
 * 用于将原文中的核心语义概念转化为图片模型可理解的英文视觉描述
 */
const CONCEPT_VISUAL_MAP: Record<string, { subject: string; action: string; anchors: Array<{ concept: string; priority: number }> }> = {
  // 法律穿透类
  '穿透': {
    subject: 'a wide net stretching across multiple connected company buildings viewed from above',
    action: 'the net pulls all companies together into one accountability chain',
    anchors: [
      { concept: 'legal net connecting multiple company buildings from above', priority: 1.0 },
      { concept: 'arrows piercing through corporate walls', priority: 0.9 },
    ],
  },
  '横向穿透': {
    subject: 'three separate company buildings connected by thick red chains at ground level',
    action: 'a creditor at one end pulling the chain that links all three buildings together',
    anchors: [
      { concept: 'three company buildings linked by horizontal red chains', priority: 1.0 },
      { concept: 'creditor pulling chain connecting companies', priority: 0.85 },
    ],
  },
  '纵向穿透': {
    subject: 'a vertical cross-section showing company layers from top (personal assets) to bottom (subsidiary)',
    action: 'arrows drilling downward through each layer, reaching personal house and bank at the top',
    anchors: [
      { concept: 'vertical arrows piercing through corporate layers to personal assets', priority: 1.0 },
      { concept: 'house and savings at top being targeted', priority: 0.9 },
    ],
  },
  '人格混同': {
    subject: 'two overlapping silhouettes — a businessman and a company building — merging into one blurred shape',
    action: 'the boundary between person and company dissolving',
    anchors: [
      { concept: 'businessman silhouette merging with company building', priority: 1.0 },
      { concept: 'blurred boundary between personal and corporate identity', priority: 0.85 },
    ],
  },
  '连带责任': {
    subject: 'multiple people chained together at the wrists standing before a judge bench',
    action: 'when one person falls, the chain pulls everyone else down',
    anchors: [
      { concept: 'people chained together before a judge', priority: 1.0 },
      { concept: 'one falling person pulling others down via chain', priority: 0.9 },
    ],
  },
  // 公司架构类
  '四层架构': {
    subject: 'a clean pyramid diagram with 4 tiers: family trust at top, holding company, operating company, project company at base',
    action: 'each tier clearly labeled with firewall barriers between them',
    anchors: [
      { concept: 'four-tier company pyramid with firewall barriers', priority: 1.0 },
      { concept: 'clear hierarchy from family trust to project company', priority: 0.9 },
    ],
  },
  '防火墙公司': {
    subject: 'a thick concrete firewall standing between a burning building and a protected safe building',
    action: 'flames blocked by the firewall, assets behind it remain safe',
    anchors: [
      { concept: 'concrete firewall blocking fire between buildings', priority: 1.0 },
      { concept: 'protected assets behind firewall', priority: 0.85 },
    ],
  },
  '三独立': {
    subject: 'three separate office spaces each with their own desk, seal stamp, and filing cabinet',
    action: 'clear physical separation: independent finances, independent personnel, independent business',
    anchors: [
      { concept: 'three separate independent offices with own stamps and files', priority: 1.0 },
      { concept: 'clear physical separation between business units', priority: 0.8 },
    ],
  },
  '实缴': {
    subject: 'a hand placing real gold coins into a company registration document safe',
    action: 'physical capital being deposited, stamped receipt in hand',
    anchors: [
      { concept: 'gold coins being placed into company safe', priority: 1.0 },
      { concept: 'stamped capital registration receipt', priority: 0.8 },
    ],
  },
  // 风险场景类
  '破产': {
    subject: 'an empty office with overturned chairs, scattered papers, and a "closed" sign on the door',
    action: 'last employee carrying a cardboard box walking out',
    anchors: [
      { concept: 'empty office with overturned chairs and scattered papers', priority: 1.0 },
      { concept: 'person carrying box leaving closed office', priority: 0.9 },
    ],
  },
  '债权人': {
    subject: 'a determined businessman in suit holding legal documents, standing at the door of a company',
    action: 'presenting official court documents demanding repayment',
    anchors: [
      { concept: 'creditor holding court documents at company door', priority: 1.0 },
      { concept: 'official legal demand papers', priority: 0.8 },
    ],
  },
  // 数据财务类
  '免税': {
    subject: 'a clear comparison chart showing money flow: left side with heavy tax burden, right side with legal tax optimization path',
    action: 'arrows showing the optimized path saving significant amounts',
    anchors: [
      { concept: 'comparison chart tax burden vs optimized path', priority: 1.0 },
      { concept: 'money saved through legal optimization', priority: 0.85 },
    ],
  },
  '分红': {
    subject: 'stacks of dividend certificates and profit distribution documents on a boardroom table',
    action: 'company profits being distributed to shareholders via official channels',
    anchors: [
      { concept: 'dividend certificates on boardroom table', priority: 1.0 },
      { concept: 'profit distribution flow diagram', priority: 0.8 },
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
 * 从原文提取视觉锚点（无 LLM 时使用）
 */
function extractAnchorsFromText(
  text: string,
  visualType: string
): Array<{ concept: string; priority: number }> {
  const conceptMatch = findBestConceptMatch(text);
  if (conceptMatch) {
    return conceptMatch.match.anchors;
  }

  // 通用锚点兜底
  switch (visualType) {
    case 'data_stat':
      return [
        { concept: 'financial data charts and reports on desk', priority: 1.0 },
        { concept: 'calculator and pen next to spreadsheet', priority: 0.7 },
      ];
    case 'step_framework':
      return [
        { concept: 'step-by-step process flowchart on whiteboard', priority: 1.0 },
        { concept: 'organized handbook with numbered stages', priority: 0.7 },
      ];
    case 'vs_comparison':
      return [
        { concept: 'split-screen comparison of correct vs incorrect approach', priority: 1.0 },
        { concept: 'red warning stamp on one side, green approval on other', priority: 0.8 },
      ];
    case 'historical_recreation':
      return [
        { concept: 'historical figures in period-accurate setting', priority: 1.0 },
        { concept: 'era-specific architecture and costumes', priority: 0.8 },
      ];
    case 'concept_metaphor':
      return [
        { concept: 'symbolic physical object representing abstract idea', priority: 1.0 },
        { concept: 'contemplative lighting and atmosphere', priority: 0.6 },
      ];
    default:
      return [
        { concept: 'professional person in realistic business setting', priority: 1.0 },
        { concept: 'authentic office environment with natural light', priority: 0.7 },
      ];
  }
}

/**
 * 本地语义驱动场景引擎 — 基于原文内容动态生成具体场景
 */
function directWithLocalRules(beats: VisualBeat[]): ScenePlan[] {
  return beats.map((b, idx) => {
    const text = b.sourceText;
    const shot = getAlternatingShot(idx);

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

      // 根据概念类别补充前景背景
      if (/穿透|连带|混同|击穿|追责/.test(conceptMatch.key)) {
        foreground = 'legal documents with official court seals';
        background = 'modern corporate district with multiple company buildings';
        primaryEmotion = '紧迫警示';
      } else if (/架构|防火墙|独立|实缴/.test(conceptMatch.key)) {
        foreground = 'company registration documents and official stamps';
        background = 'clean modern office with organizational chart on wall';
        primaryEmotion = '条理清晰';
      } else if (/破产|债权/.test(conceptMatch.key)) {
        foreground = 'scattered papers and overturned items';
        background = 'dimly lit office corridor';
        primaryEmotion = '紧张压迫';
      } else {
        foreground = 'financial documents and business tools on desk';
        background = 'well-lit modern business environment';
      }
    } else {
      // ——— 无具体匹配：基于 visualType 动态生成（但从原文提取关键信息） ———
      anchors = extractAnchorsFromText(text, b.visualType);

      // 从原文中提取核心片段用于 communicationGoal
      const textSnippet = text.length > 20 ? text.slice(0, 20) + '…' : text;
      commGoal = `1秒读懂：${textSnippet}`;

      switch (b.visualType) {
        case 'data_stat':
          primarySubject = 'clean financial report with highlighted key metrics and trend lines on a wooden desk';
          action = 'key data points prominently displayed with clear visual hierarchy';
          foreground = 'precision calculator, steel pen, and reading glasses beside the report';
          background = 'floor-to-ceiling windows with blurred city skyline at dusk';
          mustInclude.push('paper charts with trend lines', 'physical desk items');
          break;

        case 'step_framework':
          primarySubject = 'a structured multi-step roadmap displayed on a large whiteboard or presentation easel';
          action = 'each stage clearly numbered and connected by directional arrows';
          foreground = 'color-coded sticky notes and step-by-step instruction manual on the desk';
          background = 'bright team meeting room with collaborative workspace';
          mustInclude.push('numbered step indicators', 'directional flow arrows');
          break;

        case 'vs_comparison':
          primarySubject = 'split-screen layout: left side showing chaotic unsafe approach, right side showing proper compliant method';
          action = 'stark visual contrast between wrong path (red warning) and right path (green approved)';
          foreground = 'red stamp "REJECTED" on left, green stamp "APPROVED" on right';
          background = 'neutral professional dual-tone backdrop';
          mustInclude.push('official stamps', 'clear visual contrast');
          primaryEmotion = '警示对比';
          break;

        case 'historical_recreation':
          primarySubject = 'historically accurate key figures in period-appropriate clothing and setting';
          action = 'engaged in the pivotal historical moment being narrated';
          foreground = 'era-specific artifacts, traditional tools or documents';
          background = 'architecturally authentic historical building or landscape';
          period = '历史时期';
          primaryEmotion = '庄严肃穆';
          mustInclude.push('period-accurate costumes', 'era-specific architecture');
          mustAvoid.push('modern electronic devices', 'modern concrete buildings');
          break;

        case 'concept_metaphor':
          primarySubject = 'a powerful physical metaphor object: brass balance scale, ancient key opening heavy door, or lighthouse beam';
          action = 'the metaphor object in a state of quiet revelation or transformation';
          foreground = 'weathered wooden surface with open leather-bound book';
          background = 'soft morning light filtering through old window blinds';
          primaryEmotion = '深沉睿智';
          mustInclude.push('tangible metaphor object');
          break;

        default: // scene_narrative
          primarySubject = 'a real person (business professional or everyday protagonist) in an authentic setting';
          action = 'deeply engaged in thought, conversation, or meaningful work activity';
          foreground = 'natural everyday objects that tell the person\'s story';
          background = 'realistic indoor or street environment with lived-in details';
          break;
      }
    }

    // 3. 检查原文中是否有案例故事人物（动态覆盖主体）
    if (/(有个老板|这个老板|名下三家|名下.*公司|真实.*场景|真实案例)/.test(text) && !conceptMatch) {
      primarySubject = 'a middle-aged Chinese businessman in his office, looking worried at multiple company documents spread on desk';
      action = 'reviewing corporate papers with mounting concern, some papers highlighted in red';
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
        cameraAngle: shot === 'wide' ? 'slightly_elevated' as const : 'eye_level' as const,
        subjectScale: shot === 'close' ? 'dominant' as const : 'balanced' as const,
        depth: 'layered' as const,
      },
      emotion: {
        primary: primaryEmotion,
        secondary: '沉稳',
      },
      mustInclude: mustInclude.length > 0 ? mustInclude : ['主体实体道具', '清晰真实场景'],
      mustAvoid,
      visualAnchors: anchors,
    };
  });
}

/**
 * 镜头景别节奏交替算法
 */
function getAlternatingShot(index: number): ShotType {
  const rhythm: ShotType[] = ['wide', 'medium', 'close', 'medium'];
  return rhythm[index % rhythm.length];
}
