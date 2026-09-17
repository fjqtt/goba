import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const base = normalizedBasePath(process.env.VITE_BASE_PATH ?? '/');
  return {
    base,
    plugins: [
      react(),
      spaEntryPoints(['practice/today', 'statistics']),
      VitePWA({
        registerType: 'prompt',
        devOptions: { enabled: false },
        manifest: {
          name: 'Тихий ход — цумэго',
          short_name: 'Тихий ход',
          description: 'Короткие тренировки по цумэго, доступные без сети.',
          lang: 'ru',
          start_url: `${base}practice/today`,
          scope: base,
          display: 'standalone',
          background_color: '#f2f0e9',
          theme_color: '#10211b',
          icons: [{
            src: `${base}app-icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          }],
        },
        workbox: {
          navigateFallback: `${base}index.html`,
          globPatterns: ['**/*.{js,css,html,svg,woff2,json}'],
        },
      }),
    ],
    resolve: {
      alias: [
        { find: /^preact\/hooks$/, replacement: 'react' },
        { find: /^preact$/, replacement: 'react' },
      ],
    },
  };
});

function normalizedBasePath(value: string): string {
  return `/${value.replace(/^\/+|\/+$/g, '')}${value === '/' ? '' : '/'}`;
}

function spaEntryPoints(routes: string[]): Plugin {
  let outputDirectory = '';
  return {
    name: 'spa-entry-points',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    async writeBundle() {
      const index = await readFile(resolve(outputDirectory, 'index.html'));
      await Promise.all(routes.map(async route => {
        const directory = resolve(outputDirectory, route);
        await mkdir(directory, { recursive: true });
        await writeFile(resolve(directory, 'index.html'), index);
      }));
    },
  };
}
