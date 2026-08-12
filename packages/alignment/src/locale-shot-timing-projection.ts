import { z } from "zod";

import {
  localeShotTimingEntrySchema,
  type LocaleShotTimingEntry,
} from "@mediaforge/domain";

export const LOCALE_SHOT_TIMING_PROJECTION_SCHEMA_VERSION =
  "mediaforge.alignment.locale-shot-timing.v1" as const;

export const localeShotTimingProjectionSchema = z
  .object({
    schemaVersion: z.literal(LOCALE_SHOT_TIMING_PROJECTION_SCHEMA_VERSION),
    measuredDurationMs: z.number().int().positive(),
    shotTiming: z.array(localeShotTimingEntrySchema).min(1),
  })
  .strict();
export type LocaleShotTimingProjection = z.infer<
  typeof localeShotTimingProjectionSchema
>;

export type ValidateLocaleShotTimingInput = {
  readonly semanticShotOrder: readonly {
    readonly shotSemanticId: string;
    readonly sceneSemanticId: string;
    readonly sourcePlateSemanticId: string;
  }[];
  readonly shotTiming: readonly LocaleShotTimingEntry[];
  readonly measuredDurationMs: number;
};

export type LocaleShotTimingValidationIssue = {
  readonly code:
    | "semantic_order_mismatch"
    | "timeline_gap"
    | "timeline_overlap"
    | "duration_mismatch";
  readonly message: string;
  readonly shotSemanticId?: string;
};

export function validateLocaleShotTimingProjection(
  input: ValidateLocaleShotTimingInput,
): readonly LocaleShotTimingValidationIssue[] {
  const issues: LocaleShotTimingValidationIssue[] = [];
  const expectedOrder = input.semanticShotOrder.map((shot) => shot.shotSemanticId);
  const actualOrder = input.shotTiming.map((entry) => entry.shotSemanticId);

  if (expectedOrder.join("|") !== actualOrder.join("|")) {
    issues.push({
      code: "semantic_order_mismatch",
      message: "Locale shot timing does not preserve semantic shot order.",
    });
  }

  const sorted = [...input.shotTiming].sort((left, right) => left.startMs - right.startMs);
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    const previous = sorted[index - 1];
    if (previous && current.startMs < previous.endMs) {
      issues.push({
        code: "timeline_overlap",
        message: `Shot ${current.shotSemanticId} overlaps ${previous.shotSemanticId}.`,
        shotSemanticId: current.shotSemanticId,
      });
    }
    if (previous && current.startMs > previous.endMs) {
      issues.push({
        code: "timeline_gap",
        message: `Gap between ${previous.shotSemanticId} and ${current.shotSemanticId}.`,
        shotSemanticId: current.shotSemanticId,
      });
    }
  }

  const last = sorted.at(-1);
  if (last && last.endMs !== input.measuredDurationMs) {
    issues.push({
      code: "duration_mismatch",
      message: `Final shot end (${last.endMs}ms) does not match measured duration (${input.measuredDurationMs}ms).`,
      shotSemanticId: last.shotSemanticId,
    });
  }

  return issues;
}

export function buildLocaleShotTimingProjection(input: {
  readonly semanticShotOrder: readonly {
    readonly shotSemanticId: string;
    readonly sceneSemanticId: string;
    readonly sourcePlateSemanticId: string;
    readonly order: number;
  }[];
  readonly projectedTiming: readonly {
    readonly shotSemanticId: string;
    readonly startMs: number;
    readonly endMs: number;
  }[];
}): LocaleShotTimingProjection {
  const timingByShot = new Map(
    input.projectedTiming.map((entry) => [entry.shotSemanticId, entry]),
  );
  const shotTiming = input.semanticShotOrder.map((shot) => {
    const timing = timingByShot.get(shot.shotSemanticId);
    if (!timing) {
      throw new Error(`Missing projected timing for ${shot.shotSemanticId}`);
    }
    const durationMs = timing.endMs - timing.startMs;
    return localeShotTimingEntrySchema.parse({
      shotSemanticId: shot.shotSemanticId,
      sceneSemanticId: shot.sceneSemanticId,
      sourcePlateSemanticId: shot.sourcePlateSemanticId,
      order: shot.order,
      startMs: timing.startMs,
      endMs: timing.endMs,
      durationMs,
    });
  });
  const measuredDurationMs = shotTiming.at(-1)?.endMs;
  if (!measuredDurationMs) {
    throw new Error("Locale shot timing projection is empty.");
  }
  return localeShotTimingProjectionSchema.parse({
    schemaVersion: LOCALE_SHOT_TIMING_PROJECTION_SCHEMA_VERSION,
    measuredDurationMs,
    shotTiming,
  });
}
