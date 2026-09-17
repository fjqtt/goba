# Mac solver feasibility checkpoint

Проверено 2026-09-16 на Apple M1 Pro (`arm64`, macOS) для задач первого тома Чо.

## Решение

Для локальной разработки выбран **GNU Go 3.8 Owl** как CPU lane для поиска кандидатов и выгрузки частичного SGF-дерева. Он запускается нативно на Apple Silicon, принимает SGF/GTP и не требует Docker или GPU. Его результат остаётся `unknown` с меткой `heuristic-candidate-only`: Owl ограничен эвристиками и node limits, поэтому ответ нельзя автоматически публиковать как доказанный.

KataGo с Metal оставлен для policy/PV и ранжирования правдоподобных ходов. Он оптимизирует результат всей партии, поэтому даже локальный `allowMoves` не превращает Analysis API в решатель tsumego.

## Измерения

| Вариант | Запуск на этом Mac | Измеренный результат | Роль |
|---|---|---|---|
| GNU Go 3.8 Owl | Нативный Homebrew arm64, 7.9 MiB | На 37 размеченных upstream Cho fixtures первый ход совпал в 27; авторский ход принят `owl_does_defend` в 33. Углублённые limits результат не изменили; 37 позиций заняли 5.14 s | Кандидаты, альтернативы, partial SGF tree; всегда review |
| KataGo 1.16.2 | Нативный Metal | Малый benchmark: 103.86 visits/s при 1 thread. На первой позиции Чо unrestricted analysis выбрал глобальные ходы; локальный список ходов изменил поиск, но не дал L&D proof | Policy/PV, ranking, второе мнение |
| Cameron tsumego-solver 0.1.3 | x86_64 binary работает через Rosetta | CLI предоставляет интерактивный `explore`, но не headless export решения; representation ограничен 16×8 битовой доской с явной маской | Не интегрировать |
| rzone | Официальный `linux/amd64` image можно эмулировать | Caffe2 path требует CUDA/NVIDIA, которых на Apple Silicon Docker нет | Отдельный Linux/CUDA worker |

GNU Go прямо документирует `--decide-owl`, который записывает SGF variation tree, и GTP-команды `owl_attack`, `owl_defend`, `owl_does_attack`, `owl_does_defend`. Документация также предупреждает, что результат зависит от ограничений Owl и увеличение node limit не обязательно повышает силу. Источники: [GNU Go usage](https://www.gnu.org/software/gnugo/gnugo_3.html), [GTP commands](https://www.gnu.org/software/gnugo/gnugo_19.html), [Owl reading](https://www.gnu.org/software/gnugo/gnugo_11.html), [Homebrew formula](https://formulae.brew.sh/formula/gnu-go).

KataGo собирается с Metal на macOS и имеет streaming Analysis API, но его output — оценки, policy и PV, а не proof tree. Источники: [KataGo compilation](https://github.com/lightvector/KataGo/blob/master/Compiling.md), [Analysis Engine](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md).

## Реальный прогон скачанного SGF

Команда:

```bash
npm run probe:gnugo --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf 8 1 4 /private/tmp/goba-gnugo-cho-8
```

Импортировано 900 drafts с hash `sha256:2667ddc1f73d9256820a598427ae212be78874c33932c5baf99d97793d8df432`. Для задачи 8 автоматически рассмотрены три target-группы. Для чёрной группы GNU Go предложил `A18`, совпадающий с известным первым ходом, и сохранил дерево из 10 атакующих и 8 защитных вариаций. Он также принял `H19` как альтернативу, которой нет в имеющемся ключе; это конкретный пример, почему вывод остаётся гипотезой до независимой проверки.

Артефакт: `/private/tmp/goba-gnugo-cho-8/problem-8-candidate-608-b.sgf`.

## Источник первых ходов

[`travisgk/tsumego-pdf`](https://github.com/travisgk/tsumego-pdf) содержит ключ для всех 900 elementary-позиций. Он годится для связывания root moves, но не содержит полных интерактивных деревьев и сам указывает, что права на исходные задачи и community-sourced solutions не установлены однозначно; см. [LICENSE/disclaimer](https://github.com/travisgk/tsumego-pdf/blob/main/LICENSE). Поэтому данные хранятся как `restricted`, используются только для исследования и не публикуются автоматически.

Детерминированная сверка `cho-1.sgf` с этим ключом дала **845/900** точных совпадений setup. Ещё 55 записей не связаны: постановки отличаются; у problem 201 дополнительно строка диаграммы имеет ширину 18 вместо 19. В части несовпадений numbered solution overlays превратились в обычные setup stones в одном из источников. Автоматически переносить ответы по одному номеру задачи нельзя. Manifest записан в `/private/tmp/goba-cho-answer-links.json`; hash ключа `sha256:742af89d57931488e6f3b6e90732481a94809bc1a3b8f3fd386f5e2ff72f416d`.

## Следующий gate

1. Импортировать 845 точно связанных root records как отдельные restricted annotations с provenance; 55 несовпадений оставить в review queue.
2. Прогнать GNU Go по связанным задачам и разделить совпадения, дополнительные ходы и расхождения.
3. Нормализовать Owl SGF в candidate tree, проиграть каждое ребро через `RulesAdapter` и проверить terminal predicates.
4. Ни совпадение с ключом, ни согласие GNU Go/KataGo не заменяют curator/expert gate.
