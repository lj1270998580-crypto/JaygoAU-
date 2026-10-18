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
    navigator.clipboard.writeText('1270998580@qq.com');
    setCopied(true);
    showToast('已复制作者联系方式: 1270998580@qq.com', 'ok');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQr = () => {
    try {
      const a = document.createElement('a');
      a.href = communityQr;
      a.download = 'JaygoAU-AI探索交流群.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('群二维码图片已下载到本地', 'ok');
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
                <span>AI 探索交流群</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  官方微信社群
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">创作者交流 · 功能探讨 · 玩法分享</p>
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
              alt="微信群二维码"
              className="w-56 h-auto object-contain rounded-xl select-none"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-center gap-1">
              <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>使用微信扫一扫上方二维码进群</span>
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 max-w-xs leading-relaxed">
              若微信扫码提示二维码已过期或频繁，请直接联系作者微信或发送邮件至
              <span className="text-blue-500 font-mono ml-1 font-semibold">1270998580@qq.com</span>
              ，第一时间手动邀请您进群！
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
              <span>{copied ? '已复制联系方式' : '复制作者邮箱'}</span>
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
