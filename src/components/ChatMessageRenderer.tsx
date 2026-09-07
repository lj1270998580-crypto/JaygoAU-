import React, { useState } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Terminal,
  FileText,
  BrainCircuit,
} from 'lucide-react';

interface Props {
  content: string;
  role: 'user' | 'assistant';
  isStreaming?: boolean;
}

// 提取 <think>...</think> 深度推演块（兼容未闭合的流式状态）
function splitThinkContent(raw: string): { think: string | null; body: string } {
  const thinkStart = raw.indexOf('<think>');
  if (thinkStart === -1) {
    return { think: null, body: raw };
  }

  const thinkEnd = raw.indexOf('</think>');
  if (thinkEnd !== -1) {
    const think = raw.substring(thinkStart + 7, thinkEnd).trim();
    const body = (raw.substring(0, thinkStart) + raw.substring(thinkEnd + 8)).trim();
    return { think, body };
  } else {
    // 还在生成中，未闭合
    const think = raw.substring(thinkStart + 7).trim();
    const body = raw.substring(0, thinkStart).trim();
    return { think, body };
  }
}

// 格式化单行内联元素（**加粗**、`行内代码`）
function renderInlineElements(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // 正则匹配 **加粗** 或 `代码`
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${match.index}`} className="font-semibold text-zinc-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`c-${match.index}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-purple-600 dark:text-purple-400 font-mono text-[12px] border border-zinc-300/60 dark:border-zinc-700/60"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

// 代码与脚本块展示组件（带顶栏与独立复制）
function CodeScriptBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLang = language.trim() || '脚本/代码';

  return (
    <div className="my-3 rounded-xl border border-zinc-200/90 dark:border-zinc-800 bg-zinc-900 text-zinc-100 overflow-hidden shadow-xs font-mono">
      {/* 顶部标头栏 */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-950/80 border-b border-zinc-800/80 text-xs">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-mono font-medium text-[11px] uppercase tracking-wider">{displayLang}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          title="复制本段内容"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-sans">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="font-sans">复制代码</span>
            </>
          )}
        </button>
      </div>

      {/* 代码正文 */}
      <div className="p-3.5 overflow-x-auto text-[12.5px] leading-relaxed select-text">
        <pre className="font-mono whitespace-pre-wrap">{code}</pre>
      </div>
    </div>
  );
}

// 思考推演折叠组件
function ThinkAccordion({ think, isStreaming }: { think: string; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState<boolean>(Boolean(isStreaming));

  return (
    <div className="my-2.5 rounded-xl border border-purple-200/80 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-purple-100/40 dark:hover:bg-purple-900/30 transition cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <BrainCircuit className={`w-4 h-4 text-purple-600 dark:text-purple-400 ${isStreaming ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-semibold text-purple-900 dark:text-purple-200">
            {isStreaming ? 'AI 正在深度思考中…' : '已完成深度推演与构思'}
          </span>
          <span className="text-[10.5px] text-purple-500/80 dark:text-purple-400/70 font-mono">
            ({think.length} 字)
          </span>
        </div>

        <div className="flex items-center gap-1 text-purple-500 text-xs">
          <span className="text-[11px]">{expanded ? '收起' : '展开思考'}</span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3 pt-1 border-t border-purple-200/60 dark:border-purple-900/30 text-xs text-zinc-600 dark:text-zinc-400 italic leading-relaxed whitespace-pre-wrap select-text pl-4 border-l-2 border-l-purple-400 ml-3.5 my-1.5">
          {think}
        </div>
      )}
    </div>
  );
}

export function ChatMessageRenderer({ content, role, isStreaming }: Props) {
  // 如果是用户发送的信息，采用精简气泡排版
  if (role === 'user') {
    return (
      <div className="whitespace-pre-wrap select-text font-sans text-[13.5px] leading-relaxed">
        {content}
      </div>
    );
  }

  // 助手消息：解析 <think>
  const { think, body } = splitThinkContent(content);

  // 解析 Markdown 块（代码块 ```、标题 #、引用 >、列表 -、常规段落）
  const renderBlocks = () => {
    const lines = body.split('\n');
    const nodes: React.ReactNode[] = [];

    let inCodeBlock = false;
    let codeLanguage = '';
    let codeBuffer: string[] = [];

    let inQuote = false;
    let quoteBuffer: string[] = [];

    const flushQuote = (key: string) => {
      if (quoteBuffer.length > 0) {
        nodes.push(
          <blockquote
            key={key}
            className="border-l-[3px] border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/20 px-3.5 py-2 my-2.5 rounded-r-xl text-zinc-700 dark:text-zinc-300 italic text-[13px] leading-relaxed"
          >
            {quoteBuffer.map((ql, qIdx) => (
              <p key={qIdx} className="my-0.5">{renderInlineElements(ql)}</p>
            ))}
          </blockquote>
        );
        quoteBuffer = [];
      }
      inQuote = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 代码块判定
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          flushQuote(`quote-before-code-${i}`);
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
          codeBuffer = [];
        } else {
          inCodeBlock = false;
          nodes.push(
            <CodeScriptBlock
              key={`code-${i}`}
              language={codeLanguage}
              code={codeBuffer.join('\n')}
            />
          );
          codeBuffer = [];
          codeLanguage = '';
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // 引用块判定 (> ...)
      if (line.trim().startsWith('>')) {
        inQuote = true;
        quoteBuffer.push(line.trim().replace(/^>\s?/, ''));
        continue;
      } else if (inQuote) {
        flushQuote(`quote-${i}`);
      }

      // 标题判定
      if (line.startsWith('# ')) {
        nodes.push(
          <h1 key={`h1-${i}`} className="text-base font-bold text-zinc-900 dark:text-white mt-4 mb-2 pb-1 border-b border-zinc-200/80 dark:border-zinc-800">
            {renderInlineElements(line.slice(2))}
          </h1>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        nodes.push(
          <h2 key={`h2-${i}`} className="text-[14.5px] font-bold text-zinc-900 dark:text-white mt-3.5 mb-1.5 flex items-center gap-1.5">
            <span className="w-1 h-3.5 bg-blue-500 rounded-full inline-block" />
            <span>{renderInlineElements(line.slice(3))}</span>
          </h2>
        );
        continue;
      }
      if (line.startsWith('### ')) {
        nodes.push(
          <h3 key={`h3-${i}`} className="text-[13.5px] font-semibold text-zinc-800 dark:text-zinc-200 mt-2.5 mb-1">
            {renderInlineElements(line.slice(4))}
          </h3>
        );
        continue;
      }

      // 无序列表 (- 或 * )
      if (/^(\s*)[-*]\s+(.+)/.test(line)) {
        const match = line.match(/^(\s*)[-*]\s+(.+)/);
        if (match) {
          nodes.push(
            <div key={`ul-${i}`} className="flex items-start gap-2 my-1 pl-1 text-[13.5px] leading-relaxed">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
              <div className="flex-1 text-zinc-800 dark:text-zinc-200">
                {renderInlineElements(match[2])}
              </div>
            </div>
          );
          continue;
        }
      }

      // 有序列表 (1. 2. 等)
      if (/^(\d+)\.\s+(.+)/.test(line.trim())) {
        const match = line.trim().match(/^(\d+)\.\s+(.+)/);
        if (match) {
          nodes.push(
            <div key={`ol-${i}`} className="flex items-start gap-2 my-1 pl-1 text-[13.5px] leading-relaxed">
              <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">
                {match[1]}
              </span>
              <div className="flex-1 text-zinc-800 dark:text-zinc-200">
                {renderInlineElements(match[2])}
              </div>
            </div>
          );
          continue;
        }
      }

      // 空行
      if (!line.trim()) {
        nodes.push(<div key={`blank-${i}`} className="h-2" />);
        continue;
      }

      // 普通段落文本
      nodes.push(
        <p key={`p-${i}`} className="my-1.5 text-[13.5px] leading-[1.75] text-zinc-800 dark:text-zinc-200">
          {renderInlineElements(line)}
        </p>
      );
    }

    // 若末尾还有未闭合的代码块或引用
    if (inCodeBlock && codeBuffer.length > 0) {
      nodes.push(
        <CodeScriptBlock
          key="code-unclosed"
          language={codeLanguage}
          code={codeBuffer.join('\n')}
        />
      );
    }
    flushQuote('quote-final');

    return nodes;
  };

  return (
    <div className="select-text font-sans space-y-0.5 text-[13.5px] leading-relaxed">
      {/* 深度推演思考卡片 */}
      {think && <ThinkAccordion think={think} isStreaming={isStreaming} />}

      {/* 正文内容 */}
      <div className="ai-message-body">
        {renderBlocks()}
      </div>
    </div>
  );
}
