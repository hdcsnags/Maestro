/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
        sans: ['DM Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        void: {
          DEFAULT: '#08080a',
          2: '#0e0e12',
          3: '#15151c',
        },
        gold: {
          DEFAULT: '#c9a84c',
          dim: 'rgba(201,168,76,0.12)',
          glow: 'rgba(201,168,76,0.06)',
        },
        agent: {
          claude: '#e07b5a',
          gpt: '#5ab88e',
          gemini: '#5a8fe0',
          kimi: '#b45ae0',
          qwen: '#e0c25a',
        },
        signal: {
          ok: '#4ebb7f',
          warn: '#e0a94a',
          risk: '#e05a5a',
        },
      },
      borderColor: {
        glass: 'rgba(255,255,255,0.09)',
        'glass-lit': 'rgba(255,255,255,0.18)',
      },
    },
  },
  plugins: [],
};
