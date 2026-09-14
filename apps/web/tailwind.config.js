/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        accent: '#0f766e',
      },
      fontFamily: {
        display: ['Space Grotesk', 'Avenir Next', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
