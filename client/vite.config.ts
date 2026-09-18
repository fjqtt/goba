import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { BOOK } from './src/book';

export default defineConfig(() => {
  const base = normalizedBasePath(process.env.VITE_BASE_PATH ?? '/');
  return {
    base,
    plugins: [
      react(),
      bookHtml(),
      spaEntryPoints(['practice/today', 'statistics', 'settings']),
      VitePWA({
        registerType: 'prompt',
        devOptions: { enabled: false },
        manifest: {
          name: BOOK.title.en,
          short_name: BOOK.shortTitle.en,
          description: BOOK.tagline.en,
          lang: 'en',
          start_url: `${base}practice/today`,
          scope: base,
          display: 'standalone',
          background_color: '#f2f0e9',
          theme_color: '#10211b',
          icons: [{
            src: `${base}app-icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          }, {
            src: `${base}app-icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          }],
        },
        workbox: {
          navigateFallback: `${base}index.html`,
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
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

/** Injects the book title and tagline so index.html never drifts from BOOK. */
function bookHtml(): Plugin {
  return {
    name: 'book-html',
    transformIndexHtml: html => html
      .replaceAll('%BOOK_TITLE%', BOOK.title.en)
      .replaceAll('%BOOK_DESCRIPTION%', `${BOOK.tagline.en} ${BOOK.tagline.ru}`),
  };
}

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
