import React, { useState, useEffect, useRef } from 'react';
import type { SkillPreset } from '../lib/skillTypes';
import { getAllSkills, saveCustomSkill, deleteSkill, restoreDefaultSkills, parseSkillContent, exportSkillToMarkdown } from '../lib/skillParser';
import { chatCompletion, type ChatMessage } from '../lib/modelHubService';
import type { ModelHubSettings } from '../lib/modelHubTypes';
import { extractStyleFromSamples } from '../lib/styleExtractor';
import { extractCleanScript } from '../lib/scriptSanitizer';

interface Props {
  modelSettings: ModelHubSettings;
  onOpenModelHub: () => void;
  onPushToSynth: (text: string, voiceId?: string) => void;
  onPushToAvatar: (text: string) => void;
}

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

export function ScriptStudio({ modelSettings, onOpenModelHub, onPushToSynth, onPushToAvatar }: Props) {
  const [skills, setSkills] = useState<SkillPreset[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('teacher_zhang_business');
  
  // 对话消息列表
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<AttachedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingDelta, setStreamingDelta] = useState('');

  // 可自由调节的左右栏宽度 (px) 与拖拽状态
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const saved = localStorage.getItem('jaygo_script_left_width');
    return saved ? Math.max(180, Math.min(420, parseInt(saved, 10))) : 240;
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const saved = localStorage.getItem('jaygo_script_right_width');
    return saved ? Math.max(240, Math.min(560, parseInt(saved, 10))) : 330;
  });

  const dragStartRef = useRef<{
    type: 'left' | 'right' | null;
    startX: number;
    startWidth: number;
  }>({ type: null, startX: 0, startWidth: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current.type) return;
      if (dragStartRef.current.type === 'left') {
        const deltaX = e.clientX - dragStartRef.current.startX;
        const nextW = Math.max(180, Math.min(420, dragStartRef.current.startWidth + deltaX));
        setLeftWidth(nextW);
        localStorage.setItem('jaygo_script_left_width', String(nextW));
      } else if (dragStartRef.current.type === 'right') {
        const deltaX = dragStartRef.current.startX - e.clientX;
        const nextW = Math.max(240, Math.min(560, dragStartRef.current.startWidth + deltaX));
        setRightWidth(nextW);
        localStorage.setItem('jaygo_script_right_width', String(nextW));
      }
    };

    const handleMouseUp = () => {
      if (dragStartRef.current.type) {
        dragStartRef.current = { type: null, startX: 0, startWidth: 0 };
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 右侧当前精选台词预览
  const [pinnedScript, setPinnedScript] = useState('');

  // 风格逆向提炼 Modal 状态
  const [extractModalOpen, setExtractModalOpen] = useState(false);
  const [extractTeacherName, setExtractTeacherName] = useState('');
  const [extractSample1, setExtractSample1] = useState('');
  const [extractSample2, setExtractSample2] = useState('');
  const [uploadedSampleFiles, setUploadedSampleFiles] = useState<Array<{ name: string; size: number; text: string }>>([]);
  const [extracting, setExtracting] = useState(false);

  // 反馈提示
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fileInputSkillRef = useRef<HTMLInputElement | null>(null);
  const fileInputAttachmentRef = useRef<HTMLInputElement | null>(null);
  const sampleDocInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const refreshSkills = () => {
    const list = getAllSkills();
    setSkills(list);
  };

  useEffect(() => {
    refreshSkills();
  }, []);

  const selectedSkill = skills.find(s => s.id === selectedSkillId) || skills[0];

  const buildWelcomeMessage = (skill: SkillPreset): ChatMessageItem => ({
    id: `welcome_${Date.now()}`,
    role: 'assistant',
    content: `你好！我是你的 AI 自媒体文案创作顾问。\n\n当前已装载【**${skill.name}**】风格画像（人设：${skill.persona}）。\n\n你可以：\n1. **直接对话交流**：提出任何选题，我将为你量身打磨口播脚本；\n2. 📎 **上传素材文件**（支持 \`.txt\` / \`.md\` / \`.docx\` / \`.pdf\` / \`.json\` 等），让我深度洗稿重构；\n3. 生成满意的文案后，点击台词下方的【设为精修台词】，即可**一键流转推往「语音合成」或「蝉镜数字人」**！`,
    timestamp: Date.now(),
  });

  // 初始化或切换风格时的欢迎语与人设实时同步
  useEffect(() => {
    if (!selectedSkill) return;

    // 若当前会话中用户尚未发送过实际消息（仅有开场欢迎语），直接切换至新人设欢迎语，消除用户错判
    const hasUserMessages = messages.some(m => m.role === 'user');
    if (!hasUserMessages) {
      setMessages([buildWelcomeMessage(selectedSkill)]);
    } else {
      // 若已有真实对话，则在会话流中追加一条轻量人设切换提示，避免破坏之前生成的稿件
      setMessages(prev => [
        ...prev,
        {
          id: `switch_${Date.now()}`,
          role: 'assistant',
          content: `✨ 已无缝切换至【**${selectedSkill.name}**】创作人设（${selectedSkill.persona}）。\n后续生成与对话将遵循该导师的思维模式与语言习惯。`,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [selectedSkillId]);

  // 滚动至最新消息
  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingDelta]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 读取上传的参考素材文件（支持 txt, md, json, csv 以及 docx, pdf 等）
  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    for (const file of Array.from(fileList)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      
      // 若是 docx 或 pdf，优先尝试通过主进程进行高保真纯文本提取
      if (['docx', 'pdf'].includes(ext) && (window as any).JaygoAPI?.parseDocumentFile) {
        try {
          const filePath = (window as any).JaygoAPI.getPathForFile(file);
          if (filePath) {
            const parsed = await (window as any).JaygoAPI.parseDocumentFile(filePath);
            if (parsed.ok && parsed.text) {
              setPendingAttachments(prev => [
                ...prev,
                {
                  id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  name: file.name,
                  size: file.size,
                  content: parsed.text!,
                },
              ]);
              showToast(`已成功附加文档：${file.name}`);
              continue;
            }
          }
        } catch (err: any) {
          console.warn('Native document parsing failed, fallback to text reader', err);
        }
      }

      // 普通文本文件读取
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target?.result || '');
        setPendingAttachments(prev => [
          ...prev,
          {
            id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            size: file.size,
            content: text,
          },
        ]);
        showToast(`已成功附加素材文件：${file.name}`);
      };
      reader.onerror = () => {
        showToast(`读取文件 ${file.name} 失败`);
      };
      reader.readAsText(file);
    }
  };

  // 移除附件
  const removeAttachment = (fileId: string) => {
    setPendingAttachments(prev => prev.filter(f => f.id !== fileId));
  };

  // 发送消息与流式生成
  const handleSendMessage = async (textToSend?: string) => {
    const rawContent = (textToSend ?? inputValue).trim();
    if (!rawContent && pendingAttachments.length === 0) {
      showToast('请输入对话内容或上传参考素材');
      return;
    }

    if (isGenerating) return;

    const userMessageId = `user_${Date.now()}`;
    const userMsg: ChatMessageItem = {
      id: userMessageId,
      role: 'user',
      content: rawContent,
      attachments: [...pendingAttachments],
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue('');
    setPendingAttachments([]);
    setIsGenerating(true);
    setStreamingDelta('');

    try {
      // 组装系统提示词（融入创作者画像）
      const systemPrompt = `你是一名顶级自媒体口播脚本重构与爆款创作大师。
【当前遵循创作者人设】：${selectedSkill?.persona || '专业自媒体博主'}
【标志性口头禅】：${selectedSkill?.catchphrases?.join('、') || '无'}
【句长与节奏铁律】：${selectedSkill?.pacingRules?.sentenceLength || '短句为主，每句不超过15字'}
【行文框架模式】：${selectedSkill?.pacingRules?.structure || '黄金钩子-痛点拆解-情绪反转-金句行动号召'}
【绝对红线禁忌】：
${selectedSkill?.negativeConstraints?.map(c => `- ${c}`).join('\n') || '- 严禁使用枯燥书面语'}
【少样本参考范本】：
输入：${selectedSkill?.fewShotExamples?.[0]?.inputTopic || ''}
输出：${selectedSkill?.fewShotExamples?.[0]?.outputScript || ''}

【重要排版与输出铁律】：
1. 如用户需要具体口播文案，第一行必须直接输出台词正文的第一句话，绝对禁止在开头输出客套寒暄（如“好的，为您生成如下口播文案：”等）；
2. 绝对禁止在文案末尾附带客套总结、问候或说明（如“希望这篇文案对您有帮助”、“随时可以微调”等）；
3. 全文输出纯粹、口语化、节奏紧凑、利于直接配音和数字人出镜的高吸睛完整台词。`;

      // 提取最近 6 轮对话上下文
      const historyContext: ChatMessage[] = newMessages.slice(-6).map(m => {
        let contentWithFiles = m.content;
        if (m.attachments && m.attachments.length > 0) {
          const filesSummary = m.attachments
            .map(f => `\n【参考附件: ${f.name}】\n${f.content}\n---`)
            .join('\n');
          contentWithFiles = `${filesSummary}\n${m.content}`;
        }
        return {
          role: m.role,
          content: contentWithFiles,
        };
      });

      const apiMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...historyContext,
      ];

      let fullStreamed = '';
      const finalReply = await chatCompletion(
        apiMessages,
        {
          temperature: selectedSkill?.modelParams?.temperature ?? 0.35,
          stream: true,
          onDelta: (delta: string) => {
            fullStreamed += delta;
            setStreamingDelta(fullStreamed.replace(/^\s*\n+/, ''));
          },
        },
        modelSettings
      );

      const cleanReply = (finalReply || fullStreamed).trimStart();
      const assistantMsg: ChatMessageItem = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: cleanReply,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);
      setStreamingDelta('');

      // 若生成的内容具有一定长度，经过智能净洗后自动设为右侧精选预览台词
      const rawGenerated = finalReply || fullStreamed;
      const cleanScript = extractCleanScript(rawGenerated);
      if (cleanScript.length > 20) {
        setPinnedScript(cleanScript);
      }
    } catch (err: any) {
      showToast(`生成出错: ${err.message}`);
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ 生成中断: ${err.message}。请检查【模型设置】中是否已正确配置 API Key。`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsGenerating(false);
      setStreamingDelta('');
    }
  };

  // 新建/重置会话
  const handleResetChat = () => {
    if (selectedSkill) {
      setMessages([buildWelcomeMessage(selectedSkill)]);
    } else {
      setMessages([]);
    }
    setPendingAttachments([]);
    showToast('已开启全新创作对话');
  };

  // 导入外部 Skill 文件 (.skill.md)
  const handleImportSkillFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // 导出当前 Skill
  const handleExportCurrentSkill = () => {
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

  // 样本逆向提炼新风格（支持批量上传文档与手动输入结合）
  const handleExtractStyle = async () => {
    if (!extractTeacherName.trim()) {
      showToast('请填写创作者/老师名称');
      return;
    }
    const samplesFromFile = uploadedSampleFiles.map(f => f.text.trim()).filter(Boolean);
    const samplesFromInput = [extractSample1, extractSample2].map(s => s.trim()).filter(Boolean);
    const samples = [...samplesFromFile, ...samplesFromInput];

    if (samples.length === 0) {
      showToast('请至少上传 1 篇历史文章或粘贴爆款样本文案');
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
      setUploadedSampleFiles([]);
      showToast(`已成功学习 ${samples.length} 篇样本并保存新风格：【${extracted.name}】`);
    } catch (e: any) {
      showToast(`提炼风格失败: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  };

  // 当前生效模型供应商名称
  const currentProviderKey = modelSettings?.defaultProvider || 'doubao';
  const currentProviderConfig = modelSettings?.providers?.[currentProviderKey];
  const currentModelName = currentProviderConfig?.selectedModel || 'doubao-seed-2.1-pro';

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50/60 dark:bg-[#0c0d12] overflow-hidden select-none">
      {/* 隐藏的文件上传 input */}
      <input
        type="file"
        ref={fileInputSkillRef}
        className="hidden"
        accept=".md,.jaygoskill,.json"
        onChange={handleImportSkillFile}
      />
      <input
        type="file"
        ref={fileInputAttachmentRef}
        className="hidden"
        multiple
        accept=".txt,.md,.docx,.pdf,.json,.csv,.text"
        onChange={e => handleUploadFiles(e.target.files)}
      />

      {/* 顶部总览栏 */}
      <div className="h-14 border-b border-zinc-200/80 dark:border-zinc-800/80 px-5 flex items-center justify-between bg-white/70 dark:bg-[#121318]/70 backdrop-blur-xs shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">💬</span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 truncate">
              <span>AI 自媒体文案工坊</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 shrink-0">
                多轮互动 · 素材理解
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => fileInputSkillRef.current?.click()}
            className="btn-modern-ghost"
            title="导入 .skill.md 技能文件"
          >
            <span>📥</span> <span>导入技能</span>
          </button>
          <button
            onClick={() => setExtractModalOpen(true)}
            className="btn-modern-purple"
          >
            <span>✨</span> <span>上传文档提炼风格</span>
          </button>
          <button
            onClick={onOpenModelHub}
            className="btn-modern-ghost"
          >
            <span>⚡</span> <span>模型设置</span>
          </button>
        </div>
      </div>

      {/* 主体三栏布局 */}
      <div className="flex-1 flex min-h-0">
        {/* 左栏：风格预设库与会话控制（宽度可调节） */}
        <div
          style={{ width: `${leftWidth}px` }}
          className="border-r border-zinc-200/80 dark:border-zinc-800/80 p-3.5 flex flex-col bg-white/40 dark:bg-zinc-900/10 overflow-y-auto space-y-3 shrink-0"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              创作者风格 ({skills.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  restoreDefaultSkills();
                  refreshSkills();
                  showToast('已重置并恢复官方预设风格');
                }}
                className="text-[10px] text-zinc-400 hover:text-blue-500 hover:underline cursor-pointer"
                title="恢复被删除或隐藏的官方预设风格"
              >
                重置
              </button>
              <button
                onClick={handleExportCurrentSkill}
                className="text-[11px] text-blue-500 hover:underline cursor-pointer"
                title="导出当前风格画像"
              >
                导出 ↗
              </button>
            </div>
          </div>

          <button
            onClick={() => setExtractModalOpen(true)}
            className="w-full p-2.5 rounded-xl border border-dashed border-purple-300 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 hover:border-purple-500 text-purple-700 dark:text-purple-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
            title="上传你的历史文章或爆款文案，AI 自动学习你的行文风格"
          >
            <span>📁 上传旧文章提炼风格</span>
          </button>

          <div className="space-y-2 flex-1 overflow-y-auto">
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
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate pr-1">
                      {s.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.isSystem ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0">
                          官方
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 shrink-0">
                          自定义
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm(`确定删除创作者风格【${s.name}】吗？`)) {
                            deleteSkill(s.id);
                            const updated = getAllSkills();
                            setSkills(updated);
                            if (selectedSkillId === s.id) {
                              setSelectedSkillId(updated[0]?.id || '');
                            }
                            showToast(`已删除风格：【${s.name}】`);
                          }
                        }}
                        className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                        title={`删除风格【${s.name}】`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* 风格画像铁律速览 */}
          {selectedSkill && (
            <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 space-y-2 text-xs">
              <div className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>当前画像铁律</span>
                <span className="text-[10px] text-zinc-400">已生效</span>
              </div>
              <div className="text-[11.5px] text-zinc-600 dark:text-zinc-400 space-y-1">
                <div>
                  <strong className="text-zinc-500">人设：</strong>
                  <span className="line-clamp-2">{selectedSkill.persona}</span>
                </div>
                <div>
                  <strong className="text-zinc-500">口头禅：</strong>
                  <span>{selectedSkill.catchphrases?.slice(0, 3).join('、')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 左侧可拖拽宽度调节手柄 */}
        <div
          onMouseDown={e => {
            e.preventDefault();
            dragStartRef.current = { type: 'left', startX: e.clientX, startWidth: leftWidth };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="w-1.5 hover:w-2 hover:bg-blue-500/50 active:bg-blue-600 transition-all cursor-col-resize shrink-0 bg-transparent relative group flex items-center justify-center select-none"
          title="按住左右拖拽，调节创作者人设栏宽度"
        >
          <div className="w-[1.5px] h-8 bg-zinc-300/80 dark:bg-zinc-700/80 group-hover:bg-blue-500 rounded-full transition-colors" />
        </div>

        {/* 中栏：全功能 AI 交互对话框 */}
        <div className="flex-1 flex flex-col min-w-[320px] bg-white dark:bg-[#111218] overflow-hidden">
          {/* 对话区顶栏信息 */}
          <div className="h-11 px-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs bg-zinc-50/40 dark:bg-zinc-900/20 shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                正在与【{selectedSkill?.name}】深度交互
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 truncate hidden sm:inline-block font-mono">
                {currentProviderKey}: {currentModelName}
              </span>
            </div>

            <button
              onClick={handleResetChat}
              className="text-[11px] text-zinc-500 hover:text-blue-500 flex items-center gap-1 transition shrink-0 cursor-pointer"
              title="清空当前消息，开始新对话"
            >
              <span>🔄</span> 新建对话
            </button>
          </div>

          {/* 消息滚动流 */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 select-text">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed transition shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-zinc-100/90 dark:bg-[#191a24] text-zinc-800 dark:text-zinc-200 border border-zinc-200/70 dark:border-zinc-800 rounded-bl-xs'
                  }`}
                >
                  {/* 用户上传的参考文件徽标 */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {msg.attachments.map(att => (
                        <div
                          key={att.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/15 text-[11px] text-white/90"
                        >
                          <span>📄</span>
                          <span className="font-mono font-medium truncate max-w-[200px]">{att.name}</span>
                          <span className="opacity-70 text-[10px]">({Math.round(att.size / 1024)} KB)</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 消息文字内容：彻底消除首行多余空行 */}
                  <div className="whitespace-pre-wrap select-text font-sans">
                    {msg.content.trimStart()}
                  </div>
                </div>

                {/* AI 回复下方的快捷动作栏（仅保留精修台词与复制，流转配音/数字人聚焦在右侧精选台词看板） */}
                {msg.role === 'assistant' && msg.content && (
                  <div className="flex items-center flex-wrap gap-1.5 mt-2">
                    <button
                      onClick={() => {
                        const clean = extractCleanScript(msg.content);
                        setPinnedScript(clean);
                        showToast('已净洗并置为右侧精选台词！');
                      }}
                      className="action-pill hover:border-blue-400/80 dark:hover:border-blue-500/80 hover:text-blue-600 dark:hover:text-blue-400"
                      title="剔除客套废话并置入右侧精选台词区进行精修与流转"
                    >
                      <span className="text-xs">📌</span>
                      <span>设为精修台词</span>
                    </button>
                    <button
                      onClick={() => {
                        const clean = extractCleanScript(msg.content);
                        navigator.clipboard.writeText(clean);
                        showToast('已复制纯净台词到剪贴板！');
                      }}
                      className="action-pill hover:border-zinc-400 dark:hover:border-zinc-500"
                    >
                      <span className="text-xs">📋</span>
                      <span>复制台词</span>
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* 流式生成中的当前气泡：彻底消除首行多余空行 */}
            {isGenerating && streamingDelta && (
              <div className="flex flex-col items-start animate-in fade-in">
                <div className="max-w-[88%] rounded-2xl rounded-bl-xs p-3.5 text-xs leading-relaxed bg-zinc-100/90 dark:bg-[#191a24] text-zinc-800 dark:text-zinc-200 border border-blue-500/40 shadow-xs">
                  <div className="whitespace-pre-wrap select-text font-sans">
                    {streamingDelta.trimStart()}
                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-blue-500 animate-pulse align-middle" />
                  </div>
                </div>
              </div>
            )}

            {/* 正在思考中的等待指示 (DeepSeek/ChatGPT 风格) */}
            {isGenerating && !streamingDelta && (
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#191a24] border border-zinc-200/80 dark:border-zinc-800 shadow-xs w-fit">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                </div>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 select-none">
                  正在思考中...
                </span>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* 底部输入控制台与文件上传 */}
          <div className="p-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-[#121318] shrink-0 space-y-2.5">
            {/* 待发送的附件预览 */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 animate-in fade-in">
                {pendingAttachments.map(file => (
                  <div
                    key={file.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300"
                  >
                    <span>📄</span>
                    <span className="font-medium truncate max-w-[180px]">{file.name}</span>
                    <span className="text-[10px] opacity-60">({Math.round(file.size / 1024)} KB)</span>
                    <button
                      onClick={() => removeAttachment(file.id)}
                      className="ml-1 hover:text-rose-500 text-blue-400 cursor-pointer"
                      title="移除此附件"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 输入框与工具栏 */}
            <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/60 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition">
              <textarea
                rows={3}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={`输入你的想法、向【${selectedSkill?.name}】提问，或上传素材让模型理解（Ctrl+Enter 发送）...`}
                className="w-full p-3 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden resize-none leading-relaxed select-text"
              />

              <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputAttachmentRef.current?.click()}
                    className="p-1.5 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 transition flex items-center gap-1 text-xs cursor-pointer"
                    title="上传本地素材或台词文件 (.txt, .md, .docx, .pdf, .json, .csv)"
                  >
                    <span className="text-sm">📎</span>
                    <span className="text-[11px] hidden sm:inline">上传参考文件</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400 hidden sm:inline">Ctrl + Enter 发送</span>
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={isGenerating || (!inputValue.trim() && pendingAttachments.length === 0)}
                    className="btn-modern-primary px-4 py-1.5 min-w-[76px]"
                  >
                    {isGenerating ? (
                      <>
                        <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>思考中</span>
                      </>
                    ) : (
                      <>
                        <span>发送</span>
                        <span>↑</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧可拖拽宽度调节手柄 */}
        <div
          onMouseDown={e => {
            e.preventDefault();
            dragStartRef.current = { type: 'right', startX: e.clientX, startWidth: rightWidth };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="w-1.5 hover:w-2 hover:bg-blue-500/50 active:bg-blue-600 transition-all cursor-col-resize shrink-0 bg-transparent relative group flex items-center justify-center select-none"
          title="按住左右拖拽，调节精选台词与流转中心宽度"
        >
          <div className="w-[1.5px] h-8 bg-zinc-300/80 dark:bg-zinc-700/80 group-hover:bg-blue-500 rounded-full transition-colors" />
        </div>

        {/* 右栏：当前精选台词看板与多流转中心（宽度可调节） */}
        <div
          style={{ width: `${rightWidth}px` }}
          className="border-l border-zinc-200/80 dark:border-zinc-800/80 p-4 flex flex-col bg-white dark:bg-[#111217] shrink-0 overflow-hidden"
        >
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <span>📋</span> 精选台词与流转中心
            </span>
            <div className="flex items-center gap-2">
              {pinnedScript && (
                <>
                  <button
                    onClick={() => {
                      const clean = extractCleanScript(pinnedScript);
                      setPinnedScript(clean);
                      showToast('已智能剔除客套语、空行与标记！');
                    }}
                    className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline cursor-pointer flex items-center gap-0.5 font-medium"
                    title="智能剔除前置寒暄、末尾客套话与空行"
                  >
                    <span>✨ 智能净洗</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pinnedScript);
                      showToast('已复制完整台词！');
                    }}
                    className="text-[11px] text-blue-500 hover:underline cursor-pointer"
                  >
                    复制
                  </button>
                  <button
                    onClick={() => {
                      setPinnedScript('');
                      showToast('已清空台词看板');
                    }}
                    className="text-[11px] text-zinc-400 hover:text-rose-500 hover:underline cursor-pointer"
                    title="清空台词看板"
                  >
                    清空
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 台词编辑与预览 */}
          <div className="flex-1 my-3 overflow-y-auto flex flex-col">
            {pinnedScript ? (
              <div className="flex-1 flex flex-col space-y-2">
                <textarea
                  value={pinnedScript}
                  onChange={e => setPinnedScript(e.target.value)}
                  placeholder="可在此微调当前精选文案..."
                  className="flex-1 w-full p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 resize-none focus:outline-hidden focus:border-blue-500 select-text font-sans"
                />
                <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                  <span>总字数: <strong className="text-zinc-700 dark:text-zinc-200">{pinnedScript.length}</strong> 字</span>
                  <span>预估时长: ~<strong className="text-zinc-700 dark:text-zinc-200">{Math.round(pinnedScript.length / 4.5)}</strong> 秒</span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-2">
                <span className="text-3xl opacity-40">💬</span>
                <p className="text-xs leading-relaxed">在对话中生成满意的文案后，点击【设为精修台词】或直接对话生成，即可在此打磨并一键推往生产流水线</p>
              </div>
            )}
          </div>

          {/* 快捷生产流转卡片 */}
          {pinnedScript && (
            <div className="space-y-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
              <div
                onClick={() => {
                  const clean = extractCleanScript(pinnedScript);
                  onPushToSynth(clean, selectedSkill?.voiceBinding?.voiceId);
                  showToast('已推送到语音合成工坊！');
                }}
                className="group relative overflow-hidden rounded-2xl p-3 border border-purple-200/80 dark:border-purple-900/50 bg-gradient-to-r from-purple-50/70 via-white to-purple-50/20 dark:from-purple-950/20 dark:via-[#14151c] dark:to-purple-950/10 hover:border-purple-400 dark:hover:border-purple-600 shadow-2xs hover:shadow-md hover:shadow-purple-500/10 transition-all cursor-pointer active:scale-[0.98]"
                title="推送到语音合成 (Seed-TTS 2.0)"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-base shrink-0 shadow-inner">
                      🎙️
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 truncate">
                        <span>推往「语音合成」</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-mono shrink-0">Seed-TTS</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                        自动同步台词与风格推荐音色
                      </div>
                    </div>
                  </div>
                  <span className="text-purple-500 group-hover:translate-x-0.5 transition-transform text-xs font-bold shrink-0 ml-1">→</span>
                </div>
              </div>

              <div
                onClick={() => {
                  const clean = extractCleanScript(pinnedScript);
                  onPushToAvatar(clean);
                  showToast('已推送到蝉镜数字人工坊！');
                }}
                className="group relative overflow-hidden rounded-2xl p-3 border border-cyan-200/80 dark:border-cyan-900/50 bg-gradient-to-r from-cyan-50/70 via-white to-cyan-50/20 dark:from-cyan-950/20 dark:via-[#14151c] dark:to-cyan-950/10 hover:border-cyan-400 dark:hover:border-cyan-600 shadow-2xs hover:shadow-md hover:shadow-cyan-500/10 transition-all cursor-pointer active:scale-[0.98]"
                title="推送到蝉镜数字人出镜"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-base shrink-0 shadow-inner">
                      🎬
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 truncate">
                        <span>推往「蝉镜数字人」</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 font-mono shrink-0">数字出镜</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                        生成高画质口型对齐播报视频
                      </div>
                    </div>
                  </div>
                  <span className="text-cyan-500 group-hover:translate-x-0.5 transition-transform text-xs font-bold shrink-0 ml-1">→</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 投喂样本提炼风格 Modal */}
      {extractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>✨</span> 上传历史爆款文章 · AI 自动逆向提炼专属风格画像
              </h3>
              <button
                onClick={() => setExtractModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <p className="text-xs text-zinc-500 leading-relaxed">
                无需复杂的提示词工程，直接批量上传该创作者以往的 <strong>历史文章、口播文案、讲义或总结资料</strong>（支持多选 <code className="text-purple-600 dark:text-purple-400 font-mono">.txt, .md, .pdf, .docx</code>），AI 将深度分析其标志性人设、口头禅、单句长度与行文框架，永久保存为您的一键创作预设！
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <span>创作者 / 老师名称</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={extractTeacherName}
                  onChange={e => setExtractTeacherName(e.target.value)}
                  placeholder="例如: 陈老师 · 爆款商业思维 / 李学姐 · 治愈情感"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500 transition"
                />
              </div>

              {/* 核心多格式文件上传区（支持点击选择或拖拽） */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <span>📁 批量上传历史文章 / 文档 (.txt, .md, .pdf, .docx)</span>
                  {uploadedSampleFiles.length > 0 && (
                    <button
                      onClick={() => setUploadedSampleFiles([])}
                      className="text-[11px] text-rose-500 hover:underline cursor-pointer"
                    >
                      清空全部已选文件
                    </button>
                  )}
                </div>

                <div
                  onClick={async () => {
                    if ((window as any).JaygoAPI?.pickDocumentFiles) {
                      try {
                        const picked = await (window as any).JaygoAPI.pickDocumentFiles();
                        if (picked && picked.length > 0) {
                          const valid = picked.filter((p: any) => p.ok && p.text?.trim());
                          if (valid.length > 0) {
                            setUploadedSampleFiles(prev => [
                              ...prev,
                              ...valid.map((v: any) => ({ name: v.name, size: v.size, text: v.text })),
                            ]);
                            showToast(`已成功载入 ${valid.length} 篇文档！`);
                          }
                        }
                      } catch (err: any) {
                        showToast(`选择文件失败: ${err.message}`);
                      }
                    } else {
                      sampleDocInputRef.current?.click();
                    }
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={async e => {
                    e.preventDefault();
                    const files = e.dataTransfer.files;
                    if (!files || files.length === 0) return;
                    for (const f of Array.from(files)) {
                      const ext = f.name.split('.').pop()?.toLowerCase() || '';
                      if (['docx', 'pdf'].includes(ext) && (window as any).JaygoAPI?.parseDocumentFile) {
                        try {
                          const p = (window as any).JaygoAPI.getPathForFile(f);
                          if (p) {
                            const res = await (window as any).JaygoAPI.parseDocumentFile(p);
                            if (res.ok && res.text) {
                              setUploadedSampleFiles(prev => [
                                ...prev,
                                { name: f.name, size: f.size, text: res.text! },
                              ]);
                              continue;
                            }
                          }
                        } catch {}
                      }
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const txt = String(ev.target?.result || '');
                        if (txt.trim()) {
                          setUploadedSampleFiles(prev => [
                            ...prev,
                            { name: f.name, size: f.size, text: txt },
                          ]);
                        }
                      };
                      reader.readAsText(f);
                    }
                    showToast('已载入拖拽的样本文件！');
                  }}
                  className="p-6 rounded-2xl border-2 border-dashed border-purple-300 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/20 hover:border-purple-500 dark:hover:border-purple-600 transition flex flex-col items-center justify-center gap-2 cursor-pointer group text-center"
                >
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform shadow-inner">
                    📑
                  </div>
                  <div>
                    <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      点击选择历史文档 或 拖拽文件至此区域
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      支持多选批量上传 Word (.docx)、PDF (.pdf)、Markdown (.md)、TXT (.txt)
                    </div>
                  </div>
                </div>

                <input
                  type="file"
                  ref={sampleDocInputRef}
                  className="hidden"
                  multiple
                  accept=".txt,.md,.pdf,.docx,.doc,.json,.csv"
                  onChange={async e => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    for (const f of Array.from(files)) {
                      const ext = f.name.split('.').pop()?.toLowerCase() || '';
                      if (['docx', 'pdf'].includes(ext) && (window as any).JaygoAPI?.parseDocumentFile) {
                        try {
                          const p = (window as any).JaygoAPI.getPathForFile(f);
                          if (p) {
                            const res = await (window as any).JaygoAPI.parseDocumentFile(p);
                            if (res.ok && res.text) {
                              setUploadedSampleFiles(prev => [
                                ...prev,
                                { name: f.name, size: f.size, text: res.text! },
                              ]);
                              continue;
                            }
                          }
                        } catch {}
                      }
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const txt = String(ev.target?.result || '');
                        if (txt.trim()) {
                          setUploadedSampleFiles(prev => [
                            ...prev,
                            { name: f.name, size: f.size, text: txt },
                          ]);
                        }
                      };
                      reader.readAsText(f);
                    }
                    e.target.value = '';
                    showToast('文件载入成功！');
                  }}
                />

                {/* 已上传的文件标签卡片列表 */}
                {uploadedSampleFiles.length > 0 && (
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-medium px-1">
                      <span>已就绪历史文档 ({uploadedSampleFiles.length} 篇)</span>
                      <span>总字数: <strong className="text-purple-600 dark:text-purple-400">{uploadedSampleFiles.reduce((acc, f) => acc + f.text.length, 0)}</strong> 字</span>
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {uploadedSampleFiles.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 text-xs text-zinc-800 dark:text-zinc-200"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span>📄</span>
                            <span className="font-medium truncate max-w-[280px]">{item.name}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">({Math.round(item.size / 1024)} KB · {item.text.length} 字)</span>
                          </div>
                          <button
                            onClick={() => setUploadedSampleFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="text-zinc-400 hover:text-rose-500 text-xs px-1 cursor-pointer"
                            title="移除此文档"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 手动直接粘贴区域（可选辅助） */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                  <span>或者直接在此粘贴范文片段（选填）</span>
                </label>
                <textarea
                  rows={3}
                  value={extractSample1}
                  onChange={e => setExtractSample1(e.target.value)}
                  placeholder="如果历史文章没有保存在文件中，也可以直接复制粘贴到这里..."
                  className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 resize-none font-sans focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
              <div className="text-[11px] text-zinc-400">
                {uploadedSampleFiles.length > 0 || extractSample1.trim() ? (
                  <span className="text-purple-600 dark:text-purple-400 font-medium">
                    ✓ 已就绪 {uploadedSampleFiles.length + (extractSample1.trim() ? 1 : 0)} 篇样本文料
                  </span>
                ) : (
                  <span>请至少上传 1 篇文档或粘贴一段范文</span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setExtractModalOpen(false)}
                  className="btn-modern-ghost"
                >
                  取消
                </button>
                <button
                  onClick={handleExtractStyle}
                  disabled={extracting}
                  className="btn-modern-purple px-5"
                >
                  {extracting ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                      <span>正在深度解构风格画像...</span>
                    </>
                  ) : (
                    <span>开始学习并创建预设</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮 Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900/90 text-white text-xs shadow-2xl border border-zinc-700 animate-in fade-in">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
