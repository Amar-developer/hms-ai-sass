import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Segoe UI', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: 'var(--brand)',
          hover: 'var(--brand-hover)',
          fg: 'var(--brand-fg)',
        },
        success: {
          subtle: 'var(--success-subtle)',
          soft: 'var(--success-soft)',
          border: 'var(--success-border)',
          solid: 'var(--success-solid)',
          fg: 'var(--success-fg)',
        },
        danger: {
          subtle: 'var(--danger-subtle)',
          soft: 'var(--danger-soft)',
          border: 'var(--danger-border)',
          solid: 'var(--danger-solid)',
          fg: 'var(--danger-fg)',
        },
        warning: {
          subtle: 'var(--warning-subtle)',
          soft: 'var(--warning-soft)',
          border: 'var(--warning-border)',
          solid: 'var(--warning-solid)',
          fg: 'var(--warning-fg)',
        },
        info: {
          subtle: 'var(--info-subtle)',
          soft: 'var(--info-soft)',
          border: 'var(--info-border)',
          solid: 'var(--info-solid)',
          fg: 'var(--info-fg)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
