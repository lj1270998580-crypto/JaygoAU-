import React, { useState } from 'react';
import communityQr from '../assets/community_qr.png';
import { Copy, Check, Download, Users, X, MessageCircle } from 'lucide-react';
import { useStore } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommunityModal({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const showToast = useStore((s) => s.showToast);

  if (!open) return null;

  const handleCopyContact = () => {
    navigator.clipboard.writeText('jaygo');
    setCopied(true);
    showToast('已复制作者微信号: jaygo', 'ok');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQr = () => {
    try {
      const a = document.createElement('a');
      a.href = communityQr;
      a.download = 'Jaygo-微信二维码.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('作者微信二维码已下载到本地', 'ok');
    } catch {
      showToast('保存图片失败，请直接截图保存', 'err');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-1.5">
                <span>微信交流 · 联系作者</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  微信号: jaygo
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">添加微信好友 · 进群交流 · 答疑互助</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-xl hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 二维码展示区 */}
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="relative group p-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 shadow-inner">
            <img
              src={communityQr}
              alt="作者微信二维码"
              className="w-56 h-auto object-contain rounded-xl select-none"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-center gap-1">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>使用微信扫一扫上方二维码添加好友</span>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs leading-relaxed">
              添加作者个人微信（<span className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">jaygo</span>），拉入创作者交流群，交流 AI 自媒体玩法与功能建议！
            </p>
          </div>

          {/* 快捷按钮 */}
          <div className="w-full grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyContact}
              className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{copied ? '已复制微信号' : '复制微信号'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadQr}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>保存二维码</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
