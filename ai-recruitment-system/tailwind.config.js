/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#0891B2',
        'primary-hover': '#0E7490',
        'bg-dark': '#151022',
        'surface-dark': '#111a22',
        'surface-card': '#1e2d3d',
        'surface-hover': '#243647',
        'border-dark': '#2a3f55',
        'border-mid': '#344d65',
        'text-muted': '#93adc8',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
      },
      borderRadius: { lg: '1rem', xl: '1.25rem', '2xl': '1.5rem' },
      boxShadow: { glow: '0 0 20px rgba(44,9,127,0.2)', card: '0 4px 24px rgba(0,0,0,0.3)' },
    },
  },
  plugins: [],
};
