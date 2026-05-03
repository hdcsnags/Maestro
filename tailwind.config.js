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
          2: 'var(--void-2)',
          3: 'var(--void-3)',
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
