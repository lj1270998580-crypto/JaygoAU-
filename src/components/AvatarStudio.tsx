import { useEffect, useState, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import type { AvatarItem, CustomAvatarItem, FontItem, AvatarVideoTask } from '../types';

const SAMPLE_TEXTS = [
  '大家好，欢迎体验 Jaygo AU 蝉镜数字人工作台。在这里你可以一键合成高质量数字人口播视频！',
  '今天为大家分享 3 个超实用的人工智能工作流，帮助大家在音视频创作中节省 80% 的时间。',
  '感谢大家的关注与支持，如果这个视频对你有帮助，欢迎点赞、收藏并分享给身边的朋友！',
];

// 字幕预设
const SUBTITLE_PRESETS = [
  { id: 'yellow-black', name: '🟨 爆款亮黄', color: '#FFE600', strokeColor: '#000000', strokeWidth: 3 },
  { id: 'white-black', name: '🔲 经典白字', color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 3 },
  { id: 'black-white', name: '⬛ 极简黑字', color: '#111111', strokeColor: '#FFFFFF', strokeWidth: 3 },
  { id: 'cyan-glow', name: '🟦 科技电青', color: '#00F0FF', strokeColor: '#0A192F', strokeWidth: 3 },
] as const;

// 辅助判定克隆形象是否已训练完成（蝉镜 status === 2 或 progress === 100）
const isAvatarReady = (item?: CustomAvatarItem | null): boolean => {
  if (!item) return false;
  return Boolean(item.is_ready || item.status === 2 || (item.progress ?? 0) >= 100);
};

export default function AvatarStudio() {
  const { settings, patchSettings, showToast, setTab, library } = useStore();

  // 凭证配置
  const hasCredentials = Boolean(settings?.chanjingAppId?.trim() && settings?.chanjingSecretKey?.trim());
  const [appIdInput, setAppIdInput] = useState('');
  const [secretKeyInput, setSecretKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  // 形象库分类：官方公共模特 vs 我的专属克隆形象
  const [avatarTab, setAvatarTab] = useState<'official' | 'custom'>('official');

  // 官方公共模特状态
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [avatarFilter, setAvatarFilter] = useState<'all' | 'female' | 'male'>('all');
  const [avatarSearch, setAvatarSearch] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('');
  const [selectedFigureType, setSelectedFigureType] = useState<string>('whole_body');

  // 专属克隆形象状态
  const [loadingCustomAvatars, setLoadingCustomAvatars] = useState(false);
  const [customAvatars, setCustomAvatars] = useState<CustomAvatarItem[]>([]);
  const [customSearch, setCustomSearch] = useState('');
  const [selectedCustomId, setSelectedCustomId] = useState<string>('');

  // 字体列表
  const [fonts, setFonts] = useState<FontItem[]>([]);
  const [loadingFonts, setLoadingFonts] = useState(false);

  // 音色试听
  const [audioPreviewing, setAudioPreviewing] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // 本地音频试听
  const [localPlayingPath, setLocalPlayingPath] = useState<string | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);

  // 生成参数
  const [driveType, setDriveType] = useState<'tts' | 'audio'>('tts');
  const [scriptText, setScriptText] = useState('');
  const [speed, setSpeed] = useState<number>(1.0);

  // 音频驱动三模式：history (语音合成历史) | local (本地文件) | url (网络直链)
  const [audioMode, setAudioMode] = useState<'history' | 'local' | 'url'>('history');
  const [audioUrl, setAudioUrl] = useState('');
  const [selectedHistoryPath, setSelectedHistoryPath] = useState<string>('');
  const [selectedLocalAudio, setSelectedLocalAudio] = useState<{ path: string; name: string; size?: number } | null>(null);
  const [historySearch, setHistorySearch] = useState('');

  // 视频参数
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [modelQuality, setModelQuality] = useState<number>(0); // 0基础版, 1高质版

  // 字幕样式配置
  const [showSubtitle, setShowSubtitle] = useState<boolean>(true);
  const [subtitlePreset, setSubtitlePreset] = useState<string>('yellow-black');
  const [fontId, setFontId] = useState<string>('');
  const [fontSize, setFontSize] = useState<number>(54);
  const [fontColor, setFontColor] = useState<string>('#FFE600');
  const [strokeColor, setStrokeColor] = useState<string>('#000000');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [showCustomSubtitle, setShowCustomSubtitle] = useState<boolean>(false);

  // 任务状态与轮询
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string>('');
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<AvatarVideoTask | null>(null);
  const [downloading, setDownloading] = useState(false);

  // 临时 OSS 对象 Key（用于在任务完成后自动彻底删除）
  const tempOssKeyRef = useRef<string | null>(null);

  // 历史作品视图
  const [activeView, setActiveView] = useState<'create' | 'history'>('create');
  const [historyList, setHistoryList] = useState<AvatarVideoTask[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  // 轮询定时器
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 停止轮询
  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  // 清理临时 OSS 音频
  const cleanupTempOss = async () => {
    const key = tempOssKeyRef.current;
    if (key) {
      tempOssKeyRef.current = null;
      try {
        await api.chanjingDeleteTempAudio({ key });
        console.log('[AvatarStudio] 临时 OSS 音频已彻底删除:', key);
      } catch (err) {
        console.warn('[AvatarStudio] 删除临时 OSS 失败:', err);
      }
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
      cleanupTempOss();
      if (previewAudioRef.current) previewAudioRef.current.pause();
      if (localAudioRef.current) localAudioRef.current.pause();
    };
  }, []);

  // 加载官方数字人形象列表（带 1 次防抖重试机制）
  const fetchAvatars = async (isRetry: boolean | unknown = false) => {
    const isActualRetry = isRetry === true;
    if (!hasCredentials) return;
    setLoadingAvatars(true);
    try {
      const res = await api.chanjingListAvatars({ page: 1, size: 50 });
      setAvatars(res.list || []);
      if (res.list && res.list.length > 0 && !selectedAvatarId) {
        setSelectedAvatarId(res.list[0].id);
        const firstFig = res.list[0].figures?.[0]?.type || 'whole_body';
        setSelectedFigureType(firstFig);
      }
      setLoadingAvatars(false);
    } catch (e: any) {
      if (!isActualRetry) {
        setTimeout(() => fetchAvatars(true), 600);
        return;
      }
      setLoadingAvatars(false);
      showToast(`拉取公共形象库失败: ${e?.message || '未知错误'}`, 'err');
    }
  };

  // 加载定制克隆形象列表（带 1 次防抖重试机制）
  const fetchCustomAvatars = async (isRetry: boolean | unknown = false) => {
    const isActualRetry = isRetry === true;
    if (!hasCredentials) return;
    setLoadingCustomAvatars(true);
    try {
      const list = await api.chanjingListCustomAvatars();
      setCustomAvatars(list || []);
      if (list && list.length > 0 && !selectedCustomId) {
        const readyOne = list.find((a) => isAvatarReady(a)) || list[0];
        setSelectedCustomId(readyOne.id);
      }
      setLoadingCustomAvatars(false);
    } catch (e: any) {
      if (!isActualRetry) {
        setTimeout(() => fetchCustomAvatars(true), 600);
        return;
      }
      setLoadingCustomAvatars(false);
      showToast(`拉取克隆形象库失败: ${e?.message || '未知错误'}`, 'err');
    }
  };

  // 加载商用字体列表
  const fetchFonts = async () => {
    if (!hasCredentials || fonts.length > 0) return;
    setLoadingFonts(true);
    try {
      const list = await api.chanjingGetFontList();
      setFonts(list || []);
    } catch (e) {
      console.warn('获取字体列表失败，使用系统默认字体:', e);
    } finally {
      setLoadingFonts(false);
    }
  };

  // 加载历史作品
  const fetchHistory = async () => {
    if (!hasCredentials) return;
    setLoadingHistory(true);
    try {
      const res = await api.chanjingListVideos({ page: 1, size: 20 });
      setHistoryList(res.list || []);
    } catch (e: any) {
      showToast(`拉取历史记录失败: ${e?.message || '未知错误'}`, 'err');
    } finally {
      setLoadingHistory(false);
    }
  };

  // 删除历史视频（同步调用云端 delete_video 并从本地移除）
  const handleDeleteVideo = async (item: AvatarVideoTask) => {
    if (!window.confirm('确定要删除该历史视频吗？云端记录也将同步移除。')) {
      return;
    }
    setDeletingId(item.id);
    try {
      await api.chanjingDeleteVideo(item.id);
      setHistoryList((prev) => prev.filter((v) => v.id !== item.id));
      showToast('已成功删除该历史视频', 'ok');
    } catch (err: any) {
      showToast(`删除失败: ${err?.message || '未知错误'}`, 'err');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (hasCredentials) {
      fetchAvatars();
      fetchCustomAvatars();
      fetchFonts();
    }
  }, [hasCredentials]);

  useEffect(() => {
    if (activeView === 'history' && hasCredentials) {
      fetchHistory();
    }
  }, [activeView, hasCredentials]);

  // 当前选中的官方模特
  const currentAvatar = useMemo(() => {
    return avatars.find((a) => a.id === selectedAvatarId) || avatars[0] || null;
  }, [avatars, selectedAvatarId]);

  // 当前选中的专属克隆形象
  const currentCustomAvatar = useMemo(() => {
    return customAvatars.find((a) => a.id === selectedCustomId) || customAvatars[0] || null;
  }, [customAvatars, selectedCustomId]);

  useEffect(() => {
    if (currentAvatar && currentAvatar.figures && currentAvatar.figures.length > 0) {
      const exists = currentAvatar.figures.some((f) => f.type === selectedFigureType);
      if (!exists) {
        setSelectedFigureType(currentAvatar.figures[0].type);
      }
    }
  }, [currentAvatar]);

  // 筛选官方模特
  const filteredAvatars = useMemo(() => {
    return avatars.filter((a) => {
      if (avatarFilter === 'female') {
        if (a.gender && !a.gender.includes('女') && a.gender !== 'female') return false;
      }
      if (avatarFilter === 'male') {
        if (a.gender && !a.gender.includes('男') && a.gender !== 'male') return false;
      }
      if (avatarSearch.trim()) {
        const q = avatarSearch.trim().toLowerCase();
        const matchName = a.name.toLowerCase().includes(q);
        const matchTag = a.tag_names?.some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchTag) return false;
      }
      return true;
    });
  }, [avatars, avatarFilter, avatarSearch]);

  // 筛选定制克隆形象
  const filteredCustomAvatars = useMemo(() => {
    return customAvatars.filter((a) => {
      if (!customSearch.trim()) return true;
      const q = customSearch.trim().toLowerCase();
      return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
    });
  }, [customAvatars, customSearch]);

  // 筛选历史音频
  const filteredHistoryAudios = useMemo(() => {
    const list = library || [];
    if (!historySearch.trim()) return list.slice(0, 30);
    const q = historySearch.trim().toLowerCase();
    return list.filter((item) => (item.text || '').toLowerCase().includes(q) || (item.voiceName || '').toLowerCase().includes(q)).slice(0, 30);
  }, [library, historySearch]);

  // 试听官方模特原声
  const handleTogglePreviewAudio = (audioUrl?: string) => {
    if (!audioUrl) {
      showToast('该模特暂无可试听的音频', 'info');
      return;
    }
    if (audioPreviewing === audioUrl) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setAudioPreviewing(null);
    } else {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      const aud = new Audio(audioUrl);
      previewAudioRef.current = aud;
      setAudioPreviewing(audioUrl);
      aud.play().catch(() => {
        showToast('音频试听播放失败', 'err');
        setAudioPreviewing(null);
      });
      aud.onended = () => setAudioPreviewing(null);
    }
  };

  // 本地音频试听播放
  const handleToggleLocalAudio = async (filePath: string) => {
    if (localPlayingPath === filePath) {
      if (localAudioRef.current) {
        localAudioRef.current.onerror = null;
        localAudioRef.current.pause();
        localAudioRef.current.src = '';
      }
      setLocalPlayingPath(null);
      return;
    }
    try {
      if (localAudioRef.current) {
        localAudioRef.current.onerror = null;
        localAudioRef.current.pause();
        localAudioRef.current.src = '';
      }
      const dataUri = await api.readAudio(filePath);
      const aud = new Audio(dataUri);
      localAudioRef.current = aud;
      setLocalPlayingPath(filePath);
      aud.play().catch(() => {
        showToast('本地音频播放失败', 'err');
        setLocalPlayingPath(null);
      });
      aud.onended = () => setLocalPlayingPath(null);
      aud.onerror = () => {
        if (aud.src && aud.src !== 'about:blank') {
          showToast('本地音频播放失败', 'err');
        }
        setLocalPlayingPath(null);
      };
    } catch (e: any) {
      showToast(`读取音频失败: ${e?.message || '未知异常'}`, 'err');
      setLocalPlayingPath(null);
    }
  };

  // 选择本地文件
  const handlePickLocalAudio = async () => {
    try {
      const filePath = await api.pickAudioFile();
      if (filePath) {
        const name = filePath.split(/[/\\]/).pop() || '本地音频';
        setSelectedLocalAudio({ path: filePath, name });
        showToast(`已选择本地音频：${name}`, 'ok');
      }
    } catch (e: any) {
      showToast(`选择文件失败: ${e?.message || '未知错误'}`, 'err');
    }
  };

  // 应用字幕预设
  const applyPreset = (presetId: string) => {
    setSubtitlePreset(presetId);
    const found = SUBTITLE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setFontColor(found.color);
      setStrokeColor(found.strokeColor);
      setStrokeWidth(found.strokeWidth);
    }
  };

  // 保存 API 凭证
  const handleSaveCredentials = async () => {
    if (!appIdInput.trim() || !secretKeyInput.trim()) {
      showToast('请完整填写 App ID 和 Secret Key', 'err');
      return;
    }
    setSavingKey(true);
    try {
      await patchSettings({
        chanjingAppId: appIdInput.trim(),
        chanjingSecretKey: secretKeyInput.trim(),
      });
      const authRes = await api.chanjingAuth();
      if (authRes.ok) {
        showToast('蝉镜开放平台授权成功！', 'ok');
      } else {
        showToast(authRes.message || '凭证保存成功，但认证测试未通过', 'err');
      }
    } catch (e: any) {
      showToast(e?.message || '保存失败', 'err');
    } finally {
      setSavingKey(false);
    }
  };

  // 提交生成任务
  const handleCreateVideo = async () => {
    let personId = '';
    let figureType: string | undefined = undefined;
    let isCustom = false;
    let source: 0 | 1 | undefined = undefined;
    let audioMan: string | undefined = undefined;

    if (avatarTab === 'official') {
      if (!currentAvatar) {
        showToast('请选择一位官方数字人模特', 'err');
        return;
      }
      personId = currentAvatar.id;
      figureType = selectedFigureType;
      audioMan = currentAvatar.audio_man_id;
    } else {
      if (!currentCustomAvatar) {
        showToast('请选择一位您的专属克隆形象', 'err');
        return;
      }
      if (!isAvatarReady(currentCustomAvatar)) {
        showToast('该形象仍在克隆定制中，请等待蝉镜训练完成', 'err');
        return;
      }
      personId = currentCustomAvatar.id;
      isCustom = true;
      source = currentCustomAvatar.source;
      audioMan = currentCustomAvatar.audio_man_id || currentAvatar?.audio_man_id || 'C-CASE-d8dfe5838e774124b04e0ad41c194847';
    }

    let finalWavUrl: string | undefined = undefined;
    let localPathToUpload: string | null = null;

    if (driveType === 'tts') {
      if (!scriptText.trim()) {
        showToast('请输入口播脚本播报文案', 'err');
        return;
      }
    } else {
      if (audioMode === 'url') {
        if (!audioUrl.trim()) {
          showToast('请输入驱动音频 URL 链接', 'err');
          return;
        }
        finalWavUrl = audioUrl.trim();
      } else if (audioMode === 'local') {
        if (!selectedLocalAudio?.path) {
          showToast('请选择本地驱动音频文件', 'err');
          return;
        }
        localPathToUpload = selectedLocalAudio.path;
      } else if (audioMode === 'history') {
        if (!selectedHistoryPath) {
          showToast('请从合成历史中选择一条音频', 'err');
          return;
        }
        localPathToUpload = selectedHistoryPath;
      }
    }

    setSubmitting(true);
    stopPolling();
    await cleanupTempOss();

    try {
      // 若需要暂存本地或历史音频到托管 OSS
      if (localPathToUpload) {
        setSubmitStage('正在上传驱动音频至托管云端暂存...');
        const ossRes = await api.chanjingUploadTempAudio({ localPath: localPathToUpload });
        finalWavUrl = ossRes.url;
        tempOssKeyRef.current = ossRes.key;
      }

      setSubmitStage('正在向蝉镜 AI 开放平台提交任务...');
      const res = await api.chanjingCreateVideo({
        personId,
        figureType,
        isCustom,
        source,
        driveType,
        text: driveType === 'tts' ? scriptText.trim() : undefined,
        speed,
        audioMan,
        wavUrl: finalWavUrl,
        aspectRatio,
        model: modelQuality,
        showSubtitle,
        subtitleConfig: showSubtitle
          ? {
              show: true,
              fontId: fontId || undefined,
              fontSize,
              color: fontColor,
              strokeColor,
              strokeWidth,
              preset: subtitlePreset as any,
            }
          : undefined,
        ossKey: tempOssKeyRef.current || undefined,
      });

      const videoId = res.videoId;
      setCurrentTaskId(videoId);
      setCurrentTask({
        id: videoId,
        status: 10,
        progress: 0,
        queue_status: 'queued',
        queue_desc: '任务已提交，进入生成队列...',
      });
      setSubmitStage('');
      showToast('数字人生成任务已创建，正在排队渲染...', 'ok');

      // 启动轮询
      pollTimerRef.current = setInterval(async () => {
        try {
          const task = await api.chanjingQueryVideo(videoId);
          setCurrentTask(task);
          if (task.status === 30) {
            stopPolling();
            setSubmitting(false);
            setSubmitStage('');
            showToast('🎉 数字人视频合成完成！', 'ok');
            api.showNotification?.({
              title: '🎉 蝉镜数字人视频已渲染就绪',
              body: '您的数字人口播视频已成功生成，点击前往预览或保存成片',
              tab: 'avatar',
            });
            // 视频渲染完毕，自动彻底清理 OSS 暂存对象
            await cleanupTempOss();
          } else if (task.status >= 40) {
            stopPolling();
            setSubmitting(false);
            setSubmitStage('');
            showToast(`视频合成失败: ${task.msg || '未知异常'}`, 'err');
            // 失败时也立即彻底清理 OSS 暂存对象
            await cleanupTempOss();
          }
        } catch (err: any) {
          console.error('Query video task error:', err);
        }
      }, 3000);
    } catch (e: any) {
      showToast(e?.message || '创建任务失败', 'err');
      setSubmitting(false);
      setSubmitStage('');
      await cleanupTempOss();
    }
  };

  // 保存视频到本地
  const handleDownloadVideo = async (url: string, id: string) => {
    setDownloading(true);
    try {
      const defaultName = `chanjing_avatar_${id.slice(-6)}_${Date.now()}.mp4`;
      const res = await api.chanjingDownloadVideo({ url, defaultName });
      if (!res.canceled && res.filePath) {
        showToast(`已成功保存到：${res.filePath}`, 'ok');
      }
    } catch (e: any) {
      showToast(`下载失败: ${e?.message || '网络异常'}`, 'err');
    } finally {
      setDownloading(false);
    }
  };

  // 复制视频直链
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast('视频直链已复制到剪贴板', 'ok');
  };

  // 如果未配置凭证，展示友好引导
  if (!hasCredentials) {
    return (
      <div className="page flex flex-col items-center justify-center min-h-[560px] max-w-2xl mx-auto py-12">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center mb-6 shadow-xl shadow-blue-500/10">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-blue-500">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
            <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">配置蝉镜数字人开放接口</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-lg mb-8 leading-relaxed">
          Jaygo AU 已深度接入蝉镜 AI 开放平台，支持官方模特与您的专属克隆形象一键驱动。只需在下方填入 App ID 与 Secret Key 即可开启创作。
        </p>

        <div className="glass p-6 w-full space-y-4 shadow-xl border-zinc-200/80 dark:border-zinc-800">
          <div>
            <label className="label">蝉镜 App ID</label>
            <input
              type="text"
              className="glass-input w-full font-mono"
              placeholder="例如：app_68ef29xxxxxxxxxx"
              value={appIdInput}
              onChange={(e) => setAppIdInput(e.target.value)}
            />
          </div>
          <div>
            <label className="label">蝉镜 Secret Key</label>
            <input
              type="password"
              className="glass-input w-full font-mono"
              placeholder="例如：sk_9a8f27xxxxxxxxxxxxxxxx"
              value={secretKeyInput}
              onChange={(e) => setSecretKeyInput(e.target.value)}
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <a
              href="https://doc.chanjing.cc/api/open-api-common-knowledge.html"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <span>如何获取 API 凭证？查看蝉镜开放平台文档</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            <button
              className="btn-primary px-6"
              onClick={handleSaveCredentials}
              disabled={savingKey || !appIdInput.trim() || !secretKeyInput.trim()}
            >
              {savingKey ? '验证并保存中…' : '保存并进入工坊'}
            </button>
          </div>
        </div>

        <div className="mt-8 text-xs text-zinc-400 text-center">
          提示：也可以随时在左下角「偏好设置」中修改或重新测试您的蝉镜开放平台连接。
        </div>
      </div>
    );
  }

  return (
    <div className="page flex flex-col h-full overflow-hidden p-0">
      {/* 顶部标题栏与视图切换 */}
      <div className="px-8 pt-6 pb-4 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between shrink-0 bg-white/50 dark:bg-[#0c0c0e]/50 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">蝉镜数字人工坊</h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              OpenAPI v1
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            支持官方模特与专属克隆形象，文本或本地音频直接驱动，一键合成高精数字人口播
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 视图切换：制作工坊 vs 历史记录 */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-200/60 dark:border-zinc-700/60 text-xs">
            <button
              onClick={() => setActiveView('create')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                activeView === 'create'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              制作数字人
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                activeView === 'history'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
              }`}
            >
              <span>历史作品</span>
              {historyList.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-mono">
                  {historyList.length}
                </span>
              )}
            </button>
          </div>

          <button
            className="btn-ghost text-xs flex items-center gap-1 !py-1.5"
            onClick={() => setTab('settings')}
            title="查看或修改蝉镜凭证"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>接口配置</span>
          </button>
        </div>
      </div>

      {/* 主工作区 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeView === 'create' ? (
          <div className="h-full flex flex-col md:flex-row overflow-hidden">
            {/* 左侧配置栏 (可滚动) */}
            <div className="w-full md:w-[60%] h-full overflow-y-auto p-6 space-y-6 border-r border-zinc-200/80 dark:border-zinc-800/80">
              {/* 1. 模特挑选：官方模特 vs 我的专属克隆 */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
                  {/* 分段器 */}
                  <div className="flex bg-zinc-100 dark:bg-zinc-800/90 p-1 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 text-xs shrink-0 select-none">
                    <button
                      type="button"
                      onClick={() => setAvatarTab('official')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        avatarTab === 'official'
                          ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                      }`}
                    >
                      <span>🌟 官方公共模特</span>
                      {avatars.length > 0 && <span className="text-[10.5px] opacity-75">({avatars.length})</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvatarTab('custom')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                        avatarTab === 'custom'
                          ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs font-semibold'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                      }`}
                    >
                      <span>👤 我的专属克隆形象</span>
                      {customAvatars.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[9.5px] bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-mono">
                          {customAvatars.length}
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {avatarTab === 'official' ? (
                      <>
                        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 text-xs shrink-0 whitespace-nowrap border border-zinc-200/60 dark:border-zinc-700/60">
                          {(['all', 'female', 'male'] as const).map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setAvatarFilter(g)}
                              className={`px-2.5 py-1 rounded-md transition whitespace-nowrap text-xs ${
                                avatarFilter === g
                                  ? 'bg-white dark:bg-zinc-700 font-medium text-zinc-900 dark:text-zinc-100 shadow-xs'
                                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                              }`}
                            >
                              {g === 'all' ? '全部' : g === 'female' ? '女性' : '男性'}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="btn-ghost !p-1.5 text-zinc-500 shrink-0"
                          onClick={fetchAvatars}
                          disabled={loadingAvatars}
                          title="刷新公共模特库"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loadingAvatars ? 'animate-spin' : ''}>
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost !px-2.5 !py-1 text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5 text-xs shrink-0 whitespace-nowrap rounded-lg border border-zinc-200/80 dark:border-zinc-700/80"
                        onClick={fetchCustomAvatars}
                        disabled={loadingCustomAvatars}
                        title="刷新我的专属克隆形象"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loadingCustomAvatars ? 'animate-spin' : ''}>
                          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        <span>刷新克隆</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 形象展示区 */}
                {avatarTab === 'official' ? (
                  <>
                    {loadingAvatars ? (
                      <div className="h-44 flex items-center justify-center text-zinc-400 text-xs">
                        正在拉取公共数字人形象库…
                      </div>
                    ) : filteredAvatars.length === 0 ? (
                      <div className="h-40 glass flex items-center justify-center text-zinc-400 text-xs">
                        未找到匹配的数字人模特
                      </div>
                    ) : (
                      <div key="grid-official" className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-60 overflow-y-auto p-1">
                        {filteredAvatars.map((item) => {
                          const isSelected = item.id === (currentAvatar?.id || selectedAvatarId);
                          const cover = item.figures?.[0]?.cover || '';
                          return (
                            <div
                              key={`official-${item.id}`}
                              onClick={() => setSelectedAvatarId(item.id)}
                              className={`relative rounded-xl border p-2 cursor-pointer transition-all duration-200 text-center group ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20 shadow-md'
                                  : 'border-zinc-200/80 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700'
                              }`}
                            >
                              <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 mb-2 relative">
                                {cover ? (
                                  <img src={cover} alt={item.name} className="w-full h-full object-cover object-top" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">无图</div>
                                )}
                                {item.gender && (
                                  <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded text-[9.5px] bg-black/60 text-white backdrop-blur-xs">
                                    {item.gender}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                                {item.audio_name || '内置原声'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 当前选中官方模特详情 & 动作姿势 */}
                    {currentAvatar && (
                      <div className="mt-3 p-3.5 glass-soft rounded-xl flex items-center justify-between border-blue-100 dark:border-blue-900/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-800 shrink-0">
                            <img
                              src={currentAvatar.figures?.[0]?.cover}
                              alt={currentAvatar.name}
                              className="w-full h-full object-cover object-top"
                            />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <span>{currentAvatar.name}</span>
                              <span className="text-[10px] font-normal text-zinc-400">({currentAvatar.id})</span>
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                              <span>推荐音色: {currentAvatar.audio_name || '默认真人音色'}</span>
                              {currentAvatar.audio_preview && (
                                <button
                                  type="button"
                                  onClick={() => handleTogglePreviewAudio(currentAvatar.audio_preview)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 text-[10.5px]"
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                  <span>{audioPreviewing === currentAvatar.audio_preview ? '停止试听' : '试听音色'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {currentAvatar.figures && currentAvatar.figures.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-zinc-400">姿势:</span>
                            <select
                              className="glass-input !h-7 !py-0 !text-xs"
                              value={selectedFigureType}
                              onChange={(e) => setSelectedFigureType(e.target.value)}
                            >
                              {currentAvatar.figures.map((f) => (
                                <option key={f.type} value={f.type}>
                                  {f.type === 'whole_body' ? '全身站姿' : f.type === 'sit_body' ? '坐姿' : f.type === 'circle_view' ? '圆形画幅' : f.type}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  /* 专属克隆形象展示 */
                  <>
                    {loadingCustomAvatars ? (
                      <div className="h-44 flex items-center justify-center text-zinc-400 text-xs">
                        正在拉取您的专属克隆形象库…
                      </div>
                    ) : filteredCustomAvatars.length === 0 ? (
                      <div className="h-44 glass rounded-xl p-5 flex flex-col items-center justify-center text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
                        </div>
                        <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          暂未找到您在蝉镜克隆的数字人形象
                        </div>
                        <p className="text-[11px] text-zinc-400 max-w-sm leading-relaxed">
                          您可以在蝉镜主站 (chanjing.cc) 录制视频进行形象克隆，克隆成功后点击上方「刷新克隆」即可直接调用生成。
                        </p>
                        <a
                          href="https://www.chanjing.cc"
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 pt-1"
                        >
                          <span>前往蝉镜官网克隆数字人</span>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>
                      </div>
                    ) : (
                      <div key="grid-custom" className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-60 overflow-y-auto p-1">
                        {filteredCustomAvatars.map((item) => {
                          const isSelected = item.id === (currentCustomAvatar?.id || selectedCustomId);
                          const ready = isAvatarReady(item);
                          return (
                            <div
                              key={`custom-${item.source ?? 0}-${item.id}`}
                              onClick={() => {
                                if (ready) setSelectedCustomId(item.id);
                                else showToast('该形象仍在克隆定制中，请稍候…', 'info');
                              }}
                              className={`relative rounded-xl border p-2 cursor-pointer transition-all duration-200 text-center group ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20 shadow-md'
                                  : ready
                                  ? 'border-zinc-200/80 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700'
                                  : 'border-zinc-200/40 dark:border-zinc-800/40 opacity-60 bg-zinc-50 dark:bg-zinc-900/20'
                              }`}
                            >
                              <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 mb-2 relative">
                                {item.pic_url ? (
                                  <img src={item.pic_url} alt={item.name} className="w-full h-full object-cover object-top" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">克隆形象</div>
                                )}
                                <span
                                  className={`absolute top-1 left-1 px-1.5 py-0.2 rounded text-[9.5px] text-white font-medium ${
                                    item.source === 1 ? 'bg-purple-600/90' : 'bg-blue-600/90'
                                  }`}
                                >
                                  {item.source === 1 ? '主站定制' : 'API定制'}
                                </span>
                                <span
                                  className={`absolute bottom-1 right-1 px-1.5 py-0.2 rounded text-[9.5px] text-white font-medium ${
                                    ready ? 'bg-emerald-600/90' : 'bg-amber-600/90 animate-pulse'
                                  }`}
                                >
                                  {ready ? '已就绪' : '训练中'}
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                                {item.support_4k ? '✨ 支持4K渲染' : '高精克隆'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {currentCustomAvatar && (
                      <div className="mt-3 p-3.5 glass-soft rounded-xl flex items-center justify-between border-purple-100 dark:border-purple-900/30">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-800 shrink-0">
                            {currentCustomAvatar.pic_url ? (
                              <img src={currentCustomAvatar.pic_url} alt={currentCustomAvatar.name} className="w-full h-full object-cover object-top" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs">头像</div>
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <span>{currentCustomAvatar.name}</span>
                              <span className="text-[10px] font-normal text-purple-600 dark:text-purple-400">
                                ({currentCustomAvatar.source === 1 ? '蝉镜主站克隆' : 'API定制'})
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                              专属克隆数字人已自动锁定真人训练音容特征，将以最高逼真度驱动合成。
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 2. 播报驱动模式 (TTS vs 音频驱动) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="section-title text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span>播报驱动内容</span>
                  </label>

                  <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setDriveType('tts')}
                      className={`px-3 py-1 rounded transition ${
                        driveType === 'tts'
                          ? 'bg-white dark:bg-zinc-700 font-medium text-zinc-900 dark:text-zinc-100 shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      文本合成播报 (TTS)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDriveType('audio')}
                      className={`px-3 py-1 rounded transition ${
                        driveType === 'audio'
                          ? 'bg-white dark:bg-zinc-700 font-medium text-zinc-900 dark:text-zinc-100 shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      音频驱动 (Audio)
                    </button>
                  </div>
                </div>

                {driveType === 'tts' ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <textarea
                        className="w-full h-32 p-3 text-xs rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-[#151518] text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 transition resize-none leading-relaxed"
                        placeholder="输入需要数字人播报的文案内容（建议 20-500 字，语气自然，标点分明）..."
                        value={scriptText}
                        onChange={(e) => setScriptText(e.target.value)}
                      />
                      <div className="absolute bottom-2.5 right-3 text-[11px] text-zinc-400 font-mono">
                        {scriptText.length} 字
                      </div>
                    </div>

                    {/* 快捷示例词 */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] text-zinc-400 shrink-0">快捷示例:</span>
                      <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
                        {SAMPLE_TEXTS.map((sample, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setScriptText(sample)}
                            className="px-2 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap transition"
                          >
                            示例 {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 播报语速 */}
                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">播报语速</span>
                      <div className="flex items-center gap-3 w-60">
                        <input
                          type="range"
                          min={0.8}
                          max={1.5}
                          step={0.05}
                          value={speed}
                          onChange={(e) => setSpeed(Number(e.target.value))}
                          className="w-full cursor-pointer"
                        />
                        <span className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200 w-10 text-right">
                          {speed.toFixed(2)}x
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 音频驱动三选一模式 */
                  <div className="space-y-3">
                    <div className="flex bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setAudioMode('history')}
                        className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center gap-1 ${
                          audioMode === 'history'
                            ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                        }`}
                      >
                        <span>🎙️ 语音合成历史</span>
                        {library && library.length > 0 && (
                          <span className="text-[10px] opacity-70 font-mono">({library.length})</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAudioMode('local')}
                        className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center gap-1 ${
                          audioMode === 'local'
                            ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                        }`}
                      >
                        <span>📁 选择本地音频</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAudioMode('url')}
                        className={`flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center gap-1 ${
                          audioMode === 'url'
                            ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                        }`}
                      >
                        <span>🔗 网络音频直链</span>
                      </button>
                    </div>

                    {audioMode === 'history' ? (
                      <div className="space-y-2">
                        {library.length === 0 ? (
                          <div className="p-5 glass rounded-xl text-center text-xs text-zinc-400">
                            暂无语音合成历史，可先在「语音合成」模块生成音频，或切换到「选择本地音频」。
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                className="glass-input flex-1 !text-xs !py-1.5"
                                placeholder="搜索历史合成文案或音色名称..."
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto border border-zinc-200/80 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800/60 bg-white/50 dark:bg-[#121216]">
                              {filteredHistoryAudios.map((item) => {
                                const isSelected = selectedHistoryPath === item.path;
                                const isPlaying = localPlayingPath === item.path;
                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => setSelectedHistoryPath(item.path)}
                                    className={`p-2.5 flex items-center justify-between cursor-pointer transition ${
                                      isSelected
                                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-l-3 border-blue-500'
                                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1 pr-2">
                                      <div className="text-xs text-zinc-900 dark:text-zinc-100 font-medium truncate">
                                        {item.text || '无文本摘要'}
                                      </div>
                                      <div className="text-[10.5px] text-zinc-400 flex items-center gap-2 mt-0.5">
                                        <span className="text-blue-600 dark:text-blue-400">{item.voiceName}</span>
                                        <span>•</span>
                                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleLocalAudio(item.path)}
                                        className="btn-ghost !p-1.5 text-zinc-600 dark:text-zinc-300"
                                        title={isPlaying ? '停止播放' : '试听音频'}
                                      >
                                        {isPlaying ? (
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                        ) : (
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    ) : audioMode === 'local' ? (
                      <div className="glass p-4 rounded-xl space-y-3 border-zinc-200/80 dark:border-zinc-800">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                              {selectedLocalAudio ? selectedLocalAudio.name : '未选择本地音频文件'}
                            </div>
                            <div className="text-[11px] text-zinc-400 truncate max-w-sm mt-0.5">
                              {selectedLocalAudio ? selectedLocalAudio.path : '支持 MP3, WAV, M4A, OGG 等常见音频格式'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handlePickLocalAudio}
                            className="btn-primary !text-xs !py-1.5 whitespace-nowrap"
                          >
                            {selectedLocalAudio ? '更换音频' : '选择本地音频'}
                          </button>
                        </div>
                        {selectedLocalAudio && (
                          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                            <span className="text-zinc-500">已就绪待驱动</span>
                            <button
                              type="button"
                              onClick={() => handleToggleLocalAudio(selectedLocalAudio.path)}
                              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              <span>{localPlayingPath === selectedLocalAudio.path ? '停止播放' : '试听本地音频'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="url"
                          className="glass-input w-full font-mono text-xs"
                          placeholder="https://example.com/audio.mp3 （需为公开可直接访问的音频直链）"
                          value={audioUrl}
                          onChange={(e) => setAudioUrl(e.target.value)}
                        />
                        <p className="text-[11px] text-zinc-400">
                          支持填写第三方对象存储（OSS/COS/S3）的公开 MP3/WAV 直链。
                        </p>
                      </div>
                    )}

                    <p className="text-[10.5px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      <span>托管云端暂存：本地/历史音频将在提交时安全暂存，合成完毕（成功或失败）后立即彻底删除，零长期残留。</span>
                    </p>
                  </div>
                )}
              </div>

              {/* 3. 字幕样式设置 */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="section-title text-sm flex items-center gap-1.5 mb-0">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>字幕与样式配置</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={showSubtitle}
                        onChange={(e) => setShowSubtitle(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-blue-600"
                      />
                      <span>开启视频字幕</span>
                    </label>
                  </div>

                  {showSubtitle && (
                    <button
                      type="button"
                      onClick={() => setShowCustomSubtitle(!showCustomSubtitle)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <span>{showCustomSubtitle ? '收起高级微调' : '高级微调 (字体/字号/颜色)'}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={showCustomSubtitle ? 'rotate-180' : ''}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>

                {showSubtitle && (
                  <div className="space-y-3">
                    {/* 样式预设网格 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {SUBTITLE_PRESETS.map((p) => {
                        const isSelected = subtitlePreset === p.id && !showCustomSubtitle;
                        return (
                          <div
                            key={p.id}
                            onClick={() => applyPreset(p.id)}
                            className={`p-2.5 rounded-xl border cursor-pointer transition text-center ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 ring-1 ring-blue-500 font-semibold'
                                : 'border-zinc-200/80 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 hover:border-zinc-300'
                            }`}
                          >
                            <div className="text-xs mb-1.5">{p.name}</div>
                            <div
                              className="text-xs font-bold py-1 px-2 rounded bg-zinc-900 shadow-inner"
                              style={{
                                color: p.color,
                                textShadow: `-1px -1px 0 ${p.strokeColor}, 1px -1px 0 ${p.strokeColor}, -1px 1px 0 ${p.strokeColor}, 1px 1px 0 ${p.strokeColor}`,
                              }}
                            >
                              字幕预览
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 实时字幕预览小窗 */}
                    <div className="relative rounded-xl overflow-hidden bg-gradient-to-r from-zinc-900 via-black to-zinc-900 p-3 border border-zinc-800 text-center">
                      <div className="text-[10px] text-zinc-500 mb-1 font-mono">字幕实时渲染预览效果</div>
                      <div
                        className="font-bold tracking-wide select-none"
                        style={{
                          fontSize: `${Math.round(fontSize * 0.3)}px`,
                          color: fontColor,
                          textShadow: `-1.5px -1.5px 0 ${strokeColor}, 1.5px -1.5px 0 ${strokeColor}, -1.5px 1.5px 0 ${strokeColor}, 1.5px 1.5px 0 ${strokeColor}`,
                        }}
                      >
                        欢迎使用 Jaygo AU 制作数字人视频
                      </div>
                    </div>

                    {/* 高级微调面板 */}
                    {showCustomSubtitle && (
                      <div className="p-3.5 glass-soft rounded-xl space-y-3 border-zinc-200/80 dark:border-zinc-800 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          {/* 字体选择 */}
                          <div>
                            <label className="label !text-[11px]">字体样式</label>
                            <select
                              className="glass-input w-full !text-xs !h-8 !py-0"
                              value={fontId}
                              onChange={(e) => setFontId(e.target.value)}
                            >
                              <option value="">系统默认商用黑体</option>
                              {fonts.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 字号选择 */}
                          <div>
                            <label className="label !text-[11px]">字幕字号 ({fontSize}px)</label>
                            <div className="flex items-center gap-2">
                              <select
                                className="glass-input w-full !text-xs !h-8 !py-0"
                                value={fontSize}
                                onChange={(e) => setFontSize(Number(e.target.value))}
                              >
                                <option value={44}>小 (44px)</option>
                                <option value={54}>标准推荐 (54px)</option>
                                <option value={64}>大 (64px)</option>
                                <option value={72}>特大 (72px)</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-1">
                          {/* 文字颜色 */}
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-600 dark:text-zinc-400">字体颜色</span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={fontColor}
                                onChange={(e) => setFontColor(e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                              />
                              <span className="font-mono text-[11px] text-zinc-500 uppercase">{fontColor}</span>
                            </div>
                          </div>

                          {/* 描边颜色 */}
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-600 dark:text-zinc-400">描边颜色</span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="color"
                                value={strokeColor}
                                onChange={(e) => setStrokeColor(e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                              />
                              <span className="font-mono text-[11px] text-zinc-500 uppercase">{strokeColor}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. 视频参数配置 */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {/* 画幅比例 */}
                  <div>
                    <label className="label">画幅比例</label>
                    <div className="grid grid-cols-2 gap-1.5 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setAspectRatio('9:16')}
                        className={`py-1.5 rounded text-center transition ${
                          aspectRatio === '9:16'
                            ? 'bg-white dark:bg-zinc-700 font-semibold text-zinc-900 dark:text-white shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        9:16 竖屏 (短视频)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectRatio('16:9')}
                        className={`py-1.5 rounded text-center transition ${
                          aspectRatio === '16:9'
                            ? 'bg-white dark:bg-zinc-700 font-semibold text-zinc-900 dark:text-white shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        16:9 横屏 (宽屏)
                      </button>
                    </div>
                  </div>

                  {/* 渲染品质 */}
                  <div>
                    <label className="label">视频品质</label>
                    <select
                      className="glass-input w-full !text-xs !h-9"
                      value={modelQuality}
                      onChange={(e) => setModelQuality(Number(e.target.value))}
                    >
                      <option value={0}>基础版 (渲染更快，口型标准)</option>
                      <option value={1}>高质版 (面部更高清，表情细腻)</option>
                    </select>
                  </div>
                </div>

                {/* 提交按钮 */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCreateVideo}
                    disabled={submitting || (avatarTab === 'official' ? !currentAvatar : !currentCustomAvatar)}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>{submitStage || '数字人合成中，请稍候…'}</span>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        <span>🎬 开始合成数字人视频</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-center text-zinc-400 mt-2">
                    合成耗时通常为 1-3 分钟，生成完成后可在右侧直接播放并保存到本地。
                  </p>
                </div>
              </div>
            </div>

            {/* 右侧成片与进度监控视窗 */}
            <div className="w-full md:w-[40%] h-full bg-zinc-50/60 dark:bg-[#101014] p-6 flex flex-col justify-between overflow-y-auto">
              <div>
                <div className="section-title text-sm mb-3 flex items-center justify-between">
                  <span>实时渲染视窗</span>
                  {currentTaskId && (
                    <span className="text-[10px] font-mono text-zinc-400">ID: {currentTaskId.slice(-8)}</span>
                  )}
                </div>

                {/* 状态 1: 生成中 (轮询进度卡片) */}
                {submitting || (currentTask && currentTask.status === 10) ? (
                  <div className="glass p-6 rounded-2xl text-center space-y-4 shadow-sm border-blue-100 dark:border-blue-900/40">
                    <div className="w-16 h-16 mx-auto rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center animate-pulse">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500 animate-spin">
                        <circle cx="12" cy="12" r="10" strokeDasharray="30 60" />
                      </svg>
                    </div>

                    <div>
                      <div className="text-sm font-bold text-zinc-900 dark:text-white">
                        {currentTask?.queue_desc || submitStage || 'AI 神经渲染集群正在生成视频...'}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        唇形对齐与高精面部合成中，预计需 60~120 秒
                      </div>
                    </div>

                    {/* 进度条 */}
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(10, currentTask?.progress || 15)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[11px] text-zinc-400 font-mono">
                      <span>队列状态: {currentTask?.queue_status || 'processing'}</span>
                      <span>{currentTask?.progress ? `${currentTask.progress}%` : '处理中'}</span>
                    </div>
                  </div>
                ) : currentTask && currentTask.status === 30 && currentTask.video_url ? (
                  /* 状态 2: 成功生成，提供 HTML5 视频播放器 */
                  <div className="space-y-4 animate-fade-in">
                    <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[460px] mx-auto shadow-2xl border border-zinc-800 flex items-center justify-center">
                      <video
                        src={currentTask.video_url}
                        controls
                        autoPlay
                        playsInline
                        onLoadedMetadata={(e) => {
                          e.currentTarget.volume = 1.0;
                          e.currentTarget.muted = false;
                        }}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center justify-between px-1">
                      <span>🔊 已开启 100% 原声音量</span>
                      <span>若仍无声请检查系统或设备静音状态</span>
                    </div>

                    {/* 成片操作按钮组 */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadVideo(currentTask.video_url!, currentTask.id)}
                        disabled={downloading}
                        className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>{downloading ? '下载中…' : '保存到本地 MP4'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(currentTask.video_url!)}
                        className="btn-ghost text-xs px-3 py-2.5"
                        title="复制云端直链"
                      >
                        复制链接
                      </button>
                    </div>
                  </div>
                ) : currentTask && currentTask.status >= 40 ? (
                  /* 状态 3: 异常报错 */
                  <div className="p-5 rounded-xl border border-rose-200 bg-rose-50/60 dark:bg-rose-950/30 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-2">
                    <div className="font-bold flex items-center gap-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>视频合成未完成</span>
                    </div>
                    <div>原因: {currentTask.msg || '服务端处理超时或异常'}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={handleCreateVideo}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-medium"
                      >
                        重新尝试
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentTaskId(null);
                          setCurrentTask(null);
                        }}
                        className="btn-ghost !py-1 !px-2.5 !text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        清除提示
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 状态 4: 空白待命状态 */
                  <div className="h-72 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
                    <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center mb-3 text-zinc-400">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                    <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">暂无进行中的合成任务</div>
                    <div className="text-[11px] text-zinc-400 mt-1 max-w-[200px]">
                      在左侧挑选形象并输入播报脚本或音频，点击「开始合成」即可在此预览
                    </div>
                  </div>
                )}
              </div>

              {/* 底部小贴士 */}
              <div className="pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60 text-[11px] text-zinc-400 leading-relaxed">
                ℹ️ 蝉镜数字人使用提示：生成的视频支持无水印高清导出，链接可在 30 天内随时访问与二次下载；临时驱动音频任务结束后自动删除。
              </div>
            </div>
          </div>
        ) : (
          /* 历史作品列表视图 */
          <div className="h-full overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">历史生成作品库</h3>
                <p className="text-xs text-zinc-500 mt-0.5">查看云端记录与以往生成的数字人视频</p>
              </div>
              <button
                className="btn-ghost text-xs flex items-center gap-1"
                onClick={fetchHistory}
                disabled={loadingHistory}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loadingHistory ? 'animate-spin' : ''}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>刷新列表</span>
              </button>
            </div>

            {loadingHistory ? (
              <div className="h-60 flex items-center justify-center text-zinc-400 text-xs">
                正在拉取历史视频列表…
              </div>
            ) : historyList.length === 0 ? (
              <div className="h-60 glass rounded-2xl flex flex-col items-center justify-center text-zinc-400 text-xs">
                <p>暂无历史视频作品</p>
                <button
                  className="btn-primary mt-3 text-xs"
                  onClick={() => setActiveView('create')}
                >
                  去制作第一个数字人视频
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {historyList.map((item) => {
                  const isSuccess = item.status === 30;
                  const dateStr = item.create_time
                    ? new Date(item.create_time * 1000).toLocaleString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '--';
                  return (
                    <div
                      key={item.id}
                      className="glass rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800 flex flex-col"
                    >
                      <div className="relative aspect-[9/16] bg-black max-h-56 overflow-hidden flex items-center justify-center">
                        {item.preview_url ? (
                          <img src={item.preview_url} alt="video preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-zinc-600 text-xs">视频封面</div>
                        )}
                        {isSuccess && item.video_url && (
                          <button
                            type="button"
                            onClick={() => setPreviewVideoUrl(item.video_url!)}
                            className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/60 hover:bg-blue-600 text-white flex items-center justify-center backdrop-blur-xs transition shadow-lg"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          </button>
                        )}
                        <span
                          className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            isSuccess
                              ? 'bg-emerald-500/90 text-white'
                              : item.status === 10
                              ? 'bg-blue-500/90 text-white animate-pulse'
                              : 'bg-rose-500/90 text-white'
                          }`}
                        >
                          {isSuccess ? '已就绪' : item.status === 10 ? '生成中' : '失败'}
                        </span>
                      </div>

                      <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="text-xs font-mono text-zinc-500 truncate">
                            ID: {item.id}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            创建时间: {dateStr}
                          </div>
                        </div>

                        <div className="flex gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 items-center">
                          {isSuccess && item.video_url ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDownloadVideo(item.video_url!, item.id)}
                                className="btn-ghost flex-1 !py-1 !text-xs"
                              >
                                下载 MP4
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyUrl(item.video_url!)}
                                className="btn-ghost !py-1 !px-2 !text-xs"
                                title="复制链接"
                              >
                                复制
                              </button>
                            </>
                          ) : (
                            <div className="text-[11px] text-zinc-400 flex-1 truncate">
                              {item.status === 10 ? '正在生成中…' : item.status >= 40 ? '任务未完成' : '排队中…'}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteVideo(item)}
                            disabled={deletingId === item.id}
                            className="btn-ghost !py-1 !px-2 !text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                            title="从云端彻底删除"
                          >
                            {deletingId === item.id ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10" strokeDasharray="30 60" /></svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 视频弹窗大图预览 */}
      {previewVideoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
          onClick={() => setPreviewVideoUrl(null)}
        >
          <div
            className="relative max-w-lg w-full max-h-[85vh] rounded-2xl overflow-hidden bg-black shadow-2xl border border-zinc-700"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              playsInline
              onLoadedMetadata={(e) => {
                e.currentTarget.volume = 1.0;
                e.currentTarget.muted = false;
              }}
              className="w-full h-full max-h-[80vh] object-contain"
            />
            <button
              onClick={() => setPreviewVideoUrl(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black/90 flex items-center justify-center text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
