# Security and Portability

Do not commit:

- AWS credentials, access tokens, kubeconfig files, or Grafana passwords
- account-specific secrets or private model credentials
- Terraform state or saved plans
- model weights, LoRA adapters, or checkpoints
- benchmark prompts or outputs containing sensitive data

Use `config/environment.local` for local values. Documentation and manifests
must use variables or explicit placeholders for AWS accounts, cluster contexts,
registries, model storage paths, and prices.
