#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

forbidden_regex='([0-9]{12}\.dkr\.ecr\.|arn:aws:[^[:space:]]+:[0-9]{12}|@[Aa][Mm][Aa][Zz][Oo][Nn]\.com|/Users/[^/[:space:]]+|people\.aws\.dev|BEGIN (RSA |OPENSSH )?PRIVATE KEY)'

if rg -n --hidden --glob '!**/.git/**' --glob '!scripts/validate-public-repo.sh' "${forbidden_regex}" .; then
  echo "Public-identity or secret-like material detected." >&2
  exit 1
fi

if find . -type f \( -name '*.tfstate' -o -name '*.tfplan' -o -name '*.pem' -o -name 'environment.local' \) | grep -q .; then
  echo "Private or stateful files detected." >&2
  exit 1
fi

python3 -m py_compile scripts/summarize_aiperf.py scripts/check_markdown_links.py
python3 scripts/check_markdown_links.py

for script in $(find . -type f -name '*.sh' | sort); do
  bash -n "${script}"
done

python3 -m json.tool dashboards/llm-gpu-vllm-inference-economics.json >/dev/null

for manifest in $(find . -type f \( -name '*.yaml' -o -name '*.yml' \) | sort); do
  ruby -e 'require "yaml"; YAML.load_stream(File.read(ARGV.fetch(0)))' "${manifest}"
done

if command -v kubectl >/dev/null 2>&1; then
  kubectl kustomize platform/baseline/base >/dev/null
  kubectl kustomize platform/loadgen >/dev/null
  kubectl kustomize dashboards >/dev/null
  ./scripts/validate-inference-baseline.sh >/dev/null
fi

node story/build_inference_experiment_story.mjs >/dev/null

echo "Public repository validation passed."
