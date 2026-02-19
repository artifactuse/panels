/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./public/**/*.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: { 
          DEFAULT: '#6366f1', 
          hover: '#4f46e5',
          light: 'rgba(99, 102, 241, 0.1)'
        },
        // gray: {
        //   850: '#1a2234'
        // },
        gray: {
            50: '#f8f8f9',
            55: '#eef2f8',
            100: '#f1f1f3',
            200: '#e4e4e7',
            300: '#d1d1d6',
            400: '#a1a1aa',
            500: '#71717a',
            600: '#52525b',
            700: '#3f3f46',
            750: '#3c3c3c',
            800: '#1b1b21',
            850: '#1a2234',
            900: '#111114'
        }
      }
    }
  },
  plugins: [],
}