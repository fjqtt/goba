# Problem Generator

Отдельный Fastify-сервис для импорта SGF, формализации цели и запуска ограниченных solver workers. Результат solver сохраняется как кандидат для проверки; он не публикуется автоматически.

- [Архитектура](PLAN.md)
- [Прогресс](PROGRESS.md)
- [RZS feasibility](RZS_FEASIBILITY.md)
- [Mac solver evaluation](MAC_SOLVER_EVALUATION.md)
- [Передача работы](../HANDOFF.md)

Контракт публикуемого контента — `@goba/problem-contract`. Доступа к пользовательской базе Client у Generator не будет.

## Запуск

```bash
npm run generator:start
```

Сервис слушает `http://127.0.0.1:4310`. Реализованы:

- `POST /v1/imports/sgf` — SGF collection → drafts;
- `GET /v1/drafts` и `GET /v1/drafts/:id`;
- `PATCH /v1/drafts/:id` — подтверждение цели и target group с `If-Match`;
- `POST /v1/jobs` — идемпотентный запуск `tsumego.js` или GNU Go Owl с `Idempotency-Key`;
- `GET /v1/jobs/:id` — статус и raw artifacts;
- `GET /health`.

Очередь и drafts пока находятся в памяти и пропадают после рестарта. Это вертикальный срез API, а не production storage.

## Проверка SGF без автоматического принятия цели

```bash
npm run probe --workspace @goba/generator -- /path/to/collection.sgf 1 4
```

Команда строит несколько гипотез из target candidates, запускает каждую в отдельном процессе и печатает JSONL. Метка `automated-hypothesis-only` означает, что результат требует проверки куратора. Для первого примера Cho все гипотезы выходят за ограниченную область `tsumego.js`.

## GNU Go на macOS

```bash
brew install gnu-go
npm run probe:gnugo --workspace @goba/generator -- \
  /path/to/collection.sgf 8 1 4 /private/tmp/goba-gnugo-probe
```

Аргументы после файла: номер первой задачи (с 1), число задач, максимум target-гипотез, каталог артефактов. Команда сохраняет Owl SGF trees и JSONL summary. Результат всегда имеет `status: "unknown"` и `verification: "heuristic-candidate-only"`: GNU Go используется для кандидатов и веток, а не для автоматического подтверждения решения.

## Связать printable answer key

```bash
npm run link:printable-key --workspace @goba/generator -- \
  /path/to/cho-1.sgf /path/to/go-problems.json /private/tmp/cho-answer-links.json
```

Команда не копирует corpus в проект. Она хеширует оба restricted source, извлекает root moves/printable line и ставит `linkedDraftId` только при точном совпадении setup и отсутствии ошибок разбора. В проверенных локальных файлах безопасно связались 845/900 записей; 55 постановок различаются, одна из них также содержит строку неверной ширины.

## Полный GNU Go audit книги

```bash
npm run audit:gnugo-book --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/goba-cho-answer-links.json \
  /private/tmp/goba-cho-gnugo-audit 1 900 4
```

Audit проверяет все target-гипотезы, всю доступную printable line, каждый ход линии через `RulesAdapter` и каждую сохранённую ветвь Owl tree. Отчёт checkpoint-ится каждые 10 задач и продолжает незавершённый прогон при повторном запуске. Дополнительные ходы остаются `unclassified`; совпадение не превращает эвристический Owl output в proof.
