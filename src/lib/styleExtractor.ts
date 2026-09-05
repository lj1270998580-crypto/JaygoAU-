import { chatCompletion } from './modelHubService';
import type { ModelHubSettings } from './modelHubTypes';
import type { SkillPreset } from './skillTypes';

const EXTRACTOR_SYSTEM_PROMPT = `你是一名顶级短视频自媒体 IP 孵化专家与提示词逆向工程师。
用户将为你提供某个创作者历史最爆款的 1~3 篇真实口播文案。
请对这些文案进行深度解构，精准逆向提炼出该创作者的【风格画像与提示词预设】。

你必须严格输出合法的 JSON 对象，不要输出任何额外的解释或代码块标记。JSON 结构如下：
{
  "persona": "一句话概括其人设定位、说话气质与身份色彩",
  "catchphrases": ["标志性口头禅1", "标志性口头禅2", "起手或转折特色用语3"],
  "pacingRules": {
    "sentenceLength": "关于单句长度与节奏断句的约束（如短句为主，单句15字内）",
    "structure": "该创作者的标准行文框架（如黄金3秒反常识钩子 → 痛点撕开 → 认知破局 → 金句收尾）"
  },
  "negativeConstraints": ["该创作者绝对不会说的词汇或红线禁忌1", "禁忌2"]
}`;

export async function extractStyleFromSamples(
  samples: string[],
  teacherName: string,
  modelSettings: ModelHubSettings
): Promise<SkillPreset> {
  const combinedText = samples.map((s, idx) => `【范文 ${idx + 1}】：\n${s.trim()}`).join('\n\n');

  const prompt = `请对以下创作者【${teacherName}】的几篇真实口播样本文案进行风格逆向分析，输出 JSON：\n\n${combinedText}`;

  const res = await chatCompletion(
    [
      { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.2 },
    modelSettings
  );

  let parsed: any = {};
  try {
    const cleaned = res.replace(/```json/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // 简单兜底
    parsed = {
      persona: `${teacherName} 专属风格创作者`,
      catchphrases: ['记住这一点', '别看表面'],
      pacingRules: {
        sentenceLength: '短句为主，单句16字以内',
        structure: '前3秒黄金钩子 → 痛点展开 → 解法 → 金句行动召唤',
      },
      negativeConstraints: ['严禁八股套话', '严禁长难句'],
    };
  }

  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    id,
    name: teacherName || '未命名风格预设',
    author: 'AI 样本逆向提炼',
    version: '1.0.0',
    description: `基于 ${samples.length} 篇真实爆款样本提炼的专属风格画像`,
    persona: parsed.persona || '专业自媒体创作者',
    catchphrases: Array.isArray(parsed.catchphrases) ? parsed.catchphrases : [],
    pacingRules: {
      sentenceLength: parsed.pacingRules?.sentenceLength || '短句为主，单句不超过18字',
      structure: parsed.pacingRules?.structure || '黄金3秒反转 → 痛点展开 → 认知重构 → 金句收尾',
    },
    negativeConstraints: Array.isArray(parsed.negativeConstraints) ? parsed.negativeConstraints : [],
    fewShotExamples: [
      {
        inputTopic: '典型自媒体选题',
        outputScript: samples[0] ? samples[0].slice(0, 300) : '示范口播文本',
      },
    ],
    modelParams: {
      temperature: 0.35,
      maxTokens: 1200,
    },
    isSystem: false,
    updatedAt: Date.now(),
  };
}
