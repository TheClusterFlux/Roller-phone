import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        hub: resolve(__dirname, 'src/hub/index.html'),
        bowling: resolve(__dirname, 'src/bowling/index.html'),
        hexagon: resolve(__dirname, 'src/hexagon/index.html'),
      },
    },
  },
  server: {
    host: true,
  },
});
