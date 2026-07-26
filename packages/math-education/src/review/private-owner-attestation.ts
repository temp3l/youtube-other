import fs from "node:fs/promises";

import { z } from "zod";

import type { loadCurriculumRelease } from "../curriculum/release.js";
import { skillIdSchema } from "../domain/index.js";
import {
  lessonContentSetIdentity,
  type ProductionLessonContent,
} from "../lesson/production-content.js";
import { canonicalHash } from "../verification/canonical-json.js";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const contentVersion = z.enum([
  "class5-number-operations-standard.v1",
  "class5-fractions-decimals-standard.v1",
  "class5-geometry-measurement-standard.v1",
  "class5-data-diagrams-standard.v1",
]);

const contentFamilySchema = z
  .object({
    contentVersion,
    orderedSkillIds: z.array(skillIdSchema).min(1),
    orderedContentHashes: z.array(sha256).min(1),
    contentSetHash: sha256,
  })
  .strict();

const privateOwnerAttestationFieldsSchema = z
  .object({
    artifactVersion: z.literal("math-private-owner-attestation.v1"),
    attestationId: z.string().regex(/^[a-z0-9-]+$/u),
    decision: z.literal("APPROVE_PRIVATE_NO_CLAIM"),
    actor: z
      .object({
        stableId: z.string().min(1),
        name: z.string().min(1),
        role: z.string().min(1),
        organization: z.string().min(1),
        basisOfAuthority: z.string().min(1),
      })
      .strict(),
    recordedAt: z.iso.datetime({ offset: true }),
    attestationSource: z.literal("interactive-user-instruction"),
    curriculum: z
      .object({
        reviewTargetHash: sha256,
        releaseId: z.literal("de-gems-5-10-v1"),
        curriculumVersion: z.literal("1.0.0-draft.1"),
        releaseHash: sha256,
        orderedSkillIds: z.array(skillIdSchema).length(37),
        sourcePolicy: z.literal(
          "ACCEPT_NORMALIZED_SYNTHESIS_WITHOUT_OFFICIAL_PLACEMENT_CLAIM"
        ),
        prerequisitePolicy: z.literal(
          "ACCEPT_CURRENT_HASH_BOUND_GRAPH_FOR_PRIVATE_USE"
        ),
        placementDecision: z.literal("NO_CLAIM"),
      })
      .strict(),
    contentFamilies: z.array(contentFamilySchema).length(4),
    allowedUse: z
      .object({
        visibility: z.literal("private"),
        locales: z.tuple([z.literal("de")]),
        lessonVariants: z.tuple([z.literal("standard")]),
        publicPublishing: z.literal(false),
        providerCalls: z.literal(false),
      })
      .strict(),
    limitations: z
      .object({
        externalCurriculumReview: z.literal(false),
        officialSkillProvenance: z.literal(false),
        jurisdictionClaims: z.literal(false),
        stateClaims: z.literal(false),
        schoolTypeClaims: z.literal(false),
        gradesSixThroughTenApproved: z.literal(false),
      })
      .strict(),
    evidenceHash: sha256,
  })
  .strict();

export const privateOwnerAttestationSchema =
  privateOwnerAttestationFieldsSchema.superRefine((value, context) => {
    const { evidenceHash, ...payload } = value;
    if (evidenceHash !== canonicalHash(payload)) {
      context.addIssue({
        code: "custom",
        path: ["evidenceHash"],
        message: "Private owner attestation hash does not match its payload.",
      });
    }
    for (const [index, family] of value.contentFamilies.entries()) {
      if (
        family.orderedSkillIds.length !== family.orderedContentHashes.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["contentFamilies", index],
          message: "Private owner content identities have different lengths.",
        });
      }
      if (
        family.contentSetHash !==
        canonicalHash({
          orderedSkillIds: family.orderedSkillIds,
          orderedContentHashes: family.orderedContentHashes,
        })
      ) {
        context.addIssue({
          code: "custom",
          path: ["contentFamilies", index, "contentSetHash"],
          message: "Private owner content-set hash does not match its target.",
        });
      }
    }
  });

export type PrivateOwnerAttestation = z.infer<
  typeof privateOwnerAttestationSchema
>;

// Registration is a reviewed source change; arbitrary caller attestations cannot opt in.
export const REGISTERED_PRIVATE_OWNER_ATTESTATION_HASH =
  "71e2823d786f0cbcbd5dd47f645c812d5b05411d8fe6dd270e05c4cb391648c0";

export async function loadPrivateOwnerAttestation(
  filePath: string
): Promise<PrivateOwnerAttestation> {
  return privateOwnerAttestationSchema.parse(
    JSON.parse(await fs.readFile(filePath, "utf8")) as unknown
  );
}

function assertRegistered(attestation: PrivateOwnerAttestation): void {
  if (attestation.evidenceHash !== REGISTERED_PRIVATE_OWNER_ATTESTATION_HASH) {
    throw new Error("Private owner attestation is not registered.");
  }
}

export function assertPrivateOwnerCurriculumApproval(
  rawAttestation: unknown,
  curriculum: Awaited<ReturnType<typeof loadCurriculumRelease>>,
  skillId: string
): PrivateOwnerAttestation {
  const attestation = privateOwnerAttestationSchema.parse(rawAttestation);
  assertRegistered(attestation);
  const gradeFiveSkillIds = curriculum.skills
    .filter((skill) => skill.canonicalGrade === 5)
    .map((skill) => skill.skillId);
  if (
    attestation.curriculum.releaseId !== curriculum.release.releaseId ||
    attestation.curriculum.curriculumVersion !==
      curriculum.release.curriculumVersion ||
    attestation.curriculum.releaseHash !== curriculum.releaseHash ||
    attestation.curriculum.orderedSkillIds.join("\0") !==
      gradeFiveSkillIds.join("\0") ||
    !attestation.curriculum.orderedSkillIds.includes(skillId as never)
  ) {
    throw new Error(
      "Private owner attestation does not approve the exact curriculum target."
    );
  }
  return attestation;
}

export function assertPrivateOwnerLessonContentApproval(
  specifications: readonly ProductionLessonContent[],
  rawAttestation: unknown
): PrivateOwnerAttestation {
  const attestation = privateOwnerAttestationSchema.parse(rawAttestation);
  assertRegistered(attestation);
  const target = lessonContentSetIdentity(specifications);
  const version = specifications[0]?.contentVersion;
  const family = attestation.contentFamilies.find(
    (candidate) => candidate.contentVersion === version
  );
  if (
    !family ||
    family.orderedSkillIds.join("\0") !== target.orderedSkillIds.join("\0") ||
    family.orderedContentHashes.join("\0") !==
      target.orderedContentHashes.join("\0") ||
    family.contentSetHash !== target.contentSetHash
  ) {
    throw new Error(
      "Private owner attestation does not approve the exact lesson-content target."
    );
  }
  return attestation;
}
