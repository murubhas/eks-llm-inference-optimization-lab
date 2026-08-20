#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

baseline_render="${TMPDIR:-/tmp}/llm-gpu-vllm-baseline-example.yaml"
runner_render="${TMPDIR:-/tmp}/llm-gpu-aiperf-runner.yaml"
dashboard_render="${TMPDIR:-/tmp}/llm-gpu-inference-dashboard.yaml"

kubectl kustomize platform/baseline/overlays/example > "${baseline_render}"
kubectl kustomize platform/loadgen > "${runner_render}"
kubectl kustomize dashboards > "${dashboard_render}"

rg -q 'name: llm-gpu-vllm-baseline' "${baseline_render}"
rg -q 'replicas: 4' "${baseline_render}"
rg -q 'nvidia.com/gpu: "1"' "${baseline_render}"
rg -q 'kind: ServiceMonitor' "${baseline_render}"
rg -q 'REPLACE_WITH_VLLM_IMAGE' "${baseline_render}"

required_vllm_flags=(
  '--tensor-parallel-size 1'
  '--enable-prefix-caching'
  '--mamba-cache-mode align'
  '--max-num-seqs 1'
  '--kv-cache-dtype fp8_e4m3'
)

for flag in "${required_vllm_flags[@]}"; do
  rg -q -F -- "${flag}" platform/baseline/base/deployment.yaml
done

if rg -n '(LMCache|kv-transfer-config|speculative-config|NIXL|llm-d\.ai)' \
  platform/baseline/base; then
  echo "baseline contains an advanced inference feature" >&2
  exit 1
fi

bash -n platform/baseline/render-local.sh
bash -n platform/loadgen/run-profile.sh

rg -q 'name: aiperf-runner' "${runner_render}"
rg -q 'value: 0.10.0' "${runner_render}"
rg -q -- '--connection-reuse-strategy' platform/loadgen/run-profile.sh
rg -q 'enable_thinking.*false' platform/loadgen/run-profile.sh

if rg -n 'ignore_eos' platform/loadgen/run-profile.sh platform/loadgen/profiles; then
  echo "baseline AIPerf profiles must preserve natural EOS" >&2
  exit 1
fi

profile_command="${TMPDIR:-/tmp}/llm-gpu-aiperf-profile-command.txt"
PROFILE_DIR="${repo_root}/platform/loadgen/profiles" \
ARTIFACT_ROOT="${TMPDIR:-/tmp}" \
AIPERF_BIN=/bin/echo \
AIPERF_URL=http://llm-gpu-vllm-baseline.model-serving.svc \
AIPERF_MODEL=test-model \
  platform/loadgen/run-profile.sh prefix-reuse > "${profile_command}"

rg -q -- '--connection-reuse-strategy never' "${profile_command}"
rg -q -- '--prefix-prompt-pool-size 1' "${profile_command}"
rg -q -- '--prefix-prompt-length 4096' "${profile_command}"
rg -q 'enable_thinking.*false' "${profile_command}"

dashboard="dashboards/llm-gpu-vllm-inference-economics.json"
jq -e '
  .title == "EKS LLM Inference Lab - vLLM GPU and Unit Economics"
  and .uid == "llm-gpu-vllm-inference-economics"
  and any(.templating.list[]; .name == "instance_hourly_usd")
  and any(.templating.list[]; .name == "billed_instance_count")
  and any(.panels[].targets[]?; (.expr // "") | contains("vllm:request_success_total"))
  and any(.panels[].targets[]?; (.expr // "") | contains("vllm:time_to_first_token_seconds_bucket"))
  and any(.panels[].targets[]?; (.expr // "") | contains("DCGM_FI_DEV_GPU_UTIL"))
' "${dashboard}" >/dev/null

if rg -n '(10\.49264|YOUR_|REPLACE_WITH_)' "${dashboard}"; then
  echo "inference dashboard contains an environment-specific name or price" >&2
  exit 1
fi

rg -q 'name: grafana-dashboard-llm-inference-vllm' "${dashboard_render}"
rg -q 'grafana_dashboard: "1"' "${dashboard_render}"
rg -q 'grafana_folder: LLM Inference Lab' "${dashboard_render}"

ruby -e 'require "yaml"; YAML.load_file(ARGV.fetch(0))' \
  platform/loadgen/baseline-prefix-reuse.example.yaml

echo "inference baseline validation passed"
