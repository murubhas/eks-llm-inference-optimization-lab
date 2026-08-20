#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
overlay="${1:-${repo_root}/platform/baseline/overlays/local}"

if [[ ! -f "${overlay}/kustomization.yaml" ]]; then
  echo "local overlay not found: ${overlay}" >&2
  echo "copy platform/baseline/overlays/example to platform/baseline/overlays/local and replace all placeholders" >&2
  exit 2
fi

rendered="$(mktemp)"
trap 'rm -f "${rendered}"' EXIT

kubectl kustomize "${overlay}" > "${rendered}"

if rg -n 'REPLACE_WITH_' "${rendered}"; then
  echo "rendered baseline still contains unresolved placeholders" >&2
  exit 2
fi

cat "${rendered}"
