import defaultTheme from 'tailwindcss/defaultTheme'
import plugin from 'tailwindcss/plugin'

/**
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'site-malibu': '#68C7E8',
        'site-deep-green': '#005F19',
        'site-gold': '#FFD700'
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
        'site-raleway': ['Raleway', 'sans-serif'],
        'site-cleanvertising': ['Raleway', 'sans-serif']
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
