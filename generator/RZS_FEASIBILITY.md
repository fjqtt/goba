# RZS feasibility checkpoint

Checked on 2026-09-16 on an `arm64` host.

## Pinned upstream artifacts

- Source: `rockmanray/rzone` commit `325e0ecd506dfebd547a9d7329829a9d8c1b7b12` (GPL-3.0).
- Image: `rockmanray/gorzone:latest`, digest `sha256:1d1b6babbd6c5978c14394aad16aeffcff3106eb78574ee8a577bbeec596849f`.
- Platform: `linux/amd64` only; compressed layers 2,373,566,343 bytes (2.21 GiB).
- Source checkout with bundled databases/models: about 747 MiB.

## Build/runtime conclusion

Upstream supplies no Dockerfile and recommends a ready Podman image. CMake links Boost and, with `USE_CAFFE2`, requires Caffe2, Eigen3, and CUDA. Supplied 19×19 configs reference neural model files. On macOS/arm64 the image needs x86 emulation and cannot access CUDA, so downloading it would not prove production feasibility.

The next meaningful test needs a Linux/amd64 CUDA worker or a separately proven CPU build/config. Until then the adapter must return `unsupported` rather than substitute a heuristic.

### Docker on the current Mac

Checked with OrbStack:

- Linux `aarch64` server, 10 vCPU, 16.82 GiB RAM.
- `docker run --platform linux/amd64 alpine:3.20 uname -m` returned `x86_64`; emulation works.
- Only `runc` / `io.containerd.runc.v2` runtimes exist; no NVIDIA runtime.
- No `/dev/nvidia*` or `/dev/dri` inside the amd64 container.

The official image can run under emulation but cannot obtain a CUDA device. This is an Apple Silicon passthrough limitation, not a QEMU/Rosetta failure.

Removing `USE_CAFFE2` does not enable CPU inference. `BaseCNNNet::loadNetWork()` then leaves backend, batch/channel sizes, and outputs uninitialized. Every supplied 19×19 config specifies `DCNN_NET` ELF/FTL weights, while the implemented branch uses `caffe2::CUDA` and `TensorCUDA`. A CPU port needs a new inference backend and code changes.

## Upstream benchmark data

`tsumego/19x19/json` has 106 labeled records. Fifty named `chao_vol1_*` include `category=TOLIVE`, `answer_firstmove`, SGF variations, and solver-specific masks.

`npm run match-corpus` compared setup/toPlay with `/private/tmp/cho-1.sgf` under 8 symmetries. Only 3 positions match exactly:

| Rzone record | Upstream filename | Local draft |
|---|---|---|
| `1.json` | `chao_vol1_p031.sgf` | problem 8 |
| `27.json` | `chao_vol1_p196.sgf` | problem 322 |
| `34.json` | `chao_vol1_p258.sgf` | problem 670 |

The others cannot be linked by number because corpus/edition/setup differ. These 50 may form a separate restricted adapter-test corpus after rights review; they do not solve the other 897 current positions.

## Reproduce

```bash
git clone --depth 1 https://github.com/rockmanray/rzone.git /private/tmp/goba-rzone
docker manifest inspect --verbose rockmanray/gorzone
npm run match-corpus --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/goba-rzone/tsumego/19x19/json
```
