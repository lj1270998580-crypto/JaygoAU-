// =========================================================================
// useAdaptiveColumns —— 三栏工作台自适应栏宽 Hook
//
// 解决的问题（v0.7.6）：
// 各工作室（视频配插图 / AI 文案工坊 / 定时流水线 / 蝉镜数字人）此前都是
// 「内联固定 px + shrink-0」的左右栏，父容器又是 overflow-hidden。
// 以插图板块为例：左 330 + 分隔 6 + 中 320(min) + 分隔 6 + 右 370 = 1032px，
// 而默认窗口 1180 减去侧栏 196 只剩 984px —— 默认尺寸下就已经溢出 48px，
// 最小窗口 980 时溢出 248px，右栏被直接裁掉且没有滚动条。
//
// 本 Hook 提供：
// 1. ResizeObserver 实时感知容器宽度
// 2. 栏宽按可用空间自动收缩（先压右栏 → 再压左栏），永不溢出
// 3. 三栏 / 双栏 / 专注舞台 三种布局模式，并在窄窗口自动降级
// 4. 栏宽与模式持久化到 localStorage
// =========================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

export type StudioLayoutMode = 'three' | 'two' | 'focus';

export interface AdaptiveColumnsOptions {
  /** localStorage 键前缀，用于区分不同工作室 */
  storageKey: string;
  defaultLeft: number;
  defaultRight: number;
  minLeft: number;
  maxLeft: number;
  minRight: number;
  maxRight: number;
  /** 中栏（舞台）最小宽度 */
  minCenter: number;
  /** 分隔条总像素宽 */
  dividerTotal?: number;
  /** 容器宽度低于此值时自动降为双栏（隐藏右栏） */
  twoColumnBelow?: number;
  /** 容器宽度低于此值时自动降为专注舞台（只留中栏） */
  focusBelow?: number;
}

export interface AdaptiveColumnsResult {
  containerRef: RefObject<HTMLDivElement>;
  containerWidth: number;
  /** 用户选择的模式 */
  mode: StudioLayoutMode;
  /** 实际生效的模式（受当前宽度约束自动降级） */
  effectiveMode: StudioLayoutMode;
  setMode: (m: StudioLayoutMode) => void;
  leftWidth: number;
  rightWidth: number;
  /** 是否处于被压缩状态（用于提示用户） */
  squeezed: boolean;
  startResize: (side: 'left' | 'right', e: ReactMouseEvent | ReactPointerEvent) => void;
  resizingSide: 'left' | 'right' | null;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 依据容器宽度决定实际生效的布局模式（窄窗口自动降级）
 */
export function computeEffectiveMode(params: {
  containerWidth: number;
  mode: StudioLayoutMode;
  twoColumnBelow: number;
  focusBelow: number;
}): StudioLayoutMode {
  const { containerWidth, mode, twoColumnBelow, focusBelow } = params;
  if (containerWidth > 0 && containerWidth < focusBelow) return 'focus';
  if (containerWidth > 0 && containerWidth < twoColumnBelow) {
    return mode === 'focus' ? 'focus' : 'two';
  }
  return mode;
}

/**
 * 依据可用空间计算最终栏宽，保证「左栏 + 分隔 + 中栏 + 分隔 + 右栏」永不溢出容器。
 * 压缩优先级：先压右栏至下限，再压左栏至下限。
 */
export function computeColumnWidths(params: {
  containerWidth: number;
  effectiveMode: StudioLayoutMode;
  prefLeft: number;
  prefRight: number;
  minLeft: number;
  maxLeft: number;
  minRight: number;
  maxRight: number;
  minCenter: number;
  dividerTotal: number;
}): { leftWidth: number; rightWidth: number; squeezed: boolean } {
  const {
    containerWidth, effectiveMode, prefLeft, prefRight,
    minLeft, maxLeft, minRight, maxRight, minCenter, dividerTotal,
  } = params;

  if (containerWidth <= 0) {
    return { leftWidth: prefLeft, rightWidth: prefRight, squeezed: false };
  }
  if (effectiveMode === 'focus') {
    return { leftWidth: 0, rightWidth: 0, squeezed: false };
  }
  if (effectiveMode === 'two') {
    const maxLeftForTwo = Math.max(minLeft, containerWidth - dividerTotal - minCenter);
    const l = clamp(Math.min(prefLeft, maxLeftForTwo), minLeft, maxLeft);
    return { leftWidth: l, rightWidth: 0, squeezed: l < prefLeft };
  }

  const available = containerWidth - dividerTotal - minCenter;
  let l = clamp(prefLeft, minLeft, maxLeft);
  let r = clamp(prefRight, minRight, maxRight);
  let didSqueeze = false;

  if (l + r > available) {
    const over = l + r - available;
    const rShrink = Math.min(over, Math.max(0, r - minRight));
    if (rShrink > 0) {
      r -= rShrink;
      didSqueeze = true;
    }
    const remaining = over - rShrink;
    if (remaining > 0) {
      const lShrink = Math.min(remaining, Math.max(0, l - minLeft));
      if (lShrink > 0) {
        l -= lShrink;
        didSqueeze = true;
      }
    }
  }

  // 防御性兜底：即便左右栏都压到最小宽度仍放不下时，直接隐藏右栏。
  // 正常情况下 computeEffectiveMode 会先降级，这里只用于保证「任何配置下都不溢出」。
  if (l + r > available) {
    r = 0;
    l = clamp(Math.min(l, available), minLeft, maxLeft);
    didSqueeze = true;
  }

  return { leftWidth: Math.round(l), rightWidth: Math.round(r), squeezed: didSqueeze };
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function readMode(key: string, fallback: StudioLayoutMode): StudioLayoutMode {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'three' || raw === 'two' || raw === 'focus') return raw;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function useAdaptiveColumns(options: AdaptiveColumnsOptions): AdaptiveColumnsResult {
  const {
    storageKey,
    defaultLeft,
    defaultRight,
    minLeft,
    maxLeft,
    minRight,
    maxRight,
    minCenter,
    dividerTotal = 12,
    twoColumnBelow = 1100,
    focusBelow = 860,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [resizingSide, setResizingSide] = useState<'left' | 'right' | null>(null);

  const widthKey = `${storageKey}_widths`;
  const modeKey = `${storageKey}_mode`;

  // 用户偏好栏宽（拖动后的目标值，不随窗口变化而改写）
  const [prefLeft, setPrefLeft] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(widthKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.left === 'number') return clamp(parsed.left, minLeft, maxLeft);
        if (typeof parsed?.right === 'number') return defaultLeft;
      }
    } catch {
      /* ignore */
    }
    return defaultLeft;
  });
  const [prefRight, setPrefRight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(widthKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.right === 'number') return clamp(parsed.right, minRight, maxRight);
      }
    } catch {
      /* ignore */
    }
    return defaultRight;
  });
  const [mode, setModeState] = useState<StudioLayoutMode>(() => readMode(modeKey, 'three'));

  // 持久化
  useEffect(() => {
    try {
      localStorage.setItem(widthKey, JSON.stringify({ left: prefLeft, right: prefRight }));
    } catch {
      /* ignore */
    }
  }, [prefLeft, prefRight, widthKey]);

  useEffect(() => {
    try {
      localStorage.setItem(modeKey, mode);
    } catch {
      /* ignore */
    }
  }, [mode, modeKey]);

  // ResizeObserver 实时测量容器宽度
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 依据宽度决定实际生效的模式
  const effectiveMode: StudioLayoutMode = computeEffectiveMode({
    containerWidth,
    mode,
    twoColumnBelow,
    focusBelow,
  });

  // 依据可用空间计算最终栏宽（纯函数，便于单测）
  const { leftWidth, rightWidth, squeezed } = computeColumnWidths({
    containerWidth,
    effectiveMode,
    prefLeft,
    prefRight,
    minLeft,
    maxLeft,
    minRight,
    maxRight,
    minCenter,
    dividerTotal,
  });

  // 拖动调整栏宽（对可用空间做实时钳制，避免拖出可视范围）
  const startResize = useCallback(
    (side: 'left' | 'right', e: ReactMouseEvent | ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startLeft = leftWidth;
      const startRight = rightWidth;
      setResizingSide(side);

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const avail = Math.max(0, containerWidth - dividerTotal - minCenter);

        if (side === 'left') {
          const next = clamp(startLeft + delta, minLeft, maxLeft);
          const otherWidth = effectiveMode === 'three' ? startRight : 0;
          const maxAllowed = Math.max(minLeft, avail - otherWidth);
          setPrefLeft(clamp(next, minLeft, Math.min(maxLeft, maxAllowed)));
        } else {
          // 右栏向左拖动为变宽
          const next = clamp(startRight - delta, minRight, maxRight);
          const maxAllowed = Math.max(minRight, avail - startLeft);
          setPrefRight(clamp(next, minRight, Math.min(maxRight, maxAllowed)));
        }
      };

      const onUp = () => {
        setResizingSide(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [containerWidth, dividerTotal, minCenter, minLeft, maxLeft, minRight, maxRight, leftWidth, rightWidth, effectiveMode]
  );

  const setMode = useCallback((m: StudioLayoutMode) => setModeState(m), []);

  return {
    containerRef,
    containerWidth,
    mode,
    effectiveMode,
    setMode,
    leftWidth,
    rightWidth,
    squeezed,
    startResize,
    resizingSide,
  };
}
