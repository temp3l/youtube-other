import {
  approvalIdSchema,
  attemptIdSchema,
  episodeIdSchema,
  supportedLanguageCodeSchema,
  taskIdSchema,
  videoVariantSchema,
  workflowRunIdSchema,
} from "@mediaforge/domain";
import { hashProductionValue } from "@mediaforge/shared";
import { z } from "zod";

const canonicalIdSchema = z.string().trim().min(1).max(200);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const canonicalPublicationArtifactBindingSchema = z.object({
  assetId: canonicalIdSchema,
  role: canonicalIdSchema,
  contentHash: sha256Schema,
});

export type CanonicalPublicationArtifactBinding = z.infer<
  typeof canonicalPublicationArtifactBindingSchema
>;

export const publishEpisodeMetadataSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5_000),
  tags: z.array(z.string().trim().min(1)).max(500),
  categoryId: canonicalIdSchema,
  privacyStatus: z.enum(["private", "unlisted", "public"]),
  madeForKids: z.boolean(),
  containsSyntheticMedia: z.boolean().optional(),
  notifySubscribers: z.boolean(),
  defaultLanguage: supportedLanguageCodeSchema.optional(),
  publishAt: z.iso.datetime({ offset: true }).nullable(),
});

export type PublishEpisodeMetadata = z.infer<
  typeof publishEpisodeMetadataSchema
>;

export const canonicalPublishEpisodeInputSchema = z
  .object({
    workspaceId: canonicalIdSchema,
    projectId: canonicalIdSchema,
    workflowRunId: workflowRunIdSchema,
    episodeId: episodeIdSchema,
    taskId: taskIdSchema,
    attemptId: attemptIdSchema,
    publicationId: canonicalIdSchema,
    approval: z.object({
      id: approvalIdSchema,
      revision: z.number().int().nonnegative(),
      artifactHash: sha256Schema,
      policy: z.enum(["legacy-v1", "scoped-v1"]),
    }),
    actor: z.object({
      principalId: canonicalIdSchema,
      revision: z.number().int().nonnegative(),
    }),
    credentialVersion: canonicalIdSchema,
    artifacts: z.object({
      aggregateHash: sha256Schema,
      bindings: z.array(canonicalPublicationArtifactBindingSchema).min(2),
    }),
    target: z.object({
      channelId: canonicalIdSchema,
      visibility: z.enum(["private", "unlisted", "public"]),
      scheduledAt: z.iso.datetime({ offset: true }).nullable(),
      playlistIds: z.array(canonicalIdSchema),
    }),
    recoveryIdentity: canonicalIdSchema,
    providerRequest: z.object({
      expectedChannelId: canonicalIdSchema,
      recoveryIdentity: canonicalIdSchema,
      video: z.object({
        absolutePath: z.string().trim().min(1),
        contentHash: sha256Schema,
      }),
      metadata: publishEpisodeMetadataSchema,
      metadataContentHash: sha256Schema,
      thumbnail: z
        .object({
          absolutePath: z.string().trim().min(1),
          contentHash: sha256Schema,
        })
        .optional(),
    }),
    leaseSeconds: z.number().int().positive(),
  })
  .superRefine((input, context) => {
    const roles = new Set<string>();
    for (const binding of input.artifacts.bindings) {
      if (roles.has(binding.role)) {
        context.addIssue({
          code: "custom",
          path: ["artifacts", "bindings"],
          message: `Duplicate publication artifact role: ${binding.role}.`,
        });
      }
      roles.add(binding.role);
    }
    const video = input.artifacts.bindings.find(
      (binding) => binding.role === "video"
    );
    const metadata = input.artifacts.bindings.find(
      (binding) => binding.role === "metadata"
    );
    const thumbnail = input.artifacts.bindings.find(
      (binding) => binding.role === "thumbnail"
    );
    if (video?.contentHash !== input.providerRequest.video.contentHash) {
      context.addIssue({
        code: "custom",
        path: ["providerRequest", "video", "contentHash"],
        message: "Provider video does not match the admitted video artifact.",
      });
    }
    if (metadata?.contentHash !== input.providerRequest.metadataContentHash) {
      context.addIssue({
        code: "custom",
        path: ["providerRequest", "metadataContentHash"],
        message: "Provider metadata does not match the admitted metadata artifact.",
      });
    }
    if (
      input.providerRequest.thumbnail &&
      thumbnail?.contentHash !== input.providerRequest.thumbnail.contentHash
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerRequest", "thumbnail", "contentHash"],
        message: "Provider thumbnail does not match the admitted thumbnail artifact.",
      });
    }
    if (input.artifacts.aggregateHash !== publicationAssetHash(input.artifacts.bindings)) {
      context.addIssue({
        code: "custom",
        path: ["artifacts", "aggregateHash"],
        message: "Publication aggregate hash does not match its artifact bindings.",
      });
    }
    if (
      input.providerRequest.metadataContentHash !==
      publicationMetadataHash(input.providerRequest.metadata)
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerRequest", "metadataContentHash"],
        message: "Publication metadata hash is stale.",
      });
    }
    if (
      input.providerRequest.expectedChannelId !== input.target.channelId ||
      input.providerRequest.recoveryIdentity !== input.recoveryIdentity ||
      input.providerRequest.metadata.privacyStatus !== input.target.visibility ||
      input.providerRequest.metadata.publishAt !== input.target.scheduledAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerRequest"],
        message: "Provider request does not match the immutable publication target.",
      });
    }
  });

export type CanonicalPublishEpisodeInput = z.infer<
  typeof canonicalPublishEpisodeInputSchema
> & {
  readonly signal?: AbortSignal;
};

export type PublishEpisodeResult =
  | {
      readonly kind: "published";
      readonly publicationId: string;
      readonly providerObjectId: string;
      readonly reconciled: boolean;
    }
  | {
      readonly kind: "already-published";
      readonly publicationId: string;
    }
  | {
      readonly kind: "reconciliation-required";
      readonly publicationId: string;
      readonly reason:
        | "ambiguous-provider-result"
        | "abandoned-execution"
        | "no_match"
        | "multiple_matches"
        | "provider_unavailable"
        | "recovery_identity_mismatch";
    }
  | {
      readonly kind: "failed-before-effect";
      readonly publicationId: string;
      readonly reason: string;
    }
  | {
      readonly kind: "deferred";
      readonly publicationId: string;
      readonly reason: "intent-lease-unavailable" | "channel-lease-unavailable";
    };

export interface PublishEpisodeExecutor {
  execute(input: CanonicalPublishEpisodeInput): Promise<PublishEpisodeResult>;
}

export function publicationAssetHash(
  bindings: readonly CanonicalPublicationArtifactBinding[]
): string {
  return hashProductionValue(
    [...bindings].sort((left, right) =>
      `${left.role}:${left.assetId}`.localeCompare(`${right.role}:${right.assetId}`)
    )
  );
}

export function publicationMetadataHash(
  metadata: PublishEpisodeMetadata
): string {
  return hashProductionValue(publishEpisodeMetadataSchema.parse(metadata));
}
