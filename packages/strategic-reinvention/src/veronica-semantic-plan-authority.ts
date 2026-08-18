import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import { hasValidSemanticPlanHash, stableHash } from "./positioning-visual-semantics.js";
import {
  VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION,
  VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION,
} from "./veronica-pre-image-semantic-gate.js";
import { resolveVeronicaProductionPolicy } from "./veronica-production-policy.js";
import {
  VERONICA_PROMPT_SANITATION_VERSION,
  VERONICA_SEMANTIC_PROPOSITION_VERSION,
  VERONICA_TREATMENT_COMPATIBILITY_VERSION,
} from "./veronica-semantic-quality.js";
import { VERONICA_VISUAL_BEAT_PLANNER_VERSION } from "./veronica-visual-beats.js";
import { VERONICA_SEQUENCE_DIVERSITY_POLICY_VERSION } from "./veronica-sequence-diversity.js";

export const VERONICA_SEMANTIC_PLAN_AUTHORITY_RESOLVER_VERSION =
  "veronica-semantic-plan-authority-resolver.v1" as const;
export const VERONICA_SEMANTIC_AUTHORITY_IDENTITY_VERSION =
  "veronica-semantic-authority-identity.v1" as const;

export const VERONICA_SEMANTIC_PLAN_AUTHORITY_STATES = [
  "CURRENT_DERIVED_AUTHORITY",
  "ACCEPTED_HUMAN_AUTHORITY",
  "STALE_DERIVED_AUTHORITY",
  "LEGACY_COMPATIBILITY_AUTHORITY",
  "HISTORICAL_NON_AUTHORITY",
  "PROVENANCE_MISMATCH",
  "UNKNOWN",
] as const;

export type VeronicaSemanticPlanAuthorityState =
  (typeof VERONICA_SEMANTIC_PLAN_AUTHORITY_STATES)[number];

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const semanticAuthorityPlanSchema = z.object({
  contentId: z.string().min(1),
  format: z.enum(["long", "short"]),
  plannerVersion: z.string().min(1),
  canonicalSourceHash: z.string().min(1),
  planHash: sha256Schema,
  derivation: z.object({
    sourceNarrationSha256: sha256Schema,
    sourceRevisionHash: sha256Schema,
    plannerInputHash: sha256Schema,
    plannerVersion: z.string().min(1),
  }).passthrough().optional(),
  assets: z.array(z.object({
    projectionProvenance: z.object({
      stateProjectionPolicyVersion: z.string().min(1),
    }).passthrough().optional(),
  }).passthrough()),
  semanticAuthority: z.unknown().optional(),
}).passthrough();
type SemanticAuthorityPlan = z.infer<typeof semanticAuthorityPlanSchema>;

export const veronicaSemanticAuthorityIdentityInputsSchema = z
  .strictObject({
    schemaVersion: z.literal(VERONICA_SEMANTIC_AUTHORITY_IDENTITY_VERSION),
    contentId: z.string().min(1),
    canonicalSourceSha256: sha256Schema,
    sourceRevisionHash: sha256Schema,
    plannerInputHash: sha256Schema,
    plannerVersion: z.string().min(1),
    semanticContractVersion: z.string().min(1),
    semanticGateVersion: z.string().min(1),
    remediationPolicyVersion: z.string().min(1),
    treatmentProjectionVersion: z.string().min(1),
    semanticBytePolicyVersions: z.record(z.string(), z.string().min(1)),
  });

export type VeronicaSemanticAuthorityIdentityInputs = z.infer<
  typeof veronicaSemanticAuthorityIdentityInputsSchema
>;

export const veronicaSemanticAuthorityEnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal("veronica-semantic-plan-authority.v1"),
    resolverVersion: z.literal(VERONICA_SEMANTIC_PLAN_AUTHORITY_RESOLVER_VERSION),
    authorityKind: z.enum([
      "DERIVED",
      "ACCEPTED_HUMAN",
      "LEGACY_COMPATIBILITY",
      "HISTORICAL",
    ]),
    semanticIdentity: sha256Schema,
    identityInputs: veronicaSemanticAuthorityIdentityInputsSchema,
    acceptedEvidence: z
      .strictObject({
        decision: z.literal("ACCEPTED"),
        reviewer: z.string().min(1),
        authorizationReference: z.string().min(1),
        acceptedAt: z.string().datetime(),
      })
      .optional(),
  });

export type VeronicaSemanticAuthorityEnvelope = z.infer<
  typeof veronicaSemanticAuthorityEnvelopeSchema
>;

export interface VeronicaLegacySemanticAuthorityEvidence {
  readonly gateVersion: string;
  readonly remediationPolicyVersion: string;
  readonly semanticPlanHash: string;
  readonly projectionVersions: readonly string[];
}

export function buildVeronicaSemanticAuthorityIdentityInputs(input: {
  readonly plan: unknown;
}): VeronicaSemanticAuthorityIdentityInputs {
  const plan = semanticAuthorityPlanSchema.parse(input.plan);
  const derivation = plan.derivation;
  const fallbackSource = /^[a-f0-9]{64}$/u.test(plan.canonicalSourceHash)
    ? plan.canonicalSourceHash
    : stableHash(plan.canonicalSourceHash);
  return veronicaSemanticAuthorityIdentityInputsSchema.parse({
    schemaVersion: VERONICA_SEMANTIC_AUTHORITY_IDENTITY_VERSION,
    contentId: plan.contentId,
    canonicalSourceSha256: derivation?.sourceNarrationSha256 ?? fallbackSource,
    sourceRevisionHash: derivation?.sourceRevisionHash ?? stableHash({
      contentId: plan.contentId,
      canonicalSourceHash: plan.canonicalSourceHash,
    }),
    plannerInputHash: derivation?.plannerInputHash ?? stableHash({
      contentId: plan.contentId,
      plannerVersion: plan.plannerVersion,
      canonicalSourceHash: plan.canonicalSourceHash,
    }),
    plannerVersion: plan.plannerVersion,
    semanticContractVersion: VERONICA_SEMANTIC_PROPOSITION_VERSION,
    semanticGateVersion: VERONICA_PRE_IMAGE_SEMANTIC_GATE_VERSION,
    remediationPolicyVersion: resolveVeronicaProductionPolicy(plan.format).semanticAutoRemediation.policyVersion,
    treatmentProjectionVersion: VERONICA_STATE_AWARE_PROVIDER_PROJECTION_VERSION,
    semanticBytePolicyVersions: {
      treatmentCompatibility: VERONICA_TREATMENT_COMPATIBILITY_VERSION,
      promptSanitation: VERONICA_PROMPT_SANITATION_VERSION,
      visualBeatPlanner: VERONICA_VISUAL_BEAT_PLANNER_VERSION,
      sequenceDiversity: VERONICA_SEQUENCE_DIVERSITY_POLICY_VERSION,
    },
  });
}

export function parseVeronicaLegacySemanticAuthorityEvidence(input: {
  readonly plan: unknown;
  readonly semanticReviews: unknown;
}): VeronicaLegacySemanticAuthorityEvidence | undefined {
  const plan = semanticAuthorityPlanSchema.safeParse(input.plan);
  const reviewSchema = z.object({
    gateVersion: z.string().min(1),
    remediationPolicyVersion: z.string().min(1),
    semanticPlanHash: sha256Schema,
  }).passthrough();
  const reviews = reviewSchema.safeParse(input.semanticReviews);
  if (!reviews.success || !plan.success) return undefined;
  const projectionVersions = plan.data.assets.flatMap((asset) =>
    asset.projectionProvenance?.stateProjectionPolicyVersion
      ? [asset.projectionProvenance.stateProjectionPolicyVersion]
      : [],
  );
  if (projectionVersions.length !== plan.data.assets.length) return undefined;
  return {
    gateVersion: reviews.data.gateVersion,
    remediationPolicyVersion: reviews.data.remediationPolicyVersion,
    semanticPlanHash: reviews.data.semanticPlanHash,
    projectionVersions,
  };
}

export type VeronicaSemanticPlanAuthorityResolution =
  | {
      readonly state:
        | "CURRENT_DERIVED_AUTHORITY"
        | "ACCEPTED_HUMAN_AUTHORITY"
        | "LEGACY_COMPATIBILITY_AUTHORITY";
      readonly reusable: true;
      readonly semanticIdentity: string;
      readonly reason: string;
    }
  | {
      readonly state:
        | "STALE_DERIVED_AUTHORITY"
        | "HISTORICAL_NON_AUTHORITY"
        | "PROVENANCE_MISMATCH"
        | "UNKNOWN";
      readonly reusable: false;
      readonly semanticIdentity: string | null;
      readonly reason: string;
    };

export function computeVeronicaSemanticAuthorityIdentity(
  value: VeronicaSemanticAuthorityIdentityInputs,
): string {
  const parsed = veronicaSemanticAuthorityIdentityInputsSchema.parse(value);
  return stableHash({
    ...parsed,
    semanticBytePolicyVersions: Object.fromEntries(
      Object.entries(parsed.semanticBytePolicyVersions).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}

export function createVeronicaDerivedSemanticAuthority(
  identityInputs: VeronicaSemanticAuthorityIdentityInputs,
): VeronicaSemanticAuthorityEnvelope {
  return veronicaSemanticAuthorityEnvelopeSchema.parse({
    schemaVersion: "veronica-semantic-plan-authority.v1",
    resolverVersion: VERONICA_SEMANTIC_PLAN_AUTHORITY_RESOLVER_VERSION,
    authorityKind: "DERIVED",
    semanticIdentity: computeVeronicaSemanticAuthorityIdentity(identityInputs),
    identityInputs,
  });
}

function envelopeFromPlan(plan: SemanticAuthorityPlan): VeronicaSemanticAuthorityEnvelope | null {
  const parsed = veronicaSemanticAuthorityEnvelopeSchema.safeParse(plan.semanticAuthority);
  return parsed.success ? parsed.data : null;
}

function legacyDerivedMatches(input: {
  readonly plan: SemanticAuthorityPlan;
  readonly expected: VeronicaSemanticAuthorityIdentityInputs;
  readonly evidence: VeronicaLegacySemanticAuthorityEvidence;
}): boolean {
  const derivation = input.plan.derivation;
  if (!derivation || !hasValidSemanticPlanHash(input.plan)) return false;
  const projectionVersions = [...new Set(input.evidence.projectionVersions)];
  return input.plan.contentId === input.expected.contentId
    && derivation.sourceNarrationSha256 === input.expected.canonicalSourceSha256
    && derivation.sourceRevisionHash === input.expected.sourceRevisionHash
    && derivation.plannerInputHash === input.expected.plannerInputHash
    && derivation.plannerVersion === input.expected.plannerVersion
    && input.evidence.gateVersion === input.expected.semanticGateVersion
    && input.evidence.remediationPolicyVersion === input.expected.remediationPolicyVersion
    && input.evidence.semanticPlanHash === input.plan.planHash
    && projectionVersions.length === 1
    && projectionVersions[0] === input.expected.treatmentProjectionVersion;
}

export function resolveVeronicaSemanticPlanAuthority(input: {
  readonly plan: unknown | null;
  readonly expected: VeronicaSemanticAuthorityIdentityInputs;
  readonly legacyEvidence?: VeronicaLegacySemanticAuthorityEvidence;
}): VeronicaSemanticPlanAuthorityResolution {
  const parsedPlan = semanticAuthorityPlanSchema.safeParse(input.plan);
  if (!parsedPlan.success) {
    return {
      state: "UNKNOWN",
      reusable: false,
      semanticIdentity: null,
      reason: "semantic plan is missing or failed runtime validation",
    };
  }
  const plan = parsedPlan.data;
  const expectedIdentity = computeVeronicaSemanticAuthorityIdentity(input.expected);
  const envelope = envelopeFromPlan(plan);
  if (!envelope) {
    if (input.legacyEvidence && legacyDerivedMatches({
      plan,
      expected: input.expected,
      evidence: input.legacyEvidence,
    })) {
      return {
        state: "CURRENT_DERIVED_AUTHORITY",
        reusable: true,
        semanticIdentity: expectedIdentity,
        reason: "complete legacy derivation, semantic review, and projection provenance match current identity",
      };
    }
    return {
      state: "UNKNOWN",
      reusable: false,
      semanticIdentity: null,
      reason: "missing explicit semantic authority and incomplete compatibility evidence",
    };
  }
  if (envelope.authorityKind === "HISTORICAL") {
    return {
      state: "HISTORICAL_NON_AUTHORITY",
      reusable: false,
      semanticIdentity: envelope.semanticIdentity,
      reason: "artifact is retained as historical evidence only",
    };
  }
  if (envelope.identityInputs.contentId !== input.expected.contentId
    || envelope.identityInputs.canonicalSourceSha256 !== input.expected.canonicalSourceSha256
    || plan.contentId !== input.expected.contentId) {
    return {
      state: "PROVENANCE_MISMATCH",
      reusable: false,
      semanticIdentity: envelope.semanticIdentity,
      reason: "artifact content/source provenance does not belong to this canonical source",
    };
  }
  if (envelope.authorityKind === "ACCEPTED_HUMAN") {
    if (!envelope.acceptedEvidence) {
      return {
        state: "UNKNOWN",
        reusable: false,
        semanticIdentity: envelope.semanticIdentity,
        reason: "human authority lacks explicit acceptance evidence",
      };
    }
    return {
      state: "ACCEPTED_HUMAN_AUTHORITY",
      reusable: true,
      semanticIdentity: envelope.semanticIdentity,
      reason: envelope.semanticIdentity === expectedIdentity
        ? "explicit accepted human authority is policy-compatible"
        : "explicit accepted human authority is immutable and requires review for current policy",
    };
  }
  if (envelope.authorityKind === "LEGACY_COMPATIBILITY") {
    return {
      state: "LEGACY_COMPATIBILITY_AUTHORITY",
      reusable: true,
      semanticIdentity: envelope.semanticIdentity,
      reason: "explicit compatibility policy permits read-only reuse",
    };
  }
  if (!hasValidSemanticPlanHash(plan)) {
    return {
      state: "PROVENANCE_MISMATCH",
      reusable: false,
      semanticIdentity: envelope.semanticIdentity,
      reason: "persisted artifact self-hash is invalid",
    };
  }
  if (envelope.semanticIdentity !== computeVeronicaSemanticAuthorityIdentity(envelope.identityInputs)) {
    return {
      state: "PROVENANCE_MISMATCH",
      reusable: false,
      semanticIdentity: envelope.semanticIdentity,
      reason: "embedded semantic identity does not match its declared semantic inputs",
    };
  }
  return envelope.semanticIdentity === expectedIdentity
    ? {
        state: "CURRENT_DERIVED_AUTHORITY",
        reusable: true,
        semanticIdentity: envelope.semanticIdentity,
        reason: "derived semantic identity matches current semantic-byte inputs",
      }
    : {
        state: "STALE_DERIVED_AUTHORITY",
        reusable: false,
        semanticIdentity: envelope.semanticIdentity,
        reason: "one or more semantic-byte inputs changed",
      };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function preserveSupersededVeronicaSemanticPlan(input: {
  readonly planPath: string;
  readonly raw: string;
  readonly classification: Exclude<
    VeronicaSemanticPlanAuthorityState,
    "CURRENT_DERIVED_AUTHORITY" | "ACCEPTED_HUMAN_AUTHORITY" | "LEGACY_COMPATIBILITY_AUTHORITY"
  >;
  readonly supersededReason: string;
  readonly sourceIdentity: VeronicaSemanticAuthorityIdentityInputs;
  readonly replacementSemanticIdentity: string;
}): Promise<{ readonly originalSha256: string; readonly archivePath: string; readonly metadataPath: string }> {
  const originalSha256 = sha256(input.raw);
  const archiveRoot = path.join(path.dirname(input.planPath), "pre-image-semantic-plan.superseded");
  const archivePath = path.join(archiveRoot, `${originalSha256}.json`);
  const metadataPath = path.join(archiveRoot, `${originalSha256}.metadata.json`);
  await fs.mkdir(archiveRoot, { recursive: true });
  if (!(await fileExists(archivePath))) await fs.writeFile(archivePath, input.raw, { flag: "wx" });
  if (!(await fileExists(metadataPath))) {
    await fs.writeFile(metadataPath, `${JSON.stringify({
      schemaVersion: "veronica-superseded-semantic-plan.v1",
      originalPath: input.planPath,
      originalSha256,
      classification: input.classification,
      supersededReason: input.supersededReason,
      sourceIdentity: input.sourceIdentity,
      replacementSemanticIdentity: input.replacementSemanticIdentity,
    }, null, 2)}\n`, { flag: "wx" });
  }
  return { originalSha256, archivePath, metadataPath };
}

export async function publishVeronicaSemanticPlanAuthorityAtomic(input: {
  readonly planPath: string;
  readonly plan: unknown;
  readonly writeAtomic?: typeof writeJsonAtomic;
}): Promise<void> {
  await (input.writeAtomic ?? writeJsonAtomic)(input.planPath, input.plan);
}

export const VERONICA_SEMANTIC_DESCENDANT_PATHS = [
  "shared/visual-beats.v1.json",
  "shared/source-grounded-qa-admission.v1.json",
  "shared/provider-image-prompts.v1.json",
  "shared/provider-image-prompts.v1.md",
] as const;

export async function invalidateVeronicaSemanticDescendants(input: {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "full" | "short";
}): Promise<readonly string[]> {
  const relativePaths = [
    ...VERONICA_SEMANTIC_DESCENDANT_PATHS,
    `locales/${input.language}/${input.variant}/localized-production.v1.json`,
    `locales/${input.language}/${input.variant}/localized-visual-events.v1.json`,
  ];
  const removed: string[] = [];
  for (const relativePath of relativePaths) {
    const target = path.join(input.episodeDir, relativePath);
    if (!(await fileExists(target))) continue;
    await fs.rm(target, { force: true });
    removed.push(relativePath);
  }
  return removed;
}
