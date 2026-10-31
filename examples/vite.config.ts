import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here('.'),
  base: './',
  resolve: {
    alias: [
      { find: /^multi-screen$/, replacement: here('../src/core/index.ts') },
      { find: /^multi-screen\/dockview$/, replacement: here('../src/dockview/index.ts') },
      { find: /^multi-screen\/react$/, replacement: here('../src/react/index.ts') },
    ],
  },
  build: {
    outDir: here('dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: here('index.html'), control: here('control.html'), device: here('device.html') },
    },
  },
});
