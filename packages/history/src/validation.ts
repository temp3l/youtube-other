import { z } from "zod";
import { chronologySchema, type ChronologyEvent, type HistoricalClaim } from "./research.js";

export const HISTORY_FACTUAL_VALIDATOR_VERSION = "history-factual-validator-v1" as const;

export const historyValidationIssueSchema = z.object({
  code: z.enum(["unsupported-certainty", "unverified-quotation", "chronology-invalid", "chronology-conflict", "disputed-claim-unmarked"]),
  severity: z.enum(["warning", "error"]),
  message: z.string().min(1),
  excerpt: z.string().min(1).optional(),
}).strict();
export type HistoryValidationIssue = z.infer<typeof historyValidationIssueSchema>;

export interface HistoryValidationResult { readonly status: "passed" | "failed"; readonly issues: readonly HistoryValidationIssue[]; }

const certaintyPattern = /\b(?:certainly|undeniably|proved|proves|definitively|without doubt|no doubt|unquestionably|always|never)\b/iu;
const uncertaintyPattern = /\b(?:may|might|could|possibly|perhaps|likely|uncertain|disputed|debated|contested|traditionally|legend)\b/iu;
const quotePattern = /[“"]([^”"\n]{2,500})[”"]/gu;

function normalize(value: string): string { return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase(); }
function sentences(narration: string): readonly string[] { return narration.split(/(?<=[.!?])\s+/u).map((sentence) => sentence.trim()).filter(Boolean); }

export function validateUnsupportedCertainty(narration: string, claims: readonly HistoricalClaim[]): readonly HistoryValidationIssue[] {
  const uncertainClaims = claims.filter((claim) => ["inference", "disputed", "legend", "unknown"].includes(claim.classification));
  if (uncertainClaims.length === 0) return [];
  return sentences(narration).filter((sentence) => certaintyPattern.test(sentence) && !uncertaintyPattern.test(sentence)).map((sentence) => ({
    code: "unsupported-certainty", severity: "error", excerpt: sentence,
    message: "Certainty language requires a source-backed established or consensus claim.",
  }));
}

export function validateQuotations(narration: string, verifiedQuotations: readonly string[]): readonly HistoryValidationIssue[] {
  const verified = new Set(verifiedQuotations.map(normalize));
  return [...narration.matchAll(quotePattern)].flatMap((match) => {
    const quotation = match[1] ?? "";
    return verified.has(normalize(quotation)) ? [] : [{ code: "unverified-quotation" as const, severity: "error" as const, excerpt: quotation, message: "Quoted text is not present in the verified quotation inventory." }];
  });
}

export function validateChronologyForHistory(events: readonly ChronologyEvent[]): readonly HistoryValidationIssue[] {
  const parsed = chronologySchema.safeParse(events);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({ code: "chronology-invalid" as const, severity: "error" as const, message: issue.message }));
}

export function validateDisputedClaimPreservation(narration: string, claims: readonly HistoricalClaim[]): readonly HistoryValidationIssue[] {
  const normalizedNarration = normalize(narration);
  return claims.filter((claim) => claim.classification === "disputed").flatMap((claim) => {
    const anchor = normalize(claim.statement).split(/\s+/u).filter((word) => word.length >= 5).slice(0, 3);
    if (anchor.length === 0 || !anchor.every((word) => normalizedNarration.includes(word))) return [];
    const containingSentence = sentences(narration).find((sentence) => anchor.every((word) => normalize(sentence).includes(word))) ?? claim.statement;
    return uncertaintyPattern.test(containingSentence) ? [] : [{ code: "disputed-claim-unmarked" as const, severity: "error" as const, excerpt: containingSentence, message: "A disputed claim appears without uncertainty or dispute framing." }];
  });
}

export function validateHistoricalNarration(input: { readonly narration: string; readonly claims: readonly HistoricalClaim[]; readonly chronology: readonly ChronologyEvent[]; readonly verifiedQuotations?: readonly string[]; }): HistoryValidationResult {
  const issues = [
    ...validateUnsupportedCertainty(input.narration, input.claims),
    ...validateQuotations(input.narration, input.verifiedQuotations ?? []),
    ...validateChronologyForHistory(input.chronology),
    ...validateDisputedClaimPreservation(input.narration, input.claims),
  ];
  return { status: issues.some((issue) => issue.severity === "error") ? "failed" : "passed", issues };
}
