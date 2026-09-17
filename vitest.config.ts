import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['packages/**/*.test.ts', 'client/src/**/*.test.ts', 'generator/src/**/*.test.ts'] } });
