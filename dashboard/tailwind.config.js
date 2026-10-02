/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        farm: {
          bg: '#D8DEE0',
          card: 'rgba(244, 246, 247, 0.75)',
          cardSolid: '#EDF1F2',
          cardDark: '#BDC4C6',
          border: 'rgba(255, 255, 255, 0.55)',
          primaryText: '#1B2428',
          muted: '#7A888F',
          accentGreen: '#B5EA3A',
          danger: '#EF4444',
          warning: '#F59E0B',
        },
        appBg: '#D8DEE0',
        cardBg: '#EDF1F2',
        cardBorder: 'rgba(255, 255, 255, 0.55)',
        emeraldPrimary: '#1E5336',
        emeraldLight: '#E8F5EE',
        accentOrange: '#E87A38',
        textTitle: '#1B2428',
        textMuted: '#7A888F',
        statusGreen: '#22A358',
        statusWarn: '#F59E0B',
        statusDanger: '#EF4444',
      },
      boxShadow: {
        soft: '0 4px 20px -4px rgba(0,0,0,0.06), 0 2px 8px -2px rgba(0,0,0,0.04)',
        pill: '0 1px 4px 0 rgba(0,0,0,0.08)',
      },
      height: {
        '15': '3.75rem',
        '18': '4.5rem',
      },
    }
  },
  plugins: [],
}
