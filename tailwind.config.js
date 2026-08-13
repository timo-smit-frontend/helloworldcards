import defaultTheme from 'tailwindcss/defaultTheme'

/**
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        panel: '1.25rem',
        button: '1.25rem'
      },
      boxShadow: {
        card: '0 10px 28px rgb(58 50 44 / 0.08)'
      },
      colors: {
        paper: '#f8efe4',
        ink: '#3a322c',
        muted: '#73685f',
        surface: '#fff8f0',
        cream: '#fffdf9',
        line: '#e6d5c4',
        leaf: '#5aafcb',
        moss: '#3d8a9e'
      },
      fontFamily: {
        sans: ['Outfit', ...defaultTheme.fontFamily.sans],
        display: ['Outfit', ...defaultTheme.fontFamily.sans]
      }
    }
  }
}
