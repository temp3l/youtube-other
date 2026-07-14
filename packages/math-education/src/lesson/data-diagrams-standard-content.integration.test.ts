import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import type { VerificationCheck } from "../domain/index.js";
import { localizeNarration } from "../localization/localization.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { createVerifierRequest, MathVerifierBoundaryError, SympyVerifierAdapter } from "../verification/sympy-adapter.js";
import { assertProductionLessonCapability, productionLessonCapability } from "./capabilities.js";
import { DATA_DIAGRAM_STANDARD_SKILL_IDS, loadAllDataDiagramStandardContent } from "./data-diagrams-standard-content.js";
import { productionLessonContentSchema } from "./production-content.js";
import { buildLessonVariant } from "./variant-builder.js";

type DataCheck = Extract<VerificationCheck, { kind: "data-diagram-domain" }>;
const integer = (value: string) => ({ kind: "integer" as const, value });
const pythonExecutable = process.env["MATH_VERIFIER_PYTHON"] ?? path.resolve("python/math-verifier/.venv/bin/python");
async function expectBlocked(adapter: SympyVerifierAdapter, id: string, check: VerificationCheck) {
  await expect(adapter.verify(createVerifierRequest(id, [check]))).rejects.toMatchObject<MathVerifierBoundaryError>({ code: "VERIFICATION_BLOCKED" });
}
function rehashDataset(check: DataCheck) {
  const { datasetHash: _old, ...payload } = check.evidence.dataset;
  check.evidence.dataset.datasetHash = canonicalHash(payload);
}

describe("Class 5 data and diagram production content", () => {
  it("verifies, builds, and localizes both exact dataset-bound lessons and rejects adversarial charts", async () => {
    const release = await loadCurriculumRelease("packages/math-education/data/curriculum/v1");
    const specifications = loadAllDataDiagramStandardContent();
    expect(specifications).toHaveLength(2);
    expect(specifications.map((item) => item.skillId)).toEqual(DATA_DIAGRAM_STANDARD_SKILL_IDS);
    const adapter = new SympyVerifierAdapter({ workerRoot: "python/math-verifier", pythonExecutable });
    for (const specification of specifications) {
      expect(productionLessonContentSchema.parse(specification)).toEqual(specification);
      const response = await adapter.verify(createVerifierRequest(`${specification.skillId.toLowerCase()}-data-contract`, specification.checks));
      expect(response.status).toBe("passed");
      const skill = release.skills.find((candidate) => candidate.skillId === specification.skillId)!;
      const lesson = buildLessonVariant(skill, "standard");
      const narration = localizeNarration(lesson, "de");
      expect(localizeNarration(lesson, "de").contentHash).toBe(narration.contentHash);
      expect(narration.resolvedFacts.map((fact) => fact.semanticHash)).toEqual(lesson.facts.map((fact) => canonicalHash(fact.semantic)));
    }
    expect(productionLessonCapability("M5-DZ-002")).toMatchObject({ status: "implemented-unreviewed", variants: ["standard"] });
    expect(() => assertProductionLessonCapability("M5-DZ-002", "standard", null)).toThrow(/unreviewed/u);
    expect(productionLessonCapability("M5-DZ-003")).toBeNull();

    const tally = specifications[0]!.checks[0]! as DataCheck;
    const chart = specifications[1]!.checks[0]! as DataCheck;
    const malformedTally = structuredClone(tally);
    if (malformedTally.evidence.mode !== "tally-list") throw new Error("test setup");
    malformedTally.evidence.dataset.categories[2]!.tallyGroups = [4, 1];
    rehashDataset(malformedTally);
    await expectBlocked(adapter, "malformed-tally", malformedTally);
    const totalMismatch = structuredClone(tally);
    if (totalMismatch.evidence.mode !== "tally-list") throw new Error("test setup");
    totalMismatch.evidence.expectedTotal = integer("13");
    totalMismatch.expression = integer("13");
    await expectBlocked(adapter, "total-mismatch", totalMismatch);
    const duplicate = structuredClone(tally);
    if (duplicate.evidence.mode !== "tally-list") throw new Error("test setup");
    duplicate.evidence.dataset.categories[1]!.category = "Apfel";
    duplicate.evidence.dataset.rawValues = duplicate.evidence.dataset.rawValues.map((value) => value === "Birne" ? "Apfel" : value);
    rehashDataset(duplicate);
    await expectBlocked(adapter, "duplicate-category", duplicate);
    const negative = structuredClone(tally);
    if (negative.evidence.mode !== "tally-list") throw new Error("test setup");
    negative.evidence.dataset.categories[0]!.count = integer("-1");
    negative.evidence.dataset.categories[0]!.tallyGroups = [];
    rehashDataset(negative);
    await expectBlocked(adapter, "negative-count", negative);
    const reordered = structuredClone(tally);
    if (reordered.evidence.mode !== "tally-list") throw new Error("test setup");
    reordered.evidence.dataset.categories.reverse();
    await expectBlocked(adapter, "reordered-old-hash", reordered);

    const omitted = structuredClone(chart);
    if (omitted.evidence.mode !== "bar-chart") throw new Error("test setup");
    omitted.evidence.chart.bars.pop();
    await expectBlocked(adapter, "omitted-category", omitted);
    const truncated = structuredClone(chart);
    if (truncated.evidence.mode !== "bar-chart") throw new Error("test setup");
    truncated.evidence.chart.axisOrigin = integer("2");
    await expectBlocked(adapter, "nonzero-axis-origin", truncated);
    const badTicks = structuredClone(chart);
    if (badTicks.evidence.mode !== "bar-chart") throw new Error("test setup");
    badTicks.evidence.chart.tickInterval = integer("3");
    await expectBlocked(adapter, "inconsistent-ticks", badTicks);
    const wrongBar = structuredClone(chart);
    if (wrongBar.evidence.mode !== "bar-chart") throw new Error("test setup");
    wrongBar.evidence.chart.bars[0]!.height = integer("6");
    await expectBlocked(adapter, "wrong-bar-height", wrongBar);
    const transplantedLabel = structuredClone(chart);
    if (transplantedLabel.evidence.mode !== "bar-chart") throw new Error("test setup");
    transplantedLabel.evidence.chart.bars[0]!.category = "Gelb";
    await expectBlocked(adapter, "locale-label-transplant", transplantedLabel);
    const inaccessible = structuredClone(chart);
    if (inaccessible.evidence.mode !== "bar-chart") throw new Error("test setup");
    inaccessible.evidence.chart.accessibleEncoding.colorIndependentCue = "";
    expect(() => createVerifierRequest("color-only", [inaccessible])).toThrow();
  }, 30_000);
});
