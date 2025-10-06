import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: [
          './packages/core/tsconfig.json',
          './packages/k8/tsconfig.json',
          './packages/cli/tsconfig.json',
          './tsconfig.json'
        ],
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        NodeJS: 'readonly',
        fetch: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules
    }
  },
  {
    ignores: [
      '**/*.js',
      'node_modules/**',
      'dist/**',
      'packages/*/dist/**',
      'legacy/dist/**',
      'docs/**',
      'examples/simple/apps/api/*.js',
      'examples/simple/apps/frontend/*.js',
      'legacy/examples/**/*.js',
      'legacy/examples/**/dist/**',
      'packages/k8/src/generated/**'
    ]
  }
]
