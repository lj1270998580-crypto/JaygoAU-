import { chatCompletion } from './modelHubService';
import type { ModelHubSettings } from './modelHubTypes';
import type { WorkflowProject, WorkflowNode } from './workflowTypes';
import { DEFAULT_NODES_FACTORY } from './workflowTypes';
import { getAllSkills } from './skillParser';

const COPILOT_SYSTEM_PROMPT = `你是一名短视频自媒体工业化自动化流水线专家。
用户会用大白话或自然语言描述他想要的自动化工作流（包括定时要求、主题、文案风格、配音、数字人以及是否加字幕等）。
你的任务是将用户的自然语言精准解析为结构化的工作流项目配置 JSON。

用户本地已有的老师风格 Skill 预设列表如下：
{{SKILLS_LIST}}

请严格输出纯 JSON 对象，不要输出任何 Markdown 代码块标记（如 \`\`\`json）或前言解释。JSON 结构必须严格符合：
{
  "projectName": "提取一个简明有力的项目名称",
  "projectDescription": "一句话概括此流水线",
  "trigger": {
    "enabled": true,
    "mode": "cron 或 manual 或 direct_input",
    "cronExpression": "标准 5 字段 Cron 表达式（例如每天 09:00 是 '0 9 * * *'，每隔 2 小时是 '0 */2 * * *'）",
    "cronDescription": "人性化中文描述（如 每天 09:00）"
  },
  "includeTopicSource": true,
  "topicSource": {
    "domainKeyword": "赛道关键词或主题",
    "generateCount": 1
  },
  "includeScript": true,
  "script": {
    "matchedSkillId": "最匹配的用户 Skill ID",
    "batchCount": 1,
    "targetWordCount": 300,
    "hookStrategy": "counter_intuitive"
  },
  "includeTts": true,
  "tts": {
    "emotion": "开心",
    "speedRatio": 1.0
  },
  "includeAvatar": true,
  "avatar": {
    "addSubtitle": true,
    "aspectRatio": "9:16",
    "resolution": "1080p"
  },
  "includeExport": true
}`;

export async function parseNaturalLanguageWorkflow(
  userPrompt: string,
  modelSettings: ModelHubSettings
): Promise<WorkflowProject> {
  const skills = getAllSkills();
  const skillsSummary = skills.map(s => `- ID: ${s.id}, 名称: ${s.name}, 描述: ${s.description}`).join('\n');

  const systemPrompt = COPILOT_SYSTEM_PROMPT.replace('{{SKILLS_LIST}}', skillsSummary);

  const rawRes = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.1 },
    modelSettings
  );

  let parsed: any = {};
  try {
    const cleaned = rawRes.replace(/```json/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    throw new Error(`AI 解析工作流格式异常: ${err.message}`);
  }

  // 动态组装节点
  const nodes: WorkflowNode[] = [];

  // 1. 触发节点
  const triggerNode = DEFAULT_NODES_FACTORY.trigger();
  if (parsed.trigger?.cronExpression) {
    triggerNode.config.cronExpression = parsed.trigger.cronExpression;
    triggerNode.config.cronDescription = parsed.trigger.cronDescription || '定时执行';
    triggerNode.config.mode = parsed.trigger.mode || 'cron';
  }
  nodes.push(triggerNode);

  // 2. 选题节点
  if (parsed.includeTopicSource !== false) {
    const topicNode = DEFAULT_NODES_FACTORY.topic_source();
    if (parsed.topicSource?.domainKeyword) {
      topicNode.config.domainKeyword = parsed.topicSource.domainKeyword;
      topicNode.name = `选题：${parsed.topicSource.domainKeyword}`;
    }
    if (typeof parsed.topicSource?.generateCount === 'number') {
      topicNode.config.generateCount = Math.max(1, parsed.topicSource.generateCount);
    }
    nodes.push(topicNode);
  }

  // 3. AI 脚本节点
  if (parsed.includeScript !== false) {
    const scriptNode = DEFAULT_NODES_FACTORY.ai_script();
    if (parsed.script?.matchedSkillId) {
      scriptNode.config.skillPresetId = parsed.script.matchedSkillId;
      const matchedSkill = skills.find(s => s.id === parsed.script.matchedSkillId);
      if (matchedSkill) {
        scriptNode.name = `文案：${matchedSkill.name}`;
      }
    }
    if (typeof parsed.script?.batchCount === 'number') {
      scriptNode.config.batchCount = Math.max(1, parsed.script.batchCount);
    }
    if (typeof parsed.script?.targetWordCount === 'number') {
      scriptNode.config.targetWordCount = parsed.script.targetWordCount;
    }
    nodes.push(scriptNode);
  }

  // 4. TTS 节点
  if (parsed.includeTts !== false) {
    const ttsNode = DEFAULT_NODES_FACTORY.voice_tts();
    if (parsed.tts?.emotion) {
      ttsNode.config.emotion = parsed.tts.emotion;
    }
    if (typeof parsed.tts?.speedRatio === 'number') {
      ttsNode.config.speedRatio = parsed.tts.speedRatio;
    }
    nodes.push(ttsNode);
  }

  // 5. 数字人节点
  if (parsed.includeAvatar !== false) {
    const avatarNode = DEFAULT_NODES_FACTORY.digital_avatar();
    if (typeof parsed.avatar?.addSubtitle === 'boolean') {
      avatarNode.config.addSubtitle = parsed.avatar.addSubtitle;
    }
    if (parsed.avatar?.aspectRatio) {
      avatarNode.config.aspectRatio = parsed.avatar.aspectRatio;
    }
    if (parsed.avatar?.resolution) {
      avatarNode.config.resolution = parsed.avatar.resolution;
    }
    nodes.push(avatarNode);
  }

  // 6. 归档与通知节点
  if (parsed.includeExport !== false) {
    nodes.push(DEFAULT_NODES_FACTORY.export_notify());
  }

  const projectId = `workflow_${Date.now()}`;

  return {
    id: projectId,
    name: parsed.projectName || '自然语言智能生成流水线',
    description: parsed.projectDescription || userPrompt.slice(0, 80),
    enabled: Boolean(parsed.trigger?.enabled ?? false),
    nodes,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastStatus: 'idle',
  };
}
