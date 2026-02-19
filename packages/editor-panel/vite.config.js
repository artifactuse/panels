import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  base: './',

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  build: {
    rollupOptions: {
      input: {
        video: resolve(__dirname, 'video.html'),
        canvas: resolve(__dirname, 'canvas.html'),
      },
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true,
  },

  server: {
    port: 3001,
  },
});