import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import { z } from "zod";
import {
  CHARACTER_NAME_POOL_ID,
  GIVEN_NAME_CANDIDATES,
  SURNAME_CANDIDATES,
} from "./character-name-pools.js";
import { stableSerialize } from "./stable-json.js";
import {
  type CanonicalStoryFacts,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import { type StoryIR } from "./story-artifact-model.js";

const TITLE_PATTERN =
  /^(?<title>(?:dr|doctor|officer|professor|sister|mr|mrs|ms|miss)\.?)\s+/iu;

export const characterRenameEntrySchema = z
  .object({
    characterId: z.string().trim().min(1),
    originalName: z.string().trim().min(1),
    fictionalName: z.string().trim().min(1),
    originalAliases: z.array(z.string().trim().min(1)).min(1),
    fictionalAliases: z.array(z.string().trim().min(1)).min(1),
    role: z.string().trim().min(1).optional(),
  })
  .strict();
export type CharacterRenameEntry = z.infer<typeof characterRenameEntrySchema>;

export const characterRenameMapSchema = z
  .object({
    version: z.literal(1),
    episodeId: z.string().trim().min(1),
    sourceHash: z.string().trim().min(1),
    poolId: z.string().trim().min(1),
    entries: z.array(characterRenameEntrySchema),
    hash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();
export type CharacterRenameMap = z.infer<typeof characterRenameMapSchema>;

interface NameParts {
  readonly title?: string;
  readonly first: string;
  readonly surname?: string;
}

interface RenameCandidate {
  readonly entryId: string;
  readonly originalName: string;
  readonly role?: string;
}

function normalizeName(value: string): string {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function splitName(name: string): NameParts {
  const normalized = normalizeWhitespace(name);
  const titleMatch = TITLE_PATTERN.exec(normalized);
  const title = titleMatch?.groups?.["title"];
  const core = title ? normalized.slice(titleMatch[0].length) : normalized;
  const parts = core.split(/\s+/u).filter(Boolean);
  const surname = parts.length > 1 ? parts.at(-1) : undefined;
  return {
    first: parts[0] ?? core,
    ...(title ? { title: title.replace(/\s+/gu, " ").trim() } : {}),
    ...(surname ? { surname } : {}),
  };
}

function estimateSyllables(value: string): number {
  const normalized = normalizeName(value).replace(/[^a-z]/gu, "");
  const groups = normalized.match(/[aeiouy]+/gu) ?? [];
  return Math.max(1, groups.length);
}

function levenshtein(left: string, right: string): number {
  const a = normalizeName(left);
  const b = normalizeName(right);
  const dp = Array.from({ length: a.length + 1 }, (_, index) =>
    Array<number>(b.length + 1).fill(index === 0 ? 0 : index)
  );
  for (let column = 0; column <= b.length; column += 1) {
    dp[0]![column] = column;
  }
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      dp[row]![column] = Math.min(
        dp[row - 1]![column]! + 1,
        dp[row]![column - 1]! + 1,
        dp[row - 1]![column - 1]! + cost
      );
    }
  }
  return dp[a.length]![b.length]!;
}

function vowelPattern(value: string): string {
  return normalizeName(value).replace(/[^aeiouy]/gu, "");
}

function scoreCandidate(original: string, candidate: string): number {
  const initialScore =
    normalizeName(original)[0] === normalizeName(candidate)[0] ? 40 : 0;
  const lengthScore = Math.max(
    0,
    20 - Math.abs(original.length - candidate.length) * 4
  );
  const syllableScore =
    estimateSyllables(original) === estimateSyllables(candidate) ? 18 : 0;
  const vowelScore =
    vowelPattern(original) === vowelPattern(candidate)
      ? 12
      : Math.max(0, 8 - levenshtein(vowelPattern(original), vowelPattern(candidate)) * 2);
  const distancePenalty = levenshtein(original, candidate) * 2;
  return initialScore + lengthScore + syllableScore + vowelScore - distancePenalty;
}

function chooseCandidate(args: {
  readonly episodeId: string;
  readonly sourceHash: string;
  readonly original: string;
  readonly used: ReadonlySet<string>;
  readonly pool: readonly string[];
}): string {
  const target = normalizeWhitespace(args.original);
  const sorted = [...args.pool]
    .filter((candidate) => normalizeName(candidate) !== normalizeName(target))
    .filter((candidate) => !args.used.has(normalizeName(candidate)))
    .sort((left, right) => {
      const scoreDelta = scoreCandidate(args.original, right) - scoreCandidate(args.original, left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      const leftSeed = hashText(
        `${args.episodeId}\u0000${args.sourceHash}\u0000${target}\u0000${CHARACTER_NAME_POOL_ID}\u0000${left}`
      );
      const rightSeed = hashText(
        `${args.episodeId}\u0000${args.sourceHash}\u0000${target}\u0000${CHARACTER_NAME_POOL_ID}\u0000${right}`
      );
      return leftSeed.localeCompare(rightSeed);
    });
  const selected = sorted[0];
  if (!selected) {
    throw new Error(`No fictional name candidate available for ${args.original}.`);
  }
  return selected;
}

function buildAliases(parts: NameParts): readonly string[] {
  const aliases = new Set<string>();
  const fullName = [parts.first, parts.surname].filter(Boolean).join(" ");
  if (fullName.length > 0) {
    aliases.add(fullName);
  }
  aliases.add(parts.first);
  if (parts.surname) {
    aliases.add(parts.surname);
  }
  if (parts.title) {
    aliases.add(`${parts.title} ${parts.first}`);
    if (parts.surname) {
      aliases.add(`${parts.title} ${parts.surname}`);
      aliases.add(`${parts.title} ${fullName}`);
    }
  }
  return [...aliases];
}

function buildFictionalAliases(
  original: NameParts,
  fictional: NameParts
): readonly string[] {
  const aliases = new Map<string, string>();
  const originalFull = [original.first, original.surname].filter(Boolean).join(" ");
  const fictionalFull = [fictional.first, fictional.surname].filter(Boolean).join(" ");
  aliases.set(originalFull, fictionalFull);
  aliases.set(original.first, fictional.first);
  if (original.surname && fictional.surname) {
    aliases.set(original.surname, fictional.surname);
  }
  if (original.title) {
    aliases.set(`${original.title} ${original.first}`, `${original.title} ${fictional.first}`);
    if (original.surname && fictional.surname) {
      aliases.set(
        `${original.title} ${original.surname}`,
        `${original.title} ${fictional.surname}`
      );
      aliases.set(
        `${original.title} ${originalFull}`,
        `${original.title} ${fictionalFull}`
      );
    }
  }
  return buildAliases(original).map((alias) => aliases.get(alias) ?? fictionalFull);
}

function buildCandidates(
  facts: CanonicalStoryFacts,
  storyIr: StoryIR
): readonly RenameCandidate[] {
  const byName = new Map<string, RenameCandidate>();
  for (const entity of storyIr.entities.filter((entry) => entry.type === "person")) {
    byName.set(normalizeName(entity.name), {
      entryId: entity.id,
      originalName: entity.name,
      ...(entity.narrativeRole ? { role: entity.narrativeRole } : {}),
    });
  }
  for (const [index, character] of facts.characters.entries()) {
    const key = normalizeName(character.name);
    if (!byName.has(key)) {
      byName.set(key, {
        entryId: `character-${index + 1}`,
        originalName: character.name,
        role: character.role,
      });
    }
  }
  return [...byName.values()];
}

export function buildCharacterRenameMap(args: {
  readonly episodeId: string;
  readonly sourceHash: string;
  readonly canonicalFacts: CanonicalStoryFacts;
  readonly storyIr: StoryIR;
}): CharacterRenameMap {
  const usedGiven = new Set<string>();
  const usedSurnames = new Set<string>();
  const entries = buildCandidates(args.canonicalFacts, args.storyIr).map((candidate) => {
    const originalParts = splitName(candidate.originalName);
    const fictionalFirst = chooseCandidate({
      episodeId: args.episodeId,
      sourceHash: args.sourceHash,
      original: originalParts.first,
      used: usedGiven,
      pool: GIVEN_NAME_CANDIDATES,
    });
    usedGiven.add(normalizeName(fictionalFirst));
    const fictionalSurname = originalParts.surname
      ? chooseCandidate({
          episodeId: args.episodeId,
          sourceHash: args.sourceHash,
          original: originalParts.surname,
          used: usedSurnames,
          pool: SURNAME_CANDIDATES,
        })
      : undefined;
    if (fictionalSurname) {
      usedSurnames.add(normalizeName(fictionalSurname));
    }
    const fictionalParts: NameParts = {
      ...(originalParts.title ? { title: originalParts.title } : {}),
      first: fictionalFirst,
      ...(fictionalSurname ? { surname: fictionalSurname } : {}),
    };
    const fictionalName = [
      originalParts.title,
      fictionalFirst,
      fictionalSurname,
    ]
      .filter(Boolean)
      .join(" ");
    return characterRenameEntrySchema.parse({
      characterId: candidate.entryId,
      originalName: candidate.originalName,
      fictionalName,
      originalAliases: buildAliases(originalParts),
      fictionalAliases: buildFictionalAliases(originalParts, fictionalParts),
      ...(candidate.role ? { role: candidate.role } : {}),
    });
  });
  const hash = hashText(
    stableSerialize({
      version: 1,
      episodeId: args.episodeId,
      sourceHash: args.sourceHash,
      poolId: CHARACTER_NAME_POOL_ID,
      entries,
    })
  );
  return characterRenameMapSchema.parse({
    version: 1,
    episodeId: args.episodeId,
    sourceHash: args.sourceHash,
    poolId: CHARACTER_NAME_POOL_ID,
    entries,
    hash,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function applyCharacterRenameMapToText(
  text: string,
  renameMap: CharacterRenameMap
): string {
  let updated = text.normalize("NFC");
  const replacements = renameMap.entries.flatMap((entry) =>
    entry.originalAliases.map((originalAlias, index) => ({
      originalAlias,
      fictionalAlias: entry.fictionalAliases[index] ?? entry.fictionalName,
    }))
  );
  replacements.sort(
    (left, right) => right.originalAlias.length - left.originalAlias.length
  );
  for (const replacement of replacements) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])(${escapeRegExp(replacement.originalAlias)})(['’]s|s['’])?(?=$|[^\\p{L}\\p{N}])`,
      "giu"
    );
    updated = updated.replace(
      pattern,
      (_, prefix: string, __: string, suffix?: string) =>
        `${prefix}${replacement.fictionalAlias}${suffix ?? ""}`
    );
  }
  return updated;
}

export function applyCharacterRenameMapToParsedSource(
  sourceStory: ParsedSourceStory,
  renameMap: CharacterRenameMap
): ParsedSourceStory {
  return {
    ...sourceStory,
    title: applyCharacterRenameMapToText(sourceStory.title, renameMap),
    ...(sourceStory.sourceTitle
      ? { sourceTitle: applyCharacterRenameMapToText(sourceStory.sourceTitle, renameMap) }
      : {}),
    narrationParagraphs: sourceStory.narrationParagraphs.map((entry) =>
      applyCharacterRenameMapToText(entry, renameMap)
    ),
    metadata: {
      ...sourceStory.metadata,
      primaryTitle: applyCharacterRenameMapToText(sourceStory.metadata.primaryTitle, renameMap),
      ...(sourceStory.metadata.sourceTitle
        ? {
            sourceTitle: applyCharacterRenameMapToText(
              sourceStory.metadata.sourceTitle,
              renameMap
            ),
          }
        : {}),
      narration: sourceStory.metadata.narration.map((entry) =>
        applyCharacterRenameMapToText(entry, renameMap)
      ),
      ...(sourceStory.metadata.thumbnailText
        ? {
            thumbnailText: applyCharacterRenameMapToText(
              sourceStory.metadata.thumbnailText,
              renameMap
            ),
          }
        : {}),
      ...(sourceStory.metadata.seoDescription
        ? {
            seoDescription: applyCharacterRenameMapToText(
              sourceStory.metadata.seoDescription,
              renameMap
            ),
          }
        : {}),
    },
    content: applyCharacterRenameMapToText(sourceStory.content, renameMap),
  };
}

export function applyCharacterRenameMapToCanonicalFacts(
  facts: CanonicalStoryFacts,
  renameMap: CharacterRenameMap
): CanonicalStoryFacts {
  return {
    ...facts,
    primaryTitle: applyCharacterRenameMapToText(facts.primaryTitle, renameMap),
    ...(facts.sourceTitle
      ? { sourceTitle: applyCharacterRenameMapToText(facts.sourceTitle, renameMap) }
      : {}),
    characters: facts.characters.map((character) => ({
      ...character,
      name: applyCharacterRenameMapToText(character.name, renameMap),
      role: applyCharacterRenameMapToText(character.role, renameMap),
      ...(character.relationship
        ? {
            relationship: applyCharacterRenameMapToText(
              character.relationship,
              renameMap
            ),
          }
        : {}),
    })),
    criticalEvents: facts.criticalEvents.map((entry) =>
      applyCharacterRenameMapToText(entry, renameMap)
    ),
    writtenMessages: facts.writtenMessages.map((entry) =>
      applyCharacterRenameMapToText(entry, renameMap)
    ),
    threat: applyCharacterRenameMapToText(facts.threat, renameMap),
    primaryReveal: applyCharacterRenameMapToText(facts.primaryReveal, renameMap),
    finalConsequence: applyCharacterRenameMapToText(
      facts.finalConsequence,
      renameMap
    ),
    ...(facts.unresolvedQuestion
      ? {
          unresolvedQuestion: applyCharacterRenameMapToText(
            facts.unresolvedQuestion,
            renameMap
          ),
        }
      : {}),
  };
}

export function applyCharacterRenameMapToStoryIr(
  storyIr: StoryIR,
  renameMap: CharacterRenameMap
): StoryIR {
  return {
    ...storyIr,
    entities: storyIr.entities.map((entity) => ({
      ...entity,
      name:
        entity.type === "person"
          ? applyCharacterRenameMapToText(entity.name, renameMap)
          : entity.name,
      ...(entity.narrativeRole
        ? {
            narrativeRole: applyCharacterRenameMapToText(
              entity.narrativeRole,
              renameMap
            ),
          }
        : {}),
      ...(entity.relationship
        ? {
            relationship: applyCharacterRenameMapToText(
              entity.relationship,
              renameMap
            ),
          }
        : {}),
    })),
    immutableFacts: storyIr.immutableFacts.map((fact) => ({
      ...fact,
      statement: applyCharacterRenameMapToText(fact.statement, renameMap),
    })),
    chronology: storyIr.chronology.map((entry) =>
      applyCharacterRenameMapToText(entry, renameMap)
    ),
    centralThreat: {
      ...storyIr.centralThreat,
      description: applyCharacterRenameMapToText(
        storyIr.centralThreat.description,
        renameMap
      ),
    },
    centralRuleMechanism: {
      ...storyIr.centralRuleMechanism,
      description: applyCharacterRenameMapToText(
        storyIr.centralRuleMechanism.description,
        renameMap
      ),
    },
    criticalObjects: storyIr.criticalObjects.map((entry) => ({
      ...entry,
      narrativeFunction: applyCharacterRenameMapToText(
        entry.narrativeFunction,
        renameMap
      ),
      ...(entry.origin
        ? { origin: applyCharacterRenameMapToText(entry.origin, renameMap) }
        : {}),
    })),
    writtenMessages: storyIr.writtenMessages.map((entry) => ({
      ...entry,
      text: applyCharacterRenameMapToText(entry.text, renameMap),
    })),
    climax: applyCharacterRenameMapToText(storyIr.climax, renameMap),
    endingConsequence: applyCharacterRenameMapToText(
      storyIr.endingConsequence,
      renameMap
    ),
    allowedInventionBoundaries: {
      ...storyIr.allowedInventionBoundaries,
      ...(storyIr.allowedInventionBoundaries.notes
        ? {
            notes: storyIr.allowedInventionBoundaries.notes.map((entry) =>
              applyCharacterRenameMapToText(entry, renameMap)
            ),
          }
        : {}),
    },
  };
}

export function detectOriginalCharacterNameLeaks(args: {
  readonly text: string;
  readonly renameMap: CharacterRenameMap;
}): readonly string[] {
  const normalizedText = args.text.normalize("NFC");
  const leaks = new Set<string>();
  for (const entry of args.renameMap.entries) {
    for (const alias of entry.originalAliases) {
      const pattern = new RegExp(
        `(^|[^\\p{L}\\p{N}])${escapeRegExp(alias)}(['’]s|s['’])?(?=$|[^\\p{L}\\p{N}])`,
        "iu"
      );
      if (pattern.test(normalizedText)) {
        leaks.add(alias);
      }
    }
  }
  return [...leaks];
}
