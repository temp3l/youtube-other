import { type LessonVariantSpecification } from "../domain/index.js";
import { type VerifierResponse } from "./protocol-schemas.js";

export function assertFactCoverage(
  lesson: LessonVariantSpecification,
  response: VerifierResponse
): void {
  const checkResults = new Map(
    response.checks.map((check) => [check.checkId, check.status])
  );
  const facts = new Map(lesson.facts.map((fact) => [fact.factId, fact]));
  for (const scene of lesson.scenes)
    for (const factId of scene.factIds) {
      const fact = facts.get(factId);
      if (!fact)
        throw new Error(
          `Scene ${scene.sceneId} references unknown fact ${factId}.`
        );
      if (
        !fact.checkIds.some((checkId) => checkResults.get(checkId) === "passed")
      )
        throw new Error(
          `Visible fact ${factId} has no passed verification check.`
        );
    }
  for (const fact of lesson.facts)
    if (!lesson.scenes.some((scene) => scene.factIds.includes(fact.factId)))
      throw new Error(`Orphan fact ${fact.factId}.`);
}
