import path from "node:path";
import {
  countSpokenWords,
  hashText,
  normalizeWhitespace,
  writeJsonAtomic,
} from "@mediaforge/shared";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  type NarrationChunkManifest,
  type PronunciationDictionary,
  type PronunciationEntry,
  type PronunciationTransformReport,
  pronunciationDictionarySchema,
  pronunciationTransformationReportSchema,
} from "./narration-schemas.js";
import {
  createNarrationArtifactPaths,
  type NarrationArtifactPathSet,
} from "./narration-paths.js";

export interface ApplyPronunciationRequest {
  readonly episodeDir: string;
  readonly episodeId?: string;
  readonly locale?: string;
  readonly language: string;
  readonly variant?: "full" | "short";
  readonly manifest: NarrationChunkManifest;
  readonly dictionaries: ReadonlyArray<PronunciationDictionary>;
  readonly createdAt?: string;
  readonly outputPath?: string;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
    warn?(value: Record<string, unknown>, message?: string): void;
  };
}

export interface PronunciationChunkTransform {
  readonly chunkId: string;
  readonly text: string;
  readonly textHash: string;
  readonly appliedEntryIds: readonly string[];
}

export interface ApplyPronunciationResult {
  readonly chunks: readonly PronunciationChunkTransform[];
  readonly report: PronunciationTransformReport;
  readonly paths: NarrationArtifactPathSet;
}

interface CompiledEntry {
  readonly entry: PronunciationEntry;
  readonly dictionaryFingerprint: string;
}

interface MatchCandidate {
  readonly start: number;
  readonly end: number;
  readonly entry: CompiledEntry;
}

const scopeRank: Readonly<Record<PronunciationEntry["scope"], number>> = {
  episode: 4,
  profile: 3,
  language: 2,
  global: 1,
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}_]/u.test(value);
}

function hasSafeLiteral(value: string): boolean {
  return value.trim().length > 0 && !/[\\^$.*+?()[\]{}|]/u.test(value);
}

function entryFingerprint(entry: PronunciationEntry): string {
  return hashText(JSON.stringify(entry));
}

function dictionaryFingerprint(dictionary: PronunciationDictionary): string {
  return dictionary.dictionaryFingerprint ?? hashText(JSON.stringify(dictionary.entries));
}

function flattenDictionaries(dictionaries: ReadonlyArray<PronunciationDictionary>, language: string): CompiledEntry[] {
  const entries: CompiledEntry[] = [];
  for (const rawDictionary of dictionaries) {
    const dictionary = pronunciationDictionarySchema.parse(rawDictionary);
    if (dictionary.language !== "global" && dictionary.language !== language) {
      continue;
    }
    const fingerprint = dictionaryFingerprint(dictionary);
    for (const entry of dictionary.entries) {
      entries.push({ entry, dictionaryFingerprint: fingerprint });
    }
  }
  return entries.sort((left, right) => {
    const lengthDelta = right.entry.phrase.length - left.entry.phrase.length;
    if (lengthDelta !== 0) {
      return lengthDelta;
    }
    const scopeDelta = scopeRank[right.entry.scope] - scopeRank[left.entry.scope];
    if (scopeDelta !== 0) {
      return scopeDelta;
    }
    return left.entry.entryId.localeCompare(right.entry.entryId);
  });
}

function validateEntries(entries: readonly CompiledEntry[]): void {
  const ids = new Set<string>();
  for (const compiled of entries) {
    const entry = compiled.entry;
    if (ids.has(entry.entryId)) {
      throw new Error(`Duplicate pronunciation entry ID: ${entry.entryId}`);
    }
    ids.add(entry.entryId);
    if (!hasSafeLiteral(entry.phrase)) {
      throw new Error(`Unsafe pronunciation phrase for entry ${entry.entryId}. Only literal text is supported.`);
    }
    if (entry.replacement.trim().length === 0) {
      throw new Error(`Pronunciation replacement is empty for entry ${entry.entryId}.`);
    }
  }
}

function findMatches(text: string, entries: readonly CompiledEntry[]): MatchCandidate[] {
  const matches: MatchCandidate[] = [];
  for (const entry of entries) {
    const pattern = new RegExp(escapeRegExp(entry.entry.phrase), "giu");
    for (const match of text.matchAll(pattern)) {
      const matched = match[0] ?? "";
      const start = match.index;
      const end = start + matched.length;
      if (isWordCharacter(text[start - 1]) || isWordCharacter(text[end])) {
        continue;
      }
      matches.push({ start, end, entry });
    }
  }
  return matches.sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    const lengthDelta = right.end - right.start - (left.end - left.start);
    if (lengthDelta !== 0) {
      return lengthDelta;
    }
    return left.entry.entry.entryId.localeCompare(right.entry.entry.entryId);
  });
}

function selectNonOverlapping(matches: readonly MatchCandidate[]): {
  readonly selected: readonly MatchCandidate[];
  readonly skipped: readonly MatchCandidate[];
} {
  const selected: MatchCandidate[] = [];
  const skipped: MatchCandidate[] = [];
  let occupiedEnd = -1;
  for (const match of matches) {
    if (match.start < occupiedEnd) {
      skipped.push(match);
      continue;
    }
    selected.push(match);
    occupiedEnd = match.end;
  }
  return { selected, skipped };
}

function transformText(text: string, selected: readonly MatchCandidate[]): string {
  let output = "";
  let cursor = 0;
  for (const match of selected) {
    output += text.slice(cursor, match.start);
    output += match.entry.entry.replacement;
    cursor = match.end;
  }
  output += text.slice(cursor);
  return output;
}

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

export async function applyPronunciationTransforms(
  request: ApplyPronunciationRequest
): Promise<ApplyPronunciationResult> {
  const episodeId = request.episodeId ?? request.manifest.episodeId;
  const locale = request.locale ?? request.manifest.locale;
  const variant = request.variant ?? request.manifest.variant;
  const paths = createNarrationArtifactPaths({
    episodeId,
    locale,
    variant,
    episodeRoot: request.episodeDir,
  });
  const entries = flattenDictionaries(request.dictionaries, request.language);
  validateEntries(entries);
  const mandatoryEntryIds = new Set(entries.filter((entry) => entry.entry.mandatory).map((entry) => entry.entry.entryId));
  const appliedCounts = new Map<string, number>();
  const skippedIds = new Set<string>();
  const collisions = new Map<string, Set<string>>();
  const chunks: PronunciationChunkTransform[] = [];
  const appliedTransformations: PronunciationTransformReport["appliedTransformations"] = [];

  for (const chunk of request.manifest.chunks) {
    const matches = findMatches(chunk.text, entries);
    const { selected, skipped } = selectNonOverlapping(matches);
    for (const match of skipped) {
      skippedIds.add(match.entry.entry.entryId);
      const token = normalizeWhitespace(chunk.text.slice(match.start, match.end));
      const key = `${match.start}:${match.end}:${token}`;
      const ids = collisions.get(key) ?? new Set<string>();
      ids.add(match.entry.entry.entryId);
      const overlapping = selected.find((candidate) => candidate.start < match.end && match.start < candidate.end);
      if (overlapping) {
        ids.add(overlapping.entry.entry.entryId);
      }
      collisions.set(key, ids);
    }
    const transformed = transformText(chunk.text, selected);
    for (const match of selected) {
      const id = match.entry.entry.entryId;
      appliedCounts.set(id, (appliedCounts.get(id) ?? 0) + 1);
    }
    const appliedEntryIds = [...new Set(selected.map((match) => match.entry.entry.entryId))];
    for (const entryId of appliedEntryIds) {
      const entryMatches = selected.filter((match) => match.entry.entry.entryId === entryId);
      const first = entryMatches[0];
      if (first) {
        appliedTransformations.push({
          chunkId: chunk.chunkId,
          entryId,
          scope: countSpokenWords(first.entry.entry.phrase) > 1 ? "phrase" : "token",
          original: first.entry.entry.phrase,
          replacement: first.entry.entry.replacement,
          occurrenceCount: entryMatches.length,
          mandatory: first.entry.entry.mandatory,
        });
      }
    }
    chunks.push({
      chunkId: chunk.chunkId,
      text: transformed,
      textHash: hashText(transformed),
      appliedEntryIds,
    });
  }

  const skippedEntries = entries
    .filter((entry) => !appliedCounts.has(entry.entry.entryId))
    .map((entry) => ({
      entryId: entry.entry.entryId,
      reason: skippedIds.has(entry.entry.entryId) ? "overlap" : "unused",
      mandatory: entry.entry.mandatory,
    }));
  const unresolved = skippedEntries.filter((entry) => entry.mandatory);
  if (unresolved.length > 0) {
    throw new Error(`Mandatory pronunciation entries were not resolved: ${unresolved.map((entry) => entry.entryId).join(", ")}`);
  }
  for (const id of mandatoryEntryIds) {
    if (!appliedCounts.has(id)) {
      throw new Error(`Mandatory pronunciation entry was not applied: ${id}`);
    }
  }
  const dictionaryFingerprintValue = hashText(entries.map((entry) => `${entry.dictionaryFingerprint}:${entryFingerprint(entry.entry)}`).join("\n"));
  const reportWithoutFingerprint = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    sourceManifestFingerprint: request.manifest.manifestFingerprint,
    dictionaryFingerprint: dictionaryFingerprintValue,
    language: locale,
    appliedTransformations,
    collisions: [...collisions.entries()].map(([key, ids]) => ({
      entryIds: [...ids].sort(),
      tokenOrPhrase: key.split(":").slice(2).join(":"),
      resolution: "skipped" as const,
    })).filter((collision) => collision.entryIds.length > 1),
    skippedEntries,
    warnings: skippedEntries
      .filter((entry) => !entry.mandatory)
      .map((entry) => ({
        code: "PRONUNCIATION_ENTRY_UNUSED",
        message: `Optional pronunciation entry was not applied: ${entry.entryId}.`,
      })),
    reportFingerprint: hashText("pending"),
    createdAt: request.createdAt ?? new Date().toISOString(),
  };
  const report = pronunciationTransformationReportSchema.parse({
    ...reportWithoutFingerprint,
    reportFingerprint: hashText(JSON.stringify(reportWithoutFingerprint)),
  });
  const outputPath = request.outputPath ?? paths.pronunciationTransforms;
  await writeJsonAtomic(outputPath, report);
  request.logger?.info(
    {
      episodeId,
      language: request.language,
      locale,
      variant,
      entryCount: entries.length,
      appliedCount: appliedTransformations.length,
      skippedCollisionCount: report.collisions.length,
      reportFingerprint: report.reportFingerprint,
      reportPath: relative(request.episodeDir, outputPath),
    },
    "Applied pronunciation transforms."
  );
  return { chunks, report, paths };
}
