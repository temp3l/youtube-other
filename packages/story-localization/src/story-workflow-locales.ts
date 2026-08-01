import {
  stageOutcomeSchemaVersion,
  stageFailureSchemaVersion,
  type ArtifactLineage,
  type CacheMetadata,
  type CostMetrics,
  type FailureCategory,
  type StageFailure,
  type StageId,
  type StageOutcome,
  type WorkflowManifest,
  type WorkflowLocale,
} from "./story-workflow.types.js";
import {
  appendStageOutcome,
  type StoryWorkflowManifestStore,
} from "./story-workflow-store.js";
import {
  approvalRecordSchema,
  episodeBlueprintSchema,
  taskDefinitionSchema,
  workflowEventSchema,
  type ApprovalRecord,
  type WorkflowEvent,
} from "@mediaforge/domain";

export type LocaleWorkflowStatus = "accepted" | "fallback-accepted" | "blocked";

export interface LocaleFallbackCandidate {
  readonly artifact: ArtifactLineage;
  readonly canonicalFingerprint: string;
  readonly qualityPassed: boolean;
}

export interface LegacyLocaleWorkflowInput {
  readonly route?: "legacy";
  readonly locale: WorkflowLocale;
  readonly variant?: "full" | "short";
  readonly canonicalFingerprint: string;
  readonly generatedArtifact?: ArtifactLineage;
  readonly generationFailure?: StageFailure;
  readonly fallbackCandidates?: readonly LocaleFallbackCandidate[];
  /** A strategic profile may never enter through the compatibility route. */
  readonly contentProfileId?: "dark-truth" | "mathematics-education" | "strategic-reinvention";
}

export interface StrategicItalianLocaleWorkflowInput extends Omit<LegacyLocaleWorkflowInput, "canonicalFingerprint" | "route"> {
  readonly route: "strategic-italian";
  readonly canonicalFingerprint: string;
  readonly italianCanonicalArtifact: ArtifactLineage;
  /** Untrusted persisted values; parsed at the strategic boundary. */
  readonly approvalLedger: readonly unknown[];
  readonly workflowEvents: readonly unknown[];
  readonly workflowInstanceId: string;
  readonly unitId: string;
  readonly workflowRevision: string;
  readonly contentProfileId?: "strategic-reinvention";
  readonly creatorProfileId?: string;
  /** Derived from the reviewed blueprint/task policy, never from approval scope. */
  /** Untrusted strategic blueprint parsed at this boundary. */
  readonly episodeBlueprint: unknown;
  /** Exact source provenance hashes consumed by the Italian canonical artifact. */
  readonly canonicalInputHashes: readonly string[];
  /** Exact selected parent fingerprints supplied with the artifact release payload. */
  readonly selectedParentFingerprints?: readonly string[];
  /** Untrusted task declarations, parsed at runtime. Raw task IDs are forbidden. */
  readonly taskDefinitions: Readonly<Record<"canonicalFull" | "canonicalShort" | "localizationFull" | "localizationShort" | "voice" | "metadata", unknown>>;
}

export type LocaleWorkflowInput = LegacyLocaleWorkflowInput | StrategicItalianLocaleWorkflowInput;

export interface LocaleWorkflowResult {
  readonly locale: WorkflowLocale;
  readonly status: LocaleWorkflowStatus;
  readonly artifact?: ArtifactLineage;
  readonly fallbackUsed: boolean;
  readonly provenance: "generated" | "localized-fallback" | "none";
  readonly failure?: StageFailure;
}

function workflowFailure(
  category: FailureCategory,
  message: string,
  sourceFailure?: StageFailure
): StageFailure {
  return {
    schemaVersion: stageFailureSchemaVersion,
    category,
    retryability: "retry-after-change",
    message,
    occurredAt: new Date().toISOString(),
    ...(sourceFailure ? { causeStageId: sourceFailure.causeStageId } : {}),
  };
}

function sameHashScope(actual: readonly string[], expected: string): boolean {
  return actual.length === 1 && actual[0] === expected;
}

function isExactArtifact(artifact: ArtifactLineage, locale: WorkflowLocale, variant: "full" | "short", fingerprint: string): boolean {
  return artifact.locale === locale && artifact.format === variant && artifact.fingerprint === fingerprint && /^[a-f0-9]{64}$/u.test(fingerprint);
}

function selectedArtifact(input: LocaleWorkflowInput): { artifact: ArtifactLineage | undefined; fallback: boolean } {
  const variant = input.variant ?? "full";
  if (input.generatedArtifact && isExactArtifact(input.generatedArtifact, input.locale, variant, input.generatedArtifact.fingerprint)) {
    return { artifact: input.generatedArtifact, fallback: false };
  }
  const fallback = input.fallbackCandidates?.find((candidate) =>
    candidate.canonicalFingerprint === input.canonicalFingerprint && candidate.qualityPassed &&
    isExactArtifact(candidate.artifact, input.locale, variant, candidate.artifact.fingerprint));
  return { artifact: fallback?.artifact, fallback: Boolean(fallback) };
}

function strategicEvidenceCurrent(args: {
  readonly input: StrategicItalianLocaleWorkflowInput;
  readonly gate: "canonical-script" | "localization";
  readonly locale: WorkflowLocale;
  readonly variant: "full" | "short";
  readonly inputHash: string;
  readonly outputHash: string;
  readonly canonicalInput?: readonly string[];
}): boolean {
  const parsedApprovals: ApprovalRecord[] = [];
  for (const value of args.input.approvalLedger) {
    const parsed = approvalRecordSchema.safeParse(value);
    if (!parsed.success) return false;
    parsedApprovals.push(parsed.data);
  }
  const parsedEvents: WorkflowEvent[] = [];
  for (const value of args.input.workflowEvents) {
    const parsed = workflowEventSchema.safeParse(value);
    if (!parsed.success) return false;
    parsedEvents.push(parsed.data);
  }
  const now = Date.now();
  let previous = -Infinity;
  for (const event of parsedEvents) {
    const time = Date.parse(event.occurredAt);
    if (!Number.isFinite(time) || time > now || time <= previous) return false;
    previous = time;
  }
  const blueprint = episodeBlueprintSchema.safeParse(args.input.episodeBlueprint);
  if (!blueprint.success || blueprint.data.canonicalLocale !== "it" || (args.input.contentProfileId !== undefined && args.input.contentProfileId !== "strategic-reinvention") || (args.input.creatorProfileId !== undefined && args.input.creatorProfileId !== blueprint.data.creatorProfileId)) return false;
  const taskKey = args.gate === "canonical-script" ? (args.variant === "full" ? "canonicalFull" : "canonicalShort") : args.variant === "full" ? "localizationFull" : "localizationShort";
  const definition = taskDefinitionSchema.safeParse(args.input.taskDefinitions[taskKey]);
  if (!definition.success || !definition.data.policies.approvalRequired || definition.data.policies.approval?.gate !== args.gate) return false;
  const taskId = definition.data.id;
  const expectedInput = [...(args.canonicalInput ?? [args.inputHash])].sort();
  if (!expectedInput.length || new Set(expectedInput).size !== expectedInput.length || expectedInput.some((hash) => !/^[a-f0-9]{64}$/u.test(hash))) return false;
  const relevant = parsedApprovals.filter((record) =>
    record.profileId === "strategic-reinvention" && record.workflowInstanceId === args.input.workflowInstanceId &&
    record.taskId === taskId && record.unitId === args.input.unitId && record.boundRevision === args.input.workflowRevision &&
    record.locale === args.locale && record.variant === args.variant && record.scope?.gate === args.gate &&
    record.scope.locale === args.locale && record.scope.variant === args.variant &&
    record.scope.inputArtifactHashes.length === expectedInput.length && [...record.scope.inputArtifactHashes].sort().every((hash, index) => hash === expectedInput[index]) && sameHashScope(record.scope.outputArtifactHashes, args.outputHash));
  const pairIndex = new Map<string, number>();
  for (const record of relevant) {
    const eventIndex = parsedEvents.findIndex((event) => {
      if (event.eventType !== "approval-recorded") return false;
      return event.approvalId === record.id && event.workflowInstanceId === record.workflowInstanceId &&
        event.taskId === record.taskId && event.decision === record.decision && event.actor === record.actor &&
        event.gate === record.scope?.gate && event.locale === record.locale && event.variant === record.variant &&
        event.supersedesApprovalId === record.supersedesApprovalId && Date.parse(event.occurredAt) >= Date.parse(record.createdAt);
    });
    if (eventIndex < 0) return false;
    pairIndex.set(record.id, eventIndex);
  }
  const approved = relevant.filter((record) => record.decision === "approved" && (!record.expiresAt || Date.parse(record.expiresAt) > now));
  const active = approved.filter((record) => !relevant.some((later) => {
    const laterIndex = pairIndex.get(later.id) ?? -1;
    const recordIndex = pairIndex.get(record.id) ?? Infinity;
    return laterIndex > recordIndex && (later.decision === "rejected" || later.decision === "revoked") &&
      (later.supersedesApprovalId === record.id || (later.scope?.gate === record.scope?.gate && later.scope?.locale === record.scope?.locale && later.scope?.variant === record.scope?.variant && sameHashScope(later.scope?.inputArtifactHashes ?? [], args.inputHash) && sameHashScope(later.scope?.outputArtifactHashes ?? [], args.outputHash)));
  }));
  const requiredActors = Math.max(definition.data.policies.approval.requiredDistinctActors, definition.data.policies.approval.highRisk ? 2 : 1);
  return active.length > 0 && new Set(active.map((record) => record.actor)).size >= requiredActors;
}

export function resolveLocaleWorkflowBranch(
  input: LocaleWorkflowInput
): LocaleWorkflowResult {
  const selected = selectedArtifact(input);
  if (input.route !== "strategic-italian" && input.contentProfileId === "strategic-reinvention") {
    return { locale: input.locale, status: "blocked", fallbackUsed: false, provenance: "none", failure: workflowFailure("policy-blocked", "Strategic Reinvention must use the strategic Italian route.") };
  }
  if (input.route === "strategic-italian") {
    const variant = input.variant ?? "full";
    const canonical = input.italianCanonicalArtifact;
    if (input.locale === "it" && variant === "full" && (!input.generatedArtifact || input.generatedArtifact.artifactId !== canonical.artifactId || input.generatedArtifact.fingerprint !== canonical.fingerprint || selected.fallback)) return { locale: input.locale, status: "blocked", fallbackUsed: false, provenance: "none", failure: workflowFailure("policy-blocked", "Italian release must use the exact approved canonical artifact.") };
    if (!isExactArtifact(canonical, "it", "full", input.canonicalFingerprint) || !strategicEvidenceCurrent({ input, gate: "canonical-script", locale: "it", variant: "full", inputHash: canonical.fingerprint, outputHash: canonical.fingerprint, canonicalInput: input.canonicalInputHashes })) {
      return {
        locale: input.locale, status: "blocked", fallbackUsed: false, provenance: "none", failure: workflowFailure("policy-blocked", "Italian canonical artifact lacks current scoped approval."),
      };
    }
    const parents = variant === "short" ? [canonical.fingerprint, input.locale === "it" ? canonical.fingerprint : ""] : [canonical.fingerprint];
    const gate = input.locale === "it" ? "canonical-script" : "localization";
    const shortLocaleFull = input.selectedParentFingerprints?.find((hash) => hash !== canonical.fingerprint) ?? "";
    const releaseInput = variant === "short" ? (input.locale === "it" ? canonical.fingerprint : shortLocaleFull) : canonical.fingerprint;
    const evidence = variant === "short" ? strategicEvidenceCurrent({ input, gate, locale: input.locale, variant, inputHash: releaseInput, outputHash: selected.artifact?.fingerprint ?? "", canonicalInput: parents.filter(Boolean) }) : strategicEvidenceCurrent({ input, gate, locale: input.locale, variant, inputHash: releaseInput, outputHash: selected.artifact?.fingerprint ?? "" });
    if (!(input.locale === "it" && variant === "full") && (!selected.artifact || !evidence)) return { locale: input.locale, status: "blocked", fallbackUsed: false, provenance: "none", failure: workflowFailure("policy-blocked", `Italian-parent release approval is missing for ${input.locale}/${variant}.`) };
  }
  if (selected.artifact && !selected.fallback) {
    return {
      locale: input.locale,
      status: "accepted",
      artifact: selected.artifact,
      fallbackUsed: false,
      provenance: "generated",
    };
  }

  if (selected.artifact && selected.fallback) {
    return {
      locale: input.locale,
      status: "fallback-accepted",
      artifact: {
        ...selected.artifact,
        provenance: "localized-fallback",
      },
      fallbackUsed: true,
      provenance: "localized-fallback",
      ...(input.generationFailure ? { failure: input.generationFailure } : {}),
    };
  }

  return {
    locale: input.locale,
    status: "blocked",
    fallbackUsed: false,
    provenance: "none",
    failure:
      input.generationFailure ??
      workflowFailure(
        "locale-fallback-rejected",
        `No accepted same-locale fallback was available for ${input.locale}.`
      ),
  };
}

export function localeFailureBlocksOnlyLocale(
  results: readonly LocaleWorkflowResult[],
  locale: WorkflowLocale
): boolean {
  return results
    .filter((result) => result.locale !== locale)
    .every((result) => result.status !== "blocked");
}

export interface LocaleWorkflowStageContext {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly stageId?: StageId;
  readonly store?: StoryWorkflowManifestStore;
}

export interface LocaleWorkflowStageResult {
  readonly manifest: WorkflowManifest<ArtifactLineage>;
  readonly outcome: StageOutcome<ArtifactLineage>;
}

function emptyCost(): CostMetrics {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostMicros: null,
    actualCostMicros: null,
  };
}

function defaultCache(): CacheMetadata {
  return {
    status: "miss",
    invalidationReasons: [],
  };
}

function resolveStage(
  manifest: WorkflowManifest<ArtifactLineage>,
  stageId: StageId
) {
  const stage = manifest.stages.find((entry) => entry.stageId === stageId);
  if (!stage) {
    throw new Error(`Workflow stage not found: ${stageId}`);
  }
  return stage;
}

export async function executeLocaleWorkflowStage(args: {
  readonly context: LocaleWorkflowStageContext;
  readonly result: LocaleWorkflowResult;
}): Promise<LocaleWorkflowStageResult> {
  const stageId =
    args.context.stageId ??
    (`stage:localize-full:${args.result.locale}:full` as StageId);
  const stage = resolveStage(args.context.manifest, stageId);
  if (
    (stage.status === "succeeded" || stage.status === "blocked") &&
    stage.latestOutcome
  ) {
    return {
      manifest: args.context.manifest,
      outcome: stage.latestOutcome,
    };
  }

  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();
  const baseOutcome = {
    schemaVersion: stageOutcomeSchemaVersion,
    stageId: stage.stageId,
    executionId: args.context.manifest.executionId,
    fingerprintInputs: stage.fingerprintInputs,
    cache: stage.cache ?? defaultCache(),
    warnings:
      args.result.status === "fallback-accepted"
        ? [
            {
              code: "locale-fallback-accepted",
              message: `Accepted ${args.result.locale} fallback for localized full branch.`,
              emittedAt: completedAt,
              details: {
                locale: args.result.locale,
              },
            },
          ]
        : [],
    cost: emptyCost(),
    startedAt,
    completedAt,
    observability: {
      attemptNumber: args.context.manifest.attemptHistory.length + 1,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    },
  } as const;
  const outcome: StageOutcome<ArtifactLineage> =
    args.result.artifact &&
    (args.result.status === "accepted" ||
      args.result.status === "fallback-accepted")
      ? {
          ...baseOutcome,
          status: "succeeded",
          artifact: args.result.artifact,
          provenance: args.result.artifact.provenance,
        }
      : {
          ...baseOutcome,
          status: "blocked",
          failure:
            args.result.failure ??
            workflowFailure(
              "locale-fallback-rejected",
              `Localized full branch blocked for ${args.result.locale}.`
            ),
        };
  const manifest = args.context.store
    ? await args.context.store.appendOutcome({
        workflowId: args.context.manifest.workflowId,
        outcome,
      })
    : appendStageOutcome(args.context.manifest, outcome);
  return { manifest, outcome };
}
