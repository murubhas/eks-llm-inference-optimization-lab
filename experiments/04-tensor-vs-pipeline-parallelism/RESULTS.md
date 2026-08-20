# Qwen3.6 27B FP8 Inter-node Parallelism Results

## Verdict

TP=2 and PP=2 both completed the same two benchmark profiles. TP=4 formed a four-rank NCCL communicator across four nodes, but the vLLM endpoint never became ready because this Qwen GatedDeltaNet FP8 checkpoint produces an unsupported per-rank projection shape at TP=4.

The controlled saturation result showed near throughput parity between TP=2 and PP=2. PP=2 delivered 1.31% more output throughput, but average ITL was 8.31% higher and p99 E2E was 7.60% higher. This single-run Spot experiment supports a topology lesson, not a universal performance ranking. Reporting a TP=4 throughput or latency percentage would be misleading because no TP=4 requests were served.

## Controlled setup

| Item | Value |
|---|---|
| Physical fleet | 4 x `g7.2xlarge` Spot nodes |
| GPUs | 4 x NVIDIA RTX PRO 4500 Blackwell, one GPU per node |
| Model | Qwen3.6 27B FP8 checkpoint |
| Runtime | vLLM 0.24.0, NCCL 2.28.9 |
| Driver | NVIDIA open driver 595.45.04 |
| Network transport | NCCL `NET/Socket` on `eth0`; IB/EFA disabled |
| Request path | Direct Kubernetes Service; no llm-d router |
| TP=2 topology | 2 independent logical replicas, 2 nodes per replica |
| TP=4 topology | 1 logical replica, 4 nodes per replica |
| PP=2 topology | 2 independent logical replicas, 2 nodes per replica |

Only one topology was active at a time. Model path, vLLM settings, fleet, benchmark inputs, streaming mode, and client connection-reuse policy were held constant.

## TP=2 measurements

### Natural-EOS latency profile

Profile: concurrency 2, 50 requests, ISL 256, OSL 128, streaming, natural EOS.

| Metric | TP=2 result |
|---|---:|
| Successful requests | 50 / 50 |
| API errors | 0 |
| Benchmark duration | 112.11 s |
| Request throughput | 0.45 req/s |
| Output throughput | 28.72 tokens/s |
| Average TTFT | 1,996.31 ms |
| p99 TTFT | 5,399.25 ms |
| Average time to second token | 71.76 ms |
| p99 time to second token | 182.06 ms |
| Average E2E latency | 4,355.01 ms |
| p99 E2E latency | 9,691.10 ms |
| Average ITL | 38.01 ms |
| p99 ITL | 49.88 ms |

The model could stop before OSL 128 because natural EOS was intentionally preserved.

### Fixed-output saturation profile

Profile: concurrency 8, 200 requests, ISL 256, OSL 128, streaming, `ignore_eos=true`.

| Metric | TP=2 result |
|---|---:|
| Successful requests | 200 / 200 |
| API errors | 0 |
| Benchmark duration | 544.92 s |
| Request throughput | 0.367 req/s |
| Output throughput | 46.98 tokens/s |
| Average TTFT | 16,435.90 ms |
| p99 TTFT | 33,777.84 ms |
| Average time to second token | 68.82 ms |
| p99 time to second token | 118.68 ms |
| Average E2E latency | 21,114.62 ms |
| p99 E2E latency | 38,429.08 ms |
| Average ITL | 36.84 ms |
| p99 ITL | 41.40 ms |

DCGM reached 99-100% utilization on all four GPUs during saturation. Prometheus also showed traffic on both TP=2 API heads.

## PP=2 measurements

PP=2 used `tensor_parallel_size=1`, `pipeline_parallel_size=2`, and the same two-replica/four-node physical layout as TP=2. Both two-rank groups initialized with one rank per node over NCCL `NET/Socket` on `eth0`.

### Natural-EOS latency profile

Profile: concurrency 2, 50 requests, ISL 256, OSL 128, streaming, natural EOS.

| Metric | PP=2 result |
|---|---:|
| Successful requests | 50 / 50 |
| API errors | 0 |
| Benchmark duration | 106.72 s |
| Request throughput | 0.468 req/s |
| Output throughput | 32.17 tokens/s |
| Average TTFT | 1,549.25 ms |
| p99 TTFT | 5,305.53 ms |
| Average time to second token | 39.87 ms |
| p99 time to second token | 41.12 ms |
| Average E2E latency | 4,223.90 ms |
| p99 E2E latency | 10,059.72 ms |
| Average ITL | 37.39 ms |
| p99 ITL | 39.96 ms |

Natural-EOS output throughput is not a controlled generated-token comparison because response lengths vary. Request throughput and latency are more useful for this profile.

### Fixed-output saturation profile

Profile: concurrency 8, 200 requests, ISL 256, OSL 128, streaming, `ignore_eos=true`.

| Metric | PP=2 result |
|---|---:|
| Successful requests | 200 / 200 |
| API errors | 0 |
| Benchmark duration | 537.85 s |
| Request throughput | 0.372 req/s |
| Output throughput | 47.60 tokens/s |
| Average TTFT | 16,127.94 ms |
| p99 TTFT | 36,280.55 ms |
| Average time to second token | 39.81 ms |
| p99 time to second token | 40.25 ms |
| Average E2E latency | 21,195.56 ms |
| p99 E2E latency | 41,349.95 ms |
| Average ITL | 39.90 ms |
| p99 ITL | 40.13 ms |

Prometheus showed an approximately 48/52 request split across the two PP=2 API heads. Every GPU reached 100% utilization. Average saturation-window utilization ranged from 88.9% to 100%, and maximum framebuffer use ranged from 25,254 to 27,896 MiB per GPU.

### Controlled saturation comparison

Positive latency deltas mean PP=2 was slower; positive throughput deltas mean PP=2 was higher.

| Metric | TP=2 | PP=2 | PP=2 versus TP=2 |
|---|---:|---:|---:|
| Output throughput | 46.98 tok/s | 47.60 tok/s | +1.31% |
| Request throughput | 0.367 req/s | 0.372 req/s | +1.31% |
| Average TTFT | 16.44 s | 16.13 s | -1.87% |
| p99 TTFT | 33.78 s | 36.28 s | +7.41% |
| Average E2E | 21.11 s | 21.20 s | +0.38% |
| p99 E2E | 38.43 s | 41.35 s | +7.60% |
| Average ITL | 36.84 ms | 39.90 ms | +8.31% |
| p99 ITL | 41.40 ms | 40.13 ms | -3.08% |

The honest conclusion is near aggregate-throughput parity under this controlled load. PP=2 preserved full tensor shapes and avoided TP=4's kernel incompatibility, but it did not improve tail latency. The PP arm retained `max-num-seqs=1`; it should not be interpreted as a pipeline-filled PP throughput maximum.

## TP=4 startup result

The four pods scheduled one per node and initialized a single NCCL group with:

- `world_size=4`
- `nRanks=4`, `nNodes=4`, and one local rank per node
- NCCL 2.28.9
- `NCCL_IB_DISABLE=1`
- `NET/Socket` on `eth0`
- PYNCCL all-reduce for the tensor-parallel group

The model then failed before the OpenAI-compatible endpoint became ready.

### Kernel-path checks

| Linear backend | Result |
|---|---|
| `auto` | Auto-selected Cutlass FP8, then failed in post-load processing with `Overwriting existing tensor attribute: weight_loader`. |
| `flashinfer_cutlass` | Rejected the checkpoint scaling scheme: `requires per tensor activation and weight scales`. |
| `torch` | Loaded far enough to expose the fundamental shard shape: FP8 matrix `[5120, 24]`, where the output dimension 24 is not divisible by 16. |

The relevant alignment is straightforward:

- TP=2 gives the affected projection a per-rank width of 48, and `48 mod 16 = 0`.
- TP=4 gives it a per-rank width of 24, and `24 mod 16 = 8`.
- The available FP8 GEMM path requires the matrix dimensions to be divisible by 16.

This matches the upstream vLLM Qwen3.5/3.6 GatedDeltaNet TP>=4 issue family, where small fused projections need a replicated or otherwise specially handled implementation:

- https://github.com/vllm-project/vllm/issues/35924
- https://github.com/vllm-project/vllm/issues/34893

## Interpretation

1. TP degree is constrained by model architecture and kernel shape requirements, not just by the number of available GPUs.
2. NCCL networking was healthy enough to form the two- and four-node groups. The TP=4 failure occurred in model/kernel initialization before request processing.
3. PP=2 preserved whole-layer tensor shapes and therefore loaded successfully where TP=4 did not.
4. TP=2 and PP=2 over ordinary socket networking both work, but neither is an ideal production topology. TP pays repeated collectives; PP transfers activations across its stage boundary.
5. The TP=2 and PP=2 aggregate results each represent two independent logical replicas. TP=4 was one logical replica and never served traffic.
6. A proper PP capacity study should sweep concurrency and `max-num-seqs` to fill pipeline stages, and must be reported separately from this controlled arm.

## Recommended follow-up

Recommended next steps:

1. Use a vLLM release or validated patch that replicates the small GatedDeltaNet projections for TP>=4, then rerun both topologies unchanged.
2. Use a checkpoint and architecture explicitly validated for FP8 TP=4, then apply the same two-profile matrix.
3. For a production-quality inter-node TP study, use EFA-capable instances and NCCL OFI rather than `g7.2xlarge` socket networking.
4. Run a separate PP=2 pipeline-fill sweep with increasing concurrency and `max-num-seqs`, retaining the controlled PP=2 result as the baseline.

Do not substitute PP=2 for the failed TP=4 arm in a TP scaling claim. Pipeline parallelism answers a different model-partitioning question.

## Evidence Boundary

Raw AIPerf logs, prompts, model output, and cluster snapshots are intentionally
excluded from this public repository. The complete sanitized measurements,
kernel error classes, topology, and runtime boundary are retained in this file.
