import crypto from "node:crypto";
import { z } from "zod";
import { approvalRecordSchema, episodeBlueprintSchema, taskDefinitionSchema, workflowEventSchema, type ApprovalRecord, type TaskDefinition } from "@mediaforge/domain";
import { resolveLocaleWorkflowBranch, type StrategicItalianLocaleWorkflowInput } from "./story-workflow-locales.js";

export type StrategicItalianReviewStatus = "READY" | "REVIEW_REQUIRED";
export interface StrategicItalianReview { readonly status: StrategicItalianReviewStatus; readonly reasonCodes: readonly string[]; }

export interface StrategicItalianQaPolicy {
  readonly protectedTerms: readonly string[];
  readonly pronunciationTerms: readonly string[];
  readonly requireItalianCta: boolean;
}
const qaPolicySchema = z.object({ protectedTerms: z.array(z.string().trim().min(1)), pronunciationTerms: z.array(z.string().trim().min(1)), requireItalianCta: z.boolean() }).strict().superRefine((value, ctx) => {
  for (const [key, terms] of [["protectedTerms", value.protectedTerms], ["pronunciationTerms", value.pronunciationTerms]] as const) if (new Set(terms.map(normalized)).size !== terms.length) ctx.addIssue({ code: "custom", path: [key], message: "Terms must be normalized and unique." });
});
export type StrategicItalianEvidenceWorkflow = StrategicItalianLocaleWorkflowInput;

export interface StrategicItalianQaInput {
  readonly workflow: StrategicItalianEvidenceWorkflow;
  readonly script: string;
  readonly captionsVtt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly policy: StrategicItalianQaPolicy;
  readonly now?: string;
}

export function strategicItalianSha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function strategicItalianQaPolicyHash(policy: StrategicItalianQaPolicy): string {
  return strategicItalianSha256(stableJson(qaPolicySchema.parse(policy)));
}

function normalized(value: string): string { return value.normalize("NFC").trim(); }
function captionField(vtt: string, field: string): string | undefined {
  return vtt.split(/\r?\n/u).find((line) => line.startsWith(`${field}:`))?.slice(field.length + 1).trim().toLowerCase();
}

/** Event-backed approval evaluator: unparseable, future, expired, rejected, or revoked records never authorize. */
export function hasCurrentStrategicApproval(args: {
  readonly workflow: StrategicItalianEvidenceWorkflow;
  readonly gate: "canonical-script" | "localization" | "voice" | "metadata";
  readonly inputHashes: readonly string[];
  readonly outputHash: string;
  readonly minimumActors?: number;
  readonly locale?: "it" | "en" | "es";
  readonly variant?: "full" | "short";
  readonly now?: string;
}): boolean {
  const now = Date.parse(args.now ?? new Date().toISOString());
  if (!Number.isFinite(now)) return false;
  const records: ApprovalRecord[] = [];
  for (const raw of args.workflow.approvalLedger) {
    const parsed = approvalRecordSchema.safeParse(raw); if (!parsed.success || Date.parse(parsed.data.createdAt) > now || records.some((record) => record.id === parsed.data.id)) return false; records.push(parsed.data);
  }
  let prior = -Infinity;
  const events = [] as Array<{ approvalId: string; workflowInstanceId: string; taskId: string; occurredAt: string; decision?: string | undefined; actor?: string | undefined; gate?: string | undefined; locale?: string | undefined; variant?: string | undefined; supersedesApprovalId?: string | undefined }>;
  for (const raw of args.workflow.workflowEvents) {
    const parsed = workflowEventSchema.safeParse(raw); if (!parsed.success) return false;
    const at = Date.parse(parsed.data.occurredAt);
    if (!Number.isFinite(at) || at > now || at <= prior) return false;
    if (parsed.data.eventType === "approval-recorded") {
      const approvalEvent = parsed.data as Extract<typeof parsed.data, { eventType: "approval-recorded" }>;
      if (events.some((event) => event.approvalId === approvalEvent.approvalId)) return false;
    }
    prior = at;
    if (parsed.data.eventType === "approval-recorded") events.push(parsed.data as Extract<typeof parsed.data, { eventType: "approval-recorded" }>);
  }
  const locale = args.locale ?? "it"; const variant = args.variant ?? "full";
  const definition = strategicTaskDefinition(args.workflow, args.gate, locale, variant);
  if (!definition) return false;
  const taskId = definition.id;
  const canonicalInputs = [...args.inputHashes].sort();
  if (new Set(canonicalInputs).size !== canonicalInputs.length || canonicalInputs.some((hash) => !/^[a-f0-9]{64}$/u.test(hash)) || !/^[a-f0-9]{64}$/u.test(args.outputHash)) return false;
  const matching = records.filter((record) => record.profileId === "strategic-reinvention" && record.workflowInstanceId === args.workflow.workflowInstanceId && record.taskId === taskId && record.unitId === args.workflow.unitId && record.boundRevision === args.workflow.workflowRevision && record.locale === locale && record.variant === variant && record.scope?.gate === args.gate && record.scope.locale === locale && record.scope.variant === variant && stableJson([...record.scope.inputArtifactHashes].sort()) === stableJson(canonicalInputs) && stableJson([...record.scope.outputArtifactHashes].sort()) === stableJson([args.outputHash]));
  const eventFor = (record: ApprovalRecord) => events.findIndex((event) => event.approvalId === record.id && event.workflowInstanceId === record.workflowInstanceId && event.taskId === record.taskId && event.decision === record.decision && event.actor === record.actor && event.gate === args.gate && event.locale === locale && event.variant === variant && event.supersedesApprovalId === record.supersedesApprovalId && Date.parse(event.occurredAt) >= Date.parse(record.createdAt));
  const requiredActors = Math.max(args.minimumActors ?? 1, definition?.policies.approval?.requiredDistinctActors ?? 1, definition?.policies.approval?.highRisk ? 2 : 1);
  return new Set(matching.filter((record) => record.decision === "approved" && (!record.expiresAt || Date.parse(record.expiresAt) > now) && eventFor(record) >= 0 && !matching.some((later) => (later.decision === "rejected" || later.decision === "revoked") && eventFor(later) > eventFor(record) && (later.supersedesApprovalId === record.id || (stableJson([...later.scope!.inputArtifactHashes].sort()) === stableJson(canonicalInputs) && stableJson([...later.scope!.outputArtifactHashes].sort()) === stableJson([args.outputHash]))))).map((record) => record.actor)).size >= requiredActors;
}

/** Selects a declared, parsed task policy; strategic routes have no string-ID fallback. */
export function strategicTaskDefinition(workflow: StrategicItalianEvidenceWorkflow, gate: "canonical-script" | "localization" | "voice" | "metadata", locale: "it" | "en" | "es", variant: "full" | "short"): TaskDefinition | undefined {
  const key = gate === "canonical-script" ? (variant === "full" ? "canonicalFull" : "canonicalShort") : gate === "localization" ? (variant === "full" ? "localizationFull" : "localizationShort") : gate === "voice" ? "voice" : "metadata";
  const parsed = taskDefinitionSchema.safeParse(workflow.taskDefinitions[key]);
  if (!parsed.success || parsed.data.policies.approval?.gate !== gate || !parsed.data.policies.approvalRequired) return undefined;
  // Locale is evidence scope, not a caller-provided task identifier. The task is
  // intentionally generic across it/en/es and must be explicitly present.
  return parsed.data;
}

/** Computes all Italian release checks from bytes and immutable workflow evidence. */
export function reviewStrategicItalianPackage(input: StrategicItalianQaInput & { readonly locale?: "it" | "en" | "es"; readonly variant?: "full" | "short"; readonly childFingerprint?: string }): StrategicItalianReview {
  const reasons = new Set<string>();
  if (!qaPolicySchema.safeParse(input.policy).success) reasons.add("QA_POLICY_INVALID");
  const scriptHash = strategicItalianSha256(input.script);
  const locale = input.locale ?? "it"; const variant = input.variant ?? "full";
  if (locale === "it" && variant === "full") {
    const branch = resolveLocaleWorkflowBranch({ ...input.workflow, locale, variant, generatedArtifact: { ...input.workflow.italianCanonicalArtifact, locale, format: variant, fingerprint: scriptHash } });
    if (branch.status === "blocked" || input.workflow.italianCanonicalArtifact.fingerprint !== scriptHash) reasons.add("ITALIAN_ROUTE_OR_SCRIPT_LINEAGE_REQUIRED");
  }
  if (captionField(input.captionsVtt, "X-MEDIAFORGE-LOCALE") !== locale) reasons.add("CAPTION_LOCALE_MISMATCH");
  if (captionField(input.captionsVtt, "X-MEDIAFORGE-CANONICAL-SHA256") !== input.workflow.canonicalFingerprint) reasons.add("CAPTION_CANONICAL_FINGERPRINT_MISMATCH");
  if (captionField(input.captionsVtt, "X-MEDIAFORGE-CHILD-SHA256") !== scriptHash) reasons.add("CAPTION_CHILD_FINGERPRINT_MISMATCH");
  for (const term of input.policy.protectedTerms) if (!input.script.normalize("NFC").includes(normalized(term))) reasons.add(`PROTECTED_TERM_MISMATCH:${normalized(term)}`);
  for (const term of input.policy.pronunciationTerms) if (!input.script.normalize("NFC").includes(normalized(term))) reasons.add(`PRONUNCIATION_REVIEW_REQUIRED:${normalized(term)}`);
  const blueprint = episodeBlueprintSchema.safeParse(input.workflow.episodeBlueprint);
  const destination = blueprint.success ? (blueprint.data.cta.localizedDestinations?.[locale] ?? (locale === "it" ? blueprint.data.cta.destination : undefined)) : undefined;
  const cta = input.metadata["cta"];
  if (!blueprint.success || typeof cta !== "object" || cta === null || (cta as Record<string, unknown>)["destination"] !== destination) reasons.add("CTA_DESTINATION_REVIEW_REQUIRED");
  if (input.policy.requireItalianCta && (!isLocaleText((cta as Record<string, unknown> | undefined)?.["label"], locale) || !isLocaleText((cta as Record<string, unknown> | undefined)?.["text"], locale))) reasons.add("CTA_ITALIAN_TEXT_REQUIRED");
  return { status: reasons.size ? "REVIEW_REQUIRED" : "READY", reasonCodes: [...reasons].sort() };
}
function isLocaleText(value: unknown, locale: string): boolean { return typeof value === "string" && normalized(value).length > 2 && (locale !== "it" || /[a-zàèéìòóù]/iu.test(value)); }
