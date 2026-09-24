import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary caught error]', error, errorInfo);
  }

  handleCopyError = () => {
    const text = `${this.state.error?.name || 'Error'}: ${this.state.error?.message || ''}\n${this.state.error?.stack || ''}\n${this.state.errorInfo?.componentStack || ''}`;
    try {
      navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {}
  };

  handleReload = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 shadow-lg space-y-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-rose-800 dark:text-rose-300">
                {this.props.fallbackTitle || '界面渲染遇到异常'}
              </h3>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-1 leading-relaxed">
                系统已安全捕获该异常并防止整个应用崩溃。您可以重置该模块或复制错误日志反馈排查。
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="p-3 rounded-xl bg-black/5 dark:bg-black/40 border border-black/10 dark:border-white/10 font-mono text-[11px] max-h-36 overflow-y-auto break-all select-text">
              <div className="font-bold text-rose-600 dark:text-rose-400">{this.state.error.message}</div>
              {this.state.error.stack && (
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 whitespace-pre-wrap">
                  {this.state.error.stack.slice(0, 400)}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>重新加载界面</span>
            </button>
            <button
              type="button"
              onClick={this.handleCopyError}
              className="px-3.5 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
            >
              {this.state.copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{this.state.copied ? '已复制日志' : '复制错误日志'}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
