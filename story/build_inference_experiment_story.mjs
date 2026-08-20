import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const outputPath = path.join(here, "inference-optimization-experiments.html");

const imagePaths = {
  keda: path.join(
    repoRoot,
    "experiments/01-keda-autoscaling/assets/keda-queue-scaleout.png",
  ),
  routing: path.join(
    repoRoot,
    "experiments/02-llm-d-routing/assets/kubernetes-service-vs-llm-d-routing.png",
  ),
  mig: path.join(
    repoRoot,
    "experiments/03-full-gpu-vs-mig/assets/g7e-full-gpu-vs-mig-architecture.png",
  ),
  lmcache: path.join(
    repoRoot,
    "experiments/05-lmcache-external-kv/assets/local-kv-cache-vs-lmcache.png",
  ),
  pd: path.join(
    repoRoot,
    "experiments/06-prefill-decode-disaggregation/assets/homogeneous-vs-pd-disaggregation.png",
  ),
  mtp: path.join(
    repoRoot,
    "experiments/07-mtp-speculative-decoding/assets/standard-decode-vs-mtp.png",
  ),
  parallelism: path.join(
    repoRoot,
    "experiments/04-tensor-vs-pipeline-parallelism/assets/qwen36-g7-inter-node-parallelism.png",
  ),
  runtime: path.join(
    repoRoot,
    "experiments/08-vllm-vs-tensorrt-llm/assets/vllm-vs-tensorrt-llm-h100.png",
  ),
};

function imageDataUri(filePath) {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const experimentDefinitions = [
  {
    id: "keda",
    nav: "KEDA",
    eyebrow: "Capacity elasticity",
    title: "Queue pressure vs KEDA scale-out",
    question: "Can queue pressure safely add a ready replica on pre-provisioned GPU capacity?",
    image: imageDataUri(imagePaths.keda),
    alt: "Architecture and measured evidence for KEDA scaling a vLLM deployment from three ready replicas to four on pre-provisioned GPU capacity.",
    verdict: "Elasticity proven",
    verdictTone: "good",
    setup: [
      "4 x g6e.2xlarge GPU nodes",
      "3 ready replicas + 1 pre-provisioned spare GPU",
      "KEDA Value target 1",
      "AIPerf c=8, n=200",
    ],
    metrics: [
      {
        label: "Ready replicas",
        value: "3 → 4",
        detail: "Service endpoints followed readiness",
        tone: "good",
      },
      {
        label: "Queue peak",
        value: "7",
        detail: "aggregate waiting requests",
        tone: "info",
      },
      {
        label: "Model cold start",
        value: "500 s",
        detail: "8.3 min from create to Ready",
        tone: "bad",
      },
      {
        label: "Validation",
        value: "4 / 4",
        detail: "GPUs active; 50/50 requests succeeded",
        tone: "good",
      },
    ],
    takeaway:
      "KEDA converted aggregate queue pressure into a fourth ready replica. The spare GPU removed node provisioning, but model loading still took 8.3 minutes.",
    explanation:
      "Prometheus summed independent vLLM waiting queues. KEDA exposed that Value metric to the HPA, which changed desired replicas from three to four. Kubernetes scheduled the new pod on the existing spare GPU and withheld it from the Service until readiness passed.",
    boundary:
      "This experiment intentionally isolated pod elasticity on pre-provisioned GPU capacity. Node scaling was validated separately and was not measured here; production capacity could be supplied by Cluster Autoscaler with an EKS Managed Node Group or by Karpenter. Without the spare GPU, the fourth pod would remain Pending through node launch and GPU initialization before the 8.3-minute model-loading path begins. The scale-out and validation loads used different concurrency, so their latency values are not an A/B performance delta.",
    notes: [
      "Value was deliberate; AverageValue would dilute aggregate pressure across replicas.",
      "The summed waiting metric is not a shared queue. Each vLLM pod retained its own queue.",
      "A pre-provisioned GPU avoids infrastructure launch delay, not model loading, graph capture, or readiness time.",
      "An EKS Managed Node Group supplies managed capacity but needs Cluster Autoscaler or an explicit desired-capacity change to scale; Karpenter is a separate dynamic provisioning path.",
      "Scale-down was intentionally slow: 2,400-second cooldown and stabilization, then at most one pod per 300 seconds.",
    ],
    tableHeaders: ["Signal", "Start", "Observed", "Meaning"],
    tableRows: [
      ["Ready replicas", "3", "4", "HPA desired size reached"],
      ["Allocatable GPUs", "4 (1 spare)", "4 (0 spare)", "Existing capacity consumed"],
      ["Aggregate waiting", "0", "Peak 7", "Value target 1 exceeded"],
      ["Scale decision", "Inactive", "New size 4", "SuccessfulRescale emitted"],
      ["Cold start", "--", "500 s", "Pod create to Ready"],
      ["Service endpoints", "3", "4", "Readiness gated traffic"],
      ["Validation requests", "--", "50 / 50", "0 API errors"],
      ["Active GPUs", "3", "4", "All reached 100% maximum"],
    ],
  },
  {
    id: "routing",
    nav: "Routing",
    eyebrow: "Placement",
    title: "Kubernetes Service vs llm-d routing",
    question: "Can backend-aware placement improve a fixed four-GPU fleet?",
    image: imageDataUri(imagePaths.routing),
    alt: "Architecture and benchmark comparison of Kubernetes Service routing and llm-d EPP routing on Amazon EKS.",
    verdict: "Measured win",
    verdictTone: "good",
    setup: [
      "Qwen3.6 27B FP8",
      "4 x g6e.2xlarge",
      "4 replicas, TP=1",
      "A/B/B/A, 25 minutes each",
    ],
    metrics: [
      {
        label: "Output throughput",
        value: "+12.0%",
        detail: "71.77 to 80.41 tok/s",
        tone: "good",
      },
      {
        label: "p95 TTFT",
        value: "-50.5%",
        detail: "30.014 to 14.866 s",
        tone: "good",
      },
      {
        label: "p99 TTFT",
        value: "-64.7%",
        detail: "50.945 to 17.991 s",
        tone: "good",
      },
      {
        label: "Average ITL",
        value: "-0.1%",
        detail: "49.39 to 49.35 ms",
        tone: "neutral",
      },
    ],
    takeaway:
      "llm-d improved throughput and tail latency by steering new requests with backend state. Per-token decode cadence stayed unchanged.",
    explanation:
      "The Kubernetes Service balanced connections across ready endpoints. llm-d used queue pressure, KV-cache utilization, prefix affinity, and an LRU fallback to choose a backend for each new request. EPP selected the endpoint; Envoy carried the request payload directly to that vLLM pod.",
    boundary:
      "This was controlled synthetic saturation: concurrency 12, max-num-seqs=1, fixed output work, connection reuse disabled, and two runs per path. It is evidence for this workload, not a universal llm-d percentage.",
    notes: [
      "EPP and InferencePool are not extra payload hops. EPP returns a selected pod address to Envoy.",
      "Scorer weights were queue 2, KV-cache utilization 2, prefix cache 3, and no-hit LRU 2.",
      "ITL staying flat is useful evidence: routing changed placement and waiting time, not the GPU's decode speed.",
    ],
    tableHeaders: ["Metric", "Kubernetes Service", "llm-d EPP", "Change"],
    tableRows: [
      ["Output throughput", "71.77 tok/s", "80.41 tok/s", "+12.0%"],
      ["Request throughput", "0.595 req/s", "0.670 req/s", "+12.6%"],
      ["Average E2E", "19.943 s", "17.884 s", "-10.3%"],
      ["p95 E2E", "35.902 s", "20.756 s", "-42.2%"],
      ["Average TTFT", "14.054 s", "11.994 s", "-14.7%"],
      ["p95 TTFT", "30.014 s", "14.866 s", "-50.5%"],
      ["p99 TTFT", "50.945 s", "17.991 s", "-64.7%"],
      ["Average ITL", "49.39 ms", "49.35 ms", "-0.1%"],
    ],
  },
  {
    id: "mig",
    nav: "MIG",
    eyebrow: "Partitioning",
    title: "Full GPU vs MIG",
    question: "Does exposing more independent replicas improve fleet throughput?",
    image: imageDataUri(imagePaths.mig),
    alt: "Architecture and benchmark comparison of two full RTX PRO 6000 Blackwell GPUs and four MIG slices on Amazon EKS.",
    verdict: "Throughput tradeoff",
    verdictTone: "mixed",
    setup: [
      "Same 2 x g7e.2xlarge",
      "2 full GPUs vs 4 MIG slices",
      "TP=1, max-num-seqs=1",
      "200 fixed-output requests",
    ],
    metrics: [
      {
        label: "Output throughput",
        value: "+10.8%",
        detail: "88.15 to 97.63 tok/s",
        tone: "good",
      },
      {
        label: "Average TTFT",
        value: "-39.3%",
        detail: "8.590 to 5.218 s",
        tone: "good",
      },
      {
        label: "Average ITL",
        value: "+81.4%",
        detail: "22.35 to 40.56 ms",
        tone: "bad",
      },
      {
        label: "p99 E2E",
        value: "+43.2%",
        detail: "14.519 to 20.797 s",
        tone: "bad",
      },
    ],
    takeaway:
      "MIG increased aggregate throughput by exposing more independent replicas. Full GPUs delivered faster token cadence and better tail latency.",
    explanation:
      "The physical fleet and cost stayed fixed. MIG changed two full-GPU workers into four smaller workers, doubling independent admission slots. That helped aggregate throughput at concurrency 8, while each partition had fewer resources for an individual decode stream.",
    boundary:
      "This is a curiosity-driven topology comparison, not a per-replica GPU benchmark. Replica count changed intentionally. One controlled run per topology is directional, not a universal MIG result.",
    notes: [
      "Independent request slot means each vLLM replica could admit one active sequence because max-num-seqs was 1.",
      "MIG did not make one request faster. It exposed more parallel workers on the same two physical GPUs.",
      "Average and median TTFT improved, but p99 TTFT, p99 E2E, ITL, and time to second token worsened.",
    ],
    tableHeaders: ["Metric", "2 full GPUs", "4 MIG slices", "MIG vs full"],
    tableRows: [
      ["Benchmark duration", "290.41 s", "262.22 s", "-9.7%"],
      ["Output throughput", "88.15 tok/s", "97.63 tok/s", "+10.8%"],
      ["Average TTFT", "8.590 s", "5.218 s", "-39.3%"],
      ["p99 TTFT", "11.665 s", "15.648 s", "+34.1%"],
      ["Average E2E", "11.429 s", "10.369 s", "-9.3%"],
      ["p99 E2E", "14.519 s", "20.797 s", "+43.2%"],
      ["Average ITL", "22.35 ms", "40.56 ms", "+81.4%"],
      ["Time to second token", "22.51 ms", "40.78 ms", "+81.2%"],
    ],
  },
  {
    id: "lmcache",
    nav: "LMCache",
    eyebrow: "State placement",
    title: "Local KV cache vs external LMCache",
    question: "Can node-local CPU cache reuse offset its transfer overhead?",
    image: imageDataUri(imagePaths.lmcache),
    alt: "Architecture and benchmark comparison of vLLM local KV cache and node-local LMCache MP on Amazon EKS.",
    verdict: "Cache hit, latency cost",
    verdictTone: "mixed",
    setup: [
      "1 x g6e.12xlarge",
      "4 replicas, TP=1",
      "Shared 4,096-token prefix",
      "100 requests, concurrency 8",
    ],
    metrics: [
      {
        label: "Output throughput",
        value: "+5.0%",
        detail: "61.70 to 64.80 tok/s",
        tone: "good",
      },
      {
        label: "Average TTFT",
        value: "+19.5%",
        detail: "1.980 to 2.367 s",
        tone: "bad",
      },
      {
        label: "Average E2E",
        value: "+10.0%",
        detail: "5.112 to 5.624 s",
        tone: "bad",
      },
      {
        label: "Lookup hits",
        value: "298,597",
        detail: "of about 298,599 requested tokens",
        tone: "info",
      },
    ],
    takeaway:
      "LMCache proved cross-worker prefix reuse and slightly increased throughput, but lookup and transfer overhead outweighed the avoided prefill work for this workload.",
    explanation:
      "Every worker kept its normal L0 GPU KV cache. LMCache added one node-local L1 service in CPU memory, reached through CUDA IPC and shared memory. No remote L2 cache was used. Cache reuse was real; latency still rose.",
    boundary:
      "This was one run per topology and EOS was respected, so the runs produced different output-token totals. Do not claim a fixed VRAM saving from these data; DCGM cannot separate weights from KV allocation.",
    notes: [
      "The LMCache MP service was CPU-only and node-local. vLLM workers and the service shared host IPC and /dev/shm.",
      "A normal ClusterIP service with isolated pod shared memory was not sufficient for this transfer path.",
      "The stronger use cases are long repeated context, shared RAG prefixes, multi-turn sessions, and replica churn.",
    ],
    tableHeaders: ["Metric", "Local KV only", "With LMCache", "Change"],
    tableRows: [
      ["Request throughput", "0.915 req/s", "0.932 req/s", "+1.9%"],
      ["Output throughput", "61.70 tok/s", "64.80 tok/s", "+5.0%"],
      ["Average E2E", "5.112 s", "5.624 s", "10.0% slower"],
      ["p99 E2E", "11.582 s", "12.154 s", "4.9% slower"],
      ["Average TTFT", "1.980 s", "2.367 s", "19.5% slower"],
      ["p99 TTFT", "6.151 s", "6.526 s", "6.1% slower"],
      ["Average ITL", "46.93 ms", "47.68 ms", "1.6% slower"],
      ["Duration", "109.28 s", "107.29 s", "1.8% shorter"],
    ],
  },
  {
    id: "pd",
    nav: "P/D",
    eyebrow: "Phase separation",
    title: "Homogeneous serving vs P/D disaggregation",
    question: "Does separating prefill and decode help on one four-GPU node?",
    image: imageDataUri(imagePaths.pd),
    alt: "Architecture and benchmark comparison of homogeneous vLLM workers and prefill decode disaggregation using llm-d and NIXL.",
    verdict: "Topology proven",
    verdictTone: "bad",
    setup: [
      "Same 1 x g6e.12xlarge",
      "4 homogeneous vs 2P/2D",
      "NIXL over intra-node PCIe",
      "ISL 4,096, concurrency 8",
    ],
    metrics: [
      {
        label: "Output throughput",
        value: "-40.5%",
        detail: "58.78 to 34.99 tok/s",
        tone: "bad",
      },
      {
        label: "Average TTFT",
        value: "+281.8%",
        detail: "3.204 to 12.231 s",
        tone: "bad",
      },
      {
        label: "Average E2E",
        value: "+149.9%",
        detail: "6.285 to 15.710 s",
        tone: "bad",
      },
      {
        label: "GPU activity",
        value: "4 / 4",
        detail: "all reached 100% maximum",
        tone: "neutral",
      },
    ],
    takeaway:
      "The P/D control path, NIXL state transfer, and observability all worked. This 2P:2D, single-node PCIe topology was slower than four homogeneous workers.",
    explanation:
      "EPP selected both a prefill and decode endpoint. A CPU routing sidecar in the selected decode pod sent the prompt to remote prefill, then forwarded transfer metadata to its co-located decoder. KV and Qwen hybrid SSM state moved directly through NIXL, not through EPP or the sidecar.",
    boundary:
      "This used one g6e.12xlarge, intra-node PCIe, a simple 2P:2D ratio, EOS-respecting output, and one run per topology. It did not test multi-node EFA/RDMA or a tuned production ratio.",
    notes: [
      "The selected decode pod's sidecar coordinates one remote prefill and its local decoder; it does not choose a second decoder.",
      "Model weights remain resident in every model-server pod. Only request-specific KV and SSM state move.",
      "Busy GPUs do not prove an efficient pipeline. Read utilization together with throughput, TTFT, and role-specific pressure.",
    ],
    tableHeaders: ["Metric", "Homogeneous", "P/D 2P:2D", "P/D change"],
    tableRows: [
      ["Request throughput", "0.90 req/s", "0.47 req/s", "-47.8%"],
      ["Output throughput", "58.78 tok/s", "34.99 tok/s", "-40.5%"],
      ["Average TTFT", "3.204 s", "12.231 s", "281.8% slower"],
      ["p99 TTFT", "7.597 s", "22.770 s", "199.7% slower"],
      ["Average E2E", "6.285 s", "15.710 s", "149.9% slower"],
      ["p99 E2E", "13.509 s", "28.706 s", "112.5% slower"],
      ["Benchmark duration", "223.12 s", "423.22 s", "89.7% longer"],
      ["API errors", "0", "0", "Equal"],
    ],
  },
  {
    id: "mtp",
    nav: "MTP",
    eyebrow: "Decode strategy",
    title: "Standard decode vs native MTP",
    question: "Does one speculative token advance generation often enough to pay?",
    image: imageDataUri(imagePaths.mtp),
    alt: "Architecture and benchmark comparison of standard autoregressive decode and native MTP speculative decode on Amazon EKS.",
    verdict: "Poor workload fit",
    verdictTone: "bad",
    setup: [
      "Same llm-d four-replica fleet",
      "Native MTP, depth 1",
      "No external draft model",
      "100 requests, concurrency 8",
    ],
    metrics: [
      {
        label: "Acceptance rate",
        value: "0.14%",
        detail: "12 of 8,691 drafts accepted",
        tone: "bad",
      },
      {
        label: "Output throughput",
        value: "-14.6%",
        detail: "61.70 to 52.71 tok/s",
        tone: "bad",
      },
      {
        label: "Average TTFT",
        value: "+214.7%",
        detail: "1.980 to 6.231 s",
        tone: "bad",
      },
      {
        label: "Average ITL",
        value: "+18.5%",
        detail: "46.93 to 55.63 ms",
        tone: "bad",
      },
    ],
    takeaway:
      "MTP was active, but almost every draft was rejected. Draft generation and verification added work without advancing decode often enough to recover the cost.",
    explanation:
      "The model's native MTP head drafted one future token and the target model verified it. No separate draft model or extra GPU was used. Only accepted drafts save a decode step; rejected drafts still consume verification work.",
    boundary:
      "EOS was respected, output totals differed, and MTP used a 0.72 GPU-memory budget versus 0.90 for the baseline. Test depth 1 and acceptance first; deeper speculation is not automatically better.",
    notes: [
      "MTP and LMCache were not combined in this experiment, and P/D disaggregation was disabled.",
      "Acceptance rate is the first metric to inspect. At 0.14%, depth 3 or 5 would likely add more rejected work.",
      "This is a workload-fit result, not evidence that native MTP is universally slower.",
    ],
    tableHeaders: ["Metric", "Standard decode", "MTP depth 1", "MTP change"],
    tableRows: [
      ["Request throughput", "0.915 req/s", "0.632 req/s", "-30.9%"],
      ["Output throughput", "61.70 tok/s", "52.71 tok/s", "-14.6%"],
      ["Average E2E", "5.112 s", "10.835 s", "112.0% slower"],
      ["p99 E2E", "11.582 s", "23.414 s", "102.2% slower"],
      ["Average TTFT", "1.980 s", "6.231 s", "214.7% slower"],
      ["p99 TTFT", "6.151 s", "19.131 s", "211.0% slower"],
      ["Average ITL", "46.93 ms", "55.63 ms", "18.5% slower"],
      ["Benchmark duration", "109.28 s", "158.16 s", "44.7% longer"],
    ],
  },
  {
    id: "parallelism",
    nav: "TP / PP",
    eyebrow: "Model partitioning",
    title: "Tensor vs pipeline parallelism",
    question: "When the model spans nodes, which partitioning strategy can serve it?",
    image: imageDataUri(imagePaths.parallelism),
    alt: "Architecture and benchmark comparison of TP=2, TP=4, and PP=2 for Qwen3.6 27B FP8 across four g7.2xlarge Spot nodes on Amazon EKS.",
    verdict: "PP path proven",
    verdictTone: "mixed",
    setup: [
      "Same 4 x g7.2xlarge Spot nodes",
      "One 32 GiB GPU per node",
      "TP=2, TP=4, and PP=2",
      "NCCL NET/Socket; no EFA",
    ],
    metrics: [
      {
        label: "PP=2 output throughput",
        value: "+1.31%",
        detail: "46.98 to 47.60 tok/s vs TP=2",
        tone: "neutral",
      },
      {
        label: "PP=2 average TTFT",
        value: "-1.87%",
        detail: "16.44 to 16.13 s vs TP=2",
        tone: "neutral",
      },
      {
        label: "PP=2 p99 E2E",
        value: "+7.60%",
        detail: "38.43 to 41.35 s vs TP=2",
        tone: "bad",
      },
      {
        label: "TP=4 result",
        value: "Not served",
        detail: "FP8 shard width failed alignment",
        tone: "bad",
      },
    ],
    takeaway:
      "PP=2 preserved whole tensor shapes and served with near TP=2 throughput. TP=4 formed its NCCL group but exposed an unsupported FP8 GDN shard shape before the endpoint became ready.",
    explanation:
      "TP split every layer across nodes and paid repeated collectives. PP assigned whole groups of layers to stages and transferred activations at one stage boundary. That preserved the affected tensor geometry and avoided the TP=4 kernel incompatibility.",
    boundary:
      "This was a four-node Spot experiment over ordinary socket networking, not a production interconnect benchmark. TP=4 served no requests, so it has no performance percentage. PP=2 retained max-num-seqs=1 and was not a pipeline-fill capacity sweep.",
    notes: [
      "TP degree is constrained by model tensor geometry and kernel alignment, not only by available GPU count.",
      "The TP=4 group reached four-rank NCCL initialization; failure occurred during FP8 model/kernel initialization, not network setup.",
      "TP=2 and PP=2 each exposed two logical replicas across the same four nodes. PP=2 matched aggregate throughput but had worse p99 E2E and average ITL.",
      "A production inter-node study should use EFA-capable instances and a separate PP concurrency and max-num-seqs sweep.",
    ],
    tableHeaders: ["Metric", "TP=2", "TP=4", "PP=2", "PP=2 vs TP=2"],
    tableRows: [
      ["Successful requests", "200 / 200", "Not served", "200 / 200", "--"],
      ["Output throughput", "46.98 tok/s", "--", "47.60 tok/s", "+1.31%"],
      ["Request throughput", "0.367 req/s", "--", "0.372 req/s", "+1.31%"],
      ["Average TTFT", "16.44 s", "--", "16.13 s", "-1.87%"],
      ["p99 TTFT", "33.78 s", "--", "36.28 s", "+7.41%"],
      ["Average E2E", "21.11 s", "--", "21.20 s", "+0.38%"],
      ["p99 E2E", "38.43 s", "--", "41.35 s", "+7.60%"],
      ["Average ITL", "36.84 ms", "--", "39.90 ms", "+8.31%"],
    ],
  },
  {
    id: "runtime",
    nav: "Runtime",
    eyebrow: "Serving runtime",
    title: "vLLM vs TensorRT-LLM on H100",
    question: "Does changing the serving runtime improve the same BF16 workload?",
    image: imageDataUri(imagePaths.runtime),
    alt: "Architecture, compatibility gate, and benchmark comparison of vLLM and TensorRT-LLM serving Qwen3.6 27B BF16 on dedicated H100 GPUs in the same P5 node.",
    verdict: "Mixed runtime result",
    verdictTone: "mixed",
    setup: [
      "1 Spot p5.48xlarge; 8 H100s total",
      "2 GPUs benchmarked: 1 per runtime",
      "6 H100s intentionally excluded",
      "Same BF16, TP=1; A/B/B/A",
    ],
    metrics: [
      {
        label: "Output throughput",
        value: "+0.38%",
        detail: "344.80 to 346.11 tok/s",
        tone: "neutral",
      },
      {
        label: "TensorRT-LLM mean TTFT",
        value: "+58.70%",
        detail: "160.18 to 254.20 ms, worse",
        tone: "bad",
      },
      {
        label: "TensorRT-LLM mean ITL",
        value: "-4.04%",
        detail: "22.00 to 21.11 ms, better",
        tone: "good",
      },
      {
        label: "TensorRT-LLM mean E2E",
        value: "-0.64%",
        detail: "2953.65 to 2934.69 ms",
        tone: "neutral",
      },
    ],
    takeaway:
      "The runtime swap held throughput and E2E nearly flat. TensorRT-LLM slightly improved token cadence but worsened first-token latency. AutoDeploy graph compilation was unavailable for this Qwen3.6 27B checkpoint in the evaluated release.",
    explanation:
      "Each runtime loaded the same BF16 checkpoint onto its own H100 and exposed a direct Kubernetes Service. AIPerf replayed identical normalized prompts in A/B/B/A order. The runtime implementation changed; the node, model, request work, TP setting, and client behavior stayed fixed.",
    boundary:
      "TensorRT-LLM used its PyTorch backend. AutoDeploy graph compilation was unavailable for this Qwen3.6 27B checkpoint in the evaluated release: Qwen3.6 had no validated dense registry entry, and the related Qwen3.5 27B entry was disabled. The compressed-tensors FP8 checkpoint failed its compatibility gate before readiness. A2 resumed after an approximately 20-minute credential gap; neither pod restarted.",
    notes: [
      "The P5 instance provided eight H100s. Exactly two were part of the benchmark: one for vLLM and one for TensorRT-LLM. The remaining six did not serve benchmark traffic.",
      "BF16 serving success does not erase the FP8 finding. The FP8 failure was a Qwen hybrid scale-layout mismatch, not insufficient H100 capacity.",
      "Throughput and E2E were effectively similar. The useful contrast was slightly faster decode cadence versus materially worse TTFT.",
      "AutoDeploy is a separate graph-export and compilation path. Its compatibility finding is scoped to the evaluated TensorRT-LLM release and this exact checkpoint.",
      "Startup times were diagnostic only because image and filesystem cache state were not swapped or normalized.",
    ],
    tableHeaders: ["Metric", "vLLM", "TensorRT-LLM", "TensorRT-LLM change"],
    tableRows: [
      ["Measured requests", "400 / 400", "400 / 400", "No errors"],
      ["Output throughput", "344.80 tok/s", "346.11 tok/s", "+0.38%"],
      ["Request throughput", "2.694 req/s", "2.704 req/s", "+0.38%"],
      ["Mean TTFT", "160.18 ms", "254.20 ms", "+58.70%, worse"],
      ["p99 TTFT", "241.34 ms", "299.17 ms", "+23.96%, worse"],
      ["Mean time to second token", "29.40 ms", "27.41 ms", "-6.77%, better"],
      ["Mean ITL", "22.00 ms", "21.11 ms", "-4.04%, better"],
      ["Mean E2E", "2953.65 ms", "2934.69 ms", "-0.64%, similar"],
    ],
  },
];

const experimentOrder = [
  "keda",
  "routing",
  "mig",
  "parallelism",
  "lmcache",
  "pd",
  "mtp",
  "runtime",
];

const experiments = experimentOrder.map((id, index) => {
  const experiment = experimentDefinitions.find((candidate) => candidate.id === id);
  if (!experiment) {
    throw new Error(`Missing experiment definition: ${id}`);
  }
  return {
    ...experiment,
    number: String(index + 1).padStart(2, "0"),
  };
});

function renderMetrics(metrics) {
  return metrics
    .map(
      (metric) => `
        <article class="metric metric-${escapeHtml(metric.tone)}">
          <p class="metric-label">${escapeHtml(metric.label)}</p>
          <p class="metric-value">${escapeHtml(metric.value)}</p>
          <p class="metric-detail">${escapeHtml(metric.detail)}</p>
        </article>`,
    )
    .join("");
}

function renderTable(experiment) {
  const headers = experiment.tableHeaders
    .map((header) => `<th scope="col">${escapeHtml(header)}</th>`)
    .join("");
  const rows = experiment.tableRows
    .map(
      (row) => `
        <tr>
          ${row
            .map((cell, index) =>
              index === 0
                ? `<th scope="row">${escapeHtml(cell)}</th>`
                : `<td>${escapeHtml(cell)}</td>`,
            )
            .join("")}
        </tr>`,
    )
    .join("");

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderExperiment(experiment, slideIndex) {
  const setup = experiment.setup
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const notes = experiment.notes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");

  return `
    <section class="story-slide experiment" id="${escapeHtml(experiment.id)}" data-slide="${slideIndex}">
      <div class="section-inner">
        <header class="section-heading">
          <div>
            <p class="eyebrow">${escapeHtml(experiment.number)} / ${escapeHtml(experiment.eyebrow)}</p>
            <h2>${escapeHtml(experiment.title)}</h2>
            <p class="section-question">${escapeHtml(experiment.question)}</p>
          </div>
          <span class="verdict verdict-${escapeHtml(experiment.verdictTone)}">${escapeHtml(experiment.verdict)}</span>
        </header>

        <div class="experiment-layout">
          <figure class="diagram">
            <button class="diagram-button" type="button" data-zoom-asset="${escapeHtml(experiment.id)}" data-zoom-alt="${escapeHtml(experiment.alt)}" aria-label="Open ${escapeHtml(experiment.title)} diagram">
              <img data-asset="${escapeHtml(experiment.id)}" alt="${escapeHtml(experiment.alt)}">
            </button>
            <figcaption>${escapeHtml(experiment.question)}</figcaption>
          </figure>

          <aside class="experiment-summary" aria-label="${escapeHtml(experiment.title)} summary">
            <ul class="setup-list">${setup}</ul>
            <div class="metrics">${renderMetrics(experiment.metrics)}</div>
            <div class="takeaway">
              <p class="takeaway-label">Takeaway</p>
              <p>${escapeHtml(experiment.takeaway)}</p>
            </div>
          </aside>
        </div>

        <div class="reader-details">
          <div class="narrative-grid">
            <article>
              <p class="block-label">What changed</p>
              <p>${escapeHtml(experiment.explanation)}</p>
            </article>
            <article class="boundary">
              <p class="block-label">Experiment boundary</p>
              <p>${escapeHtml(experiment.boundary)}</p>
            </article>
          </div>

          <details>
            <summary>Benchmark details</summary>
            ${renderTable(experiment)}
          </details>

          <details>
            <summary>Presenter notes</summary>
            <ul class="notes-list">${notes}</ul>
          </details>
        </div>

        <div class="speaker-notes" hidden>
          <strong>${escapeHtml(experiment.title)}</strong>
          <p>${escapeHtml(experiment.takeaway)}</p>
          <ul>${notes}</ul>
          <p><strong>Boundary:</strong> ${escapeHtml(experiment.boundary)}</p>
        </div>
      </div>
    </section>`;
}

const navItems = [
  { id: "overview", label: "Overview" },
  { id: "method", label: "Method" },
  ...experiments.map((experiment) => ({
    id: experiment.id,
    label: experiment.nav,
  })),
  { id: "scorecard", label: "Scorecard" },
  { id: "takeaways", label: "Takeaways" },
];

const navMarkup = navItems
  .map(
    (item, index) => `
      <button type="button" data-go="${index}" aria-label="Go to ${escapeHtml(item.label)}">
        <span>${String(index).padStart(2, "0")}</span>
        ${escapeHtml(item.label)}
      </button>`,
  )
  .join("");

const coverThumbnails = experiments
  .map(
    (experiment, index) => `
      <button type="button" class="cover-thumb" data-go="${index + 2}" aria-label="Go to ${escapeHtml(experiment.title)}">
        <img data-asset="${escapeHtml(experiment.id)}" alt="">
        <span>${escapeHtml(experiment.number)} ${escapeHtml(experiment.nav)}</span>
      </button>`,
  )
  .join("");

const experimentMarkup = experiments
  .map((experiment, index) => renderExperiment(experiment, index + 2))
  .join("");

const embeddedAssets = Object.fromEntries(
  experiments.map((experiment) => [experiment.id, experiment.image]),
);

const scorecardRows = [
  [
    "KEDA autoscaling",
    "Capacity elasticity",
    "Ready replicas 3 → 4",
    "500 s model cold start",
    "Elasticity proven",
    "good",
  ],
  [
    "Backend-aware routing",
    "Queue placement",
    "+12.0% output throughput",
    "-50.5% p95 TTFT",
    "Measured win",
    "good",
  ],
  [
    "MIG partitioning",
    "Independent capacity",
    "+10.8% output throughput",
    "+43.2% p99 E2E",
    "Throughput / tail tradeoff",
    "mixed",
  ],
  [
    "Inter-node TP / PP",
    "Model partitioning",
    "PP=2 served near TP=2 throughput",
    "TP=4 kernel incompatibility",
    "Compatibility path proven",
    "mixed",
  ],
  [
    "LMCache MP",
    "Reusable KV state",
    "+5.0% output throughput",
    "+19.5% average TTFT",
    "Cache hit; overhead remained",
    "mixed",
  ],
  [
    "P/D disaggregation",
    "Phase isolation",
    "Topology and transfer proven",
    "-40.5% output throughput",
    "Wrong scale / ratio for a win",
    "bad",
  ],
  [
    "Native MTP",
    "Speculative decode",
    "0.14% acceptance",
    "+214.7% average TTFT",
    "Poor workload fit",
    "bad",
  ],
  [
    "vLLM vs TensorRT-LLM",
    "Serving runtime",
    "Throughput and E2E effectively similar",
    "+58.70% mean TTFT",
    "Mixed runtime result",
    "mixed",
  ],
]
  .map(
    ([name, lever, positive, tradeoff, verdict, tone]) => `
      <tr>
        <th scope="row">${escapeHtml(name)}</th>
        <td>${escapeHtml(lever)}</td>
        <td>${escapeHtml(positive)}</td>
        <td>${escapeHtml(tradeoff)}</td>
        <td><span class="table-verdict verdict-${escapeHtml(tone)}">${escapeHtml(verdict)}</span></td>
      </tr>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>Eight Inference Optimization Experiments on Amazon EKS</title>
  <style>
    :root {
      --bg: #101214;
      --surface: #181b1f;
      --surface-2: #20242a;
      --surface-3: #282d34;
      --text: #f5f7f9;
      --muted: #aeb6c2;
      --quiet: #7f8996;
      --border: #343b44;
      --strong-border: #4a535f;
      --cyan: #20b9cf;
      --amber: #ffb020;
      --green: #48c979;
      --red: #ff5d70;
      --blue: #6aa6ff;
      --white: #ffffff;
      --shadow: 0 18px 46px rgba(0, 0, 0, 0.28);
      --header-h: 62px;
      --content-max: 1480px;
      --radius: 6px;
    }

    body[data-theme="light"] {
      --bg: #f4f5f6;
      --surface: #ffffff;
      --surface-2: #edf0f2;
      --surface-3: #e3e7ea;
      --text: #15181c;
      --muted: #505965;
      --quiet: #737d88;
      --border: #d2d8de;
      --strong-border: #aeb7c1;
      --shadow: 0 16px 38px rgba(25, 34, 43, 0.14);
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      min-width: 320px;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 16px;
      line-height: 1.5;
      letter-spacing: 0;
    }

    button,
    input {
      font: inherit;
      letter-spacing: 0;
    }

    button {
      color: inherit;
    }

    button:focus-visible,
    summary:focus-visible {
      outline: 3px solid var(--cyan);
      outline-offset: 3px;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      height: var(--header-h);
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 0 24px;
      background: color-mix(in srgb, var(--bg) 94%, transparent);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(14px);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      font-weight: 760;
      white-space: nowrap;
    }

    .brand-mark {
      width: 11px;
      height: 28px;
      background: var(--amber);
    }

    .brand span:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    .segmented {
      display: flex;
      height: 36px;
      padding: 3px;
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: var(--radius);
    }

    .segmented button,
    .tool-button {
      min-height: 28px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }

    .segmented button {
      padding: 0 14px;
      font-size: 13px;
      font-weight: 700;
    }

    .segmented button[aria-pressed="true"] {
      background: var(--surface-3);
      color: var(--text);
    }

    .tool-button {
      height: 36px;
      padding: 0 13px;
      border: 1px solid var(--border);
      font-size: 13px;
      font-weight: 700;
    }

    .tool-button:hover,
    .segmented button:hover {
      color: var(--text);
      border-color: var(--strong-border);
    }

    .progress {
      position: fixed;
      z-index: 60;
      top: calc(var(--header-h) - 2px);
      left: 0;
      width: 0;
      height: 2px;
      background: var(--cyan);
      transition: width 180ms ease;
    }

    .chapter-nav {
      position: sticky;
      top: var(--header-h);
      z-index: 40;
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding: 8px 24px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      scrollbar-width: none;
    }

    .chapter-nav::-webkit-scrollbar {
      display: none;
    }

    .chapter-nav button {
      display: flex;
      align-items: center;
      gap: 7px;
      flex: 0 0 auto;
      height: 32px;
      padding: 0 11px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      font-weight: 720;
      cursor: pointer;
    }

    .chapter-nav button span {
      color: var(--quiet);
      font-variant-numeric: tabular-nums;
    }

    .chapter-nav button:hover,
    .chapter-nav button.active {
      border-color: var(--border);
      background: var(--surface);
      color: var(--text);
    }

    main {
      display: block;
    }

    .story-slide {
      scroll-margin-top: 108px;
      border-bottom: 1px solid var(--border);
    }

    .section-inner {
      width: min(calc(100% - 48px), var(--content-max));
      margin: 0 auto;
      padding: 72px 0 84px;
    }

    .cover .section-inner {
      min-height: calc(86vh - var(--header-h));
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-top: 56px;
      padding-bottom: 40px;
    }

    .cover-label,
    .eyebrow,
    .block-label,
    .takeaway-label {
      margin: 0;
      color: var(--amber);
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
    }

    h1,
    h2,
    h3,
    p {
      letter-spacing: 0;
    }

    h1 {
      max-width: 1020px;
      margin: 14px 0 18px;
      font-size: 64px;
      line-height: 1.04;
      font-weight: 820;
    }

    .cover-deck {
      max-width: 840px;
      margin: 0;
      color: var(--muted);
      font-size: 24px;
      line-height: 1.42;
    }

    .cover-rule {
      width: 94px;
      height: 5px;
      margin: 28px 0 30px;
      background: var(--cyan);
    }

    .cover-thumbnails {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 24px;
    }

    .cover-thumb {
      position: relative;
      min-width: 0;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      cursor: pointer;
    }

    .cover-thumb img {
      display: block;
      width: 100%;
      aspect-ratio: 3 / 2;
      object-fit: contain;
      background: #ffffff;
    }

    .cover-thumb span {
      display: block;
      padding: 8px 10px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 760;
      text-align: left;
    }

    .cover-thumb:hover {
      border-color: var(--cyan);
    }

    .method {
      background: var(--surface);
    }

    .method-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      gap: 54px;
      align-items: start;
    }

    .method h2,
    .scorecard h2,
    .takeaways h2 {
      max-width: 950px;
      margin: 10px 0 18px;
      font-size: 44px;
      line-height: 1.08;
    }

    .lead {
      max-width: 830px;
      margin: 0;
      color: var(--muted);
      font-size: 21px;
    }

    .principles {
      display: grid;
      gap: 1px;
      margin-top: 34px;
      border: 1px solid var(--border);
      background: var(--border);
    }

    .principle {
      padding: 18px 20px;
      background: var(--bg);
    }

    .principle strong {
      display: block;
      margin-bottom: 4px;
      font-size: 17px;
    }

    .principle p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }

    .experiment-map {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .experiment-map li {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr);
      gap: 14px;
      align-items: center;
      min-height: 70px;
      padding: 10px 14px;
      border-left: 4px solid var(--cyan);
      background: var(--surface-2);
    }

    .experiment-map .map-number {
      color: var(--cyan);
      font-size: 22px;
      font-weight: 820;
      font-variant-numeric: tabular-nums;
    }

    .experiment-map strong {
      display: block;
      font-size: 16px;
    }

    .experiment-map span:last-child {
      color: var(--muted);
      font-size: 13px;
    }

    .section-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 28px;
      margin-bottom: 28px;
    }

    .section-heading h2 {
      margin: 8px 0 6px;
      font-size: 40px;
      line-height: 1.1;
    }

    .section-question {
      margin: 0;
      color: var(--muted);
      font-size: 19px;
    }

    .verdict,
    .table-verdict {
      display: inline-flex;
      align-items: center;
      border: 1px solid currentColor;
      border-radius: 999px;
      font-weight: 800;
      white-space: nowrap;
    }

    .verdict {
      min-height: 34px;
      margin-top: 22px;
      padding: 0 13px;
      font-size: 12px;
      text-transform: uppercase;
    }

    .table-verdict {
      min-height: 26px;
      padding: 0 9px;
      font-size: 11px;
    }

    .verdict-good {
      color: var(--green);
    }

    .verdict-mixed {
      color: var(--amber);
    }

    .verdict-bad {
      color: var(--red);
    }

    .experiment-layout {
      display: grid;
      grid-template-columns: minmax(0, 2.1fr) minmax(330px, 0.9fr);
      gap: 24px;
      align-items: start;
    }

    .diagram {
      min-width: 0;
      margin: 0;
    }

    .diagram-button {
      display: block;
      width: 100%;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: #ffffff;
      cursor: zoom-in;
      box-shadow: var(--shadow);
    }

    .diagram-button img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 3 / 2;
      object-fit: contain;
    }

    figcaption {
      margin-top: 9px;
      color: var(--quiet);
      font-size: 12px;
    }

    .experiment-summary {
      display: grid;
      gap: 14px;
    }

    .setup-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1px;
      margin: 0;
      padding: 1px;
      border: 1px solid var(--border);
      background: var(--border);
      list-style: none;
    }

    .setup-list li {
      min-height: 48px;
      display: flex;
      align-items: center;
      padding: 10px 12px;
      background: var(--surface);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .metric {
      min-height: 122px;
      padding: 14px;
      border: 1px solid var(--border);
      border-top-width: 3px;
      border-radius: var(--radius);
      background: var(--surface);
    }

    .metric-good {
      border-top-color: var(--green);
    }

    .metric-bad {
      border-top-color: var(--red);
    }

    .metric-neutral {
      border-top-color: var(--quiet);
    }

    .metric-info {
      border-top-color: var(--blue);
    }

    .metric-label,
    .metric-detail {
      margin: 0;
      color: var(--muted);
    }

    .metric-label {
      font-size: 11px;
      font-weight: 760;
      text-transform: uppercase;
    }

    .metric-value {
      margin: 5px 0 2px;
      font-size: 28px;
      line-height: 1.04;
      font-weight: 820;
      font-variant-numeric: tabular-nums;
    }

    .metric-detail {
      font-size: 11px;
    }

    .takeaway {
      padding: 16px 18px;
      border-left: 5px solid var(--amber);
      background: var(--surface-2);
    }

    .takeaway p:last-child {
      margin: 6px 0 0;
      font-size: 16px;
      font-weight: 650;
    }

    .reader-details {
      margin-top: 42px;
    }

    .narrative-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1px;
      border: 1px solid var(--border);
      background: var(--border);
    }

    .narrative-grid article {
      min-height: 188px;
      padding: 24px;
      background: var(--surface);
    }

    .narrative-grid article p:last-child {
      margin: 9px 0 0;
      color: var(--muted);
      font-size: 16px;
    }

    .narrative-grid .boundary {
      border-top: 4px solid var(--amber);
    }

    details {
      border-bottom: 1px solid var(--border);
    }

    summary {
      padding: 19px 4px;
      font-weight: 760;
      cursor: pointer;
    }

    .table-wrap {
      overflow-x: auto;
      padding-bottom: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }

    th,
    td {
      padding: 11px 13px;
      border-bottom: 1px solid var(--border);
      text-align: right;
      white-space: nowrap;
    }

    th:first-child,
    td:first-child {
      text-align: left;
    }

    thead th {
      color: var(--muted);
      background: var(--surface-2);
      font-size: 12px;
      text-transform: uppercase;
    }

    tbody th {
      color: var(--text);
      font-size: 13px;
    }

    tbody td {
      color: var(--muted);
      font-size: 13px;
    }

    .notes-list {
      margin: 0 0 20px;
      padding-left: 22px;
      color: var(--muted);
    }

    .notes-list li {
      margin: 8px 0;
    }

    .scorecard {
      background: var(--surface);
    }

    .scorecard .section-inner,
    .takeaways .section-inner {
      padding-top: 76px;
    }

    .scorecard-table {
      margin-top: 34px;
      border: 1px solid var(--border);
    }

    .scorecard-note {
      margin: 18px 0 0;
      padding: 16px 18px;
      border-left: 5px solid var(--amber);
      background: var(--bg);
      color: var(--muted);
      font-size: 14px;
    }

    .takeaway-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 36px;
    }

    .final-point {
      min-height: 180px;
      padding: 24px;
      border-top: 4px solid var(--cyan);
      background: var(--surface);
    }

    .final-point span {
      display: block;
      margin-bottom: 12px;
      color: var(--cyan);
      font-size: 24px;
      font-weight: 820;
    }

    .final-point h3 {
      margin: 0 0 8px;
      font-size: 21px;
    }

    .final-point p {
      margin: 0;
      color: var(--muted);
    }

    .closing-line {
      max-width: 1040px;
      margin: 46px 0 0;
      padding: 24px 0 0;
      border-top: 1px solid var(--border);
      font-size: 27px;
      line-height: 1.3;
      font-weight: 760;
    }

    .present-controls,
    .notes-drawer {
      display: none;
    }

    dialog {
      width: min(96vw, 1840px);
      max-width: none;
      max-height: 96vh;
      padding: 0;
      border: 1px solid var(--strong-border);
      border-radius: var(--radius);
      background: #ffffff;
      box-shadow: var(--shadow);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.86);
    }

    .dialog-close {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 2;
      height: 36px;
      padding: 0 12px;
      border: 1px solid #c6ccd1;
      border-radius: 4px;
      background: #ffffff;
      color: #15181c;
      font-weight: 800;
      cursor: pointer;
    }

    dialog img {
      display: block;
      width: 100%;
      max-height: 94vh;
      object-fit: contain;
    }

    body[data-mode="present"] {
      overflow: hidden;
    }

    body[data-mode="present"] .chapter-nav,
    body[data-mode="present"] #printButton {
      display: none;
    }

    body[data-mode="present"] main {
      height: calc(100vh - var(--header-h));
      overflow: hidden;
    }

    body[data-mode="present"] .story-slide {
      display: none;
      height: calc(100vh - var(--header-h));
      overflow: hidden;
      border: 0;
    }

    body[data-mode="present"] .story-slide.active {
      display: block;
    }

    body[data-mode="present"] .section-inner {
      width: min(calc(100% - 64px), 1720px);
      height: 100%;
      padding: 28px 0 66px;
      overflow: hidden;
    }

    body[data-mode="present"] .cover .section-inner {
      min-height: 0;
      padding-top: 40px;
    }

    body[data-mode="present"] h1 {
      max-width: 1180px;
      margin-top: 10px;
      font-size: 60px;
    }

    body[data-mode="present"] .cover-deck {
      font-size: 21px;
    }

    body[data-mode="present"] .cover-thumbnails {
      margin-top: 16px;
    }

    body[data-mode="present"] .cover-thumb span {
      padding: 5px 8px;
      font-size: 11px;
    }

    body[data-mode="present"] .method .section-inner {
      display: flex;
      align-items: center;
    }

    body[data-mode="present"] .method-grid {
      width: 100%;
      gap: 46px;
    }

    body[data-mode="present"] .method h2,
    body[data-mode="present"] .scorecard h2,
    body[data-mode="present"] .takeaways h2 {
      font-size: 40px;
    }

    body[data-mode="present"] .lead {
      font-size: 18px;
    }

    body[data-mode="present"] .principles {
      margin-top: 24px;
    }

    body[data-mode="present"] .principle {
      padding: 13px 16px;
    }

    body[data-mode="present"] .experiment-map li {
      min-height: 58px;
    }

    body[data-mode="present"] .section-heading {
      align-items: center;
      margin-bottom: 14px;
    }

    body[data-mode="present"] .section-heading h2 {
      margin-top: 4px;
      font-size: 34px;
    }

    body[data-mode="present"] .section-question {
      font-size: 16px;
    }

    body[data-mode="present"] .verdict {
      margin-top: 0;
    }

    body[data-mode="present"] .experiment-layout {
      height: calc(100% - 104px);
      grid-template-columns: minmax(0, 2.25fr) minmax(310px, 0.75fr);
      align-items: center;
    }

    body[data-mode="present"] .diagram-button {
      box-shadow: none;
    }

    body[data-mode="present"] .diagram-button img {
      max-height: calc(100vh - 235px);
    }

    body[data-mode="present"] figcaption,
    body[data-mode="present"] .reader-details {
      display: none;
    }

    body[data-mode="present"] .experiment-summary {
      align-content: center;
      max-height: calc(100vh - 195px);
      overflow: hidden;
    }

    body[data-mode="present"] .setup-list li {
      min-height: 42px;
      font-size: 11px;
    }

    body[data-mode="present"] .metric {
      min-height: 104px;
      padding: 11px;
    }

    body[data-mode="present"] .metric-value {
      font-size: 25px;
    }

    body[data-mode="present"] .takeaway {
      padding: 13px 15px;
    }

    body[data-mode="present"] .takeaway p:last-child {
      font-size: 14px;
    }

    body[data-mode="present"] .scorecard .section-inner,
    body[data-mode="present"] .takeaways .section-inner {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-top: 22px;
    }

    body[data-mode="present"] .scorecard-table {
      margin-top: 20px;
    }

    body[data-mode="present"] .scorecard-table th,
    body[data-mode="present"] .scorecard-table td {
      padding: 9px 11px;
    }

    body[data-mode="present"] .takeaway-grid {
      margin-top: 24px;
    }

    body[data-mode="present"] .final-point {
      min-height: 150px;
      padding: 19px;
    }

    body[data-mode="present"] .closing-line {
      margin-top: 24px;
      font-size: 23px;
    }

    body[data-mode="present"] .present-controls {
      position: fixed;
      z-index: 70;
      right: 22px;
      bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .present-controls button {
      width: 38px;
      height: 34px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--surface);
      color: var(--text);
      font-weight: 820;
      cursor: pointer;
    }

    .slide-count {
      min-width: 72px;
      color: var(--muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    body[data-mode="present"] .notes-drawer.open {
      position: fixed;
      z-index: 80;
      right: 18px;
      bottom: 58px;
      display: block;
      width: min(440px, calc(100vw - 36px));
      max-height: 62vh;
      overflow: auto;
      padding: 18px;
      border: 1px solid var(--strong-border);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
    }

    .notes-drawer h3 {
      margin: 0 0 10px;
      font-size: 16px;
    }

    .notes-drawer-content {
      color: var(--muted);
      font-size: 13px;
    }

    .notes-drawer-content p {
      margin: 8px 0;
    }

    .notes-drawer-content ul {
      padding-left: 19px;
    }

    @media (max-width: 1100px) {
      h1 {
        font-size: 52px;
      }

      .experiment-layout {
        grid-template-columns: 1fr;
      }

      .experiment-summary {
        grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
        align-items: start;
      }

      .takeaway {
        grid-column: 1 / -1;
      }

      body[data-mode="present"] .experiment-layout {
        grid-template-columns: minmax(0, 1.75fr) minmax(300px, 0.85fr);
      }

      body[data-mode="present"] .experiment-summary {
        display: grid;
        grid-template-columns: 1fr;
      }

      body[data-mode="present"] .takeaway {
        grid-column: auto;
      }
    }

    @media (max-width: 820px) {
      .topbar {
        gap: 8px;
        padding: 0 12px;
      }

      .brand span:last-child,
      #fullscreenButton,
      #printButton {
        display: none;
      }

      .tool-button {
        padding: 0 9px;
      }

      .chapter-nav {
        padding-left: 12px;
        padding-right: 12px;
      }

      .section-inner {
        width: min(calc(100% - 28px), var(--content-max));
        padding: 54px 0 64px;
      }

      h1 {
        font-size: 42px;
      }

      .cover-deck {
        font-size: 19px;
      }

      .cover-thumbnails {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .method-grid,
      .narrative-grid,
      .takeaway-grid {
        grid-template-columns: 1fr;
      }

      .method h2,
      .scorecard h2,
      .takeaways h2 {
        font-size: 34px;
      }

      .section-heading {
        display: block;
      }

      .section-heading h2 {
        font-size: 32px;
      }

      .verdict {
        margin-top: 14px;
      }

      .experiment-summary {
        grid-template-columns: 1fr;
      }

      .takeaway {
        grid-column: auto;
      }

      body[data-mode="present"] .section-inner {
        width: calc(100% - 24px);
        padding-top: 16px;
        overflow-y: auto;
      }

      body[data-mode="present"] .cover .section-inner {
        justify-content: flex-start;
        padding-top: 20px;
      }

      body[data-mode="present"] h1 {
        margin-bottom: 14px;
        font-size: 38px;
        line-height: 1.05;
      }

      body[data-mode="present"] .cover-deck {
        font-size: 16px;
      }

      body[data-mode="present"] .cover-rule {
        margin: 18px 0;
      }

      body[data-mode="present"] .cover-thumbnails {
        gap: 8px;
        margin-top: 8px;
      }

      body[data-mode="present"] .experiment-layout {
        display: block;
        height: auto;
      }

      body[data-mode="present"] .diagram-button img {
        max-height: 46vh;
      }

      body[data-mode="present"] .experiment-summary {
        margin-top: 12px;
        max-height: none;
        overflow: visible;
      }

      body[data-mode="present"] .setup-list,
      body[data-mode="present"] .metrics {
        display: none;
      }

      body[data-mode="present"] .scorecard .section-inner {
        justify-content: flex-start;
        overflow-y: auto;
      }

      body[data-mode="present"] .scorecard h2 {
        margin: 6px 0 12px;
        font-size: 32px;
        line-height: 1.05;
      }

      body[data-mode="present"] .scorecard .lead {
        font-size: 14px;
        line-height: 1.4;
      }

      body[data-mode="present"] .scorecard-table {
        margin-top: 14px;
        padding-bottom: 0;
        overflow: visible;
      }

      body[data-mode="present"] .scorecard-table table,
      body[data-mode="present"] .scorecard-table tbody {
        display: block;
      }

      body[data-mode="present"] .scorecard-table thead {
        display: none;
      }

      body[data-mode="present"] .scorecard-table tr {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 4px 10px;
        padding: 8px 10px;
        border: 1px solid var(--border);
        background: var(--surface-2);
      }

      body[data-mode="present"] .scorecard-table tr + tr {
        margin-top: 6px;
      }

      body[data-mode="present"] .scorecard-table th,
      body[data-mode="present"] .scorecard-table td {
        padding: 0;
        border: 0;
        font-size: 10px;
        text-align: left;
        white-space: normal;
      }

      body[data-mode="present"] .scorecard-table th[scope="row"] {
        grid-column: 1;
        grid-row: 1;
        align-self: center;
        font-size: 12px;
      }

      body[data-mode="present"] .scorecard-table td:nth-child(2) {
        display: none;
      }

      body[data-mode="present"] .scorecard-table td:nth-child(3) {
        grid-column: 1;
        grid-row: 2;
      }

      body[data-mode="present"] .scorecard-table td:nth-child(4) {
        grid-column: 2;
        grid-row: 2;
      }

      body[data-mode="present"] .scorecard-table td:nth-child(3)::before,
      body[data-mode="present"] .scorecard-table td:nth-child(4)::before {
        display: block;
        color: var(--quiet);
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
      }

      body[data-mode="present"] .scorecard-table td:nth-child(3)::before {
        content: "Signal";
      }

      body[data-mode="present"] .scorecard-table td:nth-child(4)::before {
        content: "Tradeoff";
      }

      body[data-mode="present"] .scorecard-table td:nth-child(5) {
        grid-column: 2;
        grid-row: 1;
        align-self: center;
        justify-self: end;
      }

      body[data-mode="present"] .scorecard-note {
        margin-top: 12px;
        padding: 10px 12px;
        font-size: 11px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      html {
        scroll-behavior: auto;
      }

      *,
      *::before,
      *::after {
        scroll-behavior: auto !important;
        transition: none !important;
      }
    }

    @media print {
      .topbar,
      .chapter-nav,
      .present-controls,
      .notes-drawer,
      .progress {
        display: none !important;
      }

      body {
        background: #ffffff;
        color: #111111;
      }

      .story-slide {
        break-inside: avoid;
        border-bottom: 1px solid #cccccc;
      }

      .section-inner {
        width: 100%;
        padding: 28px 0;
      }

      .cover .section-inner {
        min-height: 0;
      }

      details {
        display: block;
      }

      details > * {
        display: block;
      }
    }
  </style>
</head>
<body data-theme="dark" data-mode="read">
  <header class="topbar">
    <div class="brand" aria-label="Inference optimization experiments">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>Inference optimization experiments</span>
    </div>
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Viewing mode">
        <button id="readMode" type="button" aria-pressed="true" title="Continuous reading mode">Read</button>
        <button id="presentMode" type="button" aria-pressed="false" title="Full-screen slide mode">Present</button>
      </div>
      <button class="tool-button" id="themeButton" type="button" title="Toggle light and dark theme">Light</button>
      <button class="tool-button" id="printButton" type="button" title="Print or save as PDF">Print</button>
      <button class="tool-button" id="fullscreenButton" type="button" title="Toggle browser full screen">Full screen</button>
    </div>
  </header>
  <div class="progress" id="progress" aria-hidden="true"></div>

  <nav class="chapter-nav" aria-label="Experiment chapters">
    ${navMarkup}
  </nav>

  <main>
    <section class="story-slide cover active" id="overview" data-slide="0">
      <div class="section-inner">
        <p class="cover-label">Amazon EKS / controlled inference experiments</p>
        <h1>Eight inference optimization experiments on Amazon EKS</h1>
        <p class="cover-deck">Capacity elasticity, request placement, GPU partitioning, model parallelism, external KV state, phase disaggregation, speculative decoding, and serving runtimes. Each experiment asks the same question: what improved, what worsened, and under which boundary?</p>
        <div class="cover-rule" aria-hidden="true"></div>
        <div class="cover-thumbnails">${coverThumbnails}</div>
      </div>
    </section>

    <section class="story-slide method" id="method" data-slide="1">
      <div class="section-inner">
        <div class="method-grid">
          <div>
            <p class="eyebrow">Method</p>
            <h2>Controlled comparisons, measured as systems</h2>
            <p class="lead">Every comparison changes one architectural lever inside a controlled boundary. AIPerf measures user-visible behavior; Prometheus, vLLM, llm-d, LMCache, and DCGM explain why it moved.</p>
            <div class="principles">
              <article class="principle">
                <strong>Hold the comparison steady</strong>
                <p>Keep the model, physical fleet, request shape, and observability path fixed whenever the experiment permits.</p>
              </article>
              <article class="principle">
                <strong>Read latency and throughput together</strong>
                <p>Aggregate tokens per second can improve while token cadence or tail latency gets worse.</p>
              </article>
              <article class="principle">
                <strong>Publish the boundary</strong>
                <p>These eight comparisons use different hardware and workloads. Compare within each boundary, not across absolute values.</p>
              </article>
            </div>
          </div>
          <ol class="experiment-map">
            <li><span class="map-number">01</span><span><strong>When should capacity change?</strong><span>Queue pressure drives KEDA from three to four ready replicas</span></span></li>
            <li><span class="map-number">02</span><span><strong>Where does a request go?</strong><span>Kubernetes Service vs backend-aware llm-d routing</span></span></li>
            <li><span class="map-number">03</span><span><strong>How many independent workers?</strong><span>Two full GPUs vs four MIG-backed replicas</span></span></li>
            <li><span class="map-number">04</span><span><strong>How is the model split?</strong><span>Inter-node tensor parallelism vs pipeline parallelism</span></span></li>
            <li><span class="map-number">05</span><span><strong>Where does reusable state live?</strong><span>Local GPU KV cache vs node-local LMCache MP</span></span></li>
            <li><span class="map-number">06</span><span><strong>Where do model phases execute?</strong><span>Homogeneous workers vs prefill/decode separation</span></span></li>
            <li><span class="map-number">07</span><span><strong>How does decode advance?</strong><span>One verified token vs native MTP speculation</span></span></li>
            <li><span class="map-number">08</span><span><strong>Which serving runtime?</strong><span>vLLM vs TensorRT-LLM on dedicated H100 GPUs</span></span></li>
          </ol>
        </div>
      </div>
    </section>

    ${experimentMarkup}

    <section class="story-slide scorecard" id="scorecard" data-slide="${experiments.length + 2}">
      <div class="section-inner">
        <p class="eyebrow">Scorecard</p>
        <h2>The optimization must match the bottleneck</h2>
        <p class="lead">Capacity elasticity and request placement produced clear operational gains. The remaining experiments exposed model geometry, state, phase, decode, and runtime tradeoffs rather than universal wins.</p>
        <div class="table-wrap scorecard-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Experiment</th>
                <th scope="col">Lever</th>
                <th scope="col">Strongest signal</th>
                <th scope="col">Main tradeoff</th>
                <th scope="col">Verdict</th>
              </tr>
            </thead>
            <tbody>${scorecardRows}</tbody>
          </table>
        </div>
        <p class="scorecard-note"><strong>Comparison rule:</strong> read each row against its own baseline. Hardware, prompt shape, output behavior, AIPerf version, and run count differ across experiments.</p>
      </div>
    </section>

    <section class="story-slide takeaways" id="takeaways" data-slide="${experiments.length + 3}">
      <div class="section-inner">
        <p class="eyebrow">Takeaways</p>
        <h2>Busy GPUs are evidence, not the outcome</h2>
        <p class="lead">A useful optimization improves the metric that matters without hiding the cost somewhere else in the request path.</p>
        <div class="takeaway-grid">
          <article class="final-point">
            <span>01</span>
            <h3>Capacity has a clock</h3>
            <p>KEDA added a ready replica, but a pre-provisioned GPU did not remove the 8.3-minute model cold start.</p>
          </article>
          <article class="final-point">
            <span>02</span>
            <h3>Placement changes waiting</h3>
            <p>Backend-aware routing improved throughput and tail latency without changing decode cadence.</p>
          </article>
          <article class="final-point">
            <span>03</span>
            <h3>Throughput can hide latency</h3>
            <p>MIG raised aggregate throughput while slower partitions worsened token cadence and tail behavior.</p>
          </article>
          <article class="final-point">
            <span>04</span>
            <h3>Topology must repay its overhead</h3>
            <p>LMCache, P/D, MTP, model parallelism, and the runtime swap all proved that a functional path is not automatically a performance win.</p>
          </article>
        </div>
        <p class="closing-line">The durable practice is the observable feedback loop: change one lever, generate controlled load, read application and hardware signals together, and keep the boundary attached to the result.</p>
      </div>
    </section>
  </main>

  <div class="present-controls" aria-label="Presentation controls">
    <button id="prevButton" type="button" aria-label="Previous slide" title="Previous slide">&larr;</button>
    <span class="slide-count" id="slideCount">1 / ${experiments.length + 4}</span>
    <button id="notesButton" type="button" aria-label="Toggle presenter notes" title="Toggle presenter notes">N</button>
    <button id="nextButton" type="button" aria-label="Next slide" title="Next slide">&rarr;</button>
  </div>

  <aside class="notes-drawer" id="notesDrawer" aria-live="polite">
    <h3>Presenter notes</h3>
    <div class="notes-drawer-content" id="notesContent"></div>
  </aside>

  <dialog id="imageDialog">
    <button class="dialog-close" id="dialogClose" type="button">Close</button>
    <img id="dialogImage" src="" alt="">
  </dialog>

  <script id="embeddedAssets" type="application/json">${JSON.stringify(embeddedAssets)}</script>
  <script>
    (function () {
      var embeddedAssets = JSON.parse(document.getElementById("embeddedAssets").textContent);
      var body = document.body;
      var slides = Array.from(document.querySelectorAll(".story-slide"));
      var navButtons = Array.from(document.querySelectorAll("[data-go]"));
      var chapterButtons = Array.from(document.querySelectorAll(".chapter-nav [data-go]"));
      var readMode = document.getElementById("readMode");
      var presentMode = document.getElementById("presentMode");
      var themeButton = document.getElementById("themeButton");
      var printButton = document.getElementById("printButton");
      var fullscreenButton = document.getElementById("fullscreenButton");
      var prevButton = document.getElementById("prevButton");
      var nextButton = document.getElementById("nextButton");
      var notesButton = document.getElementById("notesButton");
      var notesDrawer = document.getElementById("notesDrawer");
      var notesContent = document.getElementById("notesContent");
      var slideCount = document.getElementById("slideCount");
      var progress = document.getElementById("progress");
      var imageDialog = document.getElementById("imageDialog");
      var dialogImage = document.getElementById("dialogImage");
      var dialogClose = document.getElementById("dialogClose");
      var current = 0;
      var touchStartX = null;

      function setTheme(theme) {
        body.dataset.theme = theme;
        themeButton.textContent = theme === "dark" ? "Light" : "Dark";
        try {
          localStorage.setItem("inference-story-theme", theme);
        } catch (_) {}
      }

      function setMode(mode) {
        body.dataset.mode = mode;
        readMode.setAttribute("aria-pressed", String(mode === "read"));
        presentMode.setAttribute("aria-pressed", String(mode === "present"));
        notesDrawer.classList.remove("open");
        if (mode === "present") {
          showSlide(current);
        } else {
          slides[current].scrollIntoView({ block: "start" });
        }
      }

      function setActiveNav(index) {
        chapterButtons.forEach(function (button) {
          button.classList.toggle("active", Number(button.dataset.go) === index);
        });
      }

      function updateNotes() {
        var source = slides[current].querySelector(".speaker-notes");
        if (source) {
          notesContent.innerHTML = source.innerHTML;
        } else if (current === 0) {
          notesContent.innerHTML = "<p>Introduce the eight experiments as controlled comparisons. Start with capacity elasticity, then move through request placement, GPU topology, model partitioning, state placement, phase separation, decode strategy, and runtime choice.</p>";
        } else if (current === 1) {
          notesContent.innerHTML = "<p>Emphasize that absolute values should not be compared across rows. Each experiment has its own controlled baseline and published boundary.</p>";
        } else if (slides[current].id === "scorecard") {
          notesContent.innerHTML = "<p>KEDA proved pod elasticity while exposing the model cold-start clock. Routing was the strongest measured performance win. MIG exposed a throughput and tail-latency tradeoff. LMCache, P/D, and MTP proved functional paths that need better workload fit or tuning. TP/PP and the runtime comparison show that model geometry and checkpoint compatibility can decide whether a path serves at all.</p>";
        } else {
          notesContent.innerHTML = "<p>Close on the observable feedback loop: controlled load, application metrics, GPU telemetry, and an explicit experiment boundary.</p>";
        }
      }

      function showSlide(index) {
        current = Math.max(0, Math.min(slides.length - 1, index));
        slides.forEach(function (slide, slideIndex) {
          slide.classList.toggle("active", slideIndex === current);
        });
        slideCount.textContent = String(current + 1) + " / " + String(slides.length);
        progress.style.width = String(((current + 1) / slides.length) * 100) + "%";
        setActiveNav(current);
        updateNotes();
        try {
          history.replaceState(null, "", "#" + slides[current].id);
        } catch (_) {}
      }

      function goTo(index) {
        current = Math.max(0, Math.min(slides.length - 1, index));
        if (body.dataset.mode === "present") {
          showSlide(current);
        } else {
          slides[current].scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }

      function toggleFullscreen() {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(function () {});
        } else {
          document.exitFullscreen().catch(function () {});
        }
      }

      navButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          goTo(Number(button.dataset.go));
        });
      });

      readMode.addEventListener("click", function () {
        setMode("read");
      });

      presentMode.addEventListener("click", function () {
        setMode("present");
      });

      themeButton.addEventListener("click", function () {
        setTheme(body.dataset.theme === "dark" ? "light" : "dark");
      });

      printButton.addEventListener("click", function () {
        window.print();
      });

      fullscreenButton.addEventListener("click", toggleFullscreen);
      prevButton.addEventListener("click", function () { goTo(current - 1); });
      nextButton.addEventListener("click", function () { goTo(current + 1); });
      notesButton.addEventListener("click", function () {
        notesDrawer.classList.toggle("open");
      });

      document.querySelectorAll("[data-asset]").forEach(function (image) {
        image.src = embeddedAssets[image.dataset.asset];
      });

      document.querySelectorAll("[data-zoom-asset]").forEach(function (button) {
        button.addEventListener("click", function () {
          dialogImage.src = embeddedAssets[button.dataset.zoomAsset];
          dialogImage.alt = button.dataset.zoomAlt || "";
          imageDialog.showModal();
        });
      });

      dialogClose.addEventListener("click", function () {
        imageDialog.close();
      });

      imageDialog.addEventListener("click", function (event) {
        if (event.target === imageDialog) {
          imageDialog.close();
        }
      });

      document.addEventListener("keydown", function (event) {
        if (event.target.matches("input, textarea, select")) return;

        if (event.key === "t" || event.key === "T") {
          setTheme(body.dataset.theme === "dark" ? "light" : "dark");
          return;
        }

        if (event.key === "r" || event.key === "R") {
          setMode(body.dataset.mode === "read" ? "present" : "read");
          return;
        }

        if (event.key === "f" || event.key === "F") {
          toggleFullscreen();
          return;
        }

        if (body.dataset.mode !== "present") return;

        if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
          event.preventDefault();
          goTo(current + 1);
        } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
          event.preventDefault();
          goTo(current - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          goTo(0);
        } else if (event.key === "End") {
          event.preventDefault();
          goTo(slides.length - 1);
        } else if (event.key === "n" || event.key === "N") {
          notesDrawer.classList.toggle("open");
        } else if (event.key === "Escape") {
          notesDrawer.classList.remove("open");
        }
      });

      document.addEventListener("touchstart", function (event) {
        touchStartX = event.changedTouches[0].screenX;
      }, { passive: true });

      document.addEventListener("touchend", function (event) {
        if (body.dataset.mode !== "present" || touchStartX === null) return;
        var delta = event.changedTouches[0].screenX - touchStartX;
        if (Math.abs(delta) > 70) {
          goTo(current + (delta < 0 ? 1 : -1));
        }
        touchStartX = null;
      }, { passive: true });

      if ("IntersectionObserver" in window) {
        var observer = new IntersectionObserver(function (entries) {
          if (body.dataset.mode !== "read") return;
          entries.forEach(function (entry) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
              current = slides.indexOf(entry.target);
              setActiveNav(current);
              progress.style.width = String(((current + 1) / slides.length) * 100) + "%";
            }
          });
        }, { threshold: [0.35, 0.6] });
        slides.forEach(function (slide) { observer.observe(slide); });
      }

      var savedTheme = null;
      try {
        savedTheme = localStorage.getItem("inference-story-theme");
      } catch (_) {}
      setTheme(savedTheme || "dark");

      var hashIndex = slides.findIndex(function (slide) {
        return "#" + slide.id === window.location.hash;
      });
      if (hashIndex >= 0) current = hashIndex;
      showSlide(current);
      setMode("read");
    })();
  </script>
</body>
</html>
`;

fs.mkdirSync(here, { recursive: true });
fs.writeFileSync(outputPath, html.replace(/[ \t]+$/gm, ""));

const sizeMiB = fs.statSync(outputPath).size / (1024 * 1024);
console.log(`Wrote ${outputPath}`);
console.log(`Self-contained size: ${sizeMiB.toFixed(2)} MiB`);
