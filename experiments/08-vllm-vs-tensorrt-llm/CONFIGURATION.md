# Runtime Comparison Configuration

This guide reproduces the controlled vLLM versus TensorRT-LLM experiment. It
uses one `p5.48xlarge` node, assigns one H100 to each runtime, and deliberately
keeps the other six H100s outside the benchmark.

The measured TensorRT-LLM path used its PyTorch backend. AutoDeploy graph
compilation was unavailable for this Qwen3.6 27B checkpoint in the evaluated
release, so this configuration is not an AutoDeploy benchmark.

## Tested Runtime Contract

| Component | Tested value |
|---|---|
| GPU node | One `p5.48xlarge`, 8 x H100 80 GiB |
| GPUs benchmarked | 2: one dedicated H100 per runtime |
| Model | Same Qwen3.6 27B BF16 checkpoint |
| Tensor parallelism | TP=1 for both runtimes |
| vLLM | 0.24.0-derived image |
| TensorRT-LLM | 1.3.0rc24, PyTorch backend |
| TensorRT-LLM image | `nvcr.io/nvidia/tensorrt-llm/release@sha256:16a103b8b1b682d287e8043fc674d23fa52d5b5f2127da913bf6c0643db3a073` |
| Client | AIPerf 0.11.0 inside the cluster |
| Order | A1 vLLM, B1 TensorRT-LLM, B2 TensorRT-LLM, A2 vLLM |

The measured vLLM control used a private 0.24.0-derived image. Its registry is
intentionally excluded from this public repository. The public manifest starts
from `vllm/vllm-openai:v0.24.0`; pin a validated digest before publishing new
results. Do not claim a bit-for-bit reproduction when the vLLM image differs.

## TensorRT-LLM Options

The working launch command is preserved in
[`manifests/tensorrt-llm-pytorch.yaml`](manifests/tensorrt-llm-pytorch.yaml).

| Option | Tested value | Purpose |
|---|---:|---|
| `--backend` | `pytorch` | Use TensorRT-LLM's PyTorch backend |
| `--tp_size` | `1` | Keep the model on one H100 |
| `--kv_cache_free_gpu_memory_fraction` | `0.80` | Allocate most remaining VRAM to KV cache |
| `--max_seq_len` | `8192` | Match the controlled context limit |
| `--max_num_tokens` | `8192` | Bound tokens considered by the scheduler |
| `--max_batch_size` | `8` | Match the benchmark concurrency ceiling |
| `--trust_remote_code` | enabled | Permit the model's custom implementation |
| `--config` | `/etc/trtllm/llm_api_options.yaml` | Enable runtime performance metrics |

The options ConfigMap enables:

```yaml
return_perf_metrics: true
enable_iter_perf_stats: true
```

TensorRT-LLM exposes health at `/health`, the OpenAI-compatible API under
`/v1`, and Prometheus metrics at `/prometheus/metrics` in this configuration.

## Kubernetes Prerequisites

Before applying the manifests, provide:

1. A namespace named `model-serving`.
2. A GPU node labeled with
   `node.kubernetes.io/instance-type=p5.48xlarge`.
3. The NVIDIA device plugin or GPU Operator advertising `nvidia.com/gpu`.
4. A `model-storage` PVC containing the BF16 checkpoint at
   `/models/qwen3.6-27b-bf16` inside the pod.
5. A `model-artifact-reader` ServiceAccount, or change the manifests to an
   existing ServiceAccount.
6. Prometheus Operator CRDs if the included ServiceMonitors are used.
7. An in-cluster pod named `aiperf-runner` with Python, `pip`, and enough
   temporary storage for benchmark artifacts.

If your GPU nodes use workload-specific taints, add matching tolerations to
both Deployments. If NGC requires authentication in your environment, add the
appropriate image pull secret without committing credentials.

## Model Layout Check

Confirm the model is visible before starting either runtime:

```bash
kubectl --context "$SERVE_CONTEXT" -n model-serving run model-layout-check \
  --rm -it --restart=Never \
  --image=public.ecr.aws/amazonlinux/amazonlinux:2023 \
  --overrides='{
    "spec": {
      "containers": [{
        "name": "check",
        "image": "public.ecr.aws/amazonlinux/amazonlinux:2023",
        "command": ["sh", "-c", "test -f /models/qwen3.6-27b-bf16/config.json && ls -lh /models/qwen3.6-27b-bf16/config.json"],
        "volumeMounts": [{"name": "models", "mountPath": "/models", "readOnly": true}]
      }],
      "volumes": [{"name": "models", "persistentVolumeClaim": {"claimName": "model-storage"}}]
    }
  }'
```

Adapt the temporary pod's node selector and tolerations when the PVC can only
mount on selected nodes.

## Deploy in a Controlled Order

Apply vLLM first. The TensorRT-LLM manifest contains required pod affinity to
the vLLM control, which makes the two runtime pods share one physical node.

```bash
kubectl --context "$SERVE_CONTEXT" apply \
  -f experiments/08-vllm-vs-tensorrt-llm/manifests/vllm-control.yaml

kubectl --context "$SERVE_CONTEXT" -n model-serving rollout status \
  deployment/runtime-a-vllm --timeout=120m

kubectl --context "$SERVE_CONTEXT" apply \
  -f experiments/08-vllm-vs-tensorrt-llm/manifests/tensorrt-llm-pytorch.yaml

kubectl --context "$SERVE_CONTEXT" -n model-serving rollout status \
  deployment/runtime-b-trtllm --timeout=120m
```

Verify that both pods are on the same P5 node and each requests one GPU:

```bash
kubectl --context "$SERVE_CONTEXT" -n model-serving get pods \
  -l experiment=runtime-comparison \
  -o custom-columns='POD:.metadata.name,NODE:.spec.nodeName,GPU:.spec.containers[0].resources.requests.nvidia\.com/gpu,READY:.status.containerStatuses[0].ready'
```

## Fail-Closed Smoke Gate

Run the smoke test before generating benchmark load:

```bash
export KUBE_CONTEXT="$SERVE_CONTEXT"
experiments/08-vllm-vs-tensorrt-llm/scripts/smoke-test.sh
```

The script fails unless:

- both Deployments become available;
- exactly two experiment pods exist on one physical node;
- both Services have endpoints;
- `/health`, `/v1/models`, and each metrics endpoint answer;
- each runtime returns a non-empty chat completion.

Also record the runtime versions from startup logs:

```bash
kubectl --context "$SERVE_CONTEXT" -n model-serving logs deployment/runtime-a-vllm | head -n 40
kubectl --context "$SERVE_CONTEXT" -n model-serving logs deployment/runtime-b-trtllm | head -n 40
```

## Run the A/B/B/A Benchmark

```bash
export KUBE_CONTEXT="$SERVE_CONTEXT"
export COOLDOWN_SECONDS=60
experiments/08-vllm-vs-tensorrt-llm/scripts/run-aiperf-abba.sh
```

Defaults reproduce the measured request contract:

- 32 warm-up requests before every measured arm;
- 30 seconds between warm-up and measurement;
- 200 measured requests per arm;
- concurrency 8, ISL 256, OSL 128;
- streaming and fixed output using `ignore_eos=true`;
- thinking disabled;
- connection reuse disabled;
- deterministic random seed `20260818`;
- 60-second planned cooldown between arms.

The runner writes ignored artifacts under
`artifacts/runtime-comparison/<run-id>`.

Summarize a completed run with:

```bash
python3 experiments/08-vllm-vs-tensorrt-llm/scripts/summarize-results.py \
  artifacts/runtime-comparison/<run-id> \
  --cooldown-seconds 60
```

## Metrics Collection

The benchmark intentionally uses `--no-server-metrics` and
`--no-gpu-telemetry`; this prevents the load client from becoming a second
telemetry collector. Prometheus and DCGM should collect those signals
independently.

Verify the ServiceMonitors and targets before every arm:

```bash
kubectl --context "$SERVE_CONTEXT" -n model-serving get servicemonitor \
  runtime-a-vllm runtime-b-trtllm
kubectl --context "$SERVE_CONTEXT" -n model-serving get endpoints \
  runtime-a-vllm runtime-b-trtllm
```

At minimum retain output throughput, request throughput, TTFT, time to second
token, ITL, E2E latency, request errors, GPU utilization, framebuffer memory,
power, temperature, pod restarts, and Prometheus target health.

## Compatibility Gate

Do not silently substitute the compressed-tensors FP8 checkpoint. In the
measured software stack it failed before readiness with a Qwen hybrid-model
FP8 scale-layout mismatch (`5120` versus `48`). BF16 served successfully.

Treat model loading as a required gate:

1. Wait for readiness.
2. Capture the first model-initialization traceback if readiness fails.
3. Classify the failure before changing flags or precision.
4. Do not include a failed or modified arm in the performance comparison.

## Cleanup

```bash
kubectl --context "$SERVE_CONTEXT" delete \
  -f experiments/08-vllm-vs-tensorrt-llm/manifests/tensorrt-llm-pytorch.yaml
kubectl --context "$SERVE_CONTEXT" delete \
  -f experiments/08-vllm-vs-tensorrt-llm/manifests/vllm-control.yaml
```

Scaling or deleting the GPU node group remains a separate infrastructure
decision. Confirm that no other workload uses the node before changing it.
