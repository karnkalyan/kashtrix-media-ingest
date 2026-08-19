import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Main backend API
          '/api': {
            target: 'http://127.0.0.1:3005',
            changeOrigin: true,
          },
          // Main backend WebSocket
          '/ws': {
            target: 'ws://127.0.0.1:3005',
            ws: true,
          },
          // Media paths use the same URLs locally and in production.
          '^/(live|dash|hls|recordings|recording-thumbnail|recording-preview|vod|ts|media)': {
            target: 'http://127.0.0.1:3005',
            changeOrigin: true,
          },
        },
      },
      plugins: [
        react(),
        tailwindcss(),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
