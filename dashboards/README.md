# vLLM Inference Dashboard

This directory contains the canonical Grafana dashboard used by the labs.

| File | Purpose |
| --- | --- |
| `llm-gpu-vllm-inference-economics.json` | vLLM, GPU, capacity, traffic, and optional economics panels |
| `kustomization.yaml` | Generates a Grafana sidecar ConfigMap |

Render and apply with an explicit serving-cluster context:

```bash
kubectl kustomize dashboards
kubectl --context "${SERVE_CONTEXT}" apply -k dashboards
```

The generated ConfigMap is placed in `observability`, labeled
`grafana_dashboard=1`, and assigned to the `LLM Inference Lab` Grafana folder.

The dashboard defaults to namespace `model-serving` and a zero price. Enter the
hourly cost and billed fleet count only when unit economics are part of the
experiment. Application panels expect the vLLM metric names used by the
baseline; GPU panels expect DCGM samples and Kubernetes pod metadata.

Remove only this dashboard with:

```bash
kubectl --context "${SERVE_CONTEXT}" delete -k dashboards
```
