import {
  contentSourceManifestSchema,
  type ContentSourceManifest,
  type ContentLocale,
  type ContentTier,
} from "@mediaforge/domain";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type EditorialAspectRatio = "16:9" | "9:16";

export type EditorialVisualTreatment =
  | "typography"
  | "diagram"
  | "timeline"
  | "decision-tree"
  | "worksheet"
  | "supplied-creator-media"
  | "b-roll"
  | "restrained-illustration";

export interface EditorialCompositionBrief {
  readonly beatId: string;
  readonly sourceIds: readonly string[];
  readonly treatment: EditorialVisualTreatment;
  readonly visualIntent: string;
  /** Explicit provenance for the aspect-specific editorial decision. */
  readonly authorship: "independent" | "reused" | "crop-derived";
  readonly sourceCompositionId?: string;
}

export interface EditorialAspectBrief {
  readonly aspectRatio: EditorialAspectRatio;
  readonly compositions: readonly EditorialCompositionBrief[];
}

export interface SuppliedMediaRightsEvidence {
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly mediaSha256: string;
}

export interface SuppliedEditorialMedia {
  readonly mediaId: string;
  readonly mediaBytes?: Uint8Array;
  readonly mediaPath?: string;
  readonly sourceManifest: ContentSourceManifest;
  readonly rightsEvidence: SuppliedMediaRightsEvidence;
}

interface ValidatedSuppliedEditorialMedia {
  readonly media: SuppliedEditorialMedia;
  readonly mediaSha256: string;
}

export interface EditorialComposition {
  readonly compositionId: string;
  readonly beatId: string;
  readonly sourceIds: readonly string[];
  readonly aspectRatio: EditorialAspectRatio;
  readonly layout: "landscape-editorial-grid" | "portrait-editorial-stack";
  readonly treatment: EditorialVisualTreatment;
  readonly visualIntent: string;
  readonly suppliedMediaId?: string;
  readonly suppliedMediaSha256?: string;
}

export interface EditorialDocumentaryPlan {
  readonly planId: string;
  readonly aspectRatio: EditorialAspectRatio;
  readonly compositions: readonly EditorialComposition[];
}

export interface EditorialDocumentaryPlanSet {
  readonly landscape: EditorialDocumentaryPlan;
  readonly portrait: EditorialDocumentaryPlan;
}

export type EditorialDocumentaryPlanningErrorCode =
  | "INVALID_ASPECT_BRIEF"
  | "DUPLICATE_BEAT_ID"
  | "ASPECT_LINEAGE_MISMATCH"
  | "PORTRAIT_PLAN_NOT_INDEPENDENT"
  | "SUPPLIED_MEDIA_EVIDENCE_REQUIRED"
  | "SUPPLIED_MEDIA_SOURCE_UNTRACED"
  | "SUPPLIED_MEDIA_HASH_MISMATCH"
  | "SUPPLIED_MEDIA_RIGHTS_REQUIRED"
  | "SUPPLIED_MEDIA_EXPIRED"
  | "SUPPLIED_MEDIA_ACCESS_LEAKAGE"
  | "SUPPLIED_MEDIA_SENSITIVITY_BLOCKED"
  | "SUPPLIED_MEDIA_APPROVAL_REQUIRED";

export class EditorialDocumentaryPlanningError extends Error {
  public constructor(
    public readonly code: EditorialDocumentaryPlanningErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EditorialDocumentaryPlanningError";
  }
}

const sha256Pattern = /^[a-f0-9]{64}$/u;
const accessRank: Readonly<Record<ContentTier, number>> = {
  public: 0,
  "lead-generation": 1,
  premium: 2,
  private: 3,
};

function validateAspectBrief(
  brief: EditorialAspectBrief,
  expectedAspectRatio: EditorialAspectRatio,
): Map<string, EditorialCompositionBrief> {
  if (brief.aspectRatio !== expectedAspectRatio || brief.compositions.length === 0) {
    throw new EditorialDocumentaryPlanningError(
      "INVALID_ASPECT_BRIEF",
      `A non-empty ${expectedAspectRatio} composition brief is required.`,
    );
  }
  const byBeatId = new Map<string, EditorialCompositionBrief>();
  for (const composition of brief.compositions) {
    if (
      !/^[a-z0-9][a-z0-9-]*$/u.test(composition.beatId) ||
      composition.sourceIds.length === 0 ||
      composition.visualIntent.trim().length === 0
    ) {
      throw new EditorialDocumentaryPlanningError(
        "INVALID_ASPECT_BRIEF",
        `Composition ${composition.beatId || "<missing>"} lacks stable beat/source lineage.`,
      );
    }
    if (byBeatId.has(composition.beatId)) {
      throw new EditorialDocumentaryPlanningError(
        "DUPLICATE_BEAT_ID",
        `Duplicate beat ID in ${expectedAspectRatio} brief: ${composition.beatId}.`,
      );
    }
    byBeatId.set(composition.beatId, composition);
  }
  return byBeatId;
}

function assertIndependentPlans(input: {
  readonly landscape: EditorialAspectBrief;
  readonly portrait: EditorialAspectBrief;
}): void {
  if (
    input.landscape === input.portrait ||
    input.landscape.compositions === input.portrait.compositions ||
    input.portrait.compositions.some(
      (composition, index) =>
        composition === input.landscape.compositions[index] ||
        composition.authorship !== "independent" ||
        composition.sourceCompositionId !== undefined,
    )
  ) {
    throw new EditorialDocumentaryPlanningError(
      "PORTRAIT_PLAN_NOT_INDEPENDENT",
      "Portrait compositions must be independently authored, not reused or crop-derived.",
    );
  }
}

function assertMatchingLineage(
  landscape: ReadonlyMap<string, EditorialCompositionBrief>,
  portrait: ReadonlyMap<string, EditorialCompositionBrief>,
): void {
  if (landscape.size !== portrait.size) {
    throw new EditorialDocumentaryPlanningError(
      "ASPECT_LINEAGE_MISMATCH",
      "Landscape and portrait briefs must cover the same stable beat IDs.",
    );
  }
  for (const [beatId, landscapeComposition] of landscape) {
    const portraitComposition = portrait.get(beatId);
    const landscapeSources = [...landscapeComposition.sourceIds].sort();
    const portraitSources = [...(portraitComposition?.sourceIds ?? [])].sort();
    if (!portraitComposition || JSON.stringify(landscapeSources) !== JSON.stringify(portraitSources)) {
      throw new EditorialDocumentaryPlanningError(
        "ASPECT_LINEAGE_MISMATCH",
        `Aspect briefs disagree on source lineage for beat ${beatId}.`,
      );
    }
  }
}

function assertSuppliedMediaEvidence(input: {
  readonly media: SuppliedEditorialMedia;
  readonly sourceIds: ReadonlySet<string>;
  readonly locale: ContentLocale;
  readonly commercial: boolean;
  readonly targetAccessLevel: ContentTier;
  readonly plannedAt: Date;
}): { readonly manifest: ContentSourceManifest; readonly mediaSha256: string } {
  const manifest = contentSourceManifestSchema.parse(input.media.sourceManifest);
  const evidence = input.media.rightsEvidence;
  if (!input.sourceIds.has(manifest.sourceId) || evidence.sourceId !== manifest.sourceId) {
    throw new EditorialDocumentaryPlanningError(
      "SUPPLIED_MEDIA_SOURCE_UNTRACED",
      `Supplied media ${input.media.mediaId} is not bound to planned source lineage.`,
    );
  }
  if ((input.media.mediaBytes === undefined) === (input.media.mediaPath === undefined)) {
    throw new EditorialDocumentaryPlanningError(
      "SUPPLIED_MEDIA_HASH_MISMATCH",
      `Supplied media ${input.media.mediaId} requires exactly one immutable byte source.`,
    );
  }
  const mediaBytes = input.media.mediaBytes ?? readFileSync(input.media.mediaPath!);
  const mediaSha256 = createHash("sha256").update(mediaBytes).digest("hex");
  if (
    !sha256Pattern.test(evidence.mediaSha256) ||
    evidence.sourceHash !== manifest.sourceHash ||
    evidence.mediaSha256 !== mediaSha256
  ) {
    throw new EditorialDocumentaryPlanningError(
      "SUPPLIED_MEDIA_HASH_MISMATCH",
      `Supplied media ${input.media.mediaId} has mismatched source or media hashes.`,
    );
  }
  if (
    !["creator-owned", "publisher-owned", "licensed"].includes(manifest.rights.status) ||
    !manifest.rights.allowedUses.includes("visualize") ||
    !manifest.rights.permittedLocales.includes(input.locale) ||
    (input.commercial && !manifest.rights.commercialUse)
  ) {
    throw new EditorialDocumentaryPlanningError(
      "SUPPLIED_MEDIA_RIGHTS_REQUIRED",
      `Supplied media ${input.media.mediaId} lacks required visual rights for ${input.locale}.`,
    );
  }
  if (manifest.rights.expiresAt && new Date(manifest.rights.expiresAt) <= input.plannedAt) {
    throw new EditorialDocumentaryPlanningError(
      "SUPPLIED_MEDIA_EXPIRED",
      `Supplied media ${input.media.mediaId} rights have expired.`,
    );
  }
  if (accessRank[manifest.accessLevel] > accessRank[input.targetAccessLevel]) {
    throw new EditorialDocumentaryPlanningError(
      "SUPPLIED_MEDIA_ACCESS_LEAKAGE",
      `Supplied media ${input.media.mediaId} cannot flow to a less restricted access tier.`,
    );
  }
  if (
    ["high-risk", "blocked"].includes(manifest.sensitivity.classification) ||
    (manifest.sensitivity.classification === "sensitive" && !manifest.sensitivity.manualReviewRequired)
  ) {
    throw new EditorialDocumentaryPlanningError(
      "SUPPLIED_MEDIA_SENSITIVITY_BLOCKED",
      `Supplied media ${input.media.mediaId} is blocked by sensitivity policy.`,
    );
  }
  if (
    !manifest.approvedAt ||
    !manifest.approvedBy?.trim() ||
    new Date(manifest.approvedAt) > input.plannedAt
  ) {
    throw new EditorialDocumentaryPlanningError(
      "SUPPLIED_MEDIA_APPROVAL_REQUIRED",
      `Supplied media ${input.media.mediaId} lacks a valid prior approval actor and time.`,
    );
  }
  return { manifest, mediaSha256 };
}

function createAspectPlan(input: {
  readonly episodeId: string;
  readonly aspectBrief: EditorialAspectBrief;
  readonly mediaBySourceId: ReadonlyMap<string, ValidatedSuppliedEditorialMedia>;
}): EditorialDocumentaryPlan {
  const layout = input.aspectBrief.aspectRatio === "16:9"
    ? "landscape-editorial-grid"
    : "portrait-editorial-stack";
  return {
    planId: `${input.episodeId}-editorial-${input.aspectBrief.aspectRatio.replace(":", "x")}`,
    aspectRatio: input.aspectBrief.aspectRatio,
    compositions: input.aspectBrief.compositions.map((brief) => {
      const validatedMedia = brief.sourceIds
        .map((sourceId) => input.mediaBySourceId.get(sourceId))
        .find((validated) => validated !== undefined);
      const suppliedMedia = validatedMedia?.media;
      if (brief.treatment === "supplied-creator-media" && !suppliedMedia) {
        throw new EditorialDocumentaryPlanningError(
          "SUPPLIED_MEDIA_EVIDENCE_REQUIRED",
          `Beat ${brief.beatId} requests supplied creator media without bound evidence.`,
        );
      }
      return {
        compositionId: `${brief.beatId}-${input.aspectBrief.aspectRatio.replace(":", "x")}`,
        beatId: brief.beatId,
        sourceIds: [...brief.sourceIds],
        aspectRatio: input.aspectBrief.aspectRatio,
        layout,
        treatment: brief.treatment,
        visualIntent: brief.visualIntent,
        ...(suppliedMedia
          ? { suppliedMediaId: suppliedMedia.mediaId, suppliedMediaSha256: validatedMedia!.mediaSha256 }
          : {}),
      };
    }),
  };
}

export function planEditorialDocumentaryCompositions(input: {
  readonly episodeId: string;
  readonly locale: ContentLocale;
  readonly commercial: boolean;
  readonly targetAccessLevel: ContentTier;
  readonly plannedAt: string;
  readonly landscape: EditorialAspectBrief;
  readonly portrait: EditorialAspectBrief;
  readonly suppliedMedia?: readonly SuppliedEditorialMedia[];
}): EditorialDocumentaryPlanSet {
  assertIndependentPlans(input);
  const landscapeByBeat = validateAspectBrief(input.landscape, "16:9");
  const portraitByBeat = validateAspectBrief(input.portrait, "9:16");
  assertMatchingLineage(landscapeByBeat, portraitByBeat);

  const plannedAt = new Date(input.plannedAt);
  if (!Number.isFinite(plannedAt.getTime())) {
    throw new EditorialDocumentaryPlanningError("INVALID_ASPECT_BRIEF", "Planning time must be an ISO timestamp.");
  }
  const sourceIds = new Set(
    [...landscapeByBeat.values()].flatMap((composition) => composition.sourceIds),
  );
  const mediaBySourceId = new Map<string, ValidatedSuppliedEditorialMedia>();
  for (const media of input.suppliedMedia ?? []) {
    const validated = assertSuppliedMediaEvidence({
      media,
      sourceIds,
      locale: input.locale,
      commercial: input.commercial,
      targetAccessLevel: input.targetAccessLevel,
      plannedAt,
    });
    mediaBySourceId.set(validated.manifest.sourceId, {
      media,
      mediaSha256: validated.mediaSha256,
    });
  }

  return {
    landscape: createAspectPlan({ episodeId: input.episodeId, aspectBrief: input.landscape, mediaBySourceId }),
    portrait: createAspectPlan({ episodeId: input.episodeId, aspectBrief: input.portrait, mediaBySourceId }),
  };
}
