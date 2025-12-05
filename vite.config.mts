import { defineConfig } from 'vite';
// Ensure this plugin is used
import reactswc from '@vitejs/plugin-react-swc'; 

export default defineConfig({
  plugins: [
    // 💡 KEY CHANGE: Using the SWC compiler
    reactswc(), 
  ],
  server: {
    // Proxy for calling the Node Backend
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});
