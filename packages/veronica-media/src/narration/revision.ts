import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  veronicaNarrationAnchorSchema,
  veronicaNarrationRevisionSchema,
  type VeronicaMediaPlan,
} from "../contracts/media-plan.v1.js";

function sentenceFingerprint(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}

function splitSentences(script: string): string[] {
  return script
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function estimateDurationSeconds(script: string): number {
  const words = script.split(/\s+/u).filter(Boolean).length;
  return Math.max(1, words / 2.5);
}

export interface BuildNarrationRevisionInput {
  readonly revisionId: string;
  readonly originalScript: string;
  readonly revisedScript?: string;
  readonly allowedVarianceSeconds?: number;
}

export interface NarrationRevisionDiff {
  readonly originalSentenceIndex: number;
  readonly revisedSentenceIndex: number | null;
  readonly changeKind: "unchanged" | "clarified" | "expanded" | "condensed" | "removed" | "added";
}

/** Immutable review record; frozen revisions cannot be silently replaced. */
export interface FrozenNarrationRevision {
  readonly revision: Readonly<Omit<ReturnType<typeof buildNarrationRevision>, "mapping">> & {
    readonly mapping: readonly Readonly<ReturnType<typeof buildNarrationRevision>["mapping"][number]>[];
  };
  readonly diffs: readonly NarrationRevisionDiff[];
  readonly frozenAt: string;
  readonly frozenBy: string;
}

export function diffNarrationRevisions(input: {
  readonly originalScript: string;
  readonly revisedScript: string;
}): readonly NarrationRevisionDiff[] {
  const original = splitSentences(input.originalScript);
  const revised = splitSentences(input.revisedScript);
  const shared = Math.max(original.length, revised.length);
  return Array.from({ length: shared }, (_, index) => {
    const before = original[index];
    const after = revised[index];
    if (before === undefined) return { originalSentenceIndex: index, revisedSentenceIndex: index, changeKind: "added" };
    if (after === undefined) return { originalSentenceIndex: index, revisedSentenceIndex: null, changeKind: "removed" };
    if (before === after) return { originalSentenceIndex: index, revisedSentenceIndex: index, changeKind: "unchanged" };
    return {
      originalSentenceIndex: index,
      revisedSentenceIndex: index,
      changeKind: after.length > before.length ? "expanded" : after.length < before.length ? "condensed" : "clarified",
    };
  });
}

export function freezeNarrationRevision(input: {
  readonly revision: ReturnType<typeof buildNarrationRevision>;
  readonly frozenAt: string;
  readonly frozenBy: string;
}): FrozenNarrationRevision {
  if (!Number.isFinite(Date.parse(input.frozenAt)) || !input.frozenBy.trim()) {
    throw new Error("Narration revision freeze requires a valid timestamp and actor.");
  }
  const revision = Object.freeze({
    ...input.revision,
    mapping: Object.freeze(
      input.revision.mapping.map((entry) => Object.freeze({ ...entry })),
    ),
  });
  return Object.freeze({
    revision,
    diffs: Object.freeze(
      diffNarrationRevisions(input.revision).map((entry) =>
        Object.freeze({ ...entry }),
      ),
    ),
    frozenAt: input.frozenAt,
    frozenBy: input.frozenBy.trim(),
  });
}

export function buildNarrationRevision(input: BuildNarrationRevisionInput) {
  const originalScript = input.originalScript.trim();
  const revisedScript = (input.revisedScript ?? originalScript).trim();
  const originalSentences = splitSentences(originalScript);
  const revisedSentences = splitSentences(revisedScript);
  const mapping = originalSentences.map((sentence, index) => {
    const revisedIndex = Math.min(index, revisedSentences.length - 1);
    const revisedSentence = revisedSentences[revisedIndex] ?? sentence;
    const changeKind =
      sentence === revisedSentence
        ? ("unchanged" as const)
        : revisedSentence.length > sentence.length
          ? ("expanded" as const)
          : revisedSentence.length < sentence.length
            ? ("condensed" as const)
            : ("clarified" as const);
    return {
      originalSentenceIndex: index,
      revisedSentenceIndex: revisedIndex,
      changeKind,
    };
  });
  const originalEstimatedDurationSeconds = estimateDurationSeconds(originalScript);
  const revisedEstimatedDurationSeconds = estimateDurationSeconds(revisedScript);
  const allowedVarianceSeconds = input.allowedVarianceSeconds ?? 15;
  const delta = Math.abs(
    revisedEstimatedDurationSeconds - originalEstimatedDurationSeconds,
  );
  const durationStatus =
    delta <= allowedVarianceSeconds
      ? ("within-variance" as const)
      : revisedEstimatedDurationSeconds > originalEstimatedDurationSeconds
        ? ("over-variance" as const)
        : ("under-variance" as const);
  return veronicaNarrationRevisionSchema.parse({
    revisionId: input.revisionId,
    originalScript,
    revisedScript,
    mapping,
    originalEstimatedDurationSeconds,
    revisedEstimatedDurationSeconds,
    allowedVarianceSeconds,
    durationStatus,
  });
}

export function buildNarrationAnchors(input: {
  readonly episodeId: string;
  readonly revisedScript: string;
}): Array<z.infer<typeof veronicaNarrationAnchorSchema>> {
  const sentences = splitSentences(input.revisedScript);
  return sentences.map((sentence, index) =>
    veronicaNarrationAnchorSchema.parse({
      anchorId: `anchor-${String(index + 1).padStart(3, "0")}`,
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      sentenceIndex: index,
      exactText: sentence,
      semanticFingerprint: sentenceFingerprint(sentence),
    }),
  );
}

export function resolveAnchorTimings(input: {
  readonly anchors: VeronicaMediaPlan["narrationAnchors"];
  readonly alignedSegments: readonly {
    readonly text: string;
    readonly startSeconds: number;
    readonly endSeconds: number;
  }[];
}) {
  return input.anchors.map((anchor) => {
    const segment =
      input.alignedSegments[anchor.sentenceIndex] ??
      input.alignedSegments.find((candidate) =>
        candidate.text.includes(anchor.exactText.slice(0, 24)),
      );
    if (!segment) return anchor;
    return veronicaNarrationAnchorSchema.parse({
      ...anchor,
      resolvedStartSeconds: segment.startSeconds,
      resolvedEndSeconds: segment.endSeconds,
    });
  });
}
