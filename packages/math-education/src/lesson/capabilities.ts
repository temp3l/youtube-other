import { z } from "zod";
import { lessonVariantSchema, skillIdSchema } from "../domain/index.js";
import { APPROVED_LESSON_SKILL_IDS } from "./lesson-specification-fixtures.js";
import {
  loadAllNumberOperationsStandardContent,
  NUMBER_OPERATIONS_STANDARD_SKILL_IDS,
} from "./number-operations-standard-content.js";
import { assertExactLessonContentReview } from "./production-content.js";
import {
  FRACTIONS_DECIMALS_STANDARD_SKILL_IDS,
  loadAllFractionsDecimalsStandardContent,
} from "./fractions-decimals-standard-content.js";
import {
  GEOMETRY_MEASUREMENT_STANDARD_SKILL_IDS,
  loadAllGeometryMeasurementStandardContent,
} from "./geometry-measurement-standard-content.js";
import {
  DATA_DIAGRAM_STANDARD_SKILL_IDS,
  loadAllDataDiagramStandardContent,
} from "./data-diagrams-standard-content.js";
import { assertPrivateOwnerLessonContentApproval } from "../review/private-owner-attestation.js";

// Populated only by an evidence-bearing, separately reviewed rollout change.
// M2-003 has not supplied an accepted external evidence hash.
const REGISTERED_PRODUCTION_REVIEW_EVIDENCE_HASHES: ReadonlySet<string> =
  new Set();

const lessonCapabilitySchema = z.strictObject({
  skillId: skillIdSchema,
  status: z.literal("approved-simulation"),
  variants: z.array(lessonVariantSchema).length(3),
  producerVersion: z.literal("reviewed-fixtures.v1"),
});

const capabilities = new Map<string, z.infer<typeof lessonCapabilitySchema>>(
  APPROVED_LESSON_SKILL_IDS.map((skillId) => [
    skillId,
    lessonCapabilitySchema.parse({
      skillId,
      status: "approved-simulation",
      variants: ["foundation", "standard", "challenge"],
      producerVersion: "reviewed-fixtures.v1",
    }),
  ])
);

export function lessonCapability(skillId: string) {
  return capabilities.get(skillId) ?? null;
}

export function assertLessonCapability(
  skillId: string,
  variant: z.infer<typeof lessonVariantSchema>
): void {
  const capability = lessonCapability(skillId);
  if (!capability || !capability.variants.includes(variant))
    throw new Error(
      `Lesson capability is not approved for ${skillId}/${variant}.`
    );
}

export function productionLessonCapability(skillId: string) {
  const numberOperations = NUMBER_OPERATIONS_STANDARD_SKILL_IDS.includes(
    skillId as never
  );
  const fractionsDecimals = FRACTIONS_DECIMALS_STANDARD_SKILL_IDS.includes(
    skillId as never
  );
  const geometryMeasurement = GEOMETRY_MEASUREMENT_STANDARD_SKILL_IDS.includes(
    skillId as never
  );
  const dataDiagram = DATA_DIAGRAM_STANDARD_SKILL_IDS.includes(
    skillId as never
  );
  if (
    !numberOperations &&
    !fractionsDecimals &&
    !geometryMeasurement &&
    !dataDiagram
  )
    return null;
  return {
    skillId,
    status: "implemented-unreviewed" as const,
    variants: ["standard"] as const,
    producerVersion: numberOperations
      ? ("class5-number-operations-standard.v1" as const)
      : fractionsDecimals
        ? ("class5-fractions-decimals-standard.v1" as const)
        : geometryMeasurement
          ? ("class5-geometry-measurement-standard.v1" as const)
          : ("class5-data-diagrams-standard.v1" as const),
  };
}

export function assertProductionLessonCapability(
  skillId: string,
  variant: z.infer<typeof lessonVariantSchema>,
  reviewEvidence: unknown,
  visibility: "private" | "public" = "public"
): void {
  const capability = productionLessonCapability(skillId);
  if (!capability || variant !== "standard")
    throw new Error(
      `Production lesson content is unsupported for ${skillId}/${variant}.`
    );
  if (!reviewEvidence)
    throw new Error(
      `Production lesson content is unreviewed for ${skillId}/${variant}.`
    );
  const specifications = NUMBER_OPERATIONS_STANDARD_SKILL_IDS.includes(
    skillId as never
  )
    ? loadAllNumberOperationsStandardContent()
    : FRACTIONS_DECIMALS_STANDARD_SKILL_IDS.includes(skillId as never)
      ? loadAllFractionsDecimalsStandardContent()
      : GEOMETRY_MEASUREMENT_STANDARD_SKILL_IDS.includes(skillId as never)
        ? loadAllGeometryMeasurementStandardContent()
        : loadAllDataDiagramStandardContent();
  try {
    const parsed = assertExactLessonContentReview(
      specifications,
      reviewEvidence
    );
    if (
      !REGISTERED_PRODUCTION_REVIEW_EVIDENCE_HASHES.has(parsed.evidenceHash)
    ) {
      throw new Error("External lesson-content review is not registered.");
    }
    return;
  } catch (externalError) {
    if (visibility !== "private") {
      throw new Error(
        `Production lesson review evidence is not registered for public use for ${skillId}/${variant}.`,
        { cause: externalError }
      );
    }
  }
  assertPrivateOwnerLessonContentApproval(specifications, reviewEvidence);
}
