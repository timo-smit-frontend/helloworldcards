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
        card: '0 10px 28px rgb(0 0 0 / 0.4)'
      },
      colors: {
        'site-dark': '#1C2030',
        'site-pearl-bush': '#e8e2d0',
        'site-lemon-grass': '#a39c88',
        'site-gunmetal': '#2a2f42',
        'site-mulled-wine': '#4a5168',
        'site-ginger-brown': '#d1be6a',
        'site-winter-hazel': '#e2d28a',
        'site-mirage': '#1a1c28'
      },
      fontFamily: {
        'site-outfit': ['Outfit', ...defaultTheme.fontFamily.sans]
      }
    }
  }
}
