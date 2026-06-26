/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#002147', light: '#003166', lighter: '#0a3d7a', dark: '#001530' },
        gold: { DEFAULT: '#FFD700', dark: '#e6c200', muted: '#FFF3B0', dim: '#a08000' },
        civic: { emerald: '#10B981', slate: '#F8FAFC', 'slate-mid': '#EEF2F7' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,33,71,0.08)',
        elevated: '0 8px 40px rgba(0,33,71,0.14)',
        gold: '0 4px 20px rgba(255,215,0,0.35)',
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, #002147 0%, #003166 50%, #0a3d7a 100%)',
        'gold-gradient': 'linear-gradient(135deg, #FFD700, #f0a500)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'pop-in': 'popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pulse-gold': 'pulseGold 2s ease infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'count-up': 'countUp 0.5s ease-out',
      },
      keyframes: {
        slideIn: { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        popIn: { from: { opacity: 0, transform: 'scale(0.85)' }, to: { opacity: 1, transform: 'scale(1)' } },
        pulseGold: { '0%,100%': { boxShadow: '0 0 0 0 rgba(255,215,0,0.4)' }, '70%': { boxShadow: '0 0 0 8px rgba(255,215,0,0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        countUp: { from: { transform: 'translateY(10px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
      },
    },
  },
  plugins: [],
};
