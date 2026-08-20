# AIPerf Benchmarks

Status: portable runner and fixed baseline profiles imported.

## Purpose

Use NVIDIA AIPerf to generate repeatable OpenAI-compatible LLM traffic and
export client-observed latency and throughput artifacts.

## Why Run In Cluster

The reference benchmark runs from a persistent CPU-only pod:

```text
AIPerf runner -> cluster DNS -> selected serving entry point
```

This avoids local port-forward pinning, laptop network variation, and client
connection artifacts that can hide backend distribution.

Local Kftray or `kubectl port-forward` remains useful for a three-request smoke
test, but not for the final Kubernetes Service versus llm-d comparison.

## Entry Points

| Path under test | URL pattern |
| --- | --- |
| Kubernetes baseline | `http://<vllm-service>.<namespace>.svc` |
| llm-d routing | `http://<llm-d-router-service>.<namespace>.svc` |
| Local smoke test | `http://127.0.0.1:<local-port>` |

The URL points to the traffic entry point, never directly to a model pod during
a routing or service-distribution benchmark.

## Reference Request Settings

```text
endpoint type: chat
streaming:     enabled
tokenizer:     builtin
```

For the reference Qwen thinking-capable model:

```json
{"chat_template_kwargs":{"enable_thinking":false}}
```

Do not combine this with `ignore_eos:true` in the standard benchmark. Ignoring
EOS changes output behavior and can make the model generate until the hard cap.

## Workload Profiles

Use small profiles in sequence:

1. connectivity: one worker, three requests
2. distribution: concurrency four, approximately 50 requests
3. routing comparison: identical higher-concurrency workload through both paths
4. prefix-reuse: long shared prefix when evaluating request-aware routing or
   external KV cache
5. P/D: long input sequence, such as ISL 4096, to make prefill work visible

The exact values belong in a benchmark result record. Do not silently change
request count, concurrency, prompt distribution, or connection reuse between A/B
runs.

## Imported Contents

- persistent CPU-only runner manifest
- AIPerf `0.10.0` installation contract
- smoke, distribution, and shared-prefix profiles
- wrapper with fixed thinking, EOS, streaming, and connection behavior
- sanitized representative result

The current runner installs `tar` and pinned AIPerf into a pod-local environment
at startup. This is convenient for the workshop but requires Debian and Python
package-registry egress. Its readiness probe succeeds only after AIPerf and the
artifact-copy dependency are available. A later promotion may replace it with
an immutable prebuilt runner image without changing the profile contract.

## Install

```bash
kubectl --context "${SERVE_CONTEXT}" apply -k platform/loadgen
kubectl --context "${SERVE_CONTEXT}" -n model-serving wait \
  --for=condition=Ready pod/aiperf-runner --timeout=10m
```

The runner defaults to the baseline Kubernetes Service. Supply the served model
ID at execution time:

```bash
kubectl --context "${SERVE_CONTEXT}" -n model-serving exec aiperf-runner -- \
  env AIPERF_MODEL="${MODEL_ID}" /workshop/run-profile.sh distribution
```

To test another entry point later, override both variables without changing the
profile:

```bash
kubectl --context "${SERVE_CONTEXT}" -n model-serving exec aiperf-runner -- \
  env AIPERF_MODEL="${MODEL_ID}" \
      AIPERF_URL="${ENTRYPOINT_URL}" \
      /workshop/run-profile.sh prefix-reuse
```

## Output Contract

Preserve at least:

```text
profile_export_aiperf.json
profile_export_aiperf.csv
logs/aiperf.log
exact CLI command
Prometheus snapshot
Grafana time window
```

Copy completed artifacts out of the runner before deleting it. Raw artifacts
are ignored by Git; commit only reviewed, sanitized summaries.

```bash
kubectl --context "${SERVE_CONTEXT}" -n model-serving cp \
  aiperf-runner:/artifacts platform/loadgen/artifacts
```

Generate a portable YAML record and a review-friendly Markdown table from
the raw JSON export:

```bash
python3 scripts/summarize_aiperf.py \
  platform/loadgen/artifacts/<run>/profile_export_aiperf.json \
  --yaml-out platform/loadgen/artifacts/<run>/summary.yaml \
  --markdown-out platform/loadgen/artifacts/<run>/summary.md \
  --module platform/baseline \
  --model-label "Qwen 27B FP8" \
  --entrypoint kubernetes-service \
  --instance-type g6e.12xlarge \
  --active-node-count 1 \
  --gpu-type "NVIDIA L40S" \
  --gpu-count 4 \
  --replicas 4
```

The generator captures request throughput, output-token throughput, E2E
latency, TTFT, time to second token, ITL/TPOT, workload shape, errors, and EOS
mismatches. It deliberately excludes the endpoint URL, raw CLI command, and
local artifact path. Review the supplied environment values before checking in
a sanitized result.

AIPerf `0.10.0` does not report a separate TPOT field in this export. The
summary labels mean inter-token latency as a derived TPOT proxy rather than
presenting it as an independently measured value.

The checked-in
[`baseline-prefix-reuse.example.yaml`](./baseline-prefix-reuse.example.yaml) is
a sanitized observed result showing the expected fields. It is evidence of one
run, not a performance promise.

[`fixtures/profile_export_aiperf.sample.json`](./fixtures/profile_export_aiperf.sample.json)
is test data for the generator, not benchmark evidence.

## Validity Gates

Reject or clearly label a run when:

- API errors or cancellations occurred
- expected model replicas were not Ready before load
- KEDA changed capacity during a fixed benchmark
- vLLM, router, or DCGM Prometheus targets were down
- expected GPUs were missing from DCGM
- one path used local forwarding while the other used in-cluster DNS
- workload or connection behavior differed between comparison legs
