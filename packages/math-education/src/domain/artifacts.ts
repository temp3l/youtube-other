import { z } from "zod";
import { sha256Schema } from "./identity.js";

export const artifactLineageSchema = z.strictObject({
  artifactVersion: z.string().min(1),
  contentHash: sha256Schema,
  createdAt: z.string().datetime(),
  producer: z.string().min(1),
  producerVersion: z.string().min(1),
  parentHashes: z.array(sha256Schema),
});

export const mathProductionStatusSchema = z.enum([
  "READY",
  "READY_WITH_MINOR_EDITS",
  "REVISION_REQUIRED",
  "MATHEMATICAL_ERROR",
  "CURRICULUM_ERROR",
  "LOCALIZATION_ERROR",
  "TIMING_ERROR",
  "RENDER_BLOCKED",
  "PUBLISH_BLOCKED",
]);
export type MathProductionStatus = z.infer<typeof mathProductionStatusSchema>;
