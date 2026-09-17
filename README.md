# Go practice

Two projects for tsumego practice:

- [`client/`](client/) — offline-first PWA and a future public API. [Plan](client/PLAN.md), [checklist](client/PROGRESS.md).
- [`generator/`](generator/) — generator for verified problems. [Plan](generator/PLAN.md), [checklist](generator/PROGRESS.md).
- [`packages/problem-contract/`](packages/problem-contract/) — shared ProblemV1 format, rules, and replay validation.

**New agents should start with [HANDOFF.md](HANDOFF.md).**

## Local development

Node.js 22.12+ (current Node 22 LTS recommended), npm 10+.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

`npm run preview` serves the production build for service-worker testing. The development server does not register the service worker.

## Test deployment on GitHub Pages

The [`.github/workflows/pages.yml`](.github/workflows/pages.yml) workflow checks types and tests, builds Client with the `/goba/` base path, and publishes `client/dist`:

- practice: `https://fjqtt.github.io/goba/practice/today`;
- statistics: `https://fjqtt.github.io/goba/statistics`;
- settings: `https://fjqtt.github.io/goba/settings`.

The pack is marked `LicenseRef-Restricted-Research`. This test deployment is not an authorized public catalog.

Commits and pushes require the owner's prior approval.
