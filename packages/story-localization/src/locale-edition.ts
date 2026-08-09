import { createHash } from "node:crypto";
import {
  contentProfileIdSchema,
  normalizeContentProfileId,
  type ContentProfileId,
} from "@mediaforge/domain";
import { z } from "zod";
import { stableSerialize } from "./stable-json.js";

export const LOCALE_EDITION_SCHEMA_VERSION = "locale-edition.v1" as const;
export const LOCALE_EDITION_INVALID_VISUAL_REUSE = "LOCALE_EDITION_INVALID_VISUAL_REUSE";
export const LOCALE_EDITION_MISSING_TRANSLATED_OVERLAY = "LOCALE_EDITION_MISSING_TRANSLATED_OVERLAY";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const identifierSchema = z.string().trim().min(1);

export const localeEditionArtifactSchema = z.strictObject({
  schemaVersion: z.literal(LOCALE_EDITION_SCHEMA_VERSION),
  contentProfileId: contentProfileIdSchema,
  editionId: z.string().regex(/^locale-edition-[a-f0-9]{16}$/u),
  episodeId: identifierSchema,
  productionRevisionId: identifierSchema,
  locale: z.string().trim().min(2),
  canonicalLocale: z.string().trim().min(2),
  narrationRevisionId: identifierSchema,
  narrationFingerprint: sha256Schema,
  translatedOverlays: z.array(z.strictObject({
    overlayId: identifierSchema,
    sourceVisualArtifactId: identifierSchema,
    sourceTextFingerprint: sha256Schema,
    translatedTextFingerprint: sha256Schema,
    layoutRevision: identifierSchema,
  })),
  sharedVisuals: z.array(z.strictObject({
    artifactId: identifierSchema,
    fingerprint: sha256Schema,
    visualSemanticRevisionId: identifierSchema,
    reuseRationale: z.enum(["language-independent-visual", "content-hash-match"]),
  })),
  regeneratedVisuals: z.array(z.strictObject({
    artifactId: identifierSchema,
    fingerprint: sha256Schema,
    sourceVisualArtifactId: identifierSchema,
    regenerationReason: z.literal("inseparable-language-visual"),
  })),
  effectiveConfigurationHash: sha256Schema,
  dependencyIdentity: z.record(z.string().min(1), sha256Schema),
  reuseRationale: z.enum(["new-locale-edition", "content-hash-match"]),
  regenerationRationale: z.enum([
    "new-locale-edition",
    "narration-revision-changed",
    "translated-overlay-changed",
    "localized-layout-changed",
    "configuration-changed",
    "dependency-changed",
    "inseparable-language-visual",
  ]),
  approval: z.strictObject({
    state: z.enum(["draft", "review", "approved", "blocked"]),
    approvalId: identifierSchema.optional(),
  }),
  fingerprint: sha256Schema,
});
export type LocaleEditionArtifact = z.infer<typeof localeEditionArtifactSchema>;

export interface PlanLocaleEditionInput {
  readonly contentProfileId: ContentProfileId | "strategic-reinvention" | "veronica-benini";
  readonly episodeId: string;
  readonly productionRevisionId: string;
  readonly locale: string;
  readonly canonicalLocale: string;
  readonly narrationRevisionId: string;
  readonly narrationFingerprint: string;
  readonly translatedOverlays?: readonly {
    readonly overlayId: string;
    readonly sourceVisualArtifactId: string;
    readonly sourceText: string;
    readonly translatedText: string;
    readonly layoutRevision: string;
  }[];
  /** Shared imagery stays locale-neutral; only a declared inseparable visual may regenerate. */
  readonly visuals: readonly {
    readonly artifactId: string;
    readonly fingerprint: string;
    readonly visualSemanticRevisionId: string;
    readonly textHandling: "none" | "translated-overlay" | "inseparable-language-visual";
    readonly regeneratedArtifact?: { readonly artifactId: string; readonly fingerprint: string };
  }[];
  readonly effectiveConfiguration: unknown;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly approval: LocaleEditionArtifact["approval"];
  readonly regenerationRationale: LocaleEditionArtifact["regenerationRationale"];
  readonly previousEdition?: LocaleEditionArtifact;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

/**
 * Plans a revision-bound edition without provider work or mutation. The returned
 * descriptor is safe to persist alongside prior approved editions as history.
 */
export function planLocaleEdition(input: PlanLocaleEditionInput): {
  readonly edition: LocaleEditionArtifact;
  readonly reused: boolean;
} {
  const contentProfileId = contentProfileIdSchema.parse(
    normalizeContentProfileId(input.contentProfileId),
  );
  const overlays = input.translatedOverlays ?? [];
  const overlayByVisual = new Map(overlays.map((overlay) => [overlay.sourceVisualArtifactId, overlay]));
  const visualIds = new Set<string>();
  const sharedVisuals: LocaleEditionArtifact["sharedVisuals"] = [];
  const regeneratedVisuals: LocaleEditionArtifact["regeneratedVisuals"] = [];

  for (const visual of input.visuals) {
    if (visualIds.has(visual.artifactId)) throw new Error(LOCALE_EDITION_INVALID_VISUAL_REUSE);
    visualIds.add(visual.artifactId);
    if (visual.textHandling === "translated-overlay" && !overlayByVisual.has(visual.artifactId)) {
      throw new Error(LOCALE_EDITION_MISSING_TRANSLATED_OVERLAY);
    }
    if (visual.textHandling === "inseparable-language-visual") {
      if (!visual.regeneratedArtifact) throw new Error(LOCALE_EDITION_INVALID_VISUAL_REUSE);
      regeneratedVisuals.push({
        artifactId: visual.regeneratedArtifact.artifactId,
        fingerprint: visual.regeneratedArtifact.fingerprint,
        sourceVisualArtifactId: visual.artifactId,
        regenerationReason: "inseparable-language-visual",
      });
      continue;
    }
    sharedVisuals.push({
      artifactId: visual.artifactId,
      fingerprint: visual.fingerprint,
      visualSemanticRevisionId: visual.visualSemanticRevisionId,
      reuseRationale: "language-independent-visual",
    });
  }

  const translatedOverlays = overlays.map((overlay) => ({
    overlayId: overlay.overlayId,
    sourceVisualArtifactId: overlay.sourceVisualArtifactId,
    sourceTextFingerprint: fingerprint(overlay.sourceText),
    translatedTextFingerprint: fingerprint(overlay.translatedText),
    layoutRevision: overlay.layoutRevision,
  }));
  const material = {
    schemaVersion: LOCALE_EDITION_SCHEMA_VERSION,
    contentProfileId,
    episodeId: input.episodeId,
    productionRevisionId: input.productionRevisionId,
    locale: input.locale,
    canonicalLocale: input.canonicalLocale,
    narrationRevisionId: input.narrationRevisionId,
    narrationFingerprint: input.narrationFingerprint,
    translatedOverlays,
    sharedVisuals,
    regeneratedVisuals,
    effectiveConfiguration: input.effectiveConfiguration,
    dependencyIdentity: input.dependencyIdentity,
  };
  const artifactFingerprint = fingerprint(material);
  const reused = input.previousEdition?.fingerprint === artifactFingerprint;
  const { effectiveConfiguration: _effectiveConfiguration, ...persistedMaterial } = material;
  const edition = localeEditionArtifactSchema.parse({
    ...persistedMaterial,
    editionId: `locale-edition-${artifactFingerprint.slice(0, 16)}`,
    effectiveConfigurationHash: fingerprint(input.effectiveConfiguration),
    reuseRationale: reused ? "content-hash-match" : "new-locale-edition",
    regenerationRationale: input.regenerationRationale,
    approval: input.approval,
    fingerprint: artifactFingerprint,
  });
  return { edition, reused };
}

/** Keeps failure evidence actionable without carrying source or translated text. */
export function redactLocaleEditionFailure(error: unknown): {
  readonly code: string;
  readonly message: string;
} {
  const candidate = error instanceof Error ? error.message : "";
  const code = [
    LOCALE_EDITION_INVALID_VISUAL_REUSE,
    LOCALE_EDITION_MISSING_TRANSLATED_OVERLAY,
  ].includes(candidate)
    ? candidate
    : "LOCALE_EDITION_INVALID";
  return {
    code,
    message: "Locale edition planning was blocked; inspect revision, overlay, and visual lineage identifiers.",
  };
}
