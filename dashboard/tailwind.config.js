/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        appBg: '#EEF2F0',
        cardBg: '#FFFFFF',
        cardBorder: '#E5ECE8',
        emeraldPrimary: '#1E5336',
        emeraldHover: '#163E28',
        emeraldLight: '#E8F5EE',
        accentOrange: '#E87A38',
        textTitle: '#17231C',
        textMuted: '#687B71',
        statusGreen: '#22A358',
        statusWarn: '#E29E1B',
        statusDanger: '#DE4A4A',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(18, 48, 32, 0.05), 0 2px 6px -1px rgba(18, 48, 32, 0.03)',
        'pill': '0 2px 8px rgba(0, 0, 0, 0.04)',
      }
    }
  },
  plugins: [],
}
