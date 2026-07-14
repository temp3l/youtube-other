import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import type { VerificationCheck } from "../domain/index.js";
import { loadAllNumberOperationsStandardContent } from "../lesson/number-operations-standard-content.js";
import { buildLessonVariant } from "../lesson/variant-builder.js";
import { assertFactCoverage } from "./fact-coverage-gate.js";
import {
  createVerifierRequest,
  MathVerifierBoundaryError,
  SympyVerifierAdapter,
} from "./sympy-adapter.js";

type IntegerDomainCheck = Extract<
  VerificationCheck,
  { kind: "integer-domain" }
>;

const pythonExecutable =
  process.env["MATH_VERIFIER_PYTHON"] ??
  path.resolve("python/math-verifier/.venv/bin/python");
const integer = (value: string) => ({ kind: "integer" as const, value });
const tuple = (...items: ReturnType<typeof integer>[]) => ({
  kind: "tuple" as const,
  items,
});
const power = (
  left: ReturnType<typeof integer>,
  right: ReturnType<typeof integer>
) => ({ kind: "power" as const, left, right });

async function expectBlocked(
  adapter: SympyVerifierAdapter,
  requestId: string,
  check: VerificationCheck
) {
  try {
    await adapter.verify(createVerifierRequest(requestId, [check]));
    throw new Error("Expected verifier to block the adversarial claim.");
  } catch (error) {
    expect(error).toBeInstanceOf(MathVerifierBoundaryError);
    expect((error as MathVerifierBoundaryError).code).toBe(
      "VERIFICATION_BLOCKED"
    );
  }
}

describe("number and operations verifier v3", () => {
  it("independently verifies all sixteen contracts and rejects domain attacks", async () => {
    const adapter = new SympyVerifierAdapter({
      workerRoot: "python/math-verifier",
      pythonExecutable,
    });
    const release = await loadCurriculumRelease(
      "packages/math-education/data/curriculum/v1"
    );
    const specifications = loadAllNumberOperationsStandardContent();

    for (const specification of specifications) {
      const response = await adapter.verify(
        createVerifierRequest(
          `${specification.skillId.toLowerCase()}-standard-contract`,
          specification.checks
        )
      );
      expect(response.status).toBe("passed");
      const skill = release.skills.find(
        (candidate) => candidate.skillId === specification.skillId
      )!;
      expect(() =>
        assertFactCoverage(buildLessonVariant(skill, "standard"), response)
      ).not.toThrow();
    }

    const bySkill = new Map(
      specifications.map((item) => [item.skillId, item.checks[0]!])
    );
    const claimed = (
      skillId: string,
      expression: IntegerDomainCheck["expression"]
    ) => ({
      ...(structuredClone(bySkill.get(skillId)!) as Extract<
        VerificationCheck,
        { kind: "integer-domain" }
      >),
      expression,
    });

    await expectBlocked(
      adapter,
      "carry-error",
      claimed("M5-ZO-005", integer("72824"))
    );
    await expectBlocked(
      adapter,
      "borrow-error",
      claimed("M5-ZO-006", integer("42328"))
    );
    await expectBlocked(
      adapter,
      "remainder-error",
      claimed("M5-ZO-008", tuple(integer("411"), integer("13")))
    );
    await expectBlocked(
      adapter,
      "precedence-error",
      claimed("M5-ZO-009", integer("96"))
    );
    await expectBlocked(
      adapter,
      "false-divisibility",
      claimed("M5-ZO-014", integer("0"))
    );

    const rounding = structuredClone(bySkill.get("M5-ZO-003")!) as Extract<
      VerificationCheck,
      { kind: "integer-domain" }
    >;
    if (rounding.evidence.mode !== "rounding") throw new Error("test setup");
    rounding.sourceExpression = tuple(integer("7462"), integer("25"));
    rounding.evidence.place = integer("25");
    await expectBlocked(adapter, "invalid-rounding-place", rounding);

    const outOfScope = structuredClone(bySkill.get("M5-ZO-014")!) as Extract<
      VerificationCheck,
      { kind: "integer-domain" }
    >;
    if (outOfScope.evidence.mode !== "divisibility")
      throw new Error("test setup");
    outOfScope.sourceExpression = tuple(integer("3470"), integer("7"));
    outOfScope.evidence.divisor = integer("7");
    await expectBlocked(adapter, "out-of-scope-divisor", outOfScope);

    const negative = structuredClone(bySkill.get("M5-ZO-005")!) as Extract<
      VerificationCheck,
      { kind: "integer-domain" }
    >;
    if (negative.evidence.mode !== "integer-operation")
      throw new Error("test setup");
    negative.evidence.operands[0] = integer("-1");
    await expectBlocked(adapter, "negative-natural", negative);

    const zeroPower: Extract<VerificationCheck, { kind: "integer-domain" }> = {
      checkId: "check-zero-power",
      kind: "integer-domain",
      sourceExpression: power(integer("0"), integer("0")),
      expression: integer("1"),
      evidence: { mode: "power", base: integer("0"), exponent: integer("0") },
      critical: true,
    };
    await expectBlocked(adapter, "zero-power", zeroPower);

    const ambiguous = structuredClone(bySkill.get("M5-ZO-011")!) as unknown as {
      evidence: { interpretationCount: number };
    };
    ambiguous.evidence.interpretationCount = 2;
    expect(() =>
      createVerifierRequest("ambiguous-text", [ambiguous as never])
    ).toThrow();
  }, 30_000);
});
