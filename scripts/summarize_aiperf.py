#!/usr/bin/env python3
"""Convert an AIPerf JSON export into portable YAML and Markdown summaries."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


def metric(document: dict[str, Any], name: str, statistic: str = "avg") -> Any:
    value = document.get(name)
    if isinstance(value, dict):
        return value.get(statistic)
    return None


def first_item(value: Any) -> dict[str, Any]:
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return value[0]
    return {}


def error_count(document: dict[str, Any]) -> int:
    summary = document.get("error_summary")
    if not isinstance(summary, list):
        return 0
    count = 0
    for item in summary:
        if isinstance(item, dict):
            count += int(item.get("count", 1))
        else:
            count += 1
    return count


def yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return "null"
        return f"{value:.6f}".rstrip("0").rstrip(".")
    if isinstance(value, int):
        return str(value)
    return json.dumps(str(value), ensure_ascii=True)


def emit_yaml(value: Any, indent: int = 0) -> list[str]:
    prefix = " " * indent
    if isinstance(value, dict):
        lines: list[str] = []
        for key, child in value.items():
            if isinstance(child, (dict, list)):
                lines.append(f"{prefix}{key}:")
                lines.extend(emit_yaml(child, indent + 2))
            else:
                lines.append(f"{prefix}{key}: {yaml_scalar(child)}")
        return lines
    if isinstance(value, list):
        lines = []
        for child in value:
            if isinstance(child, (dict, list)):
                lines.append(f"{prefix}-")
                lines.extend(emit_yaml(child, indent + 2))
            else:
                lines.append(f"{prefix}- {yaml_scalar(child)}")
        return lines
    return [f"{prefix}{yaml_scalar(value)}"]


def compact_number(value: Any, digits: int = 2) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def build_record(document: dict[str, Any], args: argparse.Namespace, source: Path) -> dict[str, Any]:
    input_config = document.get("input_config") or {}
    model = first_item((input_config.get("models") or {}).get("items"))
    dataset = first_item(input_config.get("datasets"))
    phase = first_item(input_config.get("phases"))
    endpoint = input_config.get("endpoint") or {}
    extra = endpoint.get("extra") or {}
    thinking = (extra.get("chat_template_kwargs") or {}).get("enable_thinking")
    prompts = dataset.get("prompts") or {}
    prefix_prompts = dataset.get("prefix_prompts") or {}

    request_count = phase.get("requests")
    if request_count is None:
        request_count = metric(document, "request_count")

    completed_requests = metric(document, "request_latency", "count")
    if completed_requests is None:
        completed_requests = request_count

    inter_token_avg = metric(document, "inter_token_latency")

    return {
        "schema_version": 1,
        "status": "generated_summary",
        "source": {
            "file": source.name,
            "aiperf_version": document.get("aiperf_version"),
            "benchmark_id": document.get("benchmark_id"),
            "started_at": document.get("start_time"),
            "completed_at": document.get("end_time"),
        },
        "experiment": {
            "module": args.module,
        },
        "environment": {
            "instance_type": args.instance_type,
            "active_node_count": args.active_node_count,
            "gpu_type": args.gpu_type,
            "gpu_count": args.gpu_count,
        },
        "serving": {
            "model": args.model_label or model.get("name") or "unspecified",
            "replicas": args.replicas,
            "entrypoint": args.entrypoint,
        },
        "load": {
            "request_count": int(request_count) if request_count is not None else None,
            "concurrency": phase.get("concurrency"),
            "request_rate": phase.get("rate"),
            "arrival_pattern": phase.get("type"),
            "synthetic_input_tokens": (prompts.get("isl") or {}).get("mean"),
            "shared_prefix_tokens": prefix_prompts.get("length", 0),
            "prefix_pool_size": prefix_prompts.get("pool_size", 0),
            "requested_output_tokens": (prompts.get("osl") or {}).get("mean"),
            "streaming": endpoint.get("streaming"),
            "connection_reuse": endpoint.get("connection_reuse"),
            "thinking": thinking,
            "ignore_eos": bool(extra.get("ignore_eos", False)),
        },
        "results": {
            "completed_requests": int(completed_requests) if completed_requests is not None else None,
            "api_errors": error_count(document),
            "cancelled": bool(document.get("was_cancelled", False)),
            "benchmark_duration_seconds": metric(document, "benchmark_duration"),
            "observed_average_input_tokens": metric(document, "input_sequence_length"),
            "observed_average_output_tokens": metric(document, "output_sequence_length"),
            "natural_eos_length_mismatches": metric(document, "osl_mismatch_count"),
            "request_throughput_per_second": metric(document, "request_throughput"),
            "output_token_throughput_per_second": metric(document, "output_token_throughput"),
            "average_e2e_latency_ms": metric(document, "request_latency"),
            "p95_e2e_latency_ms": metric(document, "request_latency", "p95"),
            "p99_e2e_latency_ms": metric(document, "request_latency", "p99"),
            "average_ttft_ms": metric(document, "time_to_first_token"),
            "p99_ttft_ms": metric(document, "time_to_first_token", "p99"),
            "average_time_to_second_token_ms": metric(document, "time_to_second_token"),
            "p99_time_to_second_token_ms": metric(document, "time_to_second_token", "p99"),
            "average_inter_token_latency_ms": inter_token_avg,
            "p99_inter_token_latency_ms": metric(document, "inter_token_latency", "p99"),
            "derived_average_tpot_proxy_ms": inter_token_avg,
        },
        "notes": {
            "privacy": "Endpoint URLs, artifact paths, and raw CLI commands are intentionally omitted.",
            "interpretation": "The TPOT proxy is AIPerf mean inter-token latency, not a separately reported TPOT metric.",
        },
    }


def markdown(record: dict[str, Any]) -> str:
    results = record["results"]
    rows = [
        ("Completed requests", results["completed_requests"], "requests"),
        ("API errors", results["api_errors"], "errors"),
        ("Request throughput", results["request_throughput_per_second"], "req/s"),
        ("Output-token throughput", results["output_token_throughput_per_second"], "tokens/s"),
        ("Average E2E latency", results["average_e2e_latency_ms"], "ms"),
        ("p95 E2E latency", results["p95_e2e_latency_ms"], "ms"),
        ("p99 E2E latency", results["p99_e2e_latency_ms"], "ms"),
        ("Average TTFT", results["average_ttft_ms"], "ms"),
        ("p99 TTFT", results["p99_ttft_ms"], "ms"),
        ("Average time to second token", results["average_time_to_second_token_ms"], "ms"),
        ("Average ITL", results["average_inter_token_latency_ms"], "ms"),
        ("Derived TPOT proxy (mean ITL)", results["derived_average_tpot_proxy_ms"], "ms"),
        ("p99 ITL", results["p99_inter_token_latency_ms"], "ms"),
    ]
    lines = [
        "# AIPerf Summary",
        "",
        f"- Model: `{record['serving']['model']}`",
        f"- Module: `{record['experiment']['module']}`",
        f"- Entry point: `{record['serving']['entrypoint']}`",
        "",
        "| Metric | Value | Unit |",
        "| --- | ---: | --- |",
    ]
    for label, value, unit in rows:
        lines.append(f"| {label} | {compact_number(value)} | {unit} |")
    lines.extend(
        [
            "",
            "> Endpoint URLs, artifact paths, and raw CLI commands are intentionally omitted.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="AIPerf profile_export_aiperf.json")
    parser.add_argument("--yaml-out", type=Path)
    parser.add_argument("--markdown-out", type=Path)
    parser.add_argument("--module", default="platform/baseline")
    parser.add_argument("--model-label")
    parser.add_argument("--entrypoint", default="unspecified")
    parser.add_argument("--instance-type", default="unspecified")
    parser.add_argument("--active-node-count", type=int, default=0)
    parser.add_argument("--gpu-type", default="unspecified")
    parser.add_argument("--gpu-count", type=int, default=0)
    parser.add_argument("--replicas", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with args.input.open(encoding="utf-8") as handle:
        document = json.load(handle)

    record = build_record(document, args, args.input)
    yaml_text = "\n".join(emit_yaml(record)) + "\n"
    markdown_text = markdown(record)

    if args.yaml_out:
        args.yaml_out.parent.mkdir(parents=True, exist_ok=True)
        args.yaml_out.write_text(yaml_text, encoding="utf-8")
    if args.markdown_out:
        args.markdown_out.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_out.write_text(markdown_text, encoding="utf-8")
    if not args.yaml_out and not args.markdown_out:
        print(markdown_text, end="")


if __name__ == "__main__":
    main()
