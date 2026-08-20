# Inference Observability

Observability is a validity gate for every benchmark, not a post-processing
step.

## Signal Architecture

```text
vLLM /metrics --------------\
llm-d EPP/Envoy metrics ------> Prometheus -> Grafana
DCGM exporter /metrics ------/
Kubernetes state metrics ---/
```

| Source | Answers |
| --- | --- |
| vLLM | requests, tokens, latency histograms, queue, and local KV pressure |
| llm-d EPP/Envoy | routing, upstreams, proxy failures, and request-path latency |
| DCGM | per-GPU utilization, memory, power, temperature, and identity |
| kube-state-metrics | pods, requested GPUs, replicas, HPA, and workload state |

Application metrics explain what the serving workload is doing. DCGM explains
what the physical GPUs are doing. Neither substitutes for the other.

## Durable Platform Expectations

- Prometheus Operator CRDs, including `ServiceMonitor` and `PodMonitor`;
- selectors compatible with the installed Prometheus release;
- explicit metrics ports, paths, intervals, and namespaces;
- DCGM Exporter on every GPU node; and
- enough retention to preserve all planned experiment windows.

Portable values and ownership guidance are under
[`kube-prometheus-stack`](./kube-prometheus-stack/README.md) and
[`gpu-operator`](./gpu-operator/README.md).

## Required Signals

```text
vllm:request_success_total
vllm:prompt_tokens_total
vllm:generation_tokens_total
vllm:e2e_request_latency_seconds_bucket
vllm:time_to_first_token_seconds_bucket
vllm:inter_token_latency_seconds_bucket
vllm:num_requests_running
vllm:num_requests_waiting
vllm:kv_cache_usage_perc

DCGM_FI_DEV_GPU_UTIL
DCGM_FI_DEV_FB_USED
DCGM_FI_DEV_FB_FREE
DCGM_FI_DEV_POWER_USAGE
DCGM_FI_DEV_GPU_TEMP
```

Metric names and labels can change across runtime and exporter versions. Pin
images and validate the live series before trusting dashboard panels.

## Pre-Run Gate

Do not start a measured run until:

1. every expected vLLM target is up;
2. DCGM targets exist on every expected GPU node;
3. Grafana receives current application and GPU samples;
4. router metrics exist for llm-d experiments; and
5. dashboard variables select the intended namespace, pods, and cost inputs.

Query Prometheus directly before changing Grafana. An empty panel is often a
scrape or label problem rather than a rendering problem.
