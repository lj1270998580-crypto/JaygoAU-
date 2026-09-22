import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 渲染层（React 前端）由 Vite 构建到 dist/，Electron 主进程单独编译到 dist-electron/。
export default defineConfig({
  root: '.',
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('jszip') || id.includes('mammoth') || id.includes('pdf-parse')) {
              return 'vendor-docs';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
