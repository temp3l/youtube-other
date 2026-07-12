import { z } from "zod";
import {
  mathLanguageSchema,
  mathProductionStatusSchema,
  type MathLanguage,
  type MathProductionStatus,
} from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";

export const MATH_QUALITY_CONTRACT_VERSION = "math-quality-contract.v2" as const;
export const MATH_QUALITY_ARTIFACT_VERSION = "math-quality.v2" as const;
export const MATH_MINOR_APPROVAL_VERSION = "math-minor-approval.v1" as const;

export const MATH_QUALITY_GATES = [
  { checkId: "mathematics", failureStatus: "MATHEMATICAL_ERROR", phase: "render-preflight" },
  { checkId: "curriculum", failureStatus: "CURRICULUM_ERROR", phase: "render-preflight" },
  { checkId: "localization", failureStatus: "LOCALIZATION_ERROR", phase: "render-preflight" },
  { checkId: "timing", failureStatus: "TIMING_ERROR", phase: "render-preflight" },
  { checkId: "audio", failureStatus: "RENDER_BLOCKED", phase: "final-media" },
  { checkId: "render", failureStatus: "RENDER_BLOCKED", phase: "final-media" },
  { checkId: "media-qa-packet", failureStatus: "RENDER_BLOCKED", phase: "final-media" },
  { checkId: "final-media", failureStatus: "RENDER_BLOCKED", phase: "final-media" },
  { checkId: "publish-packet", failureStatus: "PUBLISH_BLOCKED", phase: "publish" },
  { checkId: "content-review", failureStatus: "REVISION_REQUIRED", phase: "publish" },
  { checkId: "minor-edit-review", failureStatus: "READY_WITH_MINOR_EDITS", phase: "publish" },
] as const;
export type MathQualityCheckId = (typeof MATH_QUALITY_GATES)[number]["checkId"];
const gateById = new Map(MATH_QUALITY_GATES.map((gate) => [gate.checkId, gate]));
const priority: readonly MathProductionStatus[] = [
  "MATHEMATICAL_ERROR", "CURRICULUM_ERROR", "LOCALIZATION_ERROR", "TIMING_ERROR",
  "RENDER_BLOCKED", "PUBLISH_BLOCKED", "REVISION_REQUIRED", "READY_WITH_MINOR_EDITS", "READY",
];
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const evidenceStateSchema = z.enum(["ready", "failed", "missing", "skipped", "corrupt", "hash-invalid"]);

export const mathQualityCheckSchema = z.strictObject({
  checkId: z.enum(MATH_QUALITY_GATES.map((gate) => gate.checkId) as [MathQualityCheckId, ...MathQualityCheckId[]]),
  status: mathProductionStatusSchema,
  passed: z.boolean(),
  evidenceState: evidenceStateSchema,
  evidenceHash: hashSchema.nullable(),
  message: z.string().min(1),
  assessedLocales: z.array(mathLanguageSchema).optional(),
}).superRefine((check, context) => {
  const gate = gateById.get(check.checkId)!;
  if (check.status !== gate.failureStatus)
    context.addIssue({ code: "custom", path: ["status"], message: `Check ${check.checkId} must map to ${gate.failureStatus}.` });
  if (check.passed !== (check.evidenceState === "ready"))
    context.addIssue({ code: "custom", path: ["passed"], message: "passed must exactly match ready evidence." });
  if ((check.evidenceState === "ready") !== (check.evidenceHash !== null))
    context.addIssue({ code: "custom", path: ["evidenceHash"], message: "Only ready evidence has a validated content hash." });
  if (check.checkId !== "localization" && check.assessedLocales !== undefined)
    context.addIssue({ code: "custom", path: ["assessedLocales"], message: "Only localization evidence may declare assessed locales." });
});
export type MathQualityCheck = z.infer<typeof mathQualityCheckSchema>;

export const mathQualityInputSchema = z.strictObject({
  contractVersion: z.literal(MATH_QUALITY_CONTRACT_VERSION),
  lessonId: z.string().min(1),
  selectedLocales: z.array(mathLanguageSchema).min(1),
  checks: z.array(mathQualityCheckSchema).length(MATH_QUALITY_GATES.length),
}).superRefine((input, context) => {
  const selected = new Set(input.selectedLocales);
  if (selected.size !== input.selectedLocales.length)
    context.addIssue({ code: "custom", path: ["selectedLocales"], message: "Selected locales must be unique." });
  const ids = input.checks.map((check) => check.checkId);
  for (const gate of MATH_QUALITY_GATES) {
    const count = ids.filter((id) => id === gate.checkId).length;
    if (count !== 1) context.addIssue({ code: "custom", path: ["checks"], message: `Required check ${gate.checkId} must occur exactly once.` });
  }
  const localization = input.checks.find((check) => check.checkId === "localization");
  const assessed = localization?.assessedLocales ?? [];
  if (new Set(assessed).size !== assessed.length || assessed.some((locale) => !selected.has(locale)) || (localization?.passed && selected.size !== assessed.length))
    context.addIssue({ code: "custom", path: ["checks"], message: "Localization evidence must exactly cover the selected locale scope." });
});
export type MathQualityInput = z.infer<typeof mathQualityInputSchema>;

const mathQualityReportShape = z.strictObject({
  artifactVersion: z.literal(MATH_QUALITY_ARTIFACT_VERSION),
  contractVersion: z.literal(MATH_QUALITY_CONTRACT_VERSION),
  lessonId: z.string().min(1),
  selectedLocales: z.array(mathLanguageSchema).min(1),
  qualityInputHash: hashSchema,
  status: mathProductionStatusSchema,
  blockers: z.array(z.enum(MATH_QUALITY_GATES.map((gate) => gate.checkId) as [MathQualityCheckId, ...MathQualityCheckId[]])),
  renderPreflightAllowed: z.boolean(),
  finalMediaReady: z.boolean(),
  publishableWithoutApproval: z.boolean(),
  checks: z.array(mathQualityCheckSchema).length(MATH_QUALITY_GATES.length),
});
export const mathQualityReportSchema = mathQualityReportShape.superRefine((report, context) => {
  const failed = report.checks.filter((check) => !check.passed);
  const expectedStatus = priority.find((candidate) => failed.some((check) => check.status === candidate)) ?? "READY";
  const expectedBlockers = failed.map((check) => check.checkId);
  const preflight = report.checks.filter((check) => gateById.get(check.checkId)?.phase === "render-preflight").every((check) => check.passed);
  const media = report.checks.filter((check) => gateById.get(check.checkId)?.phase === "final-media").every((check) => check.passed);
  if (report.status !== expectedStatus) context.addIssue({ code: "custom", path: ["status"], message: "Status is not derived from checks." });
  if (report.blockers.join(":") !== expectedBlockers.join(":")) context.addIssue({ code: "custom", path: ["blockers"], message: "Blockers are not derived from checks." });
  if (report.renderPreflightAllowed !== preflight) context.addIssue({ code: "custom", path: ["renderPreflightAllowed"], message: "Render permission is contradictory." });
  if (report.finalMediaReady !== media) context.addIssue({ code: "custom", path: ["finalMediaReady"], message: "Media readiness is contradictory." });
  if (report.publishableWithoutApproval !== (expectedStatus === "READY")) context.addIssue({ code: "custom", path: ["publishableWithoutApproval"], message: "Publish permission is contradictory." });
  const input = { contractVersion: report.contractVersion, lessonId: report.lessonId, selectedLocales: report.selectedLocales, checks: report.checks };
  if (!mathQualityInputSchema.safeParse(input).success || report.qualityInputHash !== canonicalHash(input))
    context.addIssue({ code: "custom", path: ["qualityInputHash"], message: "Quality input identity is invalid." });
});
export type MathQualityReport = z.infer<typeof mathQualityReportSchema>;

export function deriveMathQuality(raw: MathQualityInput): MathQualityReport {
  const input = mathQualityInputSchema.parse(raw);
  const failed = input.checks.filter((check) => !check.passed);
  const status = priority.find((candidate) => failed.some((check) => check.status === candidate)) ?? "READY";
  const renderPreflightAllowed = input.checks.filter((check) => gateById.get(check.checkId)?.phase === "render-preflight").every((check) => check.passed);
  const finalMediaReady = input.checks.filter((check) => gateById.get(check.checkId)?.phase === "final-media").every((check) => check.passed);
  return mathQualityReportSchema.parse({
    artifactVersion: MATH_QUALITY_ARTIFACT_VERSION,
    contractVersion: input.contractVersion,
    lessonId: input.lessonId,
    selectedLocales: input.selectedLocales,
    qualityInputHash: canonicalHash(input),
    status,
    blockers: failed.map((check) => check.checkId),
    renderPreflightAllowed,
    finalMediaReady,
    publishableWithoutApproval: status === "READY",
    checks: input.checks,
  });
}

export const mathMinorEditApprovalSchema = z.strictObject({
  artifactVersion: z.literal(MATH_MINOR_APPROVAL_VERSION),
  qualityArtifact: z.strictObject({ lessonId: z.string().min(1), relativePath: z.string().min(1), contentHash: hashSchema, qualityInputHash: hashSchema }),
  decision: z.literal("approve-minor-edits"),
  requestedByReviewerId: z.string().min(1),
  reviewedByReviewerId: z.string().min(1),
  requestedAt: z.string().datetime(),
  reviewedAt: z.string().datetime(),
}).superRefine((approval, context) => {
  if (approval.requestedByReviewerId === approval.reviewedByReviewerId)
    context.addIssue({ code: "custom", path: ["reviewedByReviewerId"], message: "Minor edits require a genuine second reviewer." });
  if (Date.parse(approval.reviewedAt) < Date.parse(approval.requestedAt))
    context.addIssue({ code: "custom", path: ["reviewedAt"], message: "Review cannot predate its request." });
});
export type MathMinorEditApproval = z.infer<typeof mathMinorEditApprovalSchema>;

export function evaluateMinorEditApproval(args: { report: MathQualityReport; qualityRelativePath: string; qualityContentHash: string; approval?: unknown }): { approved: boolean; reason: string } {
  if (args.report.status !== "READY_WITH_MINOR_EDITS") return { approved: false, reason: "approval-not-applicable" };
  const parsed = mathMinorEditApprovalSchema.safeParse(args.approval);
  if (!parsed.success) return { approved: false, reason: "invalid-approval" };
  const bound = parsed.data.qualityArtifact;
  if (bound.lessonId !== args.report.lessonId || bound.relativePath !== args.qualityRelativePath || bound.contentHash !== args.qualityContentHash || bound.qualityInputHash !== args.report.qualityInputHash)
    return { approved: false, reason: "approval-evidence-mismatch" };
  return { approved: true, reason: "valid-second-reviewer-approval" };
}

export function assertRenderAllowed(report: MathQualityReport): void {
  const parsed = mathQualityReportSchema.parse(report);
  if (!parsed.renderPreflightAllowed) throw new Error(`Rendering blocked: ${parsed.status}.`);
}
export function assertPublishAllowed(args: { report: MathQualityReport; qualityRelativePath: string; qualityContentHash: string; approval?: unknown; publishingEnabled: boolean; explicitPublish: boolean }): void {
  const report = mathQualityReportSchema.parse(args.report);
  const approval = evaluateMinorEditApproval({ ...args, report });
  if (!args.publishingEnabled || !args.explicitPublish || !(report.publishableWithoutApproval || approval.approved))
    throw new Error(`Publishing blocked: ${report.status} (${approval.reason}).`);
}
export function qualityExitCode(statuses: readonly MathProductionStatus[]): 0 | 2 | 3 {
  const ready = statuses.filter((status) => status === "READY").length;
  if (ready === statuses.length) return 0;
  return ready > 0 ? 2 : 3;
}
export function qualityCheck(args: { checkId: MathQualityCheckId; ready: boolean; evidenceHash?: string; message: string; assessedLocales?: readonly MathLanguage[] }): MathQualityCheck {
  const gate = gateById.get(args.checkId)!;
  return mathQualityCheckSchema.parse({ checkId: args.checkId, status: gate.failureStatus, passed: args.ready, evidenceState: args.ready ? "ready" : "missing", evidenceHash: args.ready ? args.evidenceHash : null, message: args.message, ...(args.assessedLocales ? { assessedLocales: args.assessedLocales } : {}) });
}
