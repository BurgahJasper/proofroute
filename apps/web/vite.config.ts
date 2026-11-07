import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const apiPort = env.PORT || '3000';
  return {
    envDir: root,
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
        '/healthz': `http://127.0.0.1:${apiPort}`,
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
