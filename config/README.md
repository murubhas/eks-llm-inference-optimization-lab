# Configuration

This directory defines portable environment inputs. It must never contain live
credentials, kubeconfig content, passwords, private keys, or Terraform state.

## Setup

```bash
cp config/environment.example config/environment.local
source config/environment.local
```

`environment.local` is ignored by Git. Replace every placeholder before running
cluster commands.

## Variable Groups

| Group | Examples |
| --- | --- |
| AWS session | `AWS_PROFILE`, `AWS_REGION` |
| Kubernetes | `SERVE_CONTEXT`, serving and observability namespaces |
| Image and compute | `ECR_REGISTRY`, `VLLM_IMAGE`, `GPU_INSTANCE_TYPE`, `GPU_WORKLOAD_LABEL` |
| Model | `MODEL_ID`, `MODEL_STORAGE_PATH`, `MODEL_PVC`, `MODEL_SERVICE_ACCOUNT` |
| Benchmark | `AIPERF_URL` |
| Repository | `LAB_ROOT` |
| Economics | `GPU_INSTANCE_HOURLY_USD` |

## Portability Rules

- configuration examples use placeholders, never a real 12-digit account ID
- manifests consume values through Helm, Kustomize, Terraform, or documented
  environment substitution
- model paths and ECR references remain environment-specific
- prices are inputs, not durable constants
- a command should fail clearly when a required variable is missing

Before sharing an environment file, assume it is sensitive even when it contains
only cluster names and account metadata.

## Optional Private-Identifier Guard

Copy `private-identifiers.example` to `private-identifiers.local` and place one
literal private identifier per line. Useful entries include an AWS account ID,
GitHub username, absolute home-directory prefix, and private AWS profile prefix.

`private-identifiers.local` is ignored by Git. When present, `make validate`
scans tracked content for every listed value and fails if one is found.
