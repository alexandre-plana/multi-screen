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
    // Fonts, film and screenshots are referenced from motion/ and docs/assets/: Vite copies and fingerprints them.
    assetsInlineLimit: 0,
    outDir: here('dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: here('index.html'),
        docs: here('docs.html'),
        control: here('control.html'),
        device: here('device.html'),
        editor: here('editor.html'),
        manager: here('manager.html'),
      },
    },
  },
});
