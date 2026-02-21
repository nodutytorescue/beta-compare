/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        landscape: { raw: '(orientation: landscape)' }
      }
    }
  },
  plugins: []
};
