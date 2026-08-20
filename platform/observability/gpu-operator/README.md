# GPU Operator and DCGM

The inference dashboard combines application metrics from vLLM with physical
GPU telemetry from NVIDIA DCGM Exporter.

`dcgm-values.preinstalled-driver.example.yaml` is a narrow values overlay for
clusters whose GPU node image already supplies the NVIDIA driver and container
toolkit. It enables DCGM, DCGM Exporter, and its ServiceMonitor while leaving
driver and toolkit management disabled.

Do not use that overlay blindly on a cluster without working drivers, the
container toolkit, and the NVIDIA device plugin. In that case, start from the
GPU Operator installation guidance for the node OS and AMI instead.

Example for an existing GPU Operator release:

```bash
helm upgrade --install gpu-operator \
  nvidia/gpu-operator \
  --version "${GPU_OPERATOR_CHART_VERSION}" \
  --namespace gpu-operator \
  --create-namespace \
  --values platform/observability/gpu-operator/dcgm-values.preinstalled-driver.example.yaml \
  --kube-context "${SERVE_CONTEXT}"
```

The ServiceMonitor label assumes the Prometheus Helm release is named
`kube-prometheus-stack`. Adjust the label when your selector contract differs.
Set `GPU_OPERATOR_CHART_VERSION` to a chart version tested with the node OS,
driver, container runtime, and Kubernetes version.

Verify before an inference benchmark:

```bash
kubectl --context "${SERVE_CONTEXT}" -n gpu-operator get pods
kubectl --context "${SERVE_CONTEXT}" get servicemonitor -A | grep dcgm
```

Then query Prometheus for all expected devices:

```promql
count(DCGM_FI_DEV_GPU_UTIL)
```

DCGM framebuffer memory is total physical usage. It does not independently
separate weights, KV cache, activations, or framework workspaces.

Upstream references:

- [NVIDIA GPU Operator installation](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/getting-started.html)
- [NVIDIA DCGM Exporter](https://docs.nvidia.com/datacenter/dcgm/latest/gpu-telemetry/dcgm-exporter.html)
