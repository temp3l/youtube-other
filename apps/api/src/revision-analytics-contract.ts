import { revisionAnalyticsObservationSchema } from "@mediaforge/domain";
import { z } from "zod";

export const revisionAnalyticsIngestRequestSchema = z.object({
  observation: revisionAnalyticsObservationSchema.omit({
    regenerationRationale: true,
  }),
}).strict();
export type RevisionAnalyticsIngestRequest = z.infer<typeof revisionAnalyticsIngestRequestSchema>;
