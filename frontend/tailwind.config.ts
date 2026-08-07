import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Light theme surfaces ──
        bg: {
          base: '#f6f7f9',      // app background (light gray)
          DEFAULT: '#ffffff',   // page/card background (white)
          card: '#ffffff',      // card surface
          elevated: '#ffffff',  // elevated surface (modals, dropdowns)
          hover: '#f3f4f6',     // hover state (gray-100)
          subtle: '#f9fafb',    // subtle background (gray-50)
        },
        border: {
          DEFAULT: '#e5e7eb',   // default border (gray-200)
          subtle: '#f3f4f6',    // subtle divider (gray-100)
          strong: '#d1d5db',    // emphasized border (gray-300)
        },
        // ── Accent (brand) — vibrant blue ──
        accent: {
          DEFAULT: '#4f46e5',   // indigo-600 — primary actions
          hover: '#4338ca',     // indigo-700 — hover state
          muted: '#eef2ff',     // indigo-50 — muted accent bg
          subtle: '#f5f3ff',    // very subtle accent bg
        },
        // ── Semantic colors (vibrant on light) ──
        success: { DEFAULT: '#16a34a', muted: '#15803d', subtle: '#dcfce7' },
        danger: { DEFAULT: '#dc2626', muted: '#b91c1c', subtle: '#fee2e2' },
        warning: { DEFAULT: '#d97706', muted: '#b45309', subtle: '#fef3c7' },
        info: { DEFAULT: '#0891b2', muted: '#0e7490', subtle: '#cffafe' },
        // ── Text (dark on light) ──
        text: {
          primary: '#111827',   // headings (gray-900)
          secondary: '#4b5563', // body text (gray-600)
          tertiary: '#9ca3af',  // labels, hints (gray-400)
          disabled: '#d1d5db',  // disabled state (gray-300)
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.04)',
        elevated: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.05)',
        glow: '0 0 20px -5px rgba(79,70,229,0.25)',
        pop: '0 10px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.05)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
      },
    },
  },
  plugins: [],
};
export default config;
