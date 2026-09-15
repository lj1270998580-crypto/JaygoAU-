import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Layers,
  Zap,
  Type,
  Eye,
  EyeOff,
  Sliders,
  UploadCloud,
  Move,
  Plus,
  Minus,
  X,
  RotateCcw,
  Sparkles,
  Scissors,
  Edit3,
  Image as ImageIcon,
} from 'lucide-react';
import type {
  CanvasConfig,
  CanvasRatio,
  CutSegment,
  SubtitleItem,
  SubtitleStyleConfig,
  SubtitleTemplateId,
  CustomStickerPatch,
} from '../../lib/talkEditor/types';
import { getDeletedIntervals } from '../../lib/talkEditor/audioSilenceScanner';
import { SUBTITLE_TEMPLATES } from '../../lib/talkEditor/subtitleTemplates';
import { TITLE_STYLE_PRESETS } from '../../lib/talkEditor/titleTemplates';
import { useStore } from '../../store';

interface CanvasMonitorProps {
  videoSrc: string;
  videoDuration: number;
  currentTime: number;
  onSeek: (timeSec: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  canvasConfig: CanvasConfig;
  onChangeCanvasConfig?: (config: CanvasConfig) => void;
  onChangeCanvasRatio: (ratio: CanvasRatio) => void;
  subtitleConfig: SubtitleStyleConfig;
  onChangeSubtitleConfig?: (config: SubtitleStyleConfig) => void;
  subtitles: SubtitleItem[];
  segments: CutSegment[];
  videoDimensions: { width: number; height: number };
  onVideoLoaded?: (dim: { width: number; height: number; duration: number }) => void;
  onDropVideoFile?: (file: File) => void;
  onUpdateSubtitleText?: (subtitleId: string, newText: string) => void;
  onSplitSegmentAtTime?: (timeSec: number) => void;
}

export const CanvasMonitor: React.FC<CanvasMonitorProps> = ({
  videoSrc,
  videoDuration,
  currentTime,
  onSeek,
  isPlaying,
  onTogglePlay,
  canvasConfig,
  onChangeCanvasConfig,
  onChangeCanvasRatio,
  subtitleConfig,
  onChangeSubtitleConfig,
  subtitles,
  segments,
  videoDimensions,
  onVideoLoaded,
  onDropVideoFile,
  onUpdateSubtitleText,
  onSplitSegmentAtTime,
}) => {
  const { theme, showToast } = useStore();
  const isDark = theme !== 'light';

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickerFileInputRef = useRef<HTMLInputElement>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [isMonitorDragOver, setIsMonitorDragOver] = useState<boolean>(false);

  // 🌟 当前在预览框中被激活/选中的交互图层 ('none' | 'subtitle' | 'title' | 'sticker')
  const [selectedLayer, setSelectedLayer] = useState<'none' | 'subtitle' | 'title' | 'sticker'>('none');
  const [hoveredLayer, setHoveredLayer] = useState<'none' | 'subtitle' | 'title' | 'sticker'>('none');

  // 🌟 选中具体哪一张贴片
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  // 🌟 字幕原地编辑状态
  const [isEditingSubtitleText, setIsEditingSubtitleText] = useState<boolean>(false);
  const [subtitleEditText, setSubtitleEditText] = useState<string>('');

  // 🌟 动态跟踪监视器画布真实物理像素宽度，实现等比缩放字号 (杜绝中/小窗口下字号过大挤压断成2字一列)
  const [containerWidth, setContainerWidth] = useState<number>(360);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) setContainerWidth(w);
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 核心比例因子：以 380px 宽度为基准 1.0x (最小 0.45x，最大 1.3x)
  const fontScale = useMemo(() => {
    return Math.min(1.3, Math.max(0.45, containerWidth / 380));
  }, [containerWidth]);

  // 预览用字幕字号 (随窗口/监视器宽度平滑等比缩放)
  const previewSubtitleFontSize = useMemo(() => {
    return Math.max(12, Math.min(30, Math.round((subtitleConfig.fontSize || 24) * fontScale)));
  }, [subtitleConfig.fontSize, fontScale]);

  // 预览用大标题字号
  const previewTitleFontSize = useMemo(() => {
    return Math.max(13, Math.min(32, Math.round((canvasConfig.topPatch.fontSize || 26) * fontScale)));
  }, [canvasConfig.topPatch.fontSize, fontScale]);

  // 预览用底部标语字号
  const previewBottomFontSize = useMemo(() => {
    return Math.max(10, Math.min(20, Math.round((canvasConfig.bottomPatch.fontSize || 16) * fontScale)));
  }, [canvasConfig.bottomPatch.fontSize, fontScale]);

  // 🌟 多贴片数据聚合 (优先使用 stickers 列表，兼容 stickerPatch 单贴片)
  const activeStickers: CustomStickerPatch[] = useMemo(() => {
    if (canvasConfig.stickers && canvasConfig.stickers.length > 0) {
      return canvasConfig.stickers;
    }
    if (canvasConfig.stickerPatch?.imageUrl) {
      return [
        {
          ...canvasConfig.stickerPatch,
          id: canvasConfig.stickerPatch.id || 'sticker-primary',
        },
      ];
    }
    return [];
  }, [canvasConfig.stickers, canvasConfig.stickerPatch]);

  // 🌟 多张本地图片贴片上传处理逻辑 (支持同时选中多张或多次追加上传)
  const handleUploadStickerFiles = (files: FileList | File[]) => {
    if (!onChangeCanvasConfig) return;
    const fileArr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;

    let currentList = [...activeStickers];
    let loadedCount = 0;

    fileArr.forEach((file, fIdx) => {
      const localPath = (window as any).electronAPI?.getPathForFile
        ? (window as any).electronAPI.getPathForFile(file)
        : (file as any).path || '';

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          const newId = `sticker-${Date.now()}-${fIdx}-${Math.random().toString(36).slice(2, 6)}`;
          const defaultX = Number((0.35 + (currentList.length % 3) * 0.18).toFixed(2));
          const defaultY = Number((0.25 + (Math.floor(currentList.length / 3) % 3) * 0.18).toFixed(2));

          const newSticker: CustomStickerPatch = {
            id: newId,
            enabled: true,
            imageUrl: dataUrl,
            localPath: localPath || '',
            name: file.name,
            xPercent: defaultX,
            yPercent: defaultY,
            scale: 1.0,
            aspectRatio: img.width / Math.max(1, img.height),
            opacity: 1.0,
          };
          currentList = [...currentList, newSticker];
          loadedCount++;
          if (loadedCount === fileArr.length) {
            onChangeCanvasConfig({
              ...canvasConfig,
              stickers: currentList,
              stickerPatch: currentList[0],
            });
            setSelectedStickerId(newId);
            setSelectedLayer('sticker');
            showToast(`已成功载入 ${fileArr.length} 张贴片，点击任意角可自由缩放`, 'ok');
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  // 🌟 删除单个指定贴片
  const handleDeleteSticker = (stickerId?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!stickerId || !onChangeCanvasConfig) return;
    const nextList = activeStickers.filter((s) => s.id !== stickerId);
    onChangeCanvasConfig({
      ...canvasConfig,
      stickers: nextList,
      stickerPatch: nextList[0] || undefined,
    });
    if (selectedStickerId === stickerId) {
      setSelectedStickerId(null);
      setSelectedLayer('none');
    }
  };

  // 计算所有被删除的时间片段 (包含整句与字词级)
  const deletedIntervals = useMemo(() => getDeletedIntervals(segments), [segments]);

  // 计算被切除的总时长
  const totalDeletedSec = useMemo(() => {
    return deletedIntervals.reduce((acc, it) => acc + (it.end - it.start), 0);
  }, [deletedIntervals]);

  // 跳过已删片段开关 (只要有切除内容，默认开启跳切试听)
  const [autoSkipDeleted, setAutoSkipDeleted] = useState<boolean>(true);

  // 当有新删除区间产生时，自动激活跳切试听
  useEffect(() => {
    if (deletedIntervals.length > 0) {
      setAutoSkipDeleted(true);
    }
  }, [deletedIntervals.length]);

  // 画布画幅宽高比字符串 (CSS aspect-ratio)
  const aspectCss = canvasConfig.aspectRatio.replace(':', ' / ');

  // 同步外部播放指针
  useEffect(() => {
    if (!videoRef.current || isScrubbing) return;
    if (Math.abs(videoRef.current.currentTime - currentTime) > 0.18) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime, isScrubbing]);

  // 同步播放/暂停状态
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  // 🌟 核心跳切引擎：60fps 帧精细检测与瞬移跳过已切除片段 (比 HTML5 onTimeUpdate 灵敏 15 倍)
  useEffect(() => {
    if (!isPlaying || !autoSkipDeleted || deletedIntervals.length === 0) return;

    let animId: number;
    const checkAndSkip = () => {
      const video = videoRef.current;
      if (video && !video.paused) {
        const cur = video.currentTime;
        // 检查当前或未来 35ms 即将撞上的切除区间 (带提前量，彻底消灭剪掉片段的微小杂音)
        const hit = deletedIntervals.find(
          (it) =>
            (cur >= it.start && cur < it.end) ||
            (cur < it.start && cur + 0.035 >= it.start && cur + 0.035 < it.end)
        );
        if (hit) {
          const nextTarget = hit.end + 0.005;
          // 🌟 尾部刹车保护：如果当前切除区间延伸至视频末尾（或下个目标已超总时长）
          if (hit.end >= videoDuration - 0.08 || nextTarget >= videoDuration) {
            video.pause();
            // 刹车停在切除区间起点稍前 20ms，彻底消除伸手关镜头/咳嗽杂音
            const stopPoint = Math.max(0, hit.start - 0.02);
            video.currentTime = stopPoint;
            onSeek(stopPoint);
            return;
          }

          video.currentTime = nextTarget;
          onSeek(nextTarget);
        }
      }
      animId = requestAnimationFrame(checkAndSkip);
    };

    animId = requestAnimationFrame(checkAndSkip);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, autoSkipDeleted, deletedIntervals, videoDuration, onSeek]);

  // 播放器开始播放瞬移安全校验
  const handleTogglePlay = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      if (videoRef.current.paused && autoSkipDeleted && deletedIntervals.length > 0) {
        const hit = deletedIntervals.find((it) => cur >= it.start && cur < it.end);
        if (hit) {
          if (hit.end >= videoDuration - 0.08) {
            // 如果已经在末尾被删区间，跳转回开头
            videoRef.current.currentTime = 0;
            onSeek(0);
          } else {
            videoRef.current.currentTime = hit.end + 0.005;
            onSeek(hit.end + 0.005);
          }
        }
      }
    }
    onTogglePlay();
  };

  // 视频帧更新
  const handleTimeUpdate = () => {
    if (videoRef.current && !isScrubbing) {
      onSeek(videoRef.current.currentTime);
    }
  };

  // 单轨声学切片拖拽定位逻辑
  const handleTrackMouseDown = (e: React.MouseEvent) => {
    if (!trackRef.current || videoDuration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * videoDuration;

    setIsScrubbing(true);
    if (videoRef.current) videoRef.current.currentTime = targetTime;
    onSeek(targetTime);

    const onMouseMove = (moveEvt: MouseEvent) => {
      const moveRatio = Math.max(0, Math.min(1, (moveEvt.clientX - rect.left) / rect.width));
      const moveTarget = moveRatio * videoDuration;
      if (videoRef.current) videoRef.current.currentTime = moveTarget;
      onSeek(moveTarget);
    };

    const onMouseUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 当前激活的字幕 (计算当前时间戳落在哪句字幕)
  const activeSubtitle = useMemo(() => {
    if (!subtitles || subtitles.length === 0) return null;
    return (
      subtitles.find((sub) => currentTime >= sub.startTime && currentTime <= sub.endTime) || null
    );
  }, [subtitles, currentTime]);

  const isSubtitleActive = Boolean(activeSubtitle?.text);
  const isSubtitleHoveredOrSelected = selectedLayer === 'subtitle' || hoveredLayer === 'subtitle';

  // 🌟 字幕显示条件：
  // 1. 用户主动关闭 (subtitleConfig.visible === false) 时绝不显示；
  // 2. 正在播放中 (isPlaying)：仅在台词发音区间 (isSubtitleActive) 或鼠标悬停/拖拽时显示；
  // 3. 暂停播放时 (!isPlaying)：保持显示当前句/邻近句（无字幕时显示占位预览句），方便用户在画面中随时拖拽调位与字号。
  const shouldShowSubtitle =
    subtitleConfig.visible !== false &&
    (isSubtitleActive || !isPlaying || isSubtitleHoveredOrSelected);

  // 幽灵预览状态 (未命中当前台词区间但处于暂停/预览调位状态)
  const isGhostSubtitle = !isSubtitleActive;

  const displaySubtitleText = useMemo(() => {
    if (activeSubtitle?.text) return activeSubtitle.text;
    if (subtitles && subtitles.length > 0) {
      const nearest = subtitles.reduce((prev, curr) => {
        return Math.abs(curr.startTime - currentTime) < Math.abs(prev.startTime - currentTime)
          ? curr
          : prev;
      }, subtitles[0]);
      return nearest?.text || subtitles[0].text;
    }
    return '口播字幕样式与位置预览';
  }, [activeSubtitle, subtitles, currentTime]);

  // 🌟 标题预设样式解析
  const activeTitlePreset = useMemo(() => {
    const presetId = canvasConfig.topPatch.stylePreset || 'viral_yellow';
    return TITLE_STYLE_PRESETS.find((p) => p.id === presetId) || TITLE_STYLE_PRESETS[0];
  }, [canvasConfig.topPatch.stylePreset]);

  // 🌟 1. 拖拽调节字幕位置与联动 (鼠标在预览框直接拖拽，调一个联动所有)
  const handleSubtitleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedLayer('subtitle');
    if (!containerRef.current || !onChangeSubtitleConfig) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startBottomPercent = subtitleConfig.yPercent ?? 0.18;
    const startXPercent = subtitleConfig.xPercent ?? 0.5;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dy = moveEvt.clientY - startY;
      const dx = moveEvt.clientX - startX;
      // 距底部高度：向上拖动 dy < 0，yPercent 增大
      const newY = Math.max(0.04, Math.min(0.68, startBottomPercent - dy / rect.height));
      // 水平位置：向右拖动 dx > 0，xPercent 增大
      const newX = Math.max(0.15, Math.min(0.85, startXPercent + dx / rect.width));

      onChangeSubtitleConfig({
        ...subtitleConfig,
        yPercent: Number(newY.toFixed(3)),
        xPercent: Number(newX.toFixed(3)),
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 🌟 调节字幕字号大小 (增减 delta px，全局联动生效)
  const handleSubtitleFontSizeChange = (delta: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!onChangeSubtitleConfig) return;
    const cur = subtitleConfig.fontSize || 24;
    const next = Math.max(14, Math.min(54, cur + delta));
    onChangeSubtitleConfig({
      ...subtitleConfig,
      fontSize: next,
    });
  };

  // 🌟 2. 拖拽调节大标题位置与大小
  const handleTitleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedLayer('title');
    if (!containerRef.current || !onChangeCanvasConfig) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startYOffset = canvasConfig.topPatch.yOffsetPercent ?? 0.06;
    const startXOffset = canvasConfig.topPatch.xOffsetPercent ?? 0.5;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dy = moveEvt.clientY - startY;
      const dx = moveEvt.clientX - startX;
      // 距顶部高度：向下拖动 dy > 0，yOffsetPercent 增大
      const newY = Math.max(0.02, Math.min(0.5, startYOffset + dy / rect.height));
      const newX = Math.max(0.15, Math.min(0.85, startXOffset + dx / rect.width));

      onChangeCanvasConfig({
        ...canvasConfig,
        topPatch: {
          ...canvasConfig.topPatch,
          yOffsetPercent: Number(newY.toFixed(3)),
          xOffsetPercent: Number(newX.toFixed(3)),
        },
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 🌟 调节大标题字号大小
  const handleTitleFontSizeChange = (delta: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!onChangeCanvasConfig) return;
    const cur = canvasConfig.topPatch.fontSize || 26;
    const next = Math.max(16, Math.min(52, cur + delta));
    onChangeCanvasConfig({
      ...canvasConfig,
      topPatch: {
        ...canvasConfig.topPatch,
        fontSize: next,
      },
    });
  };

  // 🌟 3. 拖拽调节指定贴片位置 (支持多张贴片，自由平移)
  const handleStickerMouseDown = (stickerId: string | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!stickerId) return;
    setSelectedLayer('sticker');
    setSelectedStickerId(stickerId);
    if (!containerRef.current || !onChangeCanvasConfig) return;

    const target = activeStickers.find((s) => s.id === stickerId);
    if (!target) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startXPercent = target.xPercent ?? 0.5;
    const startYPercent = target.yPercent ?? 0.3;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;
      const newX = Math.max(0.02, Math.min(0.98, startXPercent + dx / rect.width));
      const newY = Math.max(0.02, Math.min(0.98, startYPercent + dy / rect.height));

      const updated = activeStickers.map((s) =>
        s.id === stickerId ? { ...s, xPercent: Number(newX.toFixed(3)), yPercent: Number(newY.toFixed(3)) } : s
      );
      onChangeCanvasConfig({
        ...canvasConfig,
        stickers: updated,
        stickerPatch: updated[0] || undefined,
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 🌟 贴片 4 角自由无级缩放手柄控制 (无上限限制，支持 0.08 ~ 10.0+ 缩放)
  const handleStickerCornerResize = (
    stickerId: string | undefined,
    corner: 'nw' | 'ne' | 'sw' | 'se',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!stickerId || !containerRef.current || !onChangeCanvasConfig) return;

    const target = activeStickers.find((s) => s.id === stickerId);
    if (!target) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startScale = target.scale ?? 1.0;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = moveEvt.clientX - startX;
      const dy = moveEvt.clientY - startY;

      // 根据拉伸角计算距离增量
      let delta = 0;
      if (corner === 'se') {
        delta = (dx + dy) / 2;
      } else if (corner === 'sw') {
        delta = (-dx + dy) / 2;
      } else if (corner === 'ne') {
        delta = (dx - dy) / 2;
      } else if (corner === 'nw') {
        delta = (-dx - dy) / 2;
      }

      // 彻底放开缩放上限，支持 0.08 到 10.0+ 自由无极调整
      const nextScale = Math.max(0.08, startScale + delta / (rect.width * 0.25));

      const updated = activeStickers.map((s) =>
        s.id === stickerId ? { ...s, scale: Number(nextScale.toFixed(2)) } : s
      );
      onChangeCanvasConfig({
        ...canvasConfig,
        stickers: updated,
        stickerPatch: updated[0] || undefined,
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 🌟 启动字幕在位改字
  const handleStartEditSubtitle = () => {
    if (activeSubtitle) {
      setSubtitleEditText(activeSubtitle.text || '');
      setIsEditingSubtitleText(true);
    } else if (displaySubtitleText) {
      setSubtitleEditText(displaySubtitleText);
      setIsEditingSubtitleText(true);
    }
  };

  // 🌟 字幕原地编辑保存逻辑
  const handleSaveSubtitleText = () => {
    setIsEditingSubtitleText(false);
    const trimmed = subtitleEditText.trim();
    if (!trimmed) return;
    if (activeSubtitle && onUpdateSubtitleText) {
      onUpdateSubtitleText(activeSubtitle.id, trimmed);
      showToast('字幕文本已更新', 'ok');
    }
  };

  // 🌟 在当前播放点一键切分字幕
  const handleSplitSubtitleAtPlayhead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeSubtitle || !onSplitSegmentAtTime) return;
    onSplitSegmentAtTime(currentTime);
  };

  // 轮换下一个字幕模版
  const cycleSubtitleTemplate = () => {
    if (!onChangeSubtitleConfig) return;
    const currentIndex = SUBTITLE_TEMPLATES.findIndex((t) => t.id === subtitleConfig.templateId);
    const nextIndex = (currentIndex + 1) % SUBTITLE_TEMPLATES.length;
    const nextTemplate = SUBTITLE_TEMPLATES[nextIndex];
    onChangeSubtitleConfig({
      ...subtitleConfig,
      ...nextTemplate.defaultConfig,
    });
  };

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 生成时间刻度标尺点 (按 5 或 10 秒等分)
  const timelineTicks = useMemo(() => {
    if (videoDuration <= 0) return [];
    const step = videoDuration > 180 ? 30 : videoDuration > 60 ? 15 : videoDuration > 20 ? 5 : 2;
    const ticks: number[] = [];
    for (let t = 0; t <= videoDuration; t += step) {
      ticks.push(t);
    }
    return ticks;
  }, [videoDuration]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsMonitorDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsMonitorDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsMonitorDragOver(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
          if (imageFiles.length > 0) {
            handleUploadStickerFiles(imageFiles);
          } else {
            onDropVideoFile?.(files[0]);
          }
        }
      }}
      className={`h-full flex flex-col select-none overflow-hidden text-xs relative ${
        isDark ? 'bg-[#0e0f15] text-zinc-200' : 'bg-zinc-100 text-zinc-800'
      }`}
    >
      {/* 隐藏的贴片文件选择 input (支持多选) */}
      <input
        ref={stickerFileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) handleUploadStickerFiles(files);
          e.target.value = '';
        }}
      />

      {/* 监视器拖拽投放遮罩 */}
      {isMonitorDragOver && (
        <div className="absolute inset-0 z-50 bg-indigo-950/80 border-2 border-dashed border-indigo-400 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4 pointer-events-none animate-in fade-in">
          <UploadCloud className="w-12 h-12 text-indigo-300 animate-bounce mb-2" />
          <div className="text-sm font-bold text-white">释放鼠标以更换视频或载入贴片图片 (支持多张)</div>
        </div>
      )}

      {/* 顶部简明比例调节与字幕模版微调栏 */}
      <div
        className={`px-2.5 py-1.5 border-b flex items-center justify-between gap-1.5 shrink-0 min-w-0 overflow-x-auto no-scrollbar ${
          isDark ? 'bg-[#12131b] border-zinc-800/80' : 'bg-white border-zinc-200'
        }`}
      >
        {/* 画布比例快捷切换 */}
        <div className="flex items-center gap-1 shrink-0">
          {(['9:16', '16:9', '1:1', '4:3'] as CanvasRatio[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChangeCanvasRatio(r)}
              className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] transition cursor-pointer ${
                canvasConfig.aspectRatio === r
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : isDark
                  ? 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                  : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 border border-zinc-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* 核心功能：贴片上传 + 标题开关 + 跳切试听 + 字幕控制 + 模版 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 🌟 1. 自定义贴片 (Logo/水印) 快捷上传按钮 (支持多张无限制) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => stickerFileInputRef.current?.click()}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition cursor-pointer ${
                activeStickers.length > 0
                  ? isDark
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-xs'
                  : isDark
                  ? 'bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border-indigo-500/40 shadow-xs'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-300 shadow-xs'
              }`}
              title="点击上传图片贴片 (支持多张、无大小限制，全片覆盖并保留到插图与剪映)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{activeStickers.length > 0 ? `贴片 (${activeStickers.length})` : '+ 上传贴片'}</span>
            </button>
          </div>

          {/* 🌟 2. 顶部主标题开关 */}
          {onChangeCanvasConfig && (
            <button
              type="button"
              onClick={() => {
                onChangeCanvasConfig({
                  ...canvasConfig,
                  topPatch: {
                    ...canvasConfig.topPatch,
                    enabled: !canvasConfig.topPatch.enabled,
                  },
                });
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition cursor-pointer ${
                canvasConfig.topPatch.enabled
                  ? isDark
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                    : 'bg-amber-50 text-amber-700 border-amber-300 shadow-xs'
                  : isDark
                  ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                  : 'bg-zinc-100 text-zinc-500 border-zinc-300 hover:text-zinc-800'
              }`}
              title={canvasConfig.topPatch.enabled ? '点击隐藏顶部主标题' : '点击开启顶部爆款大标题'}
            >
              <Type className="w-3 h-3 text-amber-400" />
              <span>{canvasConfig.topPatch.enabled ? '标题已开' : '大标题'}</span>
            </button>
          )}

          {/* 跳切试听开关 */}
          <button
            type="button"
            onClick={() => setAutoSkipDeleted(!autoSkipDeleted)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium border transition cursor-pointer ${
              autoSkipDeleted
                ? isDark
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-xs'
                  : 'bg-amber-50 text-amber-700 border-amber-200 shadow-xs'
                : isDark
                ? 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'
                : 'bg-zinc-100 text-zinc-400 border-zinc-300 hover:text-zinc-600'
            }`}
            title="跳切试听：开启后播放时将以 60fps 实时跳过所有已切除字词与气口"
          >
            <Zap className={`w-3 h-3 ${autoSkipDeleted ? 'fill-current' : ''}`} />
            <span>跳切</span>
          </button>

          {/* 字幕显隐开关 - 单个图标按钮切换 */}
          {onChangeSubtitleConfig && (
            <>
              <button
                type="button"
                onClick={() =>
                  onChangeSubtitleConfig({
                    ...subtitleConfig,
                    visible: subtitleConfig.visible === false ? true : false,
                  })
                }
                className={`p-1 rounded-md border text-[10px] transition cursor-pointer flex items-center justify-center ${
                  subtitleConfig.visible !== false
                    ? isDark
                      ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40 shadow-xs'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs'
                    : isDark
                    ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    : 'bg-zinc-100 text-zinc-400 border-zinc-300'
                }`}
                title={subtitleConfig.visible !== false ? '点击隐藏画面动态字幕' : '点击显示画面动态字幕'}
              >
                {subtitleConfig.visible !== false ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>

              {/* 模版轮换 */}
              <button
                type="button"
                onClick={cycleSubtitleTemplate}
                className={`text-[10.5px] px-2 py-0.5 rounded-md font-medium flex items-center gap-1 transition cursor-pointer border ${
                  isDark
                    ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-transparent'
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                }`}
                title="点击快速切换下一个字幕模版"
              >
                <Type className="w-3 h-3" />
                <span>
                  {SUBTITLE_TEMPLATES.find((t) => t.id === subtitleConfig.templateId)?.name.slice(0, 4) ||
                    '模版'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 中间舞台：真实比例画布监视器视窗 (极速单视频，60fps满帧) */}
      <div
        className="flex-1 flex items-center justify-center p-3 min-h-0 overflow-hidden relative"
        onClick={() => setSelectedLayer('none')}
      >
        <div
          ref={containerRef}
          style={{ aspectRatio: aspectCss }}
          className={`relative max-h-full max-w-full bg-black rounded-xl overflow-hidden shadow-2xl flex items-center justify-center group ${
            isDark ? 'border border-zinc-800' : 'border border-zinc-300'
          }`}
        >
          {/* 背景层：暗色高雅氛围 */}
          {canvasConfig.backgroundType === 'blur' ? (
            <div className="absolute inset-0 overflow-hidden pointer-events-none bg-gradient-to-b from-[#181a24] via-[#0f1017] to-black">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent" />
            </div>
          ) : (
            <div
              style={{ backgroundColor: canvasConfig.backgroundColor || '#09090b' }}
              className="absolute inset-0 pointer-events-none"
            />
          )}

          {/* 前景视频主体 (单一原生 <video>) */}
          <div
            style={{
              transform: `scale(${canvasConfig.videoScale || 1.0}) translateY(${
                canvasConfig.videoYPercent || 0
              }%)`,
              zIndex: 1,
            }}
            className="relative w-full flex items-center justify-center transition-transform"
          >
            {videoSrc ? (
              <video
                ref={videoRef}
                src={videoSrc}
                muted={isMuted}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  onVideoLoaded?.({
                    width: v.videoWidth,
                    height: v.videoHeight,
                    duration: v.duration,
                  });
                }}
                onClick={handleTogglePlay}
                className="w-full max-h-full object-contain block cursor-pointer shadow-lg"
              />
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-500 gap-2">
                <UploadCloud className="w-8 h-8 text-zinc-600" />
                <span className="text-xs">拖入或在左侧导入口播视频素材</span>
              </div>
            )}
          </div>

          {/* 🌟 1. 顶部主标题贴片 (置于贴片之上，但低于字幕) */}
          {canvasConfig.topPatch.enabled && canvasConfig.topPatch.text && (
            <div
              style={{
                top: `${(canvasConfig.topPatch.yOffsetPercent ?? 0.06) * 100}%`,
                left: `${(canvasConfig.topPatch.xOffsetPercent ?? 0.5) * 100}%`,
                transform: 'translate(-50%, 0)',
                zIndex: selectedLayer === 'title' || hoveredLayer === 'title' ? 38 : 35,
              }}
              onMouseEnter={() => setHoveredLayer('title')}
              onMouseLeave={() => setHoveredLayer('none')}
              onMouseDown={handleTitleMouseDown}
              className={`absolute flex flex-col items-center cursor-move transition-shadow ${
                selectedLayer === 'title' || hoveredLayer === 'title'
                  ? 'ring-2 ring-amber-400/90 rounded-xl shadow-2xl'
                  : ''
              }`}
            >
              {/* 标题悬浮控制条 (大小调节、复位居中) */}
              {(selectedLayer === 'title' || hoveredLayer === 'title') && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="mb-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-900/90 border border-amber-500/60 shadow-xl backdrop-blur-md text-[10px] text-amber-200 animate-in fade-in"
                >
                  <Move className="w-3 h-3 text-amber-400" />
                  <span className="font-bold">标题</span>
                  <div className="h-3 w-px bg-zinc-700 mx-0.5" />
                  <button
                    type="button"
                    onClick={(e) => handleTitleFontSizeChange(-2, e)}
                    className="p-0.5 hover:bg-zinc-700 rounded text-zinc-300 hover:text-white cursor-pointer"
                    title="缩小标题字号"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="font-mono text-[10px] min-w-[28px] text-center">
                    {canvasConfig.topPatch.fontSize || 26}px
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleTitleFontSizeChange(+2, e)}
                    className="p-0.5 hover:bg-zinc-700 rounded text-zinc-300 hover:text-white cursor-pointer"
                    title="放大标题字号"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <div className="h-3 w-px bg-zinc-700 mx-0.5" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeCanvasConfig?.({
                        ...canvasConfig,
                        topPatch: { ...canvasConfig.topPatch, xOffsetPercent: 0.5 },
                      });
                    }}
                    className="px-1 py-0.2 hover:bg-zinc-700 rounded text-[9px] text-amber-300 cursor-pointer"
                    title="恢复水平居中"
                  >
                    居中
                  </button>
                </div>
              )}

              <div
                style={{
                  background:
                    canvasConfig.topPatch.backgroundColor ||
                    activeTitlePreset.defaultConfig.backgroundColor,
                  color: canvasConfig.topPatch.textColor || activeTitlePreset.defaultConfig.textColor,
                  fontSize: `${previewTitleFontSize}px`,
                  borderRadius: `${Math.round(
                    (canvasConfig.topPatch.borderRadius ?? activeTitlePreset.defaultConfig.borderRadius) * fontScale
                  )}px`,
                  fontWeight:
                    canvasConfig.topPatch.fontWeight || activeTitlePreset.defaultConfig.fontWeight,
                  border: activeTitlePreset.defaultConfig.border,
                  boxShadow: activeTitlePreset.defaultConfig.boxShadow,
                  textShadow: activeTitlePreset.defaultConfig.textShadow,
                  backdropFilter: activeTitlePreset.defaultConfig.backdropFilter,
                  padding: `${Math.round(4 * fontScale)}px ${Math.round(12 * fontScale)}px`,
                  maxWidth: `${Math.round(containerWidth * 0.88)}px`,
                  whiteSpace: (canvasConfig.topPatch.text || '').length <= 16 ? 'nowrap' : 'normal',
                  wordBreak: 'break-word',
                }}
                className="text-center truncate select-none transition-all"
              >
                {canvasConfig.topPatch.text}
              </div>
            </div>
          )}

          {/* 底部副标语贴片 (置于普通贴片之上，低于字幕) */}
          {canvasConfig.bottomPatch.enabled && canvasConfig.bottomPatch.text && (
            <div
              style={{
                bottom: `${(canvasConfig.bottomPatch.yOffsetPercent ?? 0.05) * 100}%`,
                zIndex: 32,
              }}
              className="absolute inset-x-4 flex justify-center pointer-events-none"
            >
              <div
                style={{
                  backgroundColor: canvasConfig.bottomPatch.backgroundColor || 'rgba(0,0,0,0.65)',
                  color: canvasConfig.bottomPatch.textColor || '#d4d4d8',
                  fontSize: `${previewBottomFontSize}px`,
                  borderRadius: `${Math.round((canvasConfig.bottomPatch.borderRadius || 8) * fontScale)}px`,
                  padding: `${Math.round(3 * fontScale)}px ${Math.round(8 * fontScale)}px`,
                  maxWidth: `${Math.round(containerWidth * 0.88)}px`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                className="shadow-lg text-center truncate border border-white/5"
              >
                {canvasConfig.bottomPatch.text}
              </div>
            </div>
          )}

          {/* 🌟 2. 自定义全片贴片 (Logo/水印/图片) 渲染与交互 (层级 z-20 ~ z-28，绝不遮挡标语与字幕) */}
          {activeStickers.map((sticker) => {
            if (!sticker.enabled || !sticker.imageUrl) return null;
            const isStickerSelected =
              (selectedLayer === 'sticker' && selectedStickerId === sticker.id) ||
              (hoveredLayer === 'sticker' && selectedStickerId === sticker.id);
            // 基础宽度以容器 30% 为基准，乘以自由 scale，绝不死卡 180px 上限！
            const baseW = Math.max(36, containerWidth * 0.30);
            const stickerW = Math.round(baseW * (sticker.scale ?? 1.0));

            return (
              <div
                key={sticker.id}
                style={{
                  left: `${(sticker.xPercent ?? 0.5) * 100}%`,
                  top: `${(sticker.yPercent ?? 0.3) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  opacity: sticker.opacity ?? 1.0,
                  zIndex: isStickerSelected ? 25 : 20,
                  width: `${stickerW}px`,
                }}
                onMouseEnter={() => setHoveredLayer('sticker')}
                onMouseLeave={() => {
                  if (selectedStickerId !== sticker.id) {
                    setHoveredLayer('none');
                  }
                }}
                onMouseDown={(e) => handleStickerMouseDown(sticker.id, e)}
                className={`absolute group/sticker cursor-move select-none ${
                  isStickerSelected
                    ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-black/60 rounded-lg shadow-2xl'
                    : 'hover:ring-1 hover:ring-indigo-400/50 rounded-lg'
                }`}
              >
                {/* 外置悬浮删除按钮 (浮在贴片外上方右侧，绝不遮挡图片内容) */}
                {isStickerSelected && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSticker(sticker.id, e)}
                    className="absolute -top-3 -right-3 w-5 h-5 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg flex items-center justify-center cursor-pointer transition hover:scale-110 z-28"
                    title="移除此贴片"
                  >
                    <X className="w-3 h-3 stroke-[2.5]" />
                  </button>
                )}

                {/* 贴片图片本体 */}
                <img
                  src={sticker.imageUrl}
                  alt={sticker.name || '贴片'}
                  className="w-full h-auto object-contain drop-shadow-md pointer-events-none rounded"
                  draggable={false}
                />

                {/* 4 角无级缩放手柄 (精致白色圆角，按住任意角自由缩放，层级 z-26，绝不遮挡字幕) */}
                {isStickerSelected && (
                  <>
                    <div
                      onMouseDown={(e) => handleStickerCornerResize(sticker.id, 'nw', e)}
                      className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-xs cursor-nwse-resize shadow hover:scale-125 transition-transform z-26"
                      title="按住拖拽自由等比缩放"
                    />
                    <div
                      onMouseDown={(e) => handleStickerCornerResize(sticker.id, 'ne', e)}
                      className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-xs cursor-nesw-resize shadow hover:scale-125 transition-transform z-26"
                      title="按住拖拽自由等比缩放"
                    />
                    <div
                      onMouseDown={(e) => handleStickerCornerResize(sticker.id, 'sw', e)}
                      className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-xs cursor-nesw-resize shadow hover:scale-125 transition-transform z-26"
                      title="按住拖拽自由等比缩放"
                    />
                    <div
                      onMouseDown={(e) => handleStickerCornerResize(sticker.id, 'se', e)}
                      className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-xs cursor-nwse-resize shadow hover:scale-125 transition-transform z-26"
                      title="按住拖拽自由等比缩放"
                    />
                  </>
                )}
              </div>
            );
          })}

          {/* 🌟 3. 实时口播字幕叠层渲染 (置于最顶层 z-40 ~ z-46，微工具条与改字弹窗 z-50 ~ z-55，永不被任何贴片遮挡) */}
          {shouldShowSubtitle && (
            <div
              style={{
                bottom: `${(subtitleConfig.yPercent ?? 0.18) * 100}%`,
                left: `${(subtitleConfig.xPercent ?? 0.5) * 100}%`,
                transform: 'translate(-50%, 0)',
                opacity: isGhostSubtitle ? 0.85 : 1.0,
                zIndex: selectedLayer === 'subtitle' || hoveredLayer === 'subtitle' ? 46 : 40,
                width: 'max-content',
                maxWidth: `${Math.round(containerWidth * 0.90)}px`,
              }}
              onMouseEnter={() => setHoveredLayer('subtitle')}
              onMouseLeave={() => setHoveredLayer('none')}
              onMouseDown={handleSubtitleMouseDown}
              className={`absolute flex flex-col items-center justify-center text-center cursor-move transition-all ${
                selectedLayer === 'subtitle' || hoveredLayer === 'subtitle'
                  ? 'ring-2 ring-indigo-400/90 ring-offset-2 ring-offset-black/50 rounded-xl shadow-2xl'
                  : ''
              }`}
            >
              {/* 字幕悬浮微工具条 (拖拽指示、改字、字号加减、一键居中、切分) */}
              {(selectedLayer === 'subtitle' || hoveredLayer === 'subtitle') && !isEditingSubtitleText && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="mb-1.5 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-950/95 border border-indigo-500/60 shadow-2xl backdrop-blur-md text-[10px] text-indigo-200 animate-in fade-in select-none"
                >
                  <Move className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span className="font-bold shrink-0">字幕</span>
                  <div className="h-3 w-px bg-zinc-700 mx-0.5" />

                  {/* ✏️ 行内改字按钮 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditSubtitle();
                    }}
                    className="flex items-center gap-0.5 px-1.5 py-0.2 hover:bg-zinc-800 text-indigo-300 hover:text-white rounded cursor-pointer"
                    title="修改当前这句字幕的文字内容 (也可直接双击文字)"
                  >
                    <Edit3 className="w-3 h-3 text-indigo-400" />
                    <span>改字</span>
                  </button>

                  <div className="h-3 w-px bg-zinc-700 mx-0.5" />

                  {/* ✂️ 在当前播放点切分字幕 */}
                  {isSubtitleActive && onSplitSegmentAtTime && (
                    <>
                      <button
                        type="button"
                        onClick={handleSplitSubtitleAtPlayhead}
                        className="flex items-center gap-0.5 px-1.5 py-0.2 hover:bg-zinc-800 text-amber-300 hover:text-white rounded cursor-pointer"
                        title="在当前播放头时间位置，将这句字幕一分为二拆分为两句"
                      >
                        <Scissors className="w-3 h-3 text-amber-400" />
                        <span>切分</span>
                      </button>
                      <div className="h-3 w-px bg-zinc-700 mx-0.5" />
                    </>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleSubtitleFontSizeChange(-2, e)}
                    className="p-0.5 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white cursor-pointer"
                    title="缩小字幕字号"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="font-mono text-[10px] min-w-[28px] text-center font-bold">
                    {subtitleConfig.fontSize || 24}px
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleSubtitleFontSizeChange(+2, e)}
                    className="p-0.5 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white cursor-pointer"
                    title="放大字幕字号"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <div className="h-3 w-px bg-zinc-700 mx-0.5" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeSubtitleConfig?.({ ...subtitleConfig, xPercent: 0.5 });
                    }}
                    className="px-1 py-0.2 hover:bg-zinc-800 rounded text-[9px] text-indigo-300 cursor-pointer"
                    title="恢复水平正中对齐"
                  >
                    居中
                  </button>
                  {isGhostSubtitle && (
                    <span className="text-[9px] text-zinc-500 ml-1">（位置预览）</span>
                  )}
                </div>
              )}

              {/* 🌟 行内双击编辑输入框 */}
              {isEditingSubtitleText ? (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="p-1 rounded-xl bg-zinc-950/95 border-2 border-indigo-500 shadow-2xl flex flex-col items-center gap-1.5 z-50 min-w-[240px]"
                >
                  <input
                    type="text"
                    autoFocus
                    value={subtitleEditText}
                    onChange={(e) => setSubtitleEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveSubtitleText();
                      } else if (e.key === 'Escape') {
                        setIsEditingSubtitleText(false);
                      }
                    }}
                    className="w-full bg-zinc-900 px-3 py-1.5 rounded-lg border border-indigo-500/50 text-white font-bold text-center text-xs focus:outline-none"
                    placeholder="输入修改后的字幕文本..."
                  />
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-zinc-400">回车保存 · ESC 取消</span>
                    <button
                      type="button"
                      onClick={handleSaveSubtitleText}
                      className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer shadow"
                    >
                      完成
                    </button>
                  </div>
                </div>
              ) : (
                /* 字幕不同模版渲染 (支持双击原地编辑文字) */
                <div
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleStartEditSubtitle();
                  }}
                  title="双击直接编辑字幕文字"
                  className="cursor-pointer"
                >
                  {subtitleConfig.templateId === 'pill_badge' ? (
                    <div
                      style={{
                        backgroundColor: subtitleConfig.boxColor || '#fbbf24',
                        color: subtitleConfig.textColor || '#000000',
                        fontSize: `${previewSubtitleFontSize}px`,
                        borderRadius: `${Math.round(8 * fontScale)}px`,
                        lineHeight: 1.35,
                        padding: `${Math.round(4 * fontScale)}px ${Math.round(12 * fontScale)}px`,
                        maxWidth: `${Math.round(containerWidth * 0.88)}px`,
                        whiteSpace:
                          displaySubtitleText.length <= 16 && !displaySubtitleText.includes('\n')
                            ? 'nowrap'
                            : 'normal',
                        wordBreak: 'break-word',
                        display: 'inline-block',
                      }}
                      className="font-bold shadow-lg"
                    >
                      {displaySubtitleText}
                    </div>
                  ) : subtitleConfig.templateId === 'karaoke' ? (
                    <div
                      style={{
                        fontSize: `${previewSubtitleFontSize}px`,
                        color: subtitleConfig.textColor || '#ffffff',
                        WebkitTextStroke: `${Math.max(1, (subtitleConfig.strokeWidth || 2) * fontScale)}px ${
                          subtitleConfig.strokeColor || '#000000'
                        }`,
                        paintOrder: 'stroke fill',
                        lineHeight: 1.35,
                        padding: `${Math.round(3 * fontScale)}px ${Math.round(8 * fontScale)}px`,
                        maxWidth: `${Math.round(containerWidth * 0.88)}px`,
                        whiteSpace:
                          displaySubtitleText.length <= 16 && !displaySubtitleText.includes('\n')
                            ? 'nowrap'
                            : 'normal',
                        wordBreak: 'break-word',
                        display: 'inline-block',
                      }}
                      className="font-extrabold tracking-wide drop-shadow-md text-amber-300"
                    >
                      {displaySubtitleText}
                    </div>
                  ) : subtitleConfig.templateId === 'clean_white' ? (
                    <div
                      style={{
                        fontSize: `${previewSubtitleFontSize}px`,
                        color: '#ffffff',
                        WebkitTextStroke: `${Math.max(1, (subtitleConfig.strokeWidth || 1.5) * fontScale)}px ${
                          subtitleConfig.strokeColor || '#000000'
                        }`,
                        paintOrder: 'stroke fill',
                        lineHeight: 1.35,
                        padding: `${Math.round(3 * fontScale)}px ${Math.round(8 * fontScale)}px`,
                        maxWidth: `${Math.round(containerWidth * 0.88)}px`,
                        whiteSpace:
                          displaySubtitleText.length <= 16 && !displaySubtitleText.includes('\n')
                            ? 'nowrap'
                            : 'normal',
                        wordBreak: 'break-word',
                        display: 'inline-block',
                      }}
                      className="font-medium tracking-wider drop-shadow"
                    >
                      {displaySubtitleText}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: `${previewSubtitleFontSize}px`,
                        color: subtitleConfig.textColor || '#ffffff',
                        WebkitTextStroke: `${Math.max(1, (subtitleConfig.strokeWidth || 2.5) * fontScale)}px ${
                          subtitleConfig.strokeColor || '#000000'
                        }`,
                        paintOrder: 'stroke fill',
                        lineHeight: 1.35,
                        padding: `${Math.round(3 * fontScale)}px ${Math.round(8 * fontScale)}px`,
                        maxWidth: `${Math.round(containerWidth * 0.88)}px`,
                        whiteSpace:
                          displaySubtitleText.length <= 16 && !displaySubtitleText.includes('\n')
                            ? 'nowrap'
                            : 'normal',
                        wordBreak: 'break-word',
                        display: 'inline-block',
                        textShadow: '0 2px 10px rgba(0,0,0,0.85)',
                      }}
                      className="font-black tracking-wide drop-shadow-lg"
                    >
                      {displaySubtitleText}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 底部紧凑单轨波形与播放控制条 */}
      <div
        className={`border-t p-2.5 space-y-2 shrink-0 ${
          isDark ? 'bg-[#111218] border-zinc-800/90' : 'bg-white border-zinc-200'
        }`}
      >
        {/* 时间刻度标尺 */}
        {videoDuration > 0 && (
          <div className="flex justify-between px-1 text-[9px] font-mono text-zinc-500 select-none">
            {timelineTicks.map((t, idx) => (
              <span key={idx}>{formatTime(t)}</span>
            ))}
          </div>
        )}

        {/* 单轨声学切片能量条 */}
        <div
          ref={trackRef}
          onMouseDown={handleTrackMouseDown}
          className={`h-7 w-full rounded-lg border relative cursor-pointer overflow-hidden select-none shadow-inner ${
            isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-100 border-zinc-300'
          }`}
          title="点击或拖拽播放指针快速定位"
        >
          {/* 渲染切片块 */}
          {videoDuration > 0 &&
            segments.map((seg) => {
              const leftPercent = Math.max(0, (seg.startTime / videoDuration) * 100);
              const widthPercent = Math.max(0.1, ((seg.endTime - seg.startTime) / videoDuration) * 100);

              const hasDeletedWord = seg.words?.some((w) => w.isDeleted);
              const isFullyDeleted = seg.isDeleted;

              return (
                <div
                  key={seg.id}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    backgroundImage: isFullyDeleted
                      ? 'repeating-linear-gradient(45deg, rgba(225, 29, 72, 0.25), rgba(225, 29, 72, 0.25) 4px, rgba(159, 18, 57, 0.45) 4px, rgba(159, 18, 57, 0.45) 8px)'
                      : undefined,
                  }}
                  className={`absolute top-0 bottom-0 transition-colors ${
                    isFullyDeleted
                      ? 'border-r border-rose-900/60 opacity-60'
                      : hasDeletedWord
                      ? 'bg-amber-600/70 border-r border-amber-500'
                      : seg.deleteReason === 'silence'
                      ? isDark
                        ? 'bg-zinc-900'
                        : 'bg-zinc-200'
                      : 'bg-indigo-600/80 hover:bg-indigo-500 border-r border-indigo-700/60'
                  }`}
                  title={`${seg.text} (${(seg.endTime - seg.startTime).toFixed(1)}s)`}
                />
              );
            })}

          {/* 贯穿式高亮播放头与发光指针 */}
          {videoDuration > 0 && (
            <div
              style={{
                left: `${Math.min(100, Math.max(0, (currentTime / videoDuration) * 100))}%`,
              }}
              className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-30 shadow-[0_0_8px_#ffffff]"
            >
              <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-white rounded-full border-2 border-indigo-600 shadow" />
            </div>
          )}
        </div>

        {/* 播放控制按钮组与时间戳显示 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow transition cursor-pointer flex items-center justify-center"
              title="播放 / 暂停 (快捷键: 空格 或 K)"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => {
                const nextTime = Math.max(0, currentTime - 3);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
                onSeek(nextTime);
              }}
              className={`p-1.5 rounded-md border transition cursor-pointer ${
                isDark
                  ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200'
                  : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-700 shadow-xs'
              }`}
              title="后退 3 秒 (快捷键: J 或 ←)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const nextTime = Math.min(videoDuration, currentTime + 3);
                if (videoRef.current) videoRef.current.currentTime = nextTime;
                onSeek(nextTime);
              }}
              className={`p-1.5 rounded-md border transition cursor-pointer ${
                isDark
                  ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200'
                  : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-700 shadow-xs'
              }`}
              title="快进 3 秒 (快捷键: L 或 →)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono font-bold ml-1 text-xs shrink-0 whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </span>

            {/* 🌟 实时跳切已开启提示（移至底部控制条，完全不遮挡视频画面，且防挤压） */}
            {autoSkipDeleted && totalDeletedSec > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10.5px] text-amber-400 font-medium shrink-0 whitespace-nowrap select-none animate-in fade-in ml-1">
                <Zap className="w-3 h-3 text-amber-400 fill-amber-400 animate-pulse shrink-0" />
                <span>实时跳切中 · -{totalDeletedSec.toFixed(1)}s</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-[10px] hidden xl:inline ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              快捷键: 空格播放 · J/L快进倒退
            </span>

            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className={`p-1.5 opacity-70 hover:opacity-100 transition cursor-pointer ${
                isDark ? 'hover:text-indigo-400 text-zinc-300' : 'hover:text-indigo-600 text-zinc-600'
              }`}
              title={isMuted ? '取消静音' : '静音'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasMonitor;
