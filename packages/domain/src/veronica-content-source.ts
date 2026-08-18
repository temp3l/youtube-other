import { z } from "zod";

export const VERONICA_CONTENT_PACK_IDS = [
  "veronica-unified-content-pack-v2",
  "veronica-unified-content-pack-v3",
] as const;
export type VeronicaContentPackId = (typeof VERONICA_CONTENT_PACK_IDS)[number];

/** The sole production selector. Candidate v3 is promoted by changing this value. */
export const VERONICA_CANONICAL_CONTENT_PACK_ID =
  "veronica-unified-content-pack-v3" as const;
export const VERONICA_CANONICAL_LOCALE = "en" as const;
export const VERONICA_CANONICAL_CONTENT_ROOT =
  "content-packs/veronica-unified-content-pack-v3" as const;
export const VERONICA_CANONICAL_MANIFEST = "manifest.json" as const;
export const VERONICA_CANONICAL_SERIES_PLAN =
  "metadata/series-plan-v2.json" as const;

export const veronicaLocaleSchema = z.enum(["de", "en", "es", "fr", "it", "pt"]);
export type VeronicaLocale = z.infer<typeof veronicaLocaleSchema>;

export const veronicaContentKindSchema = z.enum(["long", "short"]);
export type VeronicaContentKind = z.infer<typeof veronicaContentKindSchema>;

export const veronicaContentReadinessSchema = z.enum([
  "CANONICAL_READY",
  "LOCALIZATION_PENDING",
  "LOCALIZATION_REVIEW_REQUIRED",
  "TIMING_REVIEW_REQUIRED",
  "PRODUCTION_READY",
]);
export type VeronicaContentReadiness = z.infer<
  typeof veronicaContentReadinessSchema
>;

export const veronicaCanonicalContentIdentitySchema = z
  .object({
    contentPackId: z.literal(VERONICA_CANONICAL_CONTENT_PACK_ID),
    storyId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    episodeId: z.string().regex(/^veronica-episode-[0-9]{2}$/u),
    locale: veronicaLocaleSchema,
    variant: veronicaContentKindSchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict()
  .readonly();

export type VeronicaCanonicalContentIdentity = z.infer<
  typeof veronicaCanonicalContentIdentitySchema
>;

export const VERONICA_PLANNING_TIMING_POLICY = Object.freeze({
  long: Object.freeze({
    nominalSeconds: 600,
    planningSeconds: Object.freeze([570, 630] as const),
    wpm: Object.freeze({ en: 150, de: 145, es: 150, fr: 150, it: 150, pt: 150 }),
  }),
  short: Object.freeze({
    nominalSeconds: 90,
    planningWords: Object.freeze({
      // English canonical Shorts distinguish preferred, warning, and blocking
      // narration lengths. The remaining locales retain their existing bands.
      en: Object.freeze([215, 230] as const),
      de: Object.freeze([218, 233] as const),
      es: Object.freeze([225, 240] as const),
      fr: Object.freeze([225, 240] as const),
      it: Object.freeze([225, 240] as const),
      pt: Object.freeze([225, 240] as const),
    }),
    englishWordPolicy: Object.freeze({
      preferred: Object.freeze([215, 225] as const),
      actionableWarning: Object.freeze([226, 230] as const),
      hardMinimum: 215,
      hardMaximum: 230,
    }),
    wpm: Object.freeze({ en: 155, de: 150, es: 155, fr: 155, it: 155, pt: 155 }),
  }),
} as const);

export const veronicaCanonicalWorkspaceIdentitySchema = z
  .object({
    sourcePackId: z.literal(VERONICA_CANONICAL_CONTENT_PACK_ID),
    storyId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    seriesEpisodeId: z.string().regex(/^veronica-episode-[0-9]{2}$/u),
    seriesEpisodeOrder: z.number().int().min(1).max(18),
    locale: veronicaLocaleSchema,
    variant: z.enum(["long", "short", "full"]),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .passthrough();

export type VeronicaCanonicalWorkspaceIdentity = z.infer<
  typeof veronicaCanonicalWorkspaceIdentitySchema
>;

export function assertVeronicaCanonicalWorkspaceIdentity(
  value: unknown,
): VeronicaCanonicalWorkspaceIdentity {
  return veronicaCanonicalWorkspaceIdentitySchema.parse(value);
}

export function canonicalContentIdentityFromVeronicaWorkspace(
  value: unknown,
): VeronicaCanonicalContentIdentity {
  const workspace = assertVeronicaCanonicalWorkspaceIdentity(value);
  return veronicaCanonicalContentIdentitySchema.parse({
    contentPackId: workspace.sourcePackId,
    storyId: workspace.storyId,
    episodeId: workspace.seriesEpisodeId,
    locale: workspace.locale,
    variant: workspace.variant,
    contentHash: workspace.contentHash,
  });
}
