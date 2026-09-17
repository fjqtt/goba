# RZS feasibility checkpoint

Проверено 2026-09-16 на host `arm64`.

## Закреплённые upstream artifacts

- Source: `rockmanray/rzone` commit `325e0ecd506dfebd547a9d7329829a9d8c1b7b12` (GPL-3.0).
- Published image: `rockmanray/gorzone:latest`, manifest digest `sha256:1d1b6babbd6c5978c14394aad16aeffcff3106eb78574ee8a577bbeec596849f`.
- Image platform: только `linux/amd64`; compressed layers: 2,373,566,343 bytes (2.21 GiB).
- Source checkout с bundled databases/models: около 747 MiB.

## Build/runtime conclusion

Upstream не предоставляет Dockerfile. README предлагает готовый Podman image. CMake связывает Boost и при `USE_CAFFE2` требует Caffe2, Eigen3 и CUDA; предоставленные 19×19 configs ссылаются на neural model files. На текущем macOS/arm64 host этот image потребует x86 emulation, а CUDA backend недоступен. Поэтому image не загружался: такой запуск не является воспроизводимым production feasibility test.

Следующая исполнимая проверка требует Linux/amd64 CUDA worker либо отдельно доказанного CPU build/config. Adapter до этого должен сохранять `unsupported`, а не подменять proof эвристикой.

### Проверка Docker на текущем Mac

Проверено через OrbStack 2026-09-16:

- Docker server: Linux `aarch64`, 10 vCPU, 16.82 GB RAM.
- `docker run --platform linux/amd64 alpine:3.20 uname -m` успешно вернул `x86_64`: amd64-эмуляция работает.
- Доступны только runtimes `runc` / `io.containerd.runc.v2`; NVIDIA runtime отсутствует.
- В amd64-контейнере нет `/dev/nvidia*` или `/dev/dri`.

Следовательно, официальный amd64 image технически можно распаковать и запустить под эмуляцией, но его inference path не получит CUDA device. Это не ограничение QEMU/Rosetta, а отсутствие NVIDIA/CUDA passthrough на Apple Silicon.

CPU не включается простым конфигурационным флагом. `setup-cmake.sh` действительно позволяет собрать код без `USE_CAFFE2`, но в таком build `BaseCNNNet::loadNetWork()` не инициализирует backend, batch/channel sizes и outputs. Все поставляемые 19×19 configs задают `DCNN_NET` с ELF/FTL weights, а Caffe2-ветка явно использует `caffe2::CUDA` и `TensorCUDA`. Рабочий CPU port потребует отдельного inference backend и изменений кода, а не только удаления `-DUSE_CAFFE2`.

## Upstream benchmark data

В `tsumego/19x19/json` находятся 106 размеченных records; 50 называют `chao_vol1_*`, имеют `category=TOLIVE`, `answer_firstmove`, `rawsgf` с вариантами и solver-specific `masked_sgf_str`.

`npm run match-corpus` сравнил setup/toPlay с `/private/tmp/cho-1.sgf`, включая 8 симметрий. Точно совпали только 3 позиции:

| Rzone record | Upstream filename | Наш draft |
|---|---|---|
| `1.json` | `chao_vol1_p031.sgf` | problem 8 |
| `27.json` | `chao_vol1_p196.sgf` | problem 322 |
| `34.json` | `chao_vol1_p258.sgf` | problem 670 |

Остальные нельзя соединять по номеру: corpus/edition/постановки различаются. Эти 50 records полезны как отдельный restricted gold corpus для adapter tests после проверки прав; они не дают решения оставшимся 897 позициям текущего файла.

## Воспроизведение исследования

```bash
git clone --depth 1 https://github.com/rockmanray/rzone.git /private/tmp/goba-rzone
docker manifest inspect --verbose rockmanray/gorzone
npm run match-corpus --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/goba-rzone/tsumego/19x19/json
```
