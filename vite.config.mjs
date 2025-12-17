import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            // This allows you to simply import from '@shared/...' if you prefer
            '@shared': path.resolve(__dirname, '../shared'),
        },
    },
    server: {
        port: 5200,
        fs: {
            // Allow serving files from one level up to the project root
            allow: ['..'],
        },
    },
    // ✅ NEW: Build optimizations
    build: {
        chunkSizeWarningLimit: 1000, // Raises warning limit to 1MB
        rollupOptions: {
            output: {
                manualChunks: {
                    // Forces these libraries into separate files
                    vendor: ['react', 'react-dom', 'lucide-react'],
                    stripe: ['@stripe/react-stripe-js', '@stripe/stripe-js']
                },
            },
        },
    },
});
