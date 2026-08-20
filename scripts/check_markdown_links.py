#!/usr/bin/env python3
"""Fail when a local Markdown link points to a missing repository file."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote


LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
SKIP_PREFIXES = ("http://", "https://", "mailto:", "#")


def local_target(markdown: Path, raw: str) -> Path | None:
    target = raw.strip().split(maxsplit=1)[0].strip("<>")
    if not target or target.startswith(SKIP_PREFIXES):
        return None
    target = unquote(target.split("#", 1)[0])
    if not target:
        return None
    return (markdown.parent / target).resolve()


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    failures: list[str] = []
    for markdown in sorted(root.rglob("*.md")):
        if ".git" in markdown.parts:
            continue
        text = markdown.read_text(encoding="utf-8")
        for match in LINK.finditer(text):
            target = local_target(markdown, match.group(1))
            if target is not None and not target.exists():
                failures.append(
                    f"{markdown.relative_to(root)} -> {match.group(1)}"
                )
    if failures:
        print("Missing local Markdown targets:", file=sys.stderr)
        print("\n".join(f"  {item}" for item in failures), file=sys.stderr)
        return 1
    print("Local Markdown links passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
