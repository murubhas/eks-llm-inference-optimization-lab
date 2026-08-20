#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-model-serving}"
RUNNER="${RUNNER:-aiperf-runner}"
ROUTER_URL="${ROUTER_URL:-http://llm-d-router-qwen-vllm024-epp.model-serving.svc.cluster.local}"
MODEL="${MODEL:-qwen36-27b-all1000-fp8-g7e-benchmark}"
TOPOLOGY="${1:?usage: $0 <full-gpu|mig-2g-48gb>}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
ARTIFACT_ROOT="/tmp/aiperf-g7e-${TOPOLOGY}-${RUN_ID}"
LATENCY_CONCURRENCY="${LATENCY_CONCURRENCY:-2}"
LATENCY_REQUEST_COUNT="${LATENCY_REQUEST_COUNT:-50}"
SATURATION_CONCURRENCY="${SATURATION_CONCURRENCY:-8}"
SATURATION_REQUEST_COUNT="${SATURATION_REQUEST_COUNT:-200}"
LATENCY_ARTIFACT="latency-c${LATENCY_CONCURRENCY}-r${LATENCY_REQUEST_COUNT}"
SATURATION_ARTIFACT="saturation-c${SATURATION_CONCURRENCY}-r${SATURATION_REQUEST_COUNT}"

KUBECTL=(
  kubectl
  --context "${SERVE_CONTEXT:?set SERVE_CONTEXT}"
  -n "${NAMESPACE}"
)

"${KUBECTL[@]}" exec "${RUNNER}" -- /bin/sh -lc \
  "python -m pip install --no-cache-dir aiperf==0.11.0 >/tmp/aiperf-install.log 2>&1"

# Low-pressure profile: compare latency without a large queue.
"${KUBECTL[@]}" exec "${RUNNER}" -- /bin/sh -lc "
  aiperf profile \
    --model '${MODEL}' \
    --url '${ROUTER_URL}' \
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
    --artifact-dir '${ARTIFACT_ROOT}/${LATENCY_ARTIFACT}'
"

# Synthetic saturation profile: force equal output-token work for throughput.
"${KUBECTL[@]}" exec "${RUNNER}" -- /bin/sh -lc "
  aiperf profile \
    --model '${MODEL}' \
    --url '${ROUTER_URL}' \
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
    --artifact-dir '${ARTIFACT_ROOT}/${SATURATION_ARTIFACT}'
"

mkdir -p "artifacts/llm-d/g7e-full-vs-mig/${TOPOLOGY}-${RUN_ID}"
"${KUBECTL[@]}" cp \
  "${RUNNER}:${ARTIFACT_ROOT}" \
  "artifacts/llm-d/g7e-full-vs-mig/${TOPOLOGY}-${RUN_ID}"

printf 'Artifacts: %s\n' \
  "artifacts/llm-d/g7e-full-vs-mig/${TOPOLOGY}-${RUN_ID}"
