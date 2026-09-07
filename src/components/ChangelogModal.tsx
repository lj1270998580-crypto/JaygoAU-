import React, { useState } from 'react';
import { CHANGELOGS, ChangelogItem } from '../data/changelogs';
import { useStore } from '../store';
import {
  Sparkles,
  Zap,
  Bug,
  History,
  X,
  CheckCircle2,
  ArrowDownToLine,
  RefreshCw,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

type FilterType = 'all' | 'features' | 'improvements' | 'fixes';

export function ChangelogModal({ open, onClose }: Props) {
  const { appVersion, update, downloadUpdate, quitInstallUpdate, checkUpdates } = useStore();
  const [filter, setFilter] = useState<FilterType>('all');

  if (!open) return null;

  const currentVer = appVersion || '0.5.9';
  const hasNewVer = Boolean(update.available && update.available.version !== currentVer);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in">
      <div
        className="w-full max-w-3xl bg-white dark:bg-[#121319] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-start justify-between bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-500/30 dark:to-purple-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/50 dark:border-blue-800/50 shadow-inner">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  版本更新时间线 (Changelog)
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  当前运行 v{currentVer}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                查看 Jaygo AU 每个版本的迭代记录、新功能探索与性能优化细节
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition cursor-pointer"
            title="关闭更新日志"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 检测到新版本时的醒目横幅 */}
        {hasNewVer && (
          <div className="px-5 py-3 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-blue-600/5 border-b border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
              <div>
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  发现新版本可用：v{update.available?.version}
                </span>
                {update.available?.releaseNotes && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 ml-2">
                    {typeof update.available.releaseNotes === 'string'
                      ? update.available.releaseNotes
                      : '包含最新功能特性与稳定性加固'}
                  </span>
                )}
              </div>
            </div>

            <div>
              {update.downloaded ? (
                <button
                  onClick={quitInstallUpdate}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>重启完成升级</span>
                </button>
              ) : (
                <button
                  onClick={downloadUpdate}
                  className="btn-modern-primary px-3 py-1.5 text-xs"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>{update.progress > 0 ? `正在下载 ${Math.round(update.progress)}%` : `立即下载 v${update.available?.version}`}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 筛选标签栏 */}
        <div className="px-6 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-white dark:bg-[#121319]">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-zinc-400 text-[11px] mr-1">分类筛选:</span>
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                filter === 'all'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              全部记录
            </button>
            <button
              onClick={() => setFilter('features')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                filter === 'features'
                  ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Sparkles className="w-3 h-3 text-purple-500" />
              <span>新功能</span>
            </button>
            <button
              onClick={() => setFilter('improvements')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                filter === 'improvements'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Zap className="w-3 h-3 text-blue-500" />
              <span>优化</span>
            </button>
            <button
              onClick={() => setFilter('fixes')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 cursor-pointer ${
                filter === 'fixes'
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Bug className="w-3 h-3 text-rose-500" />
              <span>修复</span>
            </button>
          </div>

          <div className="text-[11px] text-zinc-400 font-mono">
            共收录 {CHANGELOGS.length} 个版本节点
          </div>
        </div>

        {/* 时间线内容滚动区域 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 select-text">
          <div className="relative pl-6 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-8 ml-2">
            {CHANGELOGS.map((item, idx) => {
              const isCurrent = item.version === currentVer;

              // 根据筛选类型判定是否展示
              const hasF = item.features && item.features.length > 0;
              const hasI = item.improvements && item.improvements.length > 0;
              const hasX = item.fixes && item.fixes.length > 0;

              if (filter === 'features' && !hasF) return null;
              if (filter === 'improvements' && !hasI) return null;
              if (filter === 'fixes' && !hasX) return null;

              return (
                <div key={item.version} className="relative group">
                  {/* 时间线指示圆点 */}
                  <div
                    className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      isCurrent
                        ? 'bg-emerald-500 border-emerald-300 dark:border-emerald-700 ring-4 ring-emerald-500/20'
                        : item.isLatest
                        ? 'bg-blue-500 border-blue-300 dark:border-blue-700 ring-3 ring-blue-500/20'
                        : 'bg-zinc-300 dark:bg-zinc-700 border-white dark:border-[#121319]'
                    }`}
                  />

                  {/* 版本头部卡片 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100">
                        v{item.version}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          当前版本
                        </span>
                      )}
                      {item.isLatest && !isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                          最新版
                        </span>
                      )}
                      <span className="text-xs text-zinc-400 font-mono">{item.date}</span>
                    </div>

                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      {item.title}
                    </span>
                  </div>

                  {/* 详细条目列表 */}
                  <div className="rounded-xl p-4 bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/70 dark:border-zinc-800/80 space-y-3.5 text-xs leading-relaxed">
                    {/* ✨ 新功能 */}
                    {(filter === 'all' || filter === 'features') && hasF && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1 uppercase tracking-wider">
                          <Sparkles className="w-3 h-3" />
                          <span>新特性与功能 (Features)</span>
                        </div>
                        <ul className="space-y-1.5 pl-3">
                          {item.features!.map((feat, fIdx) => (
                            <li
                              key={fIdx}
                              className="text-zinc-700 dark:text-zinc-300 list-disc marker:text-purple-500 leading-relaxed"
                            >
                              {feat}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* ⚡ 体验优化 */}
                    {(filter === 'all' || filter === 'improvements') && hasI && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 uppercase tracking-wider">
                          <Zap className="w-3 h-3" />
                          <span>体验优化与增强 (Improvements)</span>
                        </div>
                        <ul className="space-y-1.5 pl-3">
                          {item.improvements!.map((imp, iIdx) => (
                            <li
                              key={iIdx}
                              className="text-zinc-700 dark:text-zinc-300 list-disc marker:text-blue-500 leading-relaxed"
                            >
                              {imp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 🐛 问题修复 */}
                    {(filter === 'all' || filter === 'fixes') && hasX && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 uppercase tracking-wider">
                          <Bug className="w-3 h-3" />
                          <span>问题修复 (Bug Fixes)</span>
                        </div>
                        <ul className="space-y-1.5 pl-3">
                          {item.fixes!.map((fix, xIdx) => (
                            <li
                              key={xIdx}
                              className="text-zinc-700 dark:text-zinc-300 list-disc marker:text-rose-500 leading-relaxed"
                            >
                              {fix}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span>遇到问题或有新建议？欢迎访问</span>
            <a
              href="https://github.com/chenb0309/JaygoAU/issues"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
            >
              <span>GitHub Issues</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => checkUpdates()}
              disabled={update.checking}
              className="btn-modern-ghost text-xs px-3 py-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${update.checking ? 'animate-spin' : ''}`} />
              <span>{update.checking ? '检查中…' : '检查更新'}</span>
            </button>
            <button
              onClick={onClose}
              className="btn-modern-primary text-xs px-4 py-1.5"
            >
              我知道了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
