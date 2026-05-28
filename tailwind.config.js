/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Marca NEG: Montserrat para títulos y cuerpo, Lato para el slogan.
        sans: [
          'Montserrat', 'ui-sans-serif', 'system-ui', '-apple-system',
          'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif',
        ],
        display: [
          'Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif',
        ],
        slogan: [
          'Lato', 'ui-sans-serif', 'system-ui', 'sans-serif',
        ],
      },
      colors: {
        // Verde corporativo NEG (manual de marca). 600 = #628E3A primario.
        brand: {
          50:  '#f4f8ee',
          100: '#e5efd5',
          200: '#cce0ad',
          300: '#aacd7e',
          400: '#8bb957',
          500: '#73a142',
          600: '#628e3a',
          700: '#4f7330',
          800: '#3f5a28',
          900: '#354b22',
        },
        // Acento lima del manual (#D7DA33). Usar con moderación.
        accent: {
          DEFAULT: '#d7da33',
          dark: '#8f920f',
        },
      },
    },
  },
  plugins: [],
}
