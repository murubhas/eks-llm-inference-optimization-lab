# Qwen3.6 27B BF16 Runtime Comparison Results

## Verdict

The H100 compatibility smoke test succeeded with the BF16 checkpoint.
TensorRT-LLM then completed the same controlled request work as vLLM with zero
errors. Across two arms per runtime, output throughput differed by 0.38% and
mean E2E latency differed by 0.64%. TensorRT-LLM improved average ITL by 4.04%
but increased mean TTFT by 58.70%.

For this workload, changing the runtime did not create a meaningful throughput
or E2E advantage. The result is useful because it separates three questions:

1. Can the runtime initialize this checkpoint?
2. Can it serve correct OpenAI-compatible requests?
3. Does it improve the user-visible metric that matters?

The BF16 path answered the first two questions yes. The measured result did not
show a clear overall performance winner.

## Experiment contract

| Item | Value |
|---|---|
| Node | One Spot `p5.48xlarge` |
| Physical GPUs | 8 x NVIDIA H100 80 GiB |
| GPUs under test | 2 total, one dedicated GPU per runtime |
| Model | Same Qwen3.6 27B BF16 checkpoint |
| vLLM | 0.24.0 |
| TensorRT-LLM | 1.3.0rc24, PyTorch backend |
| Tensor parallelism | TP=1 |
| Request path | Direct Kubernetes Service; no llm-d |
| AIPerf | 0.11.0 |
| Order | A1 vLLM, B1 TensorRT-LLM, B2 TensorRT-LLM, A2 vLLM |
| Warm-up | 32 requests before every measured arm |
| Measured work | 200 requests per arm, concurrency 8 |
| Request shape | ISL 256, OSL 128, streaming, `ignore_eos=true` |
| Connection reuse | Disabled |
| Thinking | Disabled |
| Prompt seed | `20260818` |

The model, checkpoint precision, node, request work, client behavior, and
observability path remained fixed. Runtime implementation was the variable.

## Prompt replay integrity

After normalizing the served-model field, all four measured `inputs.json`
files had this SHA-256:

```text
b9b93281a00c6955444b208e5eb57528d10a6a0857215a383d1ff42f03bd92a1
```

## Per-arm results

| Arm | Runtime | Output tok/s | Req/s | Mean TTFT ms | p99 TTFT ms | Mean TST ms | Mean ITL ms | Mean E2E ms | p99 E2E ms | Errors |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A1 | vLLM | 344.09 | 2.688 | 162.11 | 250.85 | 26.47 | 22.01 | 2957.41 | 3009.65 | 0 |
| B1 | TensorRT-LLM | 346.07 | 2.704 | 252.85 | 295.22 | 27.45 | 21.11 | 2933.83 | 2989.04 | 0 |
| B2 | TensorRT-LLM | 346.14 | 2.704 | 255.56 | 303.11 | 27.38 | 21.10 | 2935.55 | 2997.30 | 0 |
| A2 | vLLM | 345.51 | 2.699 | 158.25 | 231.82 | 32.34 | 21.98 | 2949.88 | 3005.34 | 0 |

## Runtime means

| Runtime | Output tok/s | Req/s | Mean TTFT ms | p99 TTFT ms | Mean TST ms | Mean ITL ms | Mean E2E ms | p99 E2E ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| vLLM | 344.80 | 2.694 | 160.18 | 241.34 | 29.40 | 22.00 | 2953.65 | 3007.50 |
| TensorRT-LLM | 346.11 | 2.704 | 254.20 | 299.17 | 27.41 | 21.11 | 2934.69 | 2993.17 |

## TensorRT-LLM relative to vLLM

| Measure | Change | Interpretation |
|---|---:|---|
| Output throughput | 0.38% higher | Effectively similar |
| Request throughput | 0.38% higher | Effectively similar |
| Mean TTFT | 58.70% higher | Worse |
| p99 TTFT | 23.96% higher | Worse |
| Mean time to second token | 6.77% lower | Better |
| Mean ITL | 4.04% lower | Better |
| Mean E2E | 0.64% lower | Effectively similar |
| p99 E2E | 0.48% lower | Effectively similar |

## GPU telemetry

| Arm | Runtime | Peak utilization | Peak power | Framebuffer used | Peak temperature |
|---|---|---:|---:|---:|---:|
| A1 | vLLM | 100% | 528.75 W | 72,232 MiB | 54 C |
| B1 | TensorRT-LLM | 100% | 532.97 W | 75,264 MiB | 56 C |
| B2 | TensorRT-LLM | 100% | 516.24 W | 75,264 MiB | 57 C |
| A2 | vLLM | 100% | 529.84 W | 72,232 MiB | 56 C |

Short-window DCGM averages were sensitive to scrape-boundary alignment, so the
table uses peak utilization and power plus stable framebuffer values.

## Compatibility result

The compressed-tensors FP8 checkpoint failed before the TensorRT-LLM endpoint
became ready. The observed Qwen hybrid-model scale-layout mismatch was
`5120` versus `48`. Moving to H100 did not repair a checkpoint/runtime
layout incompatibility.

The BF16 checkpoint served, using approximately 51.42 GiB inside PyTorch and
2.88 GiB outside PyTorch during TensorRT-LLM memory profiling. Runtime
framebuffer use later stabilized around 73.50 GiB.

## Interpretation

1. Hardware support and checkpoint-format support are separate gates.
2. A successful smoke test does not imply a steady-state performance win.
3. TensorRT-LLM's slightly faster token cadence did not offset its TTFT
   increase for this request shape.
4. Similar output throughput and E2E latency are the honest headline.
5. This was TensorRT-LLM's PyTorch backend. AutoDeploy graph compilation was
   unavailable for this Qwen3.6 27B checkpoint in the evaluated release, so do
   not present this as an AutoDeploy benchmark.

## Evidence boundary

The planned inter-arm cooldown was 60 seconds. Credentials expired after B2,
creating an approximately 20-minute gap before A2; both pods remained running
with zero restarts. Startup time was not controlled for image or filesystem
cache state. Raw prompts, model outputs, pod names, account identifiers, and
private image references are excluded.
