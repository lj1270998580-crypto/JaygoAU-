export interface FewShotExample {
  inputTopic: string;
  outputScript: string;
}

export interface PacingRules {
  sentenceLength: string; // e.g. "极短句，单句不超过18个字"
  structure: string;      // e.g. "黄金3秒反常识钩子 → 痛点真相 → 降维打法 → 金句收尾"
}

export interface SkillFileAsset {
  path: string;       // e.g. "references/style_guide.md" or "examples/demo.txt"
  name: string;       // e.g. "style_guide.md"
  size?: number;
  content: string;    // text content of the asset
}

export interface SkillPreset {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  persona: string;
  catchphrases: string[];
  pacingRules: PacingRules;
  negativeConstraints: string[];
  fewShotExamples: FewShotExample[];
  skillFiles?: SkillFileAsset[];
  voiceBinding?: {
    voiceId: string;
    voiceName?: string;
  };
  modelParams?: {
    temperature?: number;
    maxTokens?: number;
  };
  systemPrompt?: string;
  isSystem?: boolean;
  updatedAt?: number;
}

export { SYSTEM_SKILL_PRESETS } from './presetSkills';

