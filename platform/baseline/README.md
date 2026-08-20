# vLLM Baseline

Status: portable manifests imported; live validation from this repository pending.

## Purpose

Establish a stable, observable serving shape before testing routing, caching,
autoscaling, or speculative decoding. All later experiments must be compared
against a recorded baseline with the same workload.

## Reference Topology

```text
AIPerf runner
    -> Kubernetes Service
        -> 4 vLLM replicas
            -> 1 L40S GPU per replica
```

Reference configuration:

| Setting | Value |
| --- | --- |
| Model | Qwen3.6 27B dense FP8 |
| Node | One `g6e.12xlarge` |
| GPUs | Four NVIDIA L40S |
| Replicas | Four |
| Tensor parallel size | One |
| API | OpenAI-compatible chat completion |

## Contents

| Path | Purpose |
| --- | --- |
| `base/` | four-replica vLLM Deployment, Service, and ServiceMonitor |
| `overlays/example/` | portable environment settings and Kustomize replacements |
| `render-local.sh` | renders a local overlay and rejects unresolved placeholders |

The baseline deliberately excludes KEDA, llm-d labels, LMCache connectors, MTP,
and P/D disaggregation. Those modules must be layered on top and compared back
to this shape.

## Infrastructure Prerequisites

These manifests do not provision cluster infrastructure. Before applying them,
confirm:

- namespace `model-serving` exists
- one GPU node exposes at least four schedulable GPUs
- the node has the configured `workload` label and matching taint contract
- the model PVC supports concurrent read access from four pods
- the configured ServiceAccount can use the model-storage integration
- Prometheus Operator CRDs and kube-prometheus-stack are installed
- DCGM Exporter runs on the target GPU node and is scraped by Prometheus

Keep node groups, storage, identities, GPU Operator, Prometheus, and Grafana
under Terraform or another durable infrastructure owner.

## Configure

Create an ignored local overlay:

```bash
cp -R platform/baseline/overlays/example platform/baseline/overlays/local
```

Replace every `REPLACE_WITH_*` value in
`platform/baseline/overlays/local/kustomization.yaml`:

| Setting | Meaning |
| --- | --- |
| `image` | immutable vLLM image tag or digest validated for the model |
| `modelPath` | model directory under the pod's `/models` mount |
| `modelId` | OpenAI-compatible served model name |
| `modelPvc` | RWX-capable PVC containing the model files |
| `serviceAccount` | pod identity permitted to mount/read model storage |
| `instanceType` | GPU node instance type |
| `gpuWorkloadLabel` | value shared by the GPU node label and toleration |

Render and inspect without changing the cluster:

```bash
platform/baseline/render-local.sh > /tmp/llm-gpu-vllm-baseline.yaml
```

Apply only after reviewing the rendered manifest:

```bash
kubectl --context "${SERVE_CONTEXT}" apply \
  -f /tmp/llm-gpu-vllm-baseline.yaml
```

## Request Contract

For the reference Qwen model, disable thinking per request when the benchmark is
intended to measure ordinary content generation:

```json
{"chat_template_kwargs":{"enable_thinking":false}}
```

Do not use `ignore_eos:true` in the standard benchmark. It changes termination
behavior and can force generation to the output-token cap.

## Validation

Before load:

- four model pods are Ready
- the Service has four ready endpoints
- `/v1/models` returns the expected model ID
- Prometheus scrapes every vLLM pod
- DCGM metrics exist for all four GPUs

During load:

- all four pods receive requests when tested from the in-cluster runner
- request and output-token throughput are nonzero
- TTFT and E2E latency histograms populate
- all four GPUs show utilization, memory, power, and temperature samples
- API errors and cancellations remain zero

Local port forwarding is suitable for smoke tests, but an in-cluster AIPerf
runner is the reference path for service-distribution and routing comparisons.

Install the runner and dashboard:

```bash
kubectl --context "${SERVE_CONTEXT}" apply -k platform/loadgen
kubectl --context "${SERVE_CONTEXT}" apply -k dashboards
```

Run the named smoke and distribution profiles using the served model ID:

```bash
kubectl --context "${SERVE_CONTEXT}" -n model-serving exec aiperf-runner -- \
  env AIPERF_MODEL="${MODEL_ID}" /workshop/run-profile.sh smoke

kubectl --context "${SERVE_CONTEXT}" -n model-serving exec aiperf-runner -- \
  env AIPERF_MODEL="${MODEL_ID}" /workshop/run-profile.sh distribution
```

## Cleanup

Scale model replicas and the GPU node group to the documented idle value after
the lab. Preserve the benchmark artifact directory and Grafana time window.

Copy AIPerf artifacts before deleting its `emptyDir`-backed pod:

```bash
kubectl --context "${SERVE_CONTEXT}" -n model-serving cp \
  aiperf-runner:/artifacts platform/loadgen/artifacts
```

Then remove module-owned resources:

```bash
kubectl --context "${SERVE_CONTEXT}" delete -k platform/loadgen
kubectl --context "${SERVE_CONTEXT}" delete -k dashboards
kubectl --context "${SERVE_CONTEXT}" delete \
  -f /tmp/llm-gpu-vllm-baseline.yaml
```

Full runbook: [Prerequisites and First Run](../../docs/prerequisites-and-first-run.md).
