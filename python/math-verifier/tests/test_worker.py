import pytest

from math_verifier.worker import canonical_hash, process


def request(checks):
    payload = {"protocolVersion": "math-verifier.v3", "requestId": "test-1", "mathSpecVersion": "math-spec.v3", "checks": checks}
    return {**payload, "inputHash": canonical_hash(payload)}


def scalar(value):
    return {"kind": "scalar", "expression": {"kind": "integer", "value": value}}


def test_evaluate_and_equivalent():
    addition = {"kind": "sum", "operands": [{"kind": "integer", "value": "2"}, {"kind": "rational", "numerator": "2", "denominator": "2"}]}
    response = process(request([{"checkId": "check-add", "kind": "evaluate", "expression": addition, "expected": scalar("3"), "critical": True}]))
    assert response["status"] == "passed"


def test_unknown_check_is_never_passed():
    response = process(request([{"checkId": "check-future", "kind": "future-check", "expression": {"kind": "integer", "value": "1"}, "expected": scalar("1"), "critical": True}]))
    assert response["status"] == "unsupported"


def test_protocol_v2_is_explicitly_rejected_after_domain_contract_migration():
    payload = {"protocolVersion": "math-verifier.v2", "requestId": "legacy", "mathSpecVersion": "math-spec.v2", "checks": []}
    with pytest.raises(ValueError, match="protocol version"):
        process({**payload, "inputHash": canonical_hash(payload)})


def test_input_hash_mismatch_is_rejected_before_any_check_passes():
    payload = {"protocolVersion": "math-verifier.v3", "requestId": "tampered", "mathSpecVersion": "math-spec.v3", "checks": [{"checkId": "check-add", "kind": "evaluate", "expression": {"kind": "integer", "value": "1"}, "expected": scalar("1"), "critical": True}]}
    with pytest.raises(ValueError, match="input hash mismatch"):
        process({**payload, "inputHash": "0" * 64})


def test_solve_and_same_unit_measurement():
    symbol = {"kind": "symbol", "name": "x"}
    equation = {"kind": "relation", "operator": "eq", "left": {"kind": "sum", "operands": [symbol, {"kind": "integer", "value": "-2"}]}, "right": {"kind": "integer", "value": "0"}}
    unit = {"symbol": "m", "scale": {"numerator": "1", "denominator": "1"}, "dimensions": {"length": 1}}
    checks = [
        {"checkId": "check-solve", "kind": "solve", "expression": equation, "expected": {"kind": "finite-set", "values": [scalar("2")]}, "critical": True},
        {"checkId": "check-unit", "kind": "unit-dimension", "expression": {"kind": "integer", "value": "2"}, "expected": {"kind": "measurement", "value": {"kind": "integer", "value": "2"}, "unit": unit}, "actualUnit": unit, "critical": True},
    ]
    assert process(request(checks))["status"] == "passed"


def test_equation_system_is_verified_independently():
    x = {"kind": "symbol", "name": "x"}
    y = {"kind": "symbol", "name": "y"}
    equations = {"kind": "tuple", "items": [
        {"kind": "relation", "operator": "eq", "left": {"kind": "sum", "operands": [x, y]}, "right": {"kind": "integer", "value": "7"}},
        {"kind": "relation", "operator": "eq", "left": {"kind": "sum", "operands": [x, {"kind": "negate", "operand": y}]}, "right": {"kind": "integer", "value": "1"}},
    ]}
    expected = {"kind": "finite-set", "values": [{"kind": "tuple", "values": [scalar("4"), scalar("3")]}]}
    check = {"checkId": "check-system", "kind": "solve", "expression": equations, "expected": expected, "solutionDomain": "real", "critical": True}
    response = process(request([check]))
    assert response["status"] == "passed"


def test_underdetermined_equation_system_is_unsupported():
    x = {"kind": "symbol", "name": "x"}
    y = {"kind": "symbol", "name": "y"}
    equation = {"kind": "tuple", "items": [{"kind": "relation", "operator": "eq", "left": {"kind": "sum", "operands": [x, y]}, "right": {"kind": "integer", "value": "2"}}]}
    check = {"checkId": "check-system", "kind": "solve", "expression": equation, "expected": {"kind": "finite-set", "values": []}, "solutionDomain": "real", "critical": True}
    response = process(request([check]))
    assert response["status"] == "unsupported"
