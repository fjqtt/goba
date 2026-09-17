# Go practice

Два проекта для тренировки цумэго:

- [`client/`](client/) — offline-first PWA и будущий публичный API. [План](client/PLAN.md), [checklist](client/PROGRESS.md).
- [`generator/`](generator/) — генератор проверенных задач. [План](generator/PLAN.md), [checklist](generator/PROGRESS.md).
- [`packages/problem-contract/`](packages/problem-contract/) — общий формат ProblemV1, правила и replay validation.

**Следующему агенту: начать с [HANDOFF.md](HANDOFF.md).**

## Локальная разработка

Node.js 22.12+ (рекомендуется актуальный Node 22 LTS), npm 10+.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

`npm run preview` запускает production-сборку для проверки service worker. Dev-сервер service worker не регистрирует.

## Тестовый GitHub Pages

Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) проверяет типы и тесты, собирает Client с base path `/goba/` и публикует `client/dist`:

- практика: `https://fjqtt.github.io/goba/practice/today`;
- статистика: `https://fjqtt.github.io/goba/statistics`.

Pack имеет статус `LicenseRef-Restricted-Research`; тестовый Pages deployment не является разрешённым публичным каталогом.

Коммиты и push выполняются только после согласования с владельцем.
