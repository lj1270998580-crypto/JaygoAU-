import type { WorkflowProject, WorkflowRunHistoryItem } from './workflowTypes';
import { DEFAULT_NODES_FACTORY } from './workflowTypes';
import { api } from './ipc';

const WORKFLOWS_STORAGE_KEY = 'jaygo_au_workflows_v1';
const MAX_HISTORY_PER_PROJECT = 30;

export function getWorkflowProjects(): WorkflowProject[] {
  try {
    const raw = localStorage.getItem(WORKFLOWS_STORAGE_KEY);
    if (!raw) {
      const initial = [createDefaultSampleProject()];
      localStorage.setItem(WORKFLOWS_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as WorkflowProject[];
    return parsed;
  } catch (_) {
    return [createDefaultSampleProject()];
  }
}

export function saveWorkflowProject(project: WorkflowProject): void {
  const list = getWorkflowProjects();
  const idx = list.findIndex(p => p.id === project.id);
  
  // 限制历史记录条数，防止 localStorage 溢出
  const safeHistory = project.history ? project.history.slice(0, MAX_HISTORY_PER_PROJECT) : [];

  const updated: WorkflowProject = {
    ...project,
    history: safeHistory,
    updatedAt: Date.now(),
  };

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

export function appendProjectHistory(
  projectId: string,
  historyItem: WorkflowRunHistoryItem
): WorkflowProject | null {
  const list = getWorkflowProjects();
  const proj = list.find(p => p.id === projectId);
  if (!proj) return null;

  const currentHistory = proj.history || [];
  const updatedHistory = [historyItem, ...currentHistory].slice(0, MAX_HISTORY_PER_PROJECT);

  const updated: WorkflowProject = {
    ...proj,
    history: updatedHistory,
    lastStatus: historyItem.status,
    lastRunTime: historyItem.endTime,
    lastLog: historyItem.log,
    updatedAt: Date.now(),
  };

  saveWorkflowProject(updated);
  return updated;
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
    description: '每天上午 09:30 定时触发，AI 选题发散 → 张老师风格改写 → Seed-TTS 2.0 配音 → 蝉镜数字人出镜(加字幕) → 剪映工程草稿',
    enabled: false,
    nodes: [
      DEFAULT_NODES_FACTORY.trigger(),
      DEFAULT_NODES_FACTORY.topic_source(),
      DEFAULT_NODES_FACTORY.ai_script(),
      DEFAULT_NODES_FACTORY.voice_tts(),
      DEFAULT_NODES_FACTORY.digital_avatar(),
      DEFAULT_NODES_FACTORY.jianying_draft(),
      DEFAULT_NODES_FACTORY.export_notify(),
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastStatus: 'idle',
    history: [],
  };
}
