# Public Repository Safety

This repository is designed to be portable and public.

Do not commit:

- AWS account IDs, credentials, session tokens, or kubeconfig content;
- employee email addresses, private Git hosts, or internal service URLs;
- ECR repositories, S3 buckets, FSx DNS names, or cluster ARNs from a live account;
- Grafana API tokens, passwords, private keys, or Kubernetes Secret values;
- model weights, benchmark prompts containing private data, or raw model output;
- Terraform state, saved plans, or unredacted cluster dumps.

Run `make validate` before every public push. Local values belong in the ignored
`config/environment.local` file.
