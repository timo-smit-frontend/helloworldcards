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
        'site-mirage': '#1A1C28',
        'site-dark': '#1C2030',
        'site-gunmetal': '#2A2F42',
        'site-mulled-wine': '#4A5168',
        'site-envy': '#84A38C',
        'site-mantle': '#92A196',
        'site-summer-green': '#9CB8A4',
        'site-gray-nurse': '#E0E6E1'
      },
      fontFamily: {
        'site-outfit': ['Outfit Variable', ...defaultTheme.fontFamily.sans]
      }
    }
  }
}
