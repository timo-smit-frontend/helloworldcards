import defaultTheme from 'tailwindcss/defaultTheme'
import plugin from 'tailwindcss/plugin'

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
        button: '0 2px 0 rgb(61 138 158 / 0.2)',
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
      container: {
        center: true,
        padding: {
          DEFAULT: '1.75rem',
          lg: '2rem'
        },
        screens: {
          ...defaultTheme.screens,
          '2xl': '1348px'
        }
      },
      fontFamily: {
        sans: ['Outfit', ...defaultTheme.fontFamily.sans],
        display: ['Outfit', ...defaultTheme.fontFamily.sans],
        mono: ['Outfit', ...defaultTheme.fontFamily.sans]
      },
      maxWidth: {
        site: '84.25rem'
      },
      screens: {
        xs: '420px',
        ...defaultTheme.screens
      },
      height: {
        'screen-dynamic': '100dvh'
      },
      minHeight: {
        'screen-dynamic': '100dvh'
      },
      maxHeight: {
        'screen-dynamic': '100dvh'
      },
      keyframes: {
        enterFromRight: {
          from: { opacity: '0', transform: 'translateX(200px)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        },
        enterFromLeft: {
          from: { opacity: '0', transform: 'translateX(-200px)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        },
        exitToRight: {
          from: { opacity: '1', transform: 'translateX(0)' },
          to: { opacity: '0', transform: 'translateX(200px)' }
        },
        exitToLeft: {
          from: { opacity: '1', transform: 'translateX(0)' },
          to: { opacity: '0', transform: 'translateX(-200px)' }
        },
        scaleIn: {
          from: { opacity: '0', transform: 'rotateX(-10deg) scale(0.9)' },
          to: { opacity: '1', transform: 'rotateX(0deg) scale(1)' }
        },
        scaleOut: {
          from: { opacity: '1', transform: 'rotateX(0deg) scale(1)' },
          to: { opacity: '0', transform: 'rotateX(-10deg) scale(0.95)' }
        }
      },
      animation: {
        scaleIn: 'scaleIn 200ms ease',
        scaleOut: 'scaleOut 200ms ease',
        enterFromLeft: 'enterFromLeft 250ms ease',
        enterFromRight: 'enterFromRight 250ms ease',
        exitToLeft: 'exitToLeft 250ms ease',
        exitToRight: 'exitToRight 250ms ease'
      }
    }
  },
  plugins: [
    plugin(({ matchUtilities }) => {
      matchUtilities({
        perspective: (value) => ({
          perspective: value
        })
      })
    })
  ]
}
