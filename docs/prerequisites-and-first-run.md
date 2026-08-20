# Prerequisites and First Run

This guide takes a new operator from a cloned repository to one observable,
in-cluster vLLM benchmark. The repository supplies workload examples and test
tools; it does not create an EKS cluster or GPU capacity.

## Platform Contract

| Capability | Minimum requirement | Quick check |
| --- | --- | --- |
| AWS and EKS access | Authenticated CLI session and an explicit kube context | `aws sts get-caller-identity`; `kubectl --context "${SERVE_CONTEXT}" get --raw=/readyz` |
| GPU capacity | Schedulable NVIDIA GPUs appropriate for the chosen model | `kubectl --context "${SERVE_CONTEXT}" get nodes -o wide` |
| NVIDIA runtime | Driver, container toolkit, and device plugin | GPU nodes advertise `nvidia.com/gpu` |
| GPU telemetry | DCGM Exporter on every GPU node, scraped by Prometheus | `count(DCGM_FI_DEV_GPU_UTIL)` |
| Monitoring | Prometheus Operator, Prometheus, Grafana, and kube-state-metrics | Monitoring pods are Ready |
| Monitoring CRDs | `ServiceMonitor` and `PodMonitor` | `kubectl get crd servicemonitors.monitoring.coreos.com podmonitors.monitoring.coreos.com` |
| Model storage | A PVC readable by every model replica | PVC and mount behavior are validated |
| Serving image | Immutable, tested vLLM image reachable from the cluster | Bounded image-pull test succeeds |
| CPU capacity | Room for monitoring, AIPerf, KEDA, and optional routers | `kubectl top nodes` when Metrics Server exists |

The examples use a shared PVC but do not prescribe EFS, FSx for Lustre, or
another CSI implementation. Validate concurrent model reads and cold-load time
for the chosen storage system.

Later labs add their own prerequisites:

| Lab | Additional requirement |
| --- | --- |
| KEDA autoscaling | KEDA operator and a working Prometheus scaler query |
| llm-d routing | Gateway API Inference Extension CRDs and CPU capacity for Router/EPP/Envoy |
| MIG | MIG-capable GPU, GPU Operator/MIG Manager, and the selected MIG profile |
| Multi-node TP/PP | A compatible distributed launcher and NCCL transport |
| LMCache | LMCache-compatible vLLM image and connector configuration |
| P/D disaggregation | Compatible model, KV connector, and transfer transport |
| MTP | Model-native speculative-decoding support in the serving image |
| Runtime comparison | Checkpoint support in both runtimes and enough GPU memory to keep one isolated endpoint per arm |

## 1. Configure Local Inputs

Install `git`, `aws`, `kubectl`, `make`, `jq`, `rg`, `python3`, `ruby`, and
`node`. Then, from the repository root:

```bash
cp config/environment.example config/environment.local
source config/environment.local
```

Replace every placeholder in the ignored local file. Never commit credentials,
kubeconfig content, private keys, passwords, account IDs, or private endpoint
names.

## 2. Validate the Repository and Cluster

Run static validation without changing a cluster:

```bash
make validate
```

Run the read-only serving preflight:

```bash
make doctor-serve
```

Missing GPU capacity, Prometheus, DCGM, monitoring CRDs, storage, or identity
must be resolved before a measured run. Use `--allow-zero-gpu` only to inspect a
deliberately scaled-down control plane.

## 3. Configure the Baseline

Create an ignored Kustomize overlay:

```bash
cp -R platform/baseline/overlays/example \
  platform/baseline/overlays/local
```

Replace every `REPLACE_WITH_*` value in
`platform/baseline/overlays/local/kustomization.yaml`, then render and review:

```bash
platform/baseline/render-local.sh \
  > /tmp/llm-inference-baseline.yaml
```

Inspect the image, model path, PVC, ServiceAccount, node selector, toleration,
GPU request, replica count, and vLLM arguments before applying it.

## 4. Deploy and Observe

```bash
kubectl --context "${SERVE_CONTEXT}" apply \
  -f /tmp/llm-inference-baseline.yaml

kubectl --context "${SERVE_CONTEXT}" \
  -n "${SERVE_NAMESPACE}" rollout status \
  deployment/llm-gpu-vllm-baseline --timeout=30m

kubectl --context "${SERVE_CONTEXT}" apply -k dashboards
kubectl --context "${SERVE_CONTEXT}" apply -k platform/loadgen

kubectl --context "${SERVE_CONTEXT}" \
  -n "${SERVE_NAMESPACE}" wait \
  --for=condition=Ready pod/aiperf-runner --timeout=10m
```

Before load, verify all intended model pods and Service endpoints are Ready,
Prometheus sees every vLLM target, DCGM reports every expected GPU, and Grafana
shows current application and GPU samples.

## 5. Run AIPerf

The in-cluster runner avoids local port-forward backend pinning. Start small:

```bash
kubectl --context "${SERVE_CONTEXT}" \
  -n "${SERVE_NAMESPACE}" exec aiperf-runner -- \
  env AIPERF_MODEL="${MODEL_ID}" \
  /workshop/run-profile.sh smoke
```

Then verify distribution and shared-prefix behavior:

```bash
kubectl --context "${SERVE_CONTEXT}" \
  -n "${SERVE_NAMESPACE}" exec aiperf-runner -- \
  env AIPERF_MODEL="${MODEL_ID}" \
  /workshop/run-profile.sh distribution

kubectl --context "${SERVE_CONTEXT}" \
  -n "${SERVE_NAMESPACE}" exec aiperf-runner -- \
  env AIPERF_MODEL="${MODEL_ID}" \
      AIPERF_URL="${AIPERF_URL}" \
  /workshop/run-profile.sh prefix-reuse
```

| Profile | Concurrency | Request rate | Requests | ISL | OSL | Shared prefix |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `smoke` | 1 | 0.2 req/s | 3 | 128 | 128 | 0 |
| `distribution` | 4 | 1 req/s | 50 | 256 | 128 | 0 |
| `prefix-reuse` | 8 | 1 req/s | 100 | 512 | 128 | 4,096 |

The wrapper fixes streaming, constant arrivals, disabled Qwen thinking,
natural EOS, and disabled client connection reuse. Create a versioned profile
instead of changing arguments between A/B legs.

## 6. Preserve Results

The runner uses `emptyDir`, so copy results before deleting it:

```bash
mkdir -p platform/loadgen/artifacts

kubectl --context "${SERVE_CONTEXT}" \
  -n "${SERVE_NAMESPACE}" cp \
  aiperf-runner:/artifacts platform/loadgen/artifacts
```

Create a sanitized summary from an AIPerf JSON export:

```bash
python3 scripts/summarize_aiperf.py \
  platform/loadgen/artifacts/<run>/profile_export_aiperf.json \
  --yaml-out platform/loadgen/artifacts/<run>/summary.yaml \
  --markdown-out platform/loadgen/artifacts/<run>/summary.md \
  --module platform/baseline \
  --model-label "Qwen 27B FP8" \
  --entrypoint kubernetes-service \
  --instance-type "${GPU_INSTANCE_TYPE}" \
  --active-node-count 1 \
  --gpu-type "NVIDIA L40S" \
  --gpu-count 4 \
  --replicas 4
```

Raw benchmark artifacts remain ignored by Git. Review every generated summary
before publishing it.

## 7. Interpret and Clean Up

A valid baseline has zero API errors, nonzero throughput, populated E2E/TTFT/ITL
metrics, expected backend distribution, and activity on every intended GPU.
Do not compare paths unless model, image, GPU shape, replicas, prompts, request
count, request rate, concurrency, EOS, connection behavior, and observation
window are held constant.

After preserving artifacts:

```bash
kubectl --context "${SERVE_CONTEXT}" delete -k platform/loadgen
kubectl --context "${SERVE_CONTEXT}" delete -k dashboards
kubectl --context "${SERVE_CONTEXT}" delete \
  -f /tmp/llm-inference-baseline.yaml
```

Return expensive capacity to its documented idle value through the durable
infrastructure owner.

## Continue Through the Labs

Run the numbered directories under [`experiments/`](../experiments/) one at a
time. Each README states its variable under test, supporting files, result
boundary, and cleanup expectations.
