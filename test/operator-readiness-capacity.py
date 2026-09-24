#!/usr/bin/env python3
"""Measure the dependency-backed /ready probe on a declared environment.

This is a reproducible operational baseline, not an auth-flow load test or SLA.
"""

import argparse
import concurrent.futures
import json
import platform
import statistics
import time
import urllib.error
import urllib.request


def probe(url: str, timeout: float) -> tuple[bool, float]:
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            payload = json.load(response)
            ok = response.status == 200 and payload.get("ready") is True
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        ok = False
    return ok, (time.perf_counter() - started) * 1000


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, int((len(ordered) - 1) * fraction + 0.5))
    return round(ordered[index], 2)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="Full URL ending in /ready")
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()
    if not args.url.endswith("/ready") or args.requests < 1 or args.concurrency < 1:
        parser.error("Use a /ready URL and positive request/concurrency counts")

    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        samples = list(executor.map(lambda _: probe(args.url, args.timeout), range(args.requests)))
    elapsed = time.perf_counter() - started
    times = [sample[1] for sample in samples]
    success = sum(sample[0] for sample in samples)
    print(json.dumps({
        "probe": "readiness only; no authentication capacity claim",
        "url": args.url,
        "host": platform.node(),
        "platform": platform.platform(),
        "requests": args.requests,
        "concurrency": args.concurrency,
        "success": success,
        "failed": args.requests - success,
        "elapsed_seconds": round(elapsed, 2),
        "requests_per_second": round(args.requests / elapsed, 2),
        "latency_ms": {
            "median": round(statistics.median(times), 2),
            "p95": percentile(times, 0.95),
            "p99": percentile(times, 0.99),
        },
    }, sort_keys=True))
    return 0 if success == args.requests else 1


if __name__ == "__main__":
    raise SystemExit(main())
