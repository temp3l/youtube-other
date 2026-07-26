import {
  hashText,
  normalizeWhitespace,
  splitIntoSentences,
} from "@mediaforge/shared";
import {
  applyCharacterRenameMapToText,
  type CharacterRenameMap,
} from "./character-rename.service.js";
import { type CanonicalStoryFacts } from "./story-localization.types.js";
import {
  STORY_AFFECT_REPAIR_HISTORY_SCHEMA_VERSION,
  STORY_AFFECT_REPAIR_PROMPT_VERSION,
  STORY_AFFECT_REPAIR_ROUTING_VERSION,
  type StoryAffectIssueCode,
  type StoryAffectProtectedFact,
  type StoryAffectRepairHistoryEntry,
} from "./story-generation-contracts.js";
import type {
  StoryAffectRepairRoutingDecision,
  StoryAffectRoutingFinding,
} from "./story-retry-routing.js";
import { stableSerialize } from "./stable-json.js";

export interface StoryAffectRepairLocks {
  readonly parentHashes: Readonly<Record<string, string>>;
  readonly immutableFacts: readonly StoryAffectProtectedFact[];
  readonly acceptedFinalLine: string;
  readonly renameMapHash: string;
  readonly unaffectedBeats: readonly {
    readonly beatId: string;
    readonly contentHash: string;
  }[];
  readonly selectedProjection: {
    readonly kind: "full" | "short" | "localization";
    readonly projectionHash: string;
    readonly selectedIds: readonly string[];
  };
  readonly wordBudget: {
    readonly min: number;
    readonly max: number;
  };
  readonly durationBudget: {
    readonly minSeconds: number;
    readonly maxSeconds: number;
  };
  readonly narrationOnly: true;
}

export interface StoryTargetedAffectRepairInstructions {
  readonly promptVersion: typeof STORY_AFFECT_REPAIR_PROMPT_VERSION;
  readonly routingVersion: typeof STORY_AFFECT_REPAIR_ROUTING_VERSION;
  readonly promptFingerprint: string;
  readonly routingFingerprint: string;
  readonly issueIds: readonly string[];
  readonly issueCodes: readonly StoryAffectIssueCode[];
  readonly repairScope: "beat" | "beat-range";
  readonly affectedBeatIds: readonly string[];
  readonly paragraphSpans: readonly {
    readonly start: number;
    readonly end: number;
  }[];
  readonly protectedFacts: readonly StoryAffectProtectedFact[];
  readonly locks: StoryAffectRepairLocks;
  readonly text: string;
}

export function buildTargetedAffectRepairInstructions(args: {
  readonly decision: Extract<
    StoryAffectRepairRoutingDecision,
    { readonly action: "repair" }
  >;
  readonly findings: readonly StoryAffectRoutingFinding[];
  readonly acceptedPlanFragments: readonly {
    readonly beatId: string;
    readonly instruction: string;
  }[];
  readonly locks: StoryAffectRepairLocks;
}): StoryTargetedAffectRepairInstructions {
  const findingById = new Map(
    args.findings.map((finding) => [finding.id, finding])
  );
  const findings = args.decision.issueIds.map((issueId) => {
    const finding = findingById.get(issueId);
    if (!finding) {
      throw new Error(`Affect repair finding ${issueId} is missing.`);
    }
    return finding;
  });
  const fragmentByBeatId = new Map(
    args.acceptedPlanFragments.map((fragment) => [fragment.beatId, fragment])
  );
  const missingFragments = args.decision.affectedBeatIds.filter(
    (beatId) => !fragmentByBeatId.has(beatId)
  );
  if (missingFragments.length > 0) {
    throw new Error(
      `Accepted affect-plan fragments are missing for modifiable beats: ${missingFragments.join(", ")}.`
    );
  }
  const affectedBeatIds = new Set(args.decision.affectedBeatIds);
  if (
    args.locks.unaffectedBeats.some((beat) => affectedBeatIds.has(beat.beatId))
  ) {
    throw new Error(
      "Affect repair locks cannot classify an affected beat as unaffected."
    );
  }
  if (
    args.locks.wordBudget.min > args.locks.wordBudget.max ||
    args.locks.durationBudget.minSeconds > args.locks.durationBudget.maxSeconds
  ) {
    throw new Error("Affect repair word and duration budgets must be ordered.");
  }
  const paragraphSpans = [
    ...new Map(
      findings
        .flatMap((finding) => finding.paragraphSpans)
        .map((span) => [`${span.start}:${span.end}`, span])
    ).values(),
  ];
  const protectedFacts = [
    ...new Map(
      [...args.locks.immutableFacts, ...args.decision.protectedFacts].map(
        (fact) => [fact.id, fact]
      )
    ).values(),
  ];
  const fingerprintPayload = {
    promptVersion: STORY_AFFECT_REPAIR_PROMPT_VERSION,
    routingVersion: STORY_AFFECT_REPAIR_ROUTING_VERSION,
    routingFingerprint: args.decision.routingFingerprint,
    issueIds: args.decision.issueIds,
    issueCodes: args.decision.issueCodes,
    repairScope: args.decision.scope,
    affectedBeatIds: args.decision.affectedBeatIds,
    paragraphSpans,
    protectedFacts,
    acceptedPlanFragments: args.decision.affectedBeatIds.map((beatId) =>
      fragmentByBeatId.get(beatId)
    ),
    locks: args.locks,
  };
  const promptFingerprint = hashText(stableSerialize(fingerprintPayload));
  const text = [
    "Targeted affect repair is authorized for exactly one bounded attempt.",
    `Routing version: ${STORY_AFFECT_REPAIR_ROUTING_VERSION}`,
    `Repair prompt version: ${STORY_AFFECT_REPAIR_PROMPT_VERSION}`,
    `Issue IDs: ${args.decision.issueIds.join(", ")}`,
    `Issue codes: ${args.decision.issueCodes.join(", ")}`,
    `Repair scope: ${args.decision.scope}`,
    `Modifiable beat IDs only: ${args.decision.affectedBeatIds.join(", ")}`,
    `Evidence paragraphs: ${paragraphSpans
      .map((span) =>
        span.start === span.end
          ? `P${span.start}`
          : `P${span.start}-P${span.end}`
      )
      .join(", ")}`,
    "Accepted affect-plan fragments:",
    ...args.decision.affectedBeatIds.map((beatId) => {
      const fragment = fragmentByBeatId.get(beatId);
      return `- ${beatId}: ${fragment?.instruction ?? ""}`;
    }),
    "Protected facts (preserve exactly in meaning):",
    ...protectedFacts.map((fact) => `- ${fact.id}: ${fact.statement}`),
    `Accepted final line (preserve byte-for-byte and keep last): ${args.locks.acceptedFinalLine}`,
    `Authoritative rename-map hash: ${args.locks.renameMapHash}`,
    `Locked unaffected beat IDs and hashes: ${args.locks.unaffectedBeats
      .map((beat) => `${beat.beatId}:${beat.contentHash}`)
      .join(", ")}`,
    `Locked ${args.locks.selectedProjection.kind} projection hash: ${args.locks.selectedProjection.projectionHash}`,
    `Locked selected projection IDs: ${args.locks.selectedProjection.selectedIds.join(", ")}`,
    `Locked parent hashes: ${Object.entries(args.locks.parentHashes)
      .map(([key, value]) => `${key}:${value}`)
      .join(", ")}`,
    `Word budget: ${args.locks.wordBudget.min}-${args.locks.wordBudget.max}`,
    `Duration budget: ${args.locks.durationBudget.minSeconds}-${args.locks.durationBudget.maxSeconds} seconds`,
    "Return the complete applicable response schema with narration-only story output.",
    "Do not modify unaffected beats, source facts, story identity, chronology, names, accepted ending, selected projection, or budgets.",
    "After repair, the complete original deterministic, fidelity, lineage, projection, duration, and narration-only contract will be revalidated.",
  ].join("\n");
  return {
    promptVersion: STORY_AFFECT_REPAIR_PROMPT_VERSION,
    routingVersion: STORY_AFFECT_REPAIR_ROUTING_VERSION,
    promptFingerprint,
    routingFingerprint: args.decision.routingFingerprint,
    issueIds: args.decision.issueIds,
    issueCodes: args.decision.issueCodes,
    repairScope: args.decision.scope,
    affectedBeatIds: args.decision.affectedBeatIds,
    paragraphSpans,
    protectedFacts,
    locks: args.locks,
    text,
  };
}

export function validateTargetedAffectRepairResult(args: {
  readonly candidateNarration: string;
  readonly instructions: StoryTargetedAffectRepairInstructions;
  readonly observedLocks: StoryAffectRepairLocks;
  readonly applicableContractIssues: readonly string[];
}): readonly string[] {
  const issues = [...args.applicableContractIssues];
  if (
    !hasExactImmutableFinalLine(
      args.candidateNarration,
      args.instructions.locks.acceptedFinalLine
    )
  ) {
    issues.push("Accepted final line changed during targeted affect repair.");
  }
  const expectedLocks = args.instructions.locks;
  const observedLocks = args.observedLocks;
  const lockComparisons: ReadonlyArray<readonly [string, unknown, unknown]> = [
    ["parent hashes", expectedLocks.parentHashes, observedLocks.parentHashes],
    [
      "immutable facts",
      expectedLocks.immutableFacts,
      observedLocks.immutableFacts,
    ],
    ["rename map", expectedLocks.renameMapHash, observedLocks.renameMapHash],
    [
      "unaffected beats",
      expectedLocks.unaffectedBeats,
      observedLocks.unaffectedBeats,
    ],
    [
      "selected projection",
      expectedLocks.selectedProjection,
      observedLocks.selectedProjection,
    ],
    ["word budget", expectedLocks.wordBudget, observedLocks.wordBudget],
    [
      "duration budget",
      expectedLocks.durationBudget,
      observedLocks.durationBudget,
    ],
    [
      "narration-only ownership",
      expectedLocks.narrationOnly,
      observedLocks.narrationOnly,
    ],
  ];
  for (const [label, expected, observed] of lockComparisons) {
    if (stableSerialize(expected) !== stableSerialize(observed)) {
      issues.push(`Locked ${label} changed during targeted affect repair.`);
    }
  }
  return [...new Set(issues)];
}

export function buildStoryAffectRepairHistoryEntry(args: {
  readonly attemptNumber: number;
  readonly instructions: StoryTargetedAffectRepairInstructions;
  readonly outcome: StoryAffectRepairHistoryEntry["outcome"];
  readonly validationIssues: readonly string[];
}): StoryAffectRepairHistoryEntry {
  return {
    schemaVersion: STORY_AFFECT_REPAIR_HISTORY_SCHEMA_VERSION,
    attemptNumber: args.attemptNumber,
    issueIds: args.instructions.issueIds,
    issueCodes: args.instructions.issueCodes,
    repairScope: args.instructions.repairScope,
    affectedBeatIds: args.instructions.affectedBeatIds,
    parentHashes: args.instructions.locks.parentHashes,
    routingFingerprint: args.instructions.routingFingerprint,
    promptFingerprint: args.instructions.promptFingerprint,
    outcome: args.outcome,
    validationIssues: args.validationIssues,
  };
}

export function dedupeGeneratedMetadata(text: string): string {
  return text.replace(
    /(?:<!--\s*mediaforge:generated-full-story\s*-->\s*){2,}/gu,
    "<!-- mediaforge:generated-full-story -->\n"
  );
}

export function repairGermanServiceCompounds(text: string): string {
  return text
    .replace(/\bServic Eingang\b/gu, "Serviceingang")
    .replace(/\bServic eflur\b/gu, "Serviceflur")
    .replace(/\bFunkgerät\b/gu, "internes Telefon");
}

export function repairShortBodyCanonicalNames(
  text: string,
  characterRenameMap: CharacterRenameMap
): string {
  return applyCharacterRenameMapToText(text, characterRenameMap);
}

export function repairFinalSting(
  text: string,
  facts: CanonicalStoryFacts
): string {
  if (!facts.requiredFinalLine) {
    return text;
  }
  const sentences = splitIntoSentences(normalizeWhitespace(text));
  if (sentences.length === 0) {
    return facts.requiredFinalLine;
  }
  sentences[sentences.length - 1] = facts.requiredFinalLine;
  return sentences.join(" ");
}

export function preserveImmutableFinalLine(
  text: string,
  immutableFinalLine: string
): string {
  const normalizedLine = immutableFinalLine.trim();
  if (!normalizedLine) return text;
  const exactIndex = text.indexOf(normalizedLine);
  if (exactIndex >= 0)
    return text.slice(0, exactIndex + normalizedLine.length).trimEnd();
  const sentences = splitIntoSentences(normalizeWhitespace(text));
  if (sentences.length === 0) return normalizedLine;
  sentences[sentences.length - 1] = normalizedLine;
  return sentences.join(" ");
}

export function hasExactImmutableFinalLine(
  text: string,
  immutableFinalLine: string
): boolean {
  return (
    text.endsWith(immutableFinalLine) &&
    text.slice(0, -immutableFinalLine.length).indexOf(immutableFinalLine) < 0
  );
}
