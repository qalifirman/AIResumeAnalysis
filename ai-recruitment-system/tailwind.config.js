/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
      },
      colors: {
        // CSS-variable-backed colors — support opacity modifiers (bg-primary/20 etc.)
        primary:         'rgb(var(--color-primary) / <alpha-value>)',
        'primary-hover': 'rgb(var(--color-primary-hover) / <alpha-value>)',
        'bg-dark':       'rgb(var(--color-bg) / <alpha-value>)',
        'surface-dark':  'rgb(var(--color-surface-dark) / <alpha-value>)',
        'surface-card':  'rgb(var(--color-surface-card) / <alpha-value>)',
        'surface-hover': 'rgb(var(--color-surface-hover) / <alpha-value>)',
        'border-dark':   'rgb(var(--color-border-dark) / <alpha-value>)',
        'border-mid':    'rgb(var(--color-border-mid) / <alpha-value>)',
        'text-muted':    'rgb(var(--color-text-muted) / <alpha-value>)',
        border:    'hsl(var(--border))',
        input:     'hsl(var(--input))',
        ring:      'hsl(var(--ring))',
        background:'hsl(var(--background))',
        foreground:'hsl(var(--foreground))',
      },
      borderRadius: { lg: '1rem', xl: '1.25rem', '2xl': '1.5rem' },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        card: '0 4px 24px rgba(0,0,0,0.3)',
        soft: '0 4px 20px -2px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
};
