import { defineConfig } from 'vite';
// Ensure this specific plugin is installed: npm i -D @vitejs/plugin-react-swc
import reactswc from '@vitejs/plugin-react-swc'; 

export default defineConfig({
  plugins: [
    // 💡 KEY CHANGE: Using the SWC compiler for Fast Refresh
    reactswc(), 
  ],
  server: {
    // Ensure this matches the port your server uses (5000)
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});
