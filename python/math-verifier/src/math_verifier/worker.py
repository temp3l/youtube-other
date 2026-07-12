from __future__ import annotations

import hashlib
import json
import sys
from typing import Any

import sympy

from . import __version__
from .checks import run_check

PROTOCOL = "math-verifier.v2"


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def process(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("protocolVersion") != PROTOCOL:
        raise ValueError("unsupported protocol version")
    if request.get("mathSpecVersion") != "math-spec.v2":
        raise ValueError("unsupported math specification version")
    payload = {key: request[key] for key in ("protocolVersion", "requestId", "mathSpecVersion", "checks")}
    if canonical_hash(payload) != request.get("inputHash"):
        raise ValueError("input hash mismatch")
    checks = [run_check(check) for check in request.get("checks", [])]
    statuses = {check["status"] for check in checks}
    status = "error" if "error" in statuses else "unsupported" if "unsupported" in statuses else "failed" if "failed" in statuses else "passed"
    return {
        "protocolVersion": PROTOCOL,
        "requestId": request["requestId"],
        "inputHash": request["inputHash"],
        "verifierVersion": __version__,
        "sympyVersion": sympy.__version__,
        "status": status,
        "checks": checks,
    }


def main() -> int:
    try:
        raw = sys.stdin.read()
        request = json.loads(raw)
        response = process(request)
        sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
        return 0
    except Exception as error:
        sys.stderr.write(f"math-verifier: {error}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
