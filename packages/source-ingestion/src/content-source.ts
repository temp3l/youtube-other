import { createHash } from "node:crypto";
import {
  contentProfileIdSchema,
  type ContentProfileId,
} from "@mediaforge/domain";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const sourceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);

/** A source payload is immutable; extraction always produces a new lineage node. */
export const mixedSourceKindSchema = z.enum([
  "document",
  "image",
  "screenshot",
  "extracted-region",
]);
export type MixedSourceKind = z.infer<typeof mixedSourceKindSchema>;

export const sourceDisplayPolicySchema = z.enum([
  "display-allowed",
  "context-only",
  "forbidden-display",
]);
export type SourceDisplayPolicy = z.infer<typeof sourceDisplayPolicySchema>;

export const sourceLineageSchema = z.strictObject({
  originSourceId: sourceIdSchema,
  originChecksum: sha256Schema,
  parentArtifactId: sourceIdSchema.optional(),
  extractionMethod: z.string().min(1),
});

export const canonicalMixedSourceArtifactSchema = z.strictObject({
  artifactId: sourceIdSchema,
  kind: mixedSourceKindSchema,
  checksum: sha256Schema,
  byteLength: z.number().int().positive(),
  mimeType: z.string().min(1),
  displayPolicy: sourceDisplayPolicySchema,
  immutableOriginal: z.literal(true),
  lineage: sourceLineageSchema,
});
export type CanonicalMixedSourceArtifact = z.infer<
  typeof canonicalMixedSourceArtifactSchema
>;

/**
 * Revision-bound canonical manifest for mixed source material. It carries only
 * stable identity and lineage, so profile policy remains owned by its existing
 * configuration service.
 */
export const canonicalMixedSourceManifestSchema = z.strictObject({
  schemaVersion: z.literal("canonical-mixed-source-manifest.v1"),
  profileId: contentProfileIdSchema,
  episodeId: sourceIdSchema,
  revisionId: z.string().min(1),
  effectiveConfigurationHash: sha256Schema,
  dependencyIdentity: z.record(z.string().min(1), sha256Schema),
  artifacts: z.array(canonicalMixedSourceArtifactSchema).min(1),
});
export type CanonicalMixedSourceManifest = z.infer<
  typeof canonicalMixedSourceManifestSchema
>;

export function hashMixedSourceBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Normalizes the deprecated alias before any manifest can be persisted. */
export function createCanonicalMixedSourceManifest(input: {
  readonly profileId: ContentProfileId | "strategic-reinvention";
  readonly episodeId: string;
  readonly revisionId: string;
  readonly effectiveConfigurationHash: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly artifacts: readonly CanonicalMixedSourceArtifact[];
}): CanonicalMixedSourceManifest {
  return canonicalMixedSourceManifestSchema.parse({
    ...input,
    schemaVersion: "canonical-mixed-source-manifest.v1",
  });
}

export function assertDisplayAllowed(policy: SourceDisplayPolicy): void {
  if (policy !== "display-allowed") {
    throw new Error(`Source policy ${policy} does not permit visual display.`);
  }
}
