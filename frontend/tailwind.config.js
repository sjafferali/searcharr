/** @type {import('tailwindcss').Config} */

// Color shades are driven by CSS custom properties (see src/index.css) so the
// same utility classes adapt to the active light/dark theme. Channels are stored
// as space-separated RGB triplets to keep Tailwind's `/<alpha>` opacity syntax working.
const cssVarColor = (name) => `rgb(var(--color-${name}) / <alpha-value>)`

const themedScale = (color, shades) =>
  Object.fromEntries(shades.map((shade) => [shade, cssVarColor(`${color}-${shade}`)]))

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      colors: {
        slate: themedScale('slate', [950, 900, 800, 700, 600, 500, 400, 300, 200, 100]),
        cyan: themedScale('cyan', [100, 200, 300, 400, 500, 600, 700, 800]),
        blue: themedScale('blue', [100, 200, 300, 400, 500, 600, 700, 800]),
        emerald: themedScale('emerald', [100, 200, 300, 400, 500, 600, 700, 800]),
        amber: themedScale('amber', [100, 200, 300, 400, 500, 600, 700, 800]),
        red: themedScale('red', [100, 200, 300, 400, 500, 600, 700, 800]),
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
