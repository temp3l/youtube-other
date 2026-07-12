import {
  type LessonVariantSpecification,
  type VerificationCheck,
} from "../domain/index.js";
import { type LocalizedNarration } from "./localization.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { type VerifierResponse } from "../verification/protocol-schemas.js";
import { buildFactLock } from "./fact-lock.js";
import { formatExpression, formatMeasurement } from "./locale-formatter.js";
import { localizedNarrationSchema } from "./localization.js";

function assertResolvedFact(
  fact: LessonVariantSpecification["facts"][number],
  narration: LocalizedNarration
): void {
  const localized = narration.resolvedFacts.find(
    (candidate) => candidate.factId === fact.factId
  );
  if (!localized || localized.semanticHash !== canonicalHash(fact.semantic))
    throw new Error(`Localized display fact ${fact.factId} changed semantics.`);
  const expected =
    fact.semantic.kind === "scalar"
      ? formatExpression(fact.semantic.expression, narration.language)
      : fact.semantic.kind === "measurement"
        ? formatMeasurement(
            fact.semantic.value,
            fact.semantic.unit,
            narration.language
          )
        : null;
  if (!expected)
    throw new Error(
      `Localized display verification does not support ${fact.semantic.kind}.`
    );
  if (
    localized.display !== expected.display ||
    localized.spoken !== expected.spoken ||
    localized.latex !== expected.latex
  )
    throw new Error(
      `Localized display fact ${fact.factId} does not match deterministic formatting.`
    );
}

export function localizedDisplayChecks(
  lesson: LessonVariantSpecification,
  narration: LocalizedNarration
): VerificationCheck[] {
  localizedNarrationSchema.parse(narration);
  const lock = buildFactLock(lesson);
  if (
    narration.lessonId !== lesson.lessonId ||
    narration.variant !== lesson.variant ||
    narration.objectiveHash !== lock.objectiveHash ||
    narration.factLockHash !== lock.factLockHash
  )
    throw new Error("Localized narration does not match the locked lesson.");
  if (
    narration.resolvedFacts.length !== lesson.facts.length ||
    new Set(narration.resolvedFacts.map((fact) => fact.factId)).size !==
      narration.resolvedFacts.length
  )
    throw new Error(
      "Localized narration fact coverage is incomplete or duplicated."
    );
  return lesson.facts.map((fact) => {
    assertResolvedFact(fact, narration);
    if (fact.semantic.kind !== "scalar")
      throw new Error(
        `Localized display verification does not support ${fact.semantic.kind}.`
      );
    return {
      checkId: `check-display-${fact.factId}`,
      kind: "display-fact",
      expression: fact.semantic.expression,
      expected: fact.semantic,
      critical: true,
    };
  });
}

export function assertLocalizedDisplayVerification(
  checks: readonly VerificationCheck[],
  response: VerifierResponse
): void {
  const results = new Map(
    response.checks.map((check) => [check.checkId, check.status])
  );
  for (const check of checks)
    if (results.get(check.checkId) !== "passed")
      throw new Error(
        `Post-localization verification failed: ${check.checkId}.`
      );
  if (response.status !== "passed")
    throw new Error("Post-localization display verification did not pass.");
}
