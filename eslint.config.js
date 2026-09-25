/**
 * ESLint 9 — flat config. Reglas `recommended` (JS + TypeScript) como error en todo el código.
 * El legacy ya no existe (historia 3-5): no hay excepciones.
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      'Papers/',
      'docs/',
      'public/',
      'playwright-report/',
      'test-results/',
      '.tmp/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Convención del proyecto: `_` como prefijo de stubs / parámetros y
      // variables no usados (historia 1-1, auditoría ciclo 1).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  }
);
