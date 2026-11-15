import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { ossUploadProxy } from './config/ossProxy';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = {
    '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true, ws: true },
    ...ossUploadProxy(env.OSS_UPLOAD_TARGET || 'https://ai-interview-storage.oss-cn-hangzhou.aliyuncs.com'),
  };
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: { proxy },
    build: {
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd'],
            query: ['@tanstack/react-query'],
            charts: ['echarts'],
          },
        },
      },
    },
  };
});
