import type { WorkflowProject } from './workflowTypes';
import { DEFAULT_NODES_FACTORY } from './workflowTypes';
import { api } from './ipc';

const WORKFLOWS_STORAGE_KEY = 'jaygo_au_workflows_v1';

export function getWorkflowProjects(): WorkflowProject[] {
  try {
    const raw = localStorage.getItem(WORKFLOWS_STORAGE_KEY);
    if (!raw) {
      const initial = [createDefaultSampleProject()];
      localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as WorkflowProject[];
  } catch (_) {
    return [createDefaultSampleProject()];
  }
}

export function saveWorkflowProject(project: WorkflowProject): void {
  const list = getWorkflowProjects();
  const idx = list.findIndex(p => p.id === project.id);
  const updated = { ...project, updatedAt: Date.now() };
  if (idx >= 0) {
    list[idx] = updated;
  } else {
    list.unshift(updated);
  }
  localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
  if (api?.saveSettings) {
    api.saveSettings({ workflowProjects: list } as any).catch(() => {});
  }
}

export function deleteWorkflowProject(id: string): void {
  const list = getWorkflowProjects().filter(p => p.id !== id);
  localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(list));
  if (api?.saveSettings) {
    api.saveSettings({ workflowProjects: list } as any).catch(() => {});
  }
}

export function createDefaultSampleProject(): WorkflowProject {
  return {
    id: 'sample_daily_pipeline',
    name: '张老师 · 每日商业口播全自动出片',
    description: '每天上午 09:30 定时触发，AI 选题发散 → 张老师风格改写 → Seed-TTS 2.0 配音 → 蝉镜数字人出镜(加字幕)',
    enabled: false,
    nodes: [
      DEFAULT_NODES_FACTORY.trigger(),
      DEFAULT_NODES_FACTORY.topic_source(),
      DEFAULT_NODES_FACTORY.ai_script(),
      DEFAULT_NODES_FACTORY.voice_tts(),
      DEFAULT_NODES_FACTORY.digital_avatar(),
      DEFAULT_NODES_FACTORY.export_notify(),
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastStatus: 'idle',
  };
}
