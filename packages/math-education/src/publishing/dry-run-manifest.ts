import { z } from "zod";
import { mathMetadataSchema, type MathMetadata } from "../metadata/math-metadata.js";
import { canonicalHash } from "../verification/canonical-json.js";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const relativePathSchema = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").some((part) => part === "" || part === "." || part === ".."),
  "Publish paths must be contained portable relative paths."
);

export const mathPublishDryRunSchema = z.strictObject({
  artifactVersion: z.literal("math-publish-dry-run.v2"),
  identity: mathMetadataSchema.shape.identity,
  metadata: z.strictObject({ path: relativePathSchema, contentHash: hashSchema }),
  thumbnail: z.strictObject({
    manifestPath: relativePathSchema,
    manifestHash: hashSchema,
    assetPath: relativePathSchema,
    assetHash: hashSchema,
  }),
  finalMedia: z.strictObject({
    evidencePath: relativePathSchema,
    evidenceHash: hashSchema,
    mediaPath: relativePathSchema,
    mediaHash: hashSchema,
    qualityEvidenceHash: hashSchema,
  }),
  quality: z.strictObject({ path: relativePathSchema, contentHash: hashSchema }),
  brandPolicy: z.strictObject({
    path: relativePathSchema,
    contentHash: hashSchema,
    policyVersion: z.literal("math-brand-policy.v1"),
  }),
  channelId: z.string().min(1),
  privacyStatus: z.literal("private"),
  madeForKids: z.boolean(),
  containsSyntheticMedia: z.boolean(),
  playlistAssignments: z
    .array(
      z.strictObject({
        key: z.string().min(1),
        kind: z.enum(["grade", "topic", "variant"]),
        playlistId: z.string().min(1),
      })
    )
    .length(3),
  requestFingerprint: hashSchema,
  blockers: z.array(z.string().min(1)),
  dispatchAllowed: z.literal(false),
  paidProviderCalled: z.literal(false),
  networkCalls: z.literal(0),
  mutations: z.literal(0),
});
export type MathPublishDryRunManifest = z.infer<typeof mathPublishDryRunSchema>;

export interface CreatePublishDryRunManifestInput {
  metadata: MathMetadata;
  metadataPath: string;
  thumbnailManifestPath: string;
  thumbnailManifestHash: string;
  thumbnailAssetPath: string;
  thumbnailAssetHash: string;
  finalMediaPath: string;
  finalMediaHash: string;
  finalMediaEvidencePath: string;
  finalMediaEvidenceHash: string;
  qualityPath: string;
  qualityHash: string;
  brandPolicyPath: string;
  brandPolicyHash: string;
  channelId: string;
  privacyStatus: "private";
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  playlistIdsByKey: Readonly<Record<string, string>>;
  blockers?: readonly string[];
}

export function createPublishDryRunManifest(
  input: CreatePublishDryRunManifestInput
): MathPublishDryRunManifest {
  const metadata = mathMetadataSchema.parse(input.metadata);
  const localeRoot = `locales/${metadata.identity.language}`;
  const canonicalPaths = {
    metadataPath: `${localeRoot}/metadata.json`,
    thumbnailManifestPath: `${localeRoot}/thumbnail.svg.manifest.json`,
    thumbnailAssetPath: `${localeRoot}/thumbnail.svg`,
    finalMediaPath: `${localeRoot}/render/final.mp4`,
    finalMediaEvidencePath: `${localeRoot}/final-media.json`,
    qualityPath: "canonical/quality.json",
    brandPolicyPath: `${localeRoot}/brand-policy.json`,
  };
  for (const [field, expected] of Object.entries(canonicalPaths)) {
    const actual = input[field as keyof typeof canonicalPaths];
    relativePathSchema.parse(actual);
    if (actual !== expected)
      throw new Error(`PUBLISH_BLOCKED: ${field} must use canonical path ${expected}.`);
  }
  const playlistAssignments = metadata.playlists.map((playlist) => {
    const playlistId = input.playlistIdsByKey[playlist.key];
    if (!playlistId)
      throw new Error(`PUBLISH_BLOCKED: brand policy has no playlist mapping for ${playlist.key}.`);
    return { key: playlist.key, kind: playlist.kind, playlistId };
  });
  if (new Set(playlistAssignments.map((item) => item.playlistId)).size !== playlistAssignments.length)
    throw new Error("PUBLISH_BLOCKED: required playlist IDs must be unique.");
  const bound = {
    identity: metadata.identity,
    metadata: { path: input.metadataPath, contentHash: canonicalHash(metadata) },
    thumbnail: {
      manifestPath: input.thumbnailManifestPath,
      manifestHash: input.thumbnailManifestHash,
      assetPath: input.thumbnailAssetPath,
      assetHash: input.thumbnailAssetHash,
    },
    finalMedia: {
      evidencePath: input.finalMediaEvidencePath,
      evidenceHash: input.finalMediaEvidenceHash,
      mediaPath: input.finalMediaPath,
      mediaHash: input.finalMediaHash,
      qualityEvidenceHash: input.qualityHash,
    },
    quality: { path: input.qualityPath, contentHash: input.qualityHash },
    brandPolicy: {
      path: input.brandPolicyPath,
      contentHash: input.brandPolicyHash,
      policyVersion: "math-brand-policy.v1" as const,
    },
    channelId: input.channelId,
    privacyStatus: input.privacyStatus,
    madeForKids: input.madeForKids,
    containsSyntheticMedia: input.containsSyntheticMedia,
    playlistAssignments,
    blockers: [...(input.blockers ?? [])],
  };
  return mathPublishDryRunSchema.parse({
    artifactVersion: "math-publish-dry-run.v2",
    ...bound,
    requestFingerprint: canonicalHash(bound),
    blockers: bound.blockers,
    dispatchAllowed: false,
    paidProviderCalled: false,
    networkCalls: 0,
    mutations: 0,
  });
}
