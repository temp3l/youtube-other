import path from "node:path";
import {
  ConfigurationError,
} from "@mediaforge/domain";
import {
  createEpisodePathResolver,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  type ContentVariant,
  type EpisodeId,
  type LocaleCode,
} from "@mediaforge/shared";

export type NarrationVariant = ContentVariant;

/**
 * Inputs used to resolve narration artifact paths for one localized episode variant.
 *
 * The helper is pure and only derives paths; it does not create directories or
 * inspect the filesystem.
 */
export interface NarrationArtifactPathContext {
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly episodeRoot: string;
}

/**
 * Deterministic path set for the staged narration artifact tree.
 *
 * Returned paths are absolute and remain within the localized episode root.
 * Canonical story-script paths are not modified; this helper only describes
 * staged narration artifacts and the legacy compatibility output.
 * The compatibility path intentionally preserves the existing
 * `audio/narration.wav` location for downstream render code.
 */
export interface NarrationArtifactPathSet {
  readonly episodeRoot: string;
  readonly localeRoot: string;
  readonly localeVariantRoot: string;
  readonly narrationRoot: string;
  readonly spokenTextMarkdown: string;
  readonly spokenTextJson: string;
  readonly chunkManifest: string;
  readonly performanceDirections: string;
  readonly pronunciationTransforms: string;
  readonly chunkAudioDir: string;
  readonly chunkValidationDir: string;
  readonly assemblyManifest: string;
  readonly cleanNarration: string;
  readonly masteredNarration: string;
  readonly qualityGateJson: string;
  readonly qualityGateMarkdown: string;
  readonly generationMetadata: string;
  readonly configSnapshot: string;
  readonly compatibilityNarration: string;
  readonly rootCompatibilityNarration: string;
}

function configurationError(message: string): ConfigurationError {
  return new ConfigurationError(message);
}

function normalizeNarrationEpisodeId(value: string): EpisodeId {
  try {
    return normalizeEpisodeId(value);
  } catch {
    throw configurationError(`Invalid narration artifact episodeId: ${value}`);
  }
}

function normalizeNarrationLocale(value: string): LocaleCode {
  try {
    return normalizeLocaleCode(value);
  } catch {
    throw configurationError(`Invalid narration artifact locale: ${value}`);
  }
}

function normalizeNarrationVariant(value: string): NarrationVariant {
  try {
    return normalizeContentVariant(value);
  } catch {
    throw configurationError(`Invalid narration artifact variant: ${value}`);
  }
}

/**
 * Assert that a resolved candidate path stays inside the intended root.
 */
function assertPathUnderRoot(root: string, candidate: string, field: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  const insideRoot =
    relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (!insideRoot) {
    throw configurationError(`Narration artifact path escapes its root for ${field}.`);
  }
  return resolvedCandidate;
}

/**
 * Resolve the staged narration artifact layout for one localized episode variant.
 */
export function createNarrationArtifactPaths(
  context: NarrationArtifactPathContext
): NarrationArtifactPathSet {
  const episodeRootInput = context.episodeRoot?.trim();
  if (!episodeRootInput) {
    throw configurationError("Narration artifact paths require episodeRoot.");
  }

  const episodeRoot = path.resolve(episodeRootInput);
  const episodeId = normalizeNarrationEpisodeId(context.episodeId);
  const locale = normalizeNarrationLocale(context.locale);
  const variant = normalizeNarrationVariant(context.variant);
  const episodeRootId = normalizeNarrationEpisodeId(path.basename(episodeRoot));
  if (episodeRootId !== episodeId) {
    throw configurationError("Narration artifact episodeRoot does not match episodeId.");
  }

  const resolver = createEpisodePathResolver(path.dirname(episodeRoot));
  const localeVariantRoot = resolver.localeVariantRoot({
    episodeId,
    locale,
    variant,
  });
  const audioRoot = path.join(localeVariantRoot, "audio");
  const narrationRoot = path.join(audioRoot, "narration");
  const chunkDir = path.join(narrationRoot, "chunks");

  const result: NarrationArtifactPathSet = {
    episodeRoot,
    localeRoot: resolver.localeRoot({ episodeId, locale, variant }),
    localeVariantRoot,
    narrationRoot,
    spokenTextMarkdown: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "spoken-text.md"),
      "spokenTextMarkdown"
    ),
    spokenTextJson: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "spoken-text.json"),
      "spokenTextJson"
    ),
    chunkManifest: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "chunk-manifest.json"),
      "chunkManifest"
    ),
    performanceDirections: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "performance-directions.json"),
      "performanceDirections"
    ),
    pronunciationTransforms: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "pronunciation-transforms.json"),
      "pronunciationTransforms"
    ),
    chunkAudioDir: assertPathUnderRoot(narrationRoot, chunkDir, "chunkAudioDir"),
    chunkValidationDir: assertPathUnderRoot(narrationRoot, chunkDir, "chunkValidationDir"),
    assemblyManifest: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "assembly-manifest.json"),
      "assemblyManifest"
    ),
    cleanNarration: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "clean-narration.wav"),
      "cleanNarration"
    ),
    masteredNarration: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "mastered-narration.wav"),
      "masteredNarration"
    ),
    qualityGateJson: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "quality-gate.json"),
      "qualityGateJson"
    ),
    qualityGateMarkdown: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "quality-gate.md"),
      "qualityGateMarkdown"
    ),
    generationMetadata: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "generation-metadata.json"),
      "generationMetadata"
    ),
    configSnapshot: assertPathUnderRoot(
      narrationRoot,
      path.join(narrationRoot, "config-snapshot.json"),
      "configSnapshot"
    ),
    compatibilityNarration: assertPathUnderRoot(
      audioRoot,
      path.join(audioRoot, "narration.wav"),
      "compatibilityNarration"
    ),
    rootCompatibilityNarration: assertPathUnderRoot(
      episodeRoot,
      path.join(episodeRoot, "audio", "narration.wav"),
      "rootCompatibilityNarration"
    ),
  };

  return Object.freeze(result);
}
