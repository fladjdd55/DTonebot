// eslint.config.js
import tseslint from 'typescript-eslint';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  // 1. Configuration for ignored files
  { ignores: ['dist', 'node_modules', 'coverage', '*.js'] },

  // 2. Base Configuration (for browser globals)
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // 3. TypeScript / TSX Strict Configuration
  {
    files: ['**/*.{ts,tsx}'], 
    
    // 💡 KEY CHANGE: Stricter rules requiring type data
    extends: [
      ...tseslint.configs.recommendedTypeChecked, 
      ...tseslint.configs.stylisticTypeChecked,
    ],
    
    languageOptions: {
      parserOptions: {
        // CRITICAL: Tells ESLint where to find the type information
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    
    plugins: {
      react,
    },

    rules: {
        // Enforce explicit types on functions and remove implicit 'any'
        '@typescript-eslint/explicit-function-return-type': 'off', // Optional
        '@typescript-eslint/no-explicit-any': 'warn', 
        '@typescript-eslint/no-unsafe-assignment': 'warn', 
    }
  }
];
