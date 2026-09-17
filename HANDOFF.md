# Передача работы

Обновлено: 2026-09-17 Europe/Lisbon. Активный проект: **Client**. Последний блок — отдельная статистика, полный сброс прогресса и повышение устойчивости локального хранилища.

## Цель

Дать в Client один перемешанный, восстанавливаемый забег по локальному сборнику Чо: одна попытка на классифицированной ветке, correct/wrong statistics, повтор ошибок и reset. Неизвестные ветки не превращать в false wrong. Любое продолжение должно обновлять `client/PROGRESS.md` и этот checkpoint.

## Client pack — текущий результат

- Создан deterministic normalizer `generator/src/catalog/cho-client-pack.ts`: printable line → валидный ProblemV1 с target из выбранного GNU Go candidate, default opponent replies, terminal success, state hashes и semantic hash.
- Собран pack `client/public/packs/cho-elementary/1/`: **861/900** задач, 840 exact-linked + 21 reconciled; 9 shards, около 1.9 MiB.
- Исключения сохранены в `exclusions.json`: 21 no-selected-target, 10 source-line-illegal, 8 genuine setup differences. Итого 39.
- Pack имеет status `LicenseRef-Restricted-Research` и candidate tags. Не публиковать как разрешённый или экспертно проверенный каталог.
- `client/src/catalog/bundled-catalog.ts` устанавливает pack через существующий staged installer, проверяет 861 записей и затем читает ready revision из IndexedDB без повторной загрузки.
- `App.tsx` использует Cho collection вместо единственного sample; прежняя перемешанная очередь, восстановление, statistics, mistakes-only и reset работают на новом collection id.
- PWA precache включает JSON, поэтому manifest и shards входят в production service worker.
- Интеграционный тест устанавливает все 9 shards, валидирует 861 ProblemV1 и независимо replay-ит каждый edge/state hash после десериализации.
- Missing branch остаётся `unclassified`: клиент показывает нейтральный результат и не записывает wrong. Поэтому строгая «одна попытка» действует только на явно классифицированных ветках; false wrong не вводится.
- Статистика теперь отдельная route/page `/statistics`, а не modal. На практике есть явная кнопка «Статистика», на статистике — «← Назад». Страница показывает correct, wrong, unseen, accuracy и общий progress; оттуда запускаются новые задачи, повтор ошибок и reset.
- Reset атомарно очищает collection results, active session, review events, FSRS cards и outbox. Установленный pack и `device-id` остаются.
- При старте Client best-effort вызывает `navigator.storage.persist()`. Данные по-прежнему локальные: server sync/export пока нет.
- Подготовлен GitHub Pages deployment для `https://fjqtt.github.io/goba/`: `VITE_BASE_PATH=/goba/`, прямые HTML entry points practice/statistics и официальный Actions artifact deploy. Публичный репозиторий `https://github.com/fjqtt/goba` создан пустым и подключён как `origin`; commit/push ещё не выполнены.

## Аудит путей у 39 исключений

- Заявленная printable solution line есть у **38/39** исключений. Единственное исключение без ходов — №804: в elementary key есть позиция, но нет numbered answer moves.
- **20** линий легально проигрываются, но GNU Go не выбрал target-группу: exact №193, 214, 724, 887 и reconciled №39, 87, 113, 166, 175, 209, 343, 412, 414, 496, 502, 517, 529, 642, 775, 892.
- **10** заявленных линий непригодны: №57, 103, 108, 200, 249, 282, 537, 640, 690, 746 завершаются `suicide` при независимом replay восстановленной base position.
- У **7** задач линия легальна хотя бы на одной из конфликтующих постановок, но версия setup не подтверждена: №4, 8, 40, 93, 420, 533, 617. KataGo triage предпочитает SGF у 40/420, key у 533/617 и не различает 4/8/93; это ranking signal, не proof цели.
- №216 имеет строку ходов, но она незаконна в обеих версиях (`suicide` в key position, `occupied` в SGF position).
- Итого: **38** заявленных путей, **27** технически легальных путей хотя бы на одной кандидатной постановке; **ни одна** из этих 39 задач пока не удовлетворяет всем требованиям graded Client pack. Для 27 нужен target/setup review; для оставшихся 12 нужен исправленный источник решения.

## Текущий результат

- Создан Fastify/TypeScript сервис в `generator/` и добавлен в npm workspace.
- `POST /v1/imports/sgf` принимает до 5 MiB, разбирает SGF collections через `@sabaki/sgf`, корректно обрабатывает AB/AW/AE, compressed points, SZ и PL.
- Каждый setup node становится детерминированным draft с provenance, asset SHA-256, viewport и связными группами-кандидатами. Цель не угадывается при импорте.
- `PATCH /v1/drafts/:id` подтверждает `capture | live`, цвет и anchor; требует числовой `If-Match` и строит canonical task + semantic hash.
- `POST /v1/jobs` требует `Idempotency-Key`, точную draft revision и подтверждённую задачу. Повтор того же запроса возвращает прежний job; повтор ключа с другим payload даёт 409.
- `tsumego.js` работает в отдельном Node-процессе. Есть hard wall timeout, heap limit, output limit, raw result/log/tree artifacts и раздельные `proven-win | proven-loss | unknown | unsupported | error`.
- Admission `tsumego.js` допускает согласованную цель/цвет и связанную пустую область до 15 пунктов. Open positions получают `unsupported`.
- Добавлен нативный Mac CPU lane: GNU Go 3.8 Owl adapter. Он запускает `owl_attack`/`owl_defend`, проверяет ходы через `owl_does_*`, сохраняет raw SGF tree и hashes бинарника/config/input. Есть hard wall/output/tree limits.
- GNU Go не объявляется proof engine: положительный ответ возвращается как `status: unknown`, `outcome: unknown`, `verification: heuristic-candidate-only`.
- `POST /v1/jobs` принимает `adapter: "gnugo-owl"`; dispatcher выбирает GNU Go configuration. API regression test проверяет маршрутизацию.
- `generator/src/cli/probe-gnugo-sgf.ts` запускает диапазон задач из SGF collection, печатает JSONL и сохраняет Owl trees отдельно от исходников.
- `generator/src/cli/audit-gnugo-book.ts` batch-проверяет всю доступную printable line, checkpoint-ит JSON и сохраняет все подходящие target trees. `gnugo-tree-audit.ts` независимо replay-ит каждое ребро через `RulesAdapter`.

## Corpus Cho

Локальный файл: `/private/tmp/cho-1.sgf`.

- SHA-256: `sha256:2667ddc1f73d9256820a598427ae212be78874c33932c5baf99d97793d8df432`.
- 900 позиций, 0 source trees, все B to play; среднее число target candidates — 6.1067.
- Rights metadata остаётся `restricted`: комментарий источника говорит, что решения исключены из-за copyright. Ничего из этого корпуса не публиковать без отдельного решения по правам.
- Probe первой позиции через `tsumego.js` перебрал 4 группы. Связанные пустые области имеют 347–350 пунктов, поэтому все гипотезы получили `unsupported`.
- GNU Go probe задачи №8 прошёл полный путь из скачанного файла. Для чёрной группы он выбрал `A18`, совпадающий с известным root answer, и выгрузил SGF с 10 attack / 8 defense variations. Он также принял `H19` как альтернативу, которой нет в доступном ключе, поэтому дерево остаётся review candidate.
- Артефакт задачи №8: `/private/tmp/goba-gnugo-cho-8/problem-8-candidate-608-b.sgf`.
- На 37 размеченных upstream `chao_vol1` fixtures (TOLIVE, B to play/win) GNU Go совпал своим первым ходом с авторским в 27/37 и признал авторский ход работающим в 33/37. Более глубокие Owl limits не изменили четыре расхождения.
- `/private/tmp/cho-go-problems.json` содержит restricted community answer key для 900 elementary problems. `link:printable-key` строго связал 845 записей; 55 setup отличаются, problem 201 имеет malformed row. Manifest: `/private/tmp/goba-cho-answer-links.json`. Ключ содержит root/printable lines, а не готовые интерактивные trees.
- Все 845 exact-linked задачи прогнаны. Полный source path найден для 374/723 задач с линией; 69 имеют незаконные соседние ветви, поэтому clean full-line set — 305. Для 122 multi-root задач все roots присутствуют в 6 деревьях, полностью легально — в одном.
- Остальные строгие классы: 73 incomplete continuation, 392 root-only/incomplete root set, 5 no matching target (193, 214, 724, 804, 887). Все source lines легальны по `ld-v1`.
- Сохранены 3 327 SGF trees без export failures. 459 задач имеют дополнительные root moves (`unclassified`); у 189 есть illegal branch хотя бы в одном candidate tree.
- Полный отчёт: `/private/tmp/goba-cho-gnugo-audit/audit-report.json`; таблица по каждой задаче: `/private/tmp/goba-cho-gnugo-audit/audit-summary.csv`; trees: `/private/tmp/goba-cho-gnugo-audit/trees/`; сводка: `generator/CHO_BOOK_AUDIT.md`.
- 55 setup mismatches классифицированы: **46** `numbered-overlay-flattened`, **1** malformed row задачи 201 восстановлен детерминированно, **8** настоящих различий постановок: 4, 8, 40, 93, 216, 420, 533, 617. Отчёт: `/private/tmp/goba-cho-reconciliation/reconciliation-report.json`.
- На 47 восстановленных base-position candidates GNU Go дал: 1 full-line, 1 partial-line, 19 root-only, 16 no-target, 10 source-line-illegal. Отчёт: `/private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json`. Эти записи остаются кандидатами сверки.
- KataGo 1.16.2 Metal завершил **2 642/2 642** состояния перед каждым доступным ходом по AGA, 32 visits, 0 API errors, 603 s: 2 393 exact-linked, 197 reconciled, по 26 для key/SGF версий восьми настоящих различий.
- Exact-linked: key move top-5 local policy в 2 366/2 393. GNU Go имеет продолжение на 1 540 префиксах и содержит следующий key move на 1 366. На 174 прямых расхождениях KataGo ставит key выше 126 раз, GNU Go-вариант — 48.
- Восемь setup differences: SGF signal сильнее у 40/420; key line остаётся легальной, а SGF нет у 533/617; обе версии незаконны у 216; 4/8/93 неразличимы. Не принимать их автоматически без target proof/curation.
- Итог: `generator/KATAGO_CROSSCHECK.md`. Full report: `/private/tmp/goba-cho-katago-crosscheck/analysis/crosscheck-report.json`; все состояния: `crosscheck-summary.csv`; очередь 254 review states: `crosscheck-review-queue.csv`.
- SHA-256: metadata `a28d14bc...`, results `c4ff7bef...`, report `32f11e22...`, summary CSV `5d369208...`, review queue `93b11a0a...`.

Команды воспроизведения:

```bash
npm run probe --workspace @goba/generator -- /private/tmp/cho-1.sgf 1 8
npm run probe:gnugo --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf 8 1 4 /private/tmp/goba-gnugo-cho-8
npm run link:printable-key --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/cho-go-problems.json \
  /private/tmp/goba-cho-answer-links.json
npm run audit:gnugo-book --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/goba-cho-answer-links.json \
  /private/tmp/goba-cho-gnugo-audit 1 900 4
npm run reconcile:printable-key --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/cho-go-problems.json \
  /private/tmp/goba-cho-reconciliation
node --import tsx generator/src/cli/prepare-katago-crosscheck.ts \
  /private/tmp/cho-1.sgf /private/tmp/goba-cho-gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/corrected-positions.sgf \
  /private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/reconciliation-report.json \
  /private/tmp/goba-cho-katago-crosscheck 32
node --import tsx generator/src/cli/run-katago-analysis.ts \
  /private/tmp/goba-cho-katago-crosscheck/queries.jsonl \
  /private/tmp/goba-cho-katago-crosscheck/results.jsonl \
  /private/tmp/goba-cho-katago-crosscheck/katago.log
node --import tsx generator/src/cli/analyze-katago-crosscheck.ts \
  /private/tmp/goba-cho-katago-crosscheck/metadata.json \
  /private/tmp/goba-cho-katago-crosscheck/results.jsonl \
  /private/tmp/goba-cho-katago-crosscheck/analysis \
  generator/KATAGO_CROSSCHECK.md
npm run build:cho-client-pack --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf \
  /private/tmp/goba-cho-gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/corrected-positions.sgf \
  /private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/reconciliation-report.json \
  client/public/packs/cho-elementary/1
```

## Следующий шаг

1. После явного подтверждения commit message: добавить файлы, создать первый commit, push `main`, включить Pages source `workflow`, дождаться зелёного deploy и проверить `https://fjqtt.github.io/goba/practice/today` на iPhone.
2. Проверить cold install 861 records, reload незаконченной попытки, offline reopen, `/statistics` и reset.
3. Разобрать 27 исключений с легальной линией: подтвердить target для 20 и выбрать/проверить setup+target для 7 version differences. №804, 10 suicide lines и №216 не включать без исправленного источника.
4. Для настоящей one-attempt wrong grading добавить только проверенные refutation branches. До этого неизвестный ход остаётся `unclassified` и не завершает попытку.
5. Вернуться к 254 строкам KataGo review queue и terminal verifier; candidate pack не переименовывать в verified/public.

## Главные файлы

- `generator/src/sgf/importer.ts` — collection importer и target candidates.
- `generator/src/store.ts` — drafts, optimistic annotation, in-memory jobs/idempotency.
- `generator/src/app.ts` — HTTP API и async job execution.
- `generator/src/solver/tsumego-runner.ts` — canonical SGF, admission, proof/tree driver.
- `generator/src/solver/tsumego-adapter.ts` — изолированный subprocess и resource limits.
- `generator/src/solver/gnugo-adapter.ts` — GNU Go GTP/Owl adapter и raw tree export.
- `generator/src/solver/solver-dispatcher.ts` — выбор CPU adapter по configuration id.
- `generator/src/cli/probe-sgf.ts` — research probe нескольких гипотез.
- `generator/src/cli/probe-gnugo-sgf.ts` — диапазон задач SGF → GNU Go JSONL + SGF artifacts.
- `generator/src/cli/match-solution-corpus.ts` — exact/symmetry matching внешнего solution corpus.
- `generator/src/corpus/printable-answer-key.ts` — parser компактного printable key без включения данных корпуса в repo.
- `generator/src/cli/link-printable-key.ts` — strict setup match и restricted manifest.
- `generator/src/cli/audit-gnugo-book.ts` — resumable full-book audit и tree artifacts.
- `generator/src/solver/gnugo-tree-audit.ts` — full-line matching и independent replay всех Owl branches.
- `generator/src/cli/reconcile-printable-key.ts` — классификация 55 setup mismatches и restricted corrected candidates.
- `generator/src/solver/katago-crosscheck.ts` — Analysis API coordinates, queries, policy ranks и GNU tree prefix map.
- `generator/src/cli/prepare-katago-crosscheck.ts` — запрос перед каждым ходом key line и обе версии спорных постановок.
- `generator/src/cli/run-katago-analysis.ts` — воспроизводимый Metal batch runner.
- `generator/src/cli/analyze-katago-crosscheck.ts` — JSON/CSV/Markdown сравнение key ↔ GNU Go ↔ KataGo.
- `generator/src/catalog/cho-client-pack.ts` — printable line → replayed ProblemV1 candidate.
- `generator/src/cli/build-cho-client-pack.ts` — deterministic 861-problem pack builder.
- `client/src/catalog/bundled-catalog.ts` — staged install и загрузка ready pack из IndexedDB.
- `client/src/components/StatsPage.tsx` — отдельная страница статистики и подтверждение reset.
- `client/src/practice/collection-progress.ts` — persisted run и атомарная очистка progress/SRS данных.
- `client/src/storage/database.ts` — Dexie schema, checkpoint и best-effort persistent storage request.
- `client/public/packs/cho-elementary/1/` — manifest, 9 shards и 39 exclusions.
- `generator/RZS_FEASIBILITY.md` — pinned RZS artifacts и environment blocker.
- `generator/MAC_SOLVER_EVALUATION.md` — проверенные Mac solvers, измерения и границы доверия.
- `generator/CHO_BOOK_AUDIT.md` — числа полного corpus audit и границы clean candidate set.
- `generator/CHO_RECONCILIATION.md` — причина 55 mismatches, 10 illegal recovered lines и triage 8 версий.
- `generator/KATAGO_CROSSCHECK.md` — полный cross-check каждого доступного хода key ↔ GNU Go ↔ KataGo.
- `packages/problem-contract/` — общий ProblemV1 и rules replay.

## Проверки

- `npm run check` — прошёл после Cho pack normalizer, builder и Client loader.
- `npm test -- --run` — 19 файлов / 54 теста прошли. Pack integration устанавливает все 9 shards, валидирует 861 ProblemV1 и replay-ит каждый edge/state hash.
- `npm run build` — Client и Generator собраны; PWA precache содержит 18 entries / 2.30 MiB, включая pack JSON.
- После страницы статистики: `npm run check` прошёл; `npm test -- --run` — 19 файлов / 54 теста; `npm run build --workspace @goba/client` прошёл, PWA precache 18 entries / 2352.78 KiB.
- HTTP smoke `/statistics` на `127.0.0.1:4180` вернул production app shell. Визуальный smoke не выполнен: CUA сообщает `Computer Use permissions are not granted`.
- GitHub Pages build: `VITE_BASE_PATH=/goba/ npm run build --workspace @goba/client` прошёл; precache содержит 19 entries / 2353.56 KiB. Статический smoke с mount `/goba/` вернул 200 для practice, statistics, JS, pack manifest, web manifest и service worker.
- Повторный `build-cho-client-pack` в `/private/tmp/goba-cho-client-pack-repro` byte-for-byte совпал с `client/public/packs/cho-elementary/1` (`diff -rq` без вывода).
- Production HTTP smoke: `/practice/today` и `/packs/cho-elementary/1/manifest.json` отвечают на `127.0.0.1:4179`; manifest сообщает 861 problems / 9 shards.
- UI smoke через CUA не выполнен: browser providers отсутствуют, а управление Arc не получило Computer Use permission. Это не заменено автоматическим тестом.
- `npm audit --omit=dev` — текущий повтор не получил DNS в sandbox; escalated network request отклонён auto-review. Зависимости в этом блоке не менялись; последний успешный audit показывал 0 production vulnerabilities.
- `npm ls --omit=dev --all` — выявил существующий unmet peer `preact@^8.4.2 || 10.x` у `@sabaki/shudan@1.8.0`; это не помешало Client build, но dependency tree формально не clean.
- Повтор `audit:gnugo-book` на готовом каталоге увидел 0 pending и восстановил ту же summary без повторного solve.
- Реальный `/private/tmp/cho-1.sgf` импортирован; задача №8 прогнана через GNU Go, три SGF artifacts записаны в `/private/tmp/goba-gnugo-cho-8`.
- KataGo Analysis API вернул 2 642/2 642 результата, 0 errors; wall time 603.4 s.
- Повторный `prepare-katago-crosscheck` дал byte-identical `queries.jsonl` и `metadata.json`.

## Ограничения

- In-memory состояние не переживает рестарт Generator.
- Нет RZS, PostgreSQL leases, editor, auth/RBAC, cancellation, raw Owl tree normalizer, coverage metrics и publication gate. Printable-line normalizer для локального Client pack уже есть.
- Официальный rzone image имеет только `linux/amd64`, весит 2.21 GiB compressed и требует Caffe2/CUDA. OrbStack запускает amd64 через эмуляцию, но не имеет NVIDIA runtime/GPU devices. CPU port требует отдельного inference backend.
- `tsumego.js` ограничен маленькими закрытыми областями и не решает первый пример Cho в исходном виде.
- GNU Go Owl — эвристический reader: 33/37 acceptance авторских root moves показывает пользу, а 4 расхождения и лишний `H19` показывают, что его нельзя считать автоматическим судьёй.
- GNU Go adapter ограничивает wall time и output/tree size, но пока не измеряет hard RSS процесса на macOS.
- Raw partial trees нельзя отдавать Client: terminal semantics и все ветви должны пройти normalizer/replay.
- Node в текущей среде 23.6.0; проект объявляет Node 22.12 или ≥24. Builds проходят, но npm предупреждает о неподдерживаемой промежуточной версии.
- Локальный Git-репозиторий и пустой remote `fjqtt/goba` созданы. Первый commit/push не выполнялись и требуют подтверждения commit message по `AGENTS.md`.

## Активный Client

Production preview запущен на `http://127.0.0.1:4180/practice/today` (exec session `56003`); статистика — `http://127.0.0.1:4180/statistics`. HTTP shell проверен. CUA не получил Computer Use permission, поэтому визуальная и реальная IndexedDB-проверка в браузере остаётся следующим QA шагом; автоматические storage и install/replay tests проходят.

Для проверки с телефона также запущен LAN preview на `http://192.168.1.66:4182/practice/today` (exec session `39880`, bind `0.0.0.0`). HTTP smoke по LAN-адресу прошёл. Это HTTP-ссылка для просмотра в одной Wi-Fi сети; полноценные service worker/offline install и persistent-storage guarantees требуют HTTPS deployment.
