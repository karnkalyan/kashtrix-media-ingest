import path from 'path';
import { createLogger, defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const defaultLogger = createLogger();
const customLogger = {
    ...defaultLogger,
    error(msg: string, options?: any) {
        // Suppress transient backend restart proxy connection errors (ECONNREFUSED / ECONNRESET / ECONNABORTED during dev restarts)
        if (
            (msg.includes('proxy error') || msg.includes('proxy socket error')) &&
            (msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET') || msg.includes('ECONNABORTED') || msg.includes('ETIMEDOUT') || msg.includes('EPIPE'))
        ) {
            return;
        }
        defaultLogger.error(msg, options);
    },
};

const attachProxyErrorHandler = (proxy: any) => {
    proxy.on('error', (err: any, _req: any, res: any) => {
        if (res && typeof res.writeHead === 'function') {
            if (!res.headersSent) {
                res.writeHead(503, {
                    'Content-Type': 'application/json',
                    'Retry-After': '1',
                });
            }
            res.end(JSON.stringify({ error: 'Backend server is restarting or reconnecting', code: err.code }));
        } else if (res && typeof res.destroy === 'function') {
            try { res.destroy(); } catch (_) {}
        }
    });
    proxy.on('proxyReqWs', (_proxyReq: any, _req: any, socket: any) => {
        if (socket && typeof socket.on === 'function') {
            socket.on('error', () => {});
        }
    });
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      customLogger,
      server: {
        port: 3000,
        host: '0.0.0.0',
        watch: {
          ignored: [
            '**/backend/**',
            '**/media/**',
            '**/temp/**',
            '**/scratch/**',
            '**/data/**',
            '**/*.test.js',
            '**/*.test.ts',
          ],
        },
        proxy: {
          // Main backend API
          '/api': {
            target: 'http://127.0.0.1:3005',
            changeOrigin: true,
            configure: attachProxyErrorHandler,
          },
          // Main backend WebSocket
          '/ws': {
            target: 'ws://127.0.0.1:3005',
            ws: true,
            configure: attachProxyErrorHandler,
          },
          // Media paths use the same URLs locally and in production.
          '^/(live|dash|hls|recordings|recording-thumbnail|recording-preview|vod|ts|media)': {
            target: 'http://127.0.0.1:3005',
            changeOrigin: true,
            configure: attachProxyErrorHandler,
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
