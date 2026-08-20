#!/usr/bin/env bash
set -euo pipefail

KUBE_CONTEXT="${KUBE_CONTEXT:-${SERVE_CONTEXT:-}}"
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT or SERVE_CONTEXT to the intended cluster context}"

NAMESPACE="${NAMESPACE:-${SERVE_NAMESPACE:-model-serving}}"
RUNNER="${RUNNER:-aiperf-runner}"
VLLM_DEPLOYMENT="${VLLM_DEPLOYMENT:-runtime-a-vllm}"
TRTLLM_DEPLOYMENT="${TRTLLM_DEPLOYMENT:-runtime-b-trtllm}"
VLLM_URL="${VLLM_URL:-http://runtime-a-vllm.${NAMESPACE}.svc.cluster.local}"
TRTLLM_URL="${TRTLLM_URL:-http://runtime-b-trtllm.${NAMESPACE}.svc.cluster.local}"
VLLM_MODEL="${VLLM_MODEL:-qwen36-27b-bf16-vllm-benchmark}"
TRTLLM_MODEL="${TRTLLM_MODEL:-qwen3.6-27b-bf16}"

KUBECTL=(kubectl --context "${KUBE_CONTEXT}" -n "${NAMESPACE}")

"${KUBECTL[@]}" rollout status "deployment/${VLLM_DEPLOYMENT}" --timeout=120m
"${KUBECTL[@]}" rollout status "deployment/${TRTLLM_DEPLOYMENT}" --timeout=120m

pods="$("${KUBECTL[@]}" get pods -l experiment=runtime-comparison -o name)"
pod_count="$(printf '%s\n' "${pods}" | sed '/^$/d' | wc -l | tr -d ' ')"
if [[ "${pod_count}" != "2" ]]; then
  printf 'Expected exactly 2 runtime pods; found %s\n%s\n' "${pod_count}" "${pods}" >&2
  exit 1
fi

nodes="$("${KUBECTL[@]}" get pods -l experiment=runtime-comparison -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}')"
node_count="$(printf '%s\n' "${nodes}" | sed '/^$/d' | sort -u | wc -l | tr -d ' ')"
if [[ "${node_count}" != "1" ]]; then
  printf 'Runtime pods are not colocated on one node:\n%s\n' "${nodes}" >&2
  exit 1
fi

for service in runtime-a-vllm runtime-b-trtllm; do
  addresses="$("${KUBECTL[@]}" get endpoints "${service}" -o jsonpath='{.subsets[*].addresses[*].ip}')"
  if [[ -z "${addresses}" ]]; then
    printf 'Service %s has no ready endpoint.\n' "${service}" >&2
    exit 1
  fi
done

PYTHON_PROBE="$(cat <<'PY'
import json
import os
import urllib.request

base = os.environ["BASE_URL"].rstrip("/")
model = os.environ["MODEL_ID"]
metrics_path = os.environ["METRICS_PATH"]

for path in ("/health", "/v1/models", metrics_path):
    with urllib.request.urlopen(base + path, timeout=30) as response:
        if response.status != 200:
            raise SystemExit(f"{base}{path} returned {response.status}")

payload = {
    "model": model,
    "messages": [{"role": "user", "content": "Reply with one word: blue"}],
    "max_tokens": 16,
    "stream": False,
    "chat_template_kwargs": {"enable_thinking": False},
}
request = urllib.request.Request(
    base + "/v1/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(request, timeout=120) as response:
    result = json.load(response)
text = result["choices"][0]["message"]["content"]
if not text:
    raise SystemExit(f"{base} returned an empty completion")
print(json.dumps({"url": base, "model": model, "completion": text[:80]}))
PY
)"

probe_runtime() {
  local name="$1"
  local url="$2"
  local model="$3"
  local metrics_path="$4"
  printf 'Probing %s at %s\n' "${name}" "${url}"
  "${KUBECTL[@]}" exec "${RUNNER}" -- \
    env BASE_URL="${url}" MODEL_ID="${model}" METRICS_PATH="${metrics_path}" \
    python3 -c "${PYTHON_PROBE}"
}

probe_runtime vLLM "${VLLM_URL}" "${VLLM_MODEL}" /metrics
probe_runtime TensorRT-LLM "${TRTLLM_URL}" "${TRTLLM_MODEL}" /prometheus/metrics

"${KUBECTL[@]}" get pods -l experiment=runtime-comparison \
  -o custom-columns='POD:.metadata.name,NODE:.spec.nodeName,GPU:.spec.containers[0].resources.requests.nvidia\.com/gpu,READY:.status.containerStatuses[0].ready,RESTARTS:.status.containerStatuses[0].restartCount'

echo "Runtime comparison smoke gate passed."
