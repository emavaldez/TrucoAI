/**
 * ESLint 9 — flat config.
 *
 * Reglas `recommended` (JS + TypeScript) como error para el código nuevo
 * (`src/engine/**`, `src/app/**`, `src/ui/views/**`, `src/ai/**`).
 *
 * El código legacy (que se borra en las historias 1-x / 3-5) y los tests/scripts
 * existentes quedan con las reglas ruidosas apagadas o en `warn` para que
 * `npm run lint` salga con código 0 sin tocar `src/` (ver historia 0-1, AC 3).
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Rutas del código viejo + tests/scripts existentes: reglas ruidosas en warn/off. */
const legacy = [
  'src/core/**',
  'src/App.ts',
  'src/main.ts',
  'src/types.ts',
  'src/ui/UIManager.ts',
  'src/ai/AIPlayer.ts',
  'src/ai/DecisionEngine.ts',
  'src/ai/CardEvaluator.ts',
  'src/__tests__/**',
  'scripts/**',
];

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
  },
  {
    files: legacy,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'no-fallthrough': 'warn',
      'no-cond-assign': 'warn',
      'no-constant-condition': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },
);
