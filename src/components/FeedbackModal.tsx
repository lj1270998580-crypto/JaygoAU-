import React, { useState } from 'react';
import { MessageSquarePlus, X, Send, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Bug, Lightbulb, HelpCircle, Mail } from 'lucide-react';
import { useStore } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
}

type FeedbackType = 'bug' | 'feature' | 'model' | 'other';

const FEEDBACK_TYPES: { id: FeedbackType; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'bug', label: 'Bug / 异常报错', icon: <Bug className="w-3.5 h-3.5" />, color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
  { id: 'feature', label: '新功能 / 需求建议', icon: <Lightbulb className="w-3.5 h-3.5" />, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  { id: 'model', label: '模型效果 / 生成质量', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' },
  { id: 'other', label: '其他体验反馈', icon: <HelpCircle className="w-3.5 h-3.5" />, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
];

export function FeedbackModal({ open, onClose }: Props) {
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const showToast = useStore((s) => s.showToast);
  const appVersion = useStore((s) => s.appVersion);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      showToast('请填写反馈详细内容', 'err');
      return;
    }
    if (content.trim().length < 5) {
      showToast('反馈内容请至少填写 5 个字符，以便我们定位问题', 'err');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    const currentTypeLabel = FEEDBACK_TYPES.find((t) => t.id === type)?.label || '用户反馈';
    const payload = {
      type: currentTypeLabel,
      title: title.trim() || undefined,
      content: content.trim(),
      contact: contact.trim() || undefined,
      systemInfo: {
        appVersion: appVersion || '0.7.55',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        platform: typeof navigator !== 'undefined' ? navigator.platform : '',
        screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        time: new Date().toISOString(),
      },
    };

    try {
      const targetUrl = 'https://ailabing.cn/api/jaygo-au/feedback';
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errDetail = '';
        try {
          const j = await res.json();
          errDetail = j.error || j.message || '';
        } catch {
          errDetail = await res.text();
        }
        throw new Error(errDetail || `提交失败 (HTTP ${res.status})`);
      }

      setSuccess(true);
      showToast('反馈已成功提交至作者邮箱！', 'ok');
    } catch (err: any) {
      console.error('Feedback submit failed:', err);
      setErrorMsg(err?.message || '网络连接异常，请检查网络后重试');
      showToast('提交失败，请检查网络或直接邮件联系作者', 'err');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSuccess(false);
    setTitle('');
    setContent('');
    setContact('');
    setErrorMsg('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-[#121318] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-2">
                <span>用户反馈中心</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  <span>直通开发者邮箱</span>
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">所有反馈将直接发送至作者邮箱 (1270998580@qq.com)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="w-7 h-7 rounded-xl hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 成功状态 */}
        {success ? (
          <div className="p-8 flex flex-col items-center text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/10 animate-in zoom-in-50 duration-200">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                感谢您的宝贵反馈！
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
                您的反馈已成功送达作者邮箱（<span className="text-blue-500 font-mono font-medium">1270998580@qq.com</span>）。若留下了联系方式，作者将在排查后第一时间向您回复。
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition cursor-pointer"
              >
                好的，关闭窗口
              </button>
            </div>
          </div>
        ) : (
          /* 表单输入区 */
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* 反馈类型胶囊 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                反馈问题类型
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FEEDBACK_TYPES.map((t) => {
                  const isSelected = type === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id)}
                      className={`px-2.5 py-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 transition cursor-pointer select-none ${
                        isSelected
                          ? `${t.color} font-semibold ring-2 ring-blue-500/20 shadow-xs`
                          : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {t.icon}
                      <span className="truncate">{t.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 简要标题 (选填) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>问题简述 (选填)</span>
                <span className="text-[11px] text-zinc-400">一句话概述您遇到的情况</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如: 某某链接提取提示解析失败、插画时间轴渲染卡顿等"
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
              />
            </div>

            {/* 详细描述 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>反馈详情 <span className="text-rose-500">*</span></span>
                <span className="text-[11px] text-zinc-400">{content.length}/1000 字</span>
              </label>
              <textarea
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={1000}
                required
                placeholder="请详细描述问题发生的场景、复现步骤、报错提示或您的改进设想（若是链接提取问题，可附上测试链接）…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none transition leading-relaxed"
              />
            </div>

            {/* 联系方式 (选填) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>您的联系方式 (选填)</span>
                <span className="text-[11px] text-zinc-400">微信 / QQ / 邮箱 / 手机号，方便作者同步修复进展</span>
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="如: 微信号 abc12345 / 邮箱 me@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition font-mono"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 底部按钮栏 */}
            <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/80">
              <div className="text-[11px] text-zinc-400">
                客户端版本：<span className="font-mono text-zinc-600 dark:text-zinc-300 font-semibold">v{appVersion || '0.7.55'}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !content.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在发送邮件...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>提交反馈</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
