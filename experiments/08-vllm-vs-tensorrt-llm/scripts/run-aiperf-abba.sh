#!/usr/bin/env bash
set -euo pipefail

KUBE_CONTEXT="${KUBE_CONTEXT:-${SERVE_CONTEXT:-}}"
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT or SERVE_CONTEXT to the intended cluster context}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
NAMESPACE="${NAMESPACE:-${SERVE_NAMESPACE:-model-serving}}"
RUNNER="${RUNNER:-aiperf-runner}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-60}"
WARMUP_REQUESTS="${WARMUP_REQUESTS:-32}"
WARMUP_SETTLE_SECONDS="${WARMUP_SETTLE_SECONDS:-30}"
REQUEST_COUNT="${REQUEST_COUNT:-200}"
CONCURRENCY="${CONCURRENCY:-8}"
ISL="${ISL:-256}"
OSL="${OSL:-128}"
RANDOM_SEED="${RANDOM_SEED:-20260818}"
INSTALL_AIPERF="${INSTALL_AIPERF:-true}"

VLLM_URL="${VLLM_URL:-http://runtime-a-vllm.${NAMESPACE}.svc.cluster.local}"
VLLM_MODEL="${VLLM_MODEL:-qwen36-27b-bf16-vllm-benchmark}"
TRTLLM_URL="${TRTLLM_URL:-http://runtime-b-trtllm.${NAMESPACE}.svc.cluster.local}"
TRTLLM_MODEL="${TRTLLM_MODEL:-qwen3.6-27b-bf16}"

REMOTE_ROOT="/tmp/aiperf-runtime-comparison-${RUN_ID}"
LOCAL_ROOT="${REPO_ROOT}/artifacts/runtime-comparison/${RUN_ID}"
RUN_LOG="${LOCAL_ROOT}/runner.log"
KUBECTL=(kubectl --context "${KUBE_CONTEXT}" -n "${NAMESPACE}")

mkdir -p "${LOCAL_ROOT}"

remote() {
  "${KUBECTL[@]}" exec "${RUNNER}" -- /bin/sh -lc "$1"
}

record() {
  local message="$1"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${message}" | tee -a "${RUN_LOG}"
  remote "printf '%s %s\\n' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" '${message}' >> '${REMOTE_ROOT}/timeline.log'"
}

profile() {
  local runtime="$1"
  local url="$2"
  local model="$3"
  local label="$4"
  local count="$5"

  remote "
    aiperf profile \\
      --model '${model}' \\
      --url '${url}' \\
      --endpoint-type chat \\
      --streaming \\
      --concurrency '${CONCURRENCY}' \\
      --request-count '${count}' \\
      --random-seed '${RANDOM_SEED}' \\
      --isl '${ISL}' \\
      --osl '${OSL}' \\
      --tokenizer builtin \\
      --use-server-token-count \\
      --use-legacy-max-tokens \\
      --extra-inputs '{\"chat_template_kwargs\":{\"enable_thinking\":false},\"ignore_eos\":true}' \\
      --connection-reuse-strategy never \\
      --no-gpu-telemetry \\
      --no-server-metrics \\
      --ui-type simple \\
      --artifact-dir '${REMOTE_ROOT}/${label}'
  " 2>&1 | tee -a "${RUN_LOG}"
  record "${label} ${runtime} complete"
}

warm_and_measure() {
  local runtime="$1"
  local url="$2"
  local model="$3"
  local arm="$4"

  record "${arm} ${runtime} warmup start"
  profile "${runtime}" "${url}" "${model}" "warmup-${arm}" "${WARMUP_REQUESTS}"
  sleep "${WARMUP_SETTLE_SECONDS}"
  record "${arm} ${runtime} measured start"
  profile "${runtime}" "${url}" "${model}" "measured-${arm}" "${REQUEST_COUNT}"
}

if [[ "${INSTALL_AIPERF}" == "true" ]]; then
  remote "python3 -m pip install --no-cache-dir aiperf==0.11.0 >/tmp/aiperf-install.log 2>&1"
fi
remote "mkdir -p '${REMOTE_ROOT}' && : > '${REMOTE_ROOT}/timeline.log'"

record "run ${RUN_ID} preflight random_seed=${RANDOM_SEED}"
remote "python3 -c 'import urllib.request; assert urllib.request.urlopen(\"${VLLM_URL}/health\", timeout=10).status == 200; assert urllib.request.urlopen(\"${TRTLLM_URL}/health\", timeout=10).status == 200; print(\"both runtimes healthy\")'"

warm_and_measure vllm "${VLLM_URL}" "${VLLM_MODEL}" a1-vllm
record "cooldown ${COOLDOWN_SECONDS}s before b1-trtllm"
sleep "${COOLDOWN_SECONDS}"

warm_and_measure trtllm "${TRTLLM_URL}" "${TRTLLM_MODEL}" b1-trtllm
record "cooldown ${COOLDOWN_SECONDS}s before b2-trtllm"
sleep "${COOLDOWN_SECONDS}"

warm_and_measure trtllm "${TRTLLM_URL}" "${TRTLLM_MODEL}" b2-trtllm
record "cooldown ${COOLDOWN_SECONDS}s before a2-vllm"
sleep "${COOLDOWN_SECONDS}"

warm_and_measure vllm "${VLLM_URL}" "${VLLM_MODEL}" a2-vllm
record "run ${RUN_ID} complete"

"${KUBECTL[@]}" cp "${RUNNER}:${REMOTE_ROOT}" "${LOCAL_ROOT}"
printf 'Artifacts: %s\n' "${LOCAL_ROOT}"
