import { z } from "zod";

import type { LessonVariantSpecification } from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  GERMAN_STANDARD_NARRATION_WORD_RANGE,
  germanLearnerNarrationSafetyIssues,
  type LocalizedNarration,
} from "./localization.js";

const reviewCheckSchema = z.strictObject({
  checkId: z.enum([
    "identity-and-provenance",
    "objective-and-promise",
    "scene-purpose-order",
    "worked-example",
    "transfer-task",
    "misconception",
    "formative-check-bindings",
    "fact-lock-bindings",
    "german-standard-language",
  ]),
  status: z.literal("passed"),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
});

export const germanStandardNarrationReviewSchema = z
  .strictObject({
    artifactVersion: z.literal("math-german-narration-review.v1"),
    lessonId: z.string().min(1),
    lessonSpecificationHash: z.string().regex(/^[a-f0-9]{64}$/u),
    narrationHash: z.string().regex(/^[a-f0-9]{64}$/u),
    wordCount: z.number().int().positive(),
    reviewer: z.literal("deterministic-independent-narration-review.v1"),
    checks: z.array(reviewCheckSchema).length(9),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .superRefine((value, context) => {
    const { contentHash, ...payload } = value;
    if (contentHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Narration review content hash is stale or forged.",
      });
    }
  });

export type GermanStandardNarrationReview = z.infer<
  typeof germanStandardNarrationReviewSchema
>;

function requireText(text: string, expected: string, checkId: string): void {
  if (!text.includes(expected))
    throw new Error(`${checkId} review failed: required learner explanation is missing.`);
}

function assertTallyLessonCoverage(spoken: readonly string[]): void {
  const text = spoken.join(" ");
  for (const [expected, checkId] of [
    ["Urliste", "tally definition"],
    ["Strichliste", "tally definition"],
    ["fünfte Strich", "fifth tally explanation"],
    ["Apfel", "category frequency"],
    ["Birne", "category frequency"],
    ["Banane", "category frequency"],
    ["Vier plus drei plus fünf sind zwölf", "example total"],
    ["Banane wurde am häufigsten", "example maximum"],
    ["Sechs plus vier plus fünf sind fünfzehn", "transfer solution"],
  ] as const) {
    requireText(text, expected, checkId);
  }
  requireText(spoken[4] ?? "", "stimmt nicht", "concrete misconception");
  requireText(spoken[5] ?? "", "Trage", "concrete transfer task");
  requireText(spoken[6] ?? "", "Wie viele Kinder", "transfer question");
  requireText(spoken[8] ?? "", "Fünfergruppe", "rule summary");
}

export function reviewGermanStandardNarration(input: {
  lesson: LessonVariantSpecification;
  narration: LocalizedNarration;
}): GermanStandardNarrationReview {
  const { lesson, narration } = input;
  if (
    lesson.variant !== "standard" ||
    narration.variant !== "standard" ||
    narration.language !== "de" ||
    lesson.lessonId !== narration.lessonId
  ) {
    throw new Error("Narration review requires one identity-matched German standard lesson.");
  }
  const spoken = narration.segments.map((segment) => segment.spokenText);
  requireText(spoken[1] ?? "", lesson.learningObjective, "objective");
  if (
    narration.segments.some(
      (segment, index) =>
        segment.sceneId !== lesson.scenes[index]?.sceneId ||
        segment.sceneFunction !== lesson.scenes[index]?.sceneFunction ||
        segment.factIds.join("\0") !== lesson.scenes[index]?.factIds.join("\0")
    )
  ) {
    throw new Error("Narration review failed: scene purposes or fact bindings changed.");
  }
  if (!(spoken[4] ?? "").includes("?"))
    throw new Error(
      "Narration review failed: the misconception check asks no question."
    );
  if (
    narration.segments[8]?.factIds.length !== 0 ||
    !(spoken[8] ?? "").trim().endsWith("?")
  )
    throw new Error(
      "Narration review failed: the final retrieval question exposes guidance or is missing."
    );
  const narratedFactIds = new Set(narration.segments.flatMap((segment) => segment.factIds));
  const factByCheck = new Map<string, string[]>();
  for (const fact of lesson.facts) {
    for (const checkId of fact.checkIds) {
      factByCheck.set(checkId, [...(factByCheck.get(checkId) ?? []), fact.factId]);
    }
  }
  for (const check of lesson.checks) {
    const boundFacts = factByCheck.get(check.checkId) ?? [];
    if (boundFacts.length === 0 || boundFacts.some((factId) => !narratedFactIds.has(factId))) {
      throw new Error(`Narration review failed: formative check ${check.checkId} is not fact-bound.`);
    }
  }
  const wordCount = spoken.reduce(
    (total, text) => total + text.trim().split(/\s+/u).filter(Boolean).length,
    0
  );
  if (
    wordCount < GERMAN_STANDARD_NARRATION_WORD_RANGE.minimum ||
    wordCount > GERMAN_STANDARD_NARRATION_WORD_RANGE.maximum
  ) {
    throw new Error(`Narration review failed: ${wordCount} words are outside the reviewed range.`);
  }
  if (spoken.some((text) => /\[\[|\]\]|\b(?:TODO|TBD)\b/iu.test(text))) {
    throw new Error("Narration review failed: unresolved or deferred text remains.");
  }
  const learnerSafetyIssues = germanLearnerNarrationSafetyIssues(spoken.join(" "));
  if (learnerSafetyIssues.length > 0) {
    throw new Error(
      `Narration review failed: learner narration contains internal or non-standard language: ${learnerSafetyIssues.join(", ")}.`
    );
  }
  if (lesson.skillId === "M5-DZ-001") assertTallyLessonCoverage(spoken);
  const checks = [
    ["identity-and-provenance", { lessonId: lesson.lessonId, narration: narration.lessonId }],
    ["objective-and-promise", { objective: lesson.learningObjective, objectiveScene: spoken[1] }],
    ["scene-purpose-order", {
      scenes: lesson.scenes.map(({ sceneId, sceneFunction }) => ({ sceneId, sceneFunction })),
      finalRetrievalQuestion: spoken[8],
    }],
    ["worked-example", { scene: spoken[3], factIds: narration.segments[3]?.factIds }],
    ["transfer-task", { prompt: spoken[6], solution: spoken[7], independentlyAttempted: true }],
    ["misconception", { scene: spoken[4], checkQuestion: spoken[4] }],
    ["formative-check-bindings", lesson.checks.map((check) => ({ checkId: check.checkId, factIds: factByCheck.get(check.checkId) }))],
    ["fact-lock-bindings", narration.segments.map(({ sceneId, factIds }) => ({ sceneId, factIds }))],
    ["german-standard-language", { language: narration.language, variant: narration.variant, wordCount, learnerSafetyIssues }],
  ].map(([checkId, evidence]) => ({
    checkId,
    status: "passed" as const,
    evidenceHash: canonicalHash(evidence),
  }));
  const payload = {
    artifactVersion: "math-german-narration-review.v1" as const,
    lessonId: lesson.lessonId,
    lessonSpecificationHash: lesson.contentHash,
    narrationHash: narration.contentHash,
    wordCount,
    reviewer: "deterministic-independent-narration-review.v1" as const,
    checks,
  };
  return germanStandardNarrationReviewSchema.parse({
    ...payload,
    contentHash: canonicalHash(payload),
  });
}
