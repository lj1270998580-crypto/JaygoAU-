import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { type ParsedMediaInfo } from '../types';

interface ExtractHistoryItem {
  id: string;
  media: ParsedMediaInfo;
  createdAt: number;
}

const STORAGE_KEY = 'jaygo_media_extract_history';

export default function MediaExtractor() {
  const { showToast, setTab, setPendingTranscribe } = useStore();
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentMedia, setCurrentMedia] = useState<ParsedMediaInfo | null>(null);
  const [downloadingType, setDownloadingType] = useState<'video' | 'audio' | 'transcribe' | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExtractHistoryItem[]>([]);

  // 从本地存储加载历史解析记录
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const saveHistory = (item: ParsedMediaInfo) => {
    try {
      const newItem: ExtractHistoryItem = {
        id: Date.now().toString(),
        media: item,
        createdAt: Date.now(),
      };
      const filtered = history.filter((h) => h.media.originalUrl !== item.originalUrl);
      const updated = [newItem, ...filtered].slice(0, 20);
      setHistory(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  };

  const removeHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    showToast('已从历史记录中移除', 'info');
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    showToast('解析历史已清空', 'info');
  };

  // 粘贴剪贴板
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        showToast('剪贴板为空', 'info');
        return;
      }
      setInputText(text);
      showToast('已粘贴剪贴板内容', 'ok');
    } catch {
      showToast('读取剪贴板失败，请手动按 Ctrl+V 粘贴', 'err');
    }
  };

  // 执行解析
  const handleExtract = async (overrideText?: string) => {
    const raw = (overrideText ?? inputText).trim();
    if (!raw) {
      showToast('请先输入或粘贴短视频/媒体分享链接', 'err');
      return;
    }

    setLoading(true);
    setCurrentMedia(null);
    setLastSavedPath(null);
    setExtractError(null);

    try {
      const res = await (window as any).JaygoAPI.extractMedia(raw);
      setCurrentMedia(res);
      saveHistory(res);
      showToast(`成功解析来自「${res.platformName}」的作品！`, 'ok');
    } catch (err: any) {
      const errMsg = err?.message || '解析失败，请检查链接或网络';
      setExtractError(errMsg);
      showToast(errMsg, 'err');
    } finally {
      setLoading(false);
    }
  };

  // 下载视频或音频
  const handleDownload = async (type: 'video' | 'audio') => {
    if (!currentMedia) return;
    setDownloadingType(type);
    setDownloadProgress(0);

    try {
      const res = await (window as any).JaygoAPI.downloadExtractedMedia({
        mediaInfo: currentMedia,
        type,
      });

      if (!res) {
        // 用户取消了保存对话框
        return;
      }

      setLastSavedPath(res.path);
      const sizeMb = (res.size / (1024 * 1024)).toFixed(1);
      showToast(`下载完成！文件大小: ${sizeMb} MB`, 'ok');
    } catch (err: any) {
      showToast(`下载失败: ${err?.message || '未知错误'}`, 'err');
    } finally {
      setDownloadingType(null);
    }
  };

  // 一键发送到视音频转录
  const handleSendToTranscribe = async () => {
    if (!currentMedia) return;
    setDownloadingType('transcribe');

    try {
      showToast('正在提取音频并准备送入转录…', 'info');
      const res = await (window as any).JaygoAPI.extractMediaForTranscribe({
        mediaInfo: currentMedia,
      });

      // 将文件路径设置到全局待转录暂存，并自动切换到转录 Tab
      setPendingTranscribe({
        filePath: res.filePath,
        fileName: res.fileName,
        autoStart: true,
      });
      setTab('transcribe');
      showToast('已跳转到视音频转录，正在自动开启语音大模型识别！', 'ok');
    } catch (err: any) {
      showToast(`提取音频转录失败: ${err?.message || '未知错误'}`, 'err');
    } finally {
      setDownloadingType(null);
    }
  };

  // 在系统文件管理器中查看已下载的文件
  const handleShowInFolder = () => {
    if (lastSavedPath) {
      (window as any).JaygoAPI.showItemInFolder(lastSavedPath);
    }
  };

  // 复制文本
  const copyText = async (txt: string, label: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      showToast(`已复制${label}`, 'ok');
    } catch {
      showToast('复制失败', 'err');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 animate-fade-in text-zinc-900 dark:text-zinc-100">
      {/* 头部标题与支持平台 */}
      <div className="pb-4 mb-6 border-b border-zinc-100 dark:border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-white leading-tight flex items-center gap-2">
            <span>⚡</span>
            <span>多平台短视频 / 媒体无水印提取</span>
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            支持一键解析抖音、哔哩哔哩、快手、小红书与网络音视频直链 · 提取无水印原片 · 抽取 MP3 原声 · 直达文案转写
          </p>
        </div>

        {/* 平台徽标集合 */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0 text-[11px] font-medium">
          <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80">
            🎵 抖音 (去水印)
          </span>
          <span className="px-2 py-0.5 rounded-md bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-300 border border-pink-200/80 dark:border-pink-800/60">
            📺 哔哩哔哩 (B站)
          </span>
          <span className="px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-300 border border-orange-200/80 dark:border-orange-800/60">
            ⚡ 快手
          </span>
          <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60">
            📕 小红书
          </span>
          <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60">
            🌐 网络直链
          </span>
        </div>
      </div>

      {/* 核心输入与解析卡片 */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#141418] p-5 shadow-xs mb-7">
        <div className="relative">
          <textarea
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="请在此粘贴任意带有短视频链接的分享文本或网页链接（例如：抖音分享口令、B站视频链接、快手、小红书或直链）…"
            className="w-full rounded-xl bg-zinc-50/80 dark:bg-[#0c0c0e] border border-zinc-200 dark:border-zinc-800 p-3.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleExtract();
              }
            }}
          />

          {inputText && (
            <button
              onClick={() => setInputText('')}
              className="absolute top-2.5 right-2.5 p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 bg-zinc-200/60 dark:bg-zinc-800/60 text-xs transition"
              title="清空内容"
            >
              ✕
            </button>
          )}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteClipboard}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800/90 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80 transition flex items-center gap-1.5 shadow-2xs"
            >
              <span>📋</span>
              <span>粘贴剪贴板</span>
            </button>

            {inputText && (
              <button
                type="button"
                onClick={() => setInputText('')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-rose-500 transition"
              >
                清空
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-zinc-400 hidden sm:inline">快捷键：Ctrl + Enter 立即解析</span>
            <button
              type="button"
              disabled={loading || !inputText.trim()}
              onClick={() => handleExtract()}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 transition flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>正在深度解析…</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>立即提取</span>
                </>
              )}
            </button>
          </div>
        </div>

        {extractError && (
          <div className="mt-3.5 p-3 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between gap-3 text-xs text-rose-600 dark:text-rose-300 animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 text-sm">⚠️</span>
              <span className="truncate font-medium">{extractError}</span>
            </div>
            <button
              type="button"
              onClick={() => handleExtract()}
              className="shrink-0 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition shadow-xs flex items-center gap-1"
            >
              <span>🔄</span>
              <span>重新解析</span>
            </button>
          </div>
        )}
      </div>

      {/* 解析结果展示视窗 */}
      {currentMedia && (
        <div className="rounded-2xl border border-blue-100 dark:border-blue-950/80 bg-blue-50/20 dark:bg-blue-950/10 p-5 mb-8 shadow-xs animate-fade-in">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-200/60 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white">
                <span>{currentMedia.platformName}</span>
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">解析成功</span>
            </div>

            {lastSavedPath && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ 已保存到本地</span>
                <button
                  type="button"
                  onClick={handleShowInFolder}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 transition"
                >
                  打开所在目录
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* 左侧：封面/媒体播放器预览 */}
            <div className="w-full lg:w-[380px] shrink-0">
              <div className="rounded-xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800 bg-black aspect-video flex items-center justify-center relative group">
                {currentMedia.videoUrl ? (
                  <video
                    key={currentMedia.videoUrl}
                    controls
                    poster={currentMedia.coverUrl}
                    src={currentMedia.videoUrl}
                    className="w-full h-full object-contain"
                  />
                ) : currentMedia.coverUrl ? (
                  <img
                    src={currentMedia.coverUrl}
                    alt={currentMedia.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-zinc-500 text-xs">无媒体画面预览</div>
                )}
              </div>

              {/* 独立音频播放器（若有） */}
              {currentMedia.audioUrl && (
                <div className="mt-3 p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-[#18181c]">
                  <div className="text-[11px] font-medium text-zinc-500 mb-1 flex items-center gap-1">
                    <span>🎵</span>
                    <span>原声伴奏/独立音频试听：</span>
                  </div>
                  <audio controls src={currentMedia.audioUrl} className="w-full h-8" />
                </div>
              )}
            </div>

            {/* 右侧：详细元数据与功能操作区 */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                {/* 标题与复制 */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm sm:text-[15px] font-semibold text-zinc-900 dark:text-white leading-snug break-all line-clamp-3">
                    {currentMedia.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => copyText(currentMedia.title, '标题')}
                    className="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <span>📋</span>
                    <span>复制标题</span>
                  </button>
                </div>

                {/* 作者信息与时长 */}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center gap-2">
                    {currentMedia.authorAvatar && (
                      <img
                        src={currentMedia.authorAvatar}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                      />
                    )}
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{currentMedia.author}</span>
                  </div>

                  {currentMedia.durationSec !== undefined && currentMedia.durationSec > 0 && (
                    <div className="flex items-center gap-1 text-zinc-500">
                      <span>⏱️</span>
                      <span>
                        {Math.floor(currentMedia.durationSec / 60)}分
                        {(currentMedia.durationSec % 60).toString().padStart(2, '0')}秒
                      </span>
                    </div>
                  )}
                </div>

                {/* 图集提示（若是图集作品） */}
                {currentMedia.images && currentMedia.images.length > 0 && (
                  <div className="mt-3 text-xs text-zinc-500 flex items-center gap-1.5">
                    <span>🖼️</span>
                    <span>该作品包含 {currentMedia.images.length} 张高清原图</span>
                  </div>
                )}
              </div>

              {/* 核心动作按钮矩阵 */}
              <div className="mt-6 pt-4 border-t border-zinc-200/60 dark:border-zinc-800/80 flex flex-wrap items-center gap-3">
                {/* 1. 下载无水印视频 */}
                {currentMedia.videoUrl && (
                  <button
                    type="button"
                    disabled={Boolean(downloadingType)}
                    onClick={() => handleDownload('video')}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition flex items-center gap-2 shadow-xs"
                  >
                    {downloadingType === 'video' ? (
                      <>
                        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        <span>下载中…</span>
                      </>
                    ) : (
                      <>
                        <span>🎬</span>
                        <span>下载无水印视频 (MP4)</span>
                      </>
                    )}
                  </button>
                )}

                {/* 2. 提取纯音频 MP3 */}
                <button
                  type="button"
                  disabled={Boolean(downloadingType)}
                  onClick={() => handleDownload('audio')}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-white dark:bg-[#1a1a20] border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 transition flex items-center gap-2 shadow-2xs"
                >
                  {downloadingType === 'audio' ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
                      <span>正在转码 MP3…</span>
                    </>
                  ) : (
                    <>
                      <span>🎵</span>
                      <span>提取纯音频 (MP3)</span>
                    </>
                  )}
                </button>

                {/* 3. 一键发送到视音频转录 */}
                <button
                  type="button"
                  disabled={Boolean(downloadingType)}
                  onClick={handleSendToTranscribe}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition flex items-center gap-2"
                >
                  {downloadingType === 'transcribe' ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                      <span>正在提取音频…</span>
                    </>
                  ) : (
                    <>
                      <span>📝</span>
                      <span>一键转录文案 (ASR 2.0)</span>
                    </>
                  )}
                </button>

                {/* 4. 复制直链 */}
                {currentMedia.videoUrl && (
                  <button
                    type="button"
                    onClick={() => copyText(currentMedia.videoUrl!, '视频直链')}
                    className="px-3 py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition flex items-center gap-1"
                  >
                    <span>🔗</span>
                    <span>复制直链</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 历史解析记录列表 */}
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">最近解析历史</span>
            <span className="text-[11px] px-2 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              {history.length}
            </span>
          </div>

          {history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="text-xs text-zinc-400 hover:text-rose-500 transition"
            >
              清空历史
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800/80 p-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
            暂无解析历史，复制抖音、B站、快手、小红书等短视频分享链接粘贴到上方即可开始！
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {history.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setCurrentMedia(item.media);
                  setLastSavedPath(null);
                }}
                className="group relative rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141418] p-3 hover:border-blue-400 dark:hover:border-blue-600 transition cursor-pointer flex gap-3 items-center shadow-2xs"
              >
                {/* 封面缩略图 */}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 relative">
                  {item.media.coverUrl ? (
                    <img
                      src={item.media.coverUrl}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-lg">🎬</div>
                  )}
                  <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[9px] font-semibold bg-black/70 text-white">
                    {item.media.platformName}
                  </span>
                </div>

                {/* 信息 */}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate leading-snug">
                    {item.media.title}
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate mt-1 flex items-center gap-1.5">
                    <span>{item.media.author}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1">
                    {new Date(item.createdAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {/* 删除此条 */}
                <button
                  type="button"
                  onClick={(e) => removeHistoryItem(item.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition absolute top-2 right-2"
                  title="删除此记录"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
