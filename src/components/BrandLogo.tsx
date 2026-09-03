interface BrandLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  subtext?: string;
}

export default function BrandLogo({
  size = 28,
  className = '',
  showText = false,
  subtext,
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* 矢量图形徽标 */}
      <div
        className="relative shrink-0 flex items-center justify-center rounded-xl overflow-hidden shadow-sm shadow-indigo-500/20 group"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full transform transition-transform duration-300 group-hover:scale-105"
        >
          <defs>
            {/* 品牌主渐变：深靛蓝到电光青 */}
            <linearGradient id="jaygo-grad-primary" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop offset="60%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            {/* 声波渐变 */}
            <linearGradient id="jaygo-grad-wave" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
            </linearGradient>
            {/* 幽光滤镜 */}
            <filter id="jaygo-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 背景圆角矩形 */}
          <rect width="36" height="36" rx="9" fill="url(#jaygo-grad-primary)" />

          {/* 微光暗纹背景 */}
          <circle cx="28" cy="8" r="12" fill="#ffffff" fillOpacity="0.12" />

          {/* 字母 J 与 动态音频波形融合图腾 */}
          {/* 左侧弧线：J 的下半身钩形与声波律动 */}
          <path
            d="M20 7v13a6 6 0 1 1-12 0"
            stroke="url(#jaygo-grad-wave)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#jaygo-glow)"
          />

          {/* 右侧声波频谱柱（象征声音生成与 AI 律动） */}
          {/* 第1根柱子 */}
          <line
            x1="24"
            y1="14"
            x2="24"
            y2="22"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeOpacity="0.9"
          />
          {/* 第2根柱子（高柱） */}
          <line
            x1="28"
            y1="10"
            x2="28"
            y2="26"
            stroke="#ffffff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* 文字标识 */}
      {showText && (
        <div className="flex flex-col leading-none min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold tracking-tight text-zinc-900 dark:text-white">
              Jaygo <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">AU</span>
            </span>
            <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
              PRO
            </span>
          </div>
          {subtext && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 truncate font-normal">
              {subtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
