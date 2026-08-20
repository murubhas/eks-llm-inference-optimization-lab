# EKS LLM Inference Optimization Lab

Reproducible Amazon EKS experiments for GPU-backed LLM inference. The labs
change one system dimension at a time, preserve the test boundary, and report
both throughput and latency so an apparent optimization is not mistaken for a
universal win.

Open the self-contained experiment story:

[Open the rendered HTML presentation](https://murubhas.github.io/eks-llm-inference-optimization-lab/story/inference-optimization-experiments.html)

The HTML file contains its images and can be opened locally without a web
server.

## Experiment Map

| # | Experiment | Question | Reference result |
|---:|---|---|---|
| 1 | [KEDA autoscaling](./experiments/01-keda-autoscaling/README.md) | Can aggregate vLLM queue pressure safely add a pre-provisioned replica? | Proven 3 to 4 replica scale-out; long scale-down protection retained |
| 2 | [Kubernetes Service vs llm-d](./experiments/02-llm-d-routing/README.md) | Does backend-aware request placement improve a fixed fleet? | +12.0% output throughput and materially lower tail TTFT in the tested saturation workload |
| 3 | [Full GPU vs MIG](./experiments/03-full-gpu-vs-mig/README.md) | Do more independent slices improve aggregate capacity? | +10.8% output throughput, with slower token cadence and worse tail latency |
| 4 | [Tensor vs pipeline parallelism](./experiments/04-tensor-vs-pipeline-parallelism/README.md) | How should a model span GPUs across ordinary network links? | TP=2 and PP=2 served near throughput parity; TP=4 exposed a model/kernel compatibility boundary |
| 5 | [Local KV vs LMCache](./experiments/05-lmcache-external-kv/README.md) | Does external KV reuse repay lookup and transfer cost? | Cache activity proven; +5.0% output throughput but worse latency in this workload |
| 6 | [Prefill/decode disaggregation](./experiments/06-prefill-decode-disaggregation/README.md) | Does separating phases improve this four-GPU topology? | Functional path proven; homogeneous workers were faster on the tested non-RDMA fleet |
| 7 | [Standard decode vs MTP](./experiments/07-mtp-speculative-decoding/README.md) | Does model-native speculative decoding accept enough drafts to help? | Near-zero acceptance; baseline decode remained preferable |
| 8 | [vLLM vs TensorRT-LLM](./experiments/08-vllm-vs-tensorrt-llm/README.md) | Does changing the serving runtime improve Qwen3.6 27B on H100? | BF16 served in both; throughput and E2E were effectively similar, while TensorRT-LLM TTFT was worse |

These percentages are observations from the documented hardware and workload,
not product guarantees. Read each result against its own baseline.

## Repository Layout

```text
config/        local environment contract; local values are ignored
platform/      portable vLLM, AIPerf, Prometheus, Grafana, and DCGM examples
experiments/   one directory per controlled experiment
dashboards/    versioned Grafana dashboard JSON
docs/          prerequisites, architecture, methodology, and result index
scripts/       preflight, validation, and AIPerf summary tools
story/         self-contained HTML narrative and its generator
```

## What You Provide

- an EKS cluster and schedulable NVIDIA GPU capacity;
- NVIDIA driver, container toolkit, device plugin, and DCGM Exporter;
- Prometheus Operator, Prometheus, Grafana, and kube-state-metrics;
- shared model storage and an immutable, tested serving image;
- Gateway API Inference Extension and llm-d prerequisites for routing labs;
- KEDA for the autoscaling lab; and
- permission to run and observe the workloads.

The repository intentionally does not contain model weights, container images,
AWS account identifiers, credentials, kubeconfig data, private endpoint names,
or raw prompts and outputs.

## First Run

1. Read [prerequisites](./docs/prerequisites-and-first-run.md).
2. Copy `config/environment.example` to the ignored
   `config/environment.local` and replace every placeholder.
3. Run `make validate`.
4. Establish the [portable vLLM baseline](./platform/baseline/README.md).
5. Confirm application and GPU telemetry before generating load.
6. Run one experiment at a time and preserve its documented control boundary.

## Reproducibility Rules

- Hold model, runtime image, GPU fleet, benchmark inputs, streaming mode, and
  client connection behavior constant unless one is the variable under test.
- Record AIPerf version, request count, concurrency, ISL, OSL, EOS policy, UTC
  start/end time, and successful/error request counts.
- Validate vLLM, router, Prometheus, and DCGM targets before each measured run.
- Use fixed-output synthetic saturation only for controlled generated-token
  work; label it as synthetic.
- Keep KEDA paused or replicas pinned during fixed-capacity comparisons.
- Compare throughput, TTFT, E2E latency, and ITL together.

See [methodology](./docs/methodology.md) and the
[results index](./docs/results-summary.md) for the full contract.

## Safety

GPU workloads can incur substantial cost. Review every manifest, start with a
smoke test, and scale experimental capacity down when finished. Never apply a
manifest containing `YOUR_` placeholders.

This project is experimental sample code and is not an AWS service or support
offering.
