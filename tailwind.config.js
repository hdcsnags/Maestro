/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace', 'var(--mono)'],
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif', 'var(--sans)'],
        serif: ['var(--serif)'],
      },
      colors: {
        void: {
          DEFAULT: 'var(--void-0)',
          1: 'var(--void-1)',
          2: 'var(--void-2)',
          3: 'var(--void-3)',
          4: 'var(--void-4)',
        },
        surf: {
          0: 'var(--surf-0)',
          1: 'var(--surf-1)',
          2: 'var(--surf-2)',
          3: 'var(--surf-3)',
        },
        edge: {
          0: 'var(--edge-0)',
          1: 'var(--edge-1)',
          2: 'var(--edge-2)',
          3: 'var(--edge-3)',
        },
        ink: {
          0: 'var(--ink-0)',
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        gold: {
          DEFAULT: 'var(--ember)',
          dim: 'var(--ember-soft)',
          glow: 'var(--ember-glow)',
        },
        agent: {
          claude: 'var(--claude)',
          gpt: 'var(--gpt)',
          gemini: 'var(--gemini)',
          kimi: 'var(--kimi)',
          qwen: 'var(--qwen)',
        },
        signal: {
          ok: 'var(--ok)',
          warn: 'var(--warn)',
          risk: 'var(--risk)',
          info: 'var(--gemini)',
        },
      },
      borderColor: {
        glass: 'var(--edge-1)',
        'glass-lit': 'var(--edge-2)',
      },
    },
  },
  plugins: [],
};
