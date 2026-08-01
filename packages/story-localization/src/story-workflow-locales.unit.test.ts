import { describe, expect, it } from "vitest";
import {
  executeLocaleWorkflowStage,
  localeFailureBlocksOnlyLocale,
  resolveLocaleWorkflowBranch,
} from "./story-workflow-locales.js";
import { buildPlannedStoryWorkflowManifest } from "./story-workflow-planner.js";
import { buildStoryWorkflowStatusReport } from "./story-workflow-status.js";
import { APPROVAL_SCHEMA_VERSION, TASK_SCHEMA_VERSION, WORKFLOW_SCHEMA_VERSION, approvalRecordSchema, taskDefinitionSchema, type ApprovalRecord } from "@mediaforge/domain";
import { type ArtifactLineage } from "./story-workflow.types.js";

const canonicalHash = "a".repeat(64);
const localizedHash = "b".repeat(64);
const sourceHash = "c".repeat(64);
function task(gate: "canonical-script" | "localization" | "voice" | "metadata", id: `${string}.${string}`, highRisk = false) { return taskDefinitionSchema.parse({ schemaVersion: TASK_SCHEMA_VERSION, id, implementationVersion: "1.0.0", displayName: id, description: id, applicableProfiles: ["strategic-reinvention"], dependencies: [], inputs: [], outputs: [], executionKind: "manual-approval", policies: { cache: "fingerprint", retryLimit: 1, timeoutMs: 1000, lockScope: "task", approvalRequired: true, approval: { gate, highRisk, requiredDistinctActors: highRisk ? 2 : 1 }, batchable: false, provider: "none", estimatedCostClass: "none" }, cli: { resource: "task", command: id, examples: [id] }, observability: { operationName: id, redactedFields: [] } }); }
const taskDefinitions = { canonicalFull: task("canonical-script", "strategic.canonical.full"), canonicalShort: task("canonical-script", "strategic.canonical.short"), localizationFull: task("localization", "strategic.localization.full"), localizationShort: task("localization", "strategic.localization.short"), voice: task("voice", "strategic.voice"), metadata: task("metadata", "strategic.metadata") };

function strategicApproval(
  gate: "canonical-script" | "localization",
  locale: "it" | "en" | "es",
  output: string,
  overrides: Partial<ApprovalRecord> = {},
): ApprovalRecord {
  return approvalRecordSchema.parse({
    schemaVersion: APPROVAL_SCHEMA_VERSION, id: `approval-${gate}-${locale}-one`, workflowInstanceId: "instance-001",
    taskId: gate === "canonical-script" ? taskDefinitions.canonicalFull.id : taskDefinitions.localizationFull.id,
    profileId: "strategic-reinvention", unitId: "episode-001", locale, variant: "full",
    decision: "approved", actor: "one@example.invalid", reason: "Approved strategic artifact.", boundRevision: "revision-1",
    artifactHashes: [output], createdAt: "2026-08-01T00:00:00.000Z",
    scope: { gate, locale, variant: "full", inputArtifactHashes: [gate === "canonical-script" ? sourceHash : canonicalHash], outputArtifactHashes: [output], highRisk: false },
    ...overrides,
  });
}

function strategicRoute(locale: "en" | "es", approvals: readonly ApprovalRecord[]) {
  return {
    route: "strategic-italian" as const,
    italianCanonicalArtifact: { ...artifact("it"), fingerprint: canonicalHash }, approvalLedger: approvals,
    workflowEvents: approvals.map((approval, index) => ({
      schemaVersion: WORKFLOW_SCHEMA_VERSION, eventId: `event-${approval.id}`, workflowInstanceId: approval.workflowInstanceId,
      occurredAt: `2026-08-01T00:00:${String(index).padStart(2, "0")}.000Z`, eventType: "approval-recorded" as const, approvalId: approval.id,
      taskId: approval.taskId, decision: approval.decision, actor: approval.actor, gate: approval.scope?.gate,
      locale: approval.locale, variant: approval.variant, ...(approval.supersedesApprovalId ? { supersedesApprovalId: approval.supersedesApprovalId } : {}),
    })),
    workflowInstanceId: "instance-001", taskDefinitions,
    unitId: "episode-001", workflowRevision: "revision-1", profileId: "strategic-reinvention" as const,
    canonicalInputHashes: [sourceHash],
    episodeBlueprint: { schemaVersion: "1.1", episodeId: "episode-001", genreId: "strategic-reinvention", creatorProfileId: "creator-001", canonicalLocale: "it", mode: "tactical-lesson", sources: ["source-001"], contentTier: "public", thesis: "A sufficiently specific strategic thesis.", beats: ["hook", "situation", "story", "reframe", "framework", "cta"].map((type, index) => ({ beatId: `beat-${index}`, type, purpose: "Reviewed strategic beat.", sourceIds: ["source-001"] })), cta: { kind: "none", destination: "", campaignId: "" }, requiredApprovalGates: ["canonical-script", "localization"] },
  };
}

function artifact(locale: "en" | "de" | "es" | "fr" | "it" | "pt"): ArtifactLineage {
  return {
    artifactId: `artifact:009-the-christmas-doll:${locale}:full:narration:deadbeef` as ArtifactLineage["artifactId"],
    artifactType: "localized-story-package",
    owner: "narration",
    locale,
    format: "full",
    provenance: "generated",
    path: `${locale}/full/script.md`,
    fingerprint: "a".repeat(64),
    schemaVersion: "localized-story-package-v1",
    parents: [],
    sourceStageId: `stage:localize-full:${locale}:full` as ArtifactLineage["sourceStageId"],
  };
}

describe("story workflow locale branches", () => {
  it("accepts generated localized artifacts", () => {
    const result = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      generatedArtifact: artifact("es"),
    });
    expect(result.status).toBe("accepted");
    expect(result.fallbackUsed).toBe(false);
  });

  it("plans Italian as an opt-in strategic canonical parent without changing defaults", () => {
    const legacy = buildPlannedStoryWorkflowManifest({ episodeId: "009-the-christmas-doll", formats: ["full"] });
    const strategic = buildPlannedStoryWorkflowManifest({ episodeId: "009-the-christmas-doll", formats: ["full"], strategicItalianCanonical: true });
    expect(legacy.locales).not.toContain("it");
    expect(strategic.locales).toEqual(["it", "en", "es"]);
    expect(strategic.stages.find((stage) => stage.stageId === "stage:ingest-source:it:full")).toBeDefined();
    expect(strategic.stages.find((stage) => stage.stageId === "stage:localize-full:en:full")?.dependsOn).toContain("stage:quality-full:it:full");
  });

  it("keeps Italian full as the strategic Short parent and EN/ES as its children", () => {
    const plan = buildPlannedStoryWorkflowManifest({ episodeId: "009-the-christmas-doll", formats: ["full", "short"], strategicItalianCanonical: true });
    expect(plan.stages.find((stage) => stage.stageId === "stage:rewrite-short:it:short")?.dependsOn).toContain("stage:quality-full:it:full");
    expect(plan.stages.find((stage) => stage.stageId === "stage:rewrite-short:en:short")?.dependsOn).toContain("stage:quality-full:en:full");
    expect(plan.stages.find((stage) => stage.stageId === "stage:rewrite-short:es:short")?.dependsOn).toContain("stage:quality-full:es:full");
  });

  it("preserves the legacy route when no strategic approval ledger is selected", () => {
    const generated = { ...artifact("en"), fingerprint: "b".repeat(64) };
    expect(resolveLocaleWorkflowBranch({
      locale: "en", canonicalFingerprint: "a".repeat(64), generatedArtifact: generated,
    }).status).toBe("accepted");
    expect(resolveLocaleWorkflowBranch({
      locale: "es", canonicalFingerprint: "a".repeat(64), generatedArtifact: artifact("es"),
    }).status).toBe("accepted");
  });

  it("fails the strategic route closed without a current Italian approval ledger", () => {
    expect(resolveLocaleWorkflowBranch({
      locale: "en", canonicalFingerprint: "a".repeat(64), generatedArtifact: artifact("en"),
      route: "strategic-italian", italianCanonicalArtifact: { ...artifact("it"), fingerprint: "a".repeat(64) }, approvalLedger: [], workflowEvents: [], workflowInstanceId: "instance-001", taskDefinitions, unitId: "episode-001", workflowRevision: "revision-1", canonicalInputHashes: [sourceHash], episodeBlueprint: {},
    }).status).toBe("blocked");
  });

  it("fails closed for malformed, mismatched, expired, terminal, and under-reviewed strategic approvals", () => {
    const canonical = strategicApproval("canonical-script", "it", canonicalHash);
    const localization = strategicApproval("localization", "en", localizedHash);
    const cases: Array<[string, readonly ApprovalRecord[]]> = [
      ["malformed", [{ id: "partial" } as never]],
      ["wrong workflow", [canonical, strategicApproval("localization", "en", localizedHash, { id: "approval-wrong-workflow", workflowInstanceId: "instance-002" as never })]],
      ["wrong task", [canonical, strategicApproval("localization", "en", localizedHash, { taskId: "strategic.other" as never })]],
      ["wrong unit", [canonical, strategicApproval("localization", "en", localizedHash, { unitId: "episode-002" as never })]],
      ["wrong profile", [canonical, strategicApproval("localization", "en", localizedHash, { profileId: "dark-truth" })]],
      ["wrong gate", [canonical, strategicApproval("localization", "en", localizedHash, { scope: { ...localization.scope!, gate: "metadata" } })]],
      ["wrong locale", [canonical, strategicApproval("localization", "es", localizedHash)]],
      ["wrong variant", [canonical, strategicApproval("localization", "en", localizedHash, { variant: "short", scope: { ...localization.scope!, variant: "short" } })]],
      ["wrong input", [canonical, strategicApproval("localization", "en", localizedHash, { scope: { ...localization.scope!, inputArtifactHashes: ["c".repeat(64)] } })]],
      ["wrong output", [canonical, strategicApproval("localization", "en", "c".repeat(64))]],
      ["wrong revision", [canonical, strategicApproval("localization", "en", localizedHash, { boundRevision: "revision-2" })]],
      ["expired", [canonical, strategicApproval("localization", "en", localizedHash, { expiresAt: "2026-01-01T00:00:00.000Z" })]],
      ["later rejected", [canonical, localization, strategicApproval("localization", "en", localizedHash, { id: "approval-localization-rejected", decision: "rejected" })]],
      ["later revoked", [canonical, localization, strategicApproval("localization", "en", localizedHash, { id: "approval-localization-revoked", decision: "revoked", supersedesApprovalId: localization.id })]],
    ];
    for (const [name, approvals] of cases) {
      const result = resolveLocaleWorkflowBranch({ locale: "en", canonicalFingerprint: canonicalHash, generatedArtifact: { ...artifact("en"), fingerprint: localizedHash }, ...strategicRoute("en", approvals) });
      expect(result.status, name).toBe("blocked");
    }
    expect(resolveLocaleWorkflowBranch({ locale: "en", canonicalFingerprint: canonicalHash, generatedArtifact: { ...artifact("en"), fingerprint: localizedHash }, ...strategicRoute("en", [canonical, localization]), italianCanonicalArtifact: { ...artifact("en"), fingerprint: canonicalHash } }).status).toBe("blocked");
    expect(resolveLocaleWorkflowBranch({ locale: "en", canonicalFingerprint: canonicalHash, generatedArtifact: { ...artifact("en"), fingerprint: localizedHash }, ...strategicRoute("en", [localization]) }).status).toBe("blocked");
  });

  it("derives high-risk review count from the runtime blueprint rather than approval scope", () => {
    const canonical = strategicApproval("canonical-script", "it", canonicalHash);
    const localization = strategicApproval("localization", "en", localizedHash);
    const highRiskTasks = { ...taskDefinitions, localizationFull: task("localization", "strategic.localization.full", true) };
    const oneActor = resolveLocaleWorkflowBranch({ locale: "en", canonicalFingerprint: canonicalHash, generatedArtifact: { ...artifact("en"), fingerprint: localizedHash }, ...strategicRoute("en", [canonical, localization]), taskDefinitions: highRiskTasks });
    const twoActors = resolveLocaleWorkflowBranch({ locale: "en", canonicalFingerprint: canonicalHash, generatedArtifact: { ...artifact("en"), fingerprint: localizedHash }, ...strategicRoute("en", [canonical, strategicApproval("canonical-script", "it", canonicalHash, { id: "approval-canonical-it-two", actor: "two@example.invalid" }), localization, strategicApproval("localization", "en", localizedHash, { id: "approval-localization-en-two", actor: "two@example.invalid" })]), taskDefinitions: highRiskTasks });
    expect(oneActor.status).toBe("blocked");
    expect(twoActors.status).toBe("accepted");
  });

  it("accepts current normal and two-actor high-risk Italian cohorts for generated and fallback EN/ES", () => {
    for (const locale of ["en", "es"] as const) {
      const local = strategicApproval("localization", locale, localizedHash);
      const canonical = strategicApproval("canonical-script", "it", canonicalHash);
      const highRisk = [canonical, strategicApproval("canonical-script", "it", canonicalHash, { id: "approval-canonical-it-two", actor: "two@example.invalid", scope: { ...canonical.scope!, highRisk: true } }), strategicApproval("canonical-script", "it", canonicalHash, { scope: { ...canonical.scope!, highRisk: true } }), strategicApproval("localization", locale, localizedHash, { scope: { ...local.scope!, highRisk: true } }), strategicApproval("localization", locale, localizedHash, { id: `approval-localization-${locale}-two`, actor: "two@example.invalid", scope: { ...local.scope!, highRisk: true } })];
      for (const approvals of [[canonical, local], highRisk]) {
        const generated = resolveLocaleWorkflowBranch({ locale, canonicalFingerprint: canonicalHash, generatedArtifact: { ...artifact(locale), fingerprint: localizedHash }, ...strategicRoute(locale, approvals) });
        const fallback = resolveLocaleWorkflowBranch({ locale, canonicalFingerprint: canonicalHash, fallbackCandidates: [{ artifact: { ...artifact(locale), fingerprint: localizedHash }, canonicalFingerprint: canonicalHash, qualityPassed: true }], ...strategicRoute(locale, approvals) });
        expect(generated.status).toBe("accepted");
        expect(fallback.status).toBe("fallback-accepted");
      }
    }
  });

  it("uses accepted same-locale fallback only", () => {
    const result = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      fallbackCandidates: [
        { artifact: artifact("de"), canonicalFingerprint: "canon", qualityPassed: true },
        { artifact: artifact("es"), canonicalFingerprint: "canon", qualityPassed: true },
      ],
    });
    expect(result.status).toBe("fallback-accepted");
    expect(result.artifact?.provenance).toBe("localized-fallback");
  });

  it("keeps locale failures isolated", () => {
    const es = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      fallbackCandidates: [],
    });
    const de = resolveLocaleWorkflowBranch({
      locale: "de",
      canonicalFingerprint: "canon",
      generatedArtifact: artifact("de"),
    });
    expect(localeFailureBlocksOnlyLocale([es, de], "es")).toBe(true);
  });

  it("persists same-locale fallback without corrupting another locale", async () => {
    const manifest = buildPlannedStoryWorkflowManifest({
      episodeId: "009-the-christmas-doll",
      locales: ["en", "de", "es"],
      formats: ["full"],
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    const es = resolveLocaleWorkflowBranch({
      locale: "es",
      canonicalFingerprint: "canon",
      fallbackCandidates: [
        { artifact: artifact("es"), canonicalFingerprint: "canon", qualityPassed: true },
      ],
    });
    const withEs = await executeLocaleWorkflowStage({
      context: { manifest },
      result: es,
    });
    const de = resolveLocaleWorkflowBranch({
      locale: "de",
      canonicalFingerprint: "canon",
      fallbackCandidates: [],
    });
    const withDe = await executeLocaleWorkflowStage({
      context: { manifest: withEs.manifest },
      result: de,
    });
    const status = buildStoryWorkflowStatusReport(withDe.manifest);

    expect(status.fallbacks[0]?.locale).toBe("es");
    expect(status.fallbacks[0]?.provenance).toBe("localized-fallback");
    expect(
      withDe.manifest.stages.find(
        (stage) => stage.stageId === "stage:localize-full:es:full"
      )?.status
    ).toBe("succeeded");
    expect(
      withDe.manifest.stages.find(
        (stage) => stage.stageId === "stage:localize-full:de:full"
      )?.status
    ).toBe("blocked");
  });
});
