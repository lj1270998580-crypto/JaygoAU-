import React from 'react';
import {
  Layers,
  Sparkles,
  Type,
  Palette,
  Sliders,
  Check,
} from 'lucide-react';
import type { CanvasConfig, CanvasRatio, BackgroundType } from '../../lib/talkEditor/types';

interface CanvasSettingsPanelProps {
  config: CanvasConfig;
  onChangeConfig: (newConfig: CanvasConfig) => void;
}

export const CanvasSettingsPanel: React.FC<CanvasSettingsPanelProps> = ({
  config,
  onChangeConfig,
}) => {
  const updateTopPatch = (partial: Partial<CanvasConfig['topPatch']>) => {
    onChangeConfig({
      ...config,
      topPatch: { ...config.topPatch, ...partial },
    });
  };

  const updateBottomPatch = (partial: Partial<CanvasConfig['bottomPatch']>) => {
    onChangeConfig({
      ...config,
      bottomPatch: { ...config.bottomPatch, ...partial },
    });
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs select-none">
      {/* 1. 画布比例与横转竖 */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span>目标画布画幅比例</span>
        </label>
        <div className="grid grid-cols-5 gap-1.5 bg-zinc-900/80 p-1.5 rounded-xl border border-zinc-800">
          {(['9:16', '16:9', '1:1', '4:5', '3:4'] as CanvasRatio[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChangeConfig({ ...config, aspectRatio: r })}
              className={`py-2 rounded-lg text-center font-mono font-bold transition cursor-pointer flex flex-col items-center justify-center ${
                config.aspectRatio === r
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <span className="text-xs">{r}</span>
              <span className="text-[9px] opacity-75 font-normal mt-0.5">
                {r === '9:16' ? '竖屏' : r === '16:9' ? '横屏' : r === '1:1' ? '方屏' : r === '3:4' ? '小红书' : '流媒体'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. 背景模式 (毛玻璃 vs 纯色) */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-zinc-300 flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-purple-400" />
          <span>上下边缘背景填充 (留白处理)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeConfig({ ...config, backgroundType: 'blur' })}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              config.backgroundType === 'blur'
                ? 'bg-purple-950/40 border-purple-500/80 text-white ring-1 ring-purple-500/40'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs">✨ 毛玻璃模糊</span>
              {config.backgroundType === 'blur' && <Check className="w-3 h-3 text-purple-400" />}
            </div>
            <span className="text-[10px] text-zinc-500 mt-1">原片高斯模糊铺底，自媒体标配</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeConfig({ ...config, backgroundType: 'color' })}
            className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
              config.backgroundType === 'color'
                ? 'bg-purple-950/40 border-purple-500/80 text-white ring-1 ring-purple-500/40'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs">🎨 极简纯色</span>
              {config.backgroundType === 'color' && <Check className="w-3 h-3 text-purple-400" />}
            </div>
            <span className="text-[10px] text-zinc-500 mt-1">沉稳黑/商务灰/极简色调</span>
          </button>
        </div>

        {config.backgroundType === 'color' && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-zinc-400">背景颜色:</span>
            {['#000000', '#18181b', '#0f172a', '#27272a', '#f4f4f5'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChangeConfig({ ...config, backgroundColor: c })}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full border-2 transition cursor-pointer ${
                  config.backgroundColor === c ? 'border-indigo-400 scale-110 shadow' : 'border-zinc-700'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 3. 顶部大标题贴片 */}
      <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-amber-400" />
            <span>顶部主标题贴片</span>
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.topPatch.enabled}
              onChange={(e) => updateTopPatch({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500" />
          </label>
        </div>

        {config.topPatch.enabled && (
          <div className="space-y-2 pt-1">
            <input
              type="text"
              value={config.topPatch.text}
              onChange={(e) => updateTopPatch({ text: e.target.value })}
              placeholder="例如：3分钟搞懂自媒体爆款逻辑"
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
              <span>字号 ({config.topPatch.fontSize || 26}px)</span>
              <input
                type="range"
                min={18}
                max={42}
                step={1}
                value={config.topPatch.fontSize || 26}
                onChange={(e) => updateTopPatch({ fontSize: parseInt(e.target.value, 10) })}
                className="w-32 h-1 accent-amber-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. 底部标语/副标题贴片 */}
      <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-sky-400" />
            <span>底部标语贴片</span>
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.bottomPatch.enabled}
              onChange={(e) => updateBottomPatch({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-sky-500" />
          </label>
        </div>

        {config.bottomPatch.enabled && (
          <div className="space-y-2 pt-1">
            <input
              type="text"
              value={config.bottomPatch.text}
              onChange={(e) => updateBottomPatch({ text: e.target.value })}
              placeholder="例如：关注我 · 每天分享一个自媒体搞钱技巧"
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-sky-500"
            />
            <div className="flex items-center justify-between text-[10.5px] text-zinc-400">
              <span>字号 ({config.bottomPatch.fontSize || 18}px)</span>
              <input
                type="range"
                min={14}
                max={30}
                step={1}
                value={config.bottomPatch.fontSize || 18}
                onChange={(e) => updateBottomPatch({ fontSize: parseInt(e.target.value, 10) })}
                className="w-32 h-1 accent-sky-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. 画面缩放微调 */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px] text-zinc-300 font-bold">
          <span className="flex items-center gap-1">
            <Sliders className="w-3 h-3 text-zinc-400" />
            <span>主画面缩放与留白比例</span>
          </span>
          <span className="font-mono text-zinc-400 font-normal">
            {((config.videoScale || 1.0) * 100).toFixed(0)}%
          </span>
        </div>
        <input
          type="range"
          min={0.6}
          max={1.3}
          step={0.05}
          value={config.videoScale || 1.0}
          onChange={(e) => onChangeConfig({ ...config, videoScale: parseFloat(e.target.value) })}
          className="w-full h-1 accent-indigo-500 bg-zinc-700 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
          <span>60% (大贴片留白)</span>
          <span>100% (标准无缝铺宽)</span>
          <span>130% (放大裁剪)</span>
        </div>
      </div>
    </div>
  );
};
