# Benchmark Methodology

## Core Rule

Change one system dimension at a time. If a second parameter must change for
the feature to function, record it as part of the experiment boundary.

## Control Matrix

Record these values for every arm:

| Category | Required fields |
|---|---|
| Model | model ID, revision, precision, tokenizer |
| Runtime | image digest, vLLM version, engine flags |
| Hardware | instance type, GPU type/count, topology, purchase option |
| Placement | nodes, replicas, GPUs per replica, TP, PP, MIG profile |
| Request path | Service or router endpoint, scorer configuration |
| Workload | AIPerf version, request count/duration, concurrency/rate, ISL, OSL |
| Semantics | streaming, thinking, EOS policy, connection reuse |
| State | warm-up, cooldown, queue depth, cache state |
| Evidence | UTC window, application metrics, GPU metrics, errors |

## Two Workload Families

Natural-EOS latency runs preserve normal completion behavior and are useful for
user-facing latency. Output-token work can differ between arms.

Fixed-output saturation runs use `ignore_eos=true` to equalize output work.
They are synthetic stress tests, not representative user behavior. Use them to
compare throughput only when every arm completes the same token work.

## Required Metrics

- request and output-token throughput;
- average, p50/p95/p99 E2E latency;
- average, p50/p95/p99 TTFT;
- ITL or TPOT, and time to second token when available;
- running and waiting requests by backend;
- request and token distribution by backend;
- GPU utilization, framebuffer memory, power, and temperature; and
- API errors, cancellations, and output-length mismatches.

Feature-specific evidence is also required. Examples include llm-d scorer and
endpoint metrics, LMCache lookup/hit/transfer metrics, speculative-token
acceptance, and prefill/decode role metrics.

## Interpretation

Higher aggregate throughput can coexist with slower token cadence or worse
tail latency. A busy GPU proves activity, not efficiency. Report the full set
of tradeoffs and avoid cross-experiment comparisons when hardware or workload
differs.
