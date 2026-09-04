import { useEffect, useState, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { api } from '../lib/ipc';
import type { AvatarItem, AvatarVideoTask } from '../types';

const SAMPLE_TEXTS = [
  '大家好，欢迎体验 Jaygo AU 蝉镜数字人工作台。在这里你可以一键合成高质量数字人口播视频！',
  '今天为大家分享 3 个超实用的人工智能工作流，帮助大家在音视频创作中节省 80% 的时间。',
  '感谢大家的关注与支持，如果这个视频对你有帮助，欢迎点赞、收藏并分享给身边的朋友！',
];

export default function AvatarStudio() {
  const { settings, patchSettings, showToast, setTab } = useStore();

  // 凭证配置
  const hasCredentials = Boolean(settings?.chanjingAppId?.trim() && settings?.chanjingSecretKey?.trim());
  const [appIdInput, setAppIdInput] = useState('');
  const [secretKeyInput, setSecretKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  // 形象库
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [avatars, setAvatars] = useState<AvatarItem[]>([]);
  const [avatarFilter, setAvatarFilter] = useState<'all' | 'female' | 'male'>('all');
  const [avatarSearch, setAvatarSearch] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('');
  const [selectedFigureType, setSelectedFigureType] = useState<string>('whole_body');

  // 音色试听
  const [audioPreviewing, setAudioPreviewing] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // 生成参数
  const [driveType, setDriveType] = useState<'tts' | 'audio'>('tts');
  const [scriptText, setScriptText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [speed, setSpeed] = useState<number>(1.0);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [modelQuality, setModelQuality] = useState<number>(0); // 0基础版, 1高质版
  const [showSubtitle, setShowSubtitle] = useState<boolean>(true);

  // 任务状态与轮询
  const [submitting, setSubmitting] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<AvatarVideoTask | null>(null);
  const [downloading, setDownloading] = useState(false);

  // 历史作品视图
  const [activeView, setActiveView] = useState<'create' | 'history'>('create');
  const [historyList, setHistoryList] = useState<AvatarVideoTask[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  // 轮询定时器
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载数字人形象列表
  const fetchAvatars = async () => {
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
    } catch (e: any) {
      showToast(`拉取形象库失败: ${e?.message || '未知错误'}`, 'err');
    } finally {
      setLoadingAvatars(false);
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

  useEffect(() => {
    if (hasCredentials) {
      fetchAvatars();
    }
  }, [hasCredentials]);

  useEffect(() => {
    if (activeView === 'history' && hasCredentials) {
      fetchHistory();
    }
  }, [activeView, hasCredentials]);

  // 选中模特变动时，默认更新体态
  const currentAvatar = useMemo(() => {
    return avatars.find((a) => a.id === selectedAvatarId) || avatars[0] || null;
  }, [avatars, selectedAvatarId]);

  useEffect(() => {
    if (currentAvatar && currentAvatar.figures && currentAvatar.figures.length > 0) {
      const exists = currentAvatar.figures.some((f) => f.type === selectedFigureType);
      if (!exists) {
        setSelectedFigureType(currentAvatar.figures[0].type);
      }
    }
  }, [currentAvatar]);

  // 筛选模特
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

  // 试听原声
  const handleTogglePreviewAudio = (audioUrl?: string) => {
    if (!audioUrl) {
      showToast('该模特暂无可试听的音频', 'info');
      return;
    }
    if (audioPreviewing === audioUrl) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setAudioPreviewing(null);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      const aud = new Audio(audioUrl);
      previewAudioRef.current = aud;
      setAudioPreviewing(audioUrl);
      aud.play().catch(() => {
        showToast('音频试听播放失败', 'err');
        setAudioPreviewing(null);
      });
      aud.onended = () => {
        setAudioPreviewing(null);
      };
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

  // 清除轮询
  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  // 提交生成任务
  const handleCreateVideo = async () => {
    if (!currentAvatar) {
      showToast('请选择一位数字人模特', 'err');
      return;
    }
    if (driveType === 'tts' && !scriptText.trim()) {
      showToast('请输入口播脚本播报文案', 'err');
      return;
    }
    if (driveType === 'audio' && !audioUrl.trim()) {
      showToast('请输入驱动音频 URL 链接', 'err');
      return;
    }

    setSubmitting(true);
    stopPolling();

    try {
      const res = await api.chanjingCreateVideo({
        personId: currentAvatar.id,
        figureType: selectedFigureType,
        driveType,
        text: driveType === 'tts' ? scriptText.trim() : undefined,
        speed,
        audioMan: currentAvatar.audio_man_id,
        wavUrl: driveType === 'audio' ? audioUrl.trim() : undefined,
        aspectRatio,
        model: modelQuality,
        showSubtitle,
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
      showToast('数字人生成任务已创建，正在排队渲染...', 'ok');

      // 启动轮询
      pollTimerRef.current = setInterval(async () => {
        try {
          const task = await api.chanjingQueryVideo(videoId);
          setCurrentTask(task);
          if (task.status === 30) {
            // 成功
            stopPolling();
            setSubmitting(false);
            showToast('🎉 数字人视频合成完成！', 'ok');
          } else if (task.status >= 40) {
            // 失败
            stopPolling();
            setSubmitting(false);
            showToast(`视频合成失败: ${task.msg || '未知异常'}`, 'err');
          }
        } catch (err: any) {
          console.error('Query video task error:', err);
        }
      }, 3000);
    } catch (e: any) {
      showToast(e?.message || '创建任务失败', 'err');
      setSubmitting(false);
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
          Jaygo AU 已深度接入蝉镜 AI 开放平台，支持一键驱动海量真人模特。只需在下方填入 App ID 与 Secret Key 即可开启创作。
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
            输入文案或提供音频，AI 自动合成唇形匹配、动作自然的高清数字人口播视频
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
            <div className="w-full md:w-[58%] h-full overflow-y-auto p-6 space-y-6 border-r border-zinc-200/80 dark:border-zinc-800/80">
              {/* 1. 模特挑选 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="section-title text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span>选择数字人模特</span>
                    {avatars.length > 0 && (
                      <span className="text-xs font-normal text-zinc-400">({avatars.length} 位在线)</span>
                    )}
                  </label>

                  <div className="flex items-center gap-2">
                    {/* 性别筛选 */}
                    <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5 text-xs">
                      {(['all', 'female', 'male'] as const).map((g) => (
                        <button
                          key={g}
                          onClick={() => setAvatarFilter(g)}
                          className={`px-2 py-0.5 rounded transition ${
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
                      className="btn-ghost !p-1.5 text-zinc-500"
                      onClick={fetchAvatars}
                      disabled={loadingAvatars}
                      title="刷新模特库"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loadingAvatars ? 'animate-spin' : ''}>
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* 模特选择卡片网格 */}
                {loadingAvatars ? (
                  <div className="h-44 flex items-center justify-center text-zinc-400 text-xs">
                    正在拉取公共数字人形象库…
                  </div>
                ) : filteredAvatars.length === 0 ? (
                  <div className="h-40 glass flex items-center justify-center text-zinc-400 text-xs">
                    未找到匹配的数字人模特
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-64 overflow-y-auto p-1">
                    {filteredAvatars.map((item) => {
                      const isSelected = item.id === (currentAvatar?.id || selectedAvatarId);
                      const cover = item.figures?.[0]?.cover || '';
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedAvatarId(item.id)}
                          className={`relative rounded-xl border p-2 cursor-pointer transition-all duration-200 text-center group ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20 shadow-md'
                              : 'border-zinc-200/80 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 hover:border-zinc-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          {/* 封面图 */}
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

                {/* 当前选中模特详情 & 体态/试听控制 */}
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

                    {/* 体态姿势选择 */}
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
              </div>

              {/* 2. 播报文案与驱动模式 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="section-title text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span>播报驱动内容</span>
                  </label>

                  <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-md p-0.5 text-xs">
                    <button
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
                      onClick={() => setDriveType('audio')}
                      className={`px-3 py-1 rounded transition ${
                        driveType === 'audio'
                          ? 'bg-white dark:bg-zinc-700 font-medium text-zinc-900 dark:text-zinc-100 shadow-xs'
                          : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      音频链接驱动 (Audio)
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
                  <div className="space-y-2">
                    <input
                      type="url"
                      className="glass-input w-full font-mono text-xs"
                      placeholder="https://example.com/audio.mp3 （需为公开可直接访问的音频直链）"
                      value={audioUrl}
                      onChange={(e) => setAudioUrl(e.target.value)}
                    />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      支持 MP3/WAV 格式公开直链。数字人将根据音频内容自动计算时长并对齐唇形驱动口播。
                    </p>
                  </div>
                )}
              </div>

              {/* 3. 视频参数配置 */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-4">
                <div className="grid grid-cols-3 gap-3">
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
                        9:16 竖屏
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
                        16:9 横屏
                      </button>
                    </div>
                  </div>

                  {/* 渲染品质 */}
                  <div>
                    <label className="label">视频品质</label>
                    <select
                      className="glass-input w-full !text-xs"
                      value={modelQuality}
                      onChange={(e) => setModelQuality(Number(e.target.value))}
                    >
                      <option value={0}>基础版 (渲染更快)</option>
                      <option value={1}>高质版 (面部更高清)</option>
                    </select>
                  </div>

                  {/* 智能字幕 */}
                  <div>
                    <label className="label">视频字幕</label>
                    <label className="flex items-center gap-2 h-8 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showSubtitle}
                        onChange={(e) => setShowSubtitle(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span className="text-xs text-zinc-700 dark:text-zinc-300">自动嵌入字幕</span>
                    </label>
                  </div>
                </div>

                {/* 提交按钮 */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCreateVideo}
                    disabled={submitting || !currentAvatar}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                        <span>数字人合成中，请稍候…</span>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        <span>开始合成数字人视频</span>
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
            <div className="w-full md:w-[42%] h-full bg-zinc-50/60 dark:bg-[#101014] p-6 flex flex-col justify-between overflow-y-auto">
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
                        {currentTask?.queue_desc || 'AI 神经渲染集群正在生成视频...'}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        唇形对齐与表情合成中，预计需 60~120 秒
                      </div>
                    </div>

                    {/* 进度条 */}
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
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
                        className="w-full h-full object-contain"
                      />
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
                    <button
                      type="button"
                      onClick={handleCreateVideo}
                      className="mt-2 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs"
                    >
                      重新尝试
                    </button>
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
                      在左侧挑选形象并输入播报脚本，点击「开始合成」即可在此预览
                    </div>
                  </div>
                )}
              </div>

              {/* 底部小贴士 */}
              <div className="pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60 text-[11px] text-zinc-400 leading-relaxed">
                ℹ️ 蝉镜数字人使用提示：生成的视频支持无水印导出（遵守合规水印规范），链接可在 30 天内随时访问与二次下载。
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
                      {/* 预览图/播放 */}
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

                      {/* 底部信息与动作 */}
                      <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="text-xs font-mono text-zinc-500 truncate">
                            ID: {item.id}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            创建时间: {dateStr}
                          </div>
                        </div>

                        {isSuccess && item.video_url && (
                          <div className="flex gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
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
                          </div>
                        )}
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
            <video src={previewVideoUrl} controls autoPlay className="w-full h-full max-h-[80vh] object-contain" />
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
