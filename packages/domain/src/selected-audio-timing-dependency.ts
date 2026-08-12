import { createHash } from "node:crypto";
import { z } from "zod";

import { signalUiBcp47LocaleSchema } from "./signal-ui-contracts.js";

const sha256Pattern = /^[a-f0-9]{64}$/u;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function hashCanonicalDependency(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export const SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION =
  "mediaforge.selected-audio-timing-dependency.v1" as const;

export const selectedAudioTimingDependencySchema = z
  .object({
    schemaVersion: z.literal(SELECTED_AUDIO_TIMING_DEPENDENCY_SCHEMA_VERSION),
    locale: signalUiBcp47LocaleSchema,
    alignmentRevisionId: z.string().min(1).max(200),
    cacheKey: z.string().regex(sha256Pattern),
    authoritySource: z.enum(["selected_audio", "lexical_estimate"]),
    totalDurationMs: z.number().int().positive(),
  })
  .strict();
export type SelectedAudioTimingDependency = z.infer<
  typeof selectedAudioTimingDependencySchema
>;

export function fingerprintSelectedAudioTimingDependency(
  dependency: SelectedAudioTimingDependency,
): string {
  return hashCanonicalDependency(
    selectedAudioTimingDependencySchema.parse(dependency),
  );
}
