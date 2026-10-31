import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^multi-screen$/, replacement: src('core/index.ts') },
      { find: /^multi-screen\/dockview$/, replacement: src('dockview/index.ts') },
      { find: /^multi-screen\/react$/, replacement: src('react/index.ts') },
      { find: /^multi-screen\/server$/, replacement: src('server/index.ts') },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
