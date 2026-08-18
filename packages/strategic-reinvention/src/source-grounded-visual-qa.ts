import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  VERONICA_RESOLVED_VISUAL_MECHANISMS,
  VERONICA_VISUAL_MECHANISM_ACTION_OWNER,
  type GeneratedVisualAsset,
  type PlannedScene,
  type PositioningVisualPlanV2,
  type VeronicaSemanticProposition,
  type VisualBeatTreatmentV1,
} from "./positioning-visual-contracts.js";
import { stableHash } from "./positioning-visual-semantics.js";
import {
  classifyVeronicaSemanticPolarity,
  resolveVeronicaVisiblePrimaryActionOwner,
} from "./veronica-semantic-quality.js";
import {
  globalSourceGroundedQaScheduler,
  SourceGroundedQaBudgetError,
  SourceGroundedQaTransportError,
  sourceGroundedQaExecutionPolicy,
  type OpenAiRateLimitSnapshot,
  type SourceGroundedQaExecutionPolicy,
  type SourceGroundedQaProviderReservation,
  type SourceGroundedQaScheduler,
  type SourceGroundedQaWorkTelemetry,
} from "./source-grounded-qa-scheduler.js";

export const SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION =
  "veronica-source-grounded-scene-judgement.v1" as const;
export const SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION =
  "veronica-source-grounded-scene-judge-instructions.v3" as const;
export const SOURCE_GROUNDED_BEAT_JUDGE_SCHEMA_VERSION =
  "veronica-source-grounded-visual-beat-judgement.v1" as const;
export const SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION =
  "veronica-source-grounded-visual-beat-judge-instructions.v1" as const;
export const SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION =
  "veronica-source-grounded-remediation-directive.v3" as const;
export const SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION =
  "veronica-source-grounded-remediation-advisor-instructions.v4" as const;
export const SOURCE_GROUNDED_SEQUENCE_SCHEMA_VERSION =
  "veronica-source-grounded-sequence-judgement.v1" as const;
export const SOURCE_GROUNDED_SEQUENCE_INSTRUCTION_VERSION =
  "veronica-source-grounded-sequence-judge-instructions.v3" as const;
export const SOURCE_GROUNDED_SEQUENCE_POLICY_VERSION =
  "veronica-source-grounded-sequence-policy.v2" as const;
export const SOURCE_GROUNDED_CONTROLLER_VERSION =
  "veronica-source-grounded-visual-qa-controller.v2" as const;
export const SOURCE_GROUNDED_QA_ADMISSION_VERSION =
  "veronica-source-grounded-qa-admission.v1" as const;

const admissionHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const sourceGroundedQaAdmissionIdentitySchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_GROUNDED_QA_ADMISSION_VERSION),
  sourceSha256: admissionHashSchema,
  selectedAudioSha256: admissionHashSchema,
  canonicalTimingSha256: admissionHashSchema,
  semanticPlanFileSha256: admissionHashSchema,
  semanticPlanHash: admissionHashSchema,
  beatPlanHash: admissionHashSchema,
  providerPromptArtifactSha256: admissionHashSchema,
  providerPromptProjectionHash: admissionHashSchema,
  providerPromptSchemaVersion: z.string().min(1),
  providerPromptCompilerVersion: z.string().min(1),
  plannerVersion: z.string().min(1),
  plannerConfigurationHash: admissionHashSchema,
  deterministicGateVersion: z.string().min(1),
  qaRevisionId: admissionHashSchema,
  identityHash: admissionHashSchema,
});
export type SourceGroundedQaAdmissionIdentity = z.infer<
  typeof sourceGroundedQaAdmissionIdentitySchema
>;

export class SourceGroundedQaAdmissionError extends Error {
  readonly code:
    | "VERONICA_QA_ADMISSION_PRECONDITION_FAILED"
    | "VERONICA_QA_ADMISSION_IDENTITY_MISMATCH";

  constructor(
    code: SourceGroundedQaAdmissionError["code"],
    message: string
  ) {
    super(`${code}:${message}`);
    this.name = "SourceGroundedQaAdmissionError";
    this.code = code;
  }
}

export const SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTIONS = `The original narration beat is authoritative. Every derived semantic structure, state, treatment, provider prompt, and prior automated PASS may be wrong.
Judge whether the exact final scene specification preserves the narration's meaning and whether the exact provider prompt is likely to render that meaning. When visualBeatCoverage is present, it is the ordered set of stills that renders this semantic scene: assess coverage across that set, and do not require one child still to depict information deliberately assigned to an adjacent child beat.
Do not reward verbosity, style, cinematography, or internal consistency when source semantics are wrong.
Identify who performs the narrated action. Preserve causal order. Distinguish seller/expert behavior from buyer/customer behavior; failure from desired state; current state from recommendation; and cause from consequence.
Detect actor or action-owner inversion, causal inversion, polarity inversion, state-role inversion, explicit source-domain loss, stale visual mechanisms, abstract nonvisual instructions, text dependency under text-free constraints, incompatible multi-state projection, and severe under-coverage.
One image must cover the actual beat. A narration-native metaphor is valid when it preserves the narrated relationship. Persistent protagonist identity and ordinary documentary camera grammar are not semantic defects.
Return REVIEW only for genuine uncertainty and BLOCK when generation is predictably unsafe. Never rewrite the provider prompt or produce canonical replacement semantics. expectedSourceSemantics is diagnostic guidance only.
Return typed fields first. Keep reason to 40 words or fewer. Do not reveal chain of thought.`;

export const SOURCE_GROUNDED_REMEDIATION_ADVISOR_INSTRUCTIONS = `Use the original narration as authority and the independent judgement as diagnosis.
Return a typed directive describing the earliest canonical boundary that must be rebuilt, the one resolved visualMechanism that directly embodies the corrected source relationship, required visible evidence and domain objects, forbidden misinterpretations, and source semantic constraints.
visualMechanism is authoritative canonical state, not a prose suggestion. Select it from the schema enum based on the narration and corrected semantics; never preserve a rejected or stale mechanism.
actionOwnerRole is also authoritative and must match the mechanism's visible action. Use buyer for website-first-impression, market-problem-solution-chain, recognition-accumulation, claim-to-proof, signal-coherence, audience-fit-signal, and peer-referral. Use expert for problem-first-sequence, identity-bridge, relevant-context-participation, work-expertise-separation, and customer-context-interpretation.
Do not write a provider prompt, do not mutate any supplied artifact, and do not create a parallel canonical generation path. The canonical pipeline will apply this directive, invalidate dependants, rebuild, and submit the result to the independent judge again.
Keep reason to 40 words or fewer. Do not reveal chain of thought.`;

export const SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTIONS = `The source narration and its parent semantic scene are authoritative. Judge exactly one child visual beat and its exact provider prompt independently; a parent-scene PASS is context, never authorization.
Classify the beat as SUPPORTED_LITERAL, SUPPORTED_MATERIALIZATION, UNSUPPORTED_INFERENCE, or CONTRADICTORY. A conservative physical depiction may materialize an abstract source proposition, but it must not invent a new causal claim, outcome, actor action, prestige signal, customer result, or emotional conclusion.
Verify coreMeaning, newInformation, actor/action ownership, causal direction, polarity, state, visual mechanism, distinction from adjacent beats, prompt fidelity, and renderability. The provider semantic compiler PASS only proves projection fidelity; it does not prove source support.
Return REVIEW only for genuine uncertainty, BLOCK for unsupported or contradictory new-image beats, and PASS only when every fail-closed field passes with no defect codes. Keep reason to 40 words or fewer. Do not reveal chain of thought.`;

export const SOURCE_GROUNDED_SEQUENCE_JUDGE_INSTRUCTIONS = `Evaluate the ordered compact visual-unit summaries as the rendered viewing sequence grounded in their parent narration theses. When visualBeatId is present, judge the ordered beat sequence rather than collapsing it to parent scenes.
Detect adjacent duplication, generic-template repetition, environment/action/composition monotony, low information gain, broken continuity, motif leakage, and insufficient visual escalation.
Distinguish intentional protagonist continuity, healthy motif reuse, narration-native metaphor reuse, and ordinary documentary camera grammar from harmful repetition. Do not block for protagonist or camera-family reuse alone.
Return compact structured findings and target only the scenes and visual boundaries that need remediation. Keep every reason to 40 words or fewer. Do not reveal chain of thought.`;

/** Converts Zod's ordinary optional properties to OpenAI strict-schema nullables. */
function openAiStrictStructuredOutputSchema(schema: unknown): unknown {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const output = Object.fromEntries(
      Object.entries(record).map(([key, child]) => [key, visit(child)])
    ) as Record<string, unknown>;
    const properties = record["properties"];
    if (
      properties &&
      typeof properties === "object" &&
      !Array.isArray(properties)
    ) {
      const originalRequired = new Set(
        Array.isArray(record["required"])
          ? record["required"].filter(
              (entry): entry is string => typeof entry === "string"
            )
          : []
      );
      const strictProperties = Object.fromEntries(
        Object.entries(properties as Record<string, unknown>).map(
          ([key, child]) => {
            const visited = visit(child);
            return [
              key,
              originalRequired.has(key)
                ? visited
                : { anyOf: [visited, { type: "null" }] },
            ];
          }
        )
      );
      output["properties"] = strictProperties;
      output["required"] = Object.keys(strictProperties);
      output["additionalProperties"] = false;
    }
    return output;
  };
  return visit(schema);
}

function stripStructuredOutputNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripStructuredOutputNulls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, stripStructuredOutputNulls(child)])
  );
}

const verdictSchema = z.enum(["PASS", "REVIEW", "BLOCK", "UNAVAILABLE"]);
const defectCodeSchema = z.enum([
  "ACTOR_INVERSION",
  "ACTION_OWNER_INVERSION",
  "CAUSAL_INVERSION",
  "POLARITY_INVERSION",
  "STATE_ROLE_INVERSION",
  "SEMANTIC_DRIFT",
  "STALE_VISUAL_MECHANISM",
  "SOURCE_DOMAIN_LOST",
  "ABSTRACT_UNRENDERABLE_STATE",
  "TEXT_DEPENDENCY_CONFLICT",
  "INCOMPATIBLE_MULTI_STATE",
  "SEVERE_UNDER_COVERAGE",
  "OTHER_SOURCE_FIDELITY_FAILURE",
]);
const faultBoundarySchema = z.enum([
  "SEMANTIC_EXTRACTION",
  "STATE_MODEL",
  "VISUAL_MECHANISM",
  "TREATMENT",
  "SEGMENTATION",
  "PROVIDER_PROJECTION",
  "UNKNOWN",
]);
const remediationRouteSchema = z.enum([
  "NONE",
  "REBUILD_SEMANTICS",
  "REBUILD_STATE_MODEL",
  "REBUILD_VISUAL_MECHANISM",
  "REBUILD_TREATMENT",
  "RESEGMENT",
  "REPROJECT_PROVIDER_PROMPT",
  "HUMAN_REVIEW",
]);

export const sourceGroundedSceneJudgementSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION),
  sourceFidelity: z.enum(["PASS", "UNCERTAIN", "FAIL"]),
  actorCorrect: z.boolean(),
  actionOwnerCorrect: z.boolean(),
  causalDirectionCorrect: z.boolean(),
  polarityCorrect: z.boolean(),
  stateRolesCorrect: z.boolean(),
  visualMechanismGrounded: z.boolean(),
  providerPromptDepictsNarration: z.boolean(),
  renderableUnderConstraints: z.boolean(),
  informationCoverage: z.enum([
    "SUFFICIENT",
    "PARTIAL",
    "SEVERELY_UNDER_COVERED",
  ]),
  verdict: verdictSchema,
  defectCodes: z.array(defectCodeSchema),
  earliestFaultBoundary: faultBoundarySchema,
  remediationRoute: remediationRouteSchema,
  expectedSourceSemantics: z
    .strictObject({
      actorRole: z.string().min(1).optional(),
      actionOwner: z.string().min(1).optional(),
      causalDirection: z.string().min(1).optional(),
      polarity: z.string().min(1).optional(),
      requiredDomainObjects: z.array(z.string().min(1)).optional(),
      requiredVisibleEvidence: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  reason: z.string().min(1).max(320),
});
export const sourceGroundedSceneJudgementJsonSchema =
  openAiStrictStructuredOutputSchema(
    z.toJSONSchema(sourceGroundedSceneJudgementSchema)
  );
export type SourceGroundedVerdict = z.infer<typeof verdictSchema>;
export type SemanticDefectCode = z.infer<typeof defectCodeSchema>;
export type SemanticFaultBoundary = z.infer<typeof faultBoundarySchema>;
export type RemediationRoute = z.infer<typeof remediationRouteSchema>;
export type SourceGroundedSceneJudgement = z.infer<
  typeof sourceGroundedSceneJudgementSchema
>;

const beatSourceSupportSchema = z.enum([
  "SUPPORTED_LITERAL",
  "SUPPORTED_MATERIALIZATION",
  "UNSUPPORTED_INFERENCE",
  "CONTRADICTORY",
]);
const beatDefectCodeSchema = z.enum([
  "CORE_MEANING_UNGROUNDED",
  "NEW_INFORMATION_UNSUPPORTED",
  "UNSUPPORTED_CAUSAL_CLAIM",
  "ACTOR_INVERSION",
  "ACTION_OWNER_INVERSION",
  "POLARITY_INVERSION",
  "UNSUPPORTED_OUTCOME",
  "VISUAL_MECHANISM_UNGROUNDED",
  "ADJACENT_BEAT_REDUNDANCY",
  "PROVIDER_PROMPT_BEAT_MISMATCH",
  "UNRENDERABLE_UNDER_CONSTRAINTS",
  "OTHER_BEAT_FIDELITY_FAILURE",
]);

export const sourceGroundedVisualBeatJudgementSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_GROUNDED_BEAT_JUDGE_SCHEMA_VERSION),
  sourceFidelity: z.enum(["PASS", "UNCERTAIN", "FAIL"]),
  sourceSupport: beatSourceSupportSchema,
  coreMeaningGrounded: z.boolean(),
  newInformationGrounded: z.boolean(),
  actorCorrect: z.boolean(),
  actionOwnerCorrect: z.boolean(),
  causalDirectionCorrect: z.boolean(),
  polarityCorrect: z.boolean(),
  stateRolesCorrect: z.boolean(),
  visualMechanismGrounded: z.boolean(),
  distinctFromAdjacentBeat: z.boolean(),
  providerPromptDepictsBeat: z.boolean(),
  renderableUnderConstraints: z.boolean(),
  verdict: verdictSchema,
  defectCodes: z.array(beatDefectCodeSchema),
  reason: z.string().min(1).max(320),
});
export const sourceGroundedVisualBeatJudgementJsonSchema =
  openAiStrictStructuredOutputSchema(
    z.toJSONSchema(sourceGroundedVisualBeatJudgementSchema)
  );
export type SourceGroundedVisualBeatJudgement = z.infer<
  typeof sourceGroundedVisualBeatJudgementSchema
>;
export type SourceGroundedVisualBeatDefectCode = z.infer<
  typeof beatDefectCodeSchema
>;

const transitionTypeSchema = z.enum([
  "NEW_CAUSAL_PROPOSITION",
  "ACTOR_CHANGE",
  "POLARITY_CHANGE",
  "FAILURE_TO_RECOMMENDATION",
  "EXPLANATION_TO_EXERCISE",
  "NEW_EXAMPLE",
  "NEW_PROCEDURE_STEP",
  "VISUAL_MECHANISM_CHANGE",
]);

export const semanticRemediationDirectiveSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION),
  repairBoundary: faultBoundarySchema.exclude(["UNKNOWN"]),
  visualMechanism: z.enum(VERONICA_RESOLVED_VISUAL_MECHANISMS),
  actionOwnerRole: z.enum(["expert", "buyer", "business-operator"]),
  sourceSemantics: z.strictObject({
    actorRole: z.string().min(1).optional(),
    actionOwner: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
    causalDirection: z.string().min(1).optional(),
    polarity: z.string().min(1).optional(),
    consequence: z.string().min(1).optional(),
  }),
  requiredVisibleEvidence: z.array(z.string().min(1)).max(12),
  requiredDomainObjects: z.array(z.string().min(1)).max(12),
  forbiddenMisinterpretations: z.array(z.string().min(1)).max(12),
  stateModel: z
    .strictObject({
      relation: z.string().min(1).optional(),
      initialState: z.string().min(1).optional(),
      failureState: z.string().min(1).optional(),
      desiredState: z.string().min(1).optional(),
      outcomeState: z.string().min(1).optional(),
    })
    .optional(),
  segmentation: z
    .strictObject({
      splitRequired: z.boolean(),
      semanticTransitions: z.array(
        z.strictObject({
          transitionType: transitionTypeSchema,
          description: z.string().min(1),
        })
      ),
    })
    .optional(),
  reason: z.string().min(1).max(320),
});
export const semanticRemediationDirectiveJsonSchema =
  openAiStrictStructuredOutputSchema(
    z.toJSONSchema(semanticRemediationDirectiveSchema)
  );
export type SemanticRemediationDirective = z.infer<
  typeof semanticRemediationDirectiveSchema
>;

export function semanticRemediationDirectiveConsistencyReasons(
  directive: SemanticRemediationDirective
): readonly string[] {
  const expectedOwner =
    VERONICA_VISUAL_MECHANISM_ACTION_OWNER[directive.visualMechanism];
  return directive.actionOwnerRole === expectedOwner
    ? []
    : [
        `visualMechanism ${directive.visualMechanism} requires ${expectedOwner} action ownership, received ${directive.actionOwnerRole}`,
      ];
}

const sequenceDefectCodeSchema = z.enum([
  "ADJACENT_VISUAL_DUPLICATION",
  "GENERIC_TEMPLATE_REPETITION",
  "ENVIRONMENT_MONOTONY",
  "ACTION_MONOTONY",
  "COMPOSITION_MONOTONY",
  "LOW_INFORMATION_GAIN",
  "BROKEN_CONTINUITY",
  "MOTIF_LEAKAGE",
  "INSUFFICIENT_VISUAL_ESCALATION",
]);
export const episodeSequenceJudgementSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_GROUNDED_SEQUENCE_SCHEMA_VERSION),
  verdict: verdictSchema,
  defectCodes: z.array(sequenceDefectCodeSchema),
  repeatedGroups: z.array(
    z.strictObject({
      sceneIds: z.array(z.string().min(1)).min(2),
      type: sequenceDefectCodeSchema,
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      reason: z.string().min(1),
    })
  ),
  continuityProblems: z.array(
    z.strictObject({
      sceneIds: z.array(z.string().min(1)).min(1),
      reason: z.string().min(1),
    })
  ),
  remediationTargets: z.array(
    z.strictObject({
      sceneIds: z.array(z.string().min(1)).min(1),
      target: z.enum([
        "VISUAL_MECHANISM",
        "TREATMENT",
        "COMPOSITION",
        "ACTION",
        "ENVIRONMENT",
      ]),
      reason: z.string().min(1),
    })
  ),
  reason: z.string().min(1).max(320),
});
export const episodeSequenceJudgementJsonSchema =
  openAiStrictStructuredOutputSchema(
    z.toJSONSchema(episodeSequenceJudgementSchema)
  );
export type SequenceDefectCode = z.infer<typeof sequenceDefectCodeSchema>;
export type EpisodeSequenceJudgement = z.infer<
  typeof episodeSequenceJudgementSchema
>;

export interface SourceGroundedSceneJudgementInput {
  readonly sceneId: string;
  readonly episodeId: string;
  readonly format: "SHORT" | "LONG_FORM";
  readonly narrationBeat: string;
  readonly semantic: {
    readonly visibleThesis?: string;
    readonly actorRole?: string;
    readonly actionOwner?: string;
    readonly action?: string;
    readonly consequence?: string;
    readonly polarity?: string;
    readonly visualMechanism?: VeronicaSemanticProposition["visualMechanism"];
    readonly requiredVisibleEvidence?: readonly string[];
    readonly forbiddenEvidence?: readonly string[];
  };
  readonly structuredState?: {
    readonly relation?: string;
    readonly initialState?: string;
    readonly failureState?: string;
    readonly desiredState?: string;
    readonly outcomeState?: string;
    readonly states?: readonly unknown[];
  };
  readonly treatment: {
    readonly environment?: string;
    readonly actor?: string;
    readonly action?: string;
    readonly props?: readonly string[];
    readonly composition?: string;
    readonly continuity?: string;
  };
  readonly providerPrompt: string;
  /**
   * A semantic scene may intentionally be rendered as several ordered stills.
   * Scene QA evaluates their combined coverage; child beat QA remains the
   * authority for whether each individual still is source-grounded.
   */
  readonly visualBeatCoverage?: readonly {
    readonly beatId: string;
    readonly coreMeaning: string;
    readonly newInformation: string;
    readonly visualThesis: string;
    readonly actorRelation?: VisualBeatTreatmentV1["actorRelation"];
    readonly providerPrompt: string;
  }[];
  readonly providerProjection?: {
    readonly treatmentPolarity: VeronicaSemanticProposition["polarity"];
    readonly promptPolarity: VeronicaSemanticProposition["polarity"];
    readonly actorRole: string;
    readonly promptActorRole?: string;
    readonly stateRelation?: string;
    readonly consequencePolarity?: VeronicaSemanticProposition["polarity"];
    readonly treatmentHash: string;
    readonly propositionHash: string | null;
    readonly materializationRevisionIds: readonly string[];
    readonly projectionRevisionIds: readonly string[];
  };
  readonly constraints: {
    readonly readableTextAllowed: boolean;
    readonly aspectRatio: string;
  };
}

export interface SourceGroundedVisualBeatJudgementInput
  extends SourceGroundedSceneJudgementInput {
  readonly beatId: string;
  readonly narrationEvidence: VisualBeatTreatmentV1["narrationRef"];
  readonly parentSemanticSceneHash: string;
  readonly parentTreatmentHash: string;
  readonly visualBeat: Pick<
    VisualBeatTreatmentV1,
    | "beatId"
    | "sceneId"
    | "role"
    | "coreMeaning"
    | "newInformation"
    | "viewerShouldUnderstand"
    | "visualThesis"
    | "subject"
    | "action"
    | "actorRelation"
    | "state"
    | "environment"
    | "composition"
    | "assetDecision"
    | "continuationOfPreviousBeat"
    | "beatHash"
  >;
  readonly adjacentBeats: {
    readonly previous: {
      readonly beatId: string;
      readonly newInformation: string;
      readonly visualThesis: string;
      readonly action: string;
      readonly environment: string;
    } | null;
    readonly next: {
      readonly beatId: string;
      readonly newInformation: string;
      readonly visualThesis: string;
      readonly action: string;
      readonly environment: string;
    } | null;
  };
  readonly providerSemanticQa: {
    readonly status: "PASS" | "BLOCKED" | "MISSING";
    readonly canonicalContractHash: string | null;
    readonly providerPromptHash: string;
  };
}

export interface EpisodeSequenceSceneSummary {
  readonly sceneId: string;
  readonly semanticSceneId?: string;
  readonly visualBeatId?: string;
  readonly narrationThesis: string;
  readonly visibleThesis?: string;
  readonly newInformation?: string;
  readonly environment?: string;
  readonly actor?: string;
  readonly action?: string;
  readonly dominantProps?: readonly string[];
  readonly composition?: string;
  readonly visualMechanism?: string;
  readonly motif?: string;
  readonly assetDecision?: VisualBeatTreatmentV1["assetDecision"];
  readonly providerPromptHash?: string;
  readonly sourceGroundedVerdict: "PASS" | "REVIEW" | "BLOCK";
}

export interface SourceGroundedModelTier {
  readonly model: string;
  readonly reasoningEffort:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh";
  readonly maxOutputTokens?: number;
}

export interface SourceGroundedVisualQaPolicy {
  readonly enabled: boolean;
  readonly policyIdentity: string;
  readonly sceneJudge: SourceGroundedModelTier;
  readonly escalation: SourceGroundedModelTier;
  readonly finalAdjudication?: SourceGroundedModelTier;
  /** Operational sequence-only output budget; excluded from semantic admission identity. */
  readonly finalSequenceAdjudication?: SourceGroundedModelTier;
  readonly remediationAdvisor: SourceGroundedModelTier;
  readonly sequenceJudge: SourceGroundedModelTier;
  readonly maxRemediationRounds: number;
  readonly remediateReview: boolean;
  /** Operational only: deliberately excluded from semantic cache identity. */
  readonly execution?: SourceGroundedQaExecutionPolicy;
}

export function unavailableSourceGroundedVisualQaPolicy(): SourceGroundedVisualQaPolicy {
  const unconfigured = {
    model: "unconfigured",
    reasoningEffort: "low" as const,
  };
  return {
    enabled: true,
    policyIdentity: "veronica-source-grounded-visual-qa-unconfigured.v1",
    sceneJudge: unconfigured,
    escalation: { ...unconfigured, reasoningEffort: "medium" },
    remediationAdvisor: { ...unconfigured, reasoningEffort: "medium" },
    sequenceJudge: unconfigured,
    maxRemediationRounds: 1,
    remediateReview: true,
  };
}

export interface SourceGroundedProviderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens?: number;
}

export interface SourceGroundedProviderResult {
  readonly output: unknown;
  readonly requestId?: string;
  readonly usage?: SourceGroundedProviderUsage;
  readonly rateLimit?: OpenAiRateLimitSnapshot;
}

export interface SourceGroundedBatchProviderResult {
  readonly outputs: readonly {
    readonly itemId: string;
    readonly output: unknown;
  }[];
  readonly requestId?: string;
  readonly usage?: SourceGroundedProviderUsage;
  readonly rateLimit?: OpenAiRateLimitSnapshot;
}

export interface AiRequestCachePolicy {
  readonly enabled: boolean;
  readonly key?: string;
  readonly stablePrefixVersion?: string;
}

interface SourceGroundedProviderOperationalInput {
  readonly cachePolicy: AiRequestCachePolicy;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly signal?: AbortSignal;
}

export interface SourceGroundedSceneJudgePort {
  judge(
    input: {
      readonly payload: SourceGroundedSceneJudgementInput;
      readonly model: SourceGroundedModelTier;
      readonly instructions: string;
      readonly instructionVersion: string;
      readonly jsonSchema: unknown;
    } & SourceGroundedProviderOperationalInput
  ): Promise<SourceGroundedProviderResult>;
  judgeBatch?(input: {
    readonly items: readonly {
      readonly itemId: string;
      readonly payload: SourceGroundedSceneJudgementInput;
    }[];
    readonly model: SourceGroundedModelTier;
    readonly instructions: string;
    readonly instructionVersion: string;
    readonly jsonSchema: unknown;
  } & SourceGroundedProviderOperationalInput): Promise<SourceGroundedBatchProviderResult>;
}

export interface SemanticRemediationAdvisorPort {
  advise(
    input: {
      readonly payload: SemanticRemediationAdvisorInput;
      readonly model: SourceGroundedModelTier;
      readonly instructions: string;
      readonly instructionVersion: string;
      readonly jsonSchema: unknown;
    } & SourceGroundedProviderOperationalInput
  ): Promise<SourceGroundedProviderResult>;
  adviseBatch?(input: {
    readonly items: readonly {
      readonly itemId: string;
      readonly payload: SemanticRemediationAdvisorInput;
    }[];
    readonly model: SourceGroundedModelTier;
    readonly instructions: string;
    readonly instructionVersion: string;
    readonly jsonSchema: unknown;
  } & SourceGroundedProviderOperationalInput): Promise<SourceGroundedBatchProviderResult>;
}

export interface EpisodeSequenceJudgePort {
  judgeSequence(
    input: {
      readonly episodeId: string;
      readonly scenes: readonly EpisodeSequenceSceneSummary[];
      readonly model: SourceGroundedModelTier;
      readonly instructions: string;
      readonly instructionVersion: string;
      readonly jsonSchema: unknown;
    } & SourceGroundedProviderOperationalInput
  ): Promise<SourceGroundedProviderResult>;
}

export interface SourceGroundedVisualQaCachePort {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
}

export interface SemanticRemediationAdvisorInput {
  readonly scene: SourceGroundedSceneJudgementInput;
  readonly judgement: SourceGroundedSceneJudgement;
  readonly constraints: SourceGroundedSceneJudgementInput["constraints"];
}

export interface SourceGroundedEvaluationProvenance {
  readonly component:
    | "SCENE_JUDGE_PRIMARY"
    | "SCENE_JUDGE_ESCALATION"
    | "SCENE_JUDGE_FINAL"
    | "BEAT_JUDGE_PRIMARY"
    | "BEAT_JUDGE_ESCALATION"
    | "BEAT_JUDGE_FINAL"
    | "REMEDIATION_ADVISOR"
    | "SEQUENCE_JUDGE"
    | "SEQUENCE_JUDGE_FINAL";
  readonly model: string;
  readonly reasoningEffort: string;
  readonly instructionVersion: string;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly timestamp: string;
  readonly cacheHit: boolean;
  readonly escalationStatus:
    | "NOT_ESCALATED"
    | "ESCALATED"
    | "FINAL_ADJUDICATION";
  readonly defectCodes: readonly string[];
  readonly verdict: SourceGroundedVerdict;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly revisionId: string;
  readonly executionProfile: SourceGroundedQaExecutionPolicy["profile"];
  readonly transport: SourceGroundedQaExecutionPolicy["transport"];
  readonly serviceTier?: SourceGroundedQaExecutionPolicy["serviceTier"];
  readonly queueWaitMs: number;
  readonly apiLatencyMs: number;
  readonly attemptCount: number;
  readonly retryCount: number;
  readonly rateLimitEvents: number;
  readonly throttleEvents: number;
  readonly effectiveConcurrency: number;
  readonly maxObservedConcurrency: number;
  readonly providerCall: boolean;
  readonly providerRequestCountContribution?: 0 | 1;
  readonly batchSize?: number;
  readonly singleFlightDeduplicated: boolean;
  readonly cacheCompatibility?: "EXACT" | "LEGACY_SEMANTIC_EQUIVALENT";
  readonly requestId?: string;
}

export interface QaRevision {
  readonly revisionId: string;
  readonly sourceNarrationHash: string;
  readonly semanticStateHash: string;
  readonly treatmentSetHash: string;
  readonly providerProjectionSetHash: string;
  readonly visualBeatSetHash: string;
  readonly beatSequenceHash: string;
  readonly timingHash: string;
  readonly policyHash: string;
}

export interface SourceGroundedQaProgress {
  readonly completed: number;
  readonly total: number;
  readonly cached: number;
  readonly api: number;
  readonly inFlight: number;
  readonly review: number;
  readonly transportFailures: number;
  readonly providerCallsReserved: number;
  readonly estimatedCostUsd: number;
  readonly budgetStatus: "CACHE_ONLY" | "WITHIN_BUDGET" | "EXHAUSTED";
}

export interface SourceGroundedSceneEvaluation {
  readonly sceneId: string;
  readonly judgement: SourceGroundedSceneJudgement;
  readonly escalationStatus: SourceGroundedEvaluationProvenance["escalationStatus"];
  readonly modelPolicyIdentity: string;
  readonly cacheHit: boolean;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly provenance: readonly SourceGroundedEvaluationProvenance[];
}

export interface SourceGroundedVisualBeatEvaluation {
  readonly beatId: string;
  readonly sceneId: string;
  readonly assetId: string;
  readonly judgement: SourceGroundedVisualBeatJudgement;
  readonly escalationStatus: SourceGroundedEvaluationProvenance["escalationStatus"];
  readonly modelPolicyIdentity: string;
  readonly cacheHit: boolean;
  readonly inputHash: string;
  readonly outputHash: string;
  readonly provenance: readonly SourceGroundedEvaluationProvenance[];
}

export interface SourceGroundedRemediationHistory {
  readonly sceneId: string;
  readonly regenerationRound: number;
  readonly originalJudgement: SourceGroundedSceneJudgement;
  readonly directive: SemanticRemediationDirective | null;
  readonly repairBoundary: SemanticFaultBoundary;
  readonly downstreamInvalidation: readonly string[];
  readonly postRemediationJudgement?: SourceGroundedSceneJudgement;
  readonly exhausted: boolean;
  readonly noSemanticChange?: boolean;
  readonly provenance: readonly SourceGroundedEvaluationProvenance[];
}

export interface SourceGroundedVisualQaAggregate {
  readonly scenePassCount: number;
  readonly sceneReviewCount: number;
  readonly sceneBlockCount: number;
  readonly sceneUnavailableCount: number;
  readonly scenesEscalated: number;
  readonly scenesRemediated: number;
  readonly beatPassCount: number;
  readonly beatReviewCount: number;
  readonly beatBlockCount: number;
  readonly beatUnavailableCount: number;
  readonly beatsEscalated: number;
  readonly beatsRemediated: number;
  readonly sequenceVerdict: SourceGroundedVerdict;
  readonly sequenceDefectCount: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly primaryApiCalls: number;
  readonly beatPrimaryApiCalls: number;
  readonly escalationApiCalls: number;
  readonly remediationApiCalls: number;
  readonly sequenceApiCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly totalWallClockMs: number;
  readonly queueWaitMs: number;
  readonly apiLatencyMs: number;
  readonly configuredConcurrency: number;
  readonly effectiveConcurrency: number;
  readonly maxObservedConcurrency: number;
  readonly throttleEvents: number;
  readonly rateLimitEvents: number;
  readonly retryCount: number;
  readonly singleFlightDeduplications: number;
  readonly advisorBypassCount: number;
  readonly noOpRemediationCount: number;
  readonly rejudgeRequestCount: number;
  readonly scenesRejudged: number;
  readonly providerCallsReserved: number;
  readonly estimatedCostUsd: number;
  readonly budgetStatus: "CACHE_ONLY" | "WITHIN_BUDGET" | "EXHAUSTED";
  readonly modelDistribution: Readonly<Record<string, number>>;
}

export interface SourceGroundedVisualQaResult {
  readonly schemaVersion: typeof SOURCE_GROUNDED_CONTROLLER_VERSION;
  readonly policyIdentity: string;
  /** Exact immutable artifact identity admitted by the canonical QA-only path. */
  readonly admissionIdentity?: SourceGroundedQaAdmissionIdentity;
  readonly revision: QaRevision;
  readonly scenes: readonly SourceGroundedSceneEvaluation[];
  readonly beats: readonly SourceGroundedVisualBeatEvaluation[];
  readonly remediatedBeatIds: readonly string[];
  readonly remediationHistory: readonly SourceGroundedRemediationHistory[];
  readonly sequence: EpisodeSequenceJudgement;
  readonly sequenceProvenance: readonly SourceGroundedEvaluationProvenance[];
  readonly sourceFidelityReady: boolean;
  readonly providerRequestsAllowed: false;
  readonly blockers: readonly (
    | "SOURCE_GROUNDED_SCENE_BLOCKED"
    | "SOURCE_GROUNDED_SCENE_REVIEW_REQUIRED"
    | "SOURCE_GROUNDED_SCENE_JUDGE_UNAVAILABLE"
    | "SOURCE_GROUNDED_BEAT_QA_REQUIRED"
    | "SOURCE_GROUNDED_BEAT_BLOCKED"
    | "SOURCE_GROUNDED_BEAT_REVIEW_REQUIRED"
    | "SOURCE_GROUNDED_BEAT_JUDGE_UNAVAILABLE"
    | "SOURCE_GROUNDED_BEAT_SEQUENCE_BLOCKED"
    | "SOURCE_GROUNDED_BEAT_SEQUENCE_REVIEW_REQUIRED"
    | "SOURCE_GROUNDED_BEAT_SEQUENCE_JUDGE_UNAVAILABLE"
    | "SOURCE_GROUNDED_SEQUENCE_BLOCKED"
    | "SOURCE_GROUNDED_SEQUENCE_REVIEW_REQUIRED"
    | "SOURCE_GROUNDED_SEQUENCE_JUDGE_UNAVAILABLE"
    | "SOURCE_GROUNDED_REMEDIATION_UNAVAILABLE"
    | "SOURCE_GROUNDED_REMEDIATION_EXHAUSTED"
    | "REMEDIATION_NO_SEMANTIC_CHANGE"
  )[];
  readonly aggregate: SourceGroundedVisualQaAggregate;
  readonly sourceGroundedQaExecution: {
    readonly profile: SourceGroundedQaExecutionPolicy["profile"];
    readonly transport: SourceGroundedQaExecutionPolicy["transport"];
    readonly serviceTier?: SourceGroundedQaExecutionPolicy["serviceTier"];
    readonly wallClockMs: number;
    readonly sceneCount: number;
    readonly beatCount: number;
    readonly cacheHits: number;
    readonly cacheMisses: number;
    readonly primaryCalls: number;
    readonly beatPrimaryCalls: number;
    readonly escalations: number;
    readonly advisorCalls: number;
    readonly sequenceCalls: number;
    readonly retries: number;
    readonly rateLimitEvents: number;
    readonly effectiveConcurrency: number;
    readonly inputTokens: number;
    readonly cachedInputTokens: number;
    readonly outputTokens: number;
    readonly advisorBypassCount: number;
    readonly noOpRemediationCount: number;
    readonly rejudgeRequests: number;
    readonly scenesRejudged: number;
    readonly providerCallsReserved: number;
    readonly estimatedCostUsd: number;
    readonly budgetStatus: "CACHE_ONLY" | "WITHIN_BUDGET" | "EXHAUSTED";
    readonly modelDistribution: Readonly<Record<string, number>>;
  };
  readonly resultHash: string;
}

interface CachedEvaluation<T> {
  readonly schemaVersion: "veronica-source-grounded-cache-record.v1";
  readonly value: T;
  readonly outputHash: string;
  readonly provenance: SourceGroundedEvaluationProvenance;
}

interface CachedOperationalFailure {
  readonly schemaVersion: "veronica-source-grounded-negative-cache.v1";
  readonly kind: "TRANSIENT" | "DETERMINISTIC_MALFORMED";
  readonly reason: string;
  readonly expiresAt: string;
}

export type SourceGroundedQaAvailability =
  | "AVAILABLE"
  | "UNAVAILABLE_BUDGET"
  | "UNAVAILABLE_PREREQUISITE"
  | "UNAVAILABLE_PROVIDER";

/** Classifies operational unavailability without recasting it as semantic failure. */
export function classifySourceGroundedQaAvailability(input: {
  readonly verdict: SourceGroundedVerdict;
  readonly reason: string;
}): SourceGroundedQaAvailability {
  if (input.verdict !== "UNAVAILABLE") return "AVAILABLE";
  if (/budget|ceiling|authorized maximum|reserved/i.test(input.reason)) return "UNAVAILABLE_BUDGET";
  if (/parent scene|prerequisite|scene QA/i.test(input.reason)) return "UNAVAILABLE_PREREQUISITE";
  return "UNAVAILABLE_PROVIDER";
}

function negativeCacheKey(identity: string): string {
  return stableHash({
    negativeCacheSchemaVersion: "veronica-source-grounded-negative-cache.v1",
    semanticIdentity: identity,
  });
}

async function activeNegativeCache(
  cache: SourceGroundedVisualQaCachePort,
  identity: string,
  execution?: SourceGroundedQaExecutionPolicy,
): Promise<CachedOperationalFailure | null> {
  const value = (await cache.get(
    negativeCacheKey(identity)
  )) as CachedOperationalFailure | null;
  if (
    value?.schemaVersion !== "veronica-source-grounded-negative-cache.v1" ||
    Date.parse(value.expiresAt) <= Date.now()
  ) {
    return null;
  }
  // A malformed structured response is not semantic evidence. Keep it for
  // cache-only runs, but an explicitly budgeted live retry must be able to
  // obtain a fresh strict-schema response without deleting the audit record.
  if (
    value.kind === "DETERMINISTIC_MALFORMED" &&
    execution?.providerMode === "LIVE_AUTHORIZED" &&
    execution.retryDeterministicMalformed
  ) {
    return null;
  }
  return value;
}

async function cacheOperationalFailure(input: {
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly identity: string;
  readonly kind: CachedOperationalFailure["kind"];
  readonly reason: string;
  readonly execution: SourceGroundedQaExecutionPolicy;
}): Promise<void> {
  const ttlMs =
    input.kind === "TRANSIENT"
      ? input.execution.transientFailureCacheTtlMs
      : input.execution.deterministicFailureCacheTtlMs;
  await input.cache.set(negativeCacheKey(input.identity), {
    schemaVersion: "veronica-source-grounded-negative-cache.v1",
    kind: input.kind,
    reason: input.reason,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  } satisfies CachedOperationalFailure);
}

function transientFailureKind(
  error: unknown
): CachedOperationalFailure["kind"] | null {
  if (error instanceof SourceGroundedQaBudgetError) return null;
  return error instanceof SourceGroundedQaTransportError && error.retryable
    ? "TRANSIENT"
    : null;
}

export class InMemorySourceGroundedVisualQaCache implements SourceGroundedVisualQaCachePort {
  readonly #values = new Map<string, unknown>();

  async get(key: string): Promise<unknown | null> {
    return this.#values.get(key) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.#values.set(key, value);
  }
}

export class FileSourceGroundedVisualQaCache implements SourceGroundedVisualQaCachePort {
  constructor(private readonly cacheDir: string) {}

  async get(key: string): Promise<unknown | null> {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.cacheDir, `${key}.json`), "utf8")
      ) as unknown;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const target = path.join(this.cacheDir, `${key}.json`);
    const temporary = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await fs.writeFile(
      temporary,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8"
    );
    await fs.rename(temporary, target);
  }
}

function unavailableScene(reason: string): SourceGroundedSceneJudgement {
  return {
    schemaVersion: SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION,
    sourceFidelity: "UNCERTAIN",
    actorCorrect: false,
    actionOwnerCorrect: false,
    causalDirectionCorrect: false,
    polarityCorrect: false,
    stateRolesCorrect: false,
    visualMechanismGrounded: false,
    providerPromptDepictsNarration: false,
    renderableUnderConstraints: false,
    informationCoverage: "PARTIAL",
    verdict: "UNAVAILABLE",
    defectCodes: ["OTHER_SOURCE_FIDELITY_FAILURE"],
    earliestFaultBoundary: "UNKNOWN",
    remediationRoute: "HUMAN_REVIEW",
    reason,
  };
}

function unavailableBeat(reason: string): SourceGroundedVisualBeatJudgement {
  return {
    schemaVersion: SOURCE_GROUNDED_BEAT_JUDGE_SCHEMA_VERSION,
    sourceFidelity: "UNCERTAIN",
    sourceSupport: "UNSUPPORTED_INFERENCE",
    coreMeaningGrounded: false,
    newInformationGrounded: false,
    actorCorrect: false,
    actionOwnerCorrect: false,
    causalDirectionCorrect: false,
    polarityCorrect: false,
    stateRolesCorrect: false,
    visualMechanismGrounded: false,
    distinctFromAdjacentBeat: false,
    providerPromptDepictsBeat: false,
    renderableUnderConstraints: false,
    verdict: "UNAVAILABLE",
    defectCodes: ["OTHER_BEAT_FIDELITY_FAILURE"],
    reason,
  };
}

function unavailableSequence(reason: string): EpisodeSequenceJudgement {
  return {
    schemaVersion: SOURCE_GROUNDED_SEQUENCE_SCHEMA_VERSION,
    verdict: "UNAVAILABLE",
    defectCodes: [],
    repeatedGroups: [],
    continuityProblems: [],
    remediationTargets: [],
    reason,
  };
}

export function sceneJudgementConsistencyReasons(
  value: SourceGroundedSceneJudgement
): readonly string[] {
  const failClosedFields = [
    ["sourceFidelity", value.sourceFidelity === "PASS"],
    ["actorCorrect", value.actorCorrect],
    ["actionOwnerCorrect", value.actionOwnerCorrect],
    ["causalDirectionCorrect", value.causalDirectionCorrect],
    ["polarityCorrect", value.polarityCorrect],
    ["stateRolesCorrect", value.stateRolesCorrect],
    ["providerPromptDepictsNarration", value.providerPromptDepictsNarration],
    ["renderableUnderConstraints", value.renderableUnderConstraints],
    [
      "informationCoverage",
      value.informationCoverage !== "SEVERELY_UNDER_COVERED",
    ],
  ] as const;
  const reasons: string[] = [];
  if (
    value.verdict === "PASS" &&
    failClosedFields.some(([, passing]) => !passing)
  ) {
    reasons.push(
      `PASS contradicts fail-closed fields: ${failClosedFields
        .filter(([, passing]) => !passing)
        .map(([name]) => name)
        .join(",")}`
    );
  }
  if (value.verdict === "PASS" && value.defectCodes.length > 0) {
    reasons.push("PASS includes defect codes");
  }
  if (value.verdict === "BLOCK" && value.defectCodes.length === 0) {
    reasons.push("BLOCK has no defect code");
  }
  if (
    value.informationCoverage === "SEVERELY_UNDER_COVERED" &&
    value.earliestFaultBoundary !== "SEGMENTATION"
  ) {
    reasons.push("severe under-coverage does not identify SEGMENTATION");
  }
  return reasons;
}

export function beatJudgementConsistencyReasons(
  value: SourceGroundedVisualBeatJudgement
): readonly string[] {
  const failClosedFields = [
    ["sourceFidelity", value.sourceFidelity === "PASS"],
    ["sourceSupport", value.sourceSupport === "SUPPORTED_LITERAL" || value.sourceSupport === "SUPPORTED_MATERIALIZATION"],
    ["coreMeaningGrounded", value.coreMeaningGrounded],
    ["newInformationGrounded", value.newInformationGrounded],
    ["actorCorrect", value.actorCorrect],
    ["actionOwnerCorrect", value.actionOwnerCorrect],
    ["causalDirectionCorrect", value.causalDirectionCorrect],
    ["polarityCorrect", value.polarityCorrect],
    ["stateRolesCorrect", value.stateRolesCorrect],
    ["visualMechanismGrounded", value.visualMechanismGrounded],
    ["distinctFromAdjacentBeat", value.distinctFromAdjacentBeat],
    ["providerPromptDepictsBeat", value.providerPromptDepictsBeat],
    ["renderableUnderConstraints", value.renderableUnderConstraints],
  ] as const;
  const reasons: string[] = [];
  if (value.verdict === "PASS" && failClosedFields.some(([, passing]) => !passing)) {
    reasons.push(`PASS contradicts fail-closed fields: ${failClosedFields.filter(([, passing]) => !passing).map(([name]) => name).join(",")}`);
  }
  if (value.verdict === "PASS" && value.defectCodes.length > 0) reasons.push("PASS includes defect codes");
  if (value.verdict === "BLOCK" && value.defectCodes.length === 0) reasons.push("BLOCK has no defect code");
  return reasons;
}

/** Preserve visual-beat order in a decomposed semantic scene. */
function orderedImageAssetsForScene(
  plan: PositioningVisualPlanV2,
  providerAssets: readonly GeneratedVisualAsset[],
): readonly GeneratedVisualAsset[] {
  const beatOrder = new Map(
    (plan.visualBeatPlan?.beats ?? [])
      .map((beat, index) => [beat.beatId, index] as const),
  );
  return [...providerAssets].sort((left, right) =>
    (beatOrder.get(left.visualBeatId ?? "") ?? Number.MAX_SAFE_INTEGER)
      - (beatOrder.get(right.visualBeatId ?? "") ?? Number.MAX_SAFE_INTEGER)
      || left.assetId.localeCompare(right.assetId),
  );
}

function inputForScene(
  plan: PositioningVisualPlanV2,
  scene: PlannedScene,
  providerAssets: readonly GeneratedVisualAsset[],
  narrationBeat: string
): SourceGroundedSceneJudgementInput {
  const proposition = scene.semanticProposition;
  const contrast = proposition?.contrast;
  const orderedAssets = orderedImageAssetsForScene(plan, providerAssets);
  const canonicalAsset = orderedAssets[0];
  if (!canonicalAsset) throw new Error(`SOURCE_GROUNDED_SCENE_PROVIDER_ASSET_MISSING:${scene.sceneId}`);
  const promptWithoutThesisAndConstraints = canonicalAsset.prompt
    .replace(/Visible thesis:[\s\S]*?(?=(?:No readable|Render this|$))/giu, "")
    .replace(/No readable[\s\S]*$/giu, "");
  const projectionProvenance = canonicalAsset.projectionProvenance ? [canonicalAsset.projectionProvenance] : [];
  const visibleOwner = resolveVeronicaVisiblePrimaryActionOwner(scene.treatment) ?? scene.treatment.actionOwnerRole ?? "unresolved";
  return {
    sceneId: scene.sceneId,
    episodeId: plan.contentId,
    format: plan.format === "short" ? "SHORT" : "LONG_FORM",
    narrationBeat,
    semantic: {
      visibleThesis: scene.visibleThesis,
      ...(proposition?.actorRole ? { actorRole: proposition.actorRole } : {}),
      ...(scene.treatment.actionOwnerRole
        ? { actionOwner: scene.treatment.actionOwnerRole }
        : {}),
      ...(proposition?.actorAction ? { action: proposition.actorAction } : {}),
      ...(proposition?.consequence
        ? { consequence: proposition.consequence }
        : {}),
      ...(proposition?.polarity ? { polarity: proposition.polarity } : {}),
      ...(proposition?.visualMechanism
        ? { visualMechanism: proposition.visualMechanism }
        : {}),
      requiredVisibleEvidence: canonicalAsset.promptCompilation?.input?.treatment.requiredEvidence
        ?? proposition?.evidenceAnchors
        ?? scene.treatment.props,
      forbiddenEvidence: canonicalAsset.promptCompilation?.input?.treatment.forbiddenEvidence
        ?? [],
    },
    structuredState: {
      ...(proposition?.stateRelation
        ? { relation: proposition.stateRelation }
        : {}),
      ...(contrast?.initialState
        ? { initialState: contrast.initialState }
        : {}),
      ...(contrast?.failureState
        ? { failureState: contrast.failureState }
        : {}),
      ...(contrast?.desiredState
        ? { desiredState: contrast.desiredState }
        : {}),
      ...((contrast?.consequence ?? proposition?.consequence)
        ? { outcomeState: contrast?.consequence ?? proposition!.consequence }
        : {}),
      states: [canonicalAsset.semanticPurpose],
    },
    treatment: {
      environment: scene.treatment.environment,
      actor: scene.treatment.subjectRequirement,
      action: scene.treatment.action,
      props: scene.treatment.props,
      composition: scene.treatment.composition,
      continuity: scene.continuityGroup ?? plan.continuity.mode,
    },
    providerPrompt: orderedAssets.length === 1
      ? canonicalAsset.prompt
      : orderedAssets.map((asset, index) =>
          `VISUAL BEAT ${index + 1} (${asset.visualBeatId ?? asset.assetId}):\n${asset.prompt}`,
        ).join("\n\n"),
    ...(orderedAssets.length > 1
      ? {
          visualBeatCoverage: orderedAssets.map((asset) => {
            const beat = plan.visualBeatPlan?.beats.find((candidate) => candidate.beatId === asset.visualBeatId);
            return {
              beatId: asset.visualBeatId ?? asset.assetId,
              coreMeaning: beat?.coreMeaning ?? asset.semanticPurpose,
              newInformation: beat?.newInformation ?? asset.semanticPurpose,
              visualThesis: beat?.visualThesis ?? scene.visibleThesis,
              ...(beat?.actorRelation ? { actorRelation: beat.actorRelation } : {}),
              providerPrompt: asset.prompt,
            };
          }),
        }
      : {}),
    providerProjection: {
      treatmentPolarity: classifyVeronicaSemanticPolarity(`${scene.treatment.composition} ${scene.treatment.action} ${scene.treatment.props.join(" ")}`),
      promptPolarity: projectionProvenance[0]?.projectedPolarity
        ?? classifyVeronicaSemanticPolarity(promptWithoutThesisAndConstraints),
      actorRole: visibleOwner,
      ...(projectionProvenance[0]?.projectedActorRole
        ? { promptActorRole: projectionProvenance[0].projectedActorRole }
        : ownerRole(promptWithoutThesisAndConstraints)
          ? { promptActorRole: ownerRole(promptWithoutThesisAndConstraints)! }
          : {}),
      ...(projectionProvenance[0]?.projectedStateRelation ? { stateRelation: projectionProvenance[0].projectedStateRelation } : {}),
      ...(projectionProvenance[0]?.projectedConsequencePolarity ? { consequencePolarity: projectionProvenance[0].projectedConsequencePolarity } : {}),
      treatmentHash: scene.treatment.treatmentHash,
      propositionHash: proposition?.propositionHash ?? null,
      materializationRevisionIds: projectionProvenance.map((entry) => entry.materializationRevisionId),
      projectionRevisionIds: projectionProvenance.map((entry) => entry.projectionRevisionId),
    },
    constraints: {
      readableTextAllowed: false,
      aspectRatio: plan.aspectRatio,
    },
  };
}

function adjacentBeatSummary(beat: VisualBeatTreatmentV1 | undefined) {
  return beat
    ? {
        beatId: beat.beatId,
        newInformation: beat.newInformation,
        visualThesis: beat.visualThesis,
        action: beat.action,
        environment: beat.environment,
      }
    : null;
}

function inputForBeat(
  plan: PositioningVisualPlanV2,
  scene: PlannedScene,
  beat: VisualBeatTreatmentV1,
  providerAsset: GeneratedVisualAsset,
  narrationBeat: string
): SourceGroundedVisualBeatJudgementInput {
  const base = inputForScene(plan, scene, [providerAsset], narrationBeat);
  const orderedBeats = plan.visualBeatPlan?.beats ?? [];
  const beatIndex = orderedBeats.findIndex((candidate) => candidate.beatId === beat.beatId);
  const providerSemanticQa = providerAsset.promptCompilation?.semanticQa;
  return {
    ...base,
    semantic: {
      ...base.semantic,
      visibleThesis: beat.visualThesis,
      ...(beat.actorRelation
        ? {
            actorRole: beat.actorRelation.outcomeActorRole,
            actionOwner: beat.actorRelation.causalActionOwnerRole,
            action: beat.actorRelation.causalAction,
            consequence: beat.actorRelation.outcomeAction,
          }
        : {}),
    },
    structuredState: {
      ...base.structuredState,
      states: [beat.state],
    },
    treatment: {
      ...base.treatment,
      environment: beat.environment,
      actor: beat.subject,
      action: beat.action,
      ...(beat.actorRelation ? { actorRelation: beat.actorRelation } : {}),
      composition: beat.composition.description,
    },
    beatId: beat.beatId,
    narrationEvidence: beat.narrationRef,
    parentSemanticSceneHash: stableHash({
      sceneId: scene.sceneId,
      narrationAnchor: scene.narrationAnchor,
      visibleThesis: scene.visibleThesis,
      semanticProposition: scene.semanticProposition ?? null,
    }),
    parentTreatmentHash: beat.parentTreatmentHash,
    visualBeat: {
      beatId: beat.beatId,
      sceneId: beat.sceneId,
      role: beat.role,
      coreMeaning: beat.coreMeaning,
      newInformation: beat.newInformation,
      viewerShouldUnderstand: beat.viewerShouldUnderstand,
      visualThesis: beat.visualThesis,
      subject: beat.subject,
      action: beat.action,
      state: beat.state,
      environment: beat.environment,
      composition: beat.composition,
      assetDecision: beat.assetDecision,
      continuationOfPreviousBeat: beat.continuationOfPreviousBeat,
      beatHash: beat.beatHash,
    },
    adjacentBeats: {
      previous: adjacentBeatSummary(orderedBeats[beatIndex - 1]),
      next: adjacentBeatSummary(orderedBeats[beatIndex + 1]),
    },
    providerSemanticQa: {
      status: providerSemanticQa?.status ?? "MISSING",
      canonicalContractHash: providerSemanticQa?.canonicalContractHash ?? null,
      providerPromptHash:
        providerSemanticQa?.providerPromptHash ?? stableHash(providerAsset.prompt),
    },
  };
}

function explicitPolarity(value: string | undefined): VeronicaSemanticProposition["polarity"] | undefined {
  const normalized = value?.trim().toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "POSITIVE_STATE" || normalized === "NEGATIVE_STATE" || normalized === "CONTRAST" || normalized === "TRANSITION_NEGATIVE_TO_POSITIVE" || normalized === "TRANSITION_POSITIVE_TO_NEGATIVE" || normalized === "NEUTRAL") return normalized;
  if (normalized && /FAIL|NEGATIVE|ADVERSE|LOSS/iu.test(normalized)) return "NEGATIVE_STATE";
  if (normalized && /SUCCESS|POSITIVE|DESIRED/iu.test(normalized)) return "POSITIVE_STATE";
  return undefined;
}

function isOpposingPolarity(
  expected: VeronicaSemanticProposition["polarity"] | undefined,
  actual: VeronicaSemanticProposition["polarity"] | undefined,
): boolean {
  return (expected === "NEGATIVE_STATE" && actual === "POSITIVE_STATE")
    || (expected === "POSITIVE_STATE" && actual === "NEGATIVE_STATE");
}

function ownerRole(value: string | undefined): "expert" | "buyer" | "business-operator" | undefined {
  if (!value) return undefined;
  if (/\b(?:business operator|operator|owner|seller)\b/iu.test(value)) return "business-operator";
  if (/\b(?:expert|professional|consultant)\b/iu.test(value)) return "expert";
  if (/\b(?:buyer|customer|client|prospect|audience|visitor|observer)\b/iu.test(value)) return "buyer";
  return undefined;
}

/** A model PASS cannot override an opposing structured final projection. */
export function sourceGroundedProjectionContradictionReasons(input: {
  readonly payload: SourceGroundedSceneJudgementInput;
  readonly judgement: SourceGroundedSceneJudgement;
}): readonly string[] {
  const expectedPolarity = explicitPolarity(input.judgement.expectedSourceSemantics?.polarity)
    ?? explicitPolarity(input.payload.semantic.polarity);
  const projection = input.payload.providerProjection;
  const expectedOwner = ownerRole(input.judgement.expectedSourceSemantics?.actionOwner)
    ?? ownerRole(input.payload.semantic.actionOwner)
    ?? ownerRole(input.payload.semantic.actorRole);
  const actualOwner = ownerRole(projection?.actorRole) ?? ownerRole(input.payload.treatment.action);
  const promptOwner = ownerRole(projection?.promptActorRole);
  const sourceConsequencePolarity = classifyVeronicaSemanticPolarity(
    input.payload.semantic.consequence ?? input.payload.structuredState?.outcomeState ?? "",
  );
  const requiredEvidence = input.judgement.expectedSourceSemantics?.requiredVisibleEvidence ?? [];
  const promptTokens = new Set(input.payload.providerPrompt.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  const entirelyMissingEvidence = requiredEvidence.length > 0 && requiredEvidence.every((requirement) => {
    const tokens = requirement.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
    return tokens.length > 0 && tokens.every((token) => !promptTokens.has(token));
  });
  return [
    ...(isOpposingPolarity(expectedPolarity, projection?.treatmentPolarity) ? ["final-treatment-opposes-source-polarity"] : []),
    ...(isOpposingPolarity(expectedPolarity, projection?.promptPolarity) ? ["provider-prompt-opposes-source-polarity"] : []),
    ...(expectedOwner && actualOwner && expectedOwner !== actualOwner ? ["provider-action-owner-opposes-source-owner"] : []),
    ...(expectedOwner && promptOwner && expectedOwner !== promptOwner ? ["provider-prompt-owner-opposes-source-owner"] : []),
    ...(isOpposingPolarity(sourceConsequencePolarity, projection?.consequencePolarity) ? ["provider-consequence-direction-opposes-source-consequence"] : []),
    ...(projection?.stateRelation && input.payload.structuredState?.relation && projection.stateRelation !== input.payload.structuredState.relation ? ["provider-state-relation-opposes-source-state"] : []),
    ...(entirelyMissingEvidence ? ["provider-projection-omits-all-required-visible-evidence"] : []),
  ];
}

function guardSourceGroundedPass(
  payload: SourceGroundedSceneJudgementInput,
  judgement: SourceGroundedSceneJudgement,
): SourceGroundedSceneJudgement {
  if (judgement.verdict !== "PASS") return judgement;
  const reasons = sourceGroundedProjectionContradictionReasons({ payload, judgement });
  if (reasons.length === 0) return judgement;
  const polarity = reasons.some((reason) => reason.includes("polarity") || reason.includes("consequence"));
  const actor = reasons.some((reason) => reason.includes("owner"));
  return {
    ...judgement,
    sourceFidelity: "UNCERTAIN",
    polarityCorrect: polarity ? false : judgement.polarityCorrect,
    actionOwnerCorrect: actor ? false : judgement.actionOwnerCorrect,
    providerPromptDepictsNarration: false,
    informationCoverage: reasons.includes("provider-projection-omits-all-required-visible-evidence") ? "PARTIAL" : judgement.informationCoverage,
    verdict: "REVIEW",
    defectCodes: [...new Set([
      ...judgement.defectCodes,
      ...(polarity ? ["POLARITY_INVERSION" as const] : []),
      ...(actor ? ["ACTION_OWNER_INVERSION" as const] : []),
      ...(!polarity && !actor ? ["OTHER_SOURCE_FIDELITY_FAILURE" as const] : []),
    ])],
    earliestFaultBoundary: "PROVIDER_PROJECTION",
    remediationRoute: "HUMAN_REVIEW",
    reason: `Deterministic provider-projection guard rejected model PASS: ${reasons.join(", ")}.`,
  };
}

export function sourceGroundedJudgementInputSemanticHash(
  payload: SourceGroundedSceneJudgementInput
): string {
  const { sceneId: _sceneId, episodeId: _episodeId, ...semanticInput } =
    payload;
  return stableHash(semanticInput);
}

export function buildSourceGroundedQaRevision(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly narrationByScene: readonly string[];
  readonly policy: SourceGroundedVisualQaPolicy;
}): QaRevision {
  const revisionWithoutId = {
    sourceNarrationHash: stableHash(input.narrationByScene),
    semanticStateHash: stableHash(
      input.plan.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        narrationAnchor: scene.narrationAnchor,
        visibleThesis: scene.visibleThesis,
        semanticProposition: scene.semanticProposition ?? null,
      }))
    ),
    treatmentSetHash: stableHash(
      input.plan.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        treatment: scene.treatment,
      }))
    ),
    providerProjectionSetHash: stableHash(
      input.plan.assets.map((asset) => ({
        sceneId: asset.sceneId,
        visualBeatId: asset.visualBeatId ?? null,
        visualBeatHash: asset.visualBeatHash ?? null,
        prompt: asset.prompt,
        semanticPurpose: asset.semanticPurpose,
      }))
    ),
    visualBeatSetHash: stableHash(
      input.plan.visualBeatPlan?.beats.map((beat) => ({
        sceneId: beat.sceneId,
        beatId: beat.beatId,
        beatHash: beat.beatHash,
        parentTreatmentHash: beat.parentTreatmentHash,
        assetDecision: beat.assetDecision,
      })) ?? null
    ),
    beatSequenceHash: stableHash(
      input.plan.visualBeatPlan?.beats.map((beat) => ({
        beatId: beat.beatId,
        beatHash: beat.beatHash,
        assetDecision: beat.assetDecision,
      })) ?? input.plan.scenes.map((scene) => scene.sceneId)
    ),
    timingHash: stableHash(
      input.plan.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        startMs: scene.startMs,
        durationMs: scene.durationMs,
      }))
    ),
    policyHash: stableHash({
      policyIdentity: input.policy.policyIdentity,
      sceneJudge: input.policy.sceneJudge,
      escalation: input.policy.escalation,
      finalAdjudication: input.policy.finalAdjudication ?? null,
      remediationAdvisor: input.policy.remediationAdvisor,
      sequenceJudge: input.policy.sequenceJudge,
      remediateReview: input.policy.remediateReview,
      sceneInstructionVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
      beatInstructionVersion: SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION,
      remediationInstructionVersion:
        SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION,
      sequenceInstructionVersion: SOURCE_GROUNDED_SEQUENCE_INSTRUCTION_VERSION,
    }),
  };
  return {
    revisionId: stableHash(revisionWithoutId),
    ...revisionWithoutId,
  };
}

export function sourceGroundedSceneCacheKey(input: {
  readonly payload: SourceGroundedSceneJudgementInput;
  readonly policyIdentity: string;
  readonly model: SourceGroundedModelTier;
  readonly instructionVersion: string;
}): string {
  return stableHash({
    schemaVersion: SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION,
    instructionVersion: input.instructionVersion,
    modelPolicyIdentity: input.policyIdentity,
    model: input.model,
    narrationHash: stableHash(input.payload.narrationBeat),
    semanticPropositionHash: stableHash(input.payload.semantic),
    structuredStateHash: stableHash(input.payload.structuredState ?? null),
    treatmentHash: stableHash(input.payload.treatment),
    providerPromptHash: stableHash(input.payload.providerPrompt),
    providerProjectionHash: stableHash(input.payload.providerProjection ?? null),
    constraintHash: stableHash(input.payload.constraints),
    format: input.payload.format,
  });
}

export function sourceGroundedVisualBeatCacheKey(input: {
  readonly payload: SourceGroundedVisualBeatJudgementInput;
  readonly policyIdentity: string;
  readonly model: SourceGroundedModelTier;
}): string {
  return stableHash({
    schemaVersion: SOURCE_GROUNDED_BEAT_JUDGE_SCHEMA_VERSION,
    instructionVersion: SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION,
    modelPolicyIdentity: input.policyIdentity,
    model: input.model,
    sourceNarrationHash: stableHash(input.payload.narrationBeat),
    narrationEvidenceHash: stableHash(input.payload.narrationEvidence),
    semanticSceneHash: input.payload.parentSemanticSceneHash,
    parentTreatmentHash: input.payload.parentTreatmentHash,
    visualBeatHash: input.payload.visualBeat.beatHash,
    providerPromptHash: stableHash(input.payload.providerPrompt),
    providerSemanticQaHash: stableHash(input.payload.providerSemanticQa),
    adjacentBeatHash: stableHash(input.payload.adjacentBeats),
    policyModelIdentity: stableHash({
      policy: input.policyIdentity,
      model: input.model,
    }),
  });
}

export function sourceGroundedRemediationCacheKey(input: {
  readonly payload: SemanticRemediationAdvisorInput;
  readonly policyIdentity: string;
  readonly model: SourceGroundedModelTier;
}): string {
  return stableHash({
    schemaVersion: SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
    instructionVersion: SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION,
    modelPolicyIdentity: input.policyIdentity,
    model: input.model,
    failedSceneInputHash: stableHash(input.payload.scene),
    sceneJudgeResultHash: stableHash(input.payload.judgement),
    remediationContextHash: stableHash(input.payload.constraints),
  });
}

export function sourceGroundedSequenceCacheKey(input: {
  readonly scenes: readonly EpisodeSequenceSceneSummary[];
  readonly policyIdentity: string;
  readonly model: SourceGroundedModelTier;
}): string {
  return stableHash({
    schemaVersion: SOURCE_GROUNDED_SEQUENCE_SCHEMA_VERSION,
    instructionVersion: SOURCE_GROUNDED_SEQUENCE_INSTRUCTION_VERSION,
    sequencePolicyVersion: SOURCE_GROUNDED_SEQUENCE_POLICY_VERSION,
    modelPolicyIdentity: input.policyIdentity,
    model: input.model,
    orderedCompactSceneSummaryHash: stableHash(input.scenes),
  });
}

function provenance<T>(input: {
  readonly component: SourceGroundedEvaluationProvenance["component"];
  readonly model: SourceGroundedModelTier;
  readonly instructionVersion: string;
  readonly inputHash: string;
  readonly value: T;
  readonly verdict: SourceGroundedVerdict;
  readonly defectCodes: readonly string[];
  readonly cacheHit: boolean;
  readonly escalationStatus: SourceGroundedEvaluationProvenance["escalationStatus"];
  readonly providerResult?: SourceGroundedProviderResult;
  readonly revisionId: string;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly workTelemetry?: SourceGroundedQaWorkTelemetry;
  readonly providerCall?: boolean;
  readonly singleFlightDeduplicated?: boolean;
  readonly timestamp?: string;
  readonly providerRequestCountContribution?: 0 | 1;
  readonly batchSize?: number;
}): SourceGroundedEvaluationProvenance {
  return {
    component: input.component,
    model: input.model.model,
    reasoningEffort: input.model.reasoningEffort,
    instructionVersion: input.instructionVersion,
    inputHash: input.inputHash,
    outputHash: stableHash(input.value),
    timestamp: input.timestamp ?? new Date().toISOString(),
    cacheHit: input.cacheHit,
    escalationStatus: input.escalationStatus,
    defectCodes: input.defectCodes,
    verdict: input.verdict,
    inputTokens: input.providerResult?.usage?.inputTokens ?? 0,
    outputTokens: input.providerResult?.usage?.outputTokens ?? 0,
    cachedInputTokens: input.providerResult?.usage?.cachedInputTokens ?? 0,
    revisionId: input.revisionId,
    executionProfile: input.execution.profile,
    transport: input.execution.transport,
    ...(input.execution.serviceTier
      ? { serviceTier: input.execution.serviceTier }
      : {}),
    queueWaitMs: input.workTelemetry?.queueWaitMs ?? 0,
    apiLatencyMs: input.workTelemetry?.apiLatencyMs ?? 0,
    attemptCount: input.workTelemetry?.attemptCount ?? 0,
    retryCount: input.workTelemetry?.retryCount ?? 0,
    rateLimitEvents: input.workTelemetry?.rateLimitEvents ?? 0,
    throttleEvents: input.workTelemetry?.throttleEvents ?? 0,
    effectiveConcurrency:
      input.workTelemetry?.effectiveConcurrency ??
      input.execution.targetConcurrency,
    maxObservedConcurrency: input.workTelemetry?.maxObservedConcurrency ?? 0,
    providerCall: input.providerCall ?? Boolean(input.providerResult),
    providerRequestCountContribution:
      input.providerRequestCountContribution ??
      (input.providerCall ?? Boolean(input.providerResult) ? 1 : 0),
    ...(input.batchSize ? { batchSize: input.batchSize } : {}),
    singleFlightDeduplicated: input.singleFlightDeduplicated ?? false,
    ...(input.providerResult?.requestId
      ? { requestId: input.providerResult.requestId }
      : {}),
  };
}

function cacheHitProvenance(input: {
  readonly cached: SourceGroundedEvaluationProvenance;
  readonly revisionId: string;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly inputHash?: string;
  readonly instructionVersion?: string;
  readonly cacheCompatibility?: "EXACT" | "LEGACY_SEMANTIC_EQUIVALENT";
}): SourceGroundedEvaluationProvenance {
  return {
    ...input.cached,
    timestamp: new Date().toISOString(),
    cacheHit: true,
    inputHash: input.inputHash ?? input.cached.inputHash,
    instructionVersion:
      input.instructionVersion ?? input.cached.instructionVersion,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    revisionId: input.revisionId,
    executionProfile: input.execution.profile,
    transport: input.execution.transport,
    ...(input.execution.serviceTier
      ? { serviceTier: input.execution.serviceTier }
      : {}),
    queueWaitMs: 0,
    apiLatencyMs: 0,
    attemptCount: 0,
    retryCount: 0,
    rateLimitEvents: 0,
    throttleEvents: 0,
    effectiveConcurrency: input.execution.targetConcurrency,
    maxObservedConcurrency: 0,
    providerCall: false,
    providerRequestCountContribution: 0,
    singleFlightDeduplicated: false,
    cacheCompatibility: input.cacheCompatibility ?? "EXACT",
  };
}

const sourceGroundedSingleFlight = new Map<string, Promise<unknown>>();

async function runSourceGroundedSingleFlight<T>(
  identity: string,
  work: () => Promise<T>
): Promise<{ readonly value: T; readonly deduplicated: boolean }> {
  const existing = sourceGroundedSingleFlight.get(identity) as
    | Promise<T>
    | undefined;
  if (existing) return { value: await existing, deduplicated: true };
  const promise = work();
  sourceGroundedSingleFlight.set(identity, promise);
  try {
    return { value: await promise, deduplicated: false };
  } finally {
    if (sourceGroundedSingleFlight.get(identity) === promise) {
      sourceGroundedSingleFlight.delete(identity);
    }
  }
}

function estimatedRequestTokens(
  payload: unknown,
  model: SourceGroundedModelTier
): number {
  return (
    Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 4) +
    (model.maxOutputTokens ?? 800)
  );
}

function providerReservation(input: {
  readonly payload: unknown;
  readonly instructions: string;
  readonly model: SourceGroundedModelTier;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly itemCount?: number;
}): SourceGroundedQaProviderReservation {
  const estimatedInputTokens = Math.ceil(
    Buffer.byteLength(
      `${input.instructions}\n${JSON.stringify(input.payload)}`,
      "utf8"
    ) / 4
  );
  const estimatedOutputTokens =
    (input.model.maxOutputTokens ?? 800) * (input.itemCount ?? 1);
  const pricing = input.execution.modelPricing?.[input.model.model];
  return {
    model: input.model.model,
    flagship:
      input.execution.flagshipModels?.includes(input.model.model) ?? false,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: pricing
      ? (estimatedInputTokens * pricing.inputUsdPerMillionTokens +
          estimatedOutputTokens * pricing.outputUsdPerMillionTokens) /
        1_000_000
      : input.execution.providerMode === "FIXTURE"
        ? 0
        : null,
  };
}

interface MicroBatchResult {
  readonly providerResult: SourceGroundedProviderResult;
  readonly workTelemetry: SourceGroundedQaWorkTelemetry;
  readonly providerRequestCountContribution: 0 | 1;
  readonly batchSize: number;
}

function allocateUsage(
  usage: SourceGroundedProviderUsage | undefined,
  weights: readonly number[]
): SourceGroundedProviderUsage[] {
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const allocate = (total: number | undefined): number[] => {
    if (!total) return weights.map(() => 0);
    const values = weights.map((weight) =>
      Math.floor((total * weight) / totalWeight)
    );
    let remaining = total - values.reduce((sum, value) => sum + value, 0);
    for (let index = 0; remaining > 0; index = (index + 1) % values.length) {
      values[index] = (values[index] ?? 0) + 1;
      remaining -= 1;
    }
    return values;
  };
  const inputTokens = allocate(usage?.inputTokens);
  const outputTokens = allocate(usage?.outputTokens);
  const cachedInputTokens = allocate(usage?.cachedInputTokens);
  return weights.map((_, index) => ({
    inputTokens: inputTokens[index] ?? 0,
    outputTokens: outputTokens[index] ?? 0,
    cachedInputTokens: cachedInputTokens[index] ?? 0,
  }));
}

interface SceneBatchPending {
  readonly payload: SourceGroundedSceneJudgementInput;
  readonly resolve: (value: MicroBatchResult) => void;
  readonly reject: (reason: unknown) => void;
}

class SceneJudgeMicroBatcher {
  readonly #pending: SceneBatchPending[] = [];
  #flushQueued = false;

  constructor(
    private readonly options: {
      readonly judge: SourceGroundedSceneJudgePort;
      readonly model: SourceGroundedModelTier;
      readonly execution: SourceGroundedQaExecutionPolicy;
      readonly scheduler: SourceGroundedQaScheduler;
      readonly batchSize: number;
      readonly priority: number;
      readonly instructions?: string;
      readonly instructionVersion?: string;
      readonly jsonSchema?: unknown;
      readonly cacheFamily?: "scene" | "beat";
      readonly signal?: AbortSignal;
    }
  ) {}

  submit(payload: SourceGroundedSceneJudgementInput): Promise<MicroBatchResult> {
    return new Promise((resolve, reject) => {
      this.#pending.push({ payload, resolve, reject });
      if (!this.#flushQueued) {
        this.#flushQueued = true;
        setTimeout(() => void this.#flush(), 0);
      }
    });
  }

  async #flush(): Promise<void> {
    this.#flushQueued = false;
    const pending = this.#pending.splice(0);
    const effectiveBatchSize = this.options.judge.judgeBatch
      ? Math.max(1, this.options.batchSize)
      : 1;
    const chunks: (typeof pending)[] = [];
    for (let index = 0; index < pending.length; index += effectiveBatchSize) {
      chunks.push(pending.slice(index, index + effectiveBatchSize));
    }
    await Promise.all(chunks.map((chunk) => this.#execute(chunk)));
  }

  async #execute(chunk: SceneBatchPending[]): Promise<void> {
    const instructions =
      this.options.instructions ?? SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTIONS;
    const instructionVersion =
      this.options.instructionVersion ??
      SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION;
    const jsonSchema =
      this.options.jsonSchema ?? sourceGroundedSceneJudgementJsonSchema;
    const cacheFamily = this.options.cacheFamily ?? "scene";
    const items = chunk.map((entry, index) => ({
      itemId: `item-${String(index + 1).padStart(3, "0")}`,
      payload: entry.payload,
    }));
    const aggregatePayload = items.map((item) => item.payload);
    try {
      const scheduled = await this.options.scheduler.run({
        packId: items[0]!.payload.episodeId,
        priority: this.options.priority,
        estimatedTokens: estimatedRequestTokens(
          aggregatePayload,
          this.options.model
        ),
        execution: this.options.execution,
        provider: providerReservation({
          payload: aggregatePayload,
          instructions,
          model: this.options.model,
          execution: this.options.execution,
          itemCount: items.length,
        }),
        ...(this.options.signal ? { signal: this.options.signal } : {}),
        task: async (signal) => {
          if (items.length === 1 || !this.options.judge.judgeBatch) {
            const value = await this.options.judge.judge({
              payload: items[0]!.payload,
              model: this.options.model,
              instructions,
              instructionVersion,
              jsonSchema,
              cachePolicy: providerCachePolicy({
                family: cacheFamily,
                instructionVersion,
                model: this.options.model,
                execution: this.options.execution,
              }),
              execution: this.options.execution,
              ...(signal ? { signal } : {}),
            });
            return {
              outputs: [{ itemId: items[0]!.itemId, output: value.output }],
              ...(value.requestId ? { requestId: value.requestId } : {}),
              ...(value.usage ? { usage: value.usage } : {}),
              ...(value.rateLimit ? { rateLimit: value.rateLimit } : {}),
            } satisfies SourceGroundedBatchProviderResult;
          }
          return this.options.judge.judgeBatch({
            items,
            model: this.options.model,
            instructions,
            instructionVersion,
            jsonSchema,
            cachePolicy: providerCachePolicy({
              family: cacheFamily,
              instructionVersion,
              model: this.options.model,
              execution: this.options.execution,
            }),
            execution: this.options.execution,
            ...(signal ? { signal } : {}),
          });
        },
      });
      const weights = items.map((item) =>
        Math.max(1, Buffer.byteLength(JSON.stringify(item.payload), "utf8"))
      );
      const usages = allocateUsage(scheduled.value.usage, weights);
      for (const [index, item] of items.entries()) {
        const output = scheduled.value.outputs.find(
          (candidate) => candidate.itemId === item.itemId
        );
        if (!output) {
          throw new Error(`Scene batch omitted ${item.itemId}.`);
        }
        chunk[index]!.resolve({
          providerResult: {
            output: output.output,
            ...(scheduled.value.requestId
              ? {
                  requestId: `${scheduled.value.requestId}:${item.itemId}`,
                }
              : {}),
            usage: usages[index]!,
            ...(scheduled.value.rateLimit
              ? { rateLimit: scheduled.value.rateLimit }
              : {}),
          },
          workTelemetry: scheduled.telemetry,
          providerRequestCountContribution: index === 0 ? 1 : 0,
          batchSize: items.length,
        });
      }
    } catch (error) {
      for (const entry of chunk) entry.reject(error);
    }
  }
}

interface AdvisorBatchPending {
  readonly payload: SemanticRemediationAdvisorInput;
  readonly resolve: (value: MicroBatchResult) => void;
  readonly reject: (reason: unknown) => void;
}

class AdvisorMicroBatcher {
  readonly #pending: AdvisorBatchPending[] = [];
  #flushQueued = false;

  constructor(
    private readonly options: {
      readonly advisor: SemanticRemediationAdvisorPort;
      readonly model: SourceGroundedModelTier;
      readonly execution: SourceGroundedQaExecutionPolicy;
      readonly scheduler: SourceGroundedQaScheduler;
      readonly signal?: AbortSignal;
    }
  ) {}

  submit(payload: SemanticRemediationAdvisorInput): Promise<MicroBatchResult> {
    return new Promise((resolve, reject) => {
      this.#pending.push({ payload, resolve, reject });
      if (!this.#flushQueued) {
        this.#flushQueued = true;
        setTimeout(() => void this.#flush(), 0);
      }
    });
  }

  async #flush(): Promise<void> {
    this.#flushQueued = false;
    const pending = this.#pending.splice(0);
    const batchSize = this.options.advisor.adviseBatch
      ? Math.max(1, this.options.execution.remediationBatchSize)
      : 1;
    const chunks: AdvisorBatchPending[][] = [];
    for (let index = 0; index < pending.length; index += batchSize) {
      chunks.push(pending.slice(index, index + batchSize));
    }
    await Promise.all(chunks.map((chunk) => this.#execute(chunk)));
  }

  async #execute(chunk: AdvisorBatchPending[]): Promise<void> {
    const items = chunk.map((entry, index) => ({
      itemId: `item-${String(index + 1).padStart(3, "0")}`,
      payload: entry.payload,
    }));
    const aggregatePayload = items.map((item) => item.payload);
    try {
      const scheduled = await this.options.scheduler.run({
        packId: items[0]!.payload.scene.episodeId,
        priority: 10,
        estimatedTokens: estimatedRequestTokens(
          aggregatePayload,
          this.options.model
        ),
        execution: this.options.execution,
        provider: providerReservation({
          payload: aggregatePayload,
          instructions: SOURCE_GROUNDED_REMEDIATION_ADVISOR_INSTRUCTIONS,
          model: this.options.model,
          execution: this.options.execution,
          itemCount: items.length,
        }),
        ...(this.options.signal ? { signal: this.options.signal } : {}),
        task: async (signal) => {
          if (items.length === 1 || !this.options.advisor.adviseBatch) {
            const value = await this.options.advisor.advise({
              payload: items[0]!.payload,
              model: this.options.model,
              instructions: SOURCE_GROUNDED_REMEDIATION_ADVISOR_INSTRUCTIONS,
              instructionVersion: SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION,
              jsonSchema: semanticRemediationDirectiveJsonSchema,
              cachePolicy: providerCachePolicy({
                family: "remediation",
                instructionVersion:
                  SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION,
                model: this.options.model,
                execution: this.options.execution,
              }),
              execution: this.options.execution,
              ...(signal ? { signal } : {}),
            });
            return {
              outputs: [{ itemId: items[0]!.itemId, output: value.output }],
              ...(value.requestId ? { requestId: value.requestId } : {}),
              ...(value.usage ? { usage: value.usage } : {}),
            } satisfies SourceGroundedBatchProviderResult;
          }
          return this.options.advisor.adviseBatch({
            items,
            model: this.options.model,
            instructions: SOURCE_GROUNDED_REMEDIATION_ADVISOR_INSTRUCTIONS,
            instructionVersion: SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION,
            jsonSchema: semanticRemediationDirectiveJsonSchema,
            cachePolicy: providerCachePolicy({
              family: "remediation",
              instructionVersion:
                SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION,
              model: this.options.model,
              execution: this.options.execution,
            }),
            execution: this.options.execution,
            ...(signal ? { signal } : {}),
          });
        },
      });
      const weights = items.map((item) =>
        Math.max(1, Buffer.byteLength(JSON.stringify(item.payload), "utf8"))
      );
      const usages = allocateUsage(scheduled.value.usage, weights);
      for (const [index, item] of items.entries()) {
        const output = scheduled.value.outputs.find(
          (candidate) => candidate.itemId === item.itemId
        );
        if (!output) throw new Error(`Advisor batch omitted ${item.itemId}.`);
        chunk[index]!.resolve({
          providerResult: {
            output: output.output,
            ...(scheduled.value.requestId
              ? { requestId: `${scheduled.value.requestId}:${item.itemId}` }
              : {}),
            usage: usages[index]!,
          },
          workTelemetry: scheduled.telemetry,
          providerRequestCountContribution: index === 0 ? 1 : 0,
          batchSize: items.length,
        });
      }
    } catch (error) {
      for (const entry of chunk) entry.reject(error);
    }
  }
}

function providerCachePolicy(input: {
  readonly family: "scene" | "beat" | "remediation" | "sequence";
  readonly instructionVersion: string;
  readonly model: SourceGroundedModelTier;
  readonly execution: SourceGroundedQaExecutionPolicy;
}): AiRequestCachePolicy {
  return {
    enabled: input.execution.promptPrefixCaching,
    stablePrefixVersion: input.instructionVersion,
    ...(input.execution.promptPrefixCaching
      ? {
          key: `veronica-${input.family}-judge:${stableHash({
            instructionVersion: input.instructionVersion,
            model: input.model.model,
          }).slice(0, 24)}`,
        }
      : {}),
  };
}

async function cachedSceneJudgement(input: {
  readonly payload: SourceGroundedSceneJudgementInput;
  readonly policyIdentity: string;
  readonly model: SourceGroundedModelTier;
  readonly component: SourceGroundedEvaluationProvenance["component"];
  readonly escalationStatus: SourceGroundedEvaluationProvenance["escalationStatus"];
  readonly judge: SourceGroundedSceneJudgePort;
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly revision: QaRevision;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly scheduler: SourceGroundedQaScheduler;
  readonly batcher: SceneJudgeMicroBatcher;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly judgement: SourceGroundedSceneJudgement;
  readonly provenance: SourceGroundedEvaluationProvenance;
  readonly consistencyReasons: readonly string[];
}> {
  const key = sourceGroundedSceneCacheKey({
    payload: input.payload,
    policyIdentity: input.policyIdentity,
    model: input.model,
    instructionVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
  });
  let cached = (await input.cache.get(
    key
  )) as CachedEvaluation<SourceGroundedSceneJudgement> | null;
  let legacyCompatible = false;
  if (!cached) {
    const legacyKey = sourceGroundedSceneCacheKey({
      payload: input.payload,
      policyIdentity: input.policyIdentity,
      model: input.model,
      instructionVersion:
        "veronica-source-grounded-scene-judge-instructions.v1",
    });
    const legacy = (await input.cache.get(
      legacyKey
    )) as CachedEvaluation<SourceGroundedSceneJudgement> | null;
    if (
      legacy?.schemaVersion === "veronica-source-grounded-cache-record.v1" &&
      legacy.provenance.instructionVersion ===
        "veronica-source-grounded-scene-judge-instructions.v1"
    ) {
      cached = legacy;
      legacyCompatible = true;
    }
  }
  if (
    cached?.schemaVersion === "veronica-source-grounded-cache-record.v1" &&
    sourceGroundedSceneJudgementSchema.safeParse(cached.value).success &&
    cached.outputHash === stableHash(cached.value)
  ) {
    const value = sourceGroundedSceneJudgementSchema.parse(cached.value);
    const hitProvenance = {
      ...cacheHitProvenance({
        cached: cached.provenance,
        revisionId: input.revision.revisionId,
        execution: input.execution,
        inputHash: key,
        instructionVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
        cacheCompatibility: legacyCompatible
          ? ("LEGACY_SEMANTIC_EQUIVALENT" as const)
          : ("EXACT" as const),
      }),
      component: input.component,
      escalationStatus: input.escalationStatus,
    };
    if (legacyCompatible) {
      await input.cache.set(key, {
        schemaVersion: "veronica-source-grounded-cache-record.v1",
        value,
        outputHash: stableHash(value),
        provenance: hitProvenance,
      } satisfies CachedEvaluation<SourceGroundedSceneJudgement>);
    }
    return {
      judgement: value,
      provenance: hitProvenance,
      consistencyReasons: sceneJudgementConsistencyReasons(value),
    };
  }
  const negative = await activeNegativeCache(input.cache, key, input.execution);
  if (negative) {
    const judgement = unavailableScene(
      `Scene judge suppressed by ${negative.kind.toLowerCase()} backoff: ${negative.reason}`
    );
    return {
      judgement,
      provenance: provenance({
        component: input.component,
        model: input.model,
        instructionVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
        inputHash: key,
        value: judgement,
        verdict: judgement.verdict,
        defectCodes: judgement.defectCodes,
        cacheHit: true,
        escalationStatus: input.escalationStatus,
        revisionId: input.revision.revisionId,
        execution: input.execution,
        providerCall: false,
        providerRequestCountContribution: 0,
      }),
      consistencyReasons:
        negative.kind === "DETERMINISTIC_MALFORMED"
          ? ["MALFORMED_STRUCTURED_OUTPUT"]
          : [],
    };
  }
  const singleFlight = await runSourceGroundedSingleFlight(key, async () => {
    let providerResult: SourceGroundedProviderResult | undefined;
    let workTelemetry: SourceGroundedQaWorkTelemetry | undefined;
    let providerRequestCountContribution: 0 | 1 = 0;
    let batchSize = 1;
    let judgement: SourceGroundedSceneJudgement;
    let failureKind: CachedOperationalFailure["kind"] | null = null;
    let malformed = false;
    try {
      const batched = await input.batcher.submit(input.payload);
      providerResult = batched.providerResult;
      workTelemetry = batched.workTelemetry;
      providerRequestCountContribution =
        batched.providerRequestCountContribution;
      batchSize = batched.batchSize;
      const parsed = sourceGroundedSceneJudgementSchema.safeParse(
        stripStructuredOutputNulls(providerResult.output)
      );
      malformed = !parsed.success;
      judgement = parsed.success
        ? parsed.data
        : unavailableScene("Scene judge returned malformed structured output.");
    } catch (error) {
      if (error instanceof SourceGroundedQaAdmissionError) throw error;
      failureKind = transientFailureKind(error);
      judgement = unavailableScene(
        `Scene judge unavailable: ${error instanceof Error ? error.message : "provider failure"}`
      );
    }
    const consistencyReasons = malformed
      ? ["MALFORMED_STRUCTURED_OUTPUT"]
      : sceneJudgementConsistencyReasons(judgement);
    const finalJudgement =
      consistencyReasons.length === 0
        ? judgement
        : malformed
          ? judgement
          : unavailableScene(
            `Scene judge returned inconsistent structured output: ${consistencyReasons.join("; ")}`
          );
    const recordProvenance = provenance({
      component: input.component,
      model: input.model,
      instructionVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
      inputHash: key,
      value: finalJudgement,
      verdict: finalJudgement.verdict,
      defectCodes: finalJudgement.defectCodes,
      cacheHit: false,
      escalationStatus: input.escalationStatus,
      revisionId: input.revision.revisionId,
      execution: input.execution,
      ...(workTelemetry ? { workTelemetry } : {}),
      ...(providerResult ? { providerResult } : {}),
      providerRequestCountContribution,
      batchSize,
    });
    return {
      judgement: finalJudgement,
      provenance: recordProvenance,
      consistencyReasons,
      failureKind: malformed ? ("DETERMINISTIC_MALFORMED" as const) : failureKind,
    };
  });
  const recordProvenance = singleFlight.deduplicated
    ? {
        ...singleFlight.value.provenance,
        component: input.component,
        escalationStatus: input.escalationStatus,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        providerCall: false,
        providerRequestCountContribution: 0 as const,
        singleFlightDeduplicated: true,
      }
    : singleFlight.value.provenance;
  if (singleFlight.value.judgement.verdict !== "UNAVAILABLE") {
    await input.cache.set(key, {
      schemaVersion: "veronica-source-grounded-cache-record.v1",
      value: singleFlight.value.judgement,
      outputHash: stableHash(singleFlight.value.judgement),
      provenance: singleFlight.value.provenance,
    } satisfies CachedEvaluation<SourceGroundedSceneJudgement>);
  } else if (singleFlight.value.failureKind) {
    await cacheOperationalFailure({
      cache: input.cache,
      identity: key,
      kind: singleFlight.value.failureKind,
      reason: singleFlight.value.judgement.reason,
      execution: input.execution,
    });
  }
  return {
    judgement: singleFlight.value.judgement,
    provenance: recordProvenance,
    consistencyReasons: singleFlight.value.consistencyReasons,
  };
}

async function evaluateScene(input: {
  readonly payload: SourceGroundedSceneJudgementInput;
  readonly policy: SourceGroundedVisualQaPolicy;
  readonly primaryJudge: SourceGroundedSceneJudgePort;
  readonly escalationJudge?: SourceGroundedSceneJudgePort;
  readonly finalJudge?: SourceGroundedSceneJudgePort;
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly revision: QaRevision;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly scheduler: SourceGroundedQaScheduler;
  readonly primaryBatcher: SceneJudgeMicroBatcher;
  readonly escalationBatcher?: SceneJudgeMicroBatcher;
  readonly finalBatcher?: SceneJudgeMicroBatcher;
  readonly signal?: AbortSignal;
}): Promise<SourceGroundedSceneEvaluation> {
  const primary = await cachedSceneJudgement({
    payload: input.payload,
    policyIdentity: input.policy.policyIdentity,
    model: input.policy.sceneJudge,
    component: "SCENE_JUDGE_PRIMARY",
    escalationStatus: "NOT_ESCALATED",
    judge: input.primaryJudge,
    cache: input.cache,
    revision: input.revision,
    execution: input.execution,
    scheduler: input.scheduler,
    batcher: input.primaryBatcher,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const provenanceRecords = [primary.provenance];
  let final = guardSourceGroundedPass(input.payload, primary.judgement);
  let escalationStatus: SourceGroundedSceneEvaluation["escalationStatus"] =
    "NOT_ESCALATED";
  const cachedFinal =
    final.verdict !== "PASS" && input.policy.finalAdjudication
      ? await cachedFinalScenePass({
          payload: input.payload,
          policy: input.policy,
          cache: input.cache,
          revision: input.revision,
          execution: input.execution,
        })
      : undefined;
  if (cachedFinal) {
    provenanceRecords.push(cachedFinal.provenance);
    final = guardSourceGroundedPass(input.payload, cachedFinal.judgement);
    escalationStatus = "FINAL_ADJUDICATION";
  }
  if (
    !cachedFinal &&
    (final.verdict !== "PASS" || primary.consistencyReasons.length > 0) &&
    input.escalationJudge
  ) {
    const escalated = await cachedSceneJudgement({
      payload: input.payload,
      policyIdentity: input.policy.policyIdentity,
      model: input.policy.escalation,
      component: "SCENE_JUDGE_ESCALATION",
      escalationStatus: "ESCALATED",
      judge: input.escalationJudge,
      cache: input.cache,
      revision: input.revision,
      execution: input.execution,
      scheduler: input.scheduler,
      batcher: input.escalationBatcher!,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    provenanceRecords.push(escalated.provenance);
    final = guardSourceGroundedPass(input.payload, escalated.judgement);
    escalationStatus = "ESCALATED";
    if (
      (final.verdict === "REVIEW" ||
        escalated.consistencyReasons.length > 0) &&
      input.policy.finalAdjudication &&
      input.finalJudge
    ) {
      const adjudicated = await cachedSceneJudgement({
        payload: input.payload,
        policyIdentity: input.policy.policyIdentity,
        model: input.policy.finalAdjudication,
        component: "SCENE_JUDGE_FINAL",
        escalationStatus: "FINAL_ADJUDICATION",
        judge: input.finalJudge,
        cache: input.cache,
        revision: input.revision,
        execution: input.execution,
        scheduler: input.scheduler,
        batcher: input.finalBatcher!,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      provenanceRecords.push(adjudicated.provenance);
      final = guardSourceGroundedPass(input.payload, adjudicated.judgement);
      escalationStatus = "FINAL_ADJUDICATION";
    }
  }
  return {
    sceneId: input.payload.sceneId,
    judgement: final,
    escalationStatus,
    modelPolicyIdentity: input.policy.policyIdentity,
    cacheHit: provenanceRecords.every((record) => record.cacheHit),
    inputHash: provenanceRecords.at(-1)!.inputHash,
    outputHash: stableHash(final),
    provenance: provenanceRecords,
  };
}

async function cachedFinalScenePass(input: {
  readonly payload: SourceGroundedSceneJudgementInput;
  readonly policy: SourceGroundedVisualQaPolicy;
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly revision: QaRevision;
  readonly execution: SourceGroundedQaExecutionPolicy;
}): Promise<{
  readonly judgement: SourceGroundedSceneJudgement;
  readonly provenance: SourceGroundedEvaluationProvenance;
} | undefined> {
  const model = input.policy.finalAdjudication;
  if (!model) return undefined;
  const key = sourceGroundedSceneCacheKey({
    payload: input.payload,
    policyIdentity: input.policy.policyIdentity,
    model,
    instructionVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
  });
  const cached = (await input.cache.get(key)) as CachedEvaluation<SourceGroundedSceneJudgement> | null;
  if (
    cached?.schemaVersion !== "veronica-source-grounded-cache-record.v1" ||
    !sourceGroundedSceneJudgementSchema.safeParse(cached.value).success ||
    cached.outputHash !== stableHash(cached.value) ||
    cached.provenance.revisionId !== input.revision.revisionId
  ) return undefined;
  const judgement = sourceGroundedSceneJudgementSchema.parse(cached.value);
  return judgement.verdict === "PASS"
    ? {
        judgement,
        provenance: {
          ...cacheHitProvenance({
            cached: cached.provenance,
            revisionId: input.revision.revisionId,
            execution: input.execution,
            inputHash: key,
            instructionVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
          }),
          component: "SCENE_JUDGE_FINAL",
          escalationStatus: "FINAL_ADJUDICATION",
        },
      }
    : undefined;
}

function guardSourceGroundedBeatPass(
  payload: SourceGroundedVisualBeatJudgementInput,
  judgement: SourceGroundedVisualBeatJudgement
): SourceGroundedVisualBeatJudgement {
  if (judgement.verdict !== "PASS" || payload.providerSemanticQa.status === "PASS") {
    return judgement;
  }
  return {
    ...judgement,
    sourceFidelity: "UNCERTAIN",
    providerPromptDepictsBeat: false,
    verdict: "REVIEW",
    defectCodes: [...new Set([...judgement.defectCodes, "PROVIDER_PROMPT_BEAT_MISMATCH" as const])],
    reason: "Source-grounded beat PASS rejected because provider semantic QA is not PASS.",
  };
}

async function cachedBeatJudgement(input: {
  readonly payload: SourceGroundedVisualBeatJudgementInput;
  readonly policyIdentity: string;
  readonly model: SourceGroundedModelTier;
  readonly component: SourceGroundedEvaluationProvenance["component"];
  readonly escalationStatus: SourceGroundedEvaluationProvenance["escalationStatus"];
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly revision: QaRevision;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly batcher: SceneJudgeMicroBatcher;
}): Promise<{
  readonly judgement: SourceGroundedVisualBeatJudgement;
  readonly provenance: SourceGroundedEvaluationProvenance;
  readonly consistencyReasons: readonly string[];
}> {
  const key = sourceGroundedVisualBeatCacheKey({
    payload: input.payload,
    policyIdentity: input.policyIdentity,
    model: input.model,
  });
  const cached = (await input.cache.get(key)) as CachedEvaluation<SourceGroundedVisualBeatJudgement> | null;
  if (
    cached?.schemaVersion === "veronica-source-grounded-cache-record.v1" &&
    sourceGroundedVisualBeatJudgementSchema.safeParse(cached.value).success &&
    cached.outputHash === stableHash(cached.value)
  ) {
    const value = sourceGroundedVisualBeatJudgementSchema.parse(cached.value);
    return {
      judgement: value,
      provenance: {
        ...cacheHitProvenance({
          cached: cached.provenance,
          revisionId: input.revision.revisionId,
          execution: input.execution,
          inputHash: key,
          instructionVersion: SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION,
          cacheCompatibility: "EXACT",
        }),
        component: input.component,
        escalationStatus: input.escalationStatus,
      },
      consistencyReasons: beatJudgementConsistencyReasons(value),
    };
  }
  const negative = await activeNegativeCache(input.cache, key, input.execution);
  if (negative) {
    const judgement = unavailableBeat(`Beat judge suppressed by ${negative.kind.toLowerCase()} backoff: ${negative.reason}`);
    return {
      judgement,
      provenance: provenance({
        component: input.component,
        model: input.model,
        instructionVersion: SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION,
        inputHash: key,
        value: judgement,
        verdict: judgement.verdict,
        defectCodes: judgement.defectCodes,
        cacheHit: true,
        escalationStatus: input.escalationStatus,
        revisionId: input.revision.revisionId,
        execution: input.execution,
        providerCall: false,
        providerRequestCountContribution: 0,
      }),
      consistencyReasons: negative.kind === "DETERMINISTIC_MALFORMED" ? ["MALFORMED_STRUCTURED_OUTPUT"] : [],
    };
  }
  const singleFlight = await runSourceGroundedSingleFlight(key, async () => {
    let providerResult: SourceGroundedProviderResult | undefined;
    let workTelemetry: SourceGroundedQaWorkTelemetry | undefined;
    let providerRequestCountContribution: 0 | 1 = 0;
    let batchSize = 1;
    let judgement: SourceGroundedVisualBeatJudgement;
    let failureKind: CachedOperationalFailure["kind"] | null = null;
    let malformed = false;
    try {
      const batched = await input.batcher.submit(input.payload);
      providerResult = batched.providerResult;
      workTelemetry = batched.workTelemetry;
      providerRequestCountContribution = batched.providerRequestCountContribution;
      batchSize = batched.batchSize;
      const parsed = sourceGroundedVisualBeatJudgementSchema.safeParse(stripStructuredOutputNulls(providerResult.output));
      malformed = !parsed.success;
      judgement = parsed.success ? parsed.data : unavailableBeat("Beat judge returned malformed structured output.");
    } catch (error) {
      if (error instanceof SourceGroundedQaAdmissionError) throw error;
      failureKind = transientFailureKind(error);
      judgement = unavailableBeat(`Beat judge unavailable: ${error instanceof Error ? error.message : "provider failure"}`);
    }
    const consistencyReasons = malformed ? ["MALFORMED_STRUCTURED_OUTPUT"] : beatJudgementConsistencyReasons(judgement);
    const finalJudgement = consistencyReasons.length === 0
      ? judgement
      : malformed
        ? judgement
        : unavailableBeat(`Beat judge returned inconsistent structured output: ${consistencyReasons.join("; ")}`);
    return {
      judgement: finalJudgement,
      consistencyReasons,
      failureKind: malformed ? ("DETERMINISTIC_MALFORMED" as const) : failureKind,
      provenance: provenance({
        component: input.component,
        model: input.model,
        instructionVersion: SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION,
        inputHash: key,
        value: finalJudgement,
        verdict: finalJudgement.verdict,
        defectCodes: finalJudgement.defectCodes,
        cacheHit: false,
        escalationStatus: input.escalationStatus,
        revisionId: input.revision.revisionId,
        execution: input.execution,
        ...(workTelemetry ? { workTelemetry } : {}),
        ...(providerResult ? { providerResult } : {}),
        providerRequestCountContribution,
        batchSize,
      }),
    };
  });
  const recordProvenance = singleFlight.deduplicated
    ? {
        ...singleFlight.value.provenance,
        component: input.component,
        escalationStatus: input.escalationStatus,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        providerCall: false,
        providerRequestCountContribution: 0 as const,
        singleFlightDeduplicated: true,
      }
    : singleFlight.value.provenance;
  if (singleFlight.value.judgement.verdict !== "UNAVAILABLE") {
    await input.cache.set(key, {
      schemaVersion: "veronica-source-grounded-cache-record.v1",
      value: singleFlight.value.judgement,
      outputHash: stableHash(singleFlight.value.judgement),
      provenance: singleFlight.value.provenance,
    } satisfies CachedEvaluation<SourceGroundedVisualBeatJudgement>);
  } else if (singleFlight.value.failureKind) {
    await cacheOperationalFailure({
      cache: input.cache,
      identity: key,
      kind: singleFlight.value.failureKind,
      reason: singleFlight.value.judgement.reason,
      execution: input.execution,
    });
  }
  return {
    judgement: singleFlight.value.judgement,
    provenance: recordProvenance,
    consistencyReasons: singleFlight.value.consistencyReasons,
  };
}

async function evaluateBeat(input: {
  readonly payload: SourceGroundedVisualBeatJudgementInput;
  readonly assetId: string;
  readonly policy: SourceGroundedVisualQaPolicy;
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly revision: QaRevision;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly primaryBatcher: SceneJudgeMicroBatcher;
  readonly escalationBatcher?: SceneJudgeMicroBatcher;
  readonly finalBatcher?: SceneJudgeMicroBatcher;
}): Promise<SourceGroundedVisualBeatEvaluation> {
  const primary = await cachedBeatJudgement({
    payload: input.payload,
    policyIdentity: input.policy.policyIdentity,
    model: input.policy.sceneJudge,
    component: "BEAT_JUDGE_PRIMARY",
    escalationStatus: "NOT_ESCALATED",
    cache: input.cache,
    revision: input.revision,
    execution: input.execution,
    batcher: input.primaryBatcher,
  });
  const provenanceRecords = [primary.provenance];
  let final = guardSourceGroundedBeatPass(input.payload, primary.judgement);
  let escalationStatus: SourceGroundedVisualBeatEvaluation["escalationStatus"] = "NOT_ESCALATED";
  if ((final.verdict !== "PASS" || primary.consistencyReasons.length > 0) && input.escalationBatcher) {
    const escalated = await cachedBeatJudgement({
      payload: input.payload,
      policyIdentity: input.policy.policyIdentity,
      model: input.policy.escalation,
      component: "BEAT_JUDGE_ESCALATION",
      escalationStatus: "ESCALATED",
      cache: input.cache,
      revision: input.revision,
      execution: input.execution,
      batcher: input.escalationBatcher,
    });
    provenanceRecords.push(escalated.provenance);
    final = guardSourceGroundedBeatPass(input.payload, escalated.judgement);
    escalationStatus = "ESCALATED";
    if ((final.verdict === "REVIEW" || escalated.consistencyReasons.length > 0) && input.policy.finalAdjudication && input.finalBatcher) {
      const adjudicated = await cachedBeatJudgement({
        payload: input.payload,
        policyIdentity: input.policy.policyIdentity,
        model: input.policy.finalAdjudication,
        component: "BEAT_JUDGE_FINAL",
        escalationStatus: "FINAL_ADJUDICATION",
        cache: input.cache,
        revision: input.revision,
        execution: input.execution,
        batcher: input.finalBatcher,
      });
      provenanceRecords.push(adjudicated.provenance);
      final = guardSourceGroundedBeatPass(input.payload, adjudicated.judgement);
      escalationStatus = "FINAL_ADJUDICATION";
    }
  }
  return {
    beatId: input.payload.beatId,
    sceneId: input.payload.sceneId,
    assetId: input.assetId,
    judgement: final,
    escalationStatus,
    modelPolicyIdentity: input.policy.policyIdentity,
    cacheHit: provenanceRecords.every((record) => record.cacheHit),
    inputHash: provenanceRecords.at(-1)!.inputHash,
    outputHash: stableHash(final),
    provenance: provenanceRecords,
  };
}

async function cachedDirective(input: {
  readonly payload: SemanticRemediationAdvisorInput;
  readonly policy: SourceGroundedVisualQaPolicy;
  readonly advisor: SemanticRemediationAdvisorPort;
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly revision: QaRevision;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly scheduler: SourceGroundedQaScheduler;
  readonly batcher: AdvisorMicroBatcher;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly directive: SemanticRemediationDirective | null;
  readonly provenance: SourceGroundedEvaluationProvenance;
}> {
  const key = sourceGroundedRemediationCacheKey({
    payload: input.payload,
    policyIdentity: input.policy.policyIdentity,
    model: input.policy.remediationAdvisor,
  });
  const cached = (await input.cache.get(
    key
  )) as CachedEvaluation<SemanticRemediationDirective> | null;
  const cachedDirective = semanticRemediationDirectiveSchema.safeParse(
    cached?.value
  );
  if (
    cached?.schemaVersion === "veronica-source-grounded-cache-record.v1" &&
    cachedDirective.success &&
    semanticRemediationDirectiveConsistencyReasons(cachedDirective.data)
      .length === 0 &&
    cached.outputHash === stableHash(cached.value) &&
    cached.provenance.revisionId === input.revision.revisionId
  ) {
    return {
      directive: cachedDirective.data,
      provenance: cacheHitProvenance({
        cached: cached.provenance,
        revisionId: input.revision.revisionId,
        execution: input.execution,
      }),
    };
  }
  const negative = await activeNegativeCache(input.cache, key, input.execution);
  if (negative) {
    return {
      directive: null,
      provenance: provenance({
        component: "REMEDIATION_ADVISOR",
        model: input.policy.remediationAdvisor,
        instructionVersion: SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION,
        inputHash: key,
        value: { unavailable: true, reason: negative.reason },
        verdict: "UNAVAILABLE",
        defectCodes: input.payload.judgement.defectCodes,
        cacheHit: true,
        escalationStatus: "NOT_ESCALATED",
        revisionId: input.revision.revisionId,
        execution: input.execution,
        providerCall: false,
        providerRequestCountContribution: 0,
      }),
    };
  }
  const singleFlight = await runSourceGroundedSingleFlight(key, async () => {
    let result: SourceGroundedProviderResult | undefined;
    let workTelemetry: SourceGroundedQaWorkTelemetry | undefined;
    let providerRequestCountContribution: 0 | 1 = 0;
    let batchSize = 1;
    let directive: SemanticRemediationDirective | null = null;
    let failureKind: CachedOperationalFailure["kind"] | null = null;
    try {
      const batched = await input.batcher.submit(input.payload);
      result = batched.providerResult;
      workTelemetry = batched.workTelemetry;
      providerRequestCountContribution =
        batched.providerRequestCountContribution;
      batchSize = batched.batchSize;
      const parsed = semanticRemediationDirectiveSchema.safeParse(
        stripStructuredOutputNulls(result.output)
      );
      if (
        parsed.success &&
        semanticRemediationDirectiveConsistencyReasons(parsed.data).length ===
          0
      )
        directive = parsed.data;
      else failureKind = "DETERMINISTIC_MALFORMED";
    } catch (error) {
      if (error instanceof SourceGroundedQaAdmissionError) throw error;
      failureKind = transientFailureKind(error);
      // A typed null is fail-closed and surfaced as unavailable.
    }
    const valueForHash = directive ?? { unavailable: true };
    return {
      directive,
      provenance: provenance({
        component: "REMEDIATION_ADVISOR",
        model: input.policy.remediationAdvisor,
        instructionVersion: SOURCE_GROUNDED_REMEDIATION_INSTRUCTION_VERSION,
        inputHash: key,
        value: valueForHash,
        verdict: directive ? input.payload.judgement.verdict : "UNAVAILABLE",
        defectCodes: input.payload.judgement.defectCodes,
        cacheHit: false,
        escalationStatus:
          input.payload.judgement.verdict === "REVIEW"
            ? "ESCALATED"
            : "NOT_ESCALATED",
        revisionId: input.revision.revisionId,
        execution: input.execution,
        ...(workTelemetry ? { workTelemetry } : {}),
        ...(result ? { providerResult: result } : {}),
        providerRequestCountContribution,
        batchSize,
      }),
      failureKind,
    };
  });
  const recordProvenance = singleFlight.deduplicated
    ? {
        ...singleFlight.value.provenance,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        providerCall: false,
        providerRequestCountContribution: 0 as const,
        singleFlightDeduplicated: true,
      }
    : singleFlight.value.provenance;
  if (singleFlight.value.directive) {
    await input.cache.set(key, {
      schemaVersion: "veronica-source-grounded-cache-record.v1",
      value: singleFlight.value.directive,
      outputHash: stableHash(singleFlight.value.directive),
      provenance: singleFlight.value.provenance,
    } satisfies CachedEvaluation<SemanticRemediationDirective>);
  } else if (singleFlight.value.failureKind) {
    await cacheOperationalFailure({
      cache: input.cache,
      identity: key,
      kind: singleFlight.value.failureKind,
      reason: "Remediation advisor returned no valid directive.",
      execution: input.execution,
    });
  }
  return {
    directive: singleFlight.value.directive,
    provenance: recordProvenance,
  };
}

async function cachedSequence(input: {
  readonly episodeId: string;
  readonly scenes: readonly EpisodeSequenceSceneSummary[];
  readonly policy: SourceGroundedVisualQaPolicy;
  readonly judge: EpisodeSequenceJudgePort;
  readonly model: SourceGroundedModelTier;
  readonly component: Extract<
    SourceGroundedEvaluationProvenance["component"],
    "SEQUENCE_JUDGE" | "SEQUENCE_JUDGE_FINAL"
  >;
  readonly escalationStatus: SourceGroundedEvaluationProvenance["escalationStatus"];
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly revision: QaRevision;
  readonly execution: SourceGroundedQaExecutionPolicy;
  readonly scheduler: SourceGroundedQaScheduler;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly judgement: EpisodeSequenceJudgement;
  readonly provenance: SourceGroundedEvaluationProvenance;
}> {
  const key = sourceGroundedSequenceCacheKey({
    scenes: input.scenes,
    policyIdentity: input.policy.policyIdentity,
    model: input.model,
  });
  const cached = (await input.cache.get(
    key
  )) as CachedEvaluation<EpisodeSequenceJudgement> | null;
  if (
    cached?.schemaVersion === "veronica-source-grounded-cache-record.v1" &&
    episodeSequenceJudgementSchema.safeParse(cached.value).success &&
    cached.outputHash === stableHash(cached.value) &&
    cached.provenance.revisionId === input.revision.revisionId
  ) {
    return {
      judgement: episodeSequenceJudgementSchema.parse(cached.value),
      provenance: cacheHitProvenance({
        cached: cached.provenance,
        revisionId: input.revision.revisionId,
        execution: input.execution,
      }),
    };
  }
  const negative = await activeNegativeCache(input.cache, key, input.execution);
  if (negative) {
    const judgement = unavailableSequence(
      `Sequence judge suppressed by ${negative.kind.toLowerCase()} backoff: ${negative.reason}`
    );
    return {
      judgement,
      provenance: provenance({
        component: input.component,
        model: input.model,
        instructionVersion: SOURCE_GROUNDED_SEQUENCE_INSTRUCTION_VERSION,
        inputHash: key,
        value: judgement,
        verdict: judgement.verdict,
        defectCodes: judgement.defectCodes,
        cacheHit: true,
        escalationStatus: input.escalationStatus,
        revisionId: input.revision.revisionId,
        execution: input.execution,
        providerCall: false,
        providerRequestCountContribution: 0,
      }),
    };
  }
  const singleFlight = await runSourceGroundedSingleFlight(key, async () => {
    let providerResult: SourceGroundedProviderResult | undefined;
    let workTelemetry: SourceGroundedQaWorkTelemetry | undefined;
    let judgement: EpisodeSequenceJudgement;
    let failureKind: CachedOperationalFailure["kind"] | null = null;
    try {
      const scheduled = await input.scheduler.run({
        packId: input.episodeId,
        priority: 40,
        estimatedTokens: estimatedRequestTokens(
          input.scenes,
          input.model
        ),
        execution: input.execution,
        provider: providerReservation({
          payload: input.scenes,
          instructions: SOURCE_GROUNDED_SEQUENCE_JUDGE_INSTRUCTIONS,
          model: input.model,
          execution: input.execution,
        }),
        ...(input.signal ? { signal: input.signal } : {}),
        task: (signal) =>
          input.judge.judgeSequence({
            episodeId: input.episodeId,
            scenes: input.scenes,
            model: input.model,
            instructions: SOURCE_GROUNDED_SEQUENCE_JUDGE_INSTRUCTIONS,
            instructionVersion: SOURCE_GROUNDED_SEQUENCE_INSTRUCTION_VERSION,
            jsonSchema: episodeSequenceJudgementJsonSchema,
            cachePolicy: providerCachePolicy({
              family: "sequence",
              instructionVersion: SOURCE_GROUNDED_SEQUENCE_INSTRUCTION_VERSION,
              model: input.model,
              execution: input.execution,
            }),
            execution: input.execution,
            ...(signal ? { signal } : {}),
          }),
      });
      providerResult = scheduled.value;
      workTelemetry = scheduled.telemetry;
      const parsed = episodeSequenceJudgementSchema.safeParse(
        stripStructuredOutputNulls(providerResult.output)
      );
      failureKind = parsed.success ? null : "DETERMINISTIC_MALFORMED";
      judgement = parsed.success
        ? parsed.data
        : unavailableSequence(
            "Sequence judge returned malformed structured output."
          );
    } catch (error) {
      if (error instanceof SourceGroundedQaAdmissionError) throw error;
      failureKind = transientFailureKind(error);
      judgement = unavailableSequence(
        `Sequence judge unavailable: ${error instanceof Error ? error.message : "provider failure"}`
      );
    }
    if (judgement.verdict === "PASS" && judgement.defectCodes.length > 0) {
      judgement = unavailableSequence(
        "Sequence judge returned inconsistent PASS with defect codes."
      );
    }
    if (judgement.verdict === "BLOCK" && judgement.defectCodes.length === 0) {
      judgement = unavailableSequence(
        "Sequence judge returned inconsistent BLOCK without defect codes."
      );
    }
    return {
      judgement,
      provenance: provenance({
        component: input.component,
        model: input.model,
        instructionVersion: SOURCE_GROUNDED_SEQUENCE_INSTRUCTION_VERSION,
        inputHash: key,
        value: judgement,
        verdict: judgement.verdict,
        defectCodes: judgement.defectCodes,
        cacheHit: false,
        escalationStatus: input.escalationStatus,
        revisionId: input.revision.revisionId,
        execution: input.execution,
        ...(workTelemetry ? { workTelemetry } : {}),
        ...(providerResult ? { providerResult } : {}),
      }),
      failureKind,
    };
  });
  const recordProvenance = singleFlight.deduplicated
    ? {
        ...singleFlight.value.provenance,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        providerCall: false,
        singleFlightDeduplicated: true,
      }
    : singleFlight.value.provenance;
  if (singleFlight.value.judgement.verdict !== "UNAVAILABLE") {
    await input.cache.set(key, {
      schemaVersion: "veronica-source-grounded-cache-record.v1",
      value: singleFlight.value.judgement,
      outputHash: stableHash(singleFlight.value.judgement),
      provenance: singleFlight.value.provenance,
    } satisfies CachedEvaluation<EpisodeSequenceJudgement>);
  } else if (singleFlight.value.failureKind) {
    await cacheOperationalFailure({
      cache: input.cache,
      identity: key,
      kind: singleFlight.value.failureKind,
      reason: singleFlight.value.judgement.reason,
      execution: input.execution,
    });
  }
  return {
    judgement: singleFlight.value.judgement,
    provenance: recordProvenance,
  };
}

function sequenceSummary(
  plan: PositioningVisualPlanV2,
  evaluations: readonly SourceGroundedSceneEvaluation[],
  beatEvaluations: readonly SourceGroundedVisualBeatEvaluation[]
): readonly EpisodeSequenceSceneSummary[] {
  if (plan.visualBeatPlan) {
    return plan.visualBeatPlan.beats.map((beat) => {
      const asset = plan.assets.find((candidate) => candidate.visualBeatId === beat.beatId);
      const evaluation = beatEvaluations.find((candidate) => candidate.beatId === beat.beatId);
      return {
        sceneId: beat.beatId,
        semanticSceneId: beat.sceneId,
        visualBeatId: beat.beatId,
        narrationThesis: beat.coreMeaning,
        visibleThesis: beat.visualThesis,
        newInformation: beat.newInformation,
        environment: beat.environment,
        actor: beat.subject,
        action: beat.action,
        composition: beat.composition.description,
        assetDecision: beat.assetDecision,
        ...(asset ? { providerPromptHash: stableHash(asset.prompt) } : {}),
        sourceGroundedVerdict:
          evaluation?.judgement.verdict === "PASS"
            ? "PASS"
            : evaluation?.judgement.verdict === "BLOCK"
              ? "BLOCK"
              : "REVIEW",
      };
    });
  }
  return plan.scenes.map((scene, index) => ({
    sceneId: scene.sceneId,
    narrationThesis:
      scene.semanticProposition?.narrationClaim ?? scene.narrationAnchor,
    environment: scene.treatment.environment,
    actor: scene.treatment.subjectRequirement,
    action: scene.treatment.action,
    dominantProps: scene.treatment.props.slice(0, 4),
    composition: scene.treatment.composition,
    ...(scene.semanticProposition?.visualMechanism
      ? { visualMechanism: scene.semanticProposition.visualMechanism }
      : {}),
    ...(plan.selectedRecurringMotif?.sceneIds.includes(scene.sceneId)
      ? { motif: plan.selectedRecurringMotif.concept }
      : {}),
    sourceGroundedVerdict:
      evaluations[index]?.judgement.verdict === "PASS"
        ? "PASS"
        : evaluations[index]?.judgement.verdict === "BLOCK"
          ? "BLOCK"
          : "REVIEW",
  }));
}

function downstreamInvalidation(
  boundary: SemanticFaultBoundary
): readonly string[] {
  const graph = [
    "SEMANTIC_EXTRACTION",
    "STATE_MODEL",
    "VISUAL_MECHANISM",
    "TREATMENT",
    "PROVIDER_PROJECTION",
    "SCENE_JUDGEMENT",
    "SEQUENCE_SUMMARY",
    "SEQUENCE_JUDGEMENT",
    "READINESS",
  ] as const;
  if (boundary === "SEGMENTATION") return [...graph, "TIMING", "VISUAL_EVENTS"];
  const index = graph.indexOf(
    boundary === "UNKNOWN" ? "SEMANTIC_EXTRACTION" : boundary
  );
  return graph.slice(Math.max(0, index));
}

export function deterministicRemediationDirective(input: {
  readonly scene: SourceGroundedSceneJudgementInput;
  readonly judgement: SourceGroundedSceneJudgement;
}): SemanticRemediationDirective | null {
  if (input.judgement.verdict !== "BLOCK") return null;
  const routeBoundary: Readonly<
    Partial<Record<RemediationRoute, SemanticFaultBoundary>>
  > = {
    REBUILD_SEMANTICS: "SEMANTIC_EXTRACTION",
    REBUILD_STATE_MODEL: "STATE_MODEL",
    REBUILD_VISUAL_MECHANISM: "VISUAL_MECHANISM",
    REBUILD_TREATMENT: "TREATMENT",
    RESEGMENT: "SEGMENTATION",
    REPROJECT_PROVIDER_PROMPT: "PROVIDER_PROJECTION",
  };
  if (
    routeBoundary[input.judgement.remediationRoute] !==
      input.judgement.earliestFaultBoundary ||
    input.judgement.defectCodes.length === 0
  ) {
    return null;
  }
  const expected = input.judgement.expectedSourceSemantics;
  const replacesSemanticExtraction =
    input.judgement.earliestFaultBoundary === "SEMANTIC_EXTRACTION";
  // A semantic replacement must select a new canonical mechanism from source
  // meaning. The current mechanism is diagnosed as rejected at this boundary,
  // so never copy it or reconstruct one from free-form judge wording here.
  if (replacesSemanticExtraction) return null;
  const existingMechanism = z
    .enum(VERONICA_RESOLVED_VISUAL_MECHANISMS)
    .safeParse(input.scene.semantic.visualMechanism);
  const existingActionOwner = z
    .enum(["expert", "buyer", "business-operator"])
    .safeParse(input.scene.semantic.actionOwner);
  if (
    !existingMechanism.success ||
    !existingActionOwner.success ||
    VERONICA_VISUAL_MECHANISM_ACTION_OWNER[existingMechanism.data] !==
      existingActionOwner.data
  )
    return null;
  if (
    input.judgement.earliestFaultBoundary !== "SEGMENTATION" &&
    !expected &&
    !(
      input.judgement.earliestFaultBoundary === "PROVIDER_PROJECTION" &&
      input.judgement.defectCodes.every(
        (code) => code === "TEXT_DEPENDENCY_CONFLICT"
      )
    )
  ) {
    return null;
  }
  return {
    schemaVersion: SOURCE_GROUNDED_REMEDIATION_SCHEMA_VERSION,
    repairBoundary: input.judgement
      .earliestFaultBoundary as Exclude<SemanticFaultBoundary, "UNKNOWN">,
    visualMechanism: existingMechanism.data,
    actionOwnerRole: existingActionOwner.data,
    sourceSemantics: {
      ...(expected?.actorRole ? { actorRole: expected.actorRole } : {}),
      ...(expected?.actionOwner ? { actionOwner: expected.actionOwner } : {}),
      ...(input.scene.semantic.action
        ? { action: input.scene.semantic.action }
        : {}),
      ...(expected?.causalDirection
        ? { causalDirection: expected.causalDirection }
        : {}),
      ...(expected?.polarity ? { polarity: expected.polarity } : {}),
      ...(input.scene.semantic.consequence
        ? { consequence: input.scene.semantic.consequence }
        : {}),
    },
    requiredVisibleEvidence: [
      ...(expected?.requiredVisibleEvidence ?? []),
    ].slice(0, 12),
    requiredDomainObjects: [...(expected?.requiredDomainObjects ?? [])].slice(
      0,
      12
    ),
    forbiddenMisinterpretations: [
      "Do not depend on readable text, labels, captions, or interface copy.",
    ],
    ...(input.judgement.earliestFaultBoundary === "SEGMENTATION"
      ? {
          segmentation: {
            splitRequired: true,
            semanticTransitions: [],
          },
        }
      : {}),
    reason:
      input.judgement.earliestFaultBoundary === "SEGMENTATION"
        ? "The judge localized severe under-coverage to segmentation; canonical scene allocation requires human timing ownership."
        : "The judge supplied an unambiguous repair boundary and typed source-grounded replacement constraints.",
  };
}

const repairPrecedence: Readonly<
  Record<Exclude<SemanticFaultBoundary, "UNKNOWN">, number>
> = {
  SEGMENTATION: 0,
  SEMANTIC_EXTRACTION: 1,
  STATE_MODEL: 2,
  VISUAL_MECHANISM: 3,
  TREATMENT: 4,
  PROVIDER_PROJECTION: 5,
};

export function coalesceSourceGroundedRemediationDirectives(
  directives: readonly {
    readonly sceneId: string;
    readonly directive: SemanticRemediationDirective;
  }[]
): readonly {
  readonly sceneId: string;
  readonly directive: SemanticRemediationDirective;
}[] {
  const byScene = new Map<string, (typeof directives)[number]>();
  for (const candidate of directives) {
    const existing = byScene.get(candidate.sceneId);
    if (
      !existing ||
      repairPrecedence[candidate.directive.repairBoundary] <
        repairPrecedence[existing.directive.repairBoundary]
    ) {
      byScene.set(candidate.sceneId, candidate);
    }
  }
  return [...byScene.values()].sort(
    (left, right) =>
      repairPrecedence[left.directive.repairBoundary] -
        repairPrecedence[right.directive.repairBoundary] ||
      left.sceneId.localeCompare(right.sceneId)
  );
}

export async function runSourceGroundedVisualQaController(input: {
  readonly plan: PositioningVisualPlanV2;
  readonly narrationByScene: readonly string[];
  readonly policy: SourceGroundedVisualQaPolicy;
  readonly primaryJudge?: SourceGroundedSceneJudgePort;
  readonly escalationJudge?: SourceGroundedSceneJudgePort;
  readonly finalJudge?: SourceGroundedSceneJudgePort;
  readonly remediationAdvisor?: SemanticRemediationAdvisorPort;
  readonly sequenceJudge?: EpisodeSequenceJudgePort;
  readonly cache: SourceGroundedVisualQaCachePort;
  readonly scheduler?: SourceGroundedQaScheduler;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SourceGroundedQaProgress) => void;
  readonly onCheckpoint?: (checkpoint: {
    readonly stage: "SCENES" | "BEATS" | "SEQUENCE";
    /** Completeness of this stage, never a substitute for final admission. */
    readonly completeness: "COMPLETE" | "INCOMPLETE" | "FAILED";
    readonly revision: QaRevision;
    readonly scenes: readonly SourceGroundedSceneEvaluation[];
    readonly beats: readonly SourceGroundedVisualBeatEvaluation[];
    readonly sequence?: EpisodeSequenceJudgement;
  }) => Promise<void>;
  readonly regenerate?: (input: {
    readonly plan: PositioningVisualPlanV2;
    readonly directives: readonly {
      readonly sceneId: string;
      readonly directive: SemanticRemediationDirective;
    }[];
    readonly round: number;
  }) => Promise<PositioningVisualPlanV2>;
}): Promise<{
  readonly plan: PositioningVisualPlanV2;
  readonly qa: SourceGroundedVisualQaResult;
}> {
  const startedAt = Date.now();
  const execution =
    input.policy.execution ?? sourceGroundedQaExecutionPolicy("INTERACTIVE");
  const scheduler = input.scheduler ?? globalSourceGroundedQaScheduler;
  let plan = input.plan;
  let finalRevision = buildSourceGroundedQaRevision({
    plan,
    narrationByScene: input.narrationByScene,
    policy: input.policy,
  });
  const remediationHistory: SourceGroundedRemediationHistory[] = [];
  const allProvenance: SourceGroundedEvaluationProvenance[] = [];
  let advisorBypassCount = 0;
  let noOpRemediationCount = 0;
  let rejudgeRequestCount = 0;
  let scenesRejudged = 0;

  const evaluateAll = async (options: {
    readonly previous?: readonly SourceGroundedSceneEvaluation[];
    readonly sceneIds?: ReadonlySet<string>;
  } = {}): Promise<SourceGroundedSceneEvaluation[]> => {
    const primaryJudge = input.primaryJudge;
    if (!input.policy.enabled || !primaryJudge) {
      return plan.scenes.map((scene) => {
        const judgement = unavailableScene(
          !input.policy.enabled
            ? "Source-grounded visual QA is disabled by policy."
            : "Source-grounded scene judge port is not composed."
        );
        return {
          sceneId: scene.sceneId,
          judgement,
          escalationStatus: "NOT_ESCALATED",
          modelPolicyIdentity: input.policy.policyIdentity,
          cacheHit: false,
          inputHash: stableHash({ sceneId: scene.sceneId, unavailable: true }),
          outputHash: stableHash(judgement),
          provenance: [],
        };
      });
    }
    for (let revisionAttempt = 0; revisionAttempt < 2; revisionAttempt += 1) {
      const wavePlan = plan;
      const revision = buildSourceGroundedQaRevision({
        plan: wavePlan,
        narrationByScene: input.narrationByScene,
        policy: input.policy,
      });
      const payloads = wavePlan.scenes.map((scene, index) => ({
        sceneId: scene.sceneId,
        payload: inputForScene(
          wavePlan,
          scene,
          wavePlan.assets.filter((asset) => asset.sceneId === scene.sceneId),
          input.narrationByScene[index] ?? scene.narrationAnchor
        ),
      }));
      const selected = options.sceneIds
        ? payloads.filter((entry) => options.sceneIds!.has(entry.sceneId))
        : payloads;
      const sceneBatchSize =
        wavePlan.format === "short"
          ? execution.shortSceneBatchSize
          : execution.longFormSceneBatchSize;
      const primaryBatcher = new SceneJudgeMicroBatcher({
        judge: primaryJudge,
        model: input.policy.sceneJudge,
        execution,
        scheduler,
        batchSize: sceneBatchSize,
        priority: 30,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      const escalationBatcher = input.escalationJudge
        ? new SceneJudgeMicroBatcher({
            judge: input.escalationJudge,
            model: input.policy.escalation,
            execution,
            scheduler,
            batchSize: sceneBatchSize,
            priority: 20,
            ...(input.signal ? { signal: input.signal } : {}),
          })
        : undefined;
      const finalBatcher =
        input.finalJudge && input.policy.finalAdjudication
          ? new SceneJudgeMicroBatcher({
              judge: input.finalJudge,
              model: input.policy.finalAdjudication,
              execution,
              scheduler,
              batchSize: sceneBatchSize,
              priority: 20,
              ...(input.signal ? { signal: input.signal } : {}),
            })
          : undefined;
      let completed = 0;
      let cached = 0;
      let api = 0;
      let review = 0;
      let transportFailures = 0;
      const results = await Promise.all(
        selected.map(async ({ payload }) => {
          const evaluated = await evaluateScene({
            payload,
            policy: input.policy,
            primaryJudge,
            ...(input.escalationJudge
              ? { escalationJudge: input.escalationJudge }
              : {}),
            ...(input.finalJudge ? { finalJudge: input.finalJudge } : {}),
            cache: input.cache,
            revision,
            execution,
            scheduler,
            primaryBatcher,
            ...(escalationBatcher ? { escalationBatcher } : {}),
            ...(finalBatcher ? { finalBatcher } : {}),
            ...(input.signal ? { signal: input.signal } : {}),
          });
          completed += 1;
          if (evaluated.cacheHit) cached += 1;
          api += evaluated.provenance.reduce(
            (sum, entry) =>
              sum +
              (entry.providerRequestCountContribution ??
                (entry.providerCall ? 1 : 0)),
            0
          );
          if (evaluated.judgement.verdict === "REVIEW") review += 1;
          if (evaluated.judgement.verdict === "UNAVAILABLE")
            transportFailures += 1;
          const schedulerSnapshot = scheduler.snapshot();
          input.onProgress?.({
            completed,
            total: selected.length,
            cached,
            api,
            inFlight: schedulerSnapshot.inFlight,
            review,
            transportFailures,
            providerCallsReserved:
              schedulerSnapshot.providerCallsReserved,
            estimatedCostUsd: schedulerSnapshot.estimatedCostUsd,
            budgetStatus: schedulerSnapshot.budgetStatus,
          });
          return evaluated;
        })
      );
      const observedRevision = buildSourceGroundedQaRevision({
        plan: wavePlan,
        narrationByScene: input.narrationByScene,
        policy: input.policy,
      });
      if (observedRevision.revisionId === revision.revisionId) {
        finalRevision = revision;
        for (const result of results) allProvenance.push(...result.provenance);
        if (!options.previous || !options.sceneIds) return results;
        const replacements = new Map(
          results.map((result) => [result.sceneId, result] as const)
        );
        return wavePlan.scenes.map(
          (scene) =>
            replacements.get(scene.sceneId) ??
            options.previous!.find(
              (evaluation) => evaluation.sceneId === scene.sceneId
            )!
        );
      }
    }
    return plan.scenes.map((scene) => {
      const judgement = unavailableScene(
        "Episode dependencies changed during two evaluation waves; mixed revision results were rejected."
      );
      return {
        sceneId: scene.sceneId,
        judgement,
        escalationStatus: "NOT_ESCALATED",
        modelPolicyIdentity: input.policy.policyIdentity,
        cacheHit: false,
        inputHash: finalRevision.revisionId,
        outputHash: stableHash(judgement),
        provenance: [],
      };
    });
  };

  let evaluations = await evaluateAll();
  for (let round = 1; round <= input.policy.maxRemediationRounds; round += 1) {
    const targets = evaluations.filter(
      (evaluation) =>
        evaluation.judgement.verdict === "BLOCK" ||
        (input.policy.remediateReview &&
          evaluation.judgement.verdict === "REVIEW")
    );
    if (targets.length === 0) break;
    if (!input.regenerate) {
      for (const target of targets) {
        remediationHistory.push({
          sceneId: target.sceneId,
          regenerationRound: round,
          originalJudgement: target.judgement,
          directive: null,
          repairBoundary: target.judgement.earliestFaultBoundary,
          downstreamInvalidation: downstreamInvalidation(
            target.judgement.earliestFaultBoundary
          ),
          exhausted: true,
          provenance: [],
        });
      }
      break;
    }
    const directives: {
      readonly sceneId: string;
      readonly directive: SemanticRemediationDirective;
    }[] = [];
    const advisorBatcher = input.remediationAdvisor
      ? new AdvisorMicroBatcher({
          advisor: input.remediationAdvisor,
          model: input.policy.remediationAdvisor,
          execution,
          scheduler,
          ...(input.signal ? { signal: input.signal } : {}),
        })
      : undefined;
    const plannedDirectives = await Promise.all(
      targets.map(async (target) => {
        const sceneIndex = plan.scenes.findIndex(
          (scene) => scene.sceneId === target.sceneId
        );
        const scene = plan.scenes[sceneIndex]!;
        const payload = inputForScene(
          plan,
          scene,
          plan.assets.filter((asset) => asset.sceneId === scene.sceneId),
          input.narrationByScene[sceneIndex] ?? scene.narrationAnchor
        );
        const deterministic = deterministicRemediationDirective({
          scene: payload,
          judgement: target.judgement,
        });
        if (deterministic) {
          advisorBypassCount += 1;
          return { target, directive: deterministic, provenance: [] as const };
        }
        if (!input.remediationAdvisor) {
          return { target, directive: null, provenance: [] as const };
        }
        const advised = await cachedDirective({
          payload: {
            scene: payload,
            judgement: target.judgement,
            constraints: payload.constraints,
          },
          policy: input.policy,
          advisor: input.remediationAdvisor,
          cache: input.cache,
          revision: finalRevision,
          execution,
          scheduler,
          batcher: advisorBatcher!,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        return {
          target,
          directive: advised.directive,
          provenance: [advised.provenance] as const,
        };
      })
    );
    for (const planned of plannedDirectives) {
      allProvenance.push(...planned.provenance);
      remediationHistory.push({
        sceneId: planned.target.sceneId,
        regenerationRound: round,
        originalJudgement: planned.target.judgement,
        directive: planned.directive,
        repairBoundary:
          planned.directive?.repairBoundary ??
          planned.target.judgement.earliestFaultBoundary,
        downstreamInvalidation: downstreamInvalidation(
          planned.directive?.repairBoundary ??
            planned.target.judgement.earliestFaultBoundary
        ),
        exhausted: planned.directive === null,
        provenance: planned.provenance,
      });
      if (planned.directive) {
        directives.push({
          sceneId: planned.target.sceneId,
          directive: planned.directive,
        });
      }
    }
    if (directives.length === 0) break;
    const judgementInputHashesBefore = new Map(
      plan.scenes.map((scene, index) => [
        scene.sceneId,
        sourceGroundedJudgementInputSemanticHash(
          inputForScene(
            plan,
            scene,
            plan.assets.filter((asset) => asset.sceneId === scene.sceneId),
            input.narrationByScene[index] ?? scene.narrationAnchor
          )
        ),
      ])
    );
    const regenerated = await input.regenerate({
      plan,
      directives: coalesceSourceGroundedRemediationDirectives(directives),
      round,
    });
    const changedSceneIds = new Set(
      regenerated.scenes
        .filter((scene, index) => {
          const after = sourceGroundedJudgementInputSemanticHash(
            inputForScene(
              regenerated,
              scene,
              regenerated.assets.filter(
                (asset) => asset.sceneId === scene.sceneId
              ),
              input.narrationByScene[index] ?? scene.narrationAnchor
            )
          );
          return judgementInputHashesBefore.get(scene.sceneId) !== after;
        })
        .map((scene) => scene.sceneId)
    );
    plan = regenerated;
    if (changedSceneIds.size === 0) {
      noOpRemediationCount += directives.length;
      for (const history of remediationHistory.filter(
        (entry) => entry.regenerationRound === round
      )) {
        Object.assign(history, {
          noSemanticChange: true,
          exhausted: true,
        });
      }
      finalRevision = buildSourceGroundedQaRevision({
        plan,
        narrationByScene: input.narrationByScene,
        policy: input.policy,
      });
      break;
    }
    scenesRejudged += changedSceneIds.size;
    const provenanceBeforeRejudge = allProvenance.length;
    evaluations = await evaluateAll({
      previous: evaluations,
      sceneIds: changedSceneIds,
    });
    rejudgeRequestCount += allProvenance
      .slice(provenanceBeforeRejudge)
      .reduce(
        (sum, entry) =>
          sum +
          (entry.providerRequestCountContribution ??
            (entry.providerCall ? 1 : 0)),
        0
      );
    for (const history of remediationHistory.filter(
      (entry) => entry.regenerationRound === round
    )) {
      const post = evaluations.find(
        (evaluation) => evaluation.sceneId === history.sceneId
      );
      if (post) {
        Object.assign(history, {
          postRemediationJudgement: post.judgement,
          exhausted:
            round === input.policy.maxRemediationRounds &&
            post.judgement.verdict !== "PASS",
        });
      }
    }
    if (
      evaluations.every((evaluation) => evaluation.judgement.verdict === "PASS")
    ) {
      break;
    }
  }

  finalRevision = buildSourceGroundedQaRevision({
    plan,
    narrationByScene: input.narrationByScene,
    policy: input.policy,
  });
  await input.onCheckpoint?.({
    stage: "SCENES",
    completeness: "COMPLETE",
    revision: finalRevision,
    scenes: evaluations,
    beats: [],
  });
  const requiredBeats = plan.visualBeatPlan?.beats.filter(
    (beat) => beat.assetDecision === "new-image"
  ) ?? [];
  const parentScenesReady = evaluations.every(
    (evaluation) => evaluation.judgement.verdict === "PASS"
  );
  let beatEvaluations: SourceGroundedVisualBeatEvaluation[] = [];
  if (
    requiredBeats.length > 0 &&
    (!parentScenesReady || !input.policy.enabled || !input.primaryJudge)
  ) {
    beatEvaluations = requiredBeats.map((beat) => {
      const judgement = unavailableBeat(
        !parentScenesReady
          ? "Source-grounded beat judgement deferred until every parent scene passes."
          : !input.policy.enabled
          ? "Source-grounded visual QA is disabled by policy."
          : "Source-grounded visual beat judge port is not composed."
      );
      const asset = plan.assets.find((candidate) => candidate.visualBeatId === beat.beatId);
      return {
        beatId: beat.beatId,
        sceneId: beat.sceneId,
        assetId: asset?.assetId ?? `missing:${beat.beatId}`,
        judgement,
        escalationStatus: "NOT_ESCALATED",
        modelPolicyIdentity: input.policy.policyIdentity,
        cacheHit: false,
        inputHash: stableHash({ beatId: beat.beatId, unavailable: true }),
        outputHash: stableHash(judgement),
        provenance: [],
      };
    });
  } else if (requiredBeats.length > 0 && input.primaryJudge) {
    const beatBatchSize = plan.format === "short"
      ? execution.shortSceneBatchSize
      : execution.longFormSceneBatchSize;
    const beatBatcherOptions = {
      instructions: SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTIONS,
      instructionVersion: SOURCE_GROUNDED_BEAT_JUDGE_INSTRUCTION_VERSION,
      jsonSchema: sourceGroundedVisualBeatJudgementJsonSchema,
      cacheFamily: "beat" as const,
    };
    const primaryBatcher = new SceneJudgeMicroBatcher({
      judge: input.primaryJudge,
      model: input.policy.sceneJudge,
      execution,
      scheduler,
      batchSize: beatBatchSize,
      priority: 30,
      ...beatBatcherOptions,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const escalationBatcher = input.escalationJudge
      ? new SceneJudgeMicroBatcher({
          judge: input.escalationJudge,
          model: input.policy.escalation,
          execution,
          scheduler,
          batchSize: beatBatchSize,
          priority: 20,
          ...beatBatcherOptions,
          ...(input.signal ? { signal: input.signal } : {}),
        })
      : undefined;
    const finalBatcher = input.finalJudge && input.policy.finalAdjudication
      ? new SceneJudgeMicroBatcher({
          judge: input.finalJudge,
          model: input.policy.finalAdjudication,
          execution,
          scheduler,
          batchSize: beatBatchSize,
          priority: 20,
          ...beatBatcherOptions,
          ...(input.signal ? { signal: input.signal } : {}),
        })
      : undefined;
    beatEvaluations = await Promise.all(requiredBeats.map(async (beat) => {
      const sceneIndex = plan.scenes.findIndex((scene) => scene.sceneId === beat.sceneId);
      const scene = plan.scenes[sceneIndex];
      const asset = plan.assets.find((candidate) => candidate.visualBeatId === beat.beatId);
      if (!scene || !asset) {
        const judgement = unavailableBeat(`Beat ${beat.beatId} is missing its parent scene or dedicated provider asset.`);
        return {
          beatId: beat.beatId,
          sceneId: beat.sceneId,
          assetId: asset?.assetId ?? `missing:${beat.beatId}`,
          judgement,
          escalationStatus: "NOT_ESCALATED" as const,
          modelPolicyIdentity: input.policy.policyIdentity,
          cacheHit: false,
          inputHash: stableHash({ beatId: beat.beatId, missingDependency: true }),
          outputHash: stableHash(judgement),
          provenance: [],
        };
      }
      const evaluated = await evaluateBeat({
        payload: inputForBeat(
          plan,
          scene,
          beat,
          asset,
          input.narrationByScene[sceneIndex] ?? scene.narrationAnchor
        ),
        assetId: asset.assetId,
        policy: input.policy,
        cache: input.cache,
        revision: finalRevision,
        execution,
        primaryBatcher,
        ...(escalationBatcher ? { escalationBatcher } : {}),
        ...(finalBatcher ? { finalBatcher } : {}),
      });
      allProvenance.push(...evaluated.provenance);
      return evaluated;
    }));
  }

  await input.onCheckpoint?.({
    stage: "BEATS",
    completeness: "COMPLETE",
    revision: finalRevision,
    scenes: evaluations,
    beats: beatEvaluations,
  });
  const meaningfulSequence =
    evaluations.every((evaluation) => evaluation.judgement.verdict === "PASS") &&
    beatEvaluations.every((evaluation) => evaluation.judgement.verdict === "PASS") &&
    beatEvaluations.length === requiredBeats.length;
  let sequence = unavailableSequence(
    meaningfulSequence
      ? "Source-grounded sequence judge port is not composed."
      : "Sequence judgement deferred until all parent-scene and required visual-beat judgements pass."
  );
  const sequenceProvenance: SourceGroundedEvaluationProvenance[] = [];
  if (meaningfulSequence && input.sequenceJudge) {
    try {
      const evaluated = await cachedSequence({
        episodeId: plan.contentId,
        scenes: sequenceSummary(plan, evaluations, beatEvaluations),
        policy: input.policy,
        judge: input.sequenceJudge,
        model: input.policy.sequenceJudge,
        component: "SEQUENCE_JUDGE",
        escalationStatus: "NOT_ESCALATED",
        cache: input.cache,
        revision: finalRevision,
        execution,
        scheduler,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      sequence = evaluated.judgement;
      sequenceProvenance.push(evaluated.provenance);
      allProvenance.push(evaluated.provenance);
      if (sequence.verdict === "REVIEW" && input.policy.finalAdjudication) {
        const finalModel =
          input.policy.finalSequenceAdjudication ?? input.policy.finalAdjudication;
        const final = await cachedSequence({
          episodeId: plan.contentId,
          scenes: sequenceSummary(plan, evaluations, beatEvaluations),
          policy: input.policy,
          judge: input.sequenceJudge,
          model: finalModel,
          component: "SEQUENCE_JUDGE_FINAL",
          escalationStatus: "FINAL_ADJUDICATION",
          cache: input.cache,
          revision: finalRevision,
          execution,
          scheduler,
          ...(input.signal ? { signal: input.signal } : {}),
        });
        sequence = final.judgement;
        sequenceProvenance.push(final.provenance);
        allProvenance.push(final.provenance);
      }
      await input.onCheckpoint?.({
        stage: "SEQUENCE",
        completeness: sequence.verdict === "UNAVAILABLE" ? "FAILED" : "COMPLETE",
        revision: finalRevision,
        scenes: evaluations,
        beats: beatEvaluations,
        sequence,
      });
    } catch (error) {
      await input.onCheckpoint?.({
        stage: "SEQUENCE",
        completeness: "FAILED",
        revision: finalRevision,
        scenes: evaluations,
        beats: beatEvaluations,
        sequence: unavailableSequence(
          `Sequence judgement failed before completion: ${
            error instanceof Error ? error.message : String(error)
          }`
        ),
      });
      throw error;
    }
  }

  const blockers: SourceGroundedVisualQaResult["blockers"][number][] = [];
  const finalSequenceReviewHandoff =
    sequence.verdict === "REVIEW" &&
    sequenceProvenance.some(
      (entry) =>
        entry.component === "SEQUENCE_JUDGE_FINAL" &&
        entry.escalationStatus === "FINAL_ADJUDICATION"
    );
  if (evaluations.some((entry) => entry.judgement.verdict === "BLOCK"))
    blockers.push("SOURCE_GROUNDED_SCENE_BLOCKED");
  if (evaluations.some((entry) => entry.judgement.verdict === "REVIEW"))
    blockers.push("SOURCE_GROUNDED_SCENE_REVIEW_REQUIRED");
  if (evaluations.some((entry) => entry.judgement.verdict === "UNAVAILABLE"))
    blockers.push("SOURCE_GROUNDED_SCENE_JUDGE_UNAVAILABLE");
  if (requiredBeats.length > 0 && beatEvaluations.length !== requiredBeats.length)
    blockers.push("SOURCE_GROUNDED_BEAT_QA_REQUIRED");
  if (beatEvaluations.some((entry) => entry.judgement.verdict === "BLOCK"))
    blockers.push("SOURCE_GROUNDED_BEAT_BLOCKED");
  if (beatEvaluations.some((entry) => entry.judgement.verdict === "REVIEW"))
    blockers.push("SOURCE_GROUNDED_BEAT_REVIEW_REQUIRED");
  if (beatEvaluations.some((entry) => entry.judgement.verdict === "UNAVAILABLE"))
    blockers.push("SOURCE_GROUNDED_BEAT_JUDGE_UNAVAILABLE");
  if (plan.visualBeatPlan) {
    if (sequence.verdict === "BLOCK") blockers.push("SOURCE_GROUNDED_BEAT_SEQUENCE_BLOCKED");
    if (sequence.verdict === "REVIEW" && !finalSequenceReviewHandoff) blockers.push("SOURCE_GROUNDED_BEAT_SEQUENCE_REVIEW_REQUIRED");
    if (sequence.verdict === "UNAVAILABLE") blockers.push("SOURCE_GROUNDED_BEAT_SEQUENCE_JUDGE_UNAVAILABLE");
  } else {
    if (sequence.verdict === "BLOCK") blockers.push("SOURCE_GROUNDED_SEQUENCE_BLOCKED");
    if (sequence.verdict === "REVIEW" && !finalSequenceReviewHandoff) blockers.push("SOURCE_GROUNDED_SEQUENCE_REVIEW_REQUIRED");
    if (sequence.verdict === "UNAVAILABLE") blockers.push("SOURCE_GROUNDED_SEQUENCE_JUDGE_UNAVAILABLE");
  }
  if (remediationHistory.some((entry) => entry.directive === null))
    blockers.push("SOURCE_GROUNDED_REMEDIATION_UNAVAILABLE");
  if (remediationHistory.some((entry) => entry.exhausted))
    blockers.push("SOURCE_GROUNDED_REMEDIATION_EXHAUSTED");
  if (remediationHistory.some((entry) => entry.noSemanticChange))
    blockers.push("REMEDIATION_NO_SEMANTIC_CHANGE");

  const countVerdict = (verdict: SourceGroundedVerdict) =>
    evaluations.filter((entry) => entry.judgement.verdict === verdict).length;
  const countBeatVerdict = (verdict: SourceGroundedVerdict) =>
    beatEvaluations.filter((entry) => entry.judgement.verdict === verdict).length;
  const budgetSnapshot = scheduler.snapshot();
  const modelDistribution = allProvenance.reduce<Record<string, number>>(
    (counts, entry) => {
      const contribution =
        (entry.providerRequestCountContribution ??
          (entry.providerCall ? 1 : 0)) * Math.max(1, entry.attemptCount);
      if (contribution > 0) {
        counts[entry.model] = (counts[entry.model] ?? 0) + contribution;
      }
      return counts;
    },
    {}
  );
  const aggregate: SourceGroundedVisualQaAggregate = {
    scenePassCount: countVerdict("PASS"),
    sceneReviewCount: countVerdict("REVIEW"),
    sceneBlockCount: countVerdict("BLOCK"),
    sceneUnavailableCount: countVerdict("UNAVAILABLE"),
    scenesEscalated: evaluations.filter(
      (entry) => entry.escalationStatus !== "NOT_ESCALATED"
    ).length,
    scenesRemediated: new Set(
      remediationHistory
        .filter((entry) => entry.directive !== null)
        .map((entry) => entry.sceneId)
    ).size,
    beatPassCount: countBeatVerdict("PASS"),
    beatReviewCount: countBeatVerdict("REVIEW"),
    beatBlockCount: countBeatVerdict("BLOCK"),
    beatUnavailableCount: countBeatVerdict("UNAVAILABLE"),
    beatsEscalated: beatEvaluations.filter(
      (entry) => entry.escalationStatus !== "NOT_ESCALATED"
    ).length,
    beatsRemediated: 0,
    sequenceVerdict: sequence.verdict,
    sequenceDefectCount: sequence.defectCodes.length,
    cacheHits: allProvenance.filter((entry) => entry.cacheHit).length,
    cacheMisses: allProvenance.filter((entry) => !entry.cacheHit).length,
    primaryApiCalls: allProvenance
      .filter(
        (entry) =>
          entry.component === "SCENE_JUDGE_PRIMARY" ||
          entry.component === "BEAT_JUDGE_PRIMARY"
      )
      .reduce(
        (sum, entry) =>
          sum +
          (entry.providerRequestCountContribution ??
            (entry.providerCall ? 1 : 0)),
        0
      ),
    beatPrimaryApiCalls: allProvenance
      .filter((entry) => entry.component === "BEAT_JUDGE_PRIMARY")
      .reduce(
        (sum, entry) =>
          sum +
          (entry.providerRequestCountContribution ??
            (entry.providerCall ? 1 : 0)),
        0
      ),
    escalationApiCalls: allProvenance
      .filter(
        (entry) =>
          entry.component === "SCENE_JUDGE_ESCALATION" ||
          entry.component === "SCENE_JUDGE_FINAL" ||
          entry.component === "BEAT_JUDGE_ESCALATION" ||
          entry.component === "BEAT_JUDGE_FINAL" ||
          entry.component === "SEQUENCE_JUDGE_FINAL"
      )
      .reduce(
        (sum, entry) =>
          sum +
          (entry.providerRequestCountContribution ??
            (entry.providerCall ? 1 : 0)),
        0
      ),
    remediationApiCalls: allProvenance
      .filter((entry) => entry.component === "REMEDIATION_ADVISOR")
      .reduce(
        (sum, entry) =>
          sum +
          (entry.providerRequestCountContribution ??
            (entry.providerCall ? 1 : 0)),
        0
      ),
    sequenceApiCalls: allProvenance
      .filter((entry) => entry.component === "SEQUENCE_JUDGE")
      .reduce(
        (sum, entry) =>
          sum +
          (entry.providerRequestCountContribution ??
            (entry.providerCall ? 1 : 0)),
        0
      ),
    inputTokens: allProvenance.reduce(
      (sum, entry) => sum + entry.inputTokens,
      0
    ),
    outputTokens: allProvenance.reduce(
      (sum, entry) => sum + entry.outputTokens,
      0
    ),
    cachedInputTokens: allProvenance.reduce(
      (sum, entry) => sum + entry.cachedInputTokens,
      0
    ),
    totalWallClockMs: Date.now() - startedAt,
    queueWaitMs: allProvenance.reduce(
      (sum, entry) => sum + entry.queueWaitMs,
      0
    ),
    apiLatencyMs: allProvenance.reduce(
      (sum, entry) => sum + entry.apiLatencyMs,
      0
    ),
    configuredConcurrency: execution.targetConcurrency,
    effectiveConcurrency:
      allProvenance.reduce(
        (maximum, entry) => Math.max(maximum, entry.effectiveConcurrency),
        0
      ) || execution.targetConcurrency,
    maxObservedConcurrency: allProvenance.reduce(
      (maximum, entry) => Math.max(maximum, entry.maxObservedConcurrency),
      0
    ),
    throttleEvents: allProvenance.reduce(
      (sum, entry) => sum + entry.throttleEvents,
      0
    ),
    rateLimitEvents: allProvenance.reduce(
      (sum, entry) => sum + entry.rateLimitEvents,
      0
    ),
    retryCount: allProvenance.reduce((sum, entry) => sum + entry.retryCount, 0),
    singleFlightDeduplications: allProvenance.filter(
      (entry) => entry.singleFlightDeduplicated
    ).length,
    advisorBypassCount,
    noOpRemediationCount,
    rejudgeRequestCount,
    scenesRejudged,
    providerCallsReserved: budgetSnapshot.providerCallsReserved,
    estimatedCostUsd: budgetSnapshot.estimatedCostUsd,
    budgetStatus: budgetSnapshot.budgetStatus,
    modelDistribution,
  };
  const sourceFidelityReady =
    evaluations.every((entry) => entry.judgement.verdict === "PASS") &&
    beatEvaluations.every((entry) => entry.judgement.verdict === "PASS") &&
    beatEvaluations.length === requiredBeats.length &&
    (sequence.verdict === "PASS" || finalSequenceReviewHandoff);
  const base = {
    schemaVersion: SOURCE_GROUNDED_CONTROLLER_VERSION,
    policyIdentity: input.policy.policyIdentity,
    revision: finalRevision,
    scenes: evaluations,
    beats: beatEvaluations,
    remediatedBeatIds: [] as const,
    remediationHistory,
    sequence,
    sequenceProvenance,
    sourceFidelityReady,
    providerRequestsAllowed: false as const,
    blockers: [...new Set(blockers)],
    aggregate,
    sourceGroundedQaExecution: {
      profile: execution.profile,
      transport: execution.transport,
      ...(execution.serviceTier ? { serviceTier: execution.serviceTier } : {}),
      wallClockMs: aggregate.totalWallClockMs,
      sceneCount: evaluations.length,
      beatCount: beatEvaluations.length,
      cacheHits: aggregate.cacheHits,
      cacheMisses: aggregate.cacheMisses,
      primaryCalls: aggregate.primaryApiCalls,
      beatPrimaryCalls: aggregate.beatPrimaryApiCalls,
      escalations: aggregate.escalationApiCalls,
      advisorCalls: aggregate.remediationApiCalls,
      sequenceCalls: aggregate.sequenceApiCalls,
      retries: aggregate.retryCount,
      rateLimitEvents: aggregate.rateLimitEvents,
      effectiveConcurrency: aggregate.effectiveConcurrency,
      inputTokens: aggregate.inputTokens,
      cachedInputTokens: aggregate.cachedInputTokens,
      outputTokens: aggregate.outputTokens,
      advisorBypassCount: aggregate.advisorBypassCount,
      noOpRemediationCount: aggregate.noOpRemediationCount,
      rejudgeRequests: aggregate.rejudgeRequestCount,
      scenesRejudged: aggregate.scenesRejudged,
      providerCallsReserved: aggregate.providerCallsReserved,
      estimatedCostUsd: aggregate.estimatedCostUsd,
      budgetStatus: aggregate.budgetStatus,
      modelDistribution: aggregate.modelDistribution,
    },
  };
  const qa: SourceGroundedVisualQaResult = {
    ...base,
    resultHash: stableHash(base),
  };
  return { plan, qa };
}

export interface SourceGroundedReasoningBenchmarkFixture {
  readonly id: string;
  readonly payload: SourceGroundedSceneJudgementInput;
  readonly expectedVerdict: "PASS" | "REVIEW" | "BLOCK";
  readonly expectedDefectCodes: readonly SemanticDefectCode[];
}

export async function benchmarkSourceGroundedReasoningPolicies(input: {
  readonly corpus: readonly SourceGroundedReasoningBenchmarkFixture[];
  readonly judge: SourceGroundedSceneJudgePort;
  readonly current: SourceGroundedModelTier;
  readonly candidate: SourceGroundedModelTier;
  readonly execution?: SourceGroundedQaExecutionPolicy;
  readonly scheduler?: SourceGroundedQaScheduler;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly current: readonly {
    readonly fixtureId: string;
    readonly verdict: SourceGroundedVerdict;
    readonly defectCodes: readonly SemanticDefectCode[];
    readonly matchesExpected: boolean;
  }[];
  readonly candidate: readonly {
    readonly fixtureId: string;
    readonly verdict: SourceGroundedVerdict;
    readonly defectCodes: readonly SemanticDefectCode[];
    readonly matchesExpected: boolean;
  }[];
  readonly candidateAccepted: boolean;
}> {
  const execution =
    input.execution ?? sourceGroundedQaExecutionPolicy("INTERACTIVE");
  const scheduler = input.scheduler ?? globalSourceGroundedQaScheduler;
  const evaluate = async (model: SourceGroundedModelTier) =>
    Promise.all(
      input.corpus.map(async (fixture) => {
        let judgement: SourceGroundedSceneJudgement;
        try {
          const result = await scheduler.run({
            packId: `reasoning-benchmark:${model.reasoningEffort}`,
            priority: 50,
            estimatedTokens: estimatedRequestTokens(fixture.payload, model),
            execution,
            provider: providerReservation({
              payload: fixture.payload,
              instructions: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTIONS,
              model,
              execution,
            }),
            ...(input.signal ? { signal: input.signal } : {}),
            task: (signal) =>
              input.judge.judge({
                payload: fixture.payload,
                model,
                instructions: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTIONS,
                instructionVersion:
                  SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
                jsonSchema: sourceGroundedSceneJudgementJsonSchema,
                cachePolicy: providerCachePolicy({
                  family: "scene",
                  instructionVersion:
                    SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
                  model,
                  execution,
                }),
                execution,
                ...(signal ? { signal } : {}),
              }),
          });
          const parsed = sourceGroundedSceneJudgementSchema.safeParse(
            stripStructuredOutputNulls(result.value.output)
          );
          judgement = parsed.success
            ? parsed.data
            : unavailableScene("Benchmark judge returned malformed output.");
          if (sceneJudgementConsistencyReasons(judgement).length > 0) {
            judgement = unavailableScene(
              "Benchmark judge returned inconsistent output."
            );
          }
        } catch {
          judgement = unavailableScene("Benchmark judge unavailable.");
        }
        const actualDefects = [...judgement.defectCodes].sort();
        const expectedDefects = [...fixture.expectedDefectCodes].sort();
        return {
          fixtureId: fixture.id,
          verdict: judgement.verdict,
          defectCodes: judgement.defectCodes,
          matchesExpected:
            judgement.verdict === fixture.expectedVerdict &&
            stableHash(actualDefects) === stableHash(expectedDefects),
        };
      })
    );
  const [current, candidate] = await Promise.all([
    evaluate(input.current),
    evaluate(input.candidate),
  ]);
  return {
    current,
    candidate,
    candidateAccepted:
      current.every((entry) => entry.matchesExpected) &&
      candidate.every((entry) => entry.matchesExpected),
  };
}

export class FixtureSourceGroundedSceneJudge implements SourceGroundedSceneJudgePort {
  readonly calls: SourceGroundedSceneJudgementInput[] = [];
  requestCount = 0;

  constructor(
    private readonly values:
      | Readonly<Record<string, SourceGroundedSceneJudgement>>
      | ((
          input: SourceGroundedSceneJudgementInput
        ) => SourceGroundedSceneJudgement)
  ) {}

  async judge(input: {
    readonly payload: SourceGroundedSceneJudgementInput;
  }): Promise<SourceGroundedProviderResult> {
    this.requestCount += 1;
    this.calls.push(input.payload);
    const output =
      typeof this.values === "function"
        ? this.values(input.payload)
        : this.values[input.payload.sceneId];
    if (!output)
      throw new Error(`Missing scene fixture: ${input.payload.sceneId}`);
    return { output, requestId: `fixture-scene-${this.calls.length}` };
  }

  async judgeBatch(input: {
    readonly items: readonly {
      readonly itemId: string;
      readonly payload: SourceGroundedSceneJudgementInput;
    }[];
  }): Promise<SourceGroundedBatchProviderResult> {
    this.requestCount += 1;
    const outputs = input.items.map((item) => {
      this.calls.push(item.payload);
      const output =
        typeof this.values === "function"
          ? this.values(item.payload)
          : this.values[item.payload.sceneId];
      if (!output)
        throw new Error(`Missing scene fixture: ${item.payload.sceneId}`);
      return { itemId: item.itemId, output };
    });
    return {
      outputs,
      requestId: `fixture-scene-batch-${this.requestCount}`,
    };
  }
}

export class FixtureSemanticRemediationAdvisor implements SemanticRemediationAdvisorPort {
  readonly calls: SemanticRemediationAdvisorInput[] = [];
  requestCount = 0;

  constructor(
    private readonly values:
      | Readonly<Record<string, SemanticRemediationDirective>>
      | ((
          input: SemanticRemediationAdvisorInput
        ) => SemanticRemediationDirective)
  ) {}

  async advise(input: {
    readonly payload: SemanticRemediationAdvisorInput;
  }): Promise<SourceGroundedProviderResult> {
    this.requestCount += 1;
    this.calls.push(input.payload);
    const output =
      typeof this.values === "function"
        ? this.values(input.payload)
        : this.values[input.payload.scene.sceneId];
    if (!output)
      throw new Error(
        `Missing remediation fixture: ${input.payload.scene.sceneId}`
      );
    return { output, requestId: `fixture-remediation-${this.calls.length}` };
  }

  async adviseBatch(input: {
    readonly items: readonly {
      readonly itemId: string;
      readonly payload: SemanticRemediationAdvisorInput;
    }[];
  }): Promise<SourceGroundedBatchProviderResult> {
    this.requestCount += 1;
    const outputs = input.items.map((item) => {
      this.calls.push(item.payload);
      const output =
        typeof this.values === "function"
          ? this.values(item.payload)
          : this.values[item.payload.scene.sceneId];
      if (!output) {
        throw new Error(
          `Missing remediation fixture: ${item.payload.scene.sceneId}`
        );
      }
      return { itemId: item.itemId, output };
    });
    return {
      outputs,
      requestId: `fixture-remediation-batch-${this.requestCount}`,
    };
  }
}

export class FixtureEpisodeSequenceJudge implements EpisodeSequenceJudgePort {
  readonly calls: (readonly EpisodeSequenceSceneSummary[])[] = [];

  constructor(
    private readonly value:
      | EpisodeSequenceJudgement
      | ((
          input: readonly EpisodeSequenceSceneSummary[]
        ) => EpisodeSequenceJudgement)
  ) {}

  async judgeSequence(input: {
    readonly scenes: readonly EpisodeSequenceSceneSummary[];
  }): Promise<SourceGroundedProviderResult> {
    this.calls.push(input.scenes);
    return {
      output:
        typeof this.value === "function"
          ? this.value(input.scenes)
          : this.value,
      requestId: `fixture-sequence-${this.calls.length}`,
    };
  }
}

export function sourceGroundedPassJudgement(
  reason = "The final scene preserves the narration and is safely renderable."
): SourceGroundedSceneJudgement {
  return {
    schemaVersion: SOURCE_GROUNDED_SCENE_JUDGE_SCHEMA_VERSION,
    sourceFidelity: "PASS",
    actorCorrect: true,
    actionOwnerCorrect: true,
    causalDirectionCorrect: true,
    polarityCorrect: true,
    stateRolesCorrect: true,
    visualMechanismGrounded: true,
    providerPromptDepictsNarration: true,
    renderableUnderConstraints: true,
    informationCoverage: "SUFFICIENT",
    verdict: "PASS",
    defectCodes: [],
    earliestFaultBoundary: "UNKNOWN",
    remediationRoute: "NONE",
    reason,
  };
}

export function sourceGroundedPassBeatJudgement(
  reason = "The visual beat is source-grounded, distinct, faithfully prompted, and renderable."
): SourceGroundedVisualBeatJudgement {
  return {
    schemaVersion: SOURCE_GROUNDED_BEAT_JUDGE_SCHEMA_VERSION,
    sourceFidelity: "PASS",
    sourceSupport: "SUPPORTED_MATERIALIZATION",
    coreMeaningGrounded: true,
    newInformationGrounded: true,
    actorCorrect: true,
    actionOwnerCorrect: true,
    causalDirectionCorrect: true,
    polarityCorrect: true,
    stateRolesCorrect: true,
    visualMechanismGrounded: true,
    distinctFromAdjacentBeat: true,
    providerPromptDepictsBeat: true,
    renderableUnderConstraints: true,
    verdict: "PASS",
    defectCodes: [],
    reason,
  };
}

export function sourceGroundedPassSequence(
  reason = "The sequence advances visually while preserving healthy continuity."
): EpisodeSequenceJudgement {
  return {
    schemaVersion: SOURCE_GROUNDED_SEQUENCE_SCHEMA_VERSION,
    verdict: "PASS",
    defectCodes: [],
    repeatedGroups: [],
    continuityProblems: [],
    remediationTargets: [],
    reason,
  };
}

export function sourceGroundedStructuredState(
  proposition: VeronicaSemanticProposition | undefined
): SourceGroundedSceneJudgementInput["structuredState"] | undefined {
  if (!proposition) return undefined;
  return {
    relation: proposition.stateRelation,
    ...(proposition.contrast?.initialState
      ? { initialState: proposition.contrast.initialState }
      : {}),
    ...(proposition.contrast?.failureState
      ? { failureState: proposition.contrast.failureState }
      : {}),
    ...(proposition.contrast?.desiredState
      ? { desiredState: proposition.contrast.desiredState }
      : {}),
    outcomeState: proposition.contrast?.consequence ?? proposition.consequence,
  };
}
