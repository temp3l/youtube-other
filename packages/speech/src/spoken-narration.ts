import path from "node:path";
import {
  countSpokenWords,
  hashText,
  normalizeWhitespace,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { loadEpisodeScriptMarkdown } from "./script-markdown.js";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  type NarrationWarning,
  type NarrationVariant,
  type SpokenNarrationArtifact,
  spokenNarrationArtifactSchema,
} from "./narration-schemas.js";
import {
  createNarrationArtifactPaths,
  type NarrationArtifactPathSet,
} from "./narration-paths.js";

export type SpokenNarrationPreparationMode = "deterministic" | "adapted";

export interface SpokenNarrationAdapterInput {
  readonly sourceText: string;
  readonly language: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
}

export interface SpokenNarrationAdapterResult {
  readonly text: string;
  readonly warnings?: ReadonlyArray<NarrationWarning>;
}

export interface SpokenNarrationAdapter {
  readonly enabled: boolean;
  adapt(input: SpokenNarrationAdapterInput): Promise<SpokenNarrationAdapterResult>;
}

export interface SpokenNarrationLogger {
  info(value: Record<string, unknown>, message?: string): void;
  warn?(value: Record<string, unknown>, message?: string): void;
  error?(value: Record<string, unknown>, message?: string): void;
}

export interface PrepareSpokenNarrationRequest {
  readonly episodeDir: string;
  readonly episodeId?: string;
  readonly language: string;
  readonly locale?: string;
  readonly variant?: NarrationVariant;
  readonly mode?: SpokenNarrationPreparationMode;
  readonly sectionHeading?: string;
  readonly createdAt?: string;
  readonly generator?: string;
  readonly generatorVersion?: string;
  readonly runId?: string;
  readonly adapter?: SpokenNarrationAdapter;
  readonly logger?: SpokenNarrationLogger;
}

export interface PrepareSpokenNarrationResult {
  readonly success: boolean;
  readonly artifact: SpokenNarrationArtifact;
  readonly paths: NarrationArtifactPathSet;
  readonly sourcePath?: string;
  readonly sourceHash: string;
  readonly spokenTextHash: string;
  readonly spokenText?: string;
  readonly warnings: ReadonlyArray<NarrationWarning>;
}

const localeByLanguage: Readonly<Record<string, string>> = {
  en: "en",
  de: "de",
  es: "es",
  fr: "fr",
  pt: "pt",
};

function localeForLanguage(language: string): string {
  return localeByLanguage[language] ?? language.split("-", 1)[0] ?? language;
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/\[(.*?)\]\((.*?)\)/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/gu, "$1");
}

export function prepareSpokenNarrationText(sourceText: string): string {
  return sourceText
    .replace(/\r\n/gu, "\n")
    .split(/\n{2,}/u)
    .map((block) =>
      normalizeWhitespace(
        stripMarkdownInline(
          block
            .replace(/^#{1,6}\s+/gmu, "")
            .replace(/^\s*[-*+]\s+/gmu, "")
            .replace(/^\s*\d+\.\s+/gmu, "")
        ).replace(/\n+/gu, " ")
      )
    )
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function firstWords(value: string, count: number): string {
  return normalizeWhitespace(prepareSpokenNarrationText(value))
    .toLowerCase()
    .split(/\s+/u)
    .slice(0, count)
    .join(" ");
}

function buildWarnings(sourceText: string, spokenText: string): NarrationWarning[] {
  const warnings: NarrationWarning[] = [];
  const sourceWords = countSpokenWords(prepareSpokenNarrationText(sourceText));
  const spokenWords = countSpokenWords(spokenText);
  if (sourceWords > 0) {
    const drift = Math.abs(spokenWords - sourceWords) / sourceWords;
    if (drift > 0.15) {
      warnings.push({
        code: "WORD_COUNT_DRIFT",
        message: `Spoken narration word count drift is ${(drift * 100).toFixed(1)}%.`,
      });
    }
  }
  const sourceHook = firstWords(sourceText, 8);
  const spokenHook = firstWords(spokenText, 8);
  if (sourceHook.length > 0 && spokenHook !== sourceHook) {
    warnings.push({
      code: "HOOK_DRIFT",
      message: "Prepared spoken narration does not preserve the source opening hook.",
    });
  }
  return warnings;
}

function toRelativePath(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

function createArtifact(input: {
  readonly status: "completed" | "failed";
  readonly request: PrepareSpokenNarrationRequest;
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: NarrationVariant;
  readonly sourcePath?: string;
  readonly paths: NarrationArtifactPathSet;
  readonly sourceHash: string;
  readonly spokenTextHash: string;
  readonly wordCount: number;
  readonly warnings: ReadonlyArray<NarrationWarning>;
  readonly createdAt: string;
  readonly preparationMode: "source" | "adapted" | "fallback";
  readonly failureMessage?: string;
}): SpokenNarrationArtifact {
  return spokenNarrationArtifactSchema.parse({
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    status: input.status,
    episodeId: input.episodeId,
    locale: input.locale,
    variant: input.variant,
    preparationMode: input.preparationMode,
    ...(input.sourcePath
      ? { sourceStoryPath: toRelativePath(input.request.episodeDir, input.sourcePath) }
      : {}),
    sourceHash: input.sourceHash,
    spokenTextPath: toRelativePath(input.request.episodeDir, input.paths.spokenTextMarkdown),
    spokenTextHash: input.spokenTextHash,
    wordCount: input.wordCount,
    warnings: input.warnings,
    createdAt: input.createdAt,
    parentFingerprints: input.sourceHash ? [input.sourceHash] : [],
    provenance: {
      generator: input.request.generator ?? "@mediaforge/speech",
      ...(input.request.generatorVersion
        ? { generatorVersion: input.request.generatorVersion }
        : {}),
      ...(input.request.runId ? { runId: input.request.runId } : {}),
    },
    ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
  });
}

export async function prepareSpokenNarration(
  request: PrepareSpokenNarrationRequest
): Promise<PrepareSpokenNarrationResult> {
  const episodeId = request.episodeId ?? path.basename(request.episodeDir);
  const locale = localeForLanguage(request.locale ?? request.language);
  const variant = request.variant ?? "full";
  const paths = createNarrationArtifactPaths({
    episodeId,
    locale,
    variant,
    episodeRoot: request.episodeDir,
  });
  const createdAt = request.createdAt ?? new Date().toISOString();
  let sourcePath: string | undefined;
  let sourceHash = hashText("");

  try {
    const source = await loadEpisodeScriptMarkdown(
      request.episodeDir,
      request.language,
      request.sectionHeading ?? "Narration Script"
    );
    sourcePath = source.filePath;
    const sourceText = normalizeWhitespace(source.text);
    sourceHash = hashText(sourceText);
    const shouldAdapt =
      request.mode === "adapted" &&
      request.adapter !== undefined &&
      request.adapter.enabled;
    const adapted = shouldAdapt
      ? await request.adapter?.adapt({
          sourceText: source.text,
          language: request.language,
          locale,
          variant,
        })
      : undefined;
    const spokenText =
      shouldAdapt && adapted
        ? normalizeWhitespace(adapted.text)
        : prepareSpokenNarrationText(source.text);
    if (spokenText.trim().length === 0) {
      throw new Error("Spoken narration text is empty after preparation.");
    }
    const warnings = [
      ...buildWarnings(source.text, spokenText),
      ...(adapted?.warnings ?? []),
    ];
    const spokenTextHash = hashText(spokenText);
    const artifact = createArtifact({
      status: "completed",
      request,
      episodeId,
      locale,
      variant,
      sourcePath,
      paths,
      sourceHash,
      spokenTextHash,
      wordCount: countSpokenWords(spokenText),
      warnings,
      createdAt,
      preparationMode: shouldAdapt ? "adapted" : "source",
    });
    await writeTextAtomic(paths.spokenTextMarkdown, `${spokenText}\n`);
    await writeJsonAtomic(paths.spokenTextJson, artifact);
    request.logger?.info(
      {
        episodeId,
        language: request.language,
        locale,
        variant,
        preparationMode: artifact.preparationMode,
        sourceHash,
        outputHash: spokenTextHash,
        warningCodes: warnings.map((warning) => warning.code),
      },
      "Prepared spoken narration."
    );
    return {
      success: true,
      artifact,
      paths,
      sourcePath,
      sourceHash,
      spokenTextHash,
      spokenText,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const spokenTextHash = hashText("");
    const warnings: NarrationWarning[] = [
      {
        code: "SPOKEN_NARRATION_PREPARATION_FAILED",
        message,
      },
    ];
    const artifact = createArtifact({
      status: "failed",
      request,
      episodeId,
      locale,
      variant,
      ...(sourcePath ? { sourcePath } : {}),
      paths,
      sourceHash,
      spokenTextHash,
      wordCount: 0,
      warnings,
      createdAt,
      preparationMode: "fallback",
      failureMessage: message,
    });
    await writeJsonAtomic(paths.spokenTextJson, artifact);
    request.logger?.error?.(
      {
        episodeId,
        language: request.language,
        locale,
        variant,
        preparationMode: artifact.preparationMode,
        sourceHash,
        outputHash: spokenTextHash,
        warningCodes: warnings.map((warning) => warning.code),
      },
      "Spoken narration preparation failed."
    );
    return {
      success: false,
      artifact,
      paths,
      ...(sourcePath ? { sourcePath } : {}),
      sourceHash,
      spokenTextHash,
      warnings,
    };
  }
}
