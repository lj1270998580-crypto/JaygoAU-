/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      colors: {
        glass: {
          bg: 'rgba(255,255,255,0.10)',
          border: 'rgba(255,255,255,0.22)',
        },
        brand: {
          from: '#8b5cf6',
          to: '#38bdf8',
        },
      },
      boxShadow: {
        glass:
          '0 24px 60px -18px rgba(0,0,0,0.65), 0 8px 24px -8px rgba(0,0,0,0.45), inset 0 1px 0 0 rgba(255,255,255,0.14)',
        glassSoft: '0 10px 30px -12px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.08)',
        glow: '0 0 28px -4px rgba(139,92,246,0.55)',
        glowSm: '0 0 18px -6px rgba(56,189,248,0.6)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        float1: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(30px,-40px) scale(1.1)' },
        },
        float2: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(-40px,30px) scale(1.15)' },
        },
        float3: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '50%': { transform: 'translate(20px,40px) scale(0.95)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        float1: 'float1 26s ease-in-out infinite',
        float2: 'float2 32s ease-in-out infinite',
        float3: 'float3 29s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};
