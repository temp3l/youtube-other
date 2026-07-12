from __future__ import annotations

from typing import Any, Callable

import sympy as sp

from .ast import UnsupportedNode, expected_expression, expression
from .protocol import equal, exact_scalar, require_count, require_object


SUPPORTED = {
    "evaluate", "equivalent", "solve", "unit-dimension", "graph-point",
    "geometry", "probability", "display-fact",
}


def _result(check_id: str, status: str, expected: str | None = None, actual: str | None = None, **extra: str) -> dict[str, Any]:
    value: dict[str, Any] = {"checkId": check_id, "status": status}
    if expected is not None:
        value["expected"] = expected
    if actual is not None:
        value["actual"] = actual
    value.update(extra)
    return value


def _unit_check(check: dict[str, Any], actual: sp.Expr, expected: sp.Expr) -> tuple[bool, sp.Expr]:
    actual_unit = require_object(check.get("actualUnit"), "actualUnit")
    expected_value = require_object(check.get("expected"), "expected")
    expected_unit = require_object(expected_value.get("unit"), "expected.unit")
    if expected_value.get("kind") != "measurement":
        raise UnsupportedNode("unit-dimension requires a measurement expected value")
    def scale(unit: dict[str, Any], field: str) -> sp.Rational:
        raw = require_object(unit.get("scale"), f"{field}.scale")
        value = sp.Rational(int(raw["numerator"]), int(raw["denominator"]))
        if value <= 0:
            raise ValueError(f"{field}.scale must be positive")
        return value

    def dimensions(unit: dict[str, Any]) -> dict[str, int]:
        raw = require_object(unit.get("dimensions"), "unit.dimensions")
        return {name: int(power) for name, power in raw.items() if int(power) != 0}

    if dimensions(actual_unit) != dimensions(expected_unit):
        return False, actual
    if actual_unit.get("angle") != expected_unit.get("angle"):
        raise UnsupportedNode("angle conversion requires an explicit exact angular scale")
    actual_base = actual * scale(actual_unit, "actualUnit")
    expected_base = expected * scale(expected_unit, "expected.unit")
    return equal(actual_base, expected_base), actual_base


def _in_domain(value: sp.Expr, domain: dict[str, Any]) -> bool:
    if domain.get("kind") != "interval":
        raise UnsupportedNode("only exact interval graph domains are supported")
    minimum = exact_scalar(domain["minimum"], "graph.domain.minimum")
    maximum = exact_scalar(domain["maximum"], "graph.domain.maximum")
    if sp.ask(sp.Q.le(minimum, maximum)) is not True:
        raise ValueError("graph domain minimum exceeds maximum")
    lower = sp.ask(sp.Q.ge(value, minimum)) if domain.get("minimumInclusive") else sp.ask(sp.Q.gt(value, minimum))
    upper = sp.ask(sp.Q.le(value, maximum)) if domain.get("maximumInclusive") else sp.ask(sp.Q.lt(value, maximum))
    return lower is True and upper is True


def _graph_check(check: dict[str, Any], actual: sp.Expr, expected: sp.Expr) -> tuple[bool, sp.Expr]:
    evidence = require_object(check.get("graph"), "graph")
    variable_name = evidence.get("variable")
    if not isinstance(variable_name, str) or not variable_name:
        raise UnsupportedNode("graph.variable is required")
    variable = sp.Symbol(variable_name)
    function = expression(evidence["function"])
    if function.free_symbols - {variable}:
        raise UnsupportedNode("graph function contains undeclared symbols")
    domain = require_object(evidence.get("domain"), "graph.domain")
    mode = evidence.get("mode")
    if mode == "point":
        point = require_object(evidence.get("point"), "graph.point")
        x = exact_scalar(point["x"], "graph.point.x")
        y = exact_scalar(point["y"], "graph.point.y")
        truth = sp.simplify(function.subs(variable, x))
        valid = _in_domain(x, domain) and equal(y, truth)
    elif mode == "slope":
        start = require_object(evidence.get("from"), "graph.from")
        end = require_object(evidence.get("to"), "graph.to")
        x1, y1 = exact_scalar(start["x"], "graph.from.x"), exact_scalar(start["y"], "graph.from.y")
        x2, y2 = exact_scalar(end["x"], "graph.to.x"), exact_scalar(end["y"], "graph.to.y")
        if equal(x1, x2):
            raise ValueError("graph slope is undefined for equal x coordinates")
        truth = sp.simplify((y2 - y1) / (x2 - x1))
        valid = (
            _in_domain(x1, domain)
            and _in_domain(x2, domain)
            and equal(y1, function.subs(variable, x1))
            and equal(y2, function.subs(variable, x2))
        )
    else:
        raise UnsupportedNode(f"unsupported graph mode: {mode}")
    return valid and equal(actual, truth) and equal(expected, truth), truth


def _geometry_check(check: dict[str, Any], actual: sp.Expr, expected: sp.Expr) -> tuple[bool, sp.Expr]:
    evidence = require_object(check.get("geometry"), "geometry")
    parameters = require_object(evidence.get("parameters"), "geometry.parameters")
    assumptions = set(require_count(evidence.get("assumptions"), "geometry.assumptions", minimum=1))
    formula = evidence.get("formula")
    entity = evidence.get("entity")

    def parameter(name: str) -> sp.Expr:
        return exact_scalar(parameters[name], f"geometry.parameters.{name}")

    formulas: dict[str, tuple[str, set[str], Callable[[], sp.Expr]]] = {
        "rectangle-area": ("rectangle", {"width-positive", "height-positive"}, lambda: parameter("width") * parameter("height")),
        "rectangle-perimeter": ("rectangle", {"width-positive", "height-positive"}, lambda: 2 * (parameter("width") + parameter("height"))),
        "triangle-area": ("triangle", {"base-positive", "height-positive", "perpendicular-height"}, lambda: parameter("base") * parameter("height") / 2),
        "circle-area": ("circle", {"radius-positive"}, lambda: sp.pi * parameter("radius") ** 2),
        "circle-circumference": ("circle", {"radius-positive"}, lambda: 2 * sp.pi * parameter("radius")),
        "pythagorean-hypotenuse": ("right-triangle", {"leg-a-positive", "leg-b-positive", "right-angle"}, lambda: sp.sqrt(parameter("legA") ** 2 + parameter("legB") ** 2)),
    }
    if formula not in formulas:
        raise UnsupportedNode(f"unsupported geometry formula: {formula}")
    required_entity, required_assumptions, calculate = formulas[formula]
    if entity != required_entity or assumptions != required_assumptions:
        raise UnsupportedNode("geometry entity or assumptions do not match the declared formula")
    truth = sp.simplify(calculate())
    for value in parameters.values():
        if sp.ask(sp.Q.positive(exact_scalar(value, "geometry parameter"))) is not True:
            raise ValueError("geometry parameters declared positive must be positive")
    return equal(actual, truth) and equal(expected, truth), truth


def _probability_check(check: dict[str, Any], actual: sp.Expr, expected: sp.Expr) -> tuple[bool, sp.Expr]:
    evidence = require_object(check.get("probability"), "probability")
    rule = evidence.get("rule")
    limits = {"single": (1, 1), "sum": (2, None), "path-product": (2, None), "complement": (1, 1), "normalization": (2, None)}
    if rule not in limits:
        raise UnsupportedNode(f"unsupported probability rule: {rule}")
    minimum, maximum = limits[rule]
    raw_inputs = require_count(evidence.get("inputs"), "probability.inputs", minimum=minimum, maximum=maximum)
    inputs = [exact_scalar(item, "probability input") for item in raw_inputs]
    if any(sp.ask(sp.Q.ge(value, 0)) is not True or sp.ask(sp.Q.le(value, 1)) is not True for value in inputs):
        return False, actual
    if rule == "single":
        truth = inputs[0]
    elif rule in ("sum", "normalization"):
        truth = sp.Add(*inputs)
    elif rule == "path-product":
        truth = sp.Mul(*inputs)
    else:
        truth = 1 - inputs[0]
    truth = sp.simplify(truth)
    if sp.ask(sp.Q.ge(truth, 0)) is not True or sp.ask(sp.Q.le(truth, 1)) is not True:
        return False, truth
    if rule == "normalization" and not equal(truth, sp.Integer(1)):
        return False, truth
    return equal(actual, truth) and equal(expected, truth), truth


def run_check(check: dict[str, Any]) -> dict[str, Any]:
    check_id = check.get("checkId", "unknown")
    kind = check.get("kind")
    if kind not in SUPPORTED:
        return _result(check_id, "unsupported", errorCode="UNSUPPORTED_CHECK")
    try:
        actual = expression(check["expression"])
        expected = expected_expression(check["expected"])
        truth = expected
        if kind == "equivalent":
            secondary = expression(check.get("secondaryExpression", check["expected"]["expression"]))
            passed = equal(actual, secondary)
        elif kind == "solve":
            symbols = sorted(actual.free_symbols, key=lambda symbol: symbol.name)
            if len(symbols) != 1:
                raise UnsupportedNode("solve requires exactly one symbol")
            equation = actual.lhs - actual.rhs if isinstance(actual, sp.Equality) else actual
            truth = sp.solveset(equation, symbols[0], domain=sp.S.Reals)
            passed = truth == expected
            actual = truth
        elif kind == "unit-dimension":
            passed, truth = _unit_check(check, actual, expected)
        elif kind == "graph-point":
            passed, truth = _graph_check(check, actual, expected)
        elif kind == "geometry":
            passed, truth = _geometry_check(check, actual, expected)
        elif kind == "probability":
            passed, truth = _probability_check(check, actual, expected)
        else:
            passed = equal(actual, expected) if isinstance(actual, sp.Expr) and isinstance(expected, sp.Expr) else actual == expected
        return _result(check_id, "passed" if passed else "failed", sp.sstr(truth), sp.sstr(actual), **({} if passed else {"errorCode": "VALUE_MISMATCH"}))
    except UnsupportedNode as error:
        return _result(check_id, "unsupported", errorCode="UNSUPPORTED_NODE", message=str(error))
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as error:
        return _result(check_id, "error", errorCode="CHECK_ERROR", message=str(error))
    except Exception as error:  # Fail closed for unexpected SymPy failures.
        return _result(check_id, "error", errorCode="CHECK_ERROR", message=str(error))
