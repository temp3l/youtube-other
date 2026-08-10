import { z } from "zod";
import { hashCanonical } from "../canonical-json.js";

export const VERONICA_TIMING_RECONCILIATION_VERSION = "veronica-narration-timing-reconciliation.v1" as const;
export const veronicaTimingSceneSchema = z.strictObject({ sceneId: z.string().min(1), plannedDurationSeconds: z.number().positive(), minimumDwellSeconds: z.number().positive(), startSeconds: z.number().nonnegative(), endSeconds: z.number().positive() });
export const veronicaTimingReconciliationSchema = z.strictObject({ schemaVersion: z.literal(VERONICA_TIMING_RECONCILIATION_VERSION), locale: z.string().min(2), variant: z.enum(["short", "full"]), timingSource: z.enum(["measured-chunks", "measured-narration-audio"]), plannedDurationSeconds: z.number().positive(), measuredNarrationDurationSeconds: z.number().positive(), reconciledDurationSeconds: z.number().positive(), speedNormalizationApplied: z.boolean(), scenes: z.array(veronicaTimingSceneSchema).min(1), contentHash: z.string().regex(/^[a-f0-9]{64}$/u) });
export type VeronicaTimingReconciliation = z.infer<typeof veronicaTimingReconciliationSchema>;
export interface VeronicaTimingInput { readonly locale: string; readonly variant: "short" | "full"; readonly plannedScenes: readonly { readonly sceneId: string; readonly plannedDurationSeconds: number; readonly minimumDwellSeconds: number }[]; readonly measuredNarrationDurationSeconds: number; readonly timingSource: "measured-chunks" | "measured-narration-audio"; }

/** Reflows only after TTS.  The final semantic beat retains its configured minimum dwell. */
export function reconcileVeronicaNarrationTiming(input: VeronicaTimingInput): VeronicaTimingReconciliation {
  if (!Number.isFinite(input.measuredNarrationDurationSeconds) || input.measuredNarrationDurationSeconds <= 0) throw new Error("Measured narration duration must be positive.");
  if (input.plannedScenes.length === 0) throw new Error("Narration timing requires at least one scene.");
  const minimumTotal = input.plannedScenes.reduce((sum, scene) => sum + scene.minimumDwellSeconds, 0);
  if (minimumTotal > input.measuredNarrationDurationSeconds) throw new Error("Measured narration cannot preserve the configured semantic minimum dwell; manual timing review is required.");
  const plannedTotal = input.plannedScenes.reduce((sum, scene) => sum + scene.plannedDurationSeconds, 0);
  const distributable = input.measuredNarrationDurationSeconds - minimumTotal;
  const plannedExcess = input.plannedScenes.reduce((sum, scene) => sum + Math.max(0, scene.plannedDurationSeconds - scene.minimumDwellSeconds), 0);
  let cursor = 0;
  const scenes = input.plannedScenes.map((scene, index) => { const duration = index === input.plannedScenes.length - 1 ? input.measuredNarrationDurationSeconds - cursor : scene.minimumDwellSeconds + (plannedExcess === 0 ? distributable / input.plannedScenes.length : distributable * Math.max(0, scene.plannedDurationSeconds - scene.minimumDwellSeconds) / plannedExcess); const startSeconds = cursor; const endSeconds = startSeconds + duration; cursor = endSeconds; return { sceneId: scene.sceneId, plannedDurationSeconds: scene.plannedDurationSeconds, minimumDwellSeconds: scene.minimumDwellSeconds, startSeconds, endSeconds }; });
  const payload = { schemaVersion: VERONICA_TIMING_RECONCILIATION_VERSION, locale: input.locale, variant: input.variant, timingSource: input.timingSource, plannedDurationSeconds: plannedTotal, measuredNarrationDurationSeconds: input.measuredNarrationDurationSeconds, reconciledDurationSeconds: input.measuredNarrationDurationSeconds, speedNormalizationApplied: false, scenes, contentHash: "0".repeat(64) };
  return veronicaTimingReconciliationSchema.parse({ ...payload, contentHash: hashCanonical(payload) });
}
