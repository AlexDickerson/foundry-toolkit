import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'server-dist/**',
      'node_modules/**',
      'src/i18n/en.json',
      'vite.config.ts',
      'vitest.config.ts',
      'postcss.config.js',
      '**/*.test.ts',
      '**/*.test.tsx',
      // Pre-existing portal surfaces ported forward without lint history.
      // The creator-side eslint config was never applied to them; cleaning
      // them up is a separate follow-up.
      'src/features/globe/Globe.tsx',
      'src/features/aurus/Leaderboard.tsx',
      'src/features/characters/lib/live.ts',
      'src/app/Layout.tsx',
      'src/app/Nav.tsx',
      'src/features/characters/CharactersLayout.tsx',
      'src/features/home/Home.tsx',
      'server/**',
      'mock/**',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Newer rules from eslint-plugin-react-hooks / typescript-eslint that
      // trip on patterns predating the merge. Demoted to warn here so the
      // merge PR doesn't balloon into a ported-code cleanup; revisit in a
      // dedicated tightening pass.
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-unnecessary-type-parameters': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-confusing-void-expression': 'warn',
    },
  },
  prettier,
);
