# kube-prometheus-stack Baseline

The lab assumes Prometheus Operator CRDs, Prometheus, Grafana,
kube-state-metrics, and the Grafana dashboard sidecar are already installed.
The smallest shared baseline is `kube-prometheus-stack`.

`values.example.yaml` documents the dashboard sidecar contract used by this
repository. It is an overlay, not a complete production values file.

```bash
helm upgrade --install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --version "${KUBE_PROMETHEUS_STACK_CHART_VERSION}" \
  --namespace observability \
  --create-namespace \
  --values platform/observability/kube-prometheus-stack/values.example.yaml \
  --kube-context "${SERVE_CONTEXT}"
```

The inference `ServiceMonitor` carries `release=kube-prometheus-stack`. If the
Helm release has another name, change that label or configure the Prometheus
ServiceMonitor selector deliberately.

Set `KUBE_PROMETHEUS_STACK_CHART_VERSION` to a version tested with the target
Kubernetes cluster. Do not use an unpinned chart for a recorded experiment.

Verify the CRDs and workloads before deploying inference metrics:

```bash
kubectl --context "${SERVE_CONTEXT}" get crd servicemonitors.monitoring.coreos.com
kubectl --context "${SERVE_CONTEXT}" get crd podmonitors.monitoring.coreos.com
kubectl --context "${SERVE_CONTEXT}" -n observability get pods
```

Prefer Terraform or another infrastructure owner for durable installation.
Do not install the chart a second time when the cluster already has a managed
Prometheus/Grafana stack.

Upstream reference: [prometheus-community/kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack).
