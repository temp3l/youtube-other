import {
  type LessonVariantSpecification,
  type VerificationCheck,
} from "../domain/index.js";
import { type LocalizedNarration } from "./localization.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { type VerifierResponse } from "../verification/protocol-schemas.js";

export function localizedDisplayChecks(
  lesson: LessonVariantSpecification,
  narration: LocalizedNarration
): VerificationCheck[] {
  const resolved = new Map(
    narration.resolvedFacts.map((fact) => [fact.factId, fact])
  );
  return lesson.facts.map((fact) => {
    const localized = resolved.get(fact.factId);
    if (!localized || localized.semanticHash !== canonicalHash(fact.semantic))
      throw new Error(
        `Localized display fact ${fact.factId} changed semantics.`
      );
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
