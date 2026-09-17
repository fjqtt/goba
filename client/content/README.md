# Контент для сборников

Клиент проходит каталог независимо от способа его получения. Для каждой задачи нужен `ProblemV1` с исходной позицией, правильной линией, ответами соперника и подготовленными опровержениями. Голой позиции или только координаты первого правильного хода недостаточно.

## Локальный candidate pack — 2026-09-17

В `client/public/packs/cho-elementary/1/` собран локальный restricted pack:

- **861/900** задач;
- 840 exact-linked постановок;
- 21 восстановленная постановка с легальной линией и выбранной target-группой;
- 9 JSON shards, суммарно около 1.9 MiB;
- manifest содержит SHA-256, размер и число задач каждого shard;
- Client проверяет manifest, hash, размер, ProblemV1 и только затем атомарно активирует pack в IndexedDB;
- service worker включает pack JSON в precache.

Исключены **39** задач: 21 без выбранной target-группы, 10 с незаконной printable line и 8 с настоящим version/setup difference. Полный список: `client/public/packs/cho-elementary/1/exclusions.json`.

Pack остаётся `LicenseRef-Restricted-Research`. Его нельзя считать разрешённым публичным каталогом. Линии решения взяты из community printable key; ветки, которых нет в данных, остаются `unclassified` и никогда автоматически не становятся `wrong`.

Команда воспроизведения:

```bash
npm run build:cho-client-pack --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf \
  /private/tmp/goba-cho-gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/corrected-positions.sgf \
  /private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/reconciliation-report.json \
  client/public/packs/cho-elementary/1
```

## Что найдено для Чо Чикуна

- Полные позиции без решений: [`cho-1.sgf`](https://github.com/akitaonrails/frank_go/blob/main/data/tsumego/collections/cho-1.sgf) — 900 elementary; рядом лежат `cho-2.sgf` (861) и `cho-3.sgf` (792).
- Происхождение и ограничения этих файлов описаны в [`data/SOURCES.md`](https://github.com/akitaonrails/frank_go/blob/main/data/SOURCES.md). Файлы намеренно не содержат решений; современное произведение, разрешение на распространение решений не заявлено.
- [`travisgk/tsumego-pdf`](https://github.com/travisgk/tsumego-pdf) содержит все 900 elementary-позиций и печатный ключ с правильными первыми точками. Это не интерактивные SGF-деревья с ответами и ложными вариантами.
- Tsumego Hero публикует интерактивные деревья по одной задаче, например [№408](https://tsumego.com/1860), и атрибутирует решения своему сообществу. Единого разрешённого к переизданию файла всего тома не найдено.
- Старый `cho2sgf` преобразует данные официальной дискеты Kiseido в SGF, но требует саму дискету/исходные данные.

## Что можно импортировать

Предпочтительный вход для будущего импортера:

1. Один SGF collection или каталог `.sgf` файлов.
2. В корне задачи: `SZ`, `AB`, `AW`, `PL`, номер задачи и источник.
3. Вариации должны включать основную правильную линию и ответы на правдоподобные ошибочные ходы.
4. Успешные листья должны иметь явную метку (`TE`, `C[+]` или согласованное свойство источника); ошибочные ветки — явную отрицательную метку или проверенное окончание.
5. Импорт не должен угадывать результат по первой вариации. Неоднозначные задачи уходят на ручную проверку.

Если пользователь найдёт полный SGF, сначала сохранить исходник отдельно с URL/атрибуцией и не менять его вручную. Генератор должен преобразовать его в `ProblemV1`, воспроизвести каждое ребро RulesAdapter-ом и сформировать отчёт об ошибках/неполных ветках.
