# Cho elementary: сверка 55 несовпавших постановок

Проверено 2026-09-16. Все входы и производные артефакты имеют статус `restricted`.

## Почему постановки разошлись

В `tsumego-pdf` нумерованные символы одновременно кодируют ход решения и цвет камня после проигрывания линии. Функция `give_resulting_board` ставит эти ходы на доску и возвращает итоговую диаграмму. Поэтому простое чтение итоговой диаграммы как начального setup добавляет в задачу камни решения.

Это подтверждено не эвристикой по номеру задачи, а точным сравнением камней:

- у **46** записей SGF setup полностью совпадает с printable diagram, если нумерованные камни включить в отображённую позицию;
- после удаления нумерованных ходов получается отдельный base-position candidate;
- у задачи **201** одна строка имеет ширину 18; семантически однозначное исправление, сохраняющее левый board-edge marker на месте, — пустая точка сразу после него;
- у **8** задач совпадения нет даже после учёта нумерованного overlay, поэтому это настоящие различия версий или транскрипции.

Важно: upstream playout удаляет захваченные камни, но не запрещает самоубийство. Независимый replay нашёл `suicide` в printable line у задач **57, 103, 108, 200, 249, 282, 537, 640, 690, 746**. Эти 10 записей нельзя автоматически считать восстановленными корректными задачами.

## Восемь настоящих setup-различий

Координаты показывают камни, присутствующие только в одной версии.

| № | B только key | B только SGF | W только key | W только SGF |
|---:|---|---|---|---|
| 4 | — | — | C15 | — |
| 8 | — | — | — | H17 |
| 40 | — | A18 A17 B17 | — | B19 B18 |
| 93 | — | — | F18 | — |
| 216 | — | — | — | C19 |
| 420 | — | — | — | B19 |
| 533 | B16 | — | C19 D19 A15 B15 C15 | B19 E19 D18 A16 B16 |
| 617 | — | — | — | A16 |

Перенос решения между этими версиями по одному номеру запрещён. Обе версии переданы KataGo отдельно; итоговое сравнение находится в `KATAGO_CROSSCHECK.md`.

KataGo даёт следующую очередь разбора:

- **40, 420:** printable line заметно лучше ранжируется на SGF-постановке;
- **533, 617:** SGF-постановка делает один из ходов printable line занятым; key-постановка остаётся легальной и является лучшим кандидатом;
- **216:** обе версии линии незаконны (`suicide` в key, `occupied` в SGF), обе отклоняются до исправления контента;
- **4, 8, 93:** обе постановки дают одинаковый root rank 1, результат неразличим;

Это triage, а не автоматическое принятие: KataGo запускался как локальный ranking signal, без proof конкретной target-группы.

## GNU Go на 47 base-position candidates

| Класс | Задач |
|---|---:|
| Full printable line | 1 |
| Partial line | 1 |
| Только root | 19 |
| Ни одна target-группа не приняла root | 16 |
| Printable line незаконна по `ld-v1` | 10 |

Этот результат не повышает candidates до готового каталога. Он показывает, что механическое удаление сыгранных камней объясняет структуру данных, но не исправляет дефекты самого community key.

## Воспроизведение

```bash
npm run reconcile:printable-key --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/cho-go-problems.json \
  /private/tmp/goba-cho-reconciliation

npm run audit:gnugo-book --workspace @goba/generator -- \
  /private/tmp/goba-cho-reconciliation/corrected-positions.sgf \
  /private/tmp/goba-cho-reconciliation/corrected-links.json \
  /private/tmp/goba-cho-reconciliation/gnugo-audit 1 900 4
```

Артефакты:

- `/private/tmp/goba-cho-reconciliation/reconciliation-report.json`
- `/private/tmp/goba-cho-reconciliation/corrected-positions.sgf`
- `/private/tmp/goba-cho-reconciliation/corrected-links.json`
- `/private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json`
- `/private/tmp/goba-cho-reconciliation/gnugo-audit/audit-summary.csv`
