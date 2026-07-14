import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import type { VerificationCheck } from "../domain/index.js";
import { localizeNarration } from "../localization/localization.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { createVerifierRequest, MathVerifierBoundaryError, SympyVerifierAdapter } from "../verification/sympy-adapter.js";
import { buildLessonVariant } from "./variant-builder.js";
import { loadAllGeometryMeasurementStandardContent, GEOMETRY_MEASUREMENT_STANDARD_SKILL_IDS } from "./geometry-measurement-standard-content.js";
import { productionLessonContentSchema } from "./production-content.js";

type DomainCheck = Extract<VerificationCheck, { kind: "geometry-measurement-domain" }>;
const integer = (value: string) => ({ kind: "integer" as const, value });
const pythonExecutable = process.env["MATH_VERIFIER_PYTHON"] ?? path.resolve("python/math-verifier/.venv/bin/python");
async function expectBlocked(adapter: SympyVerifierAdapter, id: string, check: VerificationCheck) {
  await expect(adapter.verify(createVerifierRequest(id, [check]))).rejects.toMatchObject<MathVerifierBoundaryError>({ code: "VERIFICATION_BLOCKED" });
}

describe("Class 5 geometry and measurement production content", () => {
  it("loads, verifies, builds, and German-localizes all eleven exact standard lessons", async () => {
    const release = await loadCurriculumRelease("packages/math-education/data/curriculum/v1");
    const specifications = loadAllGeometryMeasurementStandardContent();
    expect(specifications).toHaveLength(11);
    expect(specifications.map((item) => item.skillId)).toEqual(GEOMETRY_MEASUREMENT_STANDARD_SKILL_IDS);
    const adapter = new SympyVerifierAdapter({ workerRoot: "python/math-verifier", pythonExecutable });
    for (const specification of specifications) {
      expect(productionLessonContentSchema.parse(specification)).toEqual(specification);
      const response = await adapter.verify(createVerifierRequest(`${specification.skillId.toLowerCase()}-geometry-contract`, specification.checks));
      expect(response.status).toBe("passed");
      const skill = release.skills.find((candidate) => candidate.skillId === specification.skillId)!;
      const lesson = buildLessonVariant(skill, "standard");
      expect(buildLessonVariant(skill, "standard").contentHash).toBe(lesson.contentHash);
      const narration = localizeNarration(lesson, "de");
      expect(localizeNarration(lesson, "de").contentHash).toBe(narration.contentHash);
    }
    const volume = buildLessonVariant(release.skills.find((skill) => skill.skillId === "M5-GM-005")!, "standard");
    expect(localizeNarration(volume, "de").resolvedFacts.some((fact) => fact.spoken.includes("Kubikzentimeter"))).toBe(true);

    const bySkill = new Map(specifications.map((item) => [item.skillId, item.checks[0]! as DomainCheck]));
    const mixed = structuredClone(bySkill.get("M5-GM-001")!);
    if (mixed.evidence.mode !== "unit-conversion") throw new Error("test setup");
    mixed.evidence.conversions[0]!.targetUnit.dimensions = { mass: 1 };
    await expectBlocked(adapter, "mixed-dimensions", mixed);
    const wrongScale = structuredClone(bySkill.get("M5-GM-001")!);
    if (wrongScale.evidence.mode !== "unit-conversion") throw new Error("test setup");
    wrongScale.evidence.conversions[0]!.targetUnit.scale = { numerator: "1", denominator: "10" };
    await expectBlocked(adapter, "wrong-unit-scale", wrongScale);
    const areaAsPerimeter = structuredClone(bySkill.get("M5-GM-003")!);
    if (areaAsPerimeter.evidence.mode !== "rectangle-measure") throw new Error("test setup");
    areaAsPerimeter.expression = integer("26");
    await expectBlocked(adapter, "area-perimeter-confusion", areaAsPerimeter);
    const lostSquare = structuredClone(bySkill.get("M5-GM-003")!);
    if (lostSquare.evidence.mode !== "rectangle-measure") throw new Error("test setup");
    lostSquare.evidence.resultUnit.dimensions = { length: 1 };
    await expectBlocked(adapter, "lost-square-unit", lostSquare);
    const impossibleAngle = structuredClone(bySkill.get("M5-RF-002")!);
    if (impossibleAngle.evidence.mode !== "angle") throw new Error("test setup");
    impossibleAngle.evidence.degrees = integer("190");
    impossibleAngle.expression = integer("190");
    await expectBlocked(adapter, "impossible-angle", impossibleAngle);
    const falseParallel = structuredClone(bySkill.get("M5-RF-001")!);
    if (falseParallel.evidence.mode !== "spatial-relations") throw new Error("test setup");
    falseParallel.evidence.lines[1]!.to.y = integer("3");
    await expectBlocked(adapter, "false-parallel", falseParallel);
    const ambiguousPolygon = structuredClone(bySkill.get("M5-RF-004")!);
    if (ambiguousPolygon.evidence.mode !== "polygon-classification") throw new Error("test setup");
    ambiguousPolygon.evidence.classification = "isosceles-triangle";
    await expectBlocked(adapter, "ambiguous-polygon", ambiguousPolygon);
    const brokenSymmetry = structuredClone(bySkill.get("M5-RF-005")!);
    if (brokenSymmetry.evidence.mode !== "axial-symmetry") throw new Error("test setup");
    brokenSymmetry.evidence.pairs[0]!.right.y = integer("3");
    await expectBlocked(adapter, "broken-symmetry", brokenSymmetry);
    const duplicateFace = structuredClone(bySkill.get("M5-RF-006")!);
    if (duplicateFace.evidence.mode !== "net-validity") throw new Error("test setup");
    duplicateFace.evidence.faces[1]!.x = duplicateFace.evidence.faces[0]!.x;
    duplicateFace.evidence.faces[1]!.y = duplicateFace.evidence.faces[0]!.y;
    await expectBlocked(adapter, "duplicate-net-face", duplicateFace);
    const wrongCount = structuredClone(bySkill.get("M5-GM-004")!);
    if (wrongCount.evidence.mode !== "unit-cube-volume") throw new Error("test setup");
    wrongCount.evidence.cubeCount = integer("23");
    await expectBlocked(adapter, "wrong-cube-count", wrongCount);

    const mutated = structuredClone(specifications.find((item) => item.skillId === "M5-GM-002")!);
    const mutationCheck = mutated.checks[0]!;
    if (mutationCheck.kind !== "geometry-measurement-domain" || mutationCheck.evidence.mode !== "rectangle-measure") throw new Error("test setup");
    mutationCheck.evidence.visual.visibleLabel = "nicht maßstabsgetreu";
    mutationCheck.evidence.visual.colorIndependentCues = ["verändert"];
    expect(() => productionLessonContentSchema.parse(mutated)).toThrow(/content hash/u);
  }, 45_000);
});
