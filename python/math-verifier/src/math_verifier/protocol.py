from __future__ import annotations

from typing import Any

import sympy as sp

from .ast import UnsupportedNode, expression


def exact_scalar(node: dict[str, Any], field: str) -> sp.Expr:
    value = expression(node)
    if not isinstance(value, sp.Expr) or value.free_symbols:
        raise UnsupportedNode(f"{field} must be an exact scalar")
    if value.has(sp.zoo, sp.oo, -sp.oo, sp.nan):
        raise ValueError(f"{field} is not finite")
    return value


def require_object(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise UnsupportedNode(f"{field} is required")
    return value


def require_count(values: Any, field: str, *, minimum: int, maximum: int | None = None) -> list[Any]:
    if not isinstance(values, list) or len(values) < minimum or (maximum is not None and len(values) > maximum):
        expected = str(minimum) if maximum == minimum else f"{minimum}..{maximum or 'n'}"
        raise UnsupportedNode(f"{field} requires {expected} values")
    return values


def equal(left: sp.Expr, right: sp.Expr) -> bool:
    return sp.simplify(left - right) == 0
