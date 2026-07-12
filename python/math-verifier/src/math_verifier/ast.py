from __future__ import annotations

from typing import Any

import sympy as sp


class UnsupportedNode(ValueError):
    pass


def expression(node: dict[str, Any]) -> sp.Expr:
    kind = node.get("kind")
    if kind == "integer":
        return sp.Integer(node["value"])
    if kind == "rational":
        return sp.Rational(node["numerator"], node["denominator"])
    if kind == "decimal":
        return sp.Rational(node["unscaled"], 10 ** int(node["scale"]))
    if kind == "constant":
        return {"pi": sp.pi, "e": sp.E}[node["name"]]
    if kind == "symbol":
        assumptions = {name: True for name in node.get("assumptions", [])}
        return sp.Symbol(node["name"], **assumptions)
    if kind == "negate":
        return -expression(node["operand"])
    if kind == "sum":
        return sp.Add(*(expression(item) for item in node["operands"]))
    if kind == "product":
        return sp.Mul(*(expression(item) for item in node["operands"]))
    if kind == "quotient":
        return expression(node["left"]) / expression(node["right"])
    if kind == "power":
        return expression(node["left"]) ** expression(node["right"])
    if kind == "root":
        return expression(node["radicand"]) ** (1 / expression(node["degree"]))
    if kind == "function":
        functions = {"abs": sp.Abs, "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "log": sp.log}
        return functions[node["name"]](*(expression(item) for item in node["args"]))
    if kind == "relation":
        left, right = expression(node["left"]), expression(node["right"])
        return {"eq": sp.Eq, "lt": sp.Lt, "lte": sp.Le, "gt": sp.Gt, "gte": sp.Ge}[node["operator"]](left, right)
    if kind in ("tuple", "set", "matrix"):
        items = [expression(item) for item in node["items"]]
        if kind == "tuple":
            return sp.Tuple(*items)
        if kind == "set":
            return sp.FiniteSet(*items)
        return sp.Matrix([items])
    raise UnsupportedNode(f"unsupported expression node: {kind}")


def expected_expression(value: dict[str, Any]) -> sp.Expr:
    kind = value.get("kind")
    if kind == "scalar":
        return expression(value["expression"])
    if kind == "measurement":
        return expression(value["value"])
    if kind in ("finite-set", "tuple"):
        items = [expected_expression(item) for item in value["values"]]
        return sp.FiniteSet(*items) if kind == "finite-set" else sp.Tuple(*items)
    if kind == "approximation":
        return expression(value["exact"])
    raise UnsupportedNode(f"unsupported exact value: {kind}")
