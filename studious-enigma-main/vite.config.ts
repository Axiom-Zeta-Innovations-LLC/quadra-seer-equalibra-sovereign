import path from 'path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const atlanteanProxyTarget = env.VITE_ATLANTEAN_PROXY_TARGET || 'http://127.0.0.1:5001';
    return {
      build: {
        // Keep warnings realistic while we split heavy dependencies into vendor chunks.
        chunkSizeWarningLimit: 900,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) {
                return undefined;
              }
              if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) {
                return 'vendor-markdown';
              }
              if (id.includes('pdfjs-dist')) {
                return 'vendor-pdf';
              }
              if (id.includes('mammoth')) {
                return 'vendor-mammoth';
              }
              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }
              if (id.includes('jszip')) {
                return 'vendor-jszip';
              }
              if (id.includes('@google/genai')) {
                return 'vendor-ai';
              }
              if (id.includes('react') || id.includes('scheduler')) {
                return 'vendor-react';
              }
              return 'vendor-misc';
            },
          },
        },
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/atlantean': {
            target: atlanteanProxyTarget,
            changeOrigin: true,
          },
          '/health': {
            target: atlanteanProxyTarget,
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      test: {
        environment: 'jsdom',
        globals: true,
      },
      define: {
        // SECURITY: Do NOT inject API keys into frontend builds
        // All sensitive API calls must go through backend
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
