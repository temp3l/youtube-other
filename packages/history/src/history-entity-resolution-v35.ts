import type { HistoryEntityTypeV34 } from "./history-v34-contracts.js";

const DISCOURSE_PREFIX_TOKENS = new Set([
  "at",
  "in",
  "on",
  "but",
  "perhaps",
  "as",
  "earlier",
  "maybe",
  "then",
  "thus",
  "also",
  "even",
  "yet",
  "so",
  "now",
  "still",
  "once",
]);

export type NormalizedEntityCandidateSpanV35 = {
  readonly originalText: string;
  readonly normalizedText: string;
  readonly hadDiscoursePrefix: boolean;
};

/**
 * Strip sentence/discourse prefixes from malformed entity candidate spans while
 * preserving legitimate names whose first token merely resembles a prefix.
 */
export function normalizeEntityCandidateSpanV35(text: string): NormalizedEntityCandidateSpanV35 {
  const originalText = text.trim();
  if (!originalText) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  const tokens = originalText.split(/\s+/u);
  if (tokens.length < 2) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  const firstToken = tokens[0]!.toLocaleLowerCase();
  const remainder = tokens.slice(1).join(" ");
  if (!DISCOURSE_PREFIX_TOKENS.has(firstToken)) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  if (!/^[A-Z]/.test(tokens[1]!)) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  const normalizedText = remainder.replace(/^[,.:;]+/u, "").trim();
  if (!normalizedText || normalizedText.split(/\s+/u).length === 0) {
    return { originalText, normalizedText: originalText, hadDiscoursePrefix: false };
  }
  return { originalText, normalizedText, hadDiscoursePrefix: true };
}

export type CanonicalEntitySeedV35 = {
  readonly label: string;
  readonly entityType: HistoryEntityTypeV34;
  readonly aliases?: readonly string[];
  readonly defaultRole?: import("./history-v34-contracts.js").HistoryEntitySemanticRoleV34;
  readonly episodeAffinity?: readonly RegExp[];
};

const AMBIGUOUS_ALIAS_KEYS = new Set([
  "terror",
  "plague",
  "erebus",
  "death",
  "fear",
]);

const EPISODE_AFFINITY_BY_LABEL = new Map<string, readonly RegExp[]>([
  ["HMS Terror", [/franklin/i, /northwest passage/i]],
  ["HMS Erebus", [/franklin/i, /northwest passage/i]],
  ["Black Death", [/black-death/i, /black death/i]],
  ["RMS Titanic", [/titanic/i]],
  ["RMS Carpathia", [/titanic/i, /carpathia/i]],
  ["Alexander the Great", [/alexander/i, /persia/i]],
  ["Julius Caesar", [/caesar/i]],
  ["Cleopatra", [/cleopatra/i]],
  ["Spartacus", [/spartacus/i]],
  ["Hannibal Barca", [/hannibal/i, /cannae/i]],
]);

export function isAmbiguousCanonicalAliasV35(aliasKey: string): boolean {
  return AMBIGUOUS_ALIAS_KEYS.has(aliasKey.toLocaleLowerCase());
}

export function episodeAffinityMatchesV35(
  episodeId: string,
  seed: Pick<CanonicalEntitySeedV35, "label" | "episodeAffinity">
): boolean {
  const patterns = seed.episodeAffinity ?? EPISODE_AFFINITY_BY_LABEL.get(seed.label) ?? [];
  return patterns.length === 0 || patterns.some((pattern) => pattern.test(episodeId));
}

export function isSafeCanonicalEntityAliasMatchV35(input: {
  readonly surface: string;
  readonly aliasKey: string;
  readonly seed: Pick<CanonicalEntitySeedV35, "label" | "entityType" | "episodeAffinity">;
  readonly unitText: string;
  readonly episodeId: string;
}): boolean {
  const aliasLower = input.aliasKey.toLocaleLowerCase();
  const surfaceLower = input.surface.toLocaleLowerCase();
  const labelLower = input.seed.label.toLocaleLowerCase();

  if (surfaceLower === labelLower || input.surface === input.seed.label) return true;

  if (input.seed.label === "HMS Terror") {
    if (surfaceLower === "terror" && input.surface !== "Terror") return false;
    if (/\bHMS\s+Terror\b/iu.test(input.unitText)) return true;
    if (input.surface === "Terror" && episodeAffinityMatchesV35(input.episodeId, input.seed))
      return true;
    return false;
  }

  if (input.seed.label === "HMS Erebus") {
    if (surfaceLower === "erebus" && input.surface !== "Erebus") return false;
    if (/\bHMS\s+Erebus\b/iu.test(input.unitText)) return true;
    if (input.surface === "Erebus" && episodeAffinityMatchesV35(input.episodeId, input.seed))
      return true;
    return false;
  }

  if (input.seed.label === "Black Death" && aliasLower === "plague") {
    if (/roman-empire|fall-of-the-roman/i.test(input.episodeId)) return false;
    if (/\bBlack Death\b/iu.test(input.unitText)) return true;
    return episodeAffinityMatchesV35(input.episodeId, input.seed);
  }

  if (input.seed.label === "RMS Titanic" && aliasLower === "titanic") {
    return (
      /\bRMS\s+Titanic\b/iu.test(input.unitText) ||
      episodeAffinityMatchesV35(input.episodeId, input.seed)
    );
  }

  if (input.seed.label === "RMS Carpathia" && aliasLower === "carpathia") {
    return (
      /\bRMS\s+Carpathia\b/iu.test(input.unitText) ||
      episodeAffinityMatchesV35(input.episodeId, input.seed)
    );
  }

  if (input.seed.label === "Alexander the Great" && aliasLower === "alexander") {
    if (/napoleon|kutuzov|tsar-alexander/i.test(input.episodeId)) return false;
    if (/\bAlexander the Great\b/iu.test(input.unitText)) return true;
    return episodeAffinityMatchesV35(input.episodeId, input.seed);
  }

  if (input.seed.label === "Julius Caesar" && aliasLower === "caesar") {
    if (/\bJulius Caesar\b/iu.test(input.unitText)) return true;
    return episodeAffinityMatchesV35(input.episodeId, input.seed);
  }

  if (isAmbiguousCanonicalAliasV35(aliasLower)) {
    if (surfaceLower !== aliasLower) return false;
    if (!episodeAffinityMatchesV35(input.episodeId, input.seed)) return false;
  }

  if (
    input.seed.entityType === "ship" &&
    surfaceLower.length <= 12 &&
    !/\b(?:HMS|RMS|SS|USS|MV)\b/iu.test(input.unitText) &&
    !episodeAffinityMatchesV35(input.episodeId, input.seed)
  ) {
    return false;
  }

  if (
    input.seed.entityType === "disease" &&
    aliasLower !== labelLower &&
    !/\bBlack Death\b/iu.test(input.unitText) &&
    !episodeAffinityMatchesV35(input.episodeId, input.seed)
  ) {
    return false;
  }

  return true;
}

export function isEntityTypeCompatibleWithSurfaceV35(input: {
  readonly surface: string;
  readonly entityType: HistoryEntityTypeV34;
}): boolean {
  const surfaceLower = input.surface.toLocaleLowerCase();
  if (input.entityType === "ship") {
    return (
      /\b(?:HMS|RMS|SS|USS|MV)\b/iu.test(input.surface) ||
      /^[A-Z][\p{L}'-]+$/u.test(input.surface)
    );
  }
  if (input.entityType === "disease") {
    return (
      !["terror", "fear", "death", "war", "plague"].includes(surfaceLower) ||
      /\bBlack Death\b/iu.test(input.surface)
    );
  }
  return true;
}
