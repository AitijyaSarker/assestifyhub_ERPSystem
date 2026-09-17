const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'app/**/*.{ts,tsx}'),
    path.join(__dirname, 'components/**/*.{ts,tsx}'),
    path.join(__dirname, 'features/**/*.{ts,tsx}'),
    path.join(__dirname, 'hooks/**/*.{ts,tsx}'),
    path.join(__dirname, 'lib/**/*.{ts,tsx}'),
    path.join(__dirname, 'stores/**/*.{ts,tsx}'),
    path.join(__dirname, 'types/**/*.{ts,tsx}'),
  ],
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
