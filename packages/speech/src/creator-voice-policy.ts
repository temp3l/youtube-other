import {
  approvalRecordSchema,
  contentProfileIdSchema,
  type ApprovalRecord,
  type ContentProfileId,
} from "@mediaforge/domain";

export type SpeechDispatchContext =
  | { readonly kind: "legacy-noncreator" }
  | {
      readonly kind: "creator";
      readonly profileId: ContentProfileId;
      readonly workflowInstanceId: string;
      readonly taskId: string;
      readonly unitId: string;
      readonly revision: string;
      readonly locale: string;
      readonly variant: "full" | "short";
      readonly inputSha256: string;
      readonly outputSha256: string;
      readonly approvals: readonly ApprovalRecord[];
    };

const sha256 = /^[a-f0-9]{64}$/iu;

function matchesSingleHashScope(actual: readonly string[], expected: string): boolean {
  return actual.length === 1 && actual[0] === expected;
}

function assertMonotonicApprovalHistory(records: readonly ApprovalRecord[]): void {
  let previous = -Infinity;
  for (const record of records) {
    const timestamp = Date.parse(record.createdAt);
    if (!Number.isFinite(timestamp) || timestamp <= previous) {
      throw new Error("Creator voice dispatch requires monotonic approval history.");
    }
    previous = timestamp;
  }
}

export function assertCreatorVoiceDispatchAllowed(
  contentProfileId: ContentProfileId,
  context: SpeechDispatchContext | undefined,
): void {
  const parsedProfile = contentProfileIdSchema.safeParse(contentProfileId);
  if (!parsedProfile.success) throw new Error("Speech provider dispatch requires a valid content profile.");
  if (!context) throw new Error("Speech provider dispatch requires an explicit dispatch context.");
  if (context.kind === "legacy-noncreator") {
    if (contentProfileId === "strategic-reinvention") {
      throw new Error("Strategic Reinvention cannot dispatch speech as legacy noncreator content.");
    }
    return;
  }
  if (
    context.kind !== "creator" ||
    context.profileId !== contentProfileId ||
    !Array.isArray(context.approvals) ||
    [context.workflowInstanceId, context.taskId, context.unitId, context.revision, context.locale, context.variant]
      .some((value) => typeof value !== "string" || value.trim().length === 0)
  ) {
    throw new Error("Creator voice dispatch requires a valid, explicit dispatch context.");
  }
  if (!sha256.test(context.inputSha256) || !sha256.test(context.outputSha256)) {
    throw new Error("Creator voice dispatch requires SHA-256 input and output fingerprints.");
  }
  const parsed = context.approvals.map((record) => approvalRecordSchema.safeParse(record));
  if (parsed.some((result) => !result.success)) {
    throw new Error("Creator voice dispatch requires valid scoped approval evidence.");
  }
  const records: ApprovalRecord[] = [];
  for (const result of parsed) {
    if (!result.success) continue;
    records.push(result.data);
  }
  assertMonotonicApprovalHistory(records);
  const now = Date.now();
  const exact = records.filter((record) =>
    record.profileId === context.profileId && record.workflowInstanceId === context.workflowInstanceId &&
    record.taskId === context.taskId && record.unitId === context.unitId && record.boundRevision === context.revision &&
    record.locale === context.locale && record.variant === context.variant && record.scope?.gate === "voice" &&
    matchesSingleHashScope(record.scope.inputArtifactHashes, context.inputSha256) &&
    matchesSingleHashScope(record.scope.outputArtifactHashes, context.outputSha256)
  );
  const approved = exact.filter((record, index) =>
    record.decision === "approved" &&
    (!record.expiresAt || Date.parse(record.expiresAt) > now) &&
    !exact.some((later, laterIndex) =>
      laterIndex > index && (
        later.decision === "rejected" ||
        (later.decision === "revoked" && later.supersedesApprovalId === record.id)
      )
    )
  );
  const actors = new Set(approved.map((record) => record.actor));
  // Voice synthesis is a required high-risk workflow gate; a caller-supplied
  // `highRisk: false` must never lower its independent-review requirement.
  if (approved.length === 0 || actors.size < 2) {
    throw new Error("Creator voice dispatch requires current scoped voice approval evidence.");
  }
  // The strategic policy disables synthetic narration. Human-recorded media is
  // supplied media and never routed through a TTS provider.
  throw new Error(`Synthetic narration is disabled for content profile ${contentProfileId}.`);
}
