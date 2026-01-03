// @artifactuse/shared - Tailwind CSS Configuration
// Shared config for: form-panel, json-viewer, svg-viewer, diff-viewer, sandbox
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{vue,js,ts,jsx,tsx,html}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary - customizable accent color
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover) / <alpha-value>)',
        },
        // Backgrounds
        panel: {
          bg: 'rgb(var(--color-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-surface) / <alpha-value>)',
          hover: 'rgb(var(--color-hover) / <alpha-value>)',
        },
        // Text
        txt: {
          DEFAULT: 'rgb(var(--color-text) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        },
        // Border
        line: 'rgb(var(--color-border) / <alpha-value>)',
        // Semantic
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        error: 'rgb(var(--color-error) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        panel: 'var(--radius)',
      },
    },
  },
  plugins: [],
}
