import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // `any` is used deliberately across this codebase; not a lint-gate concern.
      '@typescript-eslint/no-explicit-any': 'off',
      // Surfaced as a warning for a first green gate; tighten (max-warnings ratchet) later.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  }
);
