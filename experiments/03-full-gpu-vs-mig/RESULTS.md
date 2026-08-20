# Qwen G7e Full-GPU vs MIG Results

Date: 2026-07-30 UTC

## Experiment Contract

The comparison used the same two physical `g7e.2xlarge` Spot nodes in
`us-east-2a`.

| Topology | Physical GPUs | Kubernetes GPU resources | vLLM replicas |
| --- | ---: | --- | ---: |
| Full GPU | 2 x RTX PRO 6000 Blackwell | 2 x `nvidia.com/gpu` | 2 |
| MIG | Same 2 physical GPUs | 4 x `nvidia.com/mig-2g.48gb` | 4 |

Both phases used Qwen3.6 27B FP8, vLLM 0.24.0, TP=1,
`max-num-seqs=1`, the same isolated llm-d Router/EPP, and the same scorer
configuration. Only one model Deployment was active at a time.

The same two nodes were reconfigured from `all-2g.48gb` to `all-disabled`
between phases. This holds the physical fleet and hourly cost constant.

## Workloads

| Profile | Concurrency | Requests | Input | Output | EOS behavior |
| --- | ---: | ---: | ---: | ---: | --- |
| Low pressure | 2 | 50 | 256 requested | 128 maximum | Natural EOS |
| Saturation | 8 | 200 | 256 requested | 128 fixed | `ignore_eos=true` |

AIPerf used server token counts, streaming, thinking disabled, and
`connection-reuse-strategy=never`.

## Primary Result: Saturation

All 200 requests in each phase completed without API errors or cancellation.
Each response produced exactly 128 output tokens.

| Metric | 2 full GPUs | 4 MIG slices | MIG vs full |
| --- | ---: | ---: | ---: |
| Benchmark duration | 290.41 s | 262.22 s | -9.7% |
| Request throughput | 0.689 req/s | 0.763 req/s | +10.8% |
| Output throughput | 88.15 tok/s | 97.63 tok/s | +10.8% |
| TTFT average | 8,590 ms | 5,218 ms | -39.3% |
| TTFT p50 | 8,761 ms | 5,271 ms | -39.8% |
| TTFT p90 | 11,576 ms | 10,406 ms | -10.1% |
| TTFT p99 | 11,665 ms | 15,648 ms | +34.1% |
| E2E average | 11,429 ms | 10,369 ms | -9.3% |
| E2E p50 | 11,608 ms | 10,422 ms | -10.2% |
| E2E p90 | 14,421 ms | 15,550 ms | +7.8% |
| E2E p99 | 14,519 ms | 20,797 ms | +43.2% |
| ITL average | 22.35 ms | 40.56 ms | +81.4% |
| ITL p50 | 22.42 ms | 40.57 ms | +80.9% |
| ITL p99 | 22.54 ms | 40.80 ms | +81.0% |
| Time to second token average | 22.51 ms | 40.78 ms | +81.2% |

Lower is better for duration and latency. Higher is better for throughput.

At an unchanged fleet price, +10.8% output throughput corresponds to about
9.7% lower cost per fixed-output request or per one million output tokens.
This is a relative result; no on-demand price was assigned to the Spot run.

## Low-Pressure Check

The low-pressure phase used natural EOS, so the output distribution was not
identical: 76.78 average output tokens for full GPU and 67.68 for MIG.
Throughput and E2E duration from this phase are therefore diagnostic, not the
headline comparison.

The stable per-token result remained clear:

| Metric | 2 full GPUs | 4 MIG slices | MIG vs full |
| --- | ---: | ---: | ---: |
| ITL average | 21.19 ms | 38.55 ms | +81.9% |
| TTFT p50 | 73.37 ms | 96.99 ms | +32.2% |
| TTFT p99 | 3,483 ms | 3,231 ms | -7.2% |

## Routing and GPU Evidence

- MIG routing was nearly even: approximately 50 requests per replica.
- Full-GPU routing was even: approximately 100 requests per replica.
- MIG completions arrived in groups of four; full-GPU completions arrived in
  pairs. This matches the number of independent vLLM replicas.
- Full GPUs reached approximately 97-98% average
  `DCGM_FI_PROF_GR_ENGINE_ACTIVE` and 100% peak `GPU_UTIL`.
- MIG slices reported approximately 31% average and 33% peak
  `DCGM_FI_PROF_GR_ENGINE_ACTIVE` per slice.
- Full-GPU framebuffer use peaked near 86.3 GiB per GPU.
- MIG framebuffer use peaked near 42.3 GiB per `2g.48gb` slice.
- Peak physical-GPU power was about 373-374 W in both topologies.
- Peak temperature was 49-50 C for full GPU and 50-52 C for MIG.

MIG DCGM power values are repeated on each slice because they describe the
parent physical GPU; do not sum per-slice power series.

## Interpretation

MIG did not make an individual request decode faster. Its average ITL was
about 81% higher because each request used a smaller GPU partition.

MIG did expose four independent vLLM replicas instead of two. With
`max-num-seqs=1`, that doubled the number of simultaneous admission slots. At
concurrency 8, the extra parallelism outweighed the slower slices and produced
10.8% more aggregate output tokens per second.

The tradeoff is visible in the tails: MIG improved average and median TTFT,
but p99 TTFT and p99 E2E latency were worse. For interactive streaming, full
GPUs provided much faster token cadence and better saturation tail latency.
For throughput-oriented multi-tenant serving under this scheduler policy, MIG
provided more aggregate capacity at the same physical-node cost.

This is one controlled run per topology. A production decision should repeat
the matrix and sweep `max-num-seqs`, request concurrency, input length, and
output length.

## Evidence Boundary

Raw AIPerf logs, prompts, model output, and cluster snapshots are intentionally
excluded from this public repository. This file retains the sanitized result
table, workload contract, telemetry summary, and interpretation boundary.
