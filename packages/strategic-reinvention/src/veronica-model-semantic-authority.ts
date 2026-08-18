import fs from "node:fs/promises";
import path from "node:path";
import {
  createLogicalRequestFingerprint,
  fileExists,
  writeJsonAtomic,
  type LogicalRequestFingerprint,
} from "@mediaforge/shared";
import { z } from "zod";

export const VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION =
  "veronica-semantic-beat-plan.v1" as const;
export const VERONICA_SEMANTIC_PROMPT_VERSION =
  "veronica-semantic-authority-prompt.v1" as const;
export const VERONICA_SEMANTIC_PLANNER_POLICY_VERSION =
  "veronica-semantic-authority-policy.v1" as const;
export const VERONICA_MODEL_SEMANTIC_ARTIFACT_VERSION =
  "veronica-model-semantic-authority-artifact.v1" as const;
export const VERONICA_SEMANTIC_EXPERIMENT_LEDGER_VERSION =
  "veronica-semantic-experiment-ledger.v1" as const;

export const VERONICA_SEMANTIC_MODEL_CONFIGURATION = {
  model: "gpt-5.6-sol",
  reasoning: { mode: "pro", effort: "medium" },
  store: false,
  maxOutputTokens: 1_400,
  timeoutMs: 90_000,
  maximumAttemptsPerFingerprint: 2,
} as const;

export const VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD = 2.5;

export const VERONICA_SEMANTIC_PRICING = {
  version: "openai-api-standard-2026-08-18",
  source: "https://developers.openai.com/api/docs/pricing",
  model: "gpt-5.6-sol",
  inputUsdPerMillionTokens: 5,
  cachedInputUsdPerMillionTokens: 0.5,
  outputUsdPerMillionTokens: 30,
} as const;

export const VERONICA_SEMANTIC_INTENTS = [
  "retained_value",
  "input_output_flow",
  "ownership_transfer",
  "causal_mechanism",
  "state_change",
  "environmental_action",
  "comparison",
  "manifestation",
  "other",
] as const;

export const VERONICA_SEMANTIC_ACTION_OWNER_TYPES = [
  "person",
  "object",
  "environment",
  "abstract",
  "none",
] as const;

export const VERONICA_SEMANTIC_VISUAL_FAMILIES = [
  "retained-value-reveal",
  "input-output-flow",
  "ownership-transfer",
  "causal-mechanism",
  "state-change",
  "environmental-action",
  "comparison",
  "manifestation",
  "neutral",
  "other",
] as const;

const boundedText = z.string().trim().min(1).max(600);
const evidenceText = z.string().trim().min(1).max(800);

export const veronicaSemanticBeatPlanSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION),
    semanticIntent: z.enum(VERONICA_SEMANTIC_INTENTS),
    subject: z.string().trim().min(1).max(300).nullable(),
    actionOwner: z
      .object({
        type: z.enum(VERONICA_SEMANTIC_ACTION_OWNER_TYPES),
        sourceReference: evidenceText.nullable(),
      })
      .strict(),
    semanticClaims: z
      .array(
        z
          .object({
            claim: boundedText,
            sourceEvidence: evidenceText,
          })
          .strict(),
      )
      .max(6),
    visualStrategies: z
      .array(
        z
          .object({
            family: z.enum(VERONICA_SEMANTIC_VISUAL_FAMILIES),
            description: boundedText,
            preservesMeaning: z.boolean(),
            requiresUnsupportedAction: z.boolean(),
          })
          .strict(),
      )
      .max(5),
    forbiddenInterpretations: z.array(boundedText).max(6),
    ambiguity: z.enum(["none", "low", "material"]),
    abstain: z.boolean(),
    abstentionReason: boundedText.nullable(),
  })
  .strict();

export type VeronicaSemanticBeatPlan = z.infer<
  typeof veronicaSemanticBeatPlanSchema
>;
export type VeronicaSemanticIntent = VeronicaSemanticBeatPlan["semanticIntent"];
export type VeronicaSemanticActionOwnerType =
  VeronicaSemanticBeatPlan["actionOwner"]["type"];

export const VERONICA_SEMANTIC_BEAT_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "semanticIntent",
    "subject",
    "actionOwner",
    "semanticClaims",
    "visualStrategies",
    "forbiddenInterpretations",
    "ambiguity",
    "abstain",
    "abstentionReason",
  ],
  properties: {
    schemaVersion: {
      type: "string",
      enum: [VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION],
    },
    semanticIntent: { type: "string", enum: [...VERONICA_SEMANTIC_INTENTS] },
    subject: { anyOf: [{ type: "string" }, { type: "null" }] },
    actionOwner: {
      type: "object",
      additionalProperties: false,
      required: ["type", "sourceReference"],
      properties: {
        type: {
          type: "string",
          enum: [...VERONICA_SEMANTIC_ACTION_OWNER_TYPES],
        },
        sourceReference: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
      },
    },
    semanticClaims: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "sourceEvidence"],
        properties: {
          claim: { type: "string" },
          sourceEvidence: { type: "string" },
        },
      },
    },
    visualStrategies: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "family",
          "description",
          "preservesMeaning",
          "requiresUnsupportedAction",
        ],
        properties: {
          family: {
            type: "string",
            enum: [...VERONICA_SEMANTIC_VISUAL_FAMILIES],
          },
          description: { type: "string" },
          preservesMeaning: { type: "boolean" },
          requiresUnsupportedAction: { type: "boolean" },
        },
      },
    },
    forbiddenInterpretations: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
    ambiguity: {
      type: "string",
      enum: ["none", "low", "material"],
    },
    abstain: { type: "boolean" },
    abstentionReason: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
  },
} as const satisfies Readonly<Record<string, unknown>>;

export const veronicaSemanticRequestSchema = z
  .object({
    source: z.string().trim().min(1).max(2_000),
    contextBefore: z.string().trim().max(1_000),
    contextAfter: z.string().trim().max(1_000),
    allowedOwnerTypes: z
      .array(z.enum(VERONICA_SEMANTIC_ACTION_OWNER_TYPES))
      .min(1)
      .max(VERONICA_SEMANTIC_ACTION_OWNER_TYPES.length)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();

export type VeronicaSemanticRequest = z.infer<
  typeof veronicaSemanticRequestSchema
>;

export const VERONICA_SEMANTIC_STABLE_PROMPT = `You are a bounded semantic authority for source-grounded editorial planning.
Classify only the supplied source and adjacent context.
Every semantic claim and non-none action owner must quote exact evidence from the supplied text.
Do not invent actors, actions, causality, ownership, objects, settings, or visual events.
Visual strategies are advisory; mark unsupported actions explicitly.
When meaning is materially ambiguous or no faithful strategy exists, abstain.
Return only the strict structured output.`;

function normalizeSemanticText(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

export function normalizeVeronicaSemanticRequest(
  input: VeronicaSemanticRequest,
): VeronicaSemanticRequest {
  const parsed = veronicaSemanticRequestSchema.parse(input);
  return veronicaSemanticRequestSchema.parse({
    source: normalizeSemanticText(parsed.source),
    contextBefore: normalizeSemanticText(parsed.contextBefore),
    contextAfter: normalizeSemanticText(parsed.contextAfter),
    allowedOwnerTypes: [...parsed.allowedOwnerTypes].sort(),
  });
}

export function createVeronicaSemanticFingerprint(
  input: VeronicaSemanticRequest,
): LogicalRequestFingerprint {
  const request = normalizeVeronicaSemanticRequest(input);
  return createLogicalRequestFingerprint({
    operation: "veronica-semantic-authority",
    provider: "openai",
    model: VERONICA_SEMANTIC_MODEL_CONFIGURATION.model,
    reasoning: {
      effort: VERONICA_SEMANTIC_MODEL_CONFIGURATION.reasoning.effort,
    },
    semanticInput: {
      source: request.source,
      contextBefore: request.contextBefore,
      contextAfter: request.contextAfter,
      allowedOwnerTypes: request.allowedOwnerTypes,
    },
    outputContractVersion: VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
    promptPolicyVersion: VERONICA_SEMANTIC_PROMPT_VERSION,
    providerConfiguration: {
      reasoningMode: VERONICA_SEMANTIC_MODEL_CONFIGURATION.reasoning.mode,
      plannerPolicyVersion: VERONICA_SEMANTIC_PLANNER_POLICY_VERSION,
      maxOutputTokens: VERONICA_SEMANTIC_MODEL_CONFIGURATION.maxOutputTokens,
      store: VERONICA_SEMANTIC_MODEL_CONFIGURATION.store,
    },
  });
}

export type VeronicaSemanticValidationOutcome = "PASS" | "ABSTAIN" | "REJECT";

export const veronicaSemanticValidationSchema = z
  .object({
    outcome: z.enum(["PASS", "ABSTAIN", "REJECT"]),
    reasons: z.array(z.string().min(1)).max(20),
    groundedClaimCount: z.number().int().nonnegative(),
    safeStrategyCount: z.number().int().nonnegative(),
    unsupportedStrategyCount: z.number().int().nonnegative(),
  })
  .strict();

export type VeronicaSemanticValidation = z.infer<
  typeof veronicaSemanticValidationSchema
>;

function evidenceCorpus(request: VeronicaSemanticRequest): string {
  return [request.contextBefore, request.source, request.contextAfter]
    .filter((value) => value.length > 0)
    .join("\n");
}

export function validateVeronicaSemanticBeatPlan(input: {
  readonly request: VeronicaSemanticRequest;
  readonly output: unknown;
}): {
  readonly plan: VeronicaSemanticBeatPlan | null;
  readonly validation: VeronicaSemanticValidation;
} {
  const request = normalizeVeronicaSemanticRequest(input.request);
  const parsed = veronicaSemanticBeatPlanSchema.safeParse(input.output);
  if (!parsed.success) {
    return {
      plan: null,
      validation: {
        outcome: "REJECT",
        reasons: ["SCHEMA_NONCOMPLIANCE"],
        groundedClaimCount: 0,
        safeStrategyCount: 0,
        unsupportedStrategyCount: 0,
      },
    };
  }
  const plan = parsed.data;
  const corpus = evidenceCorpus(request);
  const reasons: string[] = [];
  const groundedClaims = plan.semanticClaims.filter((entry) =>
    corpus.includes(entry.sourceEvidence),
  );
  if (groundedClaims.length !== plan.semanticClaims.length) {
    reasons.push("UNGROUNDED_SEMANTIC_CLAIM");
  }
  const ownerReference = plan.actionOwner.sourceReference;
  if (plan.actionOwner.type === "none" && ownerReference !== null) {
    reasons.push("NONE_OWNER_HAS_SOURCE_REFERENCE");
  }
  if (
    plan.actionOwner.type !== "none" &&
    (ownerReference === null || !corpus.includes(ownerReference))
  ) {
    reasons.push("UNGROUNDED_ACTION_OWNER");
  }
  if (!request.allowedOwnerTypes.includes(plan.actionOwner.type)) {
    reasons.push("ACTION_OWNER_NOT_AUTHORIZED");
  }
  if (plan.abstain !== (plan.abstentionReason !== null)) {
    reasons.push("ABSTENTION_FIELDS_CONTRADICT");
  }
  const safeStrategies = plan.visualStrategies.filter(
    (strategy) =>
      strategy.preservesMeaning && !strategy.requiresUnsupportedAction,
  );
  const unsupportedStrategies = plan.visualStrategies.filter(
    (strategy) => strategy.requiresUnsupportedAction,
  );
  if (
    plan.visualStrategies.some(
      (strategy) =>
        strategy.preservesMeaning && strategy.requiresUnsupportedAction,
    )
  ) {
    reasons.push("UNSUPPORTED_ACTION_PRESENTED_AS_MEANING_PRESERVING");
  }
  if (!plan.abstain && plan.semanticClaims.length === 0) {
    reasons.push("NON_ABSTAINING_PLAN_HAS_NO_CLAIMS");
  }
  if (!plan.abstain && safeStrategies.length === 0) {
    reasons.push("NON_ABSTAINING_PLAN_HAS_NO_SAFE_STRATEGY");
  }
  const rejectionReasons = reasons.filter(
    (reason) =>
      reason !== "NON_ABSTAINING_PLAN_HAS_NO_SAFE_STRATEGY" &&
      reason !== "ABSTENTION_FIELDS_CONTRADICT",
  );
  const shouldAbstain =
    plan.abstain ||
    plan.ambiguity === "material" ||
    reasons.includes("NON_ABSTAINING_PLAN_HAS_NO_SAFE_STRATEGY") ||
    reasons.includes("ABSTENTION_FIELDS_CONTRADICT");
  return {
    plan,
    validation: veronicaSemanticValidationSchema.parse({
      outcome:
        rejectionReasons.length > 0
          ? "REJECT"
          : shouldAbstain
            ? "ABSTAIN"
            : "PASS",
      reasons:
        reasons.length > 0
          ? [...new Set(reasons)]
          : shouldAbstain
            ? [plan.abstentionReason ?? "MATERIAL_AMBIGUITY"]
            : [],
      groundedClaimCount: groundedClaims.length,
      safeStrategyCount: safeStrategies.length,
      unsupportedStrategyCount: unsupportedStrategies.length,
    }),
  };
}

export const veronicaSemanticUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (usage) => usage.cachedInputTokens <= usage.inputTokens,
    "Cached input tokens cannot exceed input tokens.",
  );

export type VeronicaSemanticUsage = z.infer<
  typeof veronicaSemanticUsageSchema
>;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const veronicaModelSemanticAuthorityArtifactSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_MODEL_SEMANTIC_ARTIFACT_VERSION),
    authorityStatus: z.enum([
      "CURRENT_MODEL_DERIVED_AUTHORITY",
      "CURRENT_MODEL_DERIVED_ABSTENTION",
    ]),
    semanticFingerprint: sha256,
    request: z
      .object({
        semanticSchemaVersion: z.literal(
          VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
        ),
        promptVersion: z.literal(VERONICA_SEMANTIC_PROMPT_VERSION),
        plannerPolicyVersion: z.literal(
          VERONICA_SEMANTIC_PLANNER_POLICY_VERSION,
        ),
        requestedModel: z.literal(
          VERONICA_SEMANTIC_MODEL_CONFIGURATION.model,
        ),
        reasoning: z
          .object({
            mode: z.literal("pro"),
            effort: z.literal("medium"),
          })
          .strict(),
        maxOutputTokens: z.literal(
          VERONICA_SEMANTIC_MODEL_CONFIGURATION.maxOutputTokens,
        ),
      })
      .strict(),
    response: z
      .object({
        actualModel: z.string().min(1),
        providerRequestId: z.string().min(1).nullable(),
        usage: veronicaSemanticUsageSchema,
      })
      .strict(),
    plan: veronicaSemanticBeatPlanSchema,
    validation: veronicaSemanticValidationSchema,
    createdAt: z.string().datetime(),
    estimatedCostUsd: z.number().nonnegative(),
  })
  .strict();

export type VeronicaModelSemanticAuthorityArtifact = z.infer<
  typeof veronicaModelSemanticAuthorityArtifactSchema
>;

export interface VeronicaModelSemanticAuthorityCache {
  get(
    fingerprint: LogicalRequestFingerprint,
  ): Promise<VeronicaModelSemanticAuthorityArtifact | null>;
  put(artifact: VeronicaModelSemanticAuthorityArtifact): Promise<void>;
}

export class FileVeronicaModelSemanticAuthorityCache
  implements VeronicaModelSemanticAuthorityCache
{
  public constructor(private readonly root: string) {}

  private cachePath(fingerprint: LogicalRequestFingerprint): string {
    return path.join(this.root, `${fingerprint}.json`);
  }

  public async get(
    fingerprint: LogicalRequestFingerprint,
  ): Promise<VeronicaModelSemanticAuthorityArtifact | null> {
    const target = this.cachePath(fingerprint);
    if (!(await fileExists(target))) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(target, "utf8")) as unknown;
    } catch {
      return null;
    }
    const artifact = veronicaModelSemanticAuthorityArtifactSchema.safeParse(parsed);
    if (!artifact.success || artifact.data.semanticFingerprint !== fingerprint) {
      return null;
    }
    return artifact.data;
  }

  public async put(
    artifact: VeronicaModelSemanticAuthorityArtifact,
  ): Promise<void> {
    const parsed = veronicaModelSemanticAuthorityArtifactSchema.parse(artifact);
    await writeJsonAtomic(
      this.cachePath(parsed.semanticFingerprint as LogicalRequestFingerprint),
      parsed,
    );
  }
}

export interface VeronicaSemanticProviderResponse {
  readonly output: unknown;
  readonly providerRequestId: string | null;
  readonly actualModel: string;
  readonly usage: VeronicaSemanticUsage;
}

export interface VeronicaSemanticProviderPort {
  plan(input: {
    readonly request: VeronicaSemanticRequest;
    readonly semanticFingerprint: LogicalRequestFingerprint;
    readonly signal?: AbortSignal;
  }): Promise<VeronicaSemanticProviderResponse>;
}

export class VeronicaSemanticProviderError extends Error {
  public constructor(
    message: string,
    readonly retryable: boolean,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VeronicaSemanticProviderError";
  }
}

function semanticProviderErrorDetails(error: unknown): {
  readonly retryable: boolean;
  readonly code: string;
} | null {
  if (error instanceof VeronicaSemanticProviderError) {
    return { retryable: error.retryable, code: error.code };
  }
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    readonly name?: unknown;
    readonly retryable?: unknown;
    readonly code?: unknown;
  };
  return candidate.name === "VeronicaSemanticProviderError" &&
    typeof candidate.retryable === "boolean" &&
    typeof candidate.code === "string"
    ? { retryable: candidate.retryable, code: candidate.code }
    : null;
}

export interface VeronicaSemanticProviderLedgerEntry {
  readonly semanticFingerprint: string;
  readonly attempt: number;
  readonly retry: boolean;
  readonly model: string;
  readonly projectedMaximumCostUsd: number;
  readonly estimatedCostUsd: number;
  readonly usage: VeronicaSemanticUsage;
  readonly outcome: "SUCCESS" | "TRANSIENT_ERROR" | "ERROR";
}

export interface VeronicaSemanticExperimentLedgerSnapshot {
  readonly schemaVersion: typeof VERONICA_SEMANTIC_EXPERIMENT_LEDGER_VERSION;
  readonly authorizationId: string;
  readonly budgetUsd: number;
  readonly pricingVersion: string;
  readonly logicalSemanticCases: number;
  readonly cacheHits: number;
  readonly providerRequests: number;
  readonly retries: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cumulativeEstimatedCostUsd: number;
  readonly cumulativeReservedMaximumUsd: number;
  readonly preventedRequestsDueToBudget: number;
  readonly modelUsed: readonly string[];
  readonly requests: readonly VeronicaSemanticProviderLedgerEntry[];
}

function roundUsd(value: number): number {
  return Number(value.toFixed(8));
}

export function estimateVeronicaSemanticUsageCost(
  usage: VeronicaSemanticUsage,
): number {
  const normalized = veronicaSemanticUsageSchema.parse(usage);
  const uncachedInputTokens =
    normalized.inputTokens - normalized.cachedInputTokens;
  return roundUsd(
    (uncachedInputTokens *
      VERONICA_SEMANTIC_PRICING.inputUsdPerMillionTokens +
      normalized.cachedInputTokens *
        VERONICA_SEMANTIC_PRICING.cachedInputUsdPerMillionTokens +
      normalized.outputTokens *
        VERONICA_SEMANTIC_PRICING.outputUsdPerMillionTokens) /
      1_000_000,
  );
}

export function estimateVeronicaSemanticMaximumRequestCost(
  request: VeronicaSemanticRequest,
): {
  readonly estimatedInputTokens: number;
  readonly projectedMaximumCostUsd: number;
} {
  const normalized = normalizeVeronicaSemanticRequest(request);
  const providerPayload = JSON.stringify({
    stablePrompt: VERONICA_SEMANTIC_STABLE_PROMPT,
    schema: VERONICA_SEMANTIC_BEAT_PLAN_JSON_SCHEMA,
    request: normalized,
  });
  // A UTF-8 byte can require its own token. Byte count plus fixed request-envelope
  // headroom is deliberately conservative; average characters-per-token is not.
  const estimatedInputTokens = Buffer.byteLength(providerPayload, "utf8") + 1_024;
  const projectedMaximumCostUsd = roundUsd(
    (estimatedInputTokens *
      VERONICA_SEMANTIC_PRICING.inputUsdPerMillionTokens +
      VERONICA_SEMANTIC_MODEL_CONFIGURATION.maxOutputTokens *
        VERONICA_SEMANTIC_PRICING.outputUsdPerMillionTokens) /
      1_000_000,
  );
  return { estimatedInputTokens, projectedMaximumCostUsd };
}

export class VeronicaSemanticExperimentLedger {
  private logicalSemanticCases = 0;
  private cacheHits = 0;
  private providerRequests = 0;
  private retries = 0;
  private inputTokens = 0;
  private cachedInputTokens = 0;
  private outputTokens = 0;
  private reasoningTokens = 0;
  private cumulativeEstimatedCostUsd = 0;
  private cumulativeReservedMaximumUsd = 0;
  private preventedRequestsDueToBudget = 0;
  private readonly modelUsed = new Set<string>();
  private readonly requests: VeronicaSemanticProviderLedgerEntry[] = [];

  public constructor(
    private readonly authorizationId: string,
    private readonly budgetUsd = VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD,
  ) {
    if (!authorizationId.trim()) throw new Error("Authorization ID is required.");
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
      throw new Error("Semantic experiment budget must be positive.");
    }
    if (budgetUsd > VERONICA_SEMANTIC_EXPERIMENT_BUDGET_USD) {
      throw new Error("Semantic experiment budget cannot exceed USD 2.50.");
    }
  }

  public recordLogicalCase(): void {
    this.logicalSemanticCases += 1;
  }

  public recordCacheHit(): void {
    this.cacheHits += 1;
  }

  public admitProviderAttempt(projectedMaximumCostUsd: number): void {
    if (
      this.cumulativeReservedMaximumUsd + projectedMaximumCostUsd >
      this.budgetUsd
    ) {
      this.preventedRequestsDueToBudget += 1;
      throw new VeronicaSemanticProviderError(
        "Projected semantic-provider spend would exceed the experiment budget.",
        false,
        "SEMANTIC_EXPERIMENT_BUDGET_EXCEEDED",
      );
    }
    this.cumulativeReservedMaximumUsd = roundUsd(
      this.cumulativeReservedMaximumUsd + projectedMaximumCostUsd,
    );
  }

  public recordProviderAttempt(input: {
    readonly semanticFingerprint: string;
    readonly attempt: number;
    readonly projectedMaximumCostUsd: number;
    readonly response?: VeronicaSemanticProviderResponse;
    readonly outcome: VeronicaSemanticProviderLedgerEntry["outcome"];
  }): void {
    const usage = input.response?.usage ?? {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    };
    const estimatedCostUsd = input.response
      ? estimateVeronicaSemanticUsageCost(usage)
      : input.projectedMaximumCostUsd;
    this.providerRequests += 1;
    if (input.attempt > 1) this.retries += 1;
    this.inputTokens += usage.inputTokens;
    this.cachedInputTokens += usage.cachedInputTokens;
    this.outputTokens += usage.outputTokens;
    this.reasoningTokens += usage.reasoningTokens;
    this.cumulativeEstimatedCostUsd = roundUsd(
      this.cumulativeEstimatedCostUsd + estimatedCostUsd,
    );
    const model = input.response?.actualModel ?? VERONICA_SEMANTIC_MODEL_CONFIGURATION.model;
    this.modelUsed.add(model);
    this.requests.push({
      semanticFingerprint: input.semanticFingerprint,
      attempt: input.attempt,
      retry: input.attempt > 1,
      model,
      projectedMaximumCostUsd: input.projectedMaximumCostUsd,
      estimatedCostUsd,
      usage,
      outcome: input.outcome,
    });
  }

  public snapshot(): VeronicaSemanticExperimentLedgerSnapshot {
    return {
      schemaVersion: VERONICA_SEMANTIC_EXPERIMENT_LEDGER_VERSION,
      authorizationId: this.authorizationId,
      budgetUsd: this.budgetUsd,
      pricingVersion: VERONICA_SEMANTIC_PRICING.version,
      logicalSemanticCases: this.logicalSemanticCases,
      cacheHits: this.cacheHits,
      providerRequests: this.providerRequests,
      retries: this.retries,
      inputTokens: this.inputTokens,
      cachedInputTokens: this.cachedInputTokens,
      outputTokens: this.outputTokens,
      reasoningTokens: this.reasoningTokens,
      cumulativeEstimatedCostUsd: this.cumulativeEstimatedCostUsd,
      cumulativeReservedMaximumUsd: this.cumulativeReservedMaximumUsd,
      preventedRequestsDueToBudget: this.preventedRequestsDueToBudget,
      modelUsed: [...this.modelUsed].sort(),
      requests: [...this.requests],
    };
  }
}

export type VeronicaSemanticAuthoritySource =
  | "ACCEPTED_HUMAN_AUTHORITY"
  | "CURRENT_MODEL_DERIVED_AUTHORITY"
  | "CURRENT_DETERMINISTIC_DERIVED_AUTHORITY"
  | "NEUTRAL_FALLBACK";

export function resolveVeronicaSemanticAuthorityPrecedence(input: {
  readonly acceptedHuman?: VeronicaSemanticBeatPlan | null;
  readonly modelDerived?: VeronicaModelSemanticAuthorityArtifact | null;
  readonly deterministicCurrent?: boolean;
}): VeronicaSemanticAuthoritySource {
  if (input.acceptedHuman) return "ACCEPTED_HUMAN_AUTHORITY";
  if (
    input.modelDerived?.authorityStatus === "CURRENT_MODEL_DERIVED_AUTHORITY" &&
    input.modelDerived.validation.outcome === "PASS"
  ) {
    return "CURRENT_MODEL_DERIVED_AUTHORITY";
  }
  if (input.deterministicCurrent) {
    return "CURRENT_DETERMINISTIC_DERIVED_AUTHORITY";
  }
  return "NEUTRAL_FALLBACK";
}

export interface VeronicaSemanticResolution {
  readonly semanticFingerprint: string | null;
  readonly authoritySource: VeronicaSemanticAuthoritySource;
  readonly cacheState: "BYPASSED_HUMAN" | "HIT" | "MISS";
  readonly plan: VeronicaSemanticBeatPlan | null;
  readonly validation: VeronicaSemanticValidation;
  readonly artifact: VeronicaModelSemanticAuthorityArtifact | null;
  readonly attempts: number;
}

function blockedValidation(reason: string): VeronicaSemanticValidation {
  return {
    outcome: "REJECT",
    reasons: [reason],
    groundedClaimCount: 0,
    safeStrategyCount: 0,
    unsupportedStrategyCount: 0,
  };
}

export async function resolveVeronicaModelSemanticAuthority(input: {
  readonly request: VeronicaSemanticRequest;
  readonly acceptedHuman?: VeronicaSemanticBeatPlan | null;
  readonly deterministicCurrent?: boolean;
  readonly experimentAuthorized: boolean;
  readonly credentialAvailable: boolean;
  readonly cache: VeronicaModelSemanticAuthorityCache;
  readonly provider: VeronicaSemanticProviderPort;
  readonly ledger: VeronicaSemanticExperimentLedger;
  readonly now?: () => string;
  readonly signal?: AbortSignal;
}): Promise<VeronicaSemanticResolution> {
  const request = normalizeVeronicaSemanticRequest(input.request);
  input.ledger.recordLogicalCase();
  if (input.acceptedHuman) {
    const human = veronicaSemanticBeatPlanSchema.parse(input.acceptedHuman);
    return {
      semanticFingerprint: null,
      authoritySource: "ACCEPTED_HUMAN_AUTHORITY",
      cacheState: "BYPASSED_HUMAN",
      plan: human,
      validation: {
        outcome: human.abstain ? "ABSTAIN" : "PASS",
        reasons: [],
        groundedClaimCount: human.semanticClaims.length,
        safeStrategyCount: human.visualStrategies.filter(
          (strategy) =>
            strategy.preservesMeaning && !strategy.requiresUnsupportedAction,
        ).length,
        unsupportedStrategyCount: human.visualStrategies.filter(
          (strategy) => strategy.requiresUnsupportedAction,
        ).length,
      },
      artifact: null,
      attempts: 0,
    };
  }
  const semanticFingerprint = createVeronicaSemanticFingerprint(request);
  const cached = await input.cache.get(semanticFingerprint);
  if (cached) {
    const revalidated = validateVeronicaSemanticBeatPlan({
      request,
      output: cached.plan,
    });
    if (
      revalidated.plan &&
      revalidated.validation.outcome === cached.validation.outcome &&
      (cached.authorityStatus !== "CURRENT_MODEL_DERIVED_AUTHORITY" ||
        revalidated.validation.outcome === "PASS")
    ) {
      input.ledger.recordCacheHit();
      return {
        semanticFingerprint,
        authoritySource:
          revalidated.validation.outcome === "PASS"
            ? "CURRENT_MODEL_DERIVED_AUTHORITY"
            : input.deterministicCurrent
              ? "CURRENT_DETERMINISTIC_DERIVED_AUTHORITY"
              : "NEUTRAL_FALLBACK",
        cacheState: "HIT",
        plan: revalidated.plan,
        validation: revalidated.validation,
        artifact: cached,
        attempts: 0,
      };
    }
  }
  if (!input.experimentAuthorized) {
    return {
      semanticFingerprint,
      authoritySource: input.deterministicCurrent
        ? "CURRENT_DETERMINISTIC_DERIVED_AUTHORITY"
        : "NEUTRAL_FALLBACK",
      cacheState: "MISS",
      plan: null,
      validation: blockedValidation("SEMANTIC_EXPERIMENT_NOT_AUTHORIZED"),
      artifact: null,
      attempts: 0,
    };
  }
  if (!input.credentialAvailable) {
    return {
      semanticFingerprint,
      authoritySource: input.deterministicCurrent
        ? "CURRENT_DETERMINISTIC_DERIVED_AUTHORITY"
        : "NEUTRAL_FALLBACK",
      cacheState: "MISS",
      plan: null,
      validation: blockedValidation("OPENAI_CREDENTIAL_UNAVAILABLE"),
      artifact: null,
      attempts: 0,
    };
  }
  const { projectedMaximumCostUsd } =
    estimateVeronicaSemanticMaximumRequestCost(request);
  let attempts = 0;
  while (attempts < VERONICA_SEMANTIC_MODEL_CONFIGURATION.maximumAttemptsPerFingerprint) {
    attempts += 1;
    input.ledger.admitProviderAttempt(projectedMaximumCostUsd);
    let response: VeronicaSemanticProviderResponse;
    try {
      response = await input.provider.plan({
        request,
        semanticFingerprint,
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch (error) {
      const semanticError = semanticProviderErrorDetails(error);
      input.ledger.recordProviderAttempt({
        semanticFingerprint,
        attempt: attempts,
        projectedMaximumCostUsd,
        outcome: semanticError?.retryable ? "TRANSIENT_ERROR" : "ERROR",
      });
      if (
        semanticError?.retryable &&
        attempts < VERONICA_SEMANTIC_MODEL_CONFIGURATION.maximumAttemptsPerFingerprint
      ) {
        continue;
      }
      return {
        semanticFingerprint,
        authoritySource: input.deterministicCurrent
          ? "CURRENT_DETERMINISTIC_DERIVED_AUTHORITY"
          : "NEUTRAL_FALLBACK",
        cacheState: "MISS",
        plan: null,
        validation: blockedValidation(
          semanticError?.code ?? "SEMANTIC_PROVIDER_ERROR",
        ),
        artifact: null,
        attempts,
      };
    }
    input.ledger.recordProviderAttempt({
      semanticFingerprint,
      attempt: attempts,
      projectedMaximumCostUsd,
      response,
      outcome: "SUCCESS",
    });
    const validated = validateVeronicaSemanticBeatPlan({
      request,
      output: response.output,
    });
    if (!validated.plan || validated.validation.outcome === "REJECT") {
      return {
        semanticFingerprint,
        authoritySource: input.deterministicCurrent
          ? "CURRENT_DETERMINISTIC_DERIVED_AUTHORITY"
          : "NEUTRAL_FALLBACK",
        cacheState: "MISS",
        plan: validated.plan,
        validation: validated.validation,
        artifact: null,
        attempts,
      };
    }
    const artifact = veronicaModelSemanticAuthorityArtifactSchema.parse({
      schemaVersion: VERONICA_MODEL_SEMANTIC_ARTIFACT_VERSION,
      authorityStatus:
        validated.validation.outcome === "PASS"
          ? "CURRENT_MODEL_DERIVED_AUTHORITY"
          : "CURRENT_MODEL_DERIVED_ABSTENTION",
      semanticFingerprint,
      request: {
        semanticSchemaVersion: VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
        promptVersion: VERONICA_SEMANTIC_PROMPT_VERSION,
        plannerPolicyVersion: VERONICA_SEMANTIC_PLANNER_POLICY_VERSION,
        requestedModel: VERONICA_SEMANTIC_MODEL_CONFIGURATION.model,
        reasoning: VERONICA_SEMANTIC_MODEL_CONFIGURATION.reasoning,
        maxOutputTokens: VERONICA_SEMANTIC_MODEL_CONFIGURATION.maxOutputTokens,
      },
      response: {
        actualModel: response.actualModel,
        providerRequestId: response.providerRequestId,
        usage: response.usage,
      },
      plan: validated.plan,
      validation: validated.validation,
      createdAt: (input.now ?? (() => new Date().toISOString()))(),
      estimatedCostUsd: estimateVeronicaSemanticUsageCost(response.usage),
    });
    await input.cache.put(artifact);
    return {
      semanticFingerprint,
      authoritySource:
        validated.validation.outcome === "PASS"
          ? "CURRENT_MODEL_DERIVED_AUTHORITY"
          : input.deterministicCurrent
            ? "CURRENT_DETERMINISTIC_DERIVED_AUTHORITY"
            : "NEUTRAL_FALLBACK",
      cacheState: "MISS",
      plan: validated.plan,
      validation: validated.validation,
      artifact,
      attempts,
    };
  }
  throw new Error("Unreachable semantic provider attempt state.");
}
