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
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-undef': 'off',
      'no-irregular-whitespace': 'off'
    }
  },
  {
    ignores: [
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
