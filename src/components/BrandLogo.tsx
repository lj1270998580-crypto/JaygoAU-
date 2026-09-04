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
      {/* 极简矢量图形徽标 */}
      <div
        className="relative shrink-0 flex items-center justify-center rounded-xl overflow-hidden shadow-sm shadow-blue-500/10 group"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full transform transition-transform duration-300 group-hover:scale-105"
        >
          <defs>
            <clipPath id="logoSquircle">
              <rect x="32" y="32" width="448" height="448" rx="104" />
            </clipPath>
            <linearGradient id="logoBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0e1017" />
              <stop offset="100%" stopColor="#06070a" />
            </linearGradient>
            <linearGradient id="logoJGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f2fe" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <radialGradient id="logoGlow" cx="45%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g clipPath="url(#logoSquircle)">
            <rect x="32" y="32" width="448" height="448" fill="url(#logoBg)" />
            <circle cx="230" cy="220" r="220" fill="url(#logoGlow)" />

            {/* J型声学音叉/声波图腾 */}
            <path
              d="M 236 120 L 236 308 A 76 76 0 0 1 84 308 L 84 270"
              fill="none"
              stroke="url(#logoJGrad)"
              strokeWidth="38"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* 两根动态音频声谱谐波柱 */}
            <line x1="316" y1="180" x2="316" y2="340" stroke="#60a5fa" strokeWidth="38" strokeLinecap="round" />
            <line x1="396" y1="228" x2="396" y2="292" stroke="#a78bfa" strokeWidth="38" strokeLinecap="round" />
          </g>
          <rect x="32" y="32" width="448" height="448" rx="104" fill="none" stroke="#222638" strokeWidth="6" />
        </svg>
      </div>

      {/* 文字标识 */}
      {showText && (
        <div className="flex flex-col leading-none min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold tracking-tight text-zinc-900 dark:text-white">
              Jaygo <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 bg-clip-text text-transparent">AU</span>
            </span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
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
