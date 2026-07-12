import pytest

from math_verifier.worker import canonical_hash, process


def integer(value):
    return {"kind": "integer", "value": str(value)}


def rational(numerator, denominator):
    return {"kind": "rational", "numerator": str(numerator), "denominator": str(denominator)}


def scalar(expression):
    return {"kind": "scalar", "expression": expression}


def request(check):
    payload = {"protocolVersion": "math-verifier.v2", "requestId": "domain-test", "mathSpecVersion": "math-spec.v2", "checks": [check]}
    return {**payload, "inputHash": canonical_hash(payload)}


def result(check):
    return process(request(check))["checks"][0]


def unit(symbol, numerator, denominator, dimensions):
    return {"symbol": symbol, "scale": {"numerator": str(numerator), "denominator": str(denominator)}, "dimensions": dimensions}


@pytest.mark.parametrize(
    ("actual_value", "actual_unit", "expected_value", "expected_unit", "status"),
    [
        (100, unit("cm", 1, 100, {"length": 1}), 1, unit("m", 1, 1, {"length": 1}), "passed"),
        (1, unit("km", 1000, 1, {"length": 1}), 1000, unit("m", 1, 1, {"length": 1}), "passed"),
        (100, unit("cm", 1, 100, {"length": 1}), 2, unit("m", 1, 1, {"length": 1}), "failed"),
        (1, unit("s", 1, 1, {"time": 1}), 1, unit("m", 1, 1, {"length": 1}), "failed"),
    ],
)
def test_unit_conversion_matrix(actual_value, actual_unit, expected_value, expected_unit, status):
    check = {
        "checkId": "check-unit",
        "kind": "unit-dimension",
        "expression": integer(actual_value),
        "expected": {"kind": "measurement", "value": integer(expected_value), "unit": expected_unit},
        "actualUnit": actual_unit,
        "critical": True,
    }
    assert result(check)["status"] == status


def graph_check(mode, expression, expected, **evidence):
    symbol = {"kind": "symbol", "name": "x"}
    function = {"kind": "sum", "operands": [{"kind": "product", "operands": [integer(2), symbol]}, integer(1)]}
    return {
        "checkId": "check-graph",
        "kind": "graph-point",
        "expression": expression,
        "expected": scalar(expected),
        "graph": {
            "mode": mode,
            "function": function,
            "variable": "x",
            "domain": {"kind": "interval", "minimum": integer(0), "maximum": integer(10), "minimumInclusive": True, "maximumInclusive": True},
            **evidence,
        },
        "critical": True,
    }


def test_graph_point_and_slope_are_derived_from_function_and_points():
    point = graph_check("point", integer(7), integer(7), point={"x": integer(3), "y": integer(7)})
    slope = graph_check("slope", integer(2), integer(2), **{"from": {"x": integer(1), "y": integer(3)}, "to": {"x": integer(4), "y": integer(9)}})
    assert result(point)["status"] == "passed"
    assert result(slope)["status"] == "passed"


@pytest.mark.parametrize(
    "check",
    [
        graph_check("point", integer(8), integer(8), point={"x": integer(3), "y": integer(8)}),
        graph_check("point", integer(25), integer(25), point={"x": integer(12), "y": integer(25)}),
        graph_check("slope", integer(3), integer(3), **{"from": {"x": integer(1), "y": integer(3)}, "to": {"x": integer(4), "y": integer(9)}}),
    ],
)
def test_false_graph_claims_fail_even_when_expected_matches(check):
    assert result(check)["status"] == "failed"


@pytest.mark.parametrize(
    ("entity", "formula", "parameters", "assumptions", "truth"),
    [
        ("rectangle", "rectangle-area", {"width": integer(4), "height": integer(5)}, ["width-positive", "height-positive"], integer(20)),
        ("triangle", "triangle-area", {"base": integer(6), "height": integer(3)}, ["base-positive", "height-positive", "perpendicular-height"], integer(9)),
        ("circle", "circle-circumference", {"radius": integer(3)}, ["radius-positive"], {"kind": "product", "operands": [integer(6), {"kind": "constant", "name": "pi"}]}),
        ("right-triangle", "pythagorean-hypotenuse", {"legA": integer(3), "legB": integer(4)}, ["leg-a-positive", "leg-b-positive", "right-angle"], integer(5)),
    ],
)
def test_geometry_formulas(entity, formula, parameters, assumptions, truth):
    check = {"checkId": "check-geometry", "kind": "geometry", "expression": truth, "expected": scalar(truth), "geometry": {"entity": entity, "formula": formula, "parameters": parameters, "assumptions": assumptions}, "critical": True}
    assert result(check)["status"] == "passed"


def test_geometry_requires_matching_entity_formula_and_assumptions():
    false_value = integer(21)
    check = {"checkId": "check-geometry", "kind": "geometry", "expression": false_value, "expected": scalar(false_value), "geometry": {"entity": "rectangle", "formula": "rectangle-area", "parameters": {"width": integer(4), "height": integer(5)}, "assumptions": ["width-positive"]}, "critical": True}
    assert result(check)["status"] == "unsupported"


@pytest.mark.parametrize(
    ("rule", "inputs", "truth"),
    [
        ("single", [rational(1, 3)], rational(1, 3)),
        ("sum", [rational(1, 4), rational(1, 2)], rational(3, 4)),
        ("path-product", [rational(1, 2), rational(1, 3)], rational(1, 6)),
        ("complement", [rational(1, 4)], rational(3, 4)),
        ("normalization", [rational(1, 4), rational(3, 4)], integer(1)),
    ],
)
def test_probability_rules(rule, inputs, truth):
    check = {"checkId": "check-probability", "kind": "probability", "expression": truth, "expected": scalar(truth), "probability": {"rule": rule, "inputs": inputs}, "critical": True}
    assert result(check)["status"] == "passed"


@pytest.mark.parametrize(
    ("rule", "inputs", "claimed"),
    [
        ("single", [rational(3, 2)], rational(3, 2)),
        ("sum", [rational(3, 4), rational(3, 4)], rational(3, 2)),
        ("normalization", [rational(1, 4), rational(1, 2)], rational(3, 4)),
        ("path-product", [rational(1, 2), rational(1, 2)], rational(1, 2)),
    ],
)
def test_probability_bounds_normalization_and_false_expected_attacks(rule, inputs, claimed):
    check = {"checkId": "check-probability", "kind": "probability", "expression": claimed, "expected": scalar(claimed), "probability": {"rule": rule, "inputs": inputs}, "critical": True}
    assert result(check)["status"] == "failed"


@pytest.mark.parametrize(
    "check",
    [
        {"checkId": "check-graph", "kind": "graph-point", "expression": integer(1), "expected": scalar(integer(1)), "critical": True},
        {"checkId": "check-probability", "kind": "probability", "expression": integer(1), "expected": scalar(integer(1)), "probability": {"rule": "future", "inputs": [integer(1)]}, "critical": True},
        {"checkId": "check-zero", "kind": "evaluate", "expression": {"kind": "quotient", "left": integer(1), "right": integer(0)}, "expected": scalar(integer(0)), "critical": True},
    ],
)
def test_malformed_unsupported_and_division_by_zero_never_pass(check):
    assert result(check)["status"] != "passed"
