import { z } from "zod";
import { timingManifestSchema } from "@mediaforge/math-education";

export const mathCompositionSchema = z.strictObject({
  id: z.string(),
  width: z.literal(1920),
  height: z.literal(1080),
  fps: z.literal(30),
  durationInFrames: z.number().int().min(5400).max(9000),
  timing: timingManifestSchema,
  safeArea: z.strictObject({
    left: z.literal(96),
    right: z.literal(96),
    top: z.literal(54),
    bottom: z.literal(54),
  }),
  deterministicSeed: z.string(),
});
export function createMathComposition(
  id: string,
  timing: z.infer<typeof timingManifestSchema>
) {
  return mathCompositionSchema.parse({
    id,
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: timing.durationSeconds * 30,
    timing,
    safeArea: { left: 96, right: 96, top: 54, bottom: 54 },
    deterministicSeed: id,
  });
}
