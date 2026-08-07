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
