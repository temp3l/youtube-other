import { z } from "zod";

export const adaptationReasonCodeSchema = z.enum([
  "SOURCE_NOT_APPROVED",
  "SOURCE_HASH_MISMATCH",
  "SOURCE_POLICY_DENIED",
  "IDENTITY_MISMATCH",
  "BEAT_SOURCE_MISSING",
  "EVIDENCE_SPAN_INVALID",
  "LINE_EVIDENCE_MISSING",
  "LINE_NOT_DERIVED_FROM_SOURCE",
  "FIRST_PERSON_EVIDENCE_MISSING",
  "INVENTED_EXPERIENCE",
  "INVENTED_OPINION",
  "INVENTED_MEMORY",
  "UNSUPPORTED_CLAIM",
  "UNSUPPORTED_ADVICE",
  "BRAND_WORDPLAY_INVENTED",
  "QUOTE_NOT_APPROVED",
  "CLAIM_UNCERTAIN",
  "PREMIUM_LEAKAGE",
  "CANONICAL_SCRIPT_APPROVAL_REQUIRED",
]);
export type AdaptationReasonCode = z.infer<typeof adaptationReasonCodeSchema>;

const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{2,127}$/u);

/** A byte-addressed reference into immutable, hash-bound canonical source bytes. */
export const sourceEvidenceSpanSchema = z
  .strictObject({
    spanId: identifier,
    sourceId: identifier,
    byteStart: z.number().int().min(0),
    byteEnd: z.number().int().positive(),
  })
  .refine((span) => span.byteEnd > span.byteStart, {
    message: "Evidence span end must follow its start.",
  });
export type SourceEvidenceSpan = z.infer<typeof sourceEvidenceSpanSchema>;

export const adaptationLineSchema = z.strictObject({
  lineId: identifier,
  beatId: identifier,
  text: z.string().trim().min(1),
  evidenceSpanIds: z.array(identifier).length(1),
  kind: z.enum(["adaptation", "quote", "first-person", "claim"]),
  claimId: identifier.optional(),
});
export type AdaptationLine = z.infer<typeof adaptationLineSchema>;

export const adaptationCandidateSchema = z
  .strictObject({
    revision: z.string().trim().min(1).max(160),
    lines: z.array(adaptationLineSchema).min(1),
    unsupportedInferenceIds: z.array(identifier).default([]),
    invented: z
      .array(
        z.enum([
          "experience",
          "opinion",
          "memory",
          "claim",
          "advice",
          "brand-wordplay",
        ])
      )
      .default([]),
  })
  .superRefine((candidate, ctx) => {
    if (
      new Set(candidate.lines.map((line) => line.lineId)).size !==
      candidate.lines.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Line IDs must be unique.",
      });
  });
export type AdaptationCandidate = z.infer<typeof adaptationCandidateSchema>;
