import React, { useState, useEffect } from 'react';
import type {
  WorkflowProject,
  WorkflowNode,
  NodeType,
} from '../lib/workflowTypes';
import {
  NODE_TYPE_META,
  DEFAULT_NODES_FACTORY,
} from '../lib/workflowTypes';
import {
  getWorkflowProjects,
  saveWorkflowProject,
  deleteWorkflowProject,
} from '../lib/workflowStorage';
import { executeWorkflowProject, type WorkflowExecutionContext } from '../lib/workflowRunner';
import { parseNaturalLanguageWorkflow } from '../lib/workflowParser';
import type { ModelHubSettings } from '../lib/modelHubTypes';
import { getAllSkills } from '../lib/skillParser';

interface Props {
  modelSettings: ModelHubSettings;
  onOpenModelHub: () => void;
}

function TriggerScheduleEditor({
  cronExpression,
  cronDescription,
  onChange,
}: {
  cronExpression: string;
  cronDescription: string;
  onChange: (updates: { cronExpression: string; cronDescription: string }) => void;
}) {
  const getInitialMode = () => {
    if (/^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(cronExpression)) return 'daily';
    if (/^0\s+\*\/\d+\s+\*\s+\*\s+\*$/.test(cronExpression) || /^\*\/\d+\s+\*\s+\*\s+\*\s+\*$/.test(cronExpression)) return 'interval';
    return 'custom';
  };

  const [mode, setMode] = useState<'daily' | 'interval' | 'custom'>(getInitialMode);

  const parseDailyTime = () => {
    const match = cronExpression.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
    if (match) {
      const min = match[1].padStart(2, '0');
      const hr = match[2].padStart(2, '0');
      return `${hr}:${min}`;
    }
    return '09:00';
  };

  const [dailyTime, setDailyTime] = useState<string>(parseDailyTime);

  const parseInterval = () => {
    const hrMatch = cronExpression.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
    if (hrMatch) return { val: parseInt(hrMatch[1], 10) || 2, unit: 'hour' };
    const minMatch = cronExpression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
    if (minMatch) return { val: parseInt(minMatch[1], 10) || 30, unit: 'minute' };
    return { val: 2, unit: 'hour' };
  };

  const [intervalVal, setIntervalVal] = useState<number>(parseInterval().val);
  const [intervalUnit, setIntervalUnit] = useState<string>(parseInterval().unit);

  const handleTimeChange = (t: string) => {
    setDailyTime(t);
    const [hr, min] = t.split(':').map(n => parseInt(n, 10));
    if (!isNaN(hr) && !isNaN(min)) {
      const cron = `${min} ${hr} * * *`;
      const desc = `每天 ${t} 自动执行`;
      onChange({ cronExpression: cron, cronDescription: desc });
    }
  };

  const handleIntervalChange = (val: number, unit: string) => {
    setIntervalVal(val);
    setIntervalUnit(unit);
    if (val <= 0) return;
    if (unit === 'hour') {
      const cron = `0 */${val} * * *`;
      const desc = `每隔 ${val} 小时自动执行一次`;
      onChange({ cronExpression: cron, cronDescription: desc });
    } else {
      const cron = `*/${val} * * * *`;
      const desc = `每隔 ${val} 分钟自动执行一次`;
      onChange({ cronExpression: cron, cronDescription: desc });
    }
  };

  return (
    <div className="space-y-2.5 p-3 rounded-xl border border-blue-200/80 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
          <span>⏱️</span> 自定义运行时间 / 周期
        </label>
        <div className="flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 text-[11px] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setMode('daily');
              handleTimeChange(dailyTime);
            }}
            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
              mode === 'daily'
                ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            ☀️ 每天指定时刻
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('interval');
              handleIntervalChange(intervalVal, intervalUnit);
            }}
            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
              mode === 'interval'
                ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            🔄 固定间隔
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
              mode === 'custom'
                ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            🛠️ 自由 Cron
          </button>
        </div>
      </div>

      {mode === 'daily' && (
        <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <span className="text-xs text-zinc-600 dark:text-zinc-400 shrink-0">选择每天运行时间：</span>
          <input
            type="time"
            value={dailyTime}
            onChange={e => handleTimeChange(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-mono font-bold text-blue-600 dark:text-blue-400 focus:border-blue-500 focus:outline-hidden cursor-pointer"
          />
          <span className="text-[11px] text-zinc-400">（支持任意小时与分钟自定义，如 08:30、14:20、22:00 等）</span>
        </div>
      )}

      {mode === 'interval' && (
        <div className="flex items-center gap-2.5 bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <span className="text-xs text-zinc-600 dark:text-zinc-400 shrink-0">运行频率：每隔</span>
          <input
            type="number"
            min={1}
            max={intervalUnit === 'hour' ? 72 : 1440}
            value={intervalVal}
            onChange={e => handleIntervalChange(parseInt(e.target.value, 10) || 1, intervalUnit)}
            className="w-20 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-mono font-bold text-center text-zinc-800 dark:text-zinc-100 focus:border-blue-500 focus:outline-hidden"
          />
          <select
            value={intervalUnit}
            onChange={e => handleIntervalChange(intervalVal, e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-100 focus:border-blue-500 focus:outline-hidden cursor-pointer"
          >
            <option value="hour">小时 (Hours)</option>
            <option value="minute">分钟 (Minutes)</option>
          </select>
          <span className="text-xs text-zinc-600 dark:text-zinc-400">自动执行一次</span>
        </div>
      )}

      {mode === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div>
            <label className="text-[11px] text-zinc-500 font-medium">Cron 表达式 (分 时 日 月 周)</label>
            <input
              type="text"
              value={cronExpression}
              onChange={e => onChange({ cronExpression: e.target.value, cronDescription })}
              placeholder="例如: 0 9 * * 1-5 (工作日9点)"
              className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-100 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 font-medium">中文运行说明</label>
            <input
              type="text"
              value={cronDescription}
              onChange={e => onChange({ cronExpression, cronDescription: e.target.value })}
              placeholder="例如: 工作日上午 9:00"
              className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-100 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      )}

      {/* 实时生效提示 */}
      <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 pt-1 px-1">
        <span className="truncate">
          当前调度规则：<strong>{cronDescription || '自定义时间'}</strong>
        </span>
        <span className="font-mono text-[11px] bg-blue-100/70 dark:bg-blue-950/80 px-2 py-0.5 rounded text-blue-700 dark:text-blue-300 shrink-0 ml-2">
          {cronExpression}
        </span>
      </div>
    </div>
  );
}

export function WorkflowStudio({ modelSettings, onOpenModelHub }: Props) {
  const [projects, setProjects] = useState<WorkflowProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [runResult, setRunResult] = useState<WorkflowExecutionContext | null>(null);
  const [showConsole, setShowConsole] = useState(false);

  // AI 自然语言一键创建弹窗
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotParsing, setCopilotParsing] = useState(false);
  const [copilotPreview, setCopilotPreview] = useState<WorkflowProject | null>(null);

  // 展开配置的节点 ID 集合
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // 节点添加下拉菜单
  const [showAddNodeMenu, setShowAddNodeMenu] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const reloadProjects = () => {
    const list = getWorkflowProjects();
    setProjects(list);
    if (list.length > 0 && (!selectedProjectId || !list.some(p => p.id === selectedProjectId))) {
      setSelectedProjectId(list[0].id);
    }
  };

  useEffect(() => {
    reloadProjects();
  }, []);

  const currentProject = projects.find(p => p.id === selectedProjectId) || projects[0];

  const updateCurrentProject = (updater: (p: WorkflowProject) => WorkflowProject) => {
    if (!currentProject) return;
    const updated = updater({ ...currentProject });
    saveWorkflowProject(updated);
    reloadProjects();
  };

  // 节点排序操作
  const moveNode = (index: number, direction: 'up' | 'down') => {
    if (!currentProject) return;
    const nodes = [...currentProject.nodes];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= nodes.length) return;

    const temp = nodes[index];
    nodes[index] = nodes[targetIdx];
    nodes[targetIdx] = temp;

    updateCurrentProject(p => ({ ...p, nodes }));
  };

  // 删除节点
  const removeNode = (nodeId: string) => {
    if (!currentProject) return;
    const nodes = currentProject.nodes.filter(n => n.id !== nodeId);
    updateCurrentProject(p => ({ ...p, nodes }));
    showToast('节点已移除');
  };

  // 添加新节点
  const addNode = (type: NodeType) => {
    if (!currentProject) return;
    const factory = DEFAULT_NODES_FACTORY[type];
    if (!factory) return;
    const newNode = factory();
    const nodes = [...currentProject.nodes, newNode];
    updateCurrentProject(p => ({ ...p, nodes }));
    setExpandedNodes(prev => ({ ...prev, [newNode.id]: true }));
    setShowAddNodeMenu(false);
    showToast(`已添加节点：【${NODE_TYPE_META[type].name}】`);
  };

  // 切换节点启用/停用
  const toggleNodeEnabled = (nodeId: string) => {
    if (!currentProject) return;
    const nodes = currentProject.nodes.map(n =>
      n.id === nodeId ? { ...n, enabled: !n.enabled } : n
    );
    updateCurrentProject(p => ({ ...p, nodes }));
  };

  // 更新节点具体配置
  const updateNodeConfig = (nodeId: string, partialConfig: any) => {
    if (!currentProject) return;
    const nodes = currentProject.nodes.map(n =>
      n.id === nodeId ? { ...n, config: { ...n.config, ...partialConfig } } : n
    );
    updateCurrentProject(p => ({ ...p, nodes }));
  };

  // 运行当前工作流
  const handleRunPipeline = async () => {
    if (!currentProject) return;
    setRunning(true);
    setShowConsole(true);
    setProgressPct(0);
    setProgressMsg('正在初始化工作流环境...');
    setLogs([]);
    setRunResult(null);

    try {
      const res = await executeWorkflowProject(
        currentProject,
        modelSettings,
        msg => setLogs(prev => [...prev, msg]),
        (pct, msg) => {
          setProgressPct(pct);
          setProgressMsg(msg);
        }
      );
      setRunResult(res);
      showToast(`工作流【${currentProject.name}】执行圆满完成！`);
    } catch (err: any) {
      showToast(`执行中断: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  // 新建空项目
  const handleCreateNewProject = () => {
    const id = `project_${Date.now()}`;
    const newProj: WorkflowProject = {
      id,
      name: `新建流水线项目_${projects.length + 1}`,
      description: '自定义串联工作流',
      enabled: false,
      nodes: [
        DEFAULT_NODES_FACTORY.trigger(),
        DEFAULT_NODES_FACTORY.ai_script(),
        DEFAULT_NODES_FACTORY.voice_tts(),
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastStatus: 'idle',
    };
    saveWorkflowProject(newProj);
    reloadProjects();
    setSelectedProjectId(id);
    showToast('已创建新项目');
  };

  // 自然语言解析
  const handleCopilotParse = async () => {
    if (!copilotPrompt.trim()) return;
    setCopilotParsing(true);
    setCopilotPreview(null);
    try {
      const generated = await parseNaturalLanguageWorkflow(copilotPrompt.trim(), modelSettings);
      setCopilotPreview(generated);
    } catch (e: any) {
      showToast(`解析失败: ${e.message}`);
    } finally {
      setCopilotParsing(false);
    }
  };

  // 应用自然语言生成的项目
  const handleApplyCopilotProject = () => {
    if (!copilotPreview) return;
    saveWorkflowProject(copilotPreview);
    reloadProjects();
    setSelectedProjectId(copilotPreview.id);
    setCopilotOpen(false);
    setCopilotPrompt('');
    setCopilotPreview(null);
    showToast(`已成功创建并载入工作流：【${copilotPreview.name}】`);
  };

  const skills = getAllSkills();

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50/60 dark:bg-[#0c0d12] overflow-hidden">
      {/* 顶部总览栏 */}
      <div className="h-14 border-b border-zinc-200/80 dark:border-zinc-800/80 px-5 flex items-center justify-between bg-white/70 dark:bg-[#121318]/70 backdrop-blur-xs shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">⚡</span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 truncate">
              <span>自动化流水线工坊</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900 shrink-0">
                自由组合 · 定时守护
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowConsole(!showConsole)}
            className={`btn-modern-ghost ${
              showConsole
                ? '!border-blue-500 !text-blue-600 dark:!text-blue-400 bg-blue-50/50 dark:bg-blue-950/40'
                : ''
            }`}
            title={showConsole ? '收起控制台' : '展开控制台与产物日志'}
          >
            <span>📋</span> <span>控制台 {showConsole ? '›' : '‹'}</span>
          </button>
          <button
            onClick={() => setCopilotOpen(true)}
            className="btn-modern-primary"
          >
            <span>💬</span> <span>自然语言建工作流</span>
          </button>
          <button
            onClick={onOpenModelHub}
            className="btn-modern-ghost"
          >
            <span>⚡</span> <span>模型中心</span>
          </button>
        </div>
      </div>

      {/* 主体左右两栏 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：项目管理列表 */}
        <div className="w-56 border-r border-zinc-200/80 dark:border-zinc-800/80 p-3.5 flex flex-col bg-white/40 dark:bg-zinc-900/10 shrink-0 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              流水线项目 ({projects.length})
            </span>
            <button
              onClick={handleCreateNewProject}
              className="text-xs text-blue-500 hover:underline font-medium"
            >
              + 新建项目
            </button>
          </div>

          <div className="space-y-2">
            {projects.map(p => {
              const isSel = p.id === selectedProjectId;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition relative group ${
                    isSel
                      ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 shadow-xs'
                      : 'border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#14151c] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate pr-2">
                      {p.name}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                        p.enabled
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {p.enabled ? '定时开' : '手动'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {p.description || '无描述'}
                  </p>
                  <div className="mt-2 text-[10px] text-zinc-400 flex items-center justify-between">
                    <span>包含 {p.nodes.length} 个节点</span>
                    {projects.length > 1 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm(`确定删除项目【${p.name}】吗？`)) {
                            deleteWorkflowProject(p.id);
                            reloadProjects();
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-rose-500 hover:underline"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 中间：形态 A 自由定制卡片流水线 */}
        <div className="flex-1 p-5 flex flex-col min-w-0 overflow-y-auto space-y-4">
          {currentProject ? (
            <>
              {/* 项目标题与顶层控制 */}
              <div className="p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#13141b] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <input
                    type="text"
                    value={currentProject.name}
                    onChange={e => updateCurrentProject(p => ({ ...p, name: e.target.value }))}
                    className="text-base font-bold text-zinc-900 dark:text-zinc-100 bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-blue-500 focus:outline-hidden px-1 w-full"
                  />
                  <input
                    type="text"
                    value={currentProject.description}
                    onChange={e => updateCurrentProject(p => ({ ...p, description: e.target.value }))}
                    placeholder="填写项目简要说明..."
                    className="text-xs text-zinc-500 dark:text-zinc-400 bg-transparent border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-blue-500 focus:outline-hidden px-1 w-full"
                  />
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                  <div className="flex items-center gap-2 pr-3 border-r border-zinc-200 dark:border-zinc-800">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">定时常驻调度</span>
                    <button
                      type="button"
                      onClick={() => updateCurrentProject(p => ({ ...p, enabled: !p.enabled }))}
                      className={`w-10 h-5 rounded-full transition-colors relative ${
                        currentProject.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          currentProject.enabled ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  <button
                    onClick={handleRunPipeline}
                    disabled={running}
                    className="btn-modern-primary px-4 py-2"
                  >
                    {running ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>执行中...</span>
                      </>
                    ) : (
                      <>
                        <span>▶️</span> <span>立即执行工作流</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 运行中进度条 */}
              {running && (
                <div className="p-4 rounded-2xl border border-blue-500/40 bg-blue-50/30 dark:bg-blue-950/20 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 font-medium">
                    <span>{progressMsg}</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 常用高频一键模板推荐区 */}
              <div className="p-3.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    <span>⚡</span>
                    <span>快速装配常用流水线（新手推荐，点击一键载入）：</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div
                    onClick={() => {
                      if (confirm('是否将当前项目配置为【全自动每日出片】推荐流水线？')) {
                        updateCurrentProject(p => ({
                          ...p,
                          name: '全自动每日定时出片',
                          description: '每天早上 09:00 自动寻题 -> 智能创作爆款口播 -> 合成语音 -> 蝉镜数字人出片',
                          enabled: true,
                          nodes: [
                            {
                              id: `node_trig_${Date.now()}`,
                              type: 'trigger',
                              name: '每天早 09:00 定时自动触发',
                              enabled: true,
                              config: {
                                mode: 'cron',
                                cronExpression: '0 9 * * *',
                                cronDescription: '每天上午 09:00',
                                rawBatchText: [],
                              },
                            },
                            {
                              id: `node_topic_${Date.now()}`,
                              type: 'topic_source',
                              name: 'AI 自动发散爆款选题',
                              enabled: true,
                              config: {
                                sourceType: 'ai_brainstorm',
                                domainKeyword: '自媒体商业思维与认知成长',
                                generateCount: 1,
                                poolList: [],
                              },
                            },
                            {
                              id: `node_script_${Date.now()}`,
                              type: 'ai_script',
                              name: '生成 60 秒爆款口播文案',
                              enabled: true,
                              config: {
                                skillPresetId: 'teacher_zhang_business',
                                batchCount: 1,
                                targetWordCount: 300,
                                hookStrategy: 'counter_intuitive',
                              },
                            },
                            {
                              id: `node_tts_${Date.now()}`,
                              type: 'voice_tts',
                              name: 'Seed-TTS 2.0 语音合成',
                              enabled: true,
                              config: {
                                engine: 'seed-tts-2.0',
                                voiceId: '',
                                voiceName: '根据导师人设自动匹配音色',
                                emotion: 'default',
                                speedRatio: 1.0,
                                volumeRatio: 1.0,
                                audioFormat: 'mp3',
                              },
                            },
                            {
                              id: `node_avatar_${Date.now()}`,
                              type: 'digital_avatar',
                              name: '蝉镜数字人自动渲染出片',
                              enabled: true,
                              config: {
                                avatarId: '',
                                avatarName: '首选数字人形象',
                                figureType: 'whole_body',
                                aspectRatio: '9:16',
                                resolution: '1080p',
                                addSubtitle: true,
                                subtitleFontSize: 42,
                                backgroundMode: 'default',
                              },
                            },
                            {
                              id: `node_export_${Date.now()}`,
                              type: 'export_notify',
                              name: '桌面通知与文件沉淀',
                              enabled: true,
                              config: {
                                outputDir: '',
                                saveScript: true,
                                saveAudio: true,
                                saveVideo: true,
                                enableTrayNotify: true,
                                autoOpenFolder: true,
                              },
                            },
                          ],
                        }));
                        showToast('已成功载入【全自动每日出片】流水线！');
                      }
                    }}
                    className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-white dark:bg-[#14161f] hover:border-blue-500 hover:shadow-xs transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <span>🌟</span> 全自动每日出片
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-mono">
                        热门推荐
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      每天定时自动寻题 ➔ 写文案 ➔ 配音 ➔ 做数字人，全自动出片
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      if (confirm('是否将当前项目配置为【已有文案批量出片】推荐流水线？')) {
                        updateCurrentProject(p => ({
                          ...p,
                          name: '已有文案批量配音与出片',
                          description: '直接输入已写好的文案 -> 一键批量合成语音 -> 自动驱动数字人出片',
                          enabled: false,
                          nodes: [
                            {
                              id: `node_trig_${Date.now()}`,
                              type: 'trigger',
                              name: '直接输入已有文案 (跳过AI写稿)',
                              enabled: true,
                              config: {
                                mode: 'direct_input',
                                cronExpression: '',
                                cronDescription: '手动批量输入',
                                rawBatchText: ['为什么百分之九十的人做短视频，最后都成了平台的打工人？因为你从第一天就搞反了。'],
                              },
                            },
                            {
                              id: `node_tts_${Date.now()}`,
                              type: 'voice_tts',
                              name: '批量高保真语音合成',
                              enabled: true,
                              config: {
                                engine: 'seed-tts-2.0',
                                voiceId: '',
                                voiceName: '默认高保真音色',
                                emotion: 'default',
                                speedRatio: 1.05,
                                volumeRatio: 1.0,
                                audioFormat: 'mp3',
                              },
                            },
                            {
                              id: `node_avatar_${Date.now()}`,
                              type: 'digital_avatar',
                              name: '蝉镜数字人批量渲染',
                              enabled: true,
                              config: {
                                avatarId: '',
                                avatarName: '首选数字人形象',
                                figureType: 'whole_body',
                                aspectRatio: '9:16',
                                resolution: '1080p',
                                addSubtitle: true,
                                subtitleFontSize: 40,
                                backgroundMode: 'default',
                              },
                            },
                          ],
                        }));
                        showToast('已成功载入【已有文案批量出片】流水线！');
                      }
                    }}
                    className="p-3 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-white dark:bg-[#14161f] hover:border-purple-500 hover:shadow-xs transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                        <span>⚡</span> 已有文案批量出片
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono">
                        配音+数字人
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      跳过写文案，直接把已做好的多篇文案批量配音并做成数字人
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      if (confirm('是否将当前项目配置为【矩阵文案自动批量沉淀】推荐流水线？')) {
                        updateCurrentProject(p => ({
                          ...p,
                          name: '自媒体矩阵文案自动批量生成',
                          description: '每天晚上定时根据预设风格发散生成 5~10 篇爆款文案草稿',
                          enabled: true,
                          nodes: [
                            {
                              id: `node_trig_${Date.now()}`,
                              type: 'trigger',
                              name: '每天晚上 20:00 定时触发',
                              enabled: true,
                              config: {
                                mode: 'cron',
                                cronExpression: '0 20 * * *',
                                cronDescription: '每天晚上 20:00',
                                rawBatchText: [],
                              },
                            },
                            {
                              id: `node_topic_${Date.now()}`,
                              type: 'topic_source',
                              name: '根据赛道发散多个高潜选题',
                              enabled: true,
                              config: {
                                sourceType: 'ai_brainstorm',
                                domainKeyword: '个人IP孵化与自媒体矩阵实战',
                                generateCount: 5,
                                poolList: [],
                              },
                            },
                            {
                              id: `node_script_${Date.now()}`,
                              type: 'ai_script',
                              name: '自动批量创作高完播口播文案',
                              enabled: true,
                              config: {
                                skillPresetId: 'teacher_zhang_business',
                                batchCount: 2,
                                targetWordCount: 300,
                                hookStrategy: 'pain_point',
                              },
                            },
                            {
                              id: `node_export_${Date.now()}`,
                              type: 'export_notify',
                              name: '文案草稿保存至本地文库',
                              enabled: true,
                              config: {
                                outputDir: '',
                                saveScript: true,
                                saveAudio: false,
                                saveVideo: false,
                                enableTrayNotify: true,
                                autoOpenFolder: false,
                              },
                            },
                          ],
                        }));
                        showToast('已成功载入【自媒体矩阵文案自动批量生成】流水线！');
                      }
                    }}
                    className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-[#14161f] hover:border-emerald-500 hover:shadow-xs transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <span>📝</span> 矩阵文案批量沉淀
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono">
                        文案库沉淀
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      每天定时自动发散选题并批量生成多篇成稿，充实选题库
                    </p>
                  </div>
                </div>
              </div>

              {/* 卡片流水线主画布 */}
              <div className="space-y-3 relative">
                {currentProject.nodes.map((node, index) => {
                  const meta = NODE_TYPE_META[node.type];
                  const isExpanded = Boolean(expandedNodes[node.id]);

                  return (
                    <div key={node.id} className="space-y-3">
                      {/* 节点卡片 */}
                      <div
                        className={`p-4 rounded-2xl border transition shadow-xs ${
                          node.enabled
                            ? 'border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-[#13141b]'
                            : 'border-dashed border-zinc-300 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-zinc-900/20 opacity-60'
                        }`}
                      >
                        {/* 节点标题栏 */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xl shrink-0">{meta.icon}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                                  {index + 1}. {node.name}
                                </span>
                                <span
                                  className={`text-[9px] px-2 py-0.2 rounded-full border font-mono font-bold shrink-0 ${meta.color}`}
                                >
                                  {meta.tag}
                                </span>
                                {!node.enabled && (
                                  <span className="text-[10px] text-zinc-400 font-normal shrink-0">
                                    [已停用此步]
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{meta.description}</p>
                            </div>
                          </div>

                          {/* 节点操作区 */}
                          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                            <button
                              type="button"
                              onClick={() => toggleNodeEnabled(node.id)}
                              className={`text-[10px] px-2 py-1 rounded-md border font-medium transition ${
                                node.enabled
                                  ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                  : 'border-zinc-300 text-zinc-400'
                              }`}
                            >
                              {node.enabled ? '启用' : '停用'}
                            </button>

                            <button
                              onClick={() => moveNode(index, 'up')}
                              disabled={index === 0}
                              className="w-7 h-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20 flex items-center justify-center text-xs"
                              title="上移"
                            >
                              ↑
                            </button>

                            <button
                              onClick={() => moveNode(index, 'down')}
                              disabled={index === currentProject.nodes.length - 1}
                              className="w-7 h-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20 flex items-center justify-center text-xs"
                              title="下移"
                            >
                              ↓
                            </button>

                            <button
                              onClick={() =>
                                setExpandedNodes(prev => ({ ...prev, [node.id]: !isExpanded }))
                              }
                              className="px-2 py-1 text-xs text-blue-500 hover:underline whitespace-nowrap"
                            >
                              {isExpanded ? '收起配置 ▲' : '展开参数 ▼'}
                            </button>

                            <button
                              onClick={() => removeNode(node.id)}
                              className="w-7 h-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-zinc-400 hover:text-rose-500 flex items-center justify-center text-xs transition"
                              title="移除此节点"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* 展开的精细参数面板 */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3 animate-in fade-in">
                            {/* 1. 触发器参数 */}
                            {node.type === 'trigger' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">运行模式</label>
                                  <select
                                    value={(node.config as any).mode}
                                    onChange={e =>
                                      updateNodeConfig(node.id, { mode: e.target.value })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  >
                                    <option value="cron">⏱️ 定时自动运行（如每天指定时间）</option>
                                    <option value="manual">👆 仅在点击“立即执行”时运行</option>
                                    <option value="direct_input">📝 直接批量输入文案（跳过AI写稿）</option>
                                  </select>
                                </div>

                                {(node.config as any).mode === 'cron' ? (
                                  <div className="col-span-1 sm:col-span-2">
                                    <TriggerScheduleEditor
                                      cronExpression={(node.config as any).cronExpression || '0 9 * * *'}
                                      cronDescription={(node.config as any).cronDescription || '每天上午 09:00'}
                                      onChange={({ cronExpression, cronDescription }) =>
                                        updateNodeConfig(node.id, {
                                          cronExpression,
                                          cronDescription,
                                        })
                                      }
                                    />
                                  </div>
                                ) : (node.config as any).mode === 'direct_input' ? (
                                  <div className="col-span-1 sm:col-span-2">
                                    <label className="text-[11px] text-zinc-500 font-medium">
                                      直接输入已有文案 (多篇请用空行隔开，直接推往配音/数字人)
                                    </label>
                                    <textarea
                                      rows={3}
                                      onChange={e =>
                                        updateNodeConfig(node.id, {
                                          rawBatchText: e.target.value
                                            .split('\n\n')
                                            .filter(Boolean),
                                        })
                                      }
                                      placeholder="粘贴已写好的多篇文案..."
                                      className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            )}

                            {/* 2. 选题参数 */}
                            {node.type === 'topic_source' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">赛道主题关键词</label>
                                  <input
                                    type="text"
                                    value={(node.config as any).domainKeyword}
                                    onChange={e =>
                                      updateNodeConfig(node.id, { domainKeyword: e.target.value })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">单次发散选题数</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={(node.config as any).generateCount}
                                    onChange={e =>
                                      updateNodeConfig(node.id, {
                                        generateCount: Number(e.target.value),
                                      })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  />
                                </div>
                              </div>
                            )}

                            {/* 3. AI 脚本参数 */}
                            {node.type === 'ai_script' && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">创作者风格 Skill</label>
                                  <select
                                    value={(node.config as any).skillPresetId}
                                    onChange={e =>
                                      updateNodeConfig(node.id, { skillPresetId: e.target.value })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  >
                                    {skills.map(s => (
                                      <option key={s.id} value={s.id}>
                                        {s.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">单主题衍生篇数</label>
                                  <select
                                    value={(node.config as any).batchCount || 1}
                                    onChange={e =>
                                      updateNodeConfig(node.id, {
                                        batchCount: Number(e.target.value),
                                      })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  >
                                    <option value={1}>1 篇</option>
                                    <option value={2}>2 篇 (多角度)</option>
                                    <option value={3}>3 篇 (批量矩阵)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">目标字数</label>
                                  <input
                                    type="number"
                                    value={(node.config as any).targetWordCount || 300}
                                    onChange={e =>
                                      updateNodeConfig(node.id, {
                                        targetWordCount: Number(e.target.value),
                                      })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  />
                                </div>
                              </div>
                            )}

                            {/* 4. TTS 参数 */}
                            {node.type === 'voice_tts' && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">情绪偏好</label>
                                  <select
                                    value={(node.config as any).emotion || '开心'}
                                    onChange={e =>
                                      updateNodeConfig(node.id, { emotion: e.target.value })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  >
                                    <option value="开心">开心 / 热情高昂</option>
                                    <option value="严肃">严肃 / 商业笃定</option>
                                    <option value="深情">深情 / 治愈慢调</option>
                                    <option value="激动">激动 / 极具冲击力</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">语速比例</label>
                                  <input
                                    type="number"
                                    step={0.1}
                                    min={0.8}
                                    max={2.0}
                                    value={(node.config as any).speedRatio || 1.0}
                                    onChange={e =>
                                      updateNodeConfig(node.id, {
                                        speedRatio: Number(e.target.value),
                                      })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] text-zinc-500 font-medium">音频格式</label>
                                  <select
                                    value={(node.config as any).audioFormat || 'mp3'}
                                    onChange={e =>
                                      updateNodeConfig(node.id, { audioFormat: e.target.value })
                                    }
                                    className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                  >
                                    <option value="mp3">MP3 (标准兼容)</option>
                                    <option value="wav">WAV (48kHz 无损)</option>
                                  </select>
                                </div>
                              </div>
                            )}

                            {/* 5. 数字人参数 (包含用户核心诉求：字幕开关！) */}
                            {node.type === 'digital_avatar' && (
                              <div className="space-y-3 text-xs">
                                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">
                                      自动添加内嵌字幕
                                    </div>
                                    <div className="text-[10px] text-zinc-400">蝉镜云端智能对齐烧录（字音同步）</div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={Boolean((node.config as any).addSubtitle)}
                                    onChange={e =>
                                      updateNodeConfig(node.id, { addSubtitle: e.target.checked })
                                    }
                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[11px] text-zinc-500 font-medium">视频画幅比例</label>
                                    <select
                                      value={(node.config as any).aspectRatio || '9:16'}
                                      onChange={e =>
                                        updateNodeConfig(node.id, { aspectRatio: e.target.value })
                                      }
                                      className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                    >
                                      <option value="9:16">9:16 竖屏 (抖音/小红书/视频号)</option>
                                      <option value="16:9">16:9 横屏 (B站/西瓜/YouTube)</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="text-[11px] text-zinc-500 font-medium">清晰度</label>
                                    <select
                                      value={(node.config as any).resolution || '1080p'}
                                      onChange={e =>
                                        updateNodeConfig(node.id, { resolution: e.target.value })
                                      }
                                      className="w-full mt-1 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                                    >
                                      <option value="1080p">1080P 超清</option>
                                      <option value="4k">4K 极清渲染</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 6. 归档与通知参数 */}
                            {node.type === 'export_notify' && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                                      Windows 托盘气泡通知
                                    </div>
                                    <div className="text-[10px] text-zinc-400">完成时在桌面右下角弹出</div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={Boolean((node.config as any).enableTrayNotify)}
                                    onChange={e =>
                                      updateNodeConfig(node.id, {
                                        enableTrayNotify: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                  />
                                </div>

                                <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex items-center justify-between">
                                  <div>
                                    <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                                      生成后自动打开目录
                                    </div>
                                    <div className="text-[10px] text-zinc-400">在资源管理器中定位</div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={Boolean((node.config as any).autoOpenFolder)}
                                    onChange={e =>
                                      updateNodeConfig(node.id, {
                                        autoOpenFolder: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 节点连接指示 */}
                      {index < currentProject.nodes.length - 1 && (
                        <div className="flex items-center justify-center py-0.5">
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 flex items-center gap-1">
                            🔗 自动将上一步骤生成的结果传递给下一步
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 底部添加节点按钮 */}
                <div className="pt-2 relative flex justify-center">
                  <button
                    onClick={() => setShowAddNodeMenu(!showAddNodeMenu)}
                    className="px-6 py-2.5 rounded-2xl border border-dashed border-blue-500/40 hover:border-blue-500 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-[#14151e]/60 hover:bg-blue-50/60 dark:hover:bg-blue-950/30 shadow-2xs hover:shadow-xs transition-all active:scale-[0.98] flex items-center gap-2 cursor-pointer"
                  >
                    <span className="text-sm">＋</span> <span>自由插入任意能力节点</span>
                  </button>

                  {/* 节点选择浮层 */}
                  {showAddNodeMenu && (
                    <div className="absolute top-12 z-30 w-72 p-2 rounded-2xl bg-white dark:bg-[#181922] border border-zinc-200 dark:border-zinc-700 shadow-2xl space-y-1">
                      {(
                        [
                          'trigger',
                          'topic_source',
                          'ai_script',
                          'voice_tts',
                          'digital_avatar',
                          'export_notify',
                        ] as NodeType[]
                      ).map(t => {
                        const m = NODE_TYPE_META[t];
                        return (
                          <button
                            key={t}
                            onClick={() => addNode(t)}
                            className="w-full flex items-center gap-2.5 p-2 rounded-xl text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                          >
                            <span className="text-base">{m.icon}</span>
                            <div>
                              <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                {m.name}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate max-w-[200px]">
                                {m.description}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-400 text-xs">
              请在左侧选择或新建流水线项目
            </div>
          )}
        </div>

        {/* 右侧：实时日志与产物看板 */}
        {showConsole && (
          <div className="w-80 border-l border-zinc-200/80 dark:border-zinc-800/80 p-4 flex flex-col bg-white dark:bg-[#111217] shrink-0 overflow-hidden space-y-3 animate-in slide-in-from-right-4 duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800/80">
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <span>📋</span> 执行控制台与产物
              </span>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <button
                    onClick={() => setLogs([])}
                    className="text-[10px] text-zinc-400 hover:text-zinc-600"
                  >
                    清空
                  </button>
                )}
                <button
                  onClick={() => setShowConsole(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 p-0.5"
                  title="收起控制台"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 实时日志窗口 */}
            <div className="flex-1 p-3 rounded-xl bg-zinc-900 text-zinc-300 font-mono text-[11px] leading-relaxed overflow-y-auto space-y-1 select-text">
              {logs.length === 0 ? (
                <div className="text-zinc-500 italic">等待工作流启动...</div>
              ) : (
                logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.includes('❌')
                        ? 'text-rose-400'
                        : l.includes('>>>')
                        ? 'text-blue-400 font-semibold'
                        : l.includes('===')
                        ? 'text-emerald-400 font-bold'
                        : 'text-zinc-300'
                    }
                  >
                    {l}
                  </div>
                ))
              )}
            </div>

            {/* 产物汇总预览 */}
            {runResult && (
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                  本轮产物总览
                </div>
                <div className="text-[11px] text-zinc-500 space-y-1">
                  <div>生成文案：{runResult.scripts.length} 篇</div>
                  <div>合成音频：{runResult.audioPaths.length} 条</div>
                  <div>数字人任务：{runResult.videoUrls.length} 个</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI 自然语言一句话创建工作流 Modal */}
      {copilotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">💬</span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    自然语言 · 一句话创建定时工作流
                  </h3>
                  <p className="text-xs text-zinc-500">
                    输入你的想法（例如：每天上午9点根据张老师风格生成3篇文案并合成带字幕数字人）
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCopilotOpen(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <textarea
                rows={3}
                value={copilotPrompt}
                onChange={e => setCopilotPrompt(e.target.value)}
                placeholder="例如：每天上午 10 点，帮我根据张老师的商业反差风格自动寻找商业副业主题，生成 3 篇 60 秒口播文案，并且用张老师克隆的声音合成音频，最后用蝉镜数字人出镜（记得加字幕），存到本地。"
                className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 leading-relaxed resize-none focus:outline-hidden focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleCopilotParse}
                disabled={copilotParsing || !copilotPrompt.trim()}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-40"
              >
                {copilotParsing ? 'AI 正在拆解并编排流水线...' : '解析并生成工作流预览'}
              </button>
            </div>

            {/* 解析结果预览卡片 */}
            {copilotPreview && (
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span>✓</span> 已成功编排流水线：【{copilotPreview.name}】
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    共自动装载 {copilotPreview.nodes.length} 个节点
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {copilotPreview.nodes.map((n, i) => (
                    <div
                      key={n.id}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 shadow-xs"
                    >
                      <span>{NODE_TYPE_META[n.type].icon}</span>
                      <span>
                        {i + 1}. {n.name}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleApplyCopilotProject}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition"
                  >
                    一键应用并创建此工作流项目 →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900/90 text-white text-xs shadow-2xl border border-zinc-700 animate-in fade-in">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
