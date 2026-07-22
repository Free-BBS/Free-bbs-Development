import eslint from '@eslint/js';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.ts'],
  },
  eslint.configs.recommended,
];
