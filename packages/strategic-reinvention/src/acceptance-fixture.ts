import { immutablePlanHash } from "@mediaforge/domain";
import { planVeronicaLocaleEdition } from "@mediaforge/veronica-media";
import { z } from "zod";

import { STRATEGIC_FULL_TASK_REGISTRY_VERSION } from "./full-task-definitions.js";
import type { StrategicEpisodePipelineResult } from "./episode-pipeline.js";

export const VERONICA_ACCEPTANCE_EVIDENCE_VERSION =
  "veronicabenini.acceptance-evidence.v1" as const;

const identifier = z.string().trim().min(1).max(160);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const veronicaAcceptanceEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(VERONICA_ACCEPTANCE_EVIDENCE_VERSION),
  contentProfileId: z.literal("veronicabenini"),
  episodeId: identifier,
  productionRevisionId: identifier,
  workflowRevision: z.literal(STRATEGIC_FULL_TASK_REGISTRY_VERSION),
  effectiveConfigurationHash: sha256,
  dependencyIdentity: z.record(identifier, sha256),
  provenanceSha256: sha256,
  artifactBindings: z.array(z.strictObject({
    kind: z.enum(["semantic-visual-plan", "locale-edition", "approval-history"]),
    revisionId: identifier,
    contentHash: sha256,
    locale: z.enum(["en", "es"]).optional(),
  })).min(4),
  localizationReuse: z.strictObject({
    sharedVisualHash: sha256,
    locales: z.array(z.enum(["en", "es"])).length(2),
    rationale: z.literal("language-independent-visual"),
    invalidatedSharedVisuals: z.literal(false),
  }),
  cacheReuse: z.strictObject({
    resumedContentHashMatch: z.literal(true),
    rationale: z.literal("content-hash-match"),
  }),
  sourceInvalidation: z.strictObject({
    detected: z.literal(true),
    rationale: z.literal("source-content-changed"),
  }),
  approvedHistoryPreserved: z.literal(true),
  releaseGate: z.strictObject({
    providerDispatchEnabled: z.literal(false),
    irreversibleWorkEnabled: z.literal(false),
    publicationState: z.literal("dry-run-blocked"),
    failureEvidence: z.strictObject({
      code: z.literal("EXTERNAL_ACTIVATION_REQUIRED"),
      message: z.literal("Activation and rights evidence must be reviewed before publication."),
      redacted: z.literal(true),
    }),
  }),
  artifactPath: z.literal("state/veronicabenini/acceptance-evidence.json"),
  fingerprint: sha256,
});

export type VeronicaAcceptanceEvidence = z.infer<typeof veronicaAcceptanceEvidenceSchema>;

export function createVeronicaAcceptanceEvidence(input: {
  readonly first: StrategicEpisodePipelineResult;
  readonly resumed: StrategicEpisodePipelineResult;
  readonly sourceChanged: StrategicEpisodePipelineResult;
  readonly effectiveConfiguration: unknown;
  readonly sourceProvenanceSha256: string;
  readonly approvalHistoryHashBefore: string;
  readonly approvalHistoryHashAfter: string;
}): VeronicaAcceptanceEvidence {
  const productionRevisionId = "episode-revision-1";
  const sharedVisualHash = input.first.supplementalPlanContentHash;
  const effectiveConfigurationHash = immutablePlanHash(input.effectiveConfiguration);
  const dependencyIdentity = {
    workflow: immutablePlanHash({
      revision: STRATEGIC_FULL_TASK_REGISTRY_VERSION,
      stages: input.first.completedStages,
    }),
    semanticVisualPlan: sharedVisualHash,
  };
  const editions = (["en", "es"] as const).map((locale) =>
    planVeronicaLocaleEdition({
      episodeId: input.first.episodeId,
      productionRevisionId,
      locale,
      canonicalLocale: "it",
      narrationRevisionId: `narration-${locale}-1`,
      narrationFingerprint: immutablePlanHash({ locale, productionRevisionId }),
      visuals: [{
        artifactId: "semantic-visual-plan-1",
        fingerprint: sharedVisualHash,
        visualSemanticRevisionId: "semantic-visual-revision-1",
        textHandling: "none",
      }],
      effectiveConfiguration: input.effectiveConfiguration,
      dependencyIdentity,
      approval: { state: "review" },
      regenerationRationale: "new-locale-edition",
    }).edition,
  );
  if (input.resumed.supplementalPlanContentHash !== sharedVisualHash)
    throw new Error("ACCEPTANCE_CACHE_REUSE_REQUIRED");
  if (input.sourceChanged.supplementalPlanContentHash === sharedVisualHash)
    throw new Error("ACCEPTANCE_SOURCE_INVALIDATION_REQUIRED");
  if (input.approvalHistoryHashBefore !== input.approvalHistoryHashAfter)
    throw new Error("ACCEPTANCE_APPROVED_HISTORY_CHANGED");
  const material = {
    schemaVersion: VERONICA_ACCEPTANCE_EVIDENCE_VERSION,
    contentProfileId: "veronicabenini" as const,
    episodeId: input.first.episodeId,
    productionRevisionId,
    workflowRevision: STRATEGIC_FULL_TASK_REGISTRY_VERSION,
    effectiveConfigurationHash,
    dependencyIdentity,
    provenanceSha256: sha256.parse(input.sourceProvenanceSha256),
    artifactBindings: [
      { kind: "semantic-visual-plan" as const, revisionId: "semantic-visual-revision-1", contentHash: sharedVisualHash },
      ...editions.map((edition) => ({
        kind: "locale-edition" as const,
        revisionId: edition.editionId,
        contentHash: edition.fingerprint,
        locale: edition.locale as "en" | "es",
      })),
      { kind: "approval-history" as const, revisionId: "approval-history-1", contentHash: input.approvalHistoryHashAfter },
    ],
    localizationReuse: {
      sharedVisualHash,
      locales: editions.map((edition) => edition.locale) as ["en", "es"],
      rationale: "language-independent-visual" as const,
      invalidatedSharedVisuals: false as const,
    },
    cacheReuse: {
      resumedContentHashMatch: true as const,
      rationale: "content-hash-match" as const,
    },
    sourceInvalidation: {
      detected: true as const,
      rationale: "source-content-changed" as const,
    },
    approvedHistoryPreserved: true as const,
    releaseGate: {
      providerDispatchEnabled: false as const,
      irreversibleWorkEnabled: false as const,
      publicationState: "dry-run-blocked" as const,
      failureEvidence: {
        code: "EXTERNAL_ACTIVATION_REQUIRED" as const,
        message: "Activation and rights evidence must be reviewed before publication." as const,
        redacted: true as const,
      },
    },
    artifactPath: "state/veronicabenini/acceptance-evidence.json" as const,
  };
  return veronicaAcceptanceEvidenceSchema.parse({
    ...material,
    fingerprint: immutablePlanHash(material),
  });
}
