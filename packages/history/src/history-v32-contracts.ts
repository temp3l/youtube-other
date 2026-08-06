import { z } from "zod";

export const HISTORY_V32_CONTRACT_VERSION = "history-contracts.v3.2.0" as const;
export const HISTORY_VISUAL_SCHEMA_V32 = "history-visual-plan.v3.2" as const;
export const HISTORY_VISUAL_PLANNER_V32 =
  "history-visual-planner.v3.2.0" as const;

export const historyHashV32Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const historyDiagnosticV32Schema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(["error", "warning"]),
    gate: z.enum(["structural", "editorial", "content", "production"]),
    message: z.string().min(1),
    remediation: z.string().min(1),
    affectedIds: z.array(z.string()),
  })
  .strict();

export type HistoryDiagnosticV32 = z.infer<
  typeof historyDiagnosticV32Schema
>;

const diagnosticCountSchema = z
  .object({ code: z.string().min(1), count: z.number().int().positive() })
  .strict();

const reviewabilityAxisSchema = z
  .object({
    state: z.enum(["reviewable", "blocked"]),
    blockerCodes: z.array(z.string()),
  })
  .strict();

const eligibilityAxisSchema = z
  .object({
    state: z.enum(["eligible", "blocked"]),
    blockerCodes: z.array(z.string()),
  })
  .strict();

export const historyApprovalSummaryV32Schema = z
  .object({
    structural: reviewabilityAxisSchema,
    editorial: reviewabilityAxisSchema,
    content: eligibilityAxisSchema,
    production: eligibilityAxisSchema,
    blockers: z.array(diagnosticCountSchema),
    warnings: z.array(diagnosticCountSchema),
  })
  .strict();

export type HistoryApprovalSummaryV32 = z.infer<
  typeof historyApprovalSummaryV32Schema
>;

export const narrationTimingSourceV32Schema = z.enum([
  "provisional-word-estimate",
  "measured-tts-audio",
]);
export type NarrationTimingSourceV32 = z.infer<
  typeof narrationTimingSourceV32Schema
>;

export const historySourceLocatorV32Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("section"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("paragraph"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("fragment"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("timestamp"), value: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("anchor"), value: z.string().min(1) }).strict(),
]);

export const historySourceRegistryEntryV32Schema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    sourceType: z.enum([
      "primary",
      "scholarly-secondary",
      "reference",
      "institutional",
      "other",
    ]),
    urlOrIdentifier: z.string().min(1),
    author: z.string().min(1).optional(),
    publisher: z.string().min(1).optional(),
    publicationDate: z.string().min(1).optional(),
    accessedAt: z.string().datetime().optional(),
    version: z.string().min(1).optional(),
    snapshotSha256: historyHashV32Schema.optional(),
  })
  .strict();

export const historyEvidencePassageV32Schema = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    locator: historySourceLocatorV32Schema,
    passageSha256: historyHashV32Schema,
    snapshotSha256: historyHashV32Schema.optional(),
  })
  .strict();

export const historyClaimSourceLinkV32Schema = z
  .object({
    id: z.string().min(1),
    claimId: z.string().min(1),
    sourceId: z.string().min(1),
    evidencePassageId: z.string().min(1),
    state: z.enum(["candidate", "verified"]),
    support: z.enum([
      "direct",
      "strong-entailment",
      "contextual",
      "contradicting",
    ]),
    verification: z
      .object({
        reviewerId: z.string().min(1),
        reviewedAt: z.string().datetime(),
      })
      .strict()
      .optional(),
    assistant: z
      .object({
        model: z.string().min(1),
        runId: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const historyClaimConcernV32Schema = z.enum([
  "factual",
  "chronological",
  "quantitative",
  "causal",
  "disputed",
  "geographic",
  "map-driving",
  "diagram-driving",
  "quotation",
  "editorial-connective",
]);

export const historyClaimOverrideV32Schema = z
  .object({
    reviewerId: z.string().min(1),
    reviewedAt: z.string().datetime(),
    reason: z.string().min(1),
    decision: z.enum(["accept", "reject"]),
    priorStatus: z.enum(["unresolved", "candidate", "supported", "disputed"]),
    narrationSha256: historyHashV32Schema,
    planHash: historyHashV32Schema,
  })
  .strict();

export type HistorySourceRegistryEntryV32 = z.infer<
  typeof historySourceRegistryEntryV32Schema
>;
export type HistoryEvidencePassageV32 = z.infer<
  typeof historyEvidencePassageV32Schema
>;
export type HistoryClaimSourceLinkV32 = z.infer<
  typeof historyClaimSourceLinkV32Schema
>;
export type HistoryClaimConcernV32 = z.infer<
  typeof historyClaimConcernV32Schema
>;
export type HistoryClaimOverrideV32 = z.infer<
  typeof historyClaimOverrideV32Schema
>;

const countByCode = (
  diagnostics: readonly HistoryDiagnosticV32[],
  severity: HistoryDiagnosticV32["severity"]
): { code: string; count: number }[] =>
  [...new Set(diagnostics.filter((item) => item.severity === severity).map((item) => item.code))]
    .sort()
    .map((code) => ({
      code,
      count: diagnostics.filter(
        (item) => item.severity === severity && item.code === code
      ).length,
    }));

export function summarizeHistoryApprovalV32(
  diagnostics: readonly HistoryDiagnosticV32[]
): HistoryApprovalSummaryV32 {
  const blockersFor = (gate: HistoryDiagnosticV32["gate"]): string[] =>
    [...new Set(
      diagnostics
        .filter((item) => item.severity === "error" && item.gate === gate)
        .map((item) => item.code)
    )].sort();
  const structural = blockersFor("structural");
  const editorial = blockersFor("editorial");
  const content = blockersFor("content");
  const production = blockersFor("production");
  return historyApprovalSummaryV32Schema.parse({
    structural: {
      state: structural.length === 0 ? "reviewable" : "blocked",
      blockerCodes: structural,
    },
    editorial: {
      state: editorial.length === 0 ? "reviewable" : "blocked",
      blockerCodes: editorial,
    },
    content: {
      state:
        structural.length + editorial.length + content.length === 0
          ? "eligible"
          : "blocked",
      blockerCodes: [...new Set([...structural, ...editorial, ...content])].sort(),
    },
    production: {
      state:
        structural.length + editorial.length + content.length + production.length === 0
          ? "eligible"
          : "blocked",
      blockerCodes: [
        ...new Set([...structural, ...editorial, ...content, ...production]),
      ].sort(),
    },
    blockers: countByCode(diagnostics, "error"),
    warnings: countByCode(diagnostics, "warning"),
  });
}
