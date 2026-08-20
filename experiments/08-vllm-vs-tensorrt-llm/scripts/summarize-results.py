#!/usr/bin/env python3
"""Summarize a controlled vLLM versus TensorRT-LLM A/B/B/A run."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path


ARMS = (
    ("a1-vllm", "vLLM", "A1"),
    ("b1-trtllm", "TensorRT-LLM", "B1"),
    ("b2-trtllm", "TensorRT-LLM", "B2"),
    ("a2-vllm", "vLLM", "A2"),
)

METRICS = {
    "output_tps": ("output_token_throughput", "avg"),
    "request_rps": ("request_throughput", "avg"),
    "ttft_avg_ms": ("time_to_first_token", "avg"),
    "ttft_p99_ms": ("time_to_first_token", "p99"),
    "tst_avg_ms": ("time_to_second_token", "avg"),
    "e2e_avg_ms": ("request_latency", "avg"),
    "e2e_p99_ms": ("request_latency", "p99"),
    "itl_avg_ms": ("inter_token_latency", "avg"),
    "duration_s": ("benchmark_duration", "avg"),
    "requests": ("request_count", "avg"),
}


def load_arm(root: Path, slug: str, runtime: str, label: str) -> dict:
    matches = list(root.rglob(f"measured-{slug}/profile_export_aiperf.json"))
    if len(matches) != 1:
        raise SystemExit(
            f"Expected one measured result for {slug}; found {len(matches)} under {root}"
        )
    payload = json.loads(matches[0].read_text())
    result = {"arm": label, "runtime": runtime, "source": str(matches[0])}
    for name, (section, field) in METRICS.items():
        result[name] = float(payload[section][field])
    result["errors"] = payload.get("error_summary") or {}
    return result


def runtime_mean(arms: list[dict], runtime: str) -> dict:
    selected = [arm for arm in arms if arm["runtime"] == runtime]
    return {
        metric: statistics.fmean(arm[metric] for arm in selected)
        for metric in METRICS
    }


def delta(candidate: float, baseline: float) -> float:
    return (candidate / baseline - 1.0) * 100.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("run_root", type=Path)
    parser.add_argument("--cooldown-seconds", type=int, default=60)
    parser.add_argument("--recovery-note")
    args = parser.parse_args()

    arms = [load_arm(args.run_root, *arm) for arm in ARMS]
    means = {
        runtime: runtime_mean(arms, runtime)
        for runtime in ("vLLM", "TensorRT-LLM")
    }
    a = means["vLLM"]
    b = means["TensorRT-LLM"]
    deltas = {
        key: delta(b[key], a[key])
        for key in (
            "output_tps",
            "request_rps",
            "ttft_avg_ms",
            "ttft_p99_ms",
            "tst_avg_ms",
            "itl_avg_ms",
            "e2e_avg_ms",
            "e2e_p99_ms",
        )
    }

    summary = {
        "boundary": {
            "physical_fleet": "one p5.48xlarge with eight H100 GPUs",
            "gpus_benchmarked": "two: one dedicated H100 per runtime",
            "order": "A1 vLLM, B1 TensorRT-LLM, B2 TensorRT-LLM, A2 vLLM",
            "cooldown_seconds": args.cooldown_seconds,
            "recovery_note": args.recovery_note,
        },
        "arms": arms,
        "runtime_means": means,
        "tensorrt_llm_delta_percent": deltas,
    }
    output = args.run_root / "comparison-summary.json"
    output.write_text(json.dumps(summary, indent=2) + "\n")
    print(output)


if __name__ == "__main__":
    main()
