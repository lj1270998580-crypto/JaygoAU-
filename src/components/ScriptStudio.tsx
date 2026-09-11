import React, { useState, useEffect, useRef } from 'react';
import type { SkillPreset, SkillFileAsset } from '../lib/skillTypes';
import {
  getAllSkills,
  saveCustomSkill,
  deleteSkill,
  restoreDefaultSkills,
  parseSkillContent,
  parseSkillFromZip,
  exportSkillToZip,
  exportSkillToMarkdown,
} from '../lib/skillParser';
import { chatCompletion, type ChatMessage } from '../lib/modelHubService';
import type { ModelHubSettings, ModelProviderType } from '../lib/modelHubTypes';
import { PRESET_PROVIDERS, getModelContextLimit } from '../lib/modelHubTypes';
import { extractStyleFromSamples } from '../lib/styleExtractor';
import { extractCleanScript } from '../lib/scriptSanitizer';
import { useAdaptiveColumns } from '../lib/useAdaptiveColumns';
import {
  ScriptSession,
  AttachedFile,
  ChatMessageItem,
  getStoredSessions,
  saveSession,
  deleteSessionById,
  renameSessionById,
  createNewSession,
  buildCompressedContext,
  buildWelcomeMessage,
} from '../lib/scriptSessionManager';
import {
  Sparkles,
  Paperclip,
  ArrowUp,
  RotateCcw,
  SlidersHorizontal,
  BookmarkPlus,
  Copy,
  Check,
  X,
  FileText,
  Trash2,
  Upload,
  Wand2,
  ChevronRight,
  Bot,
  Mic,
  Video,
  MessageSquare,
  Layers,
  Plus,
  Pencil,
  Search,
  ChevronDown,
  ArrowLeft,
  RefreshCw,
  FolderArchive,
  ExternalLink,
  BrainCircuit,
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
} from 'lucide-react';
import { ChatMessageRenderer } from './ChatMessageRenderer';

interface Props {
  modelSettings: ModelHubSettings;
  onUpdateModelHubSettings?: (s: ModelHubSettings) => void;
  onOpenModelHub: () => void;
  onPushToSynth: (text: string, voiceId?: string) => void;
  onPushToAvatar: (text: string) => void;
}

export function ScriptStudio({
  modelSettings,
  onUpdateModelHubSettings,
  onOpenModelHub,
  onPushToSynth,
  onPushToAvatar,
}: Props) {
  // 创作者风格列表与当前选中风格
  const [skills, setSkills] = useState<SkillPreset[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('chaoran_wenan');

  // 会话管理状态
  const [sessions, setSessions] = useState<ScriptSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionRenameValue, setSessionRenameValue] = useState<string>('');

  // 左栏视图模态：'sessions' (会话历史) | 'skill' (创作风格详情编辑)
  const [leftTab, setLeftTab] = useState<'sessions' | 'skill'>('sessions');

  // 对话输入与临时状态
  const [inputValue, setInputValue] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<AttachedFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingDelta, setStreamingDelta] = useState('');

  // 风格详情编辑状态（在左栏编辑或自定义创作者风格名字）
  const [editSkillName, setEditSkillName] = useState('');
  const [editSkillPersona, setEditSkillPersona] = useState('');
  const [editSkillDesc, setEditSkillDesc] = useState('');
  const [editCatchphrases, setEditCatchphrases] = useState<string[]>([]);
  const [newCatchphraseInput, setNewCatchphraseInput] = useState('');
  const [editSentenceLength, setEditSentenceLength] = useState('');
  const [editStructure, setEditStructure] = useState('');
  const [editNegativeConstraints, setEditNegativeConstraints] = useState<string[]>([]);
  const [newNegativeInput, setNewNegativeInput] = useState('');
  const [editSystemPrompt, setEditSystemPrompt] = useState('');

  // 对话框下方风格下拉菜单状态
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false);
  const [styleSearchQuery, setStyleSearchQuery] = useState('');

  // 输入框 @ 自动联想状态
  const [atMentionOpen, setAtMentionOpen] = useState(false);
  const [atQuery, setAtQuery] = useState('');
  const [atHighlightIndex, setAtHighlightIndex] = useState(0);

  // 输入框模型下拉菜单状态（满足诉求 3：模型选择框放到对话输入框里，用小按钮切换）
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);

  // 右侧精选文案面板显隐（满足诉求 4：精选文案只有用户精选后才在右侧显示）
  const [showRightPanel, setShowRightPanel] = useState<boolean>(false);

  // 左侧栏折叠状态（满足诉求 5：对话区域默认可以再大些）
  const [isLeftCollapsed, setIsLeftCollapsed] = useState<boolean>(false);

  // 可自由调节的左右栏宽度 (v0.7.6 改为自适应：窄窗口自动压缩/降级，永不裁切)
  const cols = useAdaptiveColumns({
    storageKey: 'jaygo_script_studio',
    defaultLeft: 240,
    defaultRight: 320,
    minLeft: 200,
    maxLeft: 460,
    minRight: 240,
    maxRight: 560,
    minCenter: 360,
    dividerTotal: 12,
    twoColumnBelow: 900,
    focusBelow: 620,
  });
  const { containerRef: scriptColumnsRef, effectiveMode: scriptMode, leftWidth, rightWidth } = cols;

  const dragStartRef = useRef<{
    type: 'left' | 'right' | null;
    startX: number;
    startWidth: number;
  }>({ type: null, startX: 0, startWidth: 0 });

  // 风格逆向提炼 Modal 状态
  const [extractModalOpen, setExtractModalOpen] = useState(false);
  const [extractTeacherName, setExtractTeacherName] = useState('');
  const [extractSample1, setExtractSample1] = useState('');
  const [uploadedSampleFiles, setUploadedSampleFiles] = useState<Array<{ name: string; size: number; text: string }>>([]);
  const [extracting, setExtracting] = useState(false);

  // 联网模式开关（满足诉求 6：默认开启联网功能）
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);

  // 流转中心显隐状态（满足诉求 8：默认不展示流转中心）
  const [showDispatchCenter, setShowDispatchCenter] = useState(false);

  // 消息复制反馈微标
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // 反馈提示
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fileInputSkillRef = useRef<HTMLInputElement | null>(null);
  const fileInputAttachmentRef = useRef<HTMLInputElement | null>(null);
  const sampleDocInputRef = useRef<HTMLInputElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const refreshSkills = () => {
    const list = getAllSkills();
    setSkills(list);
  };

  // 初始化加载 Skills
  useEffect(() => {
    refreshSkills();
  }, []);

  const selectedSkill = skills.find(s => s.id === selectedSkillId) || skills[0];

  // 初始化加载会话历史
  useEffect(() => {
    const stored = getStoredSessions();
    if (stored.length > 0) {
      setSessions(stored);
      setCurrentSessionId(stored[0].id);
      if (stored[0].skillId && skills.some(s => s.id === stored[0].skillId)) {
        setSelectedSkillId(stored[0].skillId);
      } else if (skills.length > 0) {
        setSelectedSkillId(skills[0].id);
      }
    } else if (selectedSkill) {
      const initialSession = createNewSession(selectedSkill, '王超然 · 认知爆款文案会话');
      setSessions([initialSession]);
      setCurrentSessionId(initialSession.id);
    }
  }, [skills.length > 0]);

  // 当前活跃会话
  const currentSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const messages = currentSession?.messages || [];
  const pinnedScript = currentSession?.pinnedScript || '';

  // 同步右侧精选文案面板状态：仅当当前会话有精选文案时才默认显示（满足诉求 4）
  useEffect(() => {
    if (currentSession?.pinnedScript && currentSession.pinnedScript.trim()) {
      setShowRightPanel(true);
    } else {
      setShowRightPanel(false);
    }
  }, [currentSessionId]);

  // 同步当前风格到左侧编辑表单
  useEffect(() => {
    if (selectedSkill) {
      setEditSkillName(selectedSkill.name);
      setEditSkillPersona(selectedSkill.persona);
      setEditSkillDesc(selectedSkill.description);
      setEditCatchphrases([...(selectedSkill.catchphrases || [])]);
      setEditSentenceLength(selectedSkill.pacingRules?.sentenceLength || '');
      setEditStructure(selectedSkill.pacingRules?.structure || '');
      setEditNegativeConstraints([...(selectedSkill.negativeConstraints || [])]);
      setEditSystemPrompt(selectedSkill.systemPrompt || '');
    }
  }, [selectedSkill?.id]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStyleDropdownOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 左右栏拖拽调整宽度（自适应版本：由 Hook 统一钳制，不再直接写 localStorage）
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current.type) return;
      // 交由 useAdaptiveColumns 的 startResize 处理，此处仅保留兼容占位
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

  // 滚动至最新消息
  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streamingDelta]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  // 更新当前活跃会话状态并持久化
  const updateCurrentSession = (updates: Partial<ScriptSession>) => {
    if (!currentSession) return;
    const updated: ScriptSession = {
      ...currentSession,
      ...updates,
      updatedAt: Date.now(),
    };
    const newSessions = saveSession(updated);
    setSessions(newSessions);
  };

  // 新建会话
  const handleCreateNewSession = () => {
    if (!selectedSkill) return;
    const newS = createNewSession(selectedSkill);
    setSessions(prev => [newS, ...prev]);
    setCurrentSessionId(newS.id);
    setLeftTab('sessions');
    showToast('已开启全新文案创作会话！');
  };

  // 切换会话
  const handleSwitchSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    const target = sessions.find(s => s.id === sessionId);
    if (target?.skillId && target.skillId !== selectedSkillId) {
      setSelectedSkillId(target.skillId);
    }
  };

  // 删除会话
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      showToast('至少保留一个创作会话');
      return;
    }
    const updated = deleteSessionById(sessionId);
    setSessions(updated);
    if (currentSessionId === sessionId) {
      setCurrentSessionId(updated[0]?.id || '');
      if (updated[0]?.skillId) setSelectedSkillId(updated[0].skillId);
    }
    showToast('会话已删除');
  };

  // 重命名会话完成
  const handleFinishRenameSession = (sessionId: string) => {
    if (sessionRenameValue.trim()) {
      renameSessionById(sessionId, sessionRenameValue.trim());
      setSessions(getStoredSessions());
    }
    setEditingSessionId(null);
  };

  // 切换创作风格（下拉框或 @ 联想）
  const handleSelectSkill = (skill: SkillPreset) => {
    setSelectedSkillId(skill.id);
    setStyleDropdownOpen(false);
    setAtMentionOpen(false);

    if (currentSession) {
      const hasUserMsg = currentSession.messages.some(m => m.role === 'user');
      if (!hasUserMsg) {
        // 尚未开始正式对话，直接更新开场欢迎语
        updateCurrentSession({
          skillId: skill.id,
          messages: [buildWelcomeMessage(skill)],
        });
      } else {
        // 已有对话，插入一条人设切换通知
        const switchNotice: ChatMessageItem = {
          id: `switch_${Date.now()}`,
          role: 'assistant',
          content: `✨ 已切换至【**${skill.name}**】创作画像（${skill.persona}）。后续对话将由该导师持续打磨。`,
          timestamp: Date.now(),
        };
        updateCurrentSession({
          skillId: skill.id,
          messages: [...currentSession.messages, switchNotice],
        });
      }
    }
    showToast(`已装载【${skill.name}】创作者风格`);
  };

  // 保存当前 Skill 的修改（支持自定义创作者风格名字、口头禅、人设等）
  const handleSaveSkillEdit = () => {
    if (!selectedSkill) return;
    const finalName = editSkillName.trim() || selectedSkill.name;
    const updatedSkill: SkillPreset = {
      ...selectedSkill,
      name: finalName,
      persona: editSkillPersona.trim() || selectedSkill.persona,
      description: editSkillDesc.trim() || selectedSkill.description,
      catchphrases: editCatchphrases.filter(Boolean),
      pacingRules: {
        sentenceLength: editSentenceLength.trim() || selectedSkill.pacingRules.sentenceLength,
        structure: editStructure.trim() || selectedSkill.pacingRules.structure,
      },
      negativeConstraints: editNegativeConstraints.filter(Boolean),
      systemPrompt: editSystemPrompt.trim() || undefined,
      updatedAt: Date.now(),
      isSystem: false, // 一旦被用户修改，自动转换为用户自定义风格
    };

    saveCustomSkill(updatedSkill);
    refreshSkills();
    setSelectedSkillId(updatedSkill.id);
    showToast(`已成功保存创作者风格：【${finalName}】！`);
  };

  // 另存为新自定义风格
  const handleSaveAsNewSkill = () => {
    if (!selectedSkill) return;
    const newId = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newName = `${editSkillName.trim() || selectedSkill.name} (副本)`;
    const newSkill: SkillPreset = {
      ...selectedSkill,
      id: newId,
      name: newName,
      author: '用户自定义',
      persona: editSkillPersona.trim() || selectedSkill.persona,
      description: editSkillDesc.trim() || selectedSkill.description,
      catchphrases: [...editCatchphrases],
      pacingRules: {
        sentenceLength: editSentenceLength.trim() || selectedSkill.pacingRules?.sentenceLength || '',
        structure: editStructure.trim() || selectedSkill.pacingRules?.structure || '',
      },
      negativeConstraints: [...editNegativeConstraints],
      systemPrompt: editSystemPrompt.trim() || undefined,
      updatedAt: Date.now(),
      isSystem: false,
    };
    saveCustomSkill(newSkill);
    refreshSkills();
    setSelectedSkillId(newId);
    showToast(`已另存为新风格：【${newName}】`);
  };

  // 删除当前风格
  const handleDeleteCurrentSkill = (skillId: string, skillName: string) => {
    if (!window.confirm(`确定要删除创作风格【${skillName}】吗？`)) {
      return;
    }
    deleteSkill(skillId);
    const updated = getAllSkills();
    setSkills(updated);
    if (updated.length > 0) {
      setSelectedSkillId(updated[0].id);
      if (currentSession && currentSession.skillId === skillId) {
        updateCurrentSession({ skillId: updated[0].id });
      }
    }
    showToast(`已删除创作风格：【${skillName}】`);
  };

  // 恢复所有预设默认风格
  const handleRestoreDefaults = () => {
    restoreDefaultSkills();
    const updated = getAllSkills();
    setSkills(updated);
    if (updated.length > 0) {
      setSelectedSkillId(updated[0].id);
    }
    showToast('已恢复官方预设风格（王超然 / 宋俊生）');
  };

  // 上传附件素材文件
  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    for (const file of Array.from(fileList)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      // 若是 docx 或 pdf，优先通过主进程高保真提取
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
          console.warn('Native doc parsing fallback', err);
        }
      }

      // 普通文本文件读取
      const reader = new FileReader();
      reader.onload = e => {
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
        showToast(`已成功附加素材：${file.name}`);
      };
      reader.readAsText(file);
    }
  };

  const removeAttachment = (fileId: string) => {
    setPendingAttachments(prev => prev.filter(f => f.id !== fileId));
  };

  // 导入外部 Skill 文件 (.skill.md 或 .zip 压缩包)
  const handleImportSkillFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        showToast('正在解压并深度分析 Skill 规范包…');
        const buf = await file.arrayBuffer();
        const imported = await parseSkillFromZip(buf, file.name);
        saveCustomSkill(imported);
        refreshSkills();
        setSelectedSkillId(imported.id);
        const fileCount = imported.skillFiles?.length || 0;
        showToast(`成功解压并装载风格技能：【${imported.name}】${fileCount > 0 ? `（包含 ${fileCount} 个附属文档）` : ''}`);
      } else {
        const text = await file.text();
        const imported = parseSkillContent(text, file.name);
        saveCustomSkill(imported);
        refreshSkills();
        setSelectedSkillId(imported.id);
        showToast(`成功导入风格技能：【${imported.name}】`);
      }
    } catch (err: any) {
      showToast(`导入失败: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  };

  // 导出当前 Skill 为 Zip 压缩包或 Markdown
  const handleExportSkillZip = async () => {
    if (!selectedSkill) return;
    try {
      const blob = await exportSkillToZip(selectedSkill);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedSkill.name.replace(/\s+/g, '_')}_skill.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出为规范 Skill 压缩包 (.zip)');
    } catch (err: any) {
      showToast(`导出失败: ${err.message}`);
    }
  };

  const handleExportSkillMd = () => {
    if (!selectedSkill) return;
    const md = exportSkillToMarkdown(selectedSkill);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSkill.name.replace(/\s+/g, '_')}.skill.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出为 .skill.md 文件');
  };

  // 样本逆向提炼新风格
  const handleExtractStyle = async () => {
    if (!extractTeacherName.trim()) {
      showToast('请填写创作者/老师名称');
      return;
    }
    const samplesFromFile = uploadedSampleFiles.map(f => f.text.trim()).filter(Boolean);
    const samplesFromInput = [extractSample1].map(s => s.trim()).filter(Boolean);
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
      setUploadedSampleFiles([]);
      showToast(`已成功学习 ${samples.length} 篇样本并生成新风格：【${extracted.name}】`);
    } catch (e: any) {
      showToast(`提炼风格失败: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  };

  // 发送消息与流式生成（结合滑动窗口与长期记忆自动压缩机制）
  const handleSendMessage = async (textToSend?: string) => {
    const rawContent = (textToSend ?? inputValue).trim();
    if (!rawContent && pendingAttachments.length === 0) {
      showToast('请输入文案要求或上传参考素材');
      return;
    }

    if (isGenerating || !currentSession || !selectedSkill) return;

    const userMessageId = `user_${Date.now()}`;
    const userMsg: ChatMessageItem = {
      id: userMessageId,
      role: 'user',
      content: rawContent,
      attachments: [...pendingAttachments],
      timestamp: Date.now(),
    };

    const sessionWithUser = {
      ...currentSession,
      messages: [...currentSession.messages, userMsg],
      updatedAt: Date.now(),
    };

    // 自动重命名默认会话标题
    if (currentSession.messages.length <= 1 && currentSession.title.startsWith('新会话')) {
      sessionWithUser.title = rawContent.slice(0, 16) || currentSession.title;
    }

    updateCurrentSession(sessionWithUser);
    setInputValue('');
    setPendingAttachments([]);
    setIsGenerating(true);
    setStreamingDelta('');

    try {
      // 获取当前大模型的上下文窗口容量
      const modelLimit = getModelContextLimit(currentModelName, currentProviderKey);

      // 触发自动上下文滑动窗口与长期记忆压缩（90% 上下文自动感知并深度压缩，满足诉求 7）
      const { apiMessages, updatedSummary, isCompressed, reachedNinetyPercent } = buildCompressedContext(
        sessionWithUser,
        selectedSkill,
        4, // 保留最近 4 轮完整高保真上下文
        modelLimit
      );

      if (reachedNinetyPercent) {
        showToast('当前会话上下文已达大模型容量 90%，已自动智能压缩归档历史记忆');
      }

      let fullStreamed = '';
      const finalReply = await chatCompletion(
        apiMessages,
        {
          temperature: selectedSkill?.modelParams?.temperature ?? 0.35,
          stream: true,
          webSearch: webSearchEnabled, // 默认开启大模型联网功能，满足诉求 6
          onDelta: (delta: string) => {
            fullStreamed += delta;
            setStreamingDelta(fullStreamed.replace(/^\s*\n+/, ''));
          },
        },
        modelSettings
      );

      const cleanReply = (finalReply || fullStreamed).trim();
      // 防御性校验：杜绝生成空白内容且无报错的问题（满足诉求 4）
      if (!cleanReply) {
        throw new Error('模型未返回有效文案内容，请检查模型配置或重新尝试发送');
      }

      const assistantMsg: ChatMessageItem = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: cleanReply,
        timestamp: Date.now(),
      };

      const finalSession: ScriptSession = {
        ...sessionWithUser,
        messages: [...sessionWithUser.messages, assistantMsg],
        memorySummary: updatedSummary,
        updatedAt: Date.now(),
      };

      updateCurrentSession(finalSession);
      if (isCompressed) {
        console.log('[ScriptStudio] Context compressed into memory summary:', updatedSummary);
      }
    } catch (err: any) {
      showToast(`生成失败: ${err.message || '网络或接口异常'}`);
    } finally {
      setIsGenerating(false);
      setStreamingDelta('');
    }
  };

  // 快捷切换当前模型
  const currentProviderKey = modelSettings?.defaultProvider || 'doubao';
  const currentProviderConfig = modelSettings?.providers?.[currentProviderKey];
  const currentModelName = currentProviderConfig?.selectedModel || 'doubao-seed-2.1-pro';

  const handleQuickSwitchModel = (providerType: ModelProviderType, modelId: string) => {
    if (!modelSettings) return;
    const targetProvider = modelSettings.providers?.[providerType] || {
      type: providerType,
      enabled: true,
      apiKey: '',
      baseUrl: PRESET_PROVIDERS[providerType]?.defaultBaseUrl || '',
      selectedModel: modelId,
    };
    const hasKey = Boolean(targetProvider.apiKey?.trim());

    const nextSettings: ModelHubSettings = {
      ...modelSettings,
      defaultProvider: providerType,
      providers: {
        ...modelSettings.providers,
        [providerType]: {
          ...targetProvider,
          selectedModel: modelId,
          enabled: true,
        },
      },
    };

    onUpdateModelHubSettings?.(nextSettings);
    const preset = PRESET_PROVIDERS[providerType];
    const provName = (providerType === 'custom' && targetProvider?.customProviderName?.trim())
      ? targetProvider.customProviderName.trim()
      : (preset?.name?.split(' ')[0] || providerType);
    const modelObj = preset?.models.find(m => m.id === modelId);
    const mName = modelObj?.name || modelId;

    if (!hasKey) {
      showToast(`已切换至【${provName} · ${mName}】，尚未配置 API Key，正在开启配置…`);
      onOpenModelHub();
    } else {
      showToast(`已切换模型：【${provName} · ${mName}】`);
    }
  };

  // 输入框文字变动与 @ 自动联想识别
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);

    const selStart = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, selStart);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

    if (atMatch) {
      setAtQuery(atMatch[1]);
      setAtMentionOpen(true);
      setAtHighlightIndex(0);
    } else {
      setAtMentionOpen(false);
    }
  };

  // 过滤 @ 风格候选
  const filteredAtSkills = skills.filter(s =>
    s.name.toLowerCase().includes(atQuery.toLowerCase()) ||
    s.persona.toLowerCase().includes(atQuery.toLowerCase())
  );

  // 键盘快捷响应（@ 联想与发送）
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atMentionOpen && filteredAtSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtHighlightIndex(prev => (prev + 1) % filteredAtSkills.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtHighlightIndex(prev => (prev - 1 + filteredAtSkills.length) % filteredAtSkills.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const picked = filteredAtSkills[atHighlightIndex];
        if (picked) {
          // 替换 @... 为选中的导师名并切换风格
          const selStart = inputRef.current?.selectionStart || inputValue.length;
          const textBeforeCursor = inputValue.slice(0, selStart);
          const textAfterCursor = inputValue.slice(selStart);
          const replacedBefore = textBeforeCursor.replace(/@([^\s@]*)$/, `@${picked.name} `);
          setInputValue(replacedBefore + textAfterCursor);
          handleSelectSkill(picked);
          setAtMentionOpen(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        setAtMentionOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50/60 dark:bg-[#0c0d12] overflow-hidden select-none">
      {/* 隐藏的文件上传 input */}
      <input
        type="file"
        ref={fileInputSkillRef}
        className="hidden"
        accept=".zip,.md,.skill.md,.jaygoskill,.json"
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
                多会话 · 长期记忆 · 风格解压
              </span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fileInputSkillRef.current?.click()}
            className="btn-modern-ghost text-xs"
            title="导入 .zip 规范压缩包或 .skill.md 技能文件"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-500" /> <span>导入skill风格 (.zip/.md)</span>
          </button>
          <button
            onClick={() => setExtractModalOpen(true)}
            className="btn-modern-purple text-xs"
            title="上传旧文章深度学习提炼新风格"
          >
            <Sparkles className="w-3.5 h-3.5" /> <span>文档逆向提炼风格</span>
          </button>
          <button
            onClick={onOpenModelHub}
            className="btn-modern-ghost text-xs"
            title="打开大模型设置中心"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" /> <span>模型设置</span>
          </button>
        </div>
      </div>

      {/* 主体三栏布局（自适应：窄窗口自动压缩/降级，永不裁切） */}
      <div ref={scriptColumnsRef} className="flex-1 flex min-h-0 overflow-hidden">
        {/* 左栏：默认会话历史列表 ⇄ Skill 详情编辑中枢（支持折叠以扩大对话区） */}
        {!isLeftCollapsed && scriptMode !== 'focus' && (
          <div
            style={{ width: `${leftWidth}px`, minWidth: 0 }}
            className="border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col bg-white/50 dark:bg-zinc-900/20 overflow-hidden shrink"
          >
            {/* 左栏顶栏选项卡：会话历史 ⇄ 创作风格详情（极简防挤压） */}
            <div className="p-2.5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/40">
              <div className="flex items-center gap-0.5 bg-zinc-200/70 dark:bg-zinc-800/80 p-0.5 rounded-lg text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setLeftTab('sessions')}
                  className={`px-2 py-1 rounded-md transition ${
                    leftTab === 'sessions'
                      ? 'bg-white dark:bg-[#1c1d24] text-zinc-900 dark:text-white shadow-xs font-semibold'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  会话 ({sessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLeftTab('skill')}
                  className={`px-2 py-1 rounded-md transition flex items-center gap-1 ${
                    leftTab === 'skill'
                      ? 'bg-white dark:bg-[#1c1d24] text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                  title="查看与编辑当前创作者风格画像"
                >
                  <span>风格</span>
                  {selectedSkill && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                </button>
              </div>

              {leftTab === 'sessions' ? (
                <button
                  type="button"
                  onClick={handleCreateNewSession}
                  className="p-1 px-1.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 border border-blue-200 dark:border-blue-900 transition flex items-center gap-0.5 text-[11px] font-semibold cursor-pointer shrink-0"
                  title="开启全新创作会话"
                >
                  <Plus className="w-3 h-3" />
                  <span>新建</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setLeftTab('sessions')}
                  className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 shrink-0"
                  title="返回会话历史列表"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>返回</span>
                </button>
              )}
            </div>

          {/* 左栏内容区 1：会话历史列表 */}
          {leftTab === 'sessions' && (
            <div className="flex-1 p-3 overflow-y-auto space-y-2">
              {sessions.map(s => {
                const isCur = s.id === currentSessionId;
                const skillObj = skills.find(sk => sk.id === s.skillId);

                return (
                  <div
                    key={s.id}
                    onClick={() => handleSwitchSession(s.id)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition relative group ${
                      isCur
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-xs'
                        : 'border-zinc-200/70 dark:border-zinc-800/70 bg-white dark:bg-[#14151c] hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      {editingSessionId === s.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={sessionRenameValue}
                          onChange={e => setSessionRenameValue(e.target.value)}
                          onBlur={() => handleFinishRenameSession(s.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleFinishRenameSession(s.id);
                            if (e.key === 'Escape') setEditingSessionId(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 border border-blue-500 text-xs font-semibold text-zinc-900 dark:text-zinc-100 outline-none w-full"
                        />
                      ) : (
                        <span
                          className="font-semibold text-zinc-800 dark:text-zinc-200 truncate pr-1"
                          onDoubleClick={() => {
                            setEditingSessionId(s.id);
                            setSessionRenameValue(s.title);
                          }}
                          title="双击可重命名此会话"
                        >
                          {s.title}
                        </span>
                      )}

                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setEditingSessionId(s.id);
                            setSessionRenameValue(s.title);
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-blue-500"
                          title="重命名会话"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={e => handleDeleteSession(s.id, e)}
                          className="p-1 rounded text-zinc-400 hover:text-rose-500"
                          title="删除会话"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="truncate max-w-[120px] font-medium text-blue-600/80 dark:text-blue-400/80">
                        {skillObj ? `👤 ${skillObj.name.split('·')[0] || skillObj.name}` : '通用创作'}
                      </span>
                      <span>{s.messages.filter(m => m.role === 'user').length} 轮对话</span>
                    </div>

                    {/* 记忆压缩徽标 */}
                    {s.memorySummary && (
                      <div className="mt-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400">
                        <BrainCircuit className="w-3 h-3 shrink-0" />
                        <span className="truncate">长期记忆已自动压缩</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 左栏内容区 2：Skill 详情编辑框（支持自定义名称、人设、System Prompt 与删除风格） */}
          {leftTab === 'skill' && selectedSkill && (
            <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 truncate">
                    <span>🎨</span> <span>风格详情配置</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium shrink-0">
                    {selectedSkill.isSystem ? '官方预设' : '自定义'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteCurrentSkill(selectedSkill.id, selectedSkill.name)}
                  className="p-1 px-1.5 rounded-md text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] flex items-center gap-1 transition cursor-pointer shrink-0"
                  title="删除当前创作风格"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </button>
              </div>

              {/* 创作者风格名称（自定义） */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  创作者风格名称
                </label>
                <input
                  type="text"
                  value={editSkillName}
                  onChange={e => setEditSkillName(e.target.value)}
                  placeholder="例如: 张老师 · 犀利反常识商业口播"
                  className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* 导师人设定位（提升默认高度并支持纵向自由拖拽，满足诉求 6） */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                    导师人设定位 (Persona)
                  </label>
                  <span className="text-[10px] text-zinc-400">可拖拽右下角任意调节高度</span>
                </div>
                <textarea
                  rows={5}
                  value={editSkillPersona}
                  onChange={e => setEditSkillPersona(e.target.value)}
                  placeholder="设定导师的专业背景、语气风格、思考深度与核心认知..."
                  className="w-full p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 resize-y min-h-[120px] leading-relaxed"
                />
              </div>

              {/* 标志性口头禅 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  标志性口头禅 / 高频金句
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {editCatchphrases.map((c, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60 text-[11px] flex items-center gap-1"
                    >
                      <span>{c}</span>
                      <button
                        type="button"
                        onClick={() => setEditCatchphrases(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:text-rose-500 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    value={newCatchphraseInput}
                    onChange={e => setNewCatchphraseInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newCatchphraseInput.trim()) {
                        e.preventDefault();
                        setEditCatchphrases(prev => [...prev, newCatchphraseInput.trim()]);
                        setNewCatchphraseInput('');
                      }
                    }}
                    placeholder="输入新口头禅按回车添加..."
                    className="flex-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newCatchphraseInput.trim()) {
                        setEditCatchphrases(prev => [...prev, newCatchphraseInput.trim()]);
                        setNewCatchphraseInput('');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 text-xs font-medium"
                  >
                    添加
                  </button>
                </div>
              </div>

              {/* 句长与断句节奏约束（可纵向拖拽调节高度） */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  句长与断句节奏铁律
                </label>
                <textarea
                  rows={2}
                  value={editSentenceLength}
                  onChange={e => setEditSentenceLength(e.target.value)}
                  placeholder="例如: 极短句，单句严格控制在16个字以内"
                  className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 resize-y min-h-[56px]"
                />
              </div>

              {/* 行文框架模式 */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  行文框架与推演模式
                </label>
                <textarea
                  rows={2}
                  value={editStructure}
                  onChange={e => setEditStructure(e.target.value)}
                  placeholder="例如: 黄金3秒钩子 → 痛点真相 → 破局认知 → 金句升华"
                  className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 resize-y min-h-[56px]"
                />
              </div>

              {/* 绝对红线禁忌 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  绝对红线禁忌 (Negative)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {editNegativeConstraints.map((n, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-[11px] flex items-center gap-1"
                    >
                      <span>{n}</span>
                      <button
                        type="button"
                        onClick={() => setEditNegativeConstraints(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:text-rose-600 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newNegativeInput}
                    onChange={e => setNewNegativeInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newNegativeInput.trim()) {
                        e.preventDefault();
                        setEditNegativeConstraints(prev => [...prev, newNegativeInput.trim()]);
                        setNewNegativeInput('');
                      }
                    }}
                    placeholder="例如: 严禁出现八股套话与陈旧鸡汤..."
                    className="flex-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newNegativeInput.trim()) {
                        setEditNegativeConstraints(prev => [...prev, newNegativeInput.trim()]);
                        setNewNegativeInput('');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 text-xs font-medium"
                  >
                    添加
                  </button>
                </div>
              </div>

              {/* Skill 完整规范提示词（System Prompt，支持纵向调节） */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                    Skill 完整规范提示词 (System Prompt)
                  </label>
                  <span className="text-[10px] text-zinc-400">可拖拽右下角调节高度</span>
                </div>
                <textarea
                  rows={8}
                  value={editSystemPrompt}
                  onChange={e => setEditSystemPrompt(e.target.value)}
                  placeholder="若填写将作为完整的专属系统指令；若留空则自动根据上方人设、口头禅与铁律实时组装..."
                  className="w-full p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-[11px] text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 resize-y min-h-[160px] leading-relaxed"
                />
              </div>

              {/* 附属文件展示（如果通过 zip 导入） */}
              {selectedSkill.skillFiles && selectedSkill.skillFiles.length > 0 && (
                <div className="p-2.5 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-700/60 space-y-1.5">
                  <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <FolderArchive className="w-3.5 h-3.5 text-blue-500" />
                    <span>Zip 附属规范与知识库 ({selectedSkill.skillFiles.length} 篇)</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {selectedSkill.skillFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-[10.5px] text-zinc-500">
                        <span className="truncate">{f.path}</span>
                        <span className="font-mono">({Math.round((f.size || f.content.length) / 1024)} KB)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 保存、导出与删除操作栏 */}
              <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-2">
                <button
                  type="button"
                  onClick={handleSaveSkillEdit}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>保存修改并应用</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSaveAsNewSkill}
                    className="flex-1 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition cursor-pointer"
                  >
                    另存为新风格
                  </button>
                  <button
                    type="button"
                    onClick={selectedSkill.skillFiles?.length ? handleExportSkillZip : handleExportSkillMd}
                    className="flex-1 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition flex items-center justify-center gap-1 cursor-pointer"
                    title="导出当前风格"
                  >
                    <Upload className="w-3 h-3 rotate-180" />
                    <span>导出 {selectedSkill.skillFiles?.length ? 'Zip' : 'MD'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCurrentSkill(selectedSkill.id, selectedSkill.name)}
                    className="py-1.5 px-2 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-medium text-rose-600 dark:text-rose-400 transition flex items-center justify-center gap-1 cursor-pointer"
                    title="彻底删除此风格"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>删除</span>
                  </button>
                </div>

                {/* 恢复官方默认风格的链接 */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleRestoreDefaults}
                    className="text-[10.5px] text-zinc-400 hover:text-blue-500 underline transition cursor-pointer"
                  >
                    恢复官方默认预设风格 (王超然 / 宋俊生)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* 左侧可拖拽宽度调节手柄 */}
        {!isLeftCollapsed && scriptMode !== 'focus' && (
          <div
            onMouseDown={e => cols.startResize('left', e)}
            className="w-1.5 hover:w-2 hover:bg-blue-500/50 active:bg-blue-600 transition-all cursor-col-resize shrink-0 bg-transparent relative group flex items-center justify-center select-none"
            title="按住左右拖拽，调节左栏宽度"
          >
            <div className="w-[1.5px] h-8 bg-zinc-300/80 dark:bg-zinc-700/80 group-hover:bg-blue-500 rounded-full transition-colors" />
          </div>
        )}

        {/* 中栏：AI 对话与创作互动控制台 */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#111218] overflow-hidden">
          {/* 中栏顶栏：简洁会话状态与精炼控制（模型选择已移至输入框，彻底解除挤压） */}
          <div className="h-11 px-3 sm:px-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs bg-zinc-50/50 dark:bg-zinc-900/30 shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0"
                title={isLeftCollapsed ? '展开左侧会话历史' : '收起左侧栏以放大对话区域'}
              >
                {isLeftCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4 text-blue-500" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate text-xs">
                {currentSession?.title || '创作会话'}
              </span>
              {selectedSkill && (
                <button
                  type="button"
                  onClick={() => {
                    setIsLeftCollapsed(false);
                    setLeftTab('skill');
                  }}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 shrink-0 hover:bg-blue-100 transition cursor-pointer"
                  title="点击在左侧查看与修改此风格详情"
                >
                  {selectedSkill.name.split('·')[0] || selectedSkill.name}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* 若当前会话已有精选文案但面板已收起，提供快速打开胶囊 */}
              {pinnedScript && !showRightPanel && (
                <button
                  type="button"
                  onClick={() => setShowRightPanel(true)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                  title="展开已定稿的右侧精选文案面板"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-500" />
                  <span>精选文案 ({pinnedScript.length}字)</span>
                </button>
              )}
            </div>
          </div>

          {/* 消息滚动流 */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto select-text">
            <div className="max-w-4xl mx-auto w-full space-y-4">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* 角色与时间微标 */}
                <div className="flex items-center gap-1.5 mb-1 text-[10.5px] text-zinc-400 px-1">
                  <span>{msg.role === 'user' ? '你' : (selectedSkill?.name || 'AI 导师')}</span>
                  <span>·</span>
                  <span>{new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* 消息气泡主体（更紧凑精致的 12px 字体） */}
                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed transition-all relative group/msg ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs shadow-sm font-sans'
                      : 'bg-white dark:bg-[#15161f] text-zinc-800 dark:text-zinc-200 rounded-tl-xs border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs'
                  }`}
                >
                  {/* 用户上传的参考附件展示 */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2 pb-1.5 border-b border-white/20 dark:border-zinc-800 flex flex-wrap gap-1.5">
                      {msg.attachments.map(att => (
                        <div
                          key={att.id}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 dark:bg-zinc-800 text-[10.5px] text-white dark:text-zinc-300"
                        >
                          <FileText className="w-3 h-3" />
                          <span className="max-w-[140px] truncate">{att.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <ChatMessageRenderer content={msg.content} role={msg.role} />

                  {/* 助手回复右下角微型图标按钮：设为精选 & 复制（满足诉求 5：右下角小按钮，无文字说明，提高视觉效果） */}
                  {msg.role === 'assistant' && !msg.id.startsWith('welcome_') && Boolean(msg.content) && (
                    <div className="flex items-center justify-end gap-1 mt-1.5 pt-1 border-t border-zinc-100/80 dark:border-zinc-800/60">
                      <button
                        type="button"
                        onClick={() => {
                          const clean = extractCleanScript(msg.content);
                          updateCurrentSession({ pinnedScript: clean });
                          setShowRightPanel(true);
                          showToast('已设为右侧精选文案！');
                        }}
                        className="p-1 rounded-md text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition cursor-pointer"
                        title="设为精选文案"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const clean = extractCleanScript(msg.content);
                          navigator.clipboard.writeText(clean);
                          setCopiedMsgId(msg.id);
                          setTimeout(() => setCopiedMsgId(null), 1500);
                          showToast('已复制纯净文案到剪贴板！');
                        }}
                        className="p-1 rounded-md text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                        title="复制文案"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 流式生成中的当前气泡 */}
            {isGenerating && streamingDelta && (
              <div className="flex flex-col items-start animate-in fade-in">
                <div className="max-w-[92%] rounded-2xl rounded-tl-xs px-4 py-3 bg-white dark:bg-[#15161f] text-zinc-800 dark:text-zinc-200 border border-blue-500/50 shadow-sm text-[12.5px]">
                  <ChatMessageRenderer
                    content={streamingDelta.trimStart()}
                    role="assistant"
                    isStreaming={true}
                  />
                </div>
              </div>
            )}

            {/* 正在构思指示器 */}
            {isGenerating && !streamingDelta && (
              <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#191a24] border border-zinc-200/80 dark:border-zinc-800 shadow-xs w-fit">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                </div>
                <span className="text-[11.5px] font-medium text-zinc-500 dark:text-zinc-400 select-none">
                  正在构思打磨文案中...
                </span>
              </div>
            )}

            <div ref={chatBottomRef} />
            </div>
          </div>

          {/* 底部输入控制台与风格/模型选择器 */}
          <div className="p-3 sm:p-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-[#121318] shrink-0 relative">
            <div className="max-w-4xl mx-auto w-full space-y-2 relative">
            {/* 输入框 @ 自动联想候选浮窗 */}
            {atMentionOpen && filteredAtSkills.length > 0 && (
              <div className="absolute bottom-full left-4 mb-2 z-50 w-72 bg-white dark:bg-[#181922] rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xl overflow-hidden animate-in fade-in select-none">
                <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-850 border-b border-zinc-100 dark:border-zinc-800 text-[10.5px] font-medium text-zinc-500 flex items-center justify-between">
                  <span>选择创作者风格画像 (@ 快速切换)</span>
                  <span className="font-mono">↑↓ 选择 · Enter 确认</span>
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {filteredAtSkills.map((sk, idx) => (
                    <div
                      key={sk.id}
                      onClick={() => {
                        const selStart = inputRef.current?.selectionStart || inputValue.length;
                        const textBeforeCursor = inputValue.slice(0, selStart);
                        const textAfterCursor = inputValue.slice(selStart);
                        const replacedBefore = textBeforeCursor.replace(/@([^\s@]*)$/, `@${sk.name} `);
                        setInputValue(replacedBefore + textAfterCursor);
                        handleSelectSkill(sk);
                        setAtMentionOpen(false);
                      }}
                      className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition ${
                        idx === atHighlightIndex
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold truncate">{sk.name}</div>
                        <div className="text-[10px] text-zinc-400 truncate">{sk.persona}</div>
                      </div>
                      {sk.id === selectedSkillId && (
                        <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 待发送附件预览 */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 animate-in fade-in">
                {pendingAttachments.map(file => (
                  <div
                    key={file.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span className="font-medium truncate max-w-[180px] text-[11px]">{file.name}</span>
                    <span className="text-[10px] opacity-60">({Math.round(file.size / 1024)} KB)</span>
                    <button
                      onClick={() => removeAttachment(file.id)}
                      className="ml-1 hover:text-rose-500 text-blue-400 cursor-pointer"
                      title="移除附件"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 输入框流光卡片 */}
            <div className="ai-input-streamer-card">
              <div className="ai-input-streamer-inner">
                <textarea
                  ref={inputRef}
                  rows={3}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  placeholder={`输入文案选题、向【${selectedSkill?.name}】提问，支持输入 @ 快速联想风格画像（Ctrl+Enter 发送）...`}
                  className="w-full p-3 bg-transparent font-script-reading text-[12px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none ring-0 border-0 focus:outline-none focus:ring-0 focus:border-0 resize-none leading-relaxed select-text shadow-none"
                />

                {/* 输入框底部工具栏：现代图标上传 + 风格下拉胶囊 + 模型切换小按钮 + 联网模式 + 发送按钮 */}
                <div className="flex items-center justify-between px-3 pb-2 pt-1 border-t border-zinc-100/90 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/30 gap-2 relative">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 py-0.5 relative">
                    {/* 现代文件上传按钮（极简矢量图标，无多余文字） */}
                    <button
                      type="button"
                      onClick={() => fileInputAttachmentRef.current?.click()}
                      className="relative p-1.5 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 transition flex items-center justify-center cursor-pointer group shrink-0"
                      title="上传参考素材或文档 (.zip, .txt, .md, .docx, .pdf, .json, .csv)"
                    >
                      <Paperclip className="w-4 h-4 group-hover:rotate-45 transition-transform text-zinc-400 group-hover:text-blue-500" />
                      {pendingAttachments.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                          {pendingAttachments.length}
                        </span>
                      )}
                    </button>

                    {/* 创作者风格专属选择下拉胶囊（极简小巧，满足诉求 10） */}
                    <div className="relative shrink-0" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setStyleDropdownOpen(prev => !prev);
                          setModelDropdownOpen(false);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700/80 transition shadow-2xs cursor-pointer"
                        title="点击展开切换创作者风格，或输入 @ 快速联想"
                      >
                        <span className="text-[12px]">🎨</span>
                        <span className="truncate max-w-[68px] sm:max-w-[96px]">
                          {selectedSkill ? (selectedSkill.name.split('·')[0].trim() || selectedSkill.name) : '选择风格'}
                        </span>
                        <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                      </button>

                      {/* 风格选择下拉浮层 */}
                      {styleDropdownOpen && (
                        <div
                          className="absolute bottom-full left-0 mb-2 z-50 w-72 bg-white dark:bg-[#181922] rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-1.5 overflow-hidden animate-in fade-in select-none"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="px-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                              选择创作者风格画像
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setStyleDropdownOpen(false);
                                setLeftTab('skill');
                              }}
                              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              <span>配置详情</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>

                          {/* 快速搜索框 */}
                          <div className="p-1">
                            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
                              <Search className="w-3 h-3 text-zinc-400 shrink-0" />
                              <input
                                type="text"
                                value={styleSearchQuery}
                                onChange={e => setStyleSearchQuery(e.target.value)}
                                placeholder="搜索风格名称或特点..."
                                className="bg-transparent border-0 outline-none text-[11px] text-zinc-800 dark:text-zinc-200 w-full"
                              />
                            </div>
                          </div>

                          {/* 风格列表 */}
                          <div className="max-h-52 overflow-y-auto space-y-0.5 py-1">
                            {skills
                              .filter(sk =>
                                sk.name.toLowerCase().includes(styleSearchQuery.toLowerCase()) ||
                                sk.persona.toLowerCase().includes(styleSearchQuery.toLowerCase())
                              )
                              .map(sk => {
                                const active = sk.id === selectedSkillId;
                                return (
                                  <div
                                    key={sk.id}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleSelectSkill(sk);
                                      setStyleDropdownOpen(false);
                                    }}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition ${
                                      active
                                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300'
                                    }`}
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="truncate text-[11px] font-medium">{sk.name}</div>
                                      <div className="text-[10px] text-zinc-400 truncate">{sk.persona}</div>
                                    </div>
                                    {active && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                                  </div>
                                );
                              })}
                          </div>

                          <div className="pt-1.5 mt-1 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                            <button
                              type="button"
                              onClick={() => {
                                setStyleDropdownOpen(false);
                                fileInputSkillRef.current?.click();
                              }}
                              className="hover:text-blue-600 flex items-center gap-1 p-1 cursor-pointer"
                            >
                              <Upload className="w-3 h-3" />
                              <span>导入skill风格</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStyleDropdownOpen(false);
                                setExtractModalOpen(true);
                              }}
                              className="hover:text-purple-600 flex items-center gap-1 p-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3 text-purple-500" />
                              <span>提炼新风格</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 模型快捷切换小按钮（极简小巧，满足诉求 3 & 10） */}
                    <div className="relative shrink-0" ref={modelDropdownRef}>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setModelDropdownOpen(prev => !prev);
                          setStyleDropdownOpen(false);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700/80 transition shadow-2xs cursor-pointer"
                        title={(() => {
                          if (currentProviderKey === 'custom') {
                            const cName = currentProviderConfig?.customProviderName?.trim() || '自定义';
                            const mName = currentProviderConfig?.customModelName?.trim() || currentModelName;
                            return `当前模型：[${cName}] ${mName}`;
                          }
                          const pName = PRESET_PROVIDERS[currentProviderKey]?.name || currentProviderKey;
                          const found = PRESET_PROVIDERS[currentProviderKey]?.models?.find(m => m.id === currentModelName);
                          return `当前模型：[${pName}] ${found ? found.name : currentModelName}`;
                        })()}
                      >
                        <Bot className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate max-w-[80px] sm:max-w-[120px]">
                          {(() => {
                            if (currentProviderKey === 'custom') {
                              const cName = currentProviderConfig?.customProviderName?.trim() || '自定义';
                              const mName = currentProviderConfig?.customModelName?.trim() || currentModelName;
                              return `${cName}: ${mName}`;
                            }
                            const found = Object.values(PRESET_PROVIDERS)
                              .flatMap(p => p.models)
                              .find(m => m.id === currentModelName);
                            const raw = found ? found.name : currentModelName;
                            return raw.replace(/DeepSeek/i, 'DS').replace(/豆包/i, '豆包').slice(0, 10);
                          })()}
                        </span>
                        <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                      </button>

                      {/* 模型选择下拉浮层 */}
                      {modelDropdownOpen && (
                        <div
                          className="absolute bottom-full left-0 mb-2 z-50 w-64 bg-white dark:bg-[#181922] rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-2xl p-1.5 overflow-hidden animate-in fade-in select-none"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="px-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                              <Bot className="w-3.5 h-3.5 text-blue-500" />
                              <span>选择创作模型</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setModelDropdownOpen(false);
                                onOpenModelHub();
                              }}
                              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              <span>配置 Key</span>
                              <SlidersHorizontal className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          <div className="max-h-56 overflow-y-auto space-y-1.5 py-1">
                            {Object.entries(PRESET_PROVIDERS).map(([pType, preset]) => {
                              const provConfig = modelSettings?.providers?.[pType as ModelProviderType];
                              const hasKey = Boolean(provConfig?.apiKey?.trim());
                              const provTitle = (pType === 'custom' && provConfig?.customProviderName?.trim())
                                ? provConfig.customProviderName.trim()
                                : preset.name;
                              const models = (pType === 'custom'
                                ? (provConfig?.customModelName?.trim()
                                    ? [{ id: provConfig.customModelName.trim(), name: provConfig.customModelName.trim() }]
                                    : preset.models)
                                : (provConfig?.customModelName?.trim()
                                    ? [{ id: provConfig.customModelName.trim(), name: `${provConfig.customModelName.trim()} (自定义)` }, ...preset.models]
                                    : preset.models)).slice(0, 6);

                              return (
                                <div key={pType} className="space-y-0.5">
                                  <div className="px-2 py-0.5 text-[10px] font-semibold text-zinc-400 flex items-center justify-between">
                                    <span className="truncate max-w-[140px] font-bold">{preset.icon} {provTitle}</span>
                                    <span className={`text-[9px] shrink-0 ${hasKey ? 'text-emerald-500' : 'text-amber-500'}`}>
                                      {hasKey ? '● 已就绪' : '○ 需配Key'}
                                    </span>
                                  </div>
                                  {models.map(m => {
                                    const isSelected = currentProviderKey === pType && (currentModelName === m.id || (pType === 'custom' && !currentModelName));
                                    return (
                                      <div
                                        key={m.id}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={e => {
                                          e.stopPropagation();
                                          handleQuickSwitchModel(pType as ModelProviderType, m.id);
                                          setModelDropdownOpen(false);
                                        }}
                                        className={`px-2 py-1 rounded-lg text-xs flex items-center justify-between cursor-pointer transition ${
                                          isSelected
                                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                        }`}
                                      >
                                        <div className="truncate pr-2">
                                          <div className="text-[11px] truncate">{m.name}</div>
                                        </div>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 联网搜索切换胶囊（默认开启，满足诉求 6） */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !webSearchEnabled;
                        setWebSearchEnabled(next);
                        showToast(next ? '已开启大模型联网检索' : '已关闭大模型联网');
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer shrink-0 ${
                        webSearchEnabled
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900 shadow-2xs'
                          : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 border-zinc-200/80 dark:border-zinc-700/80'
                      }`}
                      title={webSearchEnabled ? '大模型联网检索已开启（点击切换）' : '点击开启联网检索'}
                    >
                      <Globe className={`w-3 h-3 ${webSearchEnabled ? 'text-blue-500' : 'text-zinc-400'}`} />
                      <span className="hidden sm:inline">{webSearchEnabled ? '联网已开' : '联网已关'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-zinc-400 hidden lg:inline font-mono select-none">
                      Ctrl+Enter
                    </span>
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={isGenerating || (!inputValue.trim() && pendingAttachments.length === 0)}
                      className="btn-modern-primary px-3 py-1.5 min-w-[70px] text-xs flex items-center justify-center gap-1.5 shrink-0"
                    >
                      {isGenerating ? (
                        <>
                          <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>构思中</span>
                        </>
                      ) : (
                        <>
                          <span>发送</span>
                          <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* 右侧精选文案与多流转中心（仅在用户主动精选后才在右侧显示，满足诉求 4） */}
        {showRightPanel && scriptMode === 'three' && Boolean(pinnedScript && pinnedScript.trim()) && (
          <>
            {/* 右侧可拖拽手柄 */}
            <div
              onMouseDown={e => cols.startResize('right', e)}
              className="w-1.5 hover:w-2 hover:bg-blue-500/50 active:bg-blue-600 transition-all cursor-col-resize shrink-0 bg-transparent relative group flex items-center justify-center select-none"
              title="按住左右拖拽，调节精选文案面板宽度"
            >
              <div className="w-[1.5px] h-8 bg-zinc-300/80 dark:bg-zinc-700/80 group-hover:bg-blue-500 rounded-full transition-colors" />
            </div>

            {/* 右栏：精选文案与多流转中心 */}
            <div
              style={{ width: `${rightWidth}px`, minWidth: 0 }}
              className="border-l border-zinc-200/80 dark:border-zinc-800/80 p-4 flex flex-col bg-white dark:bg-[#111217] shrink overflow-hidden"
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 shrink-0">
                  <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>精选文案</span>
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const clean = extractCleanScript(pinnedScript);
                      updateCurrentSession({ pinnedScript: clean });
                      showToast('已智能剔除客套话与多余标记！');
                    }}
                    className="p-1 rounded-md text-zinc-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition cursor-pointer"
                    title="智能净洗（剔除前置寒暄、末尾客套话与空行）"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(pinnedScript);
                      showToast('已复制完整精选文案！');
                    }}
                    className="p-1 rounded-md text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"
                    title="复制完整文案"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateCurrentSession({ pinnedScript: '' });
                      setShowRightPanel(false);
                      showToast('已清空精选文案');
                    }}
                    className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                    title="清空文案看板"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRightPanel(false)}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    title="收起精选文案面板"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 精选文案编辑与预览 */}
              <div className="flex-1 my-3 overflow-y-auto flex flex-col">
                <div className="flex-1 flex flex-col space-y-2">
                  <textarea
                    value={pinnedScript}
                    onChange={e => updateCurrentSession({ pinnedScript: e.target.value })}
                    rows={12}
                    className="w-full flex-1 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-[12px] font-script-reading leading-relaxed text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 transition resize-none select-text"
                    placeholder="选中的精选口播文案将在此沉淀..."
                  />

                  {/* 字数与预估时长 */}
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 font-mono select-none">
                    <span>总字数: <strong className="text-zinc-700 dark:text-zinc-300">{pinnedScript.length}</strong> 字</span>
                    <span>预估时长: ~<strong className="text-zinc-700 dark:text-zinc-300">{Math.ceil(pinnedScript.length / 4.5)}</strong> 秒</span>
                  </div>
                </div>
              </div>

              {/* 流转操作区（默认不展开，满足诉求 8：默认不展示流转中心） */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-1.5 select-none shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDispatchCenter(prev => !prev)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition cursor-pointer"
                  title="点击展开或收起制作流转中枢"
                >
                  <span className="flex items-center gap-1.5">
                    <span>制作流转 (语音合成 / 蝉镜数字人)</span>
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showDispatchCenter ? 'rotate-180 text-blue-500' : ''}`} />
                </button>

                {showDispatchCenter && (
                  <div className="space-y-2 pt-1 animate-in fade-in">
                    <div
                      onClick={() => onPushToSynth(extractCleanScript(pinnedScript), selectedSkill?.voiceBinding?.voiceId)}
                      className="p-2.5 rounded-xl border border-purple-200/80 dark:border-purple-900/60 bg-gradient-to-r from-purple-50/70 to-indigo-50/70 dark:from-purple-950/20 dark:to-indigo-950/20 hover:border-purple-400 transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                          <Mic className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 truncate">
                            <span>推往「语音合成」</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-mono shrink-0">Seed-TTS</span>
                          </div>
                          <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            自动同步文案与音色
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-purple-500 group-hover:translate-x-0.5 transition-transform shrink-0 ml-1" />
                    </div>

                    <div
                      onClick={() => onPushToAvatar(extractCleanScript(pinnedScript))}
                      className="p-2.5 rounded-xl border border-cyan-200/80 dark:border-cyan-900/60 bg-gradient-to-r from-cyan-50/70 to-blue-50/70 dark:from-cyan-950/20 dark:to-blue-950/20 hover:border-cyan-400 transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                          <Video className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 truncate">
                            <span>推往「蝉镜数字人」</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-cyan-100 dark:bg-cyan-900/60 text-cyan-700 dark:text-cyan-300 font-mono shrink-0">数字出镜</span>
                          </div>
                          <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            生成高画质口播视频
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-cyan-500 group-hover:translate-x-0.5 transition-transform shrink-0 ml-1" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 投喂样本提炼风格 Modal */}
      {extractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                <span>上传历史爆款文章 · AI 自动逆向提炼专属风格画像</span>
              </h3>
              <button
                onClick={() => setExtractModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <p className="text-xs text-zinc-500 leading-relaxed">
                无需复杂的提示词工程，直接批量上传该创作者以往的 <strong>历史文章、口播文案、讲义或总结资料</strong>（支持多选 <code className="text-purple-600 dark:text-purple-400 font-mono">.txt, .md, .pdf, .docx</code>），AI 将深度分析其标志性人设、口头禅、单句长度与行文框架，保存为您的一键创作预设！
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:outline-none ring-0 focus:ring-0 focus:border-blue-500 transition"
                />
              </div>

              {/* 核心多格式文件上传区 */}
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
                    <FileText className="w-6 h-6" />
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
                            <FileText className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span className="font-medium truncate max-w-[280px]">{item.name}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">({Math.round(item.size / 1024)} KB · {item.text.length} 字)</span>
                          </div>
                          <button
                            onClick={() => setUploadedSampleFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="text-zinc-400 hover:text-rose-500 text-xs px-1 cursor-pointer"
                            title="移除此文档"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 手动直接粘贴区域 */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                  <span>或者直接在此粘贴范文片段（选填）</span>
                </label>
                <textarea
                  rows={3}
                  value={extractSample1}
                  onChange={e => setExtractSample1(e.target.value)}
                  placeholder="如果历史文章没有保存在文件中，也可以直接复制粘贴到这里..."
                  className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs leading-relaxed text-zinc-900 dark:text-zinc-100 resize-none font-sans outline-none focus:outline-none ring-0 focus:ring-0 focus:border-blue-500"
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
