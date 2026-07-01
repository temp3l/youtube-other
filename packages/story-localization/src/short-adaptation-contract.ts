import { hashText, normalizeWhitespace } from "@mediaforge/shared";
import { stableSerialize } from "./stable-json.js";
import {
  type ShortStoryOutputConstraints,
  type StoryIR,
} from "./story-artifact-model.js";
import {
  shortRewriteAdaptationContractSchema,
  shortRewriteSourceExtractionSchema,
} from "./short-rewrite.schemas.js";
import {
  type ShortRewriteAdaptationContract,
  type ShortRewriteArtifactIdentity,
  type ShortRewriteResolvedParent,
  type ShortRewriteSourceBeat,
  type ShortRewriteSourceExtraction,
} from "./short-rewrite.types.js";

export const SHORT_SOURCE_EXTRACTION_VERSION = "short-source-extraction-v1";
export const SHORT_ADAPTATION_CONTRACT_SCHEMA_VERSION =
  "short-adaptation-contract-schema-v1";
export const SHORT_ADAPTATION_CONTRACT_VERSION =
  "short-adaptation-contract-v1";

function splitSentences(text: string): readonly string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((entry) => normalizeWhitespace(entry))
    .filter((entry) => entry.length > 0);
}

function normalizeReference(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function tokenize(value: string): readonly string[] {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "under",
    "over",
    "then",
    "when",
    "while",
    "hallway",
    "stairs",
  ]);
  return normalizeReference(value)
    .split(/[^a-z0-9]+/iu)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3 && !stopwords.has(entry));
}

function isMeaningfulOrphanedReference(reference: string): boolean {
  const genericTokens = new Set([
    "voice",
    "voices",
    "sound",
    "sounds",
    "caller",
    "callers",
    "figure",
    "figures",
    "person",
    "people",
    "someone",
    "anyone",
    "everyone",
    "something",
    "nothing",
    "anything",
    "everything",
    "their",
    "theirs",
    "them",
    "they",
    "themselves",
    "hers",
    "herself",
    "her",
    "him",
    "himself",
    "his",
  ]);
  const tokens = tokenize(reference);
  return tokens.some((token) => !genericTokens.has(token));
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((entry) => normalizeWhitespace(entry)).filter(Boolean))];
}

function collectStandaloneReferenceTokens(
  beats: readonly ShortRewriteSourceBeat[]
): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const beat of beats) {
    for (const reference of beat.references) {
      if (!isMeaningfulOrphanedReference(reference)) {
        continue;
      }
      const referenceTokens = tokenize(reference);
      if (referenceTokens.length !== 1) {
        continue;
      }
      const [token] = referenceTokens;
      if (token) {
        tokens.add(token);
      }
    }
  }
  return tokens;
}

function beatReferences(text: string, storyIr: StoryIR): readonly string[] {
  const normalizedText = normalizeReference(text);
  const references = new Set<string>();
  for (const entity of storyIr.entities) {
    const name = normalizeReference(entity.name);
    if (name.length > 0 && normalizedText.includes(name)) {
      references.add(entity.name);
    }
  }
  for (const object of storyIr.criticalObjects) {
    const name = normalizeReference(object.name);
    if (name.length > 0 && normalizedText.includes(name)) {
      references.add(object.name);
    }
  }
  for (const message of storyIr.writtenMessages) {
    const content = normalizeReference(message.text);
    if (content.length > 0 && normalizedText.includes(content)) {
      references.add(message.text);
    }
  }
  return [...references];
}

function minimumRetainedBeatCount(
  outputConstraints: ShortStoryOutputConstraints,
  maximumBeats: number
): number {
  const heuristicMinimum = Math.ceil(outputConstraints.targetWordRange.min / 55);
  return Math.min(maximumBeats, Math.max(3, heuristicMinimum));
}

function findBeatIndex(
  beats: readonly ShortRewriteSourceBeat[],
  beatId: string
): number {
  return beats.findIndex((beat) => beat.id === beatId);
}

function hasInteriorBridgeBeat(
  beats: readonly ShortRewriteSourceBeat[],
  selectedBeatIds: readonly string[]
): boolean {
  if (selectedBeatIds.length < 3) {
    return false;
  }
  const orderedIndices = selectedBeatIds
    .map((id) => findBeatIndex(beats, id))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  const first = orderedIndices[0];
  const last = orderedIndices[orderedIndices.length - 1];
  if (first === undefined || last === undefined || last - first <= 1) {
    return true;
  }
  return orderedIndices.some((index) => index > first && index < last);
}

function addSelectedBeat(
  orderedSelection: ShortRewriteSourceBeat[],
  selectedBeatIds: Set<string>,
  beat: ShortRewriteSourceBeat | undefined
): boolean {
  if (!beat || selectedBeatIds.has(beat.id)) {
    return false;
  }
  selectedBeatIds.add(beat.id);
  orderedSelection.push(beat);
  return true;
}

function chooseBeatNearMidpoint(args: {
  readonly beats: readonly ShortRewriteSourceBeat[];
  readonly selectedBeatIds: ReadonlySet<string>;
  readonly startIndex: number;
  readonly endIndex: number;
}): ShortRewriteSourceBeat | undefined {
  if (args.endIndex - args.startIndex <= 1) {
    return undefined;
  }
  const midpoint = (args.startIndex + args.endIndex) / 2;
  const candidates = args.beats
    .slice(args.startIndex + 1, args.endIndex)
    .filter((beat) => !args.selectedBeatIds.has(beat.id));
  return candidates.sort((left, right) => {
    const leftIndex = findBeatIndex(args.beats, left.id);
    const rightIndex = findBeatIndex(args.beats, right.id);
    return Math.abs(leftIndex - midpoint) - Math.abs(rightIndex - midpoint);
  })[0];
}

function chooseCoverageBeat(args: {
  readonly beats: readonly ShortRewriteSourceBeat[];
  readonly selectedBeatIds: ReadonlySet<string>;
}): ShortRewriteSourceBeat | undefined {
  const selectedIndices = [...args.selectedBeatIds]
    .map((id) => findBeatIndex(args.beats, id))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  if (selectedIndices.length === 0) {
    return args.beats[0];
  }
  let widestGapCandidate: ShortRewriteSourceBeat | undefined;
  let widestGapSize = -1;
  for (let index = 0; index < selectedIndices.length - 1; index += 1) {
    const start = selectedIndices[index];
    const end = selectedIndices[index + 1];
    if (start === undefined || end === undefined) {
      continue;
    }
    const candidate = chooseBeatNearMidpoint({
      beats: args.beats,
      selectedBeatIds: args.selectedBeatIds,
      startIndex: start,
      endIndex: end,
    });
    if (!candidate || end - start <= widestGapSize) {
      continue;
    }
    widestGapSize = end - start;
    widestGapCandidate = candidate;
  }
  if (widestGapCandidate) {
    return widestGapCandidate;
  }
  return args.beats.find((beat) => !args.selectedBeatIds.has(beat.id));
}

function selectRetainedBeatIds(args: {
  readonly beats: readonly ShortRewriteSourceBeat[];
  readonly storyIr: StoryIR;
  readonly maximumBeats: number;
  readonly minimumBeats: number;
}): readonly string[] {
  const requiredIds = new Set<string>();
  if (args.beats[0]) {
    requiredIds.add(args.beats[0].id);
  }
  const priorityPhrases = uniqueStrings([
    args.storyIr.centralThreat.description,
    args.storyIr.centralRuleMechanism.description,
    ...args.storyIr.criticalObjects.map((entry) => entry.name),
    ...args.storyIr.writtenMessages.map((entry) => entry.text),
    args.storyIr.climax,
    args.storyIr.endingConsequence,
  ]);
  for (const beat of args.beats) {
    const normalized = normalizeReference(beat.text);
    const matched = priorityPhrases.some((phrase) => {
      const normalizedPhrase = normalizeReference(phrase);
      if (normalizedPhrase.length === 0) {
        return false;
      }
      if (normalized.includes(normalizedPhrase)) {
        return true;
      }
      const phraseTokens = tokenize(normalizedPhrase);
      return phraseTokens.length > 0 && phraseTokens.every((token) => normalized.includes(token));
    });
    if (matched) {
      requiredIds.add(beat.id);
    }
  }
  const selectedBeatIds = new Set(requiredIds);
  const orderedSelection = args.beats.filter((beat) =>
    selectedBeatIds.has(beat.id)
  );
  if (
    orderedSelection.length >= 2 &&
    !hasInteriorBridgeBeat(args.beats, [...selectedBeatIds]) &&
    orderedSelection.length < args.maximumBeats
  ) {
    const orderedIndices = [...selectedBeatIds]
      .map((id) => findBeatIndex(args.beats, id))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right);
    const bridgeBeat = chooseBeatNearMidpoint({
      beats: args.beats,
      selectedBeatIds,
      startIndex: orderedIndices[0] ?? 0,
      endIndex: orderedIndices[orderedIndices.length - 1] ?? 0,
    });
    addSelectedBeat(orderedSelection, selectedBeatIds, bridgeBeat);
  }
  if (orderedSelection.length < args.minimumBeats) {
    while (orderedSelection.length < args.minimumBeats) {
      const candidate = chooseCoverageBeat({
        beats: args.beats,
        selectedBeatIds,
      });
      if (!addSelectedBeat(orderedSelection, selectedBeatIds, candidate)) {
        break;
      }
    }
  }
  while (orderedSelection.length < args.maximumBeats) {
    const selectedIds = orderedSelection.map((beat) => beat.id);
    const orphaned = detectOrphanedShortReferences({
      beats: args.beats.map((beat) => ({
        ...beat,
        retained: selectedIds.includes(beat.id),
      })),
      selectedBeatIds: selectedIds,
    });
    if (orphaned.length === 0) {
      break;
    }
    const nextBeat = orphaned
      .map((entry) => {
        const startIndex = findBeatIndex(args.beats, entry.introducedByBeatId);
        const endIndex = findBeatIndex(args.beats, entry.firstRetainedBeatId);
        if (startIndex < 0 || endIndex < 0) {
          return undefined;
        }
        return chooseBeatNearMidpoint({
          beats: args.beats,
          selectedBeatIds,
          startIndex: Math.min(startIndex, endIndex),
          endIndex: Math.max(startIndex, endIndex),
        });
      })
      .find((beat) => beat !== undefined);
    const fallbackBeat = nextBeat ?? chooseCoverageBeat({
      beats: args.beats,
      selectedBeatIds,
    });
    if (!addSelectedBeat(orderedSelection, selectedBeatIds, fallbackBeat)) {
      break;
    }
  }
  const capped = orderedSelection
    .sort((left, right) => {
      if (left.paragraphIndex !== right.paragraphIndex) {
        return left.paragraphIndex - right.paragraphIndex;
      }
      return left.sentenceIndex - right.sentenceIndex;
    })
    .slice(0, args.maximumBeats)
    .map((beat) => beat.id);
  return capped.length > 0 ? capped : args.beats.slice(0, args.maximumBeats).map((beat) => beat.id);
}

export function validateShortSourceExtraction(args: {
  readonly extraction: ShortRewriteSourceExtraction;
  readonly outputConstraints: ShortStoryOutputConstraints;
}): readonly string[] {
  const issues: string[] = [];
  const minimumBeats = minimumRetainedBeatCount(
    args.outputConstraints,
    args.extraction.maximumBeats
  );
  if (args.extraction.selectedBeatIds.length < minimumBeats) {
    issues.push(
      `Short source extraction retained only ${args.extraction.selectedBeatIds.length} beats; at least ${minimumBeats} are required for the configured short target.`
    );
  }
  if (args.extraction.orphanedReferences.length > 0) {
    const preview = args.extraction.orphanedReferences
      .slice(0, 3)
      .map((entry) => entry.reference)
      .join(", ");
    issues.push(
      `Short source extraction contains orphaned references${preview ? `: ${preview}` : "."}`
    );
  }
  if (
    args.extraction.beats.length > 0 &&
    !hasInteriorBridgeBeat(
      args.extraction.beats,
      args.extraction.selectedBeatIds
    )
  ) {
    const selectedIndices = args.extraction.selectedBeatIds
      .map((id) => findBeatIndex(args.extraction.beats, id))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right);
    const first = selectedIndices[0];
    const last = selectedIndices[selectedIndices.length - 1];
    if (first !== undefined && last !== undefined && last - first > 1) {
      issues.push(
        "Short source extraction does not retain a bridging beat between the opening and ending beats."
      );
    }
  }
  return issues;
}

export function detectOrphanedShortReferences(args: {
  readonly beats: readonly ShortRewriteSourceBeat[];
  readonly selectedBeatIds: readonly string[];
}): ShortRewriteSourceExtraction["orphanedReferences"] {
  const keptIndex = new Map<string, number>();
  const standaloneReferenceTokens = collectStandaloneReferenceTokens(args.beats);
  args.selectedBeatIds.forEach((id, index) => {
    keptIndex.set(id, index);
  });
  const referenceOccurrences = new Map<
    string,
    Array<{ readonly beatId: string; readonly retained: boolean; readonly order: number }>
  >();
  args.beats.forEach((beat, order) => {
    for (const reference of beat.references) {
      const current = referenceOccurrences.get(reference) ?? [];
      current.push({
        beatId: beat.id,
        retained: keptIndex.has(beat.id),
        order,
      });
      referenceOccurrences.set(reference, current);
    }
  });
  const orphaned: Array<ShortRewriteSourceExtraction["orphanedReferences"][number]> = [];
  for (const [reference, occurrences] of referenceOccurrences.entries()) {
    if (!isMeaningfulOrphanedReference(reference)) {
      continue;
    }
    const firstRetained = occurrences.find((entry) => entry.retained);
    if (!firstRetained) {
      continue;
    }
    const firstOverall = occurrences[0];
    if (!firstOverall || firstOverall.beatId === firstRetained.beatId) {
      continue;
    }
    orphaned.push({
      reference,
      introducedByBeatId: firstOverall.beatId,
      firstRetainedBeatId: firstRetained.beatId,
    });
  }
  for (const removedBeat of args.beats.filter((beat) => !keptIndex.has(beat.id))) {
    const removedTokens = new Set(tokenize(removedBeat.text));
    const removedReferenceTokens = new Set(
      removedBeat.references.flatMap((reference) => tokenize(reference))
    );
    for (const retainedBeat of args.beats.filter((beat) => keptIndex.has(beat.id))) {
      if (
        removedBeat.paragraphIndex > retainedBeat.paragraphIndex ||
        (removedBeat.paragraphIndex === retainedBeat.paragraphIndex &&
          removedBeat.sentenceIndex >= retainedBeat.sentenceIndex)
      ) {
        continue;
      }
      const retainedReferenceTokens = new Set(
        retainedBeat.references.flatMap((reference) => tokenize(reference))
      );
      const shared = tokenize(retainedBeat.text).find(
        (token) =>
          standaloneReferenceTokens.has(token) &&
          removedTokens.has(token) &&
          (removedReferenceTokens.has(token) || retainedReferenceTokens.has(token))
      );
      if (!shared) {
        continue;
      }
      const entry = {
        reference: shared,
        introducedByBeatId: removedBeat.id,
        firstRetainedBeatId: retainedBeat.id,
      };
      if (
        !orphaned.some(
          (current) =>
            current.reference === entry.reference &&
            current.introducedByBeatId === entry.introducedByBeatId &&
            current.firstRetainedBeatId === entry.firstRetainedBeatId
        )
      ) {
        orphaned.push(entry);
      }
    }
  }
  return orphaned;
}

export function computeShortSourceExtractionHash(
  extraction: Omit<ShortRewriteSourceExtraction, "extractionHash">
): string {
  return hashText(stableSerialize(extraction));
}

export function computeShortAdaptationContractHash(
  contract: Omit<ShortRewriteAdaptationContract, "contractHash">
): string {
  return hashText(stableSerialize(contract));
}

export function buildShortSourceExtraction(args: {
  readonly parent: ShortRewriteResolvedParent;
  readonly storyIr: StoryIR;
  readonly outputConstraints: ShortStoryOutputConstraints;
}): ShortRewriteSourceExtraction {
  const beats: ShortRewriteSourceBeat[] = [];
  args.parent.narrationParagraphs.forEach((paragraph, paragraphIndex) => {
    splitSentences(paragraph).forEach((sentence, sentenceIndex) => {
      beats.push({
        id: `b${String(beats.length + 1).padStart(2, "0")}`,
        paragraphIndex,
        sentenceIndex,
        text: sentence,
        references: beatReferences(sentence, args.storyIr),
        retained: false,
      });
    });
  });
  const maximumBeats = Math.max(1, Math.min(8, args.outputConstraints.targetDuration.maxSeconds <= 65 ? 6 : 8));
  const minimumBeats = minimumRetainedBeatCount(
    args.outputConstraints,
    maximumBeats
  );
  const selectedBeatIds = selectRetainedBeatIds({
    beats,
    storyIr: args.storyIr,
    maximumBeats,
    minimumBeats,
  });
  const beatsWithRetention = beats.map((beat) => ({
    ...beat,
    retained: selectedBeatIds.includes(beat.id),
  }));
  const removedBeatIds = beatsWithRetention
    .filter((beat) => !beat.retained)
    .map((beat) => beat.id);
  const orphanedReferences = detectOrphanedShortReferences({
    beats: beatsWithRetention,
    selectedBeatIds,
  });
  const payload: Omit<ShortRewriteSourceExtraction, "extractionHash"> = {
    version: SHORT_SOURCE_EXTRACTION_VERSION,
    parentFullHash: args.parent.parentFullHash,
    storyIrHash: args.parent.storyIrHash,
    locale: args.parent.identity.locale,
    targetVariant: "short",
    maximumBeats,
    selectedBeatIds,
    removedBeatIds,
    beats: beatsWithRetention,
    orphanedReferences,
  };
  const extraction = {
    ...payload,
    extractionHash: computeShortSourceExtractionHash(payload),
  };
  return shortRewriteSourceExtractionSchema.parse(extraction);
}

export function buildShortAdaptationContract(args: {
  readonly identity: ShortRewriteArtifactIdentity;
  readonly parent: ShortRewriteResolvedParent;
  readonly storyIr: StoryIR;
  readonly extraction: ShortRewriteSourceExtraction;
  readonly outputConstraints: ShortStoryOutputConstraints;
}): ShortRewriteAdaptationContract {
  const criticalObject = args.storyIr.criticalObjects[0]?.name ?? args.storyIr.centralThreat.description;
  const retainedFacts = args.storyIr.immutableFacts
    .filter((fact) => fact.immutable)
    .slice(0, 10)
    .map((fact) => ({
      id: fact.id,
      statement: fact.statement,
    }));
  const contractPayload: Omit<ShortRewriteAdaptationContract, "contractHash"> = {
    schemaVersion: SHORT_ADAPTATION_CONTRACT_SCHEMA_VERSION,
    contractVersion: SHORT_ADAPTATION_CONTRACT_VERSION,
    identity: args.identity,
    parent: {
      ...args.parent.identity,
      parentFullHash: args.parent.parentFullHash,
      sourceSha256: args.parent.sourceSha256,
    },
    storyIrHash: args.parent.storyIrHash,
    immutableFacts: retainedFacts,
    centralThreat: args.storyIr.centralThreat.description,
    centralRuleOrMechanism: args.storyIr.centralRuleMechanism.description,
    criticalObject,
    climaxOrIrreversibleTurn: args.storyIr.climax,
    finalConsequenceOrSting: args.storyIr.endingConsequence,
    exactWrittenMessages: uniqueStrings(
      args.storyIr.writtenMessages.map((entry) => entry.text)
    ),
    allowedCompression: [
      "Combine adjacent setup beats when no immutable fact is lost.",
      "Condense atmosphere and secondary movement into fewer clauses.",
      "Shorten dialogue to the minimum wording needed for the same narrative function.",
    ],
    forbiddenOmissions: uniqueStrings([
      args.storyIr.centralThreat.description,
      args.storyIr.centralRuleMechanism.description,
      criticalObject,
      args.storyIr.climax,
      args.storyIr.endingConsequence,
      ...args.storyIr.writtenMessages.map((entry) => entry.text),
    ]),
    retentionBoundaries: {
      factsMustRemain: retainedFacts.map((fact) => fact.statement),
      detailsMayCompress: uniqueStrings(
        args.extraction.beats
          .filter((beat) => beat.retained)
          .slice(1)
          .map((beat) => beat.text)
      ),
      detailsMayRemove: args.extraction.removedBeatIds,
      dialogueMayShorten: args.storyIr.writtenMessages.map((entry) => entry.text),
    },
    inventionBoundaries: [
      "Do not invent new characters, motives, rules, evidence, clues, or outcomes.",
      "Do not translate, paraphrase, or replace exact written messages marked for retention.",
      "Do not move a reveal earlier if doing so removes the original escalation.",
    ],
    constraints: {
      targetDurationSeconds: {
        min: args.outputConstraints.targetDuration.minSeconds,
        max: args.outputConstraints.targetDuration.maxSeconds,
      },
      targetNarrationWpm: args.outputConstraints.targetNarrationWpm,
      targetWordRange: args.outputConstraints.targetWordRange,
      hookDeadlineSeconds: args.outputConstraints.hookDeadlineSeconds,
      maximumBeats: args.extraction.maximumBeats,
    },
    sourceExtraction: {
      extractionHash: args.extraction.extractionHash,
      selectedBeatIds: args.extraction.selectedBeatIds,
      orphanedReferences: args.extraction.orphanedReferences,
    },
  };
  const contract = {
    ...contractPayload,
    contractHash: computeShortAdaptationContractHash(contractPayload),
  };
  return shortRewriteAdaptationContractSchema.parse(contract);
}
