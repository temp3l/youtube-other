from __future__ import annotations

from typing import Any, Callable
import hashlib
import json

import sympy as sp

from .ast import UnsupportedNode, expected_expression, expression
from .protocol import equal, exact_scalar, require_count, require_object


SUPPORTED = {
    "evaluate", "equivalent", "solve", "unit-dimension", "graph-point",
    "geometry", "probability", "display-fact", "integer-domain",
    "fraction-decimal-domain",
    "geometry-measurement-domain",
    "data-diagram-domain",
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


def _is_finite(value: sp.Expr) -> bool:
    return not value.has(sp.zoo, sp.oo, -sp.oo, sp.nan)


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
        if not _is_finite(truth):
            return False, truth
        valid = _in_domain(x, domain) and equal(y, truth)
    elif mode == "slope":
        start = require_object(evidence.get("from"), "graph.from")
        end = require_object(evidence.get("to"), "graph.to")
        x1, y1 = exact_scalar(start["x"], "graph.from.x"), exact_scalar(start["y"], "graph.from.y")
        x2, y2 = exact_scalar(end["x"], "graph.to.x"), exact_scalar(end["y"], "graph.to.y")
        if equal(x1, x2):
            raise ValueError("graph slope is undefined for equal x coordinates")
        truth = sp.simplify((y2 - y1) / (x2 - x1))
        f1 = sp.simplify(function.subs(variable, x1))
        f2 = sp.simplify(function.subs(variable, x2))
        if not _is_finite(f1) or not _is_finite(f2) or not _is_finite(truth):
            return False, truth
        valid = (
            _in_domain(x1, domain)
            and _in_domain(x2, domain)
            and equal(y1, f1)
            and equal(y2, f2)
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
        "pythagorean-leg": ("right-triangle", {"hypotenuse-positive", "leg-positive", "right-angle"}, lambda: sp.sqrt(parameter("hypotenuse") ** 2 - parameter("leg") ** 2)),
        "right-triangle-sine": ("right-triangle", {"opposite-positive", "hypotenuse-positive", "right-angle"}, lambda: parameter("opposite") / parameter("hypotenuse")),
        "right-triangle-cosine": ("right-triangle", {"adjacent-positive", "hypotenuse-positive", "right-angle"}, lambda: parameter("adjacent") / parameter("hypotenuse")),
        "right-triangle-tangent": ("right-triangle", {"opposite-positive", "adjacent-positive", "right-angle"}, lambda: parameter("opposite") / parameter("adjacent")),
        "cuboid-volume": ("cuboid", {"length-positive", "width-positive", "height-positive"}, lambda: parameter("length") * parameter("width") * parameter("height")),
        "cuboid-surface-area": ("cuboid", {"length-positive", "width-positive", "height-positive"}, lambda: 2 * (parameter("length") * parameter("width") + parameter("length") * parameter("height") + parameter("width") * parameter("height"))),
        "cylinder-volume": ("cylinder", {"radius-positive", "height-positive"}, lambda: sp.pi * parameter("radius") ** 2 * parameter("height")),
        "cylinder-surface-area": ("cylinder", {"radius-positive", "height-positive"}, lambda: 2 * sp.pi * parameter("radius") * (parameter("radius") + parameter("height"))),
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
    limits = {
        "single": (1, 1),
        "sum": (2, None),
        "path-sum": (2, None),
        "path-product": (2, None),
        "complement": (1, 1),
        "normalization": (2, None),
        "four-field-total": (4, 4),
        "four-field-joint": (2, 2),
        "four-field-conditional": (2, 2),
    }
    if rule not in limits:
        raise UnsupportedNode(f"unsupported probability rule: {rule}")
    minimum, maximum = limits[rule]
    raw_inputs = require_count(evidence.get("inputs"), "probability.inputs", minimum=minimum, maximum=maximum)
    inputs = [exact_scalar(item, "probability input") for item in raw_inputs]
    if rule == "four-field-total":
        if any(sp.ask(sp.Q.ge(value, 0)) is not True for value in inputs):
            return False, actual
        truth = sp.simplify(sp.Add(*inputs))
        return equal(actual, truth) and equal(expected, truth), truth
    if rule in ("four-field-joint", "four-field-conditional"):
        part, total = inputs
        if sp.ask(sp.Q.ge(part, 0)) is not True or sp.ask(sp.Q.gt(total, 0)) is not True or sp.ask(sp.Q.le(part, total)) is not True:
            return False, actual
        truth = sp.simplify(part / total)
        return equal(actual, truth) and equal(expected, truth), truth
    if any(sp.ask(sp.Q.ge(value, 0)) is not True or sp.ask(sp.Q.le(value, 1)) is not True for value in inputs):
        return False, actual
    if rule == "single":
        truth = inputs[0]
    elif rule in ("sum", "path-sum", "normalization"):
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


def _solve_check(check: dict[str, Any], actual: sp.Expr, expected: sp.Expr) -> tuple[bool, sp.Expr]:
    if check.get("solutionDomain", "real") != "real":
        raise UnsupportedNode("solve only supports the explicit real domain")
    equations = list(actual) if isinstance(actual, (sp.Tuple, sp.FiniteSet)) else [actual]
    if not equations or not all(isinstance(item, sp.Equality) for item in equations):
        raise UnsupportedNode("solve requires equation relation nodes")
    symbols = sorted(set().union(*(equation.free_symbols for equation in equations)), key=lambda symbol: symbol.name)
    if not symbols:
        raise UnsupportedNode("solve requires at least one symbol")
    normalized = [equation.lhs - equation.rhs for equation in equations]
    if len(symbols) == 1 and len(normalized) == 1:
        truth = sp.solveset(normalized[0], symbols[0], domain=sp.S.Reals)
        return truth == expected, truth
    raw = sp.nonlinsolve(normalized, symbols)
    if not isinstance(raw, sp.FiniteSet):
        raise UnsupportedNode("equation system did not produce a finite exact solution set")
    for solution in raw:
        values = list(solution) if isinstance(solution, sp.Tuple) else [solution]
        if len(values) != len(symbols):
            raise UnsupportedNode("equation system solution arity mismatch")
        if any(value.free_symbols or not _is_finite(value) or sp.ask(sp.Q.real(value)) is not True for value in values):
            raise UnsupportedNode("equation system produced non-finite or non-real solutions")
    return raw == expected, raw


def _natural(node: dict[str, Any], field: str) -> sp.Integer:
    value = exact_scalar(node, field)
    if value.is_Integer is not True or sp.ask(sp.Q.nonnegative(value)) is not True:
        raise ValueError(f"{field} must be a non-negative integer")
    return sp.Integer(value)


def _positive_place(node: dict[str, Any], field: str) -> int:
    value = int(_natural(node, field))
    if value < 1 or str(value)[0] != "1" or set(str(value)[1:]) - {"0"}:
        raise ValueError(f"{field} must be a positive power of ten")
    return value


def _round_half_up(value: int, place: int) -> sp.Integer:
    return sp.Integer(((value + place // 2) // place) * place)


def _integer_domain_check(check: dict[str, Any], actual: Any) -> tuple[bool, Any]:
    evidence = require_object(check.get("evidence"), "evidence")
    source = expression(check["sourceExpression"])
    mode = evidence.get("mode")
    if mode == "place-value":
        value = _natural(evidence["value"], "evidence.value")
        raw_parts = require_count(evidence.get("placeValues"), "evidence.placeValues", minimum=1)
        parts = [_natural(item, "evidence.placeValues") for item in raw_parts]
        decimal_parts = [str(int(item)) for item in parts]
        if any(part == "0" or part[0] == "0" or len(set(part.rstrip("0"))) != 1 or len(part.rstrip("0")) != 1 for part in decimal_parts):
            raise ValueError("place values must contain one non-zero digit followed by zeros")
        places = [len(part) - 1 for part in decimal_parts]
        if len(set(places)) != len(places):
            raise ValueError("place values must use distinct positions")
        truth = sp.Add(*parts)
        return equal(source, truth) and equal(actual, value) and equal(truth, value), truth
    if mode == "comparison":
        left = _natural(evidence["left"], "evidence.left")
        right = _natural(evidence["right"], "evidence.right")
        relations = {"lt": sp.Lt, "lte": sp.Le, "gt": sp.Gt, "gte": sp.Ge, "eq": sp.Eq}
        operator = evidence.get("operator")
        if operator not in relations:
            raise UnsupportedNode(f"unsupported comparison operator: {operator}")
        truth = relations[operator](left, right)
        return source == truth and actual == truth, truth
    if mode == "rounding":
        value = int(_natural(evidence["value"], "evidence.value"))
        place = _positive_place(evidence["place"], "evidence.place")
        if evidence.get("rule") != "half-up":
            raise UnsupportedNode("only half-up natural-number rounding is supported")
        truth = _round_half_up(value, place)
        expected_source = sp.Tuple(sp.Integer(value), sp.Integer(place))
        return source == expected_source and equal(actual, truth), truth
    if mode == "estimation":
        operands = [_natural(item, "evidence.operands") for item in require_count(evidence.get("operands"), "evidence.operands", minimum=2)]
        places = [_positive_place(item, "evidence.roundingPlaces") for item in require_count(evidence.get("roundingPlaces"), "evidence.roundingPlaces", minimum=2)]
        if len(operands) != len(places):
            raise ValueError("estimation operands and rounding places must align")
        rounded = [_round_half_up(int(value), place) for value, place in zip(operands, places)]
        operation = evidence.get("operation")
        if operation == "add":
            truth = sp.Add(*rounded)
        elif operation == "multiply":
            truth = sp.Mul(*rounded)
        elif operation == "subtract" and len(rounded) == 2 and rounded[0] >= rounded[1]:
            truth = rounded[0] - rounded[1]
        else:
            raise ValueError("estimation operation is unsupported or outside natural numbers")
        return source == sp.Tuple(*operands) and equal(actual, truth), truth
    if mode == "integer-operation":
        operands = [_natural(item, "evidence.operands") for item in require_count(evidence.get("operands"), "evidence.operands", minimum=2)]
        operation = evidence.get("operation")
        if operation == "add":
            truth = sp.Add(*operands)
        elif operation == "multiply":
            truth = sp.Mul(*operands)
        elif operation == "subtract" and len(operands) == 2 and operands[0] >= operands[1]:
            truth = operands[0] - operands[1]
        elif operation == "divide" and len(operands) == 2 and operands[1] > 0:
            quotient, remainder = divmod(int(operands[0]), int(operands[1]))
            truth = sp.Tuple(sp.Integer(quotient), sp.Integer(remainder))
        else:
            raise ValueError("integer operation is unsupported or outside natural numbers")
        expected_source = sp.Tuple(*operands) if operation == "divide" else ({"add": sp.Add, "multiply": sp.Mul}.get(operation, lambda left, right: left - right))(*operands)
        source_matches = source == expected_source if isinstance(expected_source, sp.Tuple) else equal(source, expected_source)
        return source_matches and (actual == truth if isinstance(truth, sp.Tuple) else equal(actual, truth)), truth
    if mode == "order-of-operations":
        truth = exact_scalar(evidence["sourceExpression"], "evidence.sourceExpression")
        if truth.is_Integer is not True or sp.ask(sp.Q.nonnegative(truth)) is not True:
            raise ValueError("order-of-operations result must be a natural number")
        return equal(source, truth) and equal(actual, truth), truth
    if mode == "arithmetic-law":
        operands = [_natural(item, "evidence.operands") for item in require_count(evidence.get("operands"), "evidence.operands", minimum=2, maximum=3)]
        law = evidence.get("law")
        if law == "commutative-add" and len(operands) == 2:
            left, right = operands[0] + operands[1], operands[1] + operands[0]
        elif law == "commutative-multiply" and len(operands) == 2:
            left, right = operands[0] * operands[1], operands[1] * operands[0]
        elif law == "associative-add" and len(operands) == 3:
            left, right = (operands[0] + operands[1]) + operands[2], operands[0] + (operands[1] + operands[2])
        elif law == "associative-multiply" and len(operands) == 3:
            left, right = (operands[0] * operands[1]) * operands[2], operands[0] * (operands[1] * operands[2])
        elif law == "distributive" and len(operands) == 3:
            left, right = operands[0] * (operands[1] + operands[2]), operands[0] * operands[1] + operands[0] * operands[2]
        else:
            raise ValueError("arithmetic-law operand count does not match the law")
        raw_claim = require_object(check.get("expression"), "expression")
        if raw_claim.get("kind") != "relation" or raw_claim.get("operator") != "eq":
            raise UnsupportedNode("arithmetic-law claims require an equality relation")
        claim_left = expression(raw_claim["left"])
        claim_right = expression(raw_claim["right"])
        truth = sp.Eq(left, right)
        return source == actual and equal(claim_left, left) and equal(claim_right, right) and truth is sp.true, truth
    if mode == "text-expression":
        values = [_natural(item, "evidence.values") for item in require_count(evidence.get("values"), "evidence.values", minimum=2, maximum=3)]
        template = evidence.get("template")
        if evidence.get("interpretationCount") != 1:
            raise ValueError("ambiguous text expressions are not verifiable")
        if template == "sum-of" and len(values) == 2:
            truth = values[0] + values[1]
        elif template == "difference-of" and len(values) == 2 and values[0] >= values[1]:
            truth = values[0] - values[1]
        elif template == "product-of" and len(values) == 2:
            truth = values[0] * values[1]
        elif template == "quotient-of" and len(values) == 2 and values[1] > 0:
            truth = values[0] / values[1]
        elif template == "add-then-multiply" and len(values) == 3:
            truth = (values[0] + values[1]) * values[2]
        elif template == "multiply-then-add" and len(values) == 3:
            truth = values[0] * values[1] + values[2]
        else:
            raise ValueError("text-expression template or values are outside the contract")
        return equal(source, truth) and equal(actual, truth), truth
    if mode == "substitution":
        variable_name = evidence.get("variable")
        if not isinstance(variable_name, str) or not variable_name:
            raise UnsupportedNode("substitution variable is required")
        declared_source = expression(evidence["sourceExpression"])
        variable = next((symbol for symbol in declared_source.free_symbols if symbol.name == variable_name), None)
        if variable is None or declared_source.free_symbols != {variable}:
            raise UnsupportedNode("substitution source must contain exactly the declared variable")
        value = _natural(evidence["value"], "evidence.value")
        truth = sp.simplify(declared_source.subs(variable, value))
        if truth.is_Integer is not True or sp.ask(sp.Q.nonnegative(truth)) is not True:
            raise ValueError("substitution result must be a natural number")
        return equal(source, declared_source) and equal(actual, truth), truth
    if mode == "divisibility":
        dividend = _natural(evidence["dividend"], "evidence.dividend")
        divisor = _natural(evidence["divisor"], "evidence.divisor")
        allowed = [_natural(item, "evidence.allowedDivisors") for item in require_count(evidence.get("allowedDivisors"), "evidence.allowedDivisors", minimum=1)]
        if divisor <= 0 or divisor not in allowed:
            raise ValueError("divisor is zero or outside the declared lesson scope")
        truth = sp.Integer(1 if int(dividend) % int(divisor) == 0 else 0)
        return source == sp.Tuple(dividend, divisor) and equal(actual, truth), truth
    if mode == "power":
        base = _natural(evidence["base"], "evidence.base")
        exponent = _natural(evidence["exponent"], "evidence.exponent")
        if base == 0 and exponent == 0:
            raise ValueError("0^0 is undefined in this lesson contract")
        truth = base ** exponent
        return equal(source, base ** exponent) and equal(actual, truth), truth
    raise UnsupportedNode(f"unsupported integer-domain mode: {mode}")


def _raw_rational(node: Any, field: str) -> tuple[int, int]:
    raw = require_object(node, field)
    if raw.get("kind") != "rational":
        raise UnsupportedNode(f"{field} must be an exact rational node")
    numerator = int(raw["numerator"])
    denominator = int(raw["denominator"])
    if denominator <= 0:
        raise ValueError(f"{field} denominator must be positive")
    return numerator, denominator


def _raw_decimal(node: Any, field: str) -> tuple[int, int]:
    raw = require_object(node, field)
    if raw.get("kind") != "decimal":
        raise UnsupportedNode(f"{field} must be an exact finite decimal node")
    scale = raw.get("scale")
    if not isinstance(scale, int) or isinstance(scale, bool) or scale < 0:
        raise ValueError(f"{field} scale must be a non-negative integer")
    return int(raw["unscaled"]), scale


def _fraction_decimal_check(check: dict[str, Any], actual: Any) -> tuple[bool, Any]:
    evidence = require_object(check.get("evidence"), "evidence")
    source = expression(check["sourceExpression"])
    mode = evidence.get("mode")
    if mode == "fraction-part":
        numerator, denominator = _raw_rational(evidence["fraction"], "evidence.fraction")
        visual = require_object(evidence.get("visual"), "evidence.visual")
        if visual.get("component") != "fraction-model":
            raise UnsupportedNode("fraction-part requires a fraction-model visual")
        total = int(visual.get("totalParts", 0))
        shaded = int(visual.get("shadedParts", -1))
        if total <= 0 or shaded < 0 or shaded > total:
            raise ValueError("fraction-model parts are outside the whole")
        truth = sp.Rational(shaded, total)
        declared = sp.Rational(numerator, denominator)
        return equal(declared, truth) and equal(source, declared) and equal(actual, truth), truth
    if mode == "fraction-notation":
        numerator, denominator = _raw_rational(evidence["fraction"], "evidence.fraction")
        declared_numerator = _natural(evidence["numerator"], "evidence.numerator")
        declared_denominator = _natural(evidence["denominator"], "evidence.denominator")
        if declared_denominator <= 0:
            raise ValueError("fraction denominator must be positive")
        truth = sp.Rational(numerator, denominator)
        return int(declared_numerator) == numerator and int(declared_denominator) == denominator and equal(source, truth) and equal(actual, truth), truth
    if mode == "number-line":
        truth = exact_scalar(evidence["value"], "evidence.value")
        visual = require_object(evidence.get("visual"), "evidence.visual")
        if visual.get("component") != "number-line":
            raise UnsupportedNode("number-line evidence requires a number-line visual")
        minimum = exact_scalar(visual["minimum"], "evidence.visual.minimum")
        maximum = exact_scalar(visual["maximum"], "evidence.visual.maximum")
        tick = exact_scalar(visual["tickStep"], "evidence.visual.tickStep")
        point = exact_scalar(visual["point"], "evidence.visual.point")
        label = exact_scalar(visual["label"], "evidence.visual.label")
        if sp.ask(sp.Q.gt(maximum, minimum)) is not True or sp.ask(sp.Q.gt(tick, 0)) is not True:
            raise ValueError("number-line bounds and tick spacing must be positive")
        grid_position = sp.simplify((point - minimum) / tick)
        on_grid = grid_position.is_Integer is True
        in_bounds = sp.ask(sp.Q.ge(point, minimum)) is True and sp.ask(sp.Q.le(point, maximum)) is True
        return on_grid and in_bounds and equal(point, label) and equal(point, truth) and equal(source, truth) and equal(actual, truth), truth
    if mode == "equivalence":
        left = exact_scalar(evidence["left"], "evidence.left")
        right = exact_scalar(evidence["right"], "evidence.right")
        truth = sp.Eq(left, right)
        return source == sp.Tuple(left, right) and actual == truth and truth is sp.true, truth
    if mode == "scale":
        source_numerator, source_denominator = _raw_rational(evidence["source"], "evidence.source")
        target_numerator, target_denominator = _raw_rational(evidence["target"], "evidence.target")
        factor = int(_natural(evidence["factor"], "evidence.factor"))
        if factor <= 1:
            raise ValueError("fraction scale factor must be greater than one")
        operation = evidence.get("operation")
        if operation == "expand":
            form_matches = target_numerator == source_numerator * factor and target_denominator == source_denominator * factor
        elif operation == "reduce":
            form_matches = source_numerator == target_numerator * factor and source_denominator == target_denominator * factor
        else:
            raise UnsupportedNode(f"unsupported fraction scale operation: {operation}")
        source_value = sp.Rational(source_numerator, source_denominator)
        target_value = sp.Rational(target_numerator, target_denominator)
        return form_matches and equal(source_value, target_value) and equal(source, source_value) and equal(actual, target_value), target_value
    if mode == "decimal-place-value":
        _, scale = _raw_decimal(evidence["value"], "evidence.value")
        if evidence.get("displayedScale") != scale:
            raise ValueError("displayed decimal scale does not match the exact value")
        value = exact_scalar(evidence["value"], "evidence.value")
        raw_parts = require_count(evidence.get("placeValues"), "evidence.placeValues", minimum=1)
        parts = [exact_scalar(item, "evidence.placeValues") for item in raw_parts]
        truth = sp.Add(*parts)
        return equal(truth, value) and equal(source, value) and equal(actual, value), truth
    if mode == "decimal-comparison":
        _raw_decimal(evidence["left"], "evidence.left")
        _raw_decimal(evidence["right"], "evidence.right")
        left = exact_scalar(evidence["left"], "evidence.left")
        right = exact_scalar(evidence["right"], "evidence.right")
        relations = {"lt": sp.Lt, "lte": sp.Le, "gt": sp.Gt, "gte": sp.Ge, "eq": sp.Eq}
        operator = evidence.get("operator")
        if operator not in relations:
            raise UnsupportedNode(f"unsupported decimal comparison operator: {operator}")
        truth = relations[operator](left, right)
        return source == truth and actual == truth, truth
    raise UnsupportedNode(f"unsupported fraction-decimal mode: {mode}")


def _unit_parts(unit: Any, field: str) -> tuple[sp.Rational, dict[str, int]]:
    raw = require_object(unit, field)
    scale_raw = require_object(raw.get("scale"), f"{field}.scale")
    scale = sp.Rational(int(scale_raw["numerator"]), int(scale_raw["denominator"]))
    if scale <= 0:
        raise ValueError(f"{field} scale must be positive")
    dimensions_raw = require_object(raw.get("dimensions"), f"{field}.dimensions")
    dimensions = {name: int(power) for name, power in dimensions_raw.items() if int(power) != 0}
    if not dimensions:
        raise ValueError(f"{field} dimensions must be explicit")
    return scale, dimensions


def _point(raw: Any, field: str) -> tuple[sp.Expr, sp.Expr]:
    value = require_object(raw, field)
    return exact_scalar(value["x"], f"{field}.x"), exact_scalar(value["y"], f"{field}.y")


def _direction(raw: Any, field: str) -> tuple[sp.Expr, sp.Expr]:
    line = require_object(raw, field)
    start = _point(line["from"], f"{field}.from")
    end = _point(line["to"], f"{field}.to")
    direction = (sp.simplify(end[0] - start[0]), sp.simplify(end[1] - start[1]))
    if equal(direction[0], 0) and equal(direction[1], 0):
        raise ValueError(f"{field} endpoints must differ")
    return direction


def _geometry_measurement_check(check: dict[str, Any], actual: Any) -> tuple[bool, Any]:
    evidence = require_object(check.get("evidence"), "evidence")
    source = expression(check["sourceExpression"])
    mode = evidence.get("mode")
    if mode == "unit-conversion":
        conversions = require_count(evidence.get("conversions"), "evidence.conversions", minimum=1)
        source_values: list[sp.Expr] = []
        target_values: list[sp.Expr] = []
        valid = True
        for index, item in enumerate(conversions):
            conversion = require_object(item, f"evidence.conversions.{index}")
            source_value = exact_scalar(conversion["sourceValue"], "sourceValue")
            target_value = exact_scalar(conversion["targetValue"], "targetValue")
            source_scale, source_dimensions = _unit_parts(conversion["sourceUnit"], "sourceUnit")
            target_scale, target_dimensions = _unit_parts(conversion["targetUnit"], "targetUnit")
            valid = valid and source_dimensions == target_dimensions and equal(source_value * source_scale, target_value * target_scale)
            source_values.append(source_value)
            target_values.append(target_value)
        truth = sp.Tuple(*target_values)
        return valid and source == sp.Tuple(*source_values) and actual == truth, truth
    if mode == "rectangle-measure":
        width = exact_scalar(evidence["width"], "evidence.width")
        height = exact_scalar(evidence["height"], "evidence.height")
        if sp.ask(sp.Q.gt(width, 0)) is not True or sp.ask(sp.Q.gt(height, 0)) is not True:
            raise ValueError("rectangle dimensions must be positive")
        length_scale, length_dimensions = _unit_parts(evidence["lengthUnit"], "evidence.lengthUnit")
        result_scale, result_dimensions = _unit_parts(evidence["resultUnit"], "evidence.resultUnit")
        visual = require_object(evidence.get("visual"), "evidence.visual")
        visual_valid = evidence.get("width") == visual.get("width") and evidence.get("height") == visual.get("height") and visual.get("scaleMode") == "not-to-scale" and visual.get("visibleLabel") == "nicht maßstabsgetreu" and len(require_count(visual.get("colorIndependentCues"), "visual.colorIndependentCues", minimum=1)) > 0
        if length_dimensions != {"length": 1}:
            raise ValueError("rectangle input unit must have length dimension")
        if evidence.get("quantity") == "perimeter":
            truth = 2 * (width + height)
            units_valid = result_dimensions == {"length": 1} and result_scale == length_scale
        elif evidence.get("quantity") == "area":
            truth = width * height
            units_valid = result_dimensions == {"length": 2} and result_scale == length_scale ** 2
        else:
            raise UnsupportedNode("unsupported rectangle quantity")
        return visual_valid and units_valid and source == sp.Tuple(width, height) and equal(actual, truth), truth
    if mode == "spatial-relations":
        entities = set(require_count(evidence.get("entities"), "evidence.entities", minimum=1))
        if entities - {"point", "segment", "line"} or entities != {"point", "segment", "line"}:
            raise ValueError("spatial relation contract must distinguish point, segment, and line")
        lines = require_count(evidence.get("lines"), "evidence.lines", minimum=2, maximum=2)
        first = _direction(lines[0], "evidence.lines.0")
        second = _direction(lines[1], "evidence.lines.1")
        relation = evidence.get("relation")
        if relation == "parallel":
            valid = equal(first[0] * second[1] - first[1] * second[0], 0)
        elif relation == "perpendicular":
            valid = equal(first[0] * second[0] + first[1] * second[1], 0)
        else:
            raise UnsupportedNode("unsupported spatial relation")
        truth = sp.Integer(1 if valid else 0)
        return source == truth and equal(actual, truth), truth
    if mode == "angle":
        degrees = int(_natural(evidence["degrees"], "evidence.degrees"))
        if degrees <= 0 or degrees > 180:
            raise ValueError("angle must be greater than zero and at most 180 degrees")
        expected_type = "acute" if degrees < 90 else "right" if degrees == 90 else "obtuse" if degrees < 180 else "straight"
        if evidence.get("angleType") != expected_type:
            raise ValueError("angle type does not match its exact measure")
        rays = require_count(evidence.get("rays"), "evidence.rays", minimum=2, maximum=2)
        first = _direction(rays[0], "evidence.rays.0")
        second = _direction(rays[1], "evidence.rays.1")
        dot = sp.simplify(first[0] * second[0] + first[1] * second[1])
        cross = sp.simplify(first[0] * second[1] - first[1] * second[0])
        supported = {(1, 0, 1, 1): 45, (1, 0, 0, 1): 90, (1, 0, -1, 1): 135, (1, 0, -1, 0): 180}
        vector_key = tuple(int(value) for value in (*first, *second))
        if supported.get(vector_key) != degrees or (degrees < 180 and equal(cross, 0)) or (expected_type == "right" and not equal(dot, 0)):
            raise ValueError("angle rays contradict or do not exactly support the claimed measure")
        truth = sp.Integer(degrees)
        return equal(source, truth) and equal(actual, truth), truth
    if mode == "polygon-classification":
        vertices = [_point(item, "evidence.vertices") for item in require_count(evidence.get("vertices"), "evidence.vertices", minimum=3, maximum=4)]
        edges = [(vertices[(index + 1) % len(vertices)][0] - point[0], vertices[(index + 1) % len(vertices)][1] - point[1]) for index, point in enumerate(vertices)]
        lengths = [sp.simplify(x * x + y * y) for x, y in edges]
        right = lambda left, other: equal(left[0] * other[0] + left[1] * other[1], 0)
        parallel = lambda left, other: equal(left[0] * other[1] - left[1] * other[0], 0)
        classification = evidence.get("classification")
        if len(vertices) == 3 and classification == "right-triangle":
            valid = any(right(edges[index - 1], edges[index]) for index in range(3))
        elif len(vertices) == 3 and classification == "isosceles-triangle":
            valid = len({sp.sstr(length) for length in lengths}) < 3
        elif len(vertices) == 4:
            opposite_parallel = parallel(edges[0], edges[2]) and parallel(edges[1], edges[3])
            all_right = all(right(edges[index - 1], edges[index]) for index in range(4))
            all_equal = len({sp.sstr(length) for length in lengths}) == 1
            valid = (classification == "square" and opposite_parallel and all_right and all_equal) or (classification == "rectangle" and opposite_parallel and all_right and not all_equal) or (classification == "parallelogram" and opposite_parallel and not all_right)
        else:
            valid = False
        truth = sp.Integer(1 if valid else 0)
        return source == truth and equal(actual, truth), truth
    if mode == "axial-symmetry":
        axis = exact_scalar(evidence["axisX"], "evidence.axisX")
        pairs = require_count(evidence.get("pairs"), "evidence.pairs", minimum=1)
        valid = True
        for item in pairs:
            pair = require_object(item, "evidence.pairs")
            left, right = _point(pair["left"], "pair.left"), _point(pair["right"], "pair.right")
            valid = valid and equal(left[1], right[1]) and equal((left[0] + right[0]) / 2, axis)
        truth = sp.Integer(1 if valid else 0)
        return source == truth and equal(actual, truth), truth
    if mode == "net-validity":
        faces = require_count(evidence.get("faces"), "evidence.faces", minimum=6, maximum=6)
        cells = [(int(require_object(face, "face")["x"]), int(require_object(face, "face")["y"])) for face in faces]
        labels = [require_object(face, "face").get("faceLabel") for face in faces]
        if len(set(cells)) != 6 or len(set(labels)) != 6:
            raise ValueError("net faces and labels must be unique")
        orientations = {cells[0]: ((1, 0, 0), (0, 1, 0), (0, 0, 1))}
        queue = [cells[0]]
        def neg(vector: tuple[int, int, int]) -> tuple[int, int, int]: return tuple(-value for value in vector)
        while queue:
            cell = queue.pop(0)
            right, up, normal = orientations[cell]
            transforms = {(1, 0): (neg(normal), up, right), (-1, 0): (normal, up, neg(right)), (0, 1): (right, neg(normal), up), (0, -1): (right, normal, neg(up))}
            for delta, orientation in transforms.items():
                neighbor = (cell[0] + delta[0], cell[1] + delta[1])
                if neighbor not in cells:
                    continue
                if neighbor in orientations and orientations[neighbor] != orientation:
                    return False, sp.Integer(0)
                if neighbor not in orientations:
                    orientations[neighbor] = orientation
                    queue.append(neighbor)
        valid = len(orientations) == 6 and len({orientation[2] for orientation in orientations.values()}) == 6
        truth = sp.Integer(1 if valid else 0)
        return source == truth and equal(actual, truth), truth
    if mode in ("unit-cube-volume", "cuboid-volume"):
        length = _natural(evidence["length"], "evidence.length")
        width = _natural(evidence["width"], "evidence.width")
        height = _natural(evidence["height"], "evidence.height")
        if min(length, width, height) <= 0:
            raise ValueError("volume dimensions must be positive")
        truth = length * width * height
        valid = source == sp.Tuple(length, width, height)
        if mode == "unit-cube-volume":
            valid = valid and equal(exact_scalar(evidence["cubeCount"], "evidence.cubeCount"), truth)
        else:
            length_scale, length_dimensions = _unit_parts(evidence["lengthUnit"], "evidence.lengthUnit")
            result_scale, result_dimensions = _unit_parts(evidence["resultUnit"], "evidence.resultUnit")
            visual = require_object(evidence.get("visual"), "evidence.visual")
            valid = valid and length_dimensions == {"length": 1} and result_dimensions == {"length": 3} and result_scale == length_scale ** 3 and visual.get("scaleMode") == "not-to-scale" and visual.get("visibleLabel") == "nicht maßstabsgetreu"
        return valid and equal(actual, truth), truth
    raise UnsupportedNode(f"unsupported geometry-measurement mode: {mode}")


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _validated_dataset(raw: Any) -> tuple[list[str], list[sp.Integer]]:
    dataset = require_object(raw, "evidence.dataset")
    payload = {key: value for key, value in dataset.items() if key != "datasetHash"}
    expected_hash = hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()
    if dataset.get("datasetHash") != expected_hash:
        raise ValueError("dataset hash does not match its structured source values")
    if dataset.get("duplicatePolicy") != "reject" or not isinstance(dataset.get("unitLabel"), str) or not dataset.get("unitLabel"):
        raise ValueError("dataset duplicate policy and unit label must be explicit")
    categories_raw = require_count(dataset.get("categories"), "dataset.categories", minimum=1)
    categories: list[str] = []
    counts: list[sp.Integer] = []
    for index, item in enumerate(categories_raw):
        category = require_object(item, f"dataset.categories.{index}")
        label = category.get("category")
        if not isinstance(label, str) or not label:
            raise ValueError("dataset category labels must be non-empty")
        count = _natural(category["count"], f"dataset.categories.{index}.count")
        groups = require_count(category.get("tallyGroups"), f"dataset.categories.{index}.tallyGroups", minimum=0)
        if any(not isinstance(group, int) or isinstance(group, bool) or group < 1 or group > 5 for group in groups):
            raise ValueError("tally groups must contain between one and five strokes")
        if groups and any(group != 5 for group in groups[:-1]):
            raise ValueError("only the final tally group may contain fewer than five strokes")
        if sum(groups) != int(count):
            raise ValueError("tally groups do not match their category total")
        categories.append(label)
        counts.append(count)
    if len(set(categories)) != len(categories):
        raise ValueError("duplicate dataset categories require explicit aggregation outside this contract")
    raw_values = require_count(dataset.get("rawValues"), "dataset.rawValues", minimum=1)
    if any(not isinstance(value, str) or value not in categories for value in raw_values):
        raise ValueError("raw values contain an unknown category")
    raw_counts = {category: raw_values.count(category) for category in categories}
    if any(raw_counts[category] != int(count) for category, count in zip(categories, counts)):
        raise ValueError("raw list and category totals disagree")
    if max(counts) == 0:
        raise ValueError("zero-only datasets cannot define a meaningful Class 5 chart")
    return categories, counts


def _data_diagram_check(check: dict[str, Any], actual: Any) -> tuple[bool, Any]:
    evidence = require_object(check.get("evidence"), "evidence")
    source = expression(check["sourceExpression"])
    categories, counts = _validated_dataset(evidence.get("dataset"))
    mode = evidence.get("mode")
    if mode == "tally-list":
        truth = sp.Add(*counts)
        expected = _natural(evidence["expectedTotal"], "evidence.expectedTotal")
        order = require_count(evidence.get("derivedOrder"), "evidence.derivedOrder", minimum=1)
        maximum = max(counts)
        maximum_categories = [category for category, count in zip(categories, counts) if count == maximum]
        if len(maximum_categories) != 1:
            raise ValueError("maximum category is ambiguous")
        valid = order == categories and evidence.get("maximumCategory") == maximum_categories[0]
        return valid and source == sp.Tuple(*counts) and equal(expected, truth) and equal(actual, truth), truth
    if mode == "bar-chart":
        chart = require_object(evidence.get("chart"), "evidence.chart")
        origin = _natural(chart["axisOrigin"], "chart.axisOrigin")
        maximum = _natural(chart["axisMaximum"], "chart.axisMaximum")
        tick = _natural(chart["tickInterval"], "chart.tickInterval")
        if origin != 0:
            raise ValueError("Class 5 count charts must start at zero")
        if maximum <= 0 or tick <= 0 or int(maximum) % int(tick) != 0 or maximum < max(counts):
            raise ValueError("chart axis is truncated or has inconsistent tick spacing")
        if chart.get("unitLabel") != require_object(evidence.get("dataset"), "dataset").get("unitLabel"):
            raise ValueError("chart unit label does not match the dataset")
        order = require_count(chart.get("categoryOrder"), "chart.categoryOrder", minimum=1)
        bars = require_count(chart.get("bars"), "chart.bars", minimum=1)
        if order != categories or len(bars) != len(categories):
            raise ValueError("chart omits, duplicates, or reorders a dataset category")
        for index, (bar_raw, category, count) in enumerate(zip(bars, categories, counts)):
            bar = require_object(bar_raw, f"chart.bars.{index}")
            if bar.get("category") != category or not equal(exact_scalar(bar["height"], "bar.height"), count):
                raise ValueError("bar label or height does not match the dataset")
        accessible = require_object(chart.get("accessibleEncoding"), "chart.accessibleEncoding")
        if not accessible.get("colorIndependentCue") or accessible.get("visibleValueLabels") is not True:
            raise ValueError("chart distinctions cannot rely on color alone")
        truth = max(counts)
        expected = _natural(evidence["expectedMaximum"], "evidence.expectedMaximum")
        return source == sp.Tuple(*counts) and equal(expected, truth) and equal(actual, truth), truth
    raise UnsupportedNode(f"unsupported data-diagram mode: {mode}")


def run_check(check: dict[str, Any]) -> dict[str, Any]:
    check_id = check.get("checkId", "unknown")
    kind = check.get("kind")
    if kind not in SUPPORTED:
        return _result(check_id, "unsupported", errorCode="UNSUPPORTED_CHECK")
    try:
        actual = expression(check["expression"])
        if kind == "integer-domain":
            passed, truth = _integer_domain_check(check, actual)
            return _result(check_id, "passed" if passed else "failed", sp.sstr(truth), sp.sstr(actual), **({} if passed else {"errorCode": "VALUE_MISMATCH"}))
        if kind == "fraction-decimal-domain":
            passed, truth = _fraction_decimal_check(check, actual)
            return _result(check_id, "passed" if passed else "failed", sp.sstr(truth), sp.sstr(actual), **({} if passed else {"errorCode": "VALUE_MISMATCH"}))
        if kind == "geometry-measurement-domain":
            passed, truth = _geometry_measurement_check(check, actual)
            return _result(check_id, "passed" if passed else "failed", sp.sstr(truth), sp.sstr(actual), **({} if passed else {"errorCode": "VALUE_MISMATCH"}))
        if kind == "data-diagram-domain":
            passed, truth = _data_diagram_check(check, actual)
            return _result(check_id, "passed" if passed else "failed", sp.sstr(truth), sp.sstr(actual), **({} if passed else {"errorCode": "VALUE_MISMATCH"}))
        expected = expected_expression(check["expected"])
        truth = expected
        if kind == "equivalent":
            secondary = expression(check.get("secondaryExpression", check["expected"]["expression"]))
            passed = equal(actual, secondary)
        elif kind == "solve":
            passed, truth = _solve_check(check, actual, expected)
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
