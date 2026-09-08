import JSZip from 'jszip';
import type { SkillPreset, SkillFileAsset } from './skillTypes';
import { SYSTEM_SKILL_PRESETS } from './skillTypes';
import { api } from './ipc';

const LOCAL_SKILLS_STORAGE_KEY = 'jaygo_au_custom_skills_v1';

export function getStoredCustomSkills(): SkillPreset[] {
  try {
    const raw = localStorage.getItem(LOCAL_SKILLS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SkillPreset[];
  } catch (_) {
    return [];
  }
}

export function saveCustomSkill(skill: SkillPreset): void {
  const existing = getStoredCustomSkills();
  const idx = existing.findIndex(s => s.id === skill.id);
  if (idx >= 0) {
    existing[idx] = { ...skill, updatedAt: Date.now() };
  } else {
    existing.push({ ...skill, updatedAt: Date.now() });
  }
  localStorage.setItem(LOCAL_SKILLS_STORAGE_KEY, JSON.stringify(existing));
  if (api?.saveSettings) {
    api.saveSettings({ customSkills: existing } as any).catch(() => {});
  }
}

export function deleteCustomSkill(id: string): void {
  const existing = getStoredCustomSkills().filter(s => s.id !== id);
  localStorage.setItem(LOCAL_SKILLS_STORAGE_KEY, JSON.stringify(existing));
  if (api?.saveSettings) {
    api.saveSettings({ customSkills: existing } as any).catch(() => {});
  }
}

const LOCAL_HIDDEN_SKILLS_KEY = 'jaygo_au_hidden_skills_v1';

export function getHiddenSkillIds(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_HIDDEN_SKILLS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function hideSkill(id: string): void {
  const list = getHiddenSkillIds();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(LOCAL_HIDDEN_SKILLS_KEY, JSON.stringify(list));
  }
}

export function restoreDefaultSkills(): void {
  localStorage.removeItem(LOCAL_HIDDEN_SKILLS_KEY);
}

export function deleteSkill(id: string): void {
  deleteCustomSkill(id);
  hideSkill(id);
}

export function getAllSkills(): SkillPreset[] {
  const hidden = new Set(getHiddenSkillIds());
  const custom = getStoredCustomSkills();
  const all = [...SYSTEM_SKILL_PRESETS, ...custom];
  const filtered = all.filter(s => !hidden.has(s.id));
  if (filtered.length === 0 && SYSTEM_SKILL_PRESETS.length > 0) {
    return [SYSTEM_SKILL_PRESETS[0]];
  }
  return filtered;
}

export function findSkillById(id: string): SkillPreset | undefined {
  return getAllSkills().find(s => s.id === id);
}

/**
 * 导入并解析 .skill.md 或 .jaygoskill 内容
 */
export function parseSkillContent(rawContent: string, fileName = ''): SkillPreset {
  const trimmed = rawContent.trim();

  // 1. 如果是 JSON 格式 (.jaygoskill)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      return validateAndSanitizeSkill(parsed, fileName);
    } catch (e: any) {
      throw new Error(`JSON 格式解析失败: ${e.message}`);
    }
  }

  // 2. 如果是 Markdown + YAML Frontmatter 格式 (.skill.md)
  if (trimmed.startsWith('---')) {
    const secondDashIndex = trimmed.indexOf('---', 3);
    if (secondDashIndex === -1) {
      throw new Error('无效的 SKILL.md 格式：缺少 Frontmatter 闭合标记 (---)');
    }

    const frontmatterRaw = trimmed.slice(3, secondDashIndex).trim();
    const markdownBody = trimmed.slice(secondDashIndex + 3).trim();

    // 简单解析 YAML 键值对（避免引入重型 yaml 库）
    const meta: Record<string, any> = {};
    for (const line of frontmatterRaw.split('\n')) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join(':').trim().replace(/^['"]|['"]$/g, '');
        meta[key] = val;
      }
    }

    // 从 Markdown 正文中提取人设、口头禅、范例
    const sections = parseMarkdownSections(markdownBody);

    const preset: Partial<SkillPreset> = {
      id: meta.name || `skill_${Date.now()}`,
      name: meta.title || meta.name || fileName.replace(/\.[^.]+$/, '') || '自定义技能',
      author: meta.author || '外部导入',
      version: meta.version || '1.0.0',
      description: meta.description || sections.description || '自媒体定制口播技能',
      persona: sections.persona || sections.role || '专业自媒体创作者',
      catchphrases: sections.catchphrases || [],
      pacingRules: {
        sentenceLength: sections.sentenceLength || '短句为主，每句不超过18字',
        structure: sections.structure || '前3秒黄金钩子 → 痛点展开 → 解法 → 金句收尾',
      },
      negativeConstraints: sections.negativeConstraints || ['严禁八股套话', '避免长难句'],
      fewShotExamples: sections.fewShotExamples || [],
    };

    return validateAndSanitizeSkill(preset, fileName);
  }

  throw new Error('未识别的文件格式，仅支持 .skill.md 或 .jaygoskill (JSON) 文件');
}

function parseMarkdownSections(body: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = body.split('\n');
  let currentHeader = '';
  let currentBlock: string[] = [];

  const flush = () => {
    if (!currentHeader) return;
    const text = currentBlock.join('\n').trim();
    if (/人设|persona|role/i.test(currentHeader)) {
      result.persona = text;
    } else if (/口头禅|catchphrase|常用语/i.test(currentHeader)) {
      result.catchphrases = text
        .split('\n')
        .map(l => l.replace(/^[-*•\d.]\s*/, '').trim())
        .filter(Boolean);
    } else if (/句式|节奏|pacing/i.test(currentHeader)) {
      result.sentenceLength = text;
    } else if (/框架|结构|structure/i.test(currentHeader)) {
      result.structure = text;
    } else if (/禁忌|红线|negative/i.test(currentHeader)) {
      result.negativeConstraints = text
        .split('\n')
        .map(l => l.replace(/^[-*•\d.]\s*/, '').trim())
        .filter(Boolean);
    } else if (/范例|example|few-shot/i.test(currentHeader)) {
      result.fewShotExamples = parseFewShotExamples(text);
    }
  };

  for (const line of lines) {
    if (line.startsWith('#')) {
      flush();
      currentHeader = line.replace(/^#+\s*/, '').trim();
      currentBlock = [];
    } else {
      currentBlock.push(line);
    }
  }
  flush();

  return result;
}

function parseFewShotExamples(text: string): { inputTopic: string; outputScript: string }[] {
  if (!text) return [];
  // 简要提取输入与输出
  const parts = text.split(/改写标准终稿|标准终稿|输出范例|改写终稿/i);
  if (parts.length >= 2) {
    const input = parts[0].replace(/输入素材示例|参考输入|输入/gi, '').replace(/[#*`]/g, '').trim();
    const output = parts[1].replace(/[#*`]/g, '').trim();
    if (output) {
      return [{ inputTopic: input || '自媒体爆款主题', outputScript: output }];
    }
  }
  return [];
}

function validateAndSanitizeSkill(s: any, fallbackName: string): SkillPreset {
  if (!s || typeof s !== 'object') {
    throw new Error('技能数据无效');
  }

  const id = String(s.id || `custom_${Date.now()}`).replace(/[^\w-]/g, '_');
  const name = String(s.name || fallbackName || '未命名技能');
  const persona = String(s.persona || '专业自媒体创作者');

  let catchphrases: string[] = [];
  if (Array.isArray(s.catchphrases)) {
    catchphrases = s.catchphrases.map(String).filter(Boolean);
  }

  let negativeConstraints: string[] = [];
  if (Array.isArray(s.negativeConstraints)) {
    negativeConstraints = s.negativeConstraints.map(String).filter(Boolean);
  }

  let fewShotExamples: { inputTopic: string; outputScript: string }[] = [];
  if (Array.isArray(s.fewShotExamples) && s.fewShotExamples.length > 0) {
    fewShotExamples = s.fewShotExamples.map((ex: any) => ({
      inputTopic: String(ex.inputTopic || '主题'),
      outputScript: String(ex.outputScript || ''),
    }));
  }

  // 参数安全区间保护
  const temp = typeof s.modelParams?.temperature === 'number' ? s.modelParams.temperature : 0.35;
  const clampedTemp = Math.max(0.2, Math.min(0.6, temp));

  return {
    id,
    name,
    author: String(s.author || '用户自定义'),
    version: String(s.version || '1.0.0'),
    description: String(s.description || '自媒体口播风格定制'),
    persona,
    catchphrases,
    pacingRules: {
      sentenceLength: String(s.pacingRules?.sentenceLength || '短句为主，每句不超过18字'),
      structure: String(s.pacingRules?.structure || '黄金3秒钩子 → 痛点撕开 → 认知破局 → 金句收尾'),
    },
    negativeConstraints,
    fewShotExamples,
    skillFiles: Array.isArray(s.skillFiles) ? s.skillFiles : undefined,
    modelParams: {
      temperature: clampedTemp,
      maxTokens: 1500,
    },
    isSystem: false,
    updatedAt: Date.now(),
  };
}

/**
 * 从 .zip 压缩包中自动解压并识别通用 Skill 体系
 * 支持包含 SKILL.md / skill.md 以及 references/, examples/, scripts/ 等多文件
 */
export async function parseSkillFromZip(zipBuffer: ArrayBuffer | Uint8Array, zipFileName = ''): Promise<SkillPreset> {
  const zip = await JSZip.loadAsync(zipBuffer);

  const fileEntries: Array<{ path: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, file) => {
    const normPath = relativePath.replace(/\\/g, '/');
    if (!file.dir && !normPath.startsWith('__MACOSX') && !normPath.includes('/.DS_Store')) {
      fileEntries.push({ path: normPath, file });
    }
  });

  if (fileEntries.length === 0) {
    throw new Error('压缩包为空，未包含任何有效文件');
  }

  // 优先级排序：
  // 1) SKILL.md (不区分大小写，根目录优先)
  // 2) 任何以 .skill.md 结尾的文件
  // 3) 任何包含 --- Frontmatter 或 JSON 的 md/json 文件
  fileEntries.sort((a, b) => {
    const aName = a.path.split(/[/\\]/).pop()?.toLowerCase() || '';
    const bName = b.path.split(/[/\\]/).pop()?.toLowerCase() || '';
    if (aName === 'skill.md') return -1;
    if (bName === 'skill.md') return 1;
    if (aName.endsWith('.skill.md')) return -1;
    if (bName.endsWith('.skill.md')) return 1;
    return 0;
  });

  let skillMainFile: { path: string; text: string } | null = null;
  for (const item of fileEntries) {
    const fn = item.path.split(/[/\\]/).pop()?.toLowerCase() || '';
    if (fn === 'skill.md' || fn.endsWith('.skill.md') || fn.endsWith('.jaygoskill') || fn.endsWith('.json') || fn.endsWith('.md')) {
      const text = await item.file.async('text');
      if (fn === 'skill.md' || fn.endsWith('.skill.md') || text.includes('---') || (fn.endsWith('.json') && text.includes('"persona"'))) {
        skillMainFile = { path: item.path, text };
        break;
      }
    }
  }

  if (!skillMainFile) {
    // 降级：找第一个 .md
    for (const item of fileEntries) {
      if (item.path.toLowerCase().endsWith('.md')) {
        const text = await item.file.async('text');
        skillMainFile = { path: item.path, text };
        break;
      }
    }
  }

  if (!skillMainFile) {
    throw new Error('压缩包中未检测到符合 Skill 规范的 SKILL.md 或风格定义文件');
  }

  const baseSkillName = zipFileName.replace(/\.[^.]+$/, '').replace(/[-_]skill$/i, '');
  const parsedSkill = parseSkillContent(skillMainFile.text, baseSkillName);

  // 收集压缩包内除主定义外的其它知识库/参考文件（例如 references/, examples/, scripts/ 等）
  const skillFiles: SkillFileAsset[] = [];
  for (const item of fileEntries) {
    if (item.path === skillMainFile.path) continue;
    try {
      const isText = /\.(md|txt|json|yaml|yml|csv|prompt|py|js|ts|sh|sql|html)$/i.test(item.path);
      if (isText) {
        const content = await item.file.async('text');
        skillFiles.push({
          path: item.path,
          name: item.path.split(/[/\\]/).pop() || item.path,
          size: content.length,
          content,
        });
      }
    } catch (_) {}
  }

  if (skillFiles.length > 0) {
    parsedSkill.skillFiles = skillFiles;
  }

  return parsedSkill;
}

/**
 * 导出 SkillPreset 为完整 zip 压缩包（包含 SKILL.md 与所有附属文件）
 */
export async function exportSkillToZip(skill: SkillPreset): Promise<Blob> {
  const zip = new JSZip();
  const mainMd = exportSkillToMarkdown(skill);
  zip.file('SKILL.md', mainMd);

  if (skill.skillFiles && skill.skillFiles.length > 0) {
    for (const f of skill.skillFiles) {
      zip.file(f.path, f.content);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * 导出 SkillPreset 为可分享的 .skill.md 文本
 */
export function exportSkillToMarkdown(skill: SkillPreset): string {
  const frontmatter = [
    '---',
    `name: "${skill.id}"`,
    `title: "${skill.name}"`,
    `author: "${skill.author}"`,
    `version: "${skill.version}"`,
    `description: "${skill.description}"`,
    'model_config:',
    `  temperature: ${skill.modelParams?.temperature ?? 0.35}`,
    `  max_tokens: ${skill.modelParams?.maxTokens ?? 1500}`,
    '---',
  ].join('\n');

  const body = [
    '',
    `# 1. 创作者人设定位 (Persona)`,
    skill.persona,
    '',
    `# 2. 标志性口头禅 (Catchphrases)`,
    skill.catchphrases.map(c => `- ${c}`).join('\n') || '- 暂无特定口头禅',
    '',
    `# 3. 句式与断句节奏 (Pacing Rules)`,
    `**句长约束**：${skill.pacingRules.sentenceLength}`,
    `**行文结构**：${skill.pacingRules.structure}`,
    '',
    `# 4. 绝对红线禁忌 (Negative Constraints)`,
    skill.negativeConstraints.map(n => `- ${n}`).join('\n') || '- 严禁八股套话',
    '',
    `# 5. 黄金少样本范例 (Few-Shot Benchmark)`,
    skill.fewShotExamples.length > 0
      ? [
          '### 输入素材示例：',
          skill.fewShotExamples[0].inputTopic,
          '',
          '### 改写标准终稿：',
          skill.fewShotExamples[0].outputScript,
        ].join('\n')
      : '暂无范例',
  ].join('\n');

  return frontmatter + body;
}
