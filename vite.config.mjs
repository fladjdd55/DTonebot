import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const ReactCompilerConfig = { /* ...placeholder for future config... */ };

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ["babel-plugin-react-compiler", ReactCompilerConfig],
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
