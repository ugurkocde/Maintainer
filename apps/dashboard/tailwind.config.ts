import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f7f8',
          100: '#ececef',
          200: '#d6d6dc',
          300: '#b1b1bb',
          400: '#7d7d8a',
          500: '#56565f',
          600: '#3a3a42',
          700: '#27272d',
          800: '#19191e',
          900: '#0d0d11',
        },
        accent: {
          500: '#7c5cff',
          600: '#6a4af0',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
