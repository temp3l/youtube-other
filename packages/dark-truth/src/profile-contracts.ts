import crypto from "node:crypto";

import {
  SUPPORTED_CONTENT_LOCALES,
  contentLocaleSchema,
  contentVariantSchema,
  taskIdSchema,
} from "@mediaforge/domain";
import { z } from "zod";

export const DARK_TRUTH_STORY_BIBLE_SCHEMA_VERSION =
  "darktruth.story-bible.v1" as const;
export const DARK_TRUTH_REFERENCE_MANIFEST_SCHEMA_VERSION =
  "darktruth.reference-manifest.v1" as const;
export const DARK_TRUTH_PROFILE_CONTRACT_VERSION =
  "darktruth.profile.v1" as const;

const nonEmpty = z.string().trim().min(1);
const revision = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.iso.datetime({ offset: true });
const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u);

export const darkTruthApprovalBindingSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "revoked"]),
    actor: nonEmpty,
    reason: nonEmpty,
    createdAt: instant,
    expiresAt: instant.optional(),
    boundRevision: revision,
    contentHash: sha256,
  })
  .strict();
export type DarkTruthApprovalBinding = z.infer<
  typeof darkTruthApprovalBindingSchema
>;

export const bibleDocumentKinds = [
  "channel-story-bible",
  "genre-bible",
  "narrative-voice-guide",
  "visual-style-guide",
  "recurring-world-canon",
  "episode-bible",
  "character-bible",
  "location-bible",
  "threat-entity-bible",
  "continuity-manifest",
  "forbidden-pattern-register",
  "localization-notes",
  "pronunciation-guide",
  "reference-image-manifest",
] as const;
export const bibleDocumentKindSchema = z.enum(bibleDocumentKinds);

const lineageSchema = z
  .object({
    revision,
    contentHash: sha256,
    source: nonEmpty,
    createdAt: instant,
    supersedesRevision: revision.optional(),
  })
  .strict();

export const bibleDocumentReferenceSchema = z
  .object({
    kind: bibleDocumentKindSchema,
    revision,
    contentHash: sha256,
    relativePath: nonEmpty,
    lineage: z.array(lineageSchema).min(1),
    approval: darkTruthApprovalBindingSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const latest = value.lineage.at(-1);
    if (
      !latest ||
      latest.revision !== value.revision ||
      latest.contentHash !== value.contentHash
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["lineage"],
        message: "The latest lineage entry must match the current revision and hash.",
      });
    }
    if (
      value.approval &&
      (value.approval.boundRevision !== value.revision ||
        value.approval.contentHash !== value.contentHash)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["approval"],
        message: "Approval must bind the current document revision and hash.",
      });
    }
  });
export type BibleDocumentReference = z.infer<
  typeof bibleDocumentReferenceSchema
>;

const namedCharacterSchema = z
  .object({
    id: identifier,
    name: nonEmpty,
    role: nonEmpty,
    motivation: nonEmpty,
    appearance: nonEmpty,
    continuityTraits: z.array(nonEmpty).min(1),
    isMinor: z.boolean(),
    minorJustification: nonEmpty.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isMinor && !value.minorJustification) {
      ctx.addIssue({
        code: "custom",
        path: ["minorJustification"],
        message: "Minor characters require explicit justification.",
      });
    }
  });

export const darkTruthIdentityPolicySchema = z
  .object({
    identity: nonEmpty,
    audience: nonEmpty,
    tone: z.array(nonEmpty).min(1),
    themes: z.array(nonEmpty).min(1),
    bannedCliches: z.array(nonEmpty),
    bannedPhrases: z.array(nonEmpty),
    supernaturalRulePolicy: nonEmpty,
    characterRules: z.array(nonEmpty).min(1),
    escalationRules: z.array(nonEmpty).min(1),
    endingRules: z.array(nonEmpty).min(1),
    thumbnailPolicy: nonEmpty,
    audioPolicy: nonEmpty,
    localizationPolicy: nonEmpty,
    continuityPolicy: nonEmpty,
    safetyBoundaries: z.array(nonEmpty).min(1),
  })
  .strict();

export const darkTruthEpisodeBibleSchema = z
  .object({
    title: nonEmpty,
    logline: nonEmpty,
    premise: nonEmpty,
    protagonist: namedCharacterSchema,
    supportingCharacters: z.array(namedCharacterSchema).max(2),
    threat: z
      .object({
        id: identifier,
        name: nonEmpty,
        nature: nonEmpty,
        motivation: nonEmpty,
        continuityTraits: z.array(nonEmpty).min(1),
      })
      .strict(),
    location: z
      .object({
        id: identifier,
        name: nonEmpty,
        sensoryIdentity: z.array(nonEmpty).min(1),
        continuityTraits: z.array(nonEmpty).min(1),
      })
      .strict(),
    timeline: z.array(nonEmpty).min(1),
    supernaturalRule: nonEmpty,
    motivations: z.array(nonEmpty).min(1),
    emotionalCost: nonEmpty,
    revealStructure: z.array(nonEmpty).min(1),
    escalationLadder: z.array(nonEmpty).min(3),
    keyVisuals: z.array(nonEmpty).min(1),
    ending: nonEmpty,
    continuityConstraints: z.array(nonEmpty).min(1),
    requiredReferences: z.array(identifier).min(1),
    prohibitedDeviations: z.array(nonEmpty).min(1),
    pronunciation: z.record(nonEmpty, nonEmpty),
    adaptationNotes: z.record(contentLocaleSchema, z.array(nonEmpty)),
  })
  .strict();
export type DarkTruthEpisodeBible = z.infer<
  typeof darkTruthEpisodeBibleSchema
>;

export const storyBibleManifestSchema = z
  .object({
    schemaVersion: z.literal(DARK_TRUTH_STORY_BIBLE_SCHEMA_VERSION),
    profileId: z.literal("dark-truth"),
    episodeId: identifier,
    revision,
    profileRevision: revision,
    workflowRevision: revision,
    contentHash: sha256,
    createdAt: instant,
    updatedAt: instant,
    identityPolicy: darkTruthIdentityPolicySchema,
    episode: darkTruthEpisodeBibleSchema,
    documents: z.array(bibleDocumentReferenceSchema),
    approval: darkTruthApprovalBindingSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const kinds = new Set(value.documents.map((document) => document.kind));
    for (const kind of bibleDocumentKinds) {
      if (!kinds.has(kind)) {
        ctx.addIssue({
          code: "custom",
          path: ["documents"],
          message: `Missing required bible document ${kind}.`,
        });
      }
    }
    if (kinds.size !== value.documents.length) {
      ctx.addIssue({
        code: "custom",
        path: ["documents"],
        message: "Bible document kinds must be unique.",
      });
    }
    if (
      value.approval &&
      (value.approval.boundRevision !== value.revision ||
        value.approval.contentHash !== value.contentHash)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["approval"],
        message: "Manifest approval must bind the current revision and hash.",
      });
    }
  });
export type StoryBibleManifest = z.infer<typeof storyBibleManifestSchema>;

export const referenceRoles = [
  "protagonist",
  "supporting-character",
  "threat-entity",
  "hero-location",
  "recurring-prop",
  "palette-lighting",
  "camera-language",
  "thumbnail-composition",
  "aspect-ratio",
  "full-video-set",
  "short-specific-set",
] as const;
export const referenceRoleSchema = z.enum(referenceRoles);

export const referenceImageEntrySchema = z
  .object({
    id: identifier,
    role: referenceRoleSchema,
    classification: z.enum(["canonical", "inspiration"]),
    relativePath: nonEmpty,
    checksumSha256: sha256,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspectRatio: nonEmpty,
    subjectIdentity: nonEmpty,
    continuityIdentity: nonEmpty,
    provider: nonEmpty.optional(),
    model: nonEmpty.optional(),
    providerRequestId: nonEmpty.optional(),
    promptVersion: revision,
    promptHash: sha256,
    seedMetadata: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    importedOrigin: nonEmpty.optional(),
    rights: nonEmpty.optional(),
    approval: darkTruthApprovalBindingSchema.optional(),
    replacesReferenceId: identifier.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.classification === "canonical" && value.approval) {
      if (
        value.approval.boundRevision !== value.id ||
        value.approval.contentHash !== value.checksumSha256
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["approval"],
          message: "Reference approval must bind its ID and checksum.",
        });
      }
    }
  });
export type ReferenceImageEntry = z.infer<typeof referenceImageEntrySchema>;

export const referenceUsageBindingSchema = z
  .object({
    taskId: taskIdSchema,
    variant: contentVariantSchema,
    sceneId: identifier.optional(),
    thumbnailId: identifier.optional(),
    referenceIds: z.array(identifier).min(1),
  })
  .strict()
  .refine((value) => Boolean(value.sceneId) !== Boolean(value.thumbnailId), {
    message: "A reference binding must identify exactly one scene or thumbnail.",
  });

export const referenceImageManifestSchema = z
  .object({
    schemaVersion: z.literal(DARK_TRUTH_REFERENCE_MANIFEST_SCHEMA_VERSION),
    id: identifier,
    episodeId: identifier,
    profileId: z.literal("dark-truth"),
    revision,
    bibleRevision: revision,
    workflowRevision: revision,
    requiredCoverage: z
      .object({
        full: z.array(referenceRoleSchema).min(1),
        short: z.array(referenceRoleSchema).min(1),
      })
      .strict(),
    entries: z.array(referenceImageEntrySchema),
    usageBindings: z.array(referenceUsageBindingSchema),
    validation: z
      .object({
        status: z.enum(["pending", "passed", "failed"]),
        checkedAt: instant.optional(),
        issues: z.array(nonEmpty),
      })
      .strict(),
    continuity: z
      .object({
        status: z.enum(["pending", "passed", "failed"]),
        checkedAt: instant.optional(),
        issues: z.array(nonEmpty),
      })
      .strict(),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.entries.map((entry) => entry.id));
    if (ids.size !== value.entries.length) {
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "Reference IDs must be unique.",
      });
    }
    for (const binding of value.usageBindings) {
      for (const id of binding.referenceIds) {
        if (!ids.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["usageBindings"],
            message: `Usage binding references unknown reference ${id}.`,
          });
        }
      }
    }
  });
export type ReferenceImageManifest = z.infer<
  typeof referenceImageManifestSchema
>;

export const darkTruthReferenceOverrideSchema = z
  .object({
    actor: nonEmpty,
    reason: nonEmpty,
    taskIds: z.array(taskIdSchema).min(1),
    createdAt: instant,
    expiresAt: instant,
    boundBibleRevision: revision,
    boundReferenceRevision: revision,
  })
  .strict();
export type DarkTruthReferenceOverride = z.infer<
  typeof darkTruthReferenceOverrideSchema
>;

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalized(item)])
    );
  }
  return value;
}

export function hashDarkTruthContract(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized(value)))
    .digest("hex");
}

export interface StoryBibleDiff {
  readonly fromRevision: string;
  readonly toRevision: string;
  readonly changedDocuments: readonly (typeof bibleDocumentKinds)[number][];
  readonly episodeChanged: boolean;
  readonly identityPolicyChanged: boolean;
}

export function diffStoryBibles(
  previous: StoryBibleManifest,
  next: StoryBibleManifest
): StoryBibleDiff {
  const previousDocuments = new Map(
    previous.documents.map((document) => [document.kind, document])
  );
  return {
    fromRevision: previous.revision,
    toRevision: next.revision,
    changedDocuments: next.documents
      .filter((document) => {
        const prior = previousDocuments.get(document.kind);
        return (
          !prior ||
          prior.revision !== document.revision ||
          prior.contentHash !== document.contentHash
        );
      })
      .map((document) => document.kind),
    episodeChanged:
      hashDarkTruthContract(previous.episode) !==
      hashDarkTruthContract(next.episode),
    identityPolicyChanged:
      hashDarkTruthContract(previous.identityPolicy) !==
      hashDarkTruthContract(next.identityPolicy),
  };
}

export const DARK_TRUTH_SUPPORTED_LOCALES = SUPPORTED_CONTENT_LOCALES;
