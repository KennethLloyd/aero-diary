import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import base from './eslint.config.mjs';

// CI checks changed files so legacy formatting can be adopted as code is touched.
export default defineConfig([
  ...base,
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['function', 'block-like'] },
        { blankLine: 'always', prev: ['function', 'block-like'], next: '*' },
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: 'if', next: '*' },
        { blankLine: 'any', prev: 'if', next: 'if' },
      ],
    },
  },
]);
