#!/usr/bin/env bash
set -euo pipefail

TOPOLOGY="${1:?usage: $0 <tp2|tp4|pp2>}"
case "${TOPOLOGY}" in
  tp2)
    SERVICE=qwen36-g7-tp2
    DEFAULT_MODEL=qwen36-27b-all1000-fp8-g7-tp-benchmark
    ;;
  tp4)
    SERVICE=qwen36-g7-tp4
    DEFAULT_MODEL=qwen36-27b-all1000-fp8-g7-tp-benchmark
    ;;
  pp2)
    SERVICE=qwen36-g7-pp2
    DEFAULT_MODEL=qwen36-27b-all1000-fp8-g7-pp2-benchmark
    ;;
  *)
    echo "Unsupported topology: ${TOPOLOGY}" >&2
    exit 2
    ;;
esac

NAMESPACE="${NAMESPACE:-model-serving}"
RUNNER="${RUNNER:-aiperf-runner}"
MODEL="${MODEL:-${DEFAULT_MODEL}}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
SERVICE_URL="http://${SERVICE}.${NAMESPACE}.svc.cluster.local"
REMOTE_ROOT="/tmp/aiperf-g7-${TOPOLOGY}-${RUN_ID}"
LOCAL_ROOT="artifacts/llm-d/g7-tp-comparison/${TOPOLOGY}-${RUN_ID}"

LATENCY_CONCURRENCY="${LATENCY_CONCURRENCY:-2}"
LATENCY_REQUEST_COUNT="${LATENCY_REQUEST_COUNT:-50}"
SATURATION_CONCURRENCY="${SATURATION_CONCURRENCY:-8}"
SATURATION_REQUEST_COUNT="${SATURATION_REQUEST_COUNT:-200}"

KUBECTL=(
  kubectl
  --context "${SERVE_CONTEXT:?set SERVE_CONTEXT}"
  -n "${NAMESPACE}"
)

printf 'Topology: %s\nService: %s\nRun ID: %s\n' \
  "${TOPOLOGY}" "${SERVICE_URL}" "${RUN_ID}"

"${KUBECTL[@]}" exec "${RUNNER}" -- /bin/sh -lc \
  "python -m pip install --no-cache-dir aiperf==0.11.0 >/tmp/aiperf-install.log 2>&1"

# Natural-EOS profile: lower pressure for latency comparison.
"${KUBECTL[@]}" exec "${RUNNER}" -- /bin/sh -lc "
  aiperf profile \
    --model '${MODEL}' \
    --url '${SERVICE_URL}' \
    --endpoint-type chat \
    --streaming \
    --concurrency '${LATENCY_CONCURRENCY}' \
    --request-count '${LATENCY_REQUEST_COUNT}' \
    --isl 256 \
    --osl 128 \
    --tokenizer builtin \
    --use-server-token-count \
    --use-legacy-max-tokens \
    --extra-inputs '{\"chat_template_kwargs\":{\"enable_thinking\":false}}' \
    --connection-reuse-strategy never \
    --no-gpu-telemetry \
    --no-server-metrics \
    --ui-type simple \
    --artifact-dir '${REMOTE_ROOT}/latency-c${LATENCY_CONCURRENCY}-r${LATENCY_REQUEST_COUNT}'
"

# Fixed-output synthetic profile: equal generated-token work for saturation throughput.
"${KUBECTL[@]}" exec "${RUNNER}" -- /bin/sh -lc "
  aiperf profile \
    --model '${MODEL}' \
    --url '${SERVICE_URL}' \
    --endpoint-type chat \
    --streaming \
    --concurrency '${SATURATION_CONCURRENCY}' \
    --request-count '${SATURATION_REQUEST_COUNT}' \
    --isl 256 \
    --osl 128 \
    --tokenizer builtin \
    --use-server-token-count \
    --use-legacy-max-tokens \
    --extra-inputs '{\"chat_template_kwargs\":{\"enable_thinking\":false},\"ignore_eos\":true}' \
    --connection-reuse-strategy never \
    --no-gpu-telemetry \
    --no-server-metrics \
    --ui-type simple \
    --artifact-dir '${REMOTE_ROOT}/saturation-c${SATURATION_CONCURRENCY}-r${SATURATION_REQUEST_COUNT}'
"

mkdir -p "${LOCAL_ROOT}"
"${KUBECTL[@]}" cp "${RUNNER}:${REMOTE_ROOT}" "${LOCAL_ROOT}"

printf 'Artifacts: %s\n' "${LOCAL_ROOT}"
