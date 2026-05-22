import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'fs';

let buildNumber = '?';
try {
  buildNumber = readFileSync('.buildnum', 'utf-8').trim();
} catch (_) {}

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  define: {
    __APP_VERSION__: JSON.stringify('build ' + buildNumber),
  },
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
