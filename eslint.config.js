import tseslint from 'typescript-eslint';
import globals from 'globals';
import react from 'eslint-plugin-react';
// Assuming 'defineConfig' and 'globalIgnores' are defined or imported elsewhere if needed
// import { defineConfig, globalIgnores } from 'vite-plugin-eslint'; 

export default [
  // 1. Root Configuration (Ignores and Global Environment)
  {
    // Ignores should be handled by the project structure, but included for completeness
    // globalIgnores(['dist']), 
    
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // 2. TypeScript / TSX Strict Configuration Block
  {
    files: ['**/*.{ts,tsx}'], 
    
    // 💡 KEY CHANGE: Using the strictest recommended rules for type safety
    extends: [
      // Removes standard recommended and replaces with stricter checks
      ...tseslint.configs.strictTypeChecked, 
      ...tseslint.configs.stylisticTypeChecked,
    ],
    
    languageOptions: {
      parserOptions: {
        // CRITICAL: Tells ESLint where to find your type information
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        // Assuming this is run from the project root
        tsconfigRootDir: import.meta.dirname, 
      },
    },
    
    plugins: {
      react,
    },

    rules: {
        // Enforce explicit boolean checks, prevents common bugs
        'no-constant-condition': 'error', 
        // Allows you to explicitly use 'any' if necessary, but warns you about it
        '@typescript-eslint/no-explicit-any': 'warn', 
        
        // This is necessary because strictTypeChecked will throw errors on all implicit 'any'
        // You must now manually fix all resulting errors in your code!
    }
  }
];
