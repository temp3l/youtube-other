import { createHash } from "node:crypto";
import {
  contentProfileIdSchema,
  normalizeContentProfileId,
  type ContentProfileId,
} from "@mediaforge/domain";
import { z } from "zod";

export const DELIVERY_BUNDLE_SCHEMA_VERSION = "delivery-bundle.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const identifierSchema = z.string().trim().min(1);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

const editableLocaleMetadataSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1)).max(500),
  chapters: z.array(z.strictObject({
    startSeconds: z.number().nonnegative(),
    title: z.string().trim().min(1),
  })),
  thumbnailText: z.string().trim().min(1).max(100).optional(),
  pinnedComment: z.string().trim().min(1).optional(),
});
export type EditableLocaleMetadata = z.infer<typeof editableLocaleMetadataSchema>;

const deliveryFileSchema = z.strictObject({
  artifactId: identifierSchema,
  relativePath: z.string().trim().min(1).refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !/^[a-z]:/iu.test(value) &&
      !value.split("/").includes(".."),
    "Delivery files must be relative and contained.",
  ),
  fingerprint: sha256Schema,
});

export const deliveryBundleSchema = z.strictObject({
  schemaVersion: z.literal(DELIVERY_BUNDLE_SCHEMA_VERSION),
  contentProfileId: contentProfileIdSchema,
  bundleId: z.string().regex(/^delivery-bundle-[a-f0-9]{16}$/u),
  episodeId: identifierSchema,
  productionRevisionId: identifierSchema,
  locale: identifierSchema,
  metadataRevisionId: z.string().regex(/^metadata-[a-f0-9]{16}$/u),
  metadata: editableLocaleMetadataSchema,
  files: z.strictObject({
    render: deliveryFileSchema,
    preview: deliveryFileSchema.optional(),
    captions: deliveryFileSchema.optional(),
  }),
  effectiveConfigurationHash: sha256Schema,
  dependencyIdentity: z.record(z.string().min(1), sha256Schema),
  provenance: z.strictObject({
    source: z.literal("approved-revision-artifacts"),
    localeEditionId: identifierSchema,
    localeEditionFingerprint: sha256Schema,
    renderDerivativeId: identifierSchema,
    renderDerivativeFingerprint: sha256Schema,
  }),
  approval: z.strictObject({
    state: z.literal("approved"),
    approvalIds: z.array(identifierSchema).min(2).refine(
      (approvalIds) => new Set(approvalIds).size === approvalIds.length,
      "Delivery approval actors must be distinct.",
    ),
    boundRevision: identifierSchema,
  }),
  reuseRationale: z.enum(["new-content", "content-hash-match"]),
  regenerationRationale: z.enum([
    "new-delivery-bundle",
    "metadata-changed",
    "render-changed",
    "configuration-changed",
    "dependency-changed",
  ]),
  visualsInvalidated: z.literal(false),
  execution: z.strictObject({
    state: z.literal("planned"),
    providerDispatchEnabled: z.literal(false),
    publicationEnabled: z.literal(false),
  }),
  fingerprint: sha256Schema,
});
export type DeliveryBundle = z.infer<typeof deliveryBundleSchema>;

export interface PlanDeliveryBundleInput {
  readonly contentProfileId: ContentProfileId | "strategic-reinvention" | "veronica-benini";
  readonly episodeId: string;
  readonly productionRevisionId: string;
  readonly locale: string;
  readonly metadata: EditableLocaleMetadata;
  readonly files: DeliveryBundle["files"];
  readonly effectiveConfiguration: unknown;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly provenance: DeliveryBundle["provenance"];
  readonly approval: DeliveryBundle["approval"];
  readonly regenerationRationale: DeliveryBundle["regenerationRationale"];
  readonly previousBundle?: DeliveryBundle;
}

/**
 * Produces a revision-bound, editable delivery manifest only. It never writes,
 * uploads, publishes, or changes the render/visual derivatives it references.
 */
export function planDeliveryBundle(input: PlanDeliveryBundleInput): {
  readonly bundle: DeliveryBundle;
  readonly reused: boolean;
} {
  const contentProfileId = contentProfileIdSchema.parse(
    normalizeContentProfileId(input.contentProfileId),
  );
  const metadata = editableLocaleMetadataSchema.parse(input.metadata);
  const files = z.strictObject({
    render: deliveryFileSchema,
    preview: deliveryFileSchema.optional(),
    captions: deliveryFileSchema.optional(),
  }).parse(input.files);
  const provenance = deliveryBundleSchema.shape.provenance.parse(input.provenance);
  const approval = deliveryBundleSchema.shape.approval.parse(input.approval);
  const metadataRevisionId = `metadata-${fingerprint(metadata).slice(0, 16)}`;
  const material = {
    schemaVersion: DELIVERY_BUNDLE_SCHEMA_VERSION,
    contentProfileId,
    episodeId: input.episodeId,
    productionRevisionId: input.productionRevisionId,
    locale: input.locale,
    metadataRevisionId,
    metadata,
    files,
    effectiveConfiguration: input.effectiveConfiguration,
    dependencyIdentity: input.dependencyIdentity,
    provenance,
    approval,
  };
  const artifactFingerprint = fingerprint(material);
  const reused = input.previousBundle?.fingerprint === artifactFingerprint;
  const { effectiveConfiguration: _effectiveConfiguration, ...persisted } = material;
  return {
    bundle: deliveryBundleSchema.parse({
      ...persisted,
      bundleId: `delivery-bundle-${artifactFingerprint.slice(0, 16)}`,
      effectiveConfigurationHash: fingerprint(input.effectiveConfiguration),
      reuseRationale: reused ? "content-hash-match" : "new-content",
      regenerationRationale: input.regenerationRationale,
      visualsInvalidated: false,
      execution: {
        state: "planned",
        providerDispatchEnabled: false,
        publicationEnabled: false,
      },
      fingerprint: artifactFingerprint,
    }),
    reused,
  };
}

export function redactDeliveryBundleFailure(error: unknown): {
  readonly code: string;
  readonly message: string;
} {
  const candidate = error instanceof Error ? error.message : "";
  return {
    code: /^DELIVERY_BUNDLE_[A-Z_]+$/u.test(candidate)
      ? candidate
      : "DELIVERY_BUNDLE_INVALID",
    message: "Delivery bundle planning was blocked; inspect approved revision and artifact identities.",
  };
}
