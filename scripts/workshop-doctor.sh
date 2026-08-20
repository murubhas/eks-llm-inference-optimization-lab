#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  workshop-doctor.sh serve --context CONTEXT [options]

Options:
  --namespace NAME                Workload namespace override
  --observability-namespace NAME  Observability namespace (default: observability)
  --expected-gpus COUNT           Minimum allocatable GPU count (default: 4)
  --allow-zero-gpu                Report zero GPU capacity as WARN instead of FAIL
  --skip-prometheus-query         Skip read-only Prometheus API proxy queries
  --help                          Show this help

The doctor is read-only. It never applies, scales, patches, or deletes resources.
EOF
}

if [[ $# -lt 1 || "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

mode="$1"
shift

if [[ "${mode}" != "serve" ]]; then
  echo "mode must be serve" >&2
  usage >&2
  exit 2
fi

context=""
namespace=""
observability_namespace="${OBSERVABILITY_NAMESPACE:-observability}"
expected_gpus="${EXPECTED_GPU_COUNT:-4}"
allow_zero_gpu=false
skip_prometheus_query=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)
      context="${2:?--context requires a value}"
      shift 2
      ;;
    --namespace)
      namespace="${2:?--namespace requires a value}"
      shift 2
      ;;
    --observability-namespace)
      observability_namespace="${2:?--observability-namespace requires a value}"
      shift 2
      ;;
    --expected-gpus)
      expected_gpus="${2:?--expected-gpus requires a value}"
      shift 2
      ;;
    --allow-zero-gpu)
      allow_zero_gpu=true
      shift
      ;;
    --skip-prometheus-query)
      skip_prometheus_query=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${context}" ]]; then
  context="${SERVE_CONTEXT:-}"
fi

if [[ -z "${context}" ]]; then
  echo "an explicit --context or SERVE_CONTEXT is required" >&2
  exit 2
fi

if [[ -z "${namespace}" ]]; then
  namespace="${SERVE_NAMESPACE:-model-serving}"
fi

if ! [[ "${expected_gpus}" =~ ^[0-9]+$ ]]; then
  echo "--expected-gpus must be a non-negative integer" >&2
  exit 2
fi

statuses=()
checks=()
details=()
failure_count=0
warning_count=0

record() {
  local status="$1"
  local check="$2"
  local detail="$3"
  statuses+=("${status}")
  checks+=("${check}")
  details+=("${detail}")
  case "${status}" in
    FAIL) failure_count=$((failure_count + 1)) ;;
    WARN) warning_count=$((warning_count + 1)) ;;
  esac
}

pass() { record PASS "$1" "$2"; }
warn() { record WARN "$1" "$2"; }
fail() { record FAIL "$1" "$2"; }

mask_account_ids() {
  sed -E 's/[0-9]{12}/<account>/g'
}

require_command() {
  local command_name="$1"
  if command -v "${command_name}" >/dev/null 2>&1; then
    pass "CLI ${command_name}" "available"
  else
    fail "CLI ${command_name}" "not found"
  fi
}

require_command kubectl
require_command jq
require_command rg

if command -v aws >/dev/null 2>&1; then
  if aws sts get-caller-identity >/dev/null 2>&1; then
    pass "AWS authentication" "STS call succeeded"
  else
    warn "AWS authentication" "STS call failed; refresh the configured session"
  fi
else
  warn "AWS CLI" "not installed; Kubernetes checks will continue"
fi

context_display="$(printf '%s' "${context}" | mask_account_ids)"
if kubectl config get-contexts "${context}" -o name 2>/dev/null | rg -q -F "${context}"; then
  pass "Kube context" "${context_display}"
else
  fail "Kube context" "not found: ${context_display}"
fi

cluster_reachable=false
if kubectl --context "${context}" get --raw=/readyz >/dev/null 2>&1; then
  cluster_reachable=true
  pass "Kubernetes API" "reachable"
else
  fail "Kubernetes API" "unreachable"
fi

nodes_json='{"items":[]}'
gpu_total=0
gpu_node_count=0
ready_gpu_nodes=0

if [[ "${cluster_reachable}" == true ]]; then
  if kubectl --context "${context}" get namespace "${namespace}" >/dev/null 2>&1; then
    pass "Namespace ${namespace}" "exists"
  else
    fail "Namespace ${namespace}" "missing"
  fi

  if kubectl --context "${context}" get namespace "${observability_namespace}" >/dev/null 2>&1; then
    pass "Namespace ${observability_namespace}" "exists"
  else
    fail "Namespace ${observability_namespace}" "missing"
  fi

  for crd in servicemonitors.monitoring.coreos.com podmonitors.monitoring.coreos.com; do
    if kubectl --context "${context}" get crd "${crd}" >/dev/null 2>&1; then
      pass "CRD ${crd%%.*}" "installed"
    else
      fail "CRD ${crd%%.*}" "missing"
    fi
  done

  nodes_json="$(kubectl --context "${context}" get nodes -o json 2>/dev/null || printf '{"items":[]}')"
  gpu_node_count="$(jq '[.items[] | select(((.status.allocatable["nvidia.com/gpu"] // "0") | tonumber) > 0)] | length' <<<"${nodes_json}")"
  gpu_total="$(jq '[.items[] | ((.status.allocatable["nvidia.com/gpu"] // "0") | tonumber)] | add // 0' <<<"${nodes_json}")"
  ready_gpu_nodes="$(jq '[.items[] | select(((.status.allocatable["nvidia.com/gpu"] // "0") | tonumber) > 0) | select(any(.status.conditions[]?; .type == "Ready" and .status == "True"))] | length' <<<"${nodes_json}")"

  if (( gpu_total >= expected_gpus )); then
    pass "GPU capacity" "${gpu_total} allocatable GPUs across ${gpu_node_count} nodes"
  elif (( gpu_total == 0 )) && [[ "${allow_zero_gpu}" == true ]]; then
    warn "GPU capacity" "scaled to zero; ${expected_gpus} GPUs required before a run"
  else
    fail "GPU capacity" "${gpu_total} allocatable; expected at least ${expected_gpus}"
  fi

  if (( gpu_node_count > 0 && ready_gpu_nodes == gpu_node_count )); then
    pass "GPU node readiness" "${ready_gpu_nodes}/${gpu_node_count} Ready"
  elif (( gpu_node_count == 0 )); then
    warn "GPU node readiness" "no GPU nodes are currently registered"
  else
    fail "GPU node readiness" "${ready_gpu_nodes}/${gpu_node_count} Ready"
  fi

  if [[ -n "${GPU_WORKLOAD_LABEL:-}" ]]; then
    matching_gpu_nodes="$(jq --arg value "${GPU_WORKLOAD_LABEL}" '[.items[] | select(.metadata.labels.workload == $value) | select(((.status.allocatable["nvidia.com/gpu"] // "0") | tonumber) > 0)] | length' <<<"${nodes_json}")"
    if (( matching_gpu_nodes > 0 )); then
      pass "GPU workload label" "${matching_gpu_nodes} node(s) match workload=${GPU_WORKLOAD_LABEL}"
    else
      fail "GPU workload label" "no GPU node matches workload=${GPU_WORKLOAD_LABEL}"
    fi
  else
    warn "GPU workload label" "GPU_WORKLOAD_LABEL is not configured"
  fi

  all_pods="$(kubectl --context "${context}" get pods -A -o json 2>/dev/null || printf '{"items":[]}')"
  running_prometheus="$(jq --arg ns "${observability_namespace}" '[.items[] | select(.metadata.namespace == $ns) | select(.metadata.name | test("prometheus")) | select(.status.phase == "Running")] | length' <<<"${all_pods}")"
  running_grafana="$(jq --arg ns "${observability_namespace}" '[.items[] | select(.metadata.namespace == $ns) | select(.metadata.name | test("grafana")) | select(.status.phase == "Running")] | length' <<<"${all_pods}")"
  running_dcgm="$(jq '[.items[] | select(.metadata.name | test("dcgm-exporter")) | select(.status.phase == "Running")] | length' <<<"${all_pods}")"
  running_device_plugin="$(jq '[.items[] | select(.metadata.name | test("nvidia-device-plugin")) | select(.status.phase == "Running")] | length' <<<"${all_pods}")"

  (( running_prometheus > 0 )) && pass "Prometheus" "running" || fail "Prometheus" "no running Prometheus pod found"
  (( running_grafana > 0 )) && pass "Grafana" "running" || fail "Grafana" "no running Grafana pod found"

  if (( gpu_node_count > 0 )); then
    (( running_device_plugin >= ready_gpu_nodes )) \
      && pass "NVIDIA device plugin" "${running_device_plugin} running pod(s)" \
      || fail "NVIDIA device plugin" "${running_device_plugin} running for ${ready_gpu_nodes} Ready GPU nodes"
    (( running_dcgm >= ready_gpu_nodes )) \
      && pass "DCGM Exporter" "${running_dcgm} running pod(s)" \
      || fail "DCGM Exporter" "${running_dcgm} running for ${ready_gpu_nodes} Ready GPU nodes"
  else
    warn "NVIDIA device plugin" "cannot verify without a registered GPU node"
    warn "DCGM Exporter" "cannot verify without a registered GPU node"
  fi

  if [[ -n "${MODEL_PVC:-}" ]]; then
    kubectl --context "${context}" -n "${namespace}" get pvc "${MODEL_PVC}" >/dev/null 2>&1 \
      && pass "Model PVC" "${MODEL_PVC} exists" \
      || fail "Model PVC" "${MODEL_PVC} missing in ${namespace}"
  else
    warn "Model PVC" "MODEL_PVC is not configured"
  fi

  if [[ -n "${MODEL_SERVICE_ACCOUNT:-}" ]]; then
    kubectl --context "${context}" -n "${namespace}" get serviceaccount "${MODEL_SERVICE_ACCOUNT}" >/dev/null 2>&1 \
      && pass "Model ServiceAccount" "${MODEL_SERVICE_ACCOUNT} exists" \
      || fail "Model ServiceAccount" "${MODEL_SERVICE_ACCOUNT} missing in ${namespace}"
  else
    warn "Model ServiceAccount" "MODEL_SERVICE_ACCOUNT is not configured"
  fi

  local_overlay="${repo_root}/platform/baseline/overlays/local/kustomization.yaml"
  if [[ -f "${local_overlay}" ]]; then
    if "${repo_root}/platform/baseline/render-local.sh" >/dev/null 2>&1; then
      pass "Baseline overlay" "renders without placeholders"
    else
      fail "Baseline overlay" "render failed or placeholders remain"
    fi
  else
    warn "Baseline overlay" "overlays/local is not configured"
  fi

  runner_phase="$(kubectl --context "${context}" -n "${namespace}" get pod aiperf-runner -o jsonpath='{.status.phase}' 2>/dev/null || true)"
  runner_ready="$(kubectl --context "${context}" -n "${namespace}" get pod aiperf-runner -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || true)"
  if [[ "${runner_phase}" == "Running" && "${runner_ready}" == "true" ]]; then
    pass "AIPerf runner" "Ready"
  elif [[ -z "${runner_phase}" ]]; then
    warn "AIPerf runner" "not deployed"
  else
    warn "AIPerf runner" "phase=${runner_phase:-unknown}, ready=${runner_ready:-false}"
  fi

  if [[ "${skip_prometheus_query}" == true ]]; then
    warn "Prometheus metrics" "query skipped by request"
  else
    services_json="$(kubectl --context "${context}" -n "${observability_namespace}" get services -o json 2>/dev/null || printf '{"items":[]}')"
    prometheus_service="$(jq -r '.items[] | select(any(.spec.ports[]?; .port == 9090)) | .metadata.name' <<<"${services_json}" | head -n 1)"
    prometheus_port="$(jq -r --arg name "${prometheus_service}" '.items[] | select(.metadata.name == $name) | .spec.ports[] | select(.port == 9090) | (.name // "9090")' <<<"${services_json}" | head -n 1)"

    if [[ -z "${prometheus_service}" ]]; then
      warn "Prometheus metrics" "port-9090 Service not discovered"
    else
      query_prometheus() {
        local query="$1"
        local encoded
        local path
        encoded="$(jq -rn --arg query "${query}" '$query | @uri')"
        path="/api/v1/namespaces/${observability_namespace}/services/${prometheus_service}:${prometheus_port}/proxy/api/v1/query?query=${encoded}"
        kubectl --context "${context}" get --raw "${path}" 2>/dev/null
      }

      if query_prometheus 'count(up)' | jq -e '.status == "success"' >/dev/null 2>&1; then
        pass "Prometheus API" "read-only query succeeded"
      else
        warn "Prometheus API" "Kubernetes Service proxy query failed"
      fi

      dcgm_count="$(query_prometheus 'count(DCGM_FI_DEV_GPU_UTIL)' | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || printf '0')"
      dcgm_count="${dcgm_count%.*}"
      if (( gpu_total > 0 && dcgm_count >= expected_gpus )); then
        pass "DCGM metrics" "${dcgm_count} GPU series discovered"
      elif (( gpu_total == 0 )); then
        warn "DCGM metrics" "no active GPU capacity to verify"
      else
        fail "DCGM metrics" "${dcgm_count} series; expected at least ${expected_gpus}"
      fi

      app_query='count(vllm:request_success_total)'
      app_label='vLLM metrics'
      app_count="$(query_prometheus "${app_query}" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || printf '0')"
      app_count="${app_count%.*}"
      if (( app_count > 0 )); then
        pass "${app_label}" "${app_count} series discovered"
      else
        warn "${app_label}" "no active workload series; expected while scaled down or idle"
      fi
    fi
  fi
fi

printf '\nInference lab doctor\n'
printf '%-6s  %-28s  %s\n' STATUS CHECK DETAIL
printf '%-6s  %-28s  %s\n' ------ ---------------------------- ----------------------------------------
for index in "${!statuses[@]}"; do
  printf '%-6s  %-28s  %s\n' "${statuses[$index]}" "${checks[$index]}" "${details[$index]}"
done

printf '\nSummary: %d failure(s), %d warning(s)\n' "${failure_count}" "${warning_count}"

if (( failure_count > 0 )); then
  exit 1
fi
