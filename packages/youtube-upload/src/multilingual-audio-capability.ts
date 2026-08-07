import { z } from "zod";

export const MULTILINGUAL_AUDIO_CAPABILITY_SCHEMA_VERSION =
  "youtube.multilingual-audio-capability.v1" as const;

export const multilingualAudioCapabilityOutcomeSchema = z.enum([
  "supported",
  "unsupported",
  "unknown",
]);

export const multilingualAudioPreferredModelSchema = z.enum([
  "single-video-with-reviewed-audio-tracks",
  "separate-public-videos",
]);

export const multilingualAudioCapabilityReportSchema = z
  .object({
    schemaVersion: z.literal(MULTILINGUAL_AUDIO_CAPABILITY_SCHEMA_VERSION),
    preferredModel: multilingualAudioPreferredModelSchema,
    alternateAudioTracks: multilingualAudioCapabilityOutcomeSchema,
    separatePublicVideos: multilingualAudioCapabilityOutcomeSchema,
    notes: z.array(z.string().min(1)),
    evaluatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type MultilingualAudioCapabilityReport = z.infer<
  typeof multilingualAudioCapabilityReportSchema
>;

export interface AssessMultilingualAudioCapabilityInput {
  readonly preferredModel: z.infer<typeof multilingualAudioPreferredModelSchema>;
  readonly channelReportedAlternateAudio?: boolean | null;
  readonly apiEvidenceAvailable?: boolean;
}

export function assessMultilingualAudioCapability(
  input: AssessMultilingualAudioCapabilityInput,
): MultilingualAudioCapabilityReport {
  const notes: string[] = [];
  let alternateAudioTracks: z.infer<typeof multilingualAudioCapabilityOutcomeSchema> =
    "unknown";
  let separatePublicVideos: z.infer<typeof multilingualAudioCapabilityOutcomeSchema> =
    "unsupported";

  if (input.apiEvidenceAvailable === true) {
    alternateAudioTracks =
      input.channelReportedAlternateAudio === true ? "supported" : "unsupported";
    notes.push(
      "Alternate-audio capability was evaluated from explicit provider evidence.",
    );
  } else {
    notes.push(
      "Alternate-audio capability is unknown without explicit provider evidence.",
    );
    notes.push(
      "This report does not claim live YouTube alternate-audio API support.",
    );
  }

  if (input.preferredModel === "single-video-with-reviewed-audio-tracks") {
    notes.push(
      "Strategic profile prefers one public video with reviewed alternate audio tracks.",
    );
    separatePublicVideos = "unsupported";
    notes.push(
      "Silent fallback to separate public videos is forbidden for strategic-reinvention.",
    );
  } else {
    separatePublicVideos = "unknown";
    notes.push(
      "Separate-public-video publishing requires an explicit business case and evidence.",
    );
  }

  return multilingualAudioCapabilityReportSchema.parse({
    schemaVersion: MULTILINGUAL_AUDIO_CAPABILITY_SCHEMA_VERSION,
    preferredModel: input.preferredModel,
    alternateAudioTracks,
    separatePublicVideos,
    notes,
    evaluatedAt: new Date().toISOString(),
  });
}

export function strategicPublicationBlockedByCapability(
  report: MultilingualAudioCapabilityReport,
): readonly string[] {
  const blockers: string[] = [];
  if (report.preferredModel === "single-video-with-reviewed-audio-tracks") {
    if (report.alternateAudioTracks === "unsupported") {
      blockers.push("STRATEGIC_ALTERNATE_AUDIO_UNSUPPORTED");
    }
    if (report.alternateAudioTracks === "unknown") {
      blockers.push("STRATEGIC_ALTERNATE_AUDIO_CAPABILITY_UNKNOWN");
    }
  }
  if (report.separatePublicVideos === "supported") {
    blockers.push("STRATEGIC_SEPARATE_PUBLIC_VIDEO_FALLBACK_FORBIDDEN");
  }
  return blockers;
}
