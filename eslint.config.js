import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['dist/', '.astro/', 'node_modules/', 'src/**/*.svelte', 'src/**/*.astro', 'src/engine/workers/*.ts', 'src/env.d.ts'],
  },
);
