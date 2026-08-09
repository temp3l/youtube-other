import { createHash } from "node:crypto";

import { contentProfileIdSchema, normalizeContentProfileId } from "@mediaforge/domain";
import { z } from "zod";

import type { YoutubePublicationReceipt, YoutubeReconciliationClient } from "./publication-reconciliation.js";
import { YoutubePublicationEvidenceLookup } from "./publication-reconciliation.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const identifierSchema = z.string().trim().min(1);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Publication intent cannot contain a non-finite number.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("Publication intent contains an unsupported value.");
}

const hash = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");

const artifactSchema = z.strictObject({
  assetId: identifierSchema,
  role: z.enum(["render", "preview", "captions"]),
  contentHash: sha256Schema,
});

const approvalSchema = z.strictObject({
  approvalIds: z.array(identifierSchema).min(2).refine((ids) => new Set(ids).size === ids.length, "Publication approvals must be distinct."),
  boundRevision: identifierSchema,
  artifactHash: sha256Schema,
});

export const youtubePublicationIntentSchema = z.strictObject({
  schemaVersion: z.literal("youtube-publication-intent.v1"),
  publicationId: z.string().regex(/^publication-[a-f0-9]{16}$/u),
  contentProfileId: contentProfileIdSchema,
  episodeId: identifierSchema,
  productionRevisionId: identifierSchema,
  locale: identifierSchema,
  deliveryBundleId: identifierSchema,
  deliveryBundleFingerprint: sha256Schema,
  effectiveConfigurationHash: sha256Schema,
  dependencyIdentity: z.record(identifierSchema, sha256Schema),
  provenance: z.strictObject({
    source: z.literal("approved-delivery-bundle"),
    localeEditionId: identifierSchema,
    localeEditionFingerprint: sha256Schema,
    renderDerivativeId: identifierSchema,
    renderDerivativeFingerprint: sha256Schema,
  }),
  target: z.strictObject({
    channelId: identifierSchema,
    accountId: identifierSchema,
    visibility: z.enum(["private", "unlisted", "public"]),
    playlistIds: z.array(identifierSchema).min(1),
  }),
  artifacts: z.array(artifactSchema).min(1),
  approval: approvalSchema,
  authorization: z.strictObject({ actorId: identifierSchema, permission: z.enum(["publication.execute", "publication.schedule"]) }),
  idempotency: z.strictObject({ key: identifierSchema, fingerprint: sha256Schema }),
  recoveryIdentity: identifierSchema,
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  state: z.enum(["preflighted", "scheduled", "reconciliation_required", "published"]),
  reuseRationale: z.enum(["new-intent", "content-hash-match"]),
  regenerationRationale: z.enum(["new-publication-intent", "not-regenerated", "delivery-bundle-changed", "configuration-changed", "dependency-changed"]),
  providerDispatchEnabled: z.literal(false),
  fingerprint: sha256Schema,
});
export type YoutubePublicationIntent = z.infer<typeof youtubePublicationIntentSchema>;

export interface PlanYoutubePublicationIntentInput {
  readonly contentProfileId: string;
  readonly episodeId: string;
  readonly productionRevisionId: string;
  readonly locale: string;
  readonly deliveryBundleId: string;
  readonly deliveryBundleFingerprint: string;
  readonly effectiveConfigurationHash: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly provenance: YoutubePublicationIntent["provenance"];
  readonly target: YoutubePublicationIntent["target"];
  readonly artifacts: readonly YoutubePublicationIntent["artifacts"][number][];
  readonly approval: YoutubePublicationIntent["approval"];
  readonly authorization: { readonly actorId: string; readonly allowed: boolean; readonly permissions: readonly string[] };
  readonly idempotency: Pick<YoutubePublicationIntent["idempotency"], "key">;
  readonly scheduledAt?: string | null;
  readonly previousIntent?: YoutubePublicationIntent;
}

function requireAuthorized(input: PlanYoutubePublicationIntentInput): "publication.execute" | "publication.schedule" {
  const scheduling = input.scheduledAt !== undefined && input.scheduledAt !== null;
  const permission = scheduling ? "publication.schedule" : "publication.execute";
  if (
    !input.authorization.allowed ||
    input.authorization.actorId.trim().length === 0 ||
    !input.authorization.permissions.includes(permission)
  ) {
    throw new Error("YOUTUBE_PUBLICATION_AUTHORIZATION_REQUIRED");
  }
  return permission;
}

/**
 * Produces a durable-intent-shaped, immutable preflight artifact. Persistence
 * and any later provider worker must use this exact binding; this function
 * deliberately performs neither operation.
 */
export function planYoutubePublicationIntent(input: PlanYoutubePublicationIntentInput): { readonly intent: YoutubePublicationIntent; readonly reused: boolean } {
  const permission = requireAuthorized(input);
  const contentProfileId = contentProfileIdSchema.parse(normalizeContentProfileId(input.contentProfileId));
  const scheduledAt = input.scheduledAt ?? null;
  if (scheduledAt !== null && Date.parse(scheduledAt) <= Date.now()) throw new Error("YOUTUBE_PUBLICATION_SCHEDULE_INVALID");
  const approval = approvalSchema.parse(input.approval);
  if (
    approval.boundRevision !== input.productionRevisionId ||
    approval.artifactHash !== input.deliveryBundleFingerprint
  ) throw new Error("YOUTUBE_PUBLICATION_APPROVAL_STALE");
  const target = youtubePublicationIntentSchema.shape.target.parse({
    ...input.target,
    playlistIds: [...new Set(input.target.playlistIds.map((id) => id.trim()))].sort(),
  });
  const artifacts = [...input.artifacts].sort((left, right) => left.role.localeCompare(right.role) || left.assetId.localeCompare(right.assetId));
  if (new Set(artifacts.map((artifact) => `${artifact.role}\u0000${artifact.assetId}`)).size !== artifacts.length) throw new Error("YOUTUBE_PUBLICATION_ARTIFACTS_INVALID");
  if (!artifacts.some((artifact) => artifact.role === "render")) throw new Error("YOUTUBE_PUBLICATION_RENDER_REQUIRED");
  const authorization = { actorId: input.authorization.actorId, permission };
  const idempotency = {
    key: input.idempotency.key,
    fingerprint: hash({
      key: input.idempotency.key,
      contentProfileId,
      episodeId: input.episodeId,
      productionRevisionId: input.productionRevisionId,
      deliveryBundleFingerprint: input.deliveryBundleFingerprint,
      target,
      artifacts,
      scheduledAt,
    }),
  };
  const material = {
    schemaVersion: "youtube-publication-intent.v1" as const,
    contentProfileId,
    episodeId: input.episodeId,
    productionRevisionId: input.productionRevisionId,
    locale: input.locale,
    deliveryBundleId: input.deliveryBundleId,
    deliveryBundleFingerprint: input.deliveryBundleFingerprint,
    effectiveConfigurationHash: input.effectiveConfigurationHash,
    dependencyIdentity: input.dependencyIdentity,
    provenance: input.provenance,
    target,
    artifacts,
    approval,
    authorization,
    idempotency,
    scheduledAt,
  };
  const fingerprint = hash(material);
  const reused = input.previousIntent?.fingerprint === fingerprint;
  const regenerationRationale = reused
    ? "not-regenerated"
    : !input.previousIntent
      ? "new-publication-intent"
      : input.previousIntent.deliveryBundleFingerprint !== input.deliveryBundleFingerprint
        ? "delivery-bundle-changed"
        : input.previousIntent.effectiveConfigurationHash !== input.effectiveConfigurationHash
          ? "configuration-changed"
          : canonicalJson(input.previousIntent.dependencyIdentity) !== canonicalJson(input.dependencyIdentity)
            ? "dependency-changed"
            : "new-publication-intent";
  return {
    intent: youtubePublicationIntentSchema.parse({
      ...material,
      publicationId: `publication-${fingerprint.slice(0, 16)}`,
      recoveryIdentity: `youtube-${fingerprint.slice(0, 16)}`,
      state: scheduledAt ? "scheduled" : "preflighted",
      reuseRationale: reused ? "content-hash-match" : "new-intent",
      regenerationRationale,
      providerDispatchEnabled: false,
      fingerprint,
    }),
    reused,
  };
}

export interface PublicationAuditSink {
  append(input: { readonly action: "publication.preflighted" | "publication.scheduled" | "publication.reconciled"; readonly publicationId: string; readonly evidence: Record<string, string> }): Promise<void>;
}

/** Records only redacted identifiers; scheduling remains a provider-free intent. */
export async function auditYoutubePublicationIntent(intent: YoutubePublicationIntent, audit: PublicationAuditSink): Promise<void> {
  const parsed = youtubePublicationIntentSchema.parse(intent);
  await audit.append({
    action: parsed.scheduledAt ? "publication.scheduled" : "publication.preflighted",
    publicationId: parsed.publicationId,
    evidence: { fingerprint: parsed.fingerprint, productionRevisionId: parsed.productionRevisionId, deliveryBundleFingerprint: parsed.deliveryBundleFingerprint },
  });
}

export async function reconcileYoutubePublicationIntent(input: { readonly intent: YoutubePublicationIntent; readonly client: YoutubeReconciliationClient; readonly audit?: PublicationAuditSink }): Promise<{ readonly state: "published" | "reconciliation_required"; readonly receipt: YoutubePublicationReceipt | null }> {
  const intent = youtubePublicationIntentSchema.parse(input.intent);
  const receipts = await new YoutubePublicationEvidenceLookup(input.client).findByRecoveryIdentity({ publicationId: intent.publicationId, recoveryIdentity: intent.recoveryIdentity });
  const candidate = receipts.length === 1 && receipts[0]!.recoveryIdentity === intent.recoveryIdentity ? receipts[0]! : null;
  const evidence = candidate?.evidence && typeof candidate.evidence === "object"
    ? candidate.evidence as Record<string, unknown>
    : {};
  const receipt = candidate &&
    evidence.channelId === intent.target.channelId &&
    evidence.privacyStatus === intent.target.visibility
    ? candidate
    : null;
  const state = receipt ? "published" as const : "reconciliation_required" as const;
  if (input.audit) await input.audit.append({ action: "publication.reconciled", publicationId: intent.publicationId, evidence: { fingerprint: intent.fingerprint, result: state } });
  return { state, receipt };
}
