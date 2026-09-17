# Client — checklist реализации

Источник требований: [PLAN.md](PLAN.md), roadmap §13. `[x]` означает выполненную конкретную работу, но не закрывает непроверенные gates этапа.

## Этап 0 — контракт и прототип

- [x] C0.1 Разделить проекты, сохранить планы, создать журнал передачи.
- [x] C0.2 Настроить React/TypeScript/Vite, workspace и закреплённые зависимости.
- [x] C0.3 Реализовать ProblemV1, runtime validation, SHA-256 contracts и ограничения графа.
- [x] C0.4 Реализовать RulesAdapter с capture, suicide, pass, situational superko и target identities.
- [ ] C0.5 Добавить conformance fixtures и независимые ожидаемые результаты. Частично: технические fixtures и полный replay всех 861 упакованных candidate problems проходят автоматически; экспертный corpus отсутствует.
- [ ] C0.6 Подключить Shudan с точными React aliases, crop, markers, one-tap input, zoom, keyboard. Частично: aliases, crop, постановка одним тапом и стрелки/Enter готовы; pan/zoom и mobile QA остались.
- [ ] C0.7 Получить 20 вручную проверенных позиций; проверить 375/390 px и жесты на реальном iPhone.

## Этап 1 — прохождение

- [x] C1.1 Детерминированный интерпретатор, legality → edge → replay/hash → checkpoint.
- [x] C1.2 Альтернативные правильные ходы, defaultReply, нейтральный unknown, invalid-content без SRS.
- [ ] C1.3 Просмотр ответа, prepared refutation вперёд/назад, retry с сохранением ошибок. Частично: ложные ветки продолжаются без ранней оценки, навигация по опровержению готова; полный solution view и practice retry остались. Видимая кнопка подсказки удалена по продуктовой обратной связи.
- [x] C1.4 Восстановление незаконченной попытки на закреплённой revision.
- [x] C1.5 Gate: replay всех включённых путей, missing edge никогда не wrong. Все edges локального Cho pack проверяются после сериализации/установки; отсутствующая ветка остаётся `unclassified`.

## Этап 2 — offline

- [x] C2.1 Dexie: packs, problems, sessions, reviews, cards, outbox, settings. При старте приложение также делает best-effort запрос persistent storage через Storage API.
- [x] C2.2 Manifest/shards: SHA-256, schema, size limits, staged atomic install.
- [x] C2.3 Offline shell, manifest/icons, безопасное предложение обновления SW.
- [ ] C2.4 Тест сбоя скачивания/upgrade, quota, revocations и удержания старой revision.
- [ ] C2.5 Gate: cold start после force quit в airplane mode на iPhone.

## Этап 3 — прогресс

- [x] C3.1 ts-fsrs с pinned параметрами, append-only event, одна оценка на attempt.
- [ ] C3.2 Daily queue: due → ограниченные new; hinted/wrong/solution = Again. Частично: реализован отдельный persisted collection run с один раз перемешанной очередью, одной попыткой, результатами correct/wrong, режимом повторения ошибок и полным сбросом локальной истории; отдельная страница `/statistics` показывает correct/wrong/unseen/accuracy. SRS daily policy ещё не подключена.
- [ ] C3.3 Экспорт, воспроизводимый replay projection.
- [ ] C3.4 Первый разрешённый и проверенный каталог (100–300 задач). **Частично:** локально упакован restricted candidate catalog Чо из 861 задачи; он не является разрешённым публичным или экспертно проверенным каталогом.

## Этап 4 — сервер

- [ ] C4.1 Fastify public catalog + PostgreSQL migrations.
- [ ] C4.2 Аккаунты, secure cookie/CSRF, batch reviews, sync cursor, projection ordering.
- [ ] C4.3 Push subscriptions, reminder worker, DST, dedup/retry, endpoint protections.
- [ ] C4.4 Gate: duplicate delivery/multi-device, 410 subscription и push на реальном устройстве.

## Этап 5 — beta

- [ ] C5.1 VoiceOver, reduced motion, zoom 200%, полный список acceptance из §13.
- [ ] C5.2 Security/CSP, dependency и license inventory, budgets и observability.
- [ ] C5.3 10–20 beta-пользователей, content QA, отсутствие критических false-wrong reports.

## Журнал

- 2026-09-15: workspace, contract/rules, session + refutation navigation, Shudan prototype, staged packs, offline shell и базовый FSRS event flow реализованы; см. `../HANDOFF.md`.
- 2026-09-15: интерфейс упрощён до указания текущего цвета + доска; ввод переведён на один тап.
- 2026-09-15: синтетические демонстрации удалены по обратной связи. Подключена реальная задача Tsumego Hero №408 из `Life & Death — Elementary #3`, заявленная сложность 7k: полная правильная линия из SGF, три ложных первых хода и ложное продолжение после правильного начала. Источник и неясный статус прав отмечены в ProblemV1; это временный локальный пример, не release-каталог.
- 2026-09-15: перед подготовленным ответом соперника добавлена пауза 420 мс; ход ученика показывается сразу, в паузе доска заблокирована и надпись временно показывает цвет соперника. Уведомление о готовности offline cache удалено по обратной связи; service worker продолжает работать.
- 2026-09-16: добавлен persisted забег по сборнику: очередь перемешивается и восстанавливается, terminal attempt один раз записывает correct/wrong, переход идёт к следующей задаче, повтор ошибок циклический до исправления, есть статистика и сброс. Кнопка перезапуска задачи удалена для соблюдения одной попытки. Исследование доступных наборов Чо Чикуна записано в `content/README.md`: 900 позиций найдены, единого разрешённого SGF с полными деревьями решений не найдено.
- 2026-09-17: sample заменён на локальный restricted Cho pack. В Client включено 861/900 задач: 840 exact-linked и 21 reconciled с легальной printable line и выбранной GNU Go target-группой. Девять shards (1.9 MiB) проверяются по SHA-256, валидируются как ProblemV1, атомарно ставятся в IndexedDB и precache-ятся service worker. 39 задач исключены с явными причинами. Все включённые edges и state hashes replay-проверены после чтения pack. Неизвестные ветки остаются `unclassified` и не записываются как ошибка.
- 2026-09-17: отдельно проверены пути решения у 39 исключений. У 38 есть заявленная printable line, но только 27 линий легально проигрываются хотя бы на одной согласованной кандидатной постановке: 20 задач не имеют подтверждённой target-группы, ещё 7 имеют конфликт версий setup. У №804 линия отсутствует; у 10 линий найден `suicide`; у №216 линия незаконна в обеих версиях. Эти записи пока не добавлены в graded pack.
- 2026-09-17: статистика вынесена из modal в отдельную страницу `/statistics`: показаны прогресс, correct/wrong/unseen и точность, доступны продолжение новых, повтор ошибок и подтверждаемый сброс. Сброс атомарно очищает collection results, active session, review events, FSRS cards и outbox, сохраняя pack и identity устройства. На старте вызывается `navigator.storage.persist()` с безопасным fallback.
- 2026-09-17: навигация сделана явной: в верхней панели практики добавлена текстовая кнопка «Статистика», на странице статистики — «← Назад».
- 2026-09-17: Client подготовлен к project-site GitHub Pages: base path берётся из `VITE_BASE_PATH`, pack/manifest/icon/routes сохраняют `/goba/`, а build создаёт прямые HTML entry points для `/practice/today/` и `/statistics/`. Добавлен Actions workflow с typecheck, 54 тестами, build и Pages deploy. Создан пустой публичный `https://github.com/fjqtt/goba`; commit/push ожидают обязательного подтверждения пользователя.
