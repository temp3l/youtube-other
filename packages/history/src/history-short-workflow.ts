import { createHash } from "node:crypto";

import { normalizeWhitespace, resolveProductionPolicy } from "@mediaforge/shared";

export const HISTORY_SHORT_WORKFLOW_VERSION =
  "history-short-workflow.v1" as const;
export const HISTORY_SHORT_TARGET_DURATION_SECONDS = 60 as const;
export const HISTORY_SHORT_TARGET_WORD_BUDGET = 150 as const;

export interface HistoryShortNarration {
  readonly schemaVersion: typeof HISTORY_SHORT_WORKFLOW_VERSION;
  readonly sourceMode: "dedicated-source" | "derived-from-trusted-long";
  readonly targetDurationSeconds: typeof HISTORY_SHORT_TARGET_DURATION_SECONDS;
  readonly targetWordBudget: typeof HISTORY_SHORT_TARGET_WORD_BUDGET;
  readonly narration: string;
  readonly narrationHash: string;
}

export interface HistoryShortScene {
  readonly id: string;
  readonly phase: "hook" | "escalation" | "payoff";
  readonly narration: string;
  readonly aspectRatio: "9:16";
  readonly safeSubjectRegion: "center-upper" | "center" | "center-lower";
  readonly safeTextRegion: "upper" | "lower";
  readonly imagePrompt: string;
}

export interface HistoryShortVisualPlan {
  readonly schemaVersion: typeof HISTORY_SHORT_WORKFLOW_VERSION;
  readonly variant: "short";
  readonly aspectRatio: "9:16";
  readonly sceneCount: number;
  readonly pacing: "hook-payoff-vertical";
  readonly scenes: readonly HistoryShortScene[];
  readonly planHash: string;
}

export interface HistoryShortTtsCalibrationPlan {
  readonly schemaVersion: typeof HISTORY_SHORT_WORKFLOW_VERSION;
  readonly narrationHash: string;
  readonly mode: "adaptive-duration";
  readonly policyVersion: string;
  readonly targetDurationSeconds: number;
  readonly preferredDurationRangeSeconds: readonly [number, number];
  readonly durationAcceptanceToleranceSeconds: number;
  readonly speedRange: readonly [number, number];
  readonly maxCalibrationAttempts: number;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function narrationSentences(value: string): readonly string[] {
  return value
    .replace(/^---[\s\S]*?---\s*/u, "")
    .split("\n")
    .filter((line) => !/^\s*#{1,6}\s+/u.test(line))
    .join(" ")
    .replace(/[*_`]/gu, "")
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 0);
}

function wordCount(value: string): number {
  return value.split(/\s+/u).filter(Boolean).length;
}

function assertSpokenNarration(value: string): string {
  const narration = normalizeWhitespace(value);
  if (!narration) throw new Error("History Short narration cannot be empty.");
  if (/^\s*#{1,6}\s+/mu.test(value)) {
    throw new Error("History Short narration cannot contain presentation headings.");
  }
  return narration;
}

/**
 * A Short derivation is an explicit variant operation. It only selects and
 * concatenates trusted sentences; it never invents or paraphrases facts.
 */
function deriveFromTrustedNarration(trustedNarration: string): string {
  const sentences = narrationSentences(trustedNarration);
  if (sentences.length < 3) {
    throw new Error(
      "History Short derivation requires at least three trusted narration sentences.",
    );
  }
  const selected: string[] = [];
  const indexes = [...new Set([
    0,
    Math.floor((sentences.length - 1) / 3),
    Math.floor(((sentences.length - 1) * 2) / 3),
    sentences.length - 1,
  ])];
  for (const index of indexes) {
    const sentence = sentences[index]!;
    if (
      selected.length > 0 &&
      wordCount(`${selected.join(" ")} ${sentence}`) >
        HISTORY_SHORT_TARGET_WORD_BUDGET
    ) {
      continue;
    }
    selected.push(sentence);
  }
  if (selected.length < 3) {
    throw new Error(
      "History Short derivation could not meet the spoken pacing budget from trusted narration.",
    );
  }
  return selected.join(" ");
}

export function resolveHistoryShortNarration(input: {
  readonly trustedLongNarration: string;
  readonly dedicatedShortNarration?: string | null;
}): HistoryShortNarration {
  const dedicated = input.dedicatedShortNarration?.trim();
  const narration = assertSpokenNarration(
    dedicated ?? deriveFromTrustedNarration(input.trustedLongNarration),
  );
  if (wordCount(narration) > HISTORY_SHORT_TARGET_WORD_BUDGET) {
    throw new Error(
      `History Short narration exceeds its ${HISTORY_SHORT_TARGET_WORD_BUDGET}-word budget.`,
    );
  }
  return {
    schemaVersion: HISTORY_SHORT_WORKFLOW_VERSION,
    sourceMode: dedicated ? "dedicated-source" : "derived-from-trusted-long",
    targetDurationSeconds: HISTORY_SHORT_TARGET_DURATION_SECONDS,
    targetWordBudget: HISTORY_SHORT_TARGET_WORD_BUDGET,
    narration,
    narrationHash: hash(narration),
  };
}

export function planHistoryShortVisuals(input: {
  readonly narration: HistoryShortNarration;
  readonly sceneCount?: number;
}): HistoryShortVisualPlan {
  const sentences = narrationSentences(input.narration.narration);
  const sceneCount = Math.min(input.sceneCount ?? 4, sentences.length);
  if (sceneCount < 3) {
    throw new Error("History Short planning requires hook, escalation, and payoff scenes.");
  }
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const start = Math.floor((index * sentences.length) / sceneCount);
    const end = Math.floor(((index + 1) * sentences.length) / sceneCount);
    const narration = sentences.slice(start, Math.max(start + 1, end)).join(" ");
    const phase: HistoryShortScene["phase"] =
      index === 0 ? "hook" : index === sceneCount - 1 ? "payoff" : "escalation";
    const safeSubjectRegion: HistoryShortScene["safeSubjectRegion"] =
      index % 3 === 0 ? "center-upper" : index % 3 === 1 ? "center" : "center-lower";
    return {
      id: `short-scene-${String(index + 1).padStart(3, "0")}`,
      phase,
      narration,
      aspectRatio: "9:16" as const,
      safeSubjectRegion,
      safeTextRegion: index % 2 === 0 ? ("lower" as const) : ("upper" as const),
      imagePrompt: `Vertical 9:16 evidence-aware historical documentary frame. ${narration} Keep the primary subject in the ${safeSubjectRegion.replace("-", " ")} safe region and reserve the ${index % 2 === 0 ? "lower" : "upper"} region for safe text; no invented readable text, no modern objects, and no anachronistic material culture.`,
    };
  });
  const unsealed = {
    schemaVersion: HISTORY_SHORT_WORKFLOW_VERSION,
    variant: "short" as const,
    aspectRatio: "9:16" as const,
    sceneCount,
    pacing: "hook-payoff-vertical" as const,
    scenes,
  };
  return { ...unsealed, planHash: hash(unsealed) };
}

/** This plan is persisted before provider dispatch and is consumed by the
 * shared adaptive pacing engine when audio generation is authorized. */
export function createHistoryShortTtsCalibrationPlan(
  narration: HistoryShortNarration,
): HistoryShortTtsCalibrationPlan {
  const pacing = resolveProductionPolicy("history", "short").pacing;
  if (pacing.mode !== "adaptive-duration") {
    throw new Error("History Short requires the adaptive-duration pacing policy.");
  }
  return {
    schemaVersion: HISTORY_SHORT_WORKFLOW_VERSION,
    narrationHash: narration.narrationHash,
    mode: pacing.mode,
    policyVersion: pacing.policyVersion,
    targetDurationSeconds: pacing.targetDurationSeconds,
    preferredDurationRangeSeconds: pacing.preferredDurationRangeSeconds,
    durationAcceptanceToleranceSeconds: pacing.durationAcceptanceToleranceSeconds,
    speedRange: [pacing.minimumSpeed, pacing.maximumSpeed],
    maxCalibrationAttempts: pacing.maxCalibrationAttempts,
  };
}
