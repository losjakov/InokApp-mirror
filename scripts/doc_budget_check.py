#!/usr/bin/env python3
"""doc_budget_check.py - fail (exit 1) when a documentation file crosses its ceiling.

Ceilings live in scripts/doc_budgets.json. Every ref/*.md without an explicit row gets `_default_ref`.
Run at session start and final. Over the ceiling means: split the file, keep a 2-line pointer.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUDGETS = os.path.join(ROOT, "scripts", "doc_budgets.json")


def main() -> int:
    with open(BUDGETS, encoding="utf-8") as f:
        budgets = json.load(f)
    default_ref = budgets.get("_default_ref", {"max_bytes": 14000})
    checks = {k: v for k, v in budgets.items() if not k.startswith("_")}
    ref_dir = os.path.join(ROOT, "ref")
    if os.path.isdir(ref_dir):
        for name in sorted(os.listdir(ref_dir)):
            rel = f"ref/{name}"
            if name.endswith(".md") and rel not in checks:
                checks[rel] = default_ref
    bad = 0
    for rel, lim in checks.items():
        path = os.path.join(ROOT, *rel.split("/"))
        if not os.path.exists(path):
            print(f"  -   {rel}: missing (ok if not yet written)")
            continue
        size = os.path.getsize(path)
        with open(path, encoding="utf-8") as f:
            lines = sum(1 for _ in f)
        over = []
        if "max_bytes" in lim and size > lim["max_bytes"]:
            over.append(f"{size} b > {lim['max_bytes']} b")
        if "max_lines" in lim and lines > lim["max_lines"]:
            over.append(f"{lines} lines > {lim['max_lines']}")
        flag = "OVER" if over else "ok"
        print(f"  {flag:4} {rel}: {size} b, {lines} lines" + (f"  <-- {'; '.join(over)}" if over else ""))
        bad += bool(over)
    print("doc budgets:", "FAIL" if bad else "PASS", f"({bad} over)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
