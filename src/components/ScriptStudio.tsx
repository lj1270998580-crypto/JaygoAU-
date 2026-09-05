import React, { useState, useEffect, useRef } from 'react';
import type { SkillPreset } from '../lib/skillTypes';
import { getAllSkills, saveCustomSkill, deleteCustomSkill, parseSkillContent, exportSkillToMarkdown } from '../lib/skillParser';
import { chatCompletion } from '../lib/modelHubService';
import type { ModelHubSettings } from '../lib/modelHubTypes';
import { extractStyleFromSamples } from '../lib/styleExtractor';
import { useStore } from '../store';

interface Props {
  modelSettings: ModelHubSettings;
  onOpenModelHub: () => void;
  onPushToSynth: (text: string, voiceId?: string) => void;
  onPushToAvatar: (text: string) => void;
}

export function ScriptStudio({ modelSettings, onOpenModelHub, onPushToSynth, onPushToAvatar }: Props) {
  const [skills, setSkills] = useState<SkillPreset[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('teacher_zhang_business');
  const [inputTopic, setInputTopic] = useState('');
  const [batchCount, setBatchCount] = useState<number>(1);
  const [targetWordCount, setTargetWordCount] = useState<number>(300);
  const [hookStrategy, setHookStrategy] = useState<'counter_intuitive' | 'pain_point' | 'suspense' | 'gold_sentence'>('counter_intuitive');
  const [generating, setGenerating] = useState(false);
  const [generatedScripts, setGeneratedScripts] = useState<string[]>([]);
  const [activeScriptIndex, setActiveScriptIndex] = useState(0);

  // 风格抽取 Modal
  const [extractModalOpen, setExtractModalOpen] = useState(false);
  const [extractTeacherName, setExtractTeacherName] = useState('');
  const [extractSample1, setExtractSample1] = useState('');
  const [extractSample2, setExtractSample2] = useState('');
  const [extracting, setExtracting] = useState(false);

  // 导入/导出反馈
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshSkills = () => {
    const list = getAllSkills();
    setSkills(list);
  };

  useEffect(() => {
    refreshSkills();
  }, []);

  const selectedSkill = skills.find(s => s.id === selectedSkillId) || skills[0];

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 生成文案
  const handleGenerate = async () => {
    if (!inputTopic.trim()) {
      showToast('请先输入主题、素材或爆款要点');
      return;
    }

    setGenerating(true);
    setGeneratedScripts([]);
    setActiveScriptIndex(0);

    const results: string[] = [];

    try {
      for (let i = 0; i < batchCount; i++) {
        const hookText =
          hookStrategy === 'counter_intuitive'
            ? '以强烈的反常识问句打破常规认知起手'
            : hookStrategy === 'pain_point'
            ? '直戳目标用户最扎心的焦虑或痛点起手'
            : hookStrategy === 'suspense'
            ? '以悬念故事或反常现象起手'
            : '以极具共鸣的爆款金句起手';

        const systemPrompt = `你是一名顶级自媒体口播脚本重构大师。\n【创作者人设】：${selectedSkill?.persona}\n【标志性口头禅】：${selectedSkill?.catchphrases?.join('、')}\n【句长与节奏铁律】：${selectedSkill?.pacingRules?.sentenceLength}\n【行文框架】：${selectedSkill?.pacingRules?.structure}\n【开篇策略】：${hookText}\n【绝对红线禁忌】：\n${selectedSkill?.negativeConstraints?.map(c => `- ${c}`).join('\n')}\n【少样本范本】：\n输入：${selectedSkill?.fewShotExamples?.[0]?.inputTopic || ''}\n输出：${selectedSkill?.fewShotExamples?.[0]?.outputScript || ''}`;

        const userPrompt = `请严格按照上述创作者风格，将以下内容写成一篇 60 秒（约 ${targetWordCount} 字）的高吸睛短视频口播文案，短句断句，直接输出正文台词：\n内容：${inputTopic.trim()}`;

        const script = await chatCompletion(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          { temperature: selectedSkill?.modelParams?.temperature ?? 0.35 },
          modelSettings
        );

        results.push(script.trim());
        setGeneratedScripts([...results]);
      }
      showToast(`成功生成 ${results.length} 篇口播文案！`);
    } catch (e: any) {
      showToast(`生成失败: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // 导入外部 Skill
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = String(event.target?.result || '');
        const imported = parseSkillContent(content, file.name);
        saveCustomSkill(imported);
        refreshSkills();
        setSelectedSkillId(imported.id);
        showToast(`成功导入预设技能：【${imported.name}】`);
      } catch (err: any) {
        showToast(`导入失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 拖拽导入
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = String(event.target?.result || '');
        const imported = parseSkillContent(content, file.name);
        saveCustomSkill(imported);
        refreshSkills();
        setSelectedSkillId(imported.id);
        showToast(`成功导入预设技能：【${imported.name}】`);
      } catch (err: any) {
        showToast(`导入失败: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // 导出当前 Skill
  const handleExportCurrent = () => {
    if (!selectedSkill) return;
    const md = exportSkillToMarkdown(selectedSkill);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSkill.name.replace(/\s+/g, '_')}.skill.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出为 .skill.md 技能文件');
  };

  // 样本逆向抽取
  const handleExtractStyle = async () => {
    if (!extractTeacherName.trim()) {
      showToast('请填写创作者/老师名称');
      return;
    }
    const samples = [extractSample1, extractSample2].map(s => s.trim()).filter(Boolean);
    if (samples.length === 0) {
      showToast('请至少粘贴 1 篇真实爆款样本');
      return;
    }

    setExtracting(true);
    try {
      const extracted = await extractStyleFromSamples(samples, extractTeacherName.trim(), modelSettings);
      saveCustomSkill(extracted);
      refreshSkills();
      setSelectedSkillId(extracted.id);
      setExtractModalOpen(false);
      setExtractTeacherName('');
      setExtractSample1('');
      setExtractSample2('');
      showToast(`已成功学习并保存新风格：【${extracted.name}】`);
    } catch (e: any) {
      showToast(`提炼风格失败: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  };

  const currentScript = generatedScripts[activeScriptIndex] || '';

  return (
    <div
      className="flex-1 flex flex-col h-full bg-zinc-50/60 dark:bg-[#0c0d12] overflow-hidden"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* 隐藏文件输入 */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".md,.jaygoskill,.json"
        onChange={handleImportFile}
      />

      {/* 顶部工具栏 */}
      <div className="h-14 border-b border-zinc-200/80 dark:border-zinc-800/80 px-6 flex items-center justify-between bg-white/70 dark:bg-[#121318]/70 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <span className="text-xl">✍️</span>
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              AI 自媒体文案工坊
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                创作者 IP 风格引擎
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-xs text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
            title="支持拖拽或选择 .skill.md 技能文件"
          >
            <span>📥</span> 导入预设 Skill
          </button>
          <button
            onClick={() => setExtractModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition shadow-xs shadow-purple-500/20 flex items-center gap-1.5"
          >
            <span>✨</span> 投喂文案提炼新风格
          </button>
          <button
            onClick={onOpenModelHub}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 text-xs text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
          >
            <span>⚡</span> 模型设置
          </button>
        </div>
      </div>

      {/* 主体三栏工作台 */}
      <div className="flex-1 flex min-h-0">
        {/* 左栏：风格预设库 */}
        <div className="w-72 border-r border-zinc-200/80 dark:border-zinc-800/80 p-4 flex flex-col bg-white/40 dark:bg-zinc-900/10 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              创作者风格预设 ({skills.length})
            </span>
            <button
              onClick={handleExportCurrent}
              className="text-[11px] text-blue-500 hover:underline"
              title="导出为 Markdown 技能文件分享给同事"
            >
              导出当前 ↗
            </button>
          </div>

          <div className="space-y-2">
            {skills.map(s => {
              const isSel = s.id === selectedSkillId;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSkillId(s.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition relative group ${
                    isSel
                      ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 shadow-xs'
                      : 'border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#14151c] hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate pr-2">
                      {s.name}
                    </span>
                    {s.isSystem ? (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        官方
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                        自定义
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>

                  {/* 自定义技能允许删除 */}
                  {!s.isSystem && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (confirm(`确定删除自定义技能【${s.name}】吗？`)) {
                          deleteCustomSkill(s.id);
                          refreshSkills();
                          setSelectedSkillId('teacher_zhang_business');
                        }
                      }}
                      className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 text-[10px] text-rose-500 hover:underline"
                    >
                      删除
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 选中预设详情简报 */}
          {selectedSkill && (
            <div className="mt-auto pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 space-y-2 text-xs">
              <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                当前风格画像铁律
              </div>
              <div className="text-[11.5px] text-zinc-600 dark:text-zinc-400 space-y-1">
                <div>
                  <strong className="text-zinc-500 dark:text-zinc-500">人设：</strong>
                  {selectedSkill.persona}
                </div>
                <div>
                  <strong className="text-zinc-500 dark:text-zinc-500">口头禅：</strong>
                  {selectedSkill.catchphrases.slice(0, 3).join('、')}
                </div>
                <div>
                  <strong className="text-zinc-500 dark:text-zinc-500">节奏：</strong>
                  {selectedSkill.pacingRules.sentenceLength}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 中栏：创作与参数配置 */}
        <div className="flex-1 p-6 flex flex-col space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                创作主题 / 待洗稿素材 / 核心观点
              </label>
              <span className="text-[11px] text-zinc-400">
                支持直接输入主题，或粘贴从抖音/小红书提取的原片台词
              </span>
            </div>
            <textarea
              rows={6}
              value={inputTopic}
              onChange={e => setInputTopic(e.target.value)}
              placeholder="例如：为什么大部分人做副业赚不到钱？因为选错了赛道，只会出卖劳动力，应该建管道而不是挑水..."
              className="w-full p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#13141b] text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none font-sans"
            />
          </div>

          {/* 参数横条 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#14151c] space-y-1">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">衍生版本数 (批量)</span>
              <select
                value={batchCount}
                onChange={e => setBatchCount(Number(e.target.value))}
                className="w-full bg-transparent text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-hidden cursor-pointer"
              >
                <option value={1}>单篇 (生成 1 个版本)</option>
                <option value={2}>双篇 (生成 2 个角度对比)</option>
                <option value={3}>3 篇 (批量矩阵备选)</option>
                <option value={5}>5 篇 (批量多版本量产)</option>
              </select>
            </div>

            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#14151c] space-y-1">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">目标字数 / 篇幅</span>
              <select
                value={targetWordCount}
                onChange={e => setTargetWordCount(Number(e.target.value))}
                className="w-full bg-transparent text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-hidden cursor-pointer"
              >
                <option value={200}>约 200 字 (30秒极速卡点)</option>
                <option value={300}>约 300 字 (60秒黄金口播)</option>
                <option value={450}>约 450 字 (90秒深度拆解)</option>
                <option value={600}>约 600 字 (2分钟干货长片)</option>
              </select>
            </div>

            <div className="p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#14151c] space-y-1">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">前 3 秒黄金钩子</span>
              <select
                value={hookStrategy}
                onChange={e => setHookStrategy(e.target.value as any)}
                className="w-full bg-transparent text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-hidden cursor-pointer"
              >
                <option value="counter_intuitive">反常识问句 (破局抓人)</option>
                <option value="pain_point">撕开扎心痛点 (引发焦虑)</option>
                <option value="suspense">悬念反差起手 (高完播率)</option>
                <option value="gold_sentence">共鸣爆款金句 (点赞转发)</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                正在按照【{selectedSkill?.name}】全速重构文案...
              </>
            ) : (
              <>
                <span>⚡</span> 一键 AI 爆款重构 (应用 {selectedSkill?.name})
              </>
            )}
          </button>
        </div>

        {/* 右栏：产物与流转 */}
        <div className="w-96 border-l border-zinc-200/80 dark:border-zinc-800/80 p-5 flex flex-col bg-white dark:bg-[#111217] overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              重构台词预览 {generatedScripts.length > 1 && `(${activeScriptIndex + 1}/${generatedScripts.length})`}
            </span>
            {generatedScripts.length > 1 && (
              <div className="flex items-center gap-1">
                {generatedScripts.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveScriptIndex(idx)}
                    className={`w-5 h-5 rounded-md text-[10px] font-mono font-bold transition ${
                      activeScriptIndex === idx
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 文案展示区 */}
          <div className="flex-1 my-3 overflow-y-auto">
            {currentScript ? (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/60 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap font-sans select-text">
                {currentScript}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-2">
                <span className="text-3xl opacity-40">📝</span>
                <p className="text-xs">选择创作者风格并点击重构，生成的文案将在此预览</p>
              </div>
            )}
          </div>

          {/* 快捷生产流转按钮 */}
          {currentScript && (
            <div className="space-y-2 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
              <div className="text-[11px] text-zinc-400 mb-1 flex items-center justify-between">
                <span>总字数: <strong>{currentScript.length}</strong> 字</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(currentScript);
                    showToast('文案已复制到剪贴板！');
                  }}
                  className="text-blue-500 hover:underline"
                >
                  复制文案
                </button>
              </div>

              <button
                onClick={() => onPushToSynth(currentScript, selectedSkill?.voiceBinding?.voiceId)}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5"
              >
                <span>🎙️</span> 一键推送到语音合成 (Seed-TTS 2.0)
              </button>

              <button
                onClick={() => onPushToAvatar(currentScript)}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-xs transition flex items-center justify-center gap-1.5"
              >
                <span>🎬</span> 一键推送到蝉镜数字人出镜
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 投喂文案提炼风格 Modal */}
      {extractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-xl bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>✨</span> 投喂爆款样本 · AI 自动逆向提炼风格
              </h3>
              <button
                onClick={() => setExtractModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              只需粘贴该创作者以往火过的 1~2 篇真实口播文案，AI 将自动分析其人设、口头禅、单句长度与行文骨架，并永久保存为您的专属风格预设！
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                创作者 / 老师名称
              </label>
              <input
                type="text"
                value={extractTeacherName}
                onChange={e => setExtractTeacherName(e.target.value)}
                placeholder="例如: 陈老师 · 爆款情感治愈"
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                爆款范文样本 1 (必填)
              </label>
              <textarea
                rows={4}
                value={extractSample1}
                onChange={e => setExtractSample1(e.target.value)}
                placeholder="请粘贴该老师的一篇完整口播文案..."
                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 resize-none font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                爆款范文样本 2 (选填，提升稳定性)
              </label>
              <textarea
                rows={3}
                value={extractSample2}
                onChange={e => setExtractSample2(e.target.value)}
                placeholder="第二篇范文，帮助 AI 更精准捕捉高频口头禅..."
                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 resize-none font-sans"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setExtractModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={handleExtractStyle}
                disabled={extracting}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 shadow-xs shadow-purple-500/30"
              >
                {extracting ? 'AI 正在深度解析风格画像...' : '开始学习并创建预设'}
              </button>
            </div>
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
