import type { SkillPreset } from './skillTypes';
import type { ChatMessage } from './modelHubService';

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  content: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachedFile[];
  timestamp: number;
}

export interface ScriptSession {
  id: string;
  title: string;
  skillId: string;
  messages: ChatMessageItem[];
  pinnedScript?: string;
  memorySummary?: string;             // 压缩后的长期记忆摘要（已达成的共识/人设偏好/素材提要）
  compressedUntilIndex?: number;     // 已归纳压缩到的消息索引位点
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_STORAGE_KEY = 'jaygo_script_sessions_v2';

export function getStoredSessions(): ScriptSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as ScriptSession[];
    if (Array.isArray(list)) {
      return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    return [];
  } catch {
    return [];
  }
}

export function saveAllSessions(sessions: ScriptSession[]): void {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn('[SessionManager] Failed to persist sessions:', err);
  }
}

export function saveSession(session: ScriptSession): ScriptSession[] {
  const all = getStoredSessions();
  const idx = all.findIndex(s => s.id === session.id);
  const updatedSession = { ...session, updatedAt: Date.now() };
  if (idx >= 0) {
    all[idx] = updatedSession;
  } else {
    all.unshift(updatedSession);
  }
  saveAllSessions(all);
  return all;
}

export function deleteSessionById(sessionId: string): ScriptSession[] {
  const all = getStoredSessions().filter(s => s.id !== sessionId);
  saveAllSessions(all);
  return all;
}

export function renameSessionById(sessionId: string, newTitle: string): ScriptSession | null {
  const all = getStoredSessions();
  const target = all.find(s => s.id === sessionId);
  if (!target) return null;
  target.title = newTitle.trim() || target.title;
  target.updatedAt = Date.now();
  saveAllSessions(all);
  return target;
}

export function buildWelcomeMessage(skill: SkillPreset): ChatMessageItem {
  return {
    id: `welcome_${Date.now()}`,
    role: 'assistant',
    content: `你好！我是你的 AI 自媒体文案创作顾问。\n\n当前已装载【**${skill.name}**】风格画像（人设：${skill.persona}）。\n\n你可以：\n1. **直接对话交流**：提出任何选题，我将为你量身打磨口播文案；\n2. 📎 **上传素材文件**（支持 \`.zip\` / \`.txt\` / \`.md\` / \`.docx\` / \`.pdf\` / \`.json\` 等），让我深度洗稿重构；\n3. 生成满意的文案后，点击文案下方的【设为精选文案】，即可**一键流转推往「语音合成」或「蝉镜数字人」**！`,
    timestamp: Date.now(),
  };
}

export function createNewSession(skill: SkillPreset, initialTitle?: string): ScriptSession {
  const now = Date.now();
  const session: ScriptSession = {
    id: `session_${now}_${Math.random().toString(36).slice(2, 6)}`,
    title: initialTitle || `新会话 ${new Date(now).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    skillId: skill.id,
    messages: [buildWelcomeMessage(skill)],
    pinnedScript: '',
    memorySummary: '',
    compressedUntilIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
  saveSession(session);
  return session;
}

/**
 * 组装大模型 System Prompt（融合创作者人设画像与 zip 附属知识库文件）
 */
export function buildSkillSystemPrompt(skill: SkillPreset): string {
  let prompt = '';
  if (skill.systemPrompt && skill.systemPrompt.trim()) {
    prompt = skill.systemPrompt;
  } else {
    prompt = `你是一名顶级自媒体口播脚本重构与爆款创作大师。
【当前遵循创作者人设】：${skill.persona || '专业自媒体博主'}
【标志性口头禅】：${skill.catchphrases?.length ? skill.catchphrases.join('、') : '无'}
【句长与节奏铁律】：${skill.pacingRules?.sentenceLength || '短句为主，每句不超过15字'}
【行文框架模式】：${skill.pacingRules?.structure || '黄金钩子-痛点拆解-认知破局-金句行动号召'}
【绝对红线禁忌】：
${skill.negativeConstraints?.length ? skill.negativeConstraints.map(c => `- ${c}`).join('\n') : '- 严禁使用枯燥书面语'}
【少样本参考范本】：
输入：${skill.fewShotExamples?.[0]?.inputTopic || '主题'}
输出：${skill.fewShotExamples?.[0]?.outputScript || ''}`;
  }

  // 融合从 Zip 压缩包中解压识别出的附属知识库与参考文件
  if (skill.skillFiles && skill.skillFiles.length > 0) {
    const filesContext = skill.skillFiles
      .slice(0, 5) // 保护 Prompt 长度
      .map(f => `--- 附属参考文档: ${f.path} ---\n${f.content.slice(0, 2500)}\n`)
      .join('\n');
    prompt += `\n\n【技能附属专业规范与知识库文件】：\n${filesContext}`;
  }

  prompt += `\n\n【重要排版与输出铁律】：
1. 如用户需要具体口播文案，第一行必须直接输出文案正文的第一句话，绝对禁止在开头输出客套寒暄（如“好的，为您生成如下口播文案：”等）；
2. 绝对禁止在文案末尾附带客套总结、问候或说明（如“希望这篇文案对您有帮助”、“随时可以微调”等）；
3. 全文输出纯粹、口语化、节奏紧凑、利于直接配音和数字人出镜的高吸睛完整口播文案；
4. 【关键内容加粗铁律】：输出文案正文时，必须对全文的 **3~6 处核心反常识观点、灵魂金句、刺痛用户的核心痛点或情绪高潮句** 使用 Markdown **加粗**（例如：\`**认知差才是最大的贫富差距**\`），作为口播重音停顿与视觉抓手；
5. 【模糊需求与宽泛命题的启发追问机制】：如果用户的输入非常宽泛、模糊或仅为一个大命题（例如“写一篇关于安娜卡列尼娜5分钟文章”、“写个讲创业的文案”）：
   - 切忌立即直接生成平庸泛泛的套路文案！
   - 必须站在顶级内容操盘手和导师角度，先给出 2~3 个最具反常识、直击人性冲突的切入角度（用序号清晰列出），并向用户简短追问：“你更倾向于从哪个角度切入？或这篇文案的核心目标受众是谁？”；
   - 待用户确认切入点或进一步细化要求后，再为你全力输出万字级/千字级爆款文案；
   - 但若用户已经提供了具体素材、明确论点或明确要求“直接写/立刻出完整文案”，则必须立刻严格按创作者人设输出完整终稿；
6. 【文案完整性与结构完备铁律】：当输出具体文案时，必须保持全文完整输出（涵盖 Hook 黄金钩子、痛点论证、认知解药、金句与行动号召），坚决杜绝因截断导致半途而废。`;

  return prompt;
}

/**
 * 计算当前会话上下文相对模型最大容量的占用比例
 */
export function checkContextTokenRatio(
  session: ScriptSession,
  skill: SkillPreset,
  modelContextLimit = 64000
): { estimatedTokens: number; limit: number; ratio: number; isNearCapacity: boolean } {
  let totalChars = skill.persona.length + (skill.description?.length || 0);
  for (const f of skill.skillFiles || []) {
    totalChars += f.content.length;
  }
  for (const m of session.messages) {
    totalChars += m.content.length;
    for (const a of m.attachments || []) {
      totalChars += Math.min(a.content.length, 3000);
    }
  }
  // 中文混排估算系数 1.4 Token/字符
  const estimatedTokens = Math.ceil(totalChars * 1.4);
  const limit = Math.max(modelContextLimit, 4000);
  const ratio = estimatedTokens / limit;
  return {
    estimatedTokens,
    limit,
    ratio,
    isNearCapacity: ratio >= 0.9,
  };
}

/**
 * 自动上下文滑动窗口与长期记忆压缩
 * 根据模型参数匹配上下文支持，当上下文长度达到 90% 或轮次过多时自动深度压缩，提炼长期记忆
 */
export function buildCompressedContext(
  session: ScriptSession,
  skill: SkillPreset,
  maxRecentTurns = 4,
  modelContextLimit = 64000
): {
  apiMessages: ChatMessage[];
  updatedSummary: string;
  isCompressed: boolean;
  reachedNinetyPercent: boolean;
  estimatedTokens: number;
} {
  const systemPrompt = buildSkillSystemPrompt(skill);
  const messages = session.messages;
  const realMessages = messages.filter(m => !m.id.startsWith('welcome_'));

  const { estimatedTokens, isNearCapacity } = checkContextTokenRatio(session, skill, modelContextLimit);

  // 若轮次较少且未达 90% 容量阈值，直接高保真全量传递
  if (realMessages.length <= maxRecentTurns && !isNearCapacity) {
    const history: ChatMessage[] = realMessages.map(m => {
      let content = m.content;
      if (m.attachments && m.attachments.length > 0) {
        const attachStr = m.attachments.map(a => `\n【参考附件: ${a.name}】\n${a.content.slice(0, 3000)}\n---`).join('\n');
        content = `${attachStr}\n${m.content}`;
      }
      return { role: m.role, content };
    });

    return {
      apiMessages: [{ role: 'system', content: systemPrompt }, ...history],
      updatedSummary: session.memorySummary || '',
      isCompressed: false,
      reachedNinetyPercent: false,
      estimatedTokens,
    };
  }

  // 轮次较多或已达到 90% 上限：切分历史归档区与近期活跃区
  // 若已达 90% 容量，更加积极地压缩，仅保留最近 2 轮高保真，其余全量提炼为摘要
  const actualRecentTurns = isNearCapacity ? Math.min(2, maxRecentTurns) : maxRecentTurns;
  const recentMessages = realMessages.slice(-actualRecentTurns);
  const olderMessages = realMessages.slice(0, -actualRecentTurns);

  // 增量提取早前轮次中的关键决策与主题
  let memorySummary = session.memorySummary || '';
  const newSummaries: string[] = [];

  for (const m of olderMessages) {
    if (m.role === 'user') {
      const line = m.content.split('\n')[0].replace(/^[#*\s-]+/, '').trim().slice(0, 60);
      if (line) newSummaries.push(`- 探讨的主题/诉求: ${line}`);
    } else if (m.role === 'assistant') {
      // 提取核心金句或方向
      const firstLine = m.content.split('\n').find(l => l.trim().length > 4 && !l.startsWith('<think>')) || '';
      if (firstLine) {
        const clean = firstLine.replace(/^[#*\s-]+/, '').trim().slice(0, 60);
        newSummaries.push(`  → 定调文案核心开头: "${clean}"`);
      }
    }
  }

  if (newSummaries.length > 0) {
    const combined = [...new Set(newSummaries)].slice(-10).join('\n');
    memorySummary = `【前序创作历史与共识摘要】:\n${combined}\n【当前精选文案定稿方向】: ${session.pinnedScript ? session.pinnedScript.slice(0, 80) + '...' : '持续打磨中'}`;
  }

  const memorySystemMessage: ChatMessage = {
    role: 'system',
    content: `${memorySummary}\n\n[注意：请牢记上述前序会话达成的创作共识、选题方向与用户偏好，保持风格与剧情连贯，不要重复之前的废弃方案]`,
  };

  const recentHistory: ChatMessage[] = recentMessages.map(m => {
    let content = m.content;
    if (m.attachments && m.attachments.length > 0) {
      const attachStr = m.attachments.map(a => `\n【参考附件: ${a.name}】\n${a.content.slice(0, 3000)}\n---`).join('\n');
      content = `${attachStr}\n${m.content}`;
    }
    return { role: m.role, content };
  });

  return {
    apiMessages: [
      { role: 'system', content: systemPrompt },
      memorySystemMessage,
      ...recentHistory,
    ],
    updatedSummary: memorySummary,
    isCompressed: true,
    reachedNinetyPercent: isNearCapacity,
    estimatedTokens,
  };
}
