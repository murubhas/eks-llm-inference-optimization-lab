# Results Index

Read every row against its own baseline. Hardware and workload differ between
experiments, so absolute values are not comparable across rows.

| Experiment | Primary observation | Important tradeoff |
|---|---|---|
| KEDA 3 to 4 | Aggregate queue pressure created a fourth replica and activated the fourth GPU | Model startup remained long; a 40-minute stabilization protected the new replica |
| Kubernetes Service vs llm-d | +12.0% output throughput; p99 TTFT -64.7% | Synthetic queue-heavy workload with `max-num-seqs=1` |
| Full GPU vs MIG | +10.8% aggregate output throughput | Average ITL +81.4%; p99 E2E +43.2% |
| TP=2 vs PP=2 | Near throughput parity; both served over socket networking | PP=2 p99 E2E +7.60%; TP=4 did not serve |
| Local KV vs LMCache | External cache activity proven; output throughput +5.0% | Average E2E +10.0%; output work differed because EOS was respected |
| Homogeneous vs P/D | Role separation, KV transfer, and metrics path were proven | Output throughput fell about 40% on the tested non-RDMA topology |
| Standard decode vs MTP | MTP path and counters were proven | About 0.14% acceptance; throughput and tail latency regressed |
| vLLM vs TensorRT-LLM | BF16 served on H100; output throughput differed by 0.38% and mean E2E by 0.64% | TensorRT-LLM mean TTFT was 58.70% higher; compressed-tensors FP8 remained incompatible |

The experiment README files contain exact controls, full metric tables, and
the boundary that governs each conclusion.
