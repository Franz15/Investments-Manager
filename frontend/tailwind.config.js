/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Gray scale — warm light end, neutral dark end ────────────
        // 50–600: warm editorial tones (light mode surfaces & text).
        //         Bridged dynamically via CSS vars in index.css.
        // 700–950: neutral near-blacks used for dark mode surfaces
        //          (dark:bg-gray-700, dark:bg-gray-800, etc.).
        //          Neutral here prevents warm-brown bleed in dark mode.
        gray: {
          50: '#FFF1E5',
          100: '#F7EDD8',
          200: '#EDE0C8',
          300: '#D4C4AA',
          400: '#A89080',
          500: '#7A6A5A',
          600: '#5A4A3A',
          700: '#3A3A3C',
          800: '#2C2C2E',
          900: '#1C1C1E',
          950: '#0F0F0F',
        },

        // ── TRADECLIMB Brand Gold ─────────────────────────────────────
        // Derived from the logo's warm sand (#F5D898) — shifted to vivid UI gold
        brand: {
          50: '#FDFBF3',
          100: '#F9F3E7',
          200: '#F1E2C8',
          300: '#E4CB8D',
          400: '#D7B152',
          500: '#C9961A', // ← primary brand gold
          600: '#B58717',
          700: '#A17815',
          800: '#836211',
          900: '#654B0D',
          950: '#3C2B06',
        },

        // ── Dark surfaces (warm-tinted near-blacks) ───────────────────
        space: {
          50: '#FAFAF8',
          100: '#F5F4EF',
          200: '#E8E7E1',
          300: '#C8C7C1',
          400: '#8A8A84',
          500: '#5A5A56',
          600: '#3A3A38',
          700: '#252524',
          800: '#1A1A1E',
          900: '#111113',
          950: '#09090B',
        },

        // ── Keep primary for backward compat (now maps to gold) ───────
        primary: {
          50: '#FDFBF3',
          100: '#F9F3E7',
          200: '#F1E2C8',
          300: '#E4CB8D',
          400: '#D7B152',
          500: '#C9961A',
          600: '#B58717',
          700: '#A17815',
          800: '#836211',
          900: '#654B0D',
          950: '#3C2B06',
        },
      },

      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
        mono: ['DM Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.02em',
        tight: '-0.01em',
        normal: '-0.011em',
        wide: '0.02em',
        wider: '0.06em',
        widest: '0.12em',
      },

      lineHeight: {
        tighter: '1.1',
        tight: '1.2',
        snug: '1.35',
        normal: '1.5',
        relaxed: '1.65',
      },

      borderRadius: {
        '2.5xl': '1.25rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },

      boxShadow: {
        // ── Surface shadows ────────────────────────────────────────────
        'card-sm': '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03)',
        card: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.06)',
        'card-dark': '0 1px 3px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.16)',
        'card-dark-hover': '0 4px 12px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.22)',

        // ── Gold glow (brand accent) ───────────────────────────────────
        'gold-sm': '0 0 10px rgba(201,150,26,0.2)',
        gold: '0 0 20px rgba(201,150,26,0.28)',
        'gold-lg': '0 0 40px rgba(201,150,26,0.35)',
        'gold-btn': '0 2px 8px rgba(201,150,26,0.3), 0 0 0 1px rgba(201,150,26,0.1)',

        // ── Modals & overlays ──────────────────────────────────────────
        modal: '0 24px 64px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.08)',
        'modal-dark': '0 24px 64px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.35)',

        // ── User color glow (dynamic) ──────────────────────────────────
        glow: '0 0 20px rgba(var(--user-color-600-rgb, 201,150,26), 0.25)',
        'glow-lg': '0 0 40px rgba(var(--user-color-600-rgb, 201,150,26), 0.35)',

        // ── Bottom nav ─────────────────────────────────────────────────
        'bottom-nav': '0 -1px 0 rgba(0,0,0,0.06), 0 -4px 16px rgba(0,0,0,0.04)',
        'bottom-nav-dark': '0 -1px 0 rgba(255,255,255,0.05)',
      },

      backdropBlur: {
        xs: '2px',
        '3xl': '64px',
      },

      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'fade-in-slow': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'slide-up-sm': 'slideUpSm 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
        'scale-in-bounce': 'scaleIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'slide-in-left': 'slideInLeft 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        shimmer: 'shimmer 2s linear infinite',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
      },

      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideUpSm: {
          from: { transform: 'translateY(6px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          from: { transform: 'translateY(-12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.94)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        slideInLeft: {
          from: { transform: 'translateX(-12px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(201,150,26,0)' },
          '50%': { boxShadow: '0 0 0 6px rgba(201,150,26,0.15)' },
        },
      },
    },
  },
  plugins: [],
};
