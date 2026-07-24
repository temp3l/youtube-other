import { z } from "zod";

import type { LessonVariantSpecification } from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  GERMAN_STANDARD_NARRATION_WORD_RANGE,
  type LocalizedNarration,
  reviewedNarrationInstruction,
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

function requireText(
  text: string,
  expected: string,
  checkId: string
): void {
  if (!text.includes(expected)) {
    throw new Error(`${checkId} review failed: reviewed text is missing.`);
  }
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
  requireText(spoken[0] ?? "", lesson.learningObjective, "objective");
  requireText(spoken[1] ?? "", lesson.promise, "promise");
  requireText(spoken[8] ?? "", lesson.promise, "recap promise");
  for (const example of lesson.workedExamples) {
    requireText(
      spoken[2] ?? "",
      reviewedNarrationInstruction(example.prompt),
      "worked example prompt"
    );
    for (const step of example.steps) {
      requireText(spoken[3] ?? "", step.explanation, "worked example step");
    }
  }
  requireText(spoken[4] ?? "", lesson.commonMistake.description, "misconception");
  requireText(
    spoken[6] ?? "",
    reviewedNarrationInstruction(lesson.challenge.prompt),
    "transfer prompt"
  );
  for (const step of lesson.challenge.steps) {
    requireText(spoken[7] ?? "", step.explanation, "transfer step");
  }
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
  const checks = [
    ["identity-and-provenance", { lessonId: lesson.lessonId, narration: narration.lessonId }],
    ["objective-and-promise", { objective: lesson.learningObjective, promise: lesson.promise }],
    ["scene-purpose-order", lesson.scenes.map(({ sceneId, sceneFunction }) => ({ sceneId, sceneFunction }))],
    ["worked-example", lesson.workedExamples],
    ["transfer-task", lesson.challenge],
    ["misconception", lesson.commonMistake],
    ["formative-check-bindings", lesson.checks.map((check) => ({ checkId: check.checkId, factIds: factByCheck.get(check.checkId) }))],
    ["fact-lock-bindings", narration.segments.map(({ sceneId, factIds }) => ({ sceneId, factIds }))],
    ["german-standard-language", { language: narration.language, variant: narration.variant, wordCount }],
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
