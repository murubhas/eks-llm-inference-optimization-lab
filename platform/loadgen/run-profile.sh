#!/usr/bin/env bash
set -euo pipefail

profile_name="${1:-}"
if [[ -z "${profile_name}" ]]; then
  echo "usage: run-profile.sh <smoke|distribution|prefix-reuse>" >&2
  exit 2
fi

profile_dir="${PROFILE_DIR:-/workshop}"
artifact_root="${ARTIFACT_ROOT:-/artifacts}"
aiperf_bin="${AIPERF_BIN:-/opt/aiperf/bin/aiperf}"
profile_file="${profile_dir}/${profile_name}.env"
if [[ ! -f "${profile_file}" ]]; then
  echo "unknown AIPerf profile: ${profile_name}" >&2
  exit 2
fi

# shellcheck disable=SC1090
source "${profile_file}"

: "${AIPERF_URL:?set AIPERF_URL to the Service or router entry point}"
: "${AIPERF_MODEL:?set AIPERF_MODEL to the served model name}"

if [[ "${AIPERF_MODEL}" == REPLACE_WITH_* ]]; then
  echo "replace AIPERF_MODEL before running a benchmark" >&2
  exit 2
fi

timestamp="$(date -u +%Y%m%d-%H%M%S)"
artifact_dir="${artifact_root}/${profile_name}-${timestamp}"

args=(
  profile
  --model "${AIPERF_MODEL}"
  --url "${AIPERF_URL}"
  --endpoint-type chat
  --streaming
  --connection-reuse-strategy "${CONNECTION_REUSE_STRATEGY:-never}"
  --concurrency "${CONCURRENCY}"
  --request-rate "${REQUEST_RATE}"
  --arrival-pattern constant
  --request-count "${REQUEST_COUNT}"
  --isl "${ISL}"
  --osl "${OSL}"
  --tokenizer builtin
  --use-legacy-max-tokens
  --extra-inputs '{"chat_template_kwargs":{"enable_thinking":false}}'
  --no-gpu-telemetry
  --no-server-metrics
  --ui-type simple
  --artifact-dir "${artifact_dir}"
)

if (( PREFIX_POOL_SIZE > 0 )); then
  args+=(
    --prefix-prompt-pool-size "${PREFIX_POOL_SIZE}"
    --prefix-prompt-length "${PREFIX_LENGTH}"
  )
fi

echo "AIPerf profile: ${profile_name}"
echo "Entry point:    ${AIPERF_URL}"
echo "Model:          ${AIPERF_MODEL}"
echo "Artifacts:      ${artifact_dir}"

exec "${aiperf_bin}" "${args[@]}"
