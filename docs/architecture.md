# Repository Architecture

The repository separates a reusable serving platform from controlled
optimization experiments.

```text
config/        ignored local environment contract and safe examples
platform/      baseline vLLM, AIPerf, Prometheus, Grafana, and DCGM examples
experiments/   one bounded experiment per numbered directory
dashboards/    versioned Grafana dashboard and sidecar ConfigMap generator
docs/          prerequisites, methodology, results, and publication rules
scripts/       read-only preflight, static validation, and result summaries
story/         self-contained HTML narrative and its generator
```

## Layering

```text
AIPerf
  -> Kubernetes Service or llm-d entry point
    -> one or more ready model endpoints
      -> vLLM execution topology
        -> physical or partitioned GPUs

vLLM + llm-d + Kubernetes + DCGM
  -> Prometheus
    -> Grafana
```

Routing chooses among ready API endpoints. TP and PP partition execution behind
one endpoint. MIG changes the GPU resources exposed to Kubernetes. KEDA changes
replica count. These are separate control planes and are varied independently
unless an experiment explicitly says otherwise.

## Module Contract

Every experiment should include:

1. the question and variable under test;
2. fixed controls and workload shape;
3. parameterized, sanitized configuration;
4. a smoke gate before the measured run;
5. application and GPU observability checks;
6. throughput and latency results read together;
7. an explicit evidence boundary and cleanup path.

Files are copied into this repository and use relative links. There are no
symlinks back to a private source tree.
