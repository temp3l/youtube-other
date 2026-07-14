import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VerificationCheck } from "../domain/index.js";
import { loadAllFractionsDecimalsStandardContent } from "../lesson/fractions-decimals-standard-content.js";
import { createVerifierRequest, MathVerifierBoundaryError, SympyVerifierAdapter } from "./sympy-adapter.js";

type FractionDecimalCheck = Extract<VerificationCheck, { kind: "fraction-decimal-domain" }>;
const integer = (value: string) => ({ kind: "integer" as const, value });
const rational = (numerator: string, denominator: string) => ({ kind: "rational" as const, numerator, denominator });
const decimal = (unscaled: string, scale: number) => ({ kind: "decimal" as const, unscaled, scale });
const pythonExecutable = process.env["MATH_VERIFIER_PYTHON"] ?? path.resolve("python/math-verifier/.venv/bin/python");

async function expectBlocked(adapter: SympyVerifierAdapter, requestId: string, check: VerificationCheck) {
  await expect(adapter.verify(createVerifierRequest(requestId, [check]))).rejects.toMatchObject<MathVerifierBoundaryError>({ code: "VERIFICATION_BLOCKED" });
}

describe("fractions and decimals verifier v3", () => {
  it("verifies all exact contracts and blocks altered forms, facts, and visuals", async () => {
    const adapter = new SympyVerifierAdapter({ workerRoot: "python/math-verifier", pythonExecutable });
    const specifications = loadAllFractionsDecimalsStandardContent();
    for (const specification of specifications) {
      const response = await adapter.verify(createVerifierRequest(`${specification.skillId.toLowerCase()}-standard-contract`, specification.checks));
      expect(response.status).toBe("passed");
    }
    const bySkill = new Map(specifications.map((item) => [item.skillId, item.checks[0]! as FractionDecimalCheck]));

    const shading = structuredClone(bySkill.get("M5-ZO-017")!);
    if (shading.evidence.mode !== "fraction-part") throw new Error("test setup");
    shading.evidence.visual.shadedParts = 4;
    await expectBlocked(adapter, "mismatched-shading", shading);

    const offGrid = structuredClone(bySkill.get("M5-ZO-019")!);
    if (offGrid.evidence.mode !== "number-line") throw new Error("test setup");
    offGrid.evidence.visual.point = rational("2", "3");
    await expectBlocked(adapter, "off-grid-point", offGrid);

    const falseExpansion = structuredClone(bySkill.get("M5-ZO-021")!);
    if (falseExpansion.evidence.mode !== "scale") throw new Error("test setup");
    falseExpansion.evidence.target = rational("6", "14");
    falseExpansion.expression = rational("6", "14");
    await expectBlocked(adapter, "non-equivalent-expansion", falseExpansion);

    const overReduction = structuredClone(bySkill.get("M5-ZO-022")!);
    if (overReduction.evidence.mode !== "scale") throw new Error("test setup");
    overReduction.evidence.factor = integer("7");
    await expectBlocked(adapter, "over-reduction", overReduction);

    const decimalDigits = structuredClone(bySkill.get("M5-ZO-024")!);
    decimalDigits.expression = { kind: "relation", operator: "gt", left: decimal("5", 1), right: decimal("50", 2) };
    await expectBlocked(adapter, "decimal-digit-count", decimalDigits);

    const localeConfusion = structuredClone(bySkill.get("M5-ZO-023")!);
    if (localeConfusion.evidence.mode !== "decimal-place-value") throw new Error("test setup");
    localeConfusion.evidence.value = decimal("12305", 2);
    await expectBlocked(adapter, "decimal-separator-confusion", localeConfusion);
  }, 30_000);
});
