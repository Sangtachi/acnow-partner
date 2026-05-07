import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyRaw = env.VITE_DEV_API_PROXY_TARGET || env.VITE_API_BASE_URL || 'http://127.0.0.1:4000';
  let apiProxyTarget = proxyRaw.replace(/\/$/, '');
  try {
    apiProxyTarget = new URL(proxyRaw).origin;
  } catch {
    apiProxyTarget = apiProxyTarget.replace(/\/?api\/?$/i, '');
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4174,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
