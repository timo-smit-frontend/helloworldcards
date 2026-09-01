import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'worker/worker-configuration.d.ts', '.wrangler/**', '.vite-temp/**', '.cache/**']
  },
  ...compat.config({
    root: true,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true
      }
    },
    env: {
      browser: true,
      commonjs: true,
      es6: true
    },
    extends: ['eslint:recommended'],
    overrides: [
      {
        files: ['**/*.{js,jsx,ts,tsx}'],
        rules: {
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/ban-ts-comment': 'off',
          'no-restricted-syntax': [
            'error',
            {
              selector: "JSXOpeningElement[name.name='img']",
              message: 'Use Image from ~/components/elements/Image with required width and height attributes.'
            }
          ]
        },
        plugins: ['react', 'jsx-a11y', 'react-hooks', 'prettier'],
        extends: [
          'plugin:react/recommended',
          'plugin:react/jsx-runtime',
          'plugin:jsx-a11y/strict',
          'plugin:react-hooks/recommended',
          'plugin:prettier/recommended'
        ],
        settings: {
          react: {
            version: 'detect'
          },
          formComponents: ['Form'],
          linkComponents: [
            {
              name: 'Link',
              linkAttribute: 'to'
            },
            {
              name: 'NavLink',
              linkAttribute: 'to'
            }
          ]
        }
      },
      {
        files: ['**/*.{ts,tsx}'],
        rules: {
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/ban-ts-comment': 'off'
        },
        plugins: ['@typescript-eslint'],
        parser: '@typescript-eslint/parser',
        extends: ['plugin:@typescript-eslint/recommended']
      },
      {
        files: ['eslint.config.js', 'vite.config.ts', 'vitest.config.ts', 'vite/**/*.ts', 'test/**/*.ts'],
        env: {
          node: true
        }
      }
    ]
  })
]
