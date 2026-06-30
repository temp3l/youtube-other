import path from "node:path";
import { z } from "zod";
import {
  ensureDir,
  hashText,
  readJsonIfExists,
  writeJsonAtomic,
} from "@mediaforge/shared";
import { stableSerialize } from "./stable-json.js";
import {
  languageCodes,
  type LanguageCode,
  type ModelPricing,
} from "./story-localization.types.js";

export const STORY_PREFLIGHT_POLICY_VERSION = "story-preflight-v1";
export const STORY_PREFLIGHT_SCHEMA_VERSION = "1";

export type StoryNarrationOperation =
  | "generate"
  | "localize"
  | "validate"
  | "repair";

export type StoryNarrationVariant =
  | "canonical-english-full"
  | "localized-full"
  | "canonical-english-short"
  | "localized-short"
  | "full-repair"
  | "short-repair"
  | "semantic-validation";

export type StoryPreflightStatus = "allowed" | "blocked";

export type StoryPreflightBlockingReason =
  | "input-context-size"
  | "output-limit"
  | "invalid-configuration"
  | "unsupported-model"
  | "operation-minimum-requirements";

export type StoryPreflightFailureCode =
  | "INPUT_TOKEN_ESTIMATE_TOO_HIGH"
  | "CONTEXT_WINDOW_EXCEEDED"
  | "OUTPUT_CAP_TOO_LOW"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "MISSING_SCHEMA"
  | "UNSUPPORTED_LANGUAGE"
  | "UNSUPPORTED_LOCALE"
  | "MISSING_MODEL_CONFIG"
  | "COST_CEILING_EXCEEDED"
  | "DUPLICATE_FAILED_REQUEST"
  | "MISSING_PARENT_FULL_STORY"
  | "INVALID_PARENT_FULL_STORY"
  | "INVALID_TARGET_RANGE"
  | "INVALID_TOKEN_BUDGET";

export type StoryTokenizerStrategy =
  | "openai-compatible-local-estimate"
  | "conservative-fallback";

export interface StoryModelCapabilities {
  readonly canonicalModel: string;
  readonly aliases: readonly string[];
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
  readonly tokenizerStrategy: StoryTokenizerStrategy;
  readonly defaultSafetyMarginTokens: number;
}

export interface StoryPreflightComponent {
  readonly name:
    | "system-instructions"
    | "story-ir"
    | "genre-policy"
    | "full-story-contract"
    | "language-rules"
    | "canonical-source-narration"
    | "localization-instructions"
    | "repair-instructions"
    | "repair-context"
    | "response-schema-overhead"
    | "request-wrapper-overhead"
    | "expected-output"
    | "safety-reserve"
    | "other";
  readonly label: string;
  readonly estimatedTokens: number;
}

export interface StoryPreflightRequest {
  readonly episodeNumber?: string;
  readonly episodeSlug: string;
  readonly operation: StoryNarrationOperation;
  readonly variant: StoryNarrationVariant;
  readonly language: LanguageCode;
  readonly locale?: string;
  readonly model: string;
  readonly reasoningEffort?: string;
  readonly maxOutputTokens: number;
  readonly retryCap?: number;
  readonly promptVersion: string;
  readonly promptFingerprint: string;
  readonly schemaName?: string;
  readonly schemaVersion?: string;
  readonly schemaFingerprint?: string;
  readonly sourceHash: string;
  readonly targetWordRange?: {
    readonly min: number;
    readonly max: number;
  };
  readonly targetDurationSeconds?: {
    readonly min: number;
    readonly max: number;
  };
  readonly components: readonly StoryPreflightComponent[];
  readonly minimumOutputTokens?: number;
  readonly minimumInputTokens?: number;
  readonly parentArtifact?: {
    readonly kind: "canonical-english-full";
    readonly fingerprint?: string;
    readonly sourceHash: string;
    readonly language?: "en";
    readonly locale?: "en-US";
    readonly variant?: "full";
    readonly storyIrHash?: string;
    readonly contractHash?: string;
    readonly contractBuildFingerprint?: string;
  };
  readonly costCeilingUsd?: number;
  readonly modelPricing?: ModelPricing;
  readonly attempt?: number;
  readonly existingFailedFingerprint?: boolean;
}

export interface StoryPreflightDiagnostics {
  readonly operation: StoryNarrationOperation;
  readonly variant: StoryNarrationVariant;
  readonly language: LanguageCode;
  readonly locale?: string;
  readonly model: string;
  readonly canonicalModel: string;
  readonly promptVersion: string;
  readonly promptFingerprint: string;
  readonly policyVersion: string;
  readonly modelCapabilityFingerprint: string;
  readonly tokenizerStrategy: StoryTokenizerStrategy;
  readonly estimatedInputTokens: number;
  readonly estimatedMinimumOutputTokens: number;
  readonly requestedOutputTokens: number;
  readonly contextWindowTokens: number;
  readonly maxModelOutputTokens: number;
  readonly safetyMarginTokens: number;
  readonly totalProjectedTokens: number;
  readonly remainingContextTokens: number;
  readonly exceededTokens: number;
  readonly largestComponents: readonly StoryPreflightComponent[];
  readonly recommendedAction?: string;
  readonly estimatedCostUsd?: number | null;
  readonly warnings: readonly string[];
}

export type StoryPreflightResult =
  | {
      readonly status: "allowed";
      readonly requestFingerprint: string;
      readonly checkedAt: string;
      readonly diagnostics: StoryPreflightDiagnostics;
    }
  | {
      readonly status: "blocked";
      readonly requestFingerprint: string;
      readonly checkedAt: string;
      readonly reason: StoryPreflightBlockingReason;
      readonly failureCodes: readonly StoryPreflightFailureCode[];
      readonly diagnostics: StoryPreflightDiagnostics;
    };

export const storyPreflightComponentSchema = z.object({
  name: z.enum([
    "system-instructions",
    "story-ir",
    "genre-policy",
    "full-story-contract",
    "language-rules",
    "canonical-source-narration",
    "localization-instructions",
    "repair-instructions",
    "repair-context",
    "response-schema-overhead",
    "request-wrapper-overhead",
    "expected-output",
    "safety-reserve",
    "other",
  ]),
  label: z.string().min(1),
  estimatedTokens: z.number().int().nonnegative(),
});

export const storyPreflightResultSchema: z.ZodType<StoryPreflightResult> =
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("allowed"),
      requestFingerprint: z.string().min(1),
      checkedAt: z.string().min(1),
      diagnostics: z.record(z.string(), z.unknown()) as unknown as z.ZodType<
        StoryPreflightDiagnostics
      >,
    }),
    z.object({
      status: z.literal("blocked"),
      requestFingerprint: z.string().min(1),
      checkedAt: z.string().min(1),
      reason: z.enum([
        "input-context-size",
        "output-limit",
        "invalid-configuration",
        "unsupported-model",
        "operation-minimum-requirements",
      ]),
      failureCodes: z.array(
        z.enum([
          "INPUT_TOKEN_ESTIMATE_TOO_HIGH",
          "CONTEXT_WINDOW_EXCEEDED",
          "OUTPUT_CAP_TOO_LOW",
          "OUTPUT_LIMIT_EXCEEDED",
          "MISSING_SCHEMA",
          "UNSUPPORTED_LANGUAGE",
          "UNSUPPORTED_LOCALE",
          "MISSING_MODEL_CONFIG",
          "COST_CEILING_EXCEEDED",
          "DUPLICATE_FAILED_REQUEST",
          "MISSING_PARENT_FULL_STORY",
          "INVALID_PARENT_FULL_STORY",
          "INVALID_TARGET_RANGE",
          "INVALID_TOKEN_BUDGET",
        ])
      ),
      diagnostics: z.record(z.string(), z.unknown()) as unknown as z.ZodType<
        StoryPreflightDiagnostics
      >,
    }),
  ]);

const MODEL_CAPABILITIES: readonly StoryModelCapabilities[] = [
  {
    canonicalModel: "gpt-5",
    aliases: ["gpt-5", "gpt-5-mini", "gpt-5.4-mini", "gpt-5.5"],
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    tokenizerStrategy: "openai-compatible-local-estimate",
    defaultSafetyMarginTokens: 4_096,
  },
  {
    canonicalModel: "gpt-4.1",
    aliases: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"],
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 32_768,
    tokenizerStrategy: "openai-compatible-local-estimate",
    defaultSafetyMarginTokens: 4_096,
  },
  {
    canonicalModel: "gpt-4o",
    aliases: ["gpt-4o", "gpt-4o-mini"],
    contextWindowTokens: 128_000,
    maxOutputTokens: 16_384,
    tokenizerStrategy: "openai-compatible-local-estimate",
    defaultSafetyMarginTokens: 2_048,
  },
  {
    canonicalModel: "gpt-3.5-turbo",
    aliases: ["gpt-3.5-turbo"],
    contextWindowTokens: 16_385,
    maxOutputTokens: 4_096,
    tokenizerStrategy: "openai-compatible-local-estimate",
    defaultSafetyMarginTokens: 1_024,
  },
];

const UNKNOWN_MODEL_FALLBACK: StoryModelCapabilities = {
  canonicalModel: "unknown-conservative-fallback",
  aliases: [],
  contextWindowTokens: 128_000,
  maxOutputTokens: 16_384,
  tokenizerStrategy: "conservative-fallback",
  defaultSafetyMarginTokens: 4_096,
};

export function resolveStoryModelCapabilities(model: string): {
  readonly capabilities: StoryModelCapabilities;
  readonly known: boolean;
  readonly warnings: readonly string[];
} {
  const normalized = model.trim().toLowerCase();
  const exact = MODEL_CAPABILITIES.find((entry) =>
    entry.aliases.some((alias) => alias.toLowerCase() === normalized)
  );
  if (exact) {
    return { capabilities: exact, known: true, warnings: [] };
  }
  const family = MODEL_CAPABILITIES.find((entry) =>
    normalized.startsWith(entry.canonicalModel)
  );
  if (family) {
    return { capabilities: family, known: true, warnings: [] };
  }
  return {
    capabilities: UNKNOWN_MODEL_FALLBACK,
    known: false,
    warnings: [
      `Unknown model ${model}; using conservative fallback context and output limits.`,
    ],
  };
}

export function estimateStoryTokens(
  text: string,
  strategy: StoryTokenizerStrategy
): number {
  const normalized = text.replace(/\r\n/gu, "\n");
  if (normalized.length === 0) {
    return 0;
  }
  if (strategy === "conservative-fallback") {
    return Math.max(1, Math.ceil(normalized.length / 2.5));
  }
  const ascii = (normalized.match(/[\x00-\x7F]/gu) ?? []).length;
  const nonAscii = normalized.length - ascii;
  const wordish = (normalized.match(/[\p{L}\p{N}_]+/gu) ?? []).length;
  const punctuation = (normalized.match(/[^\s\p{L}\p{N}_]/gu) ?? []).length;
  return Math.max(
    1,
    Math.ceil(ascii / 4 + nonAscii / 2 + wordish * 0.15 + punctuation * 0.25)
  );
}

export function estimateStoryComponent(args: {
  readonly name: StoryPreflightComponent["name"];
  readonly label: string;
  readonly text: string;
  readonly strategy?: StoryTokenizerStrategy;
}): StoryPreflightComponent {
  return {
    name: args.name,
    label: args.label,
    estimatedTokens: estimateStoryTokens(
      args.text,
      args.strategy ?? "openai-compatible-local-estimate"
    ),
  };
}

export function estimateStructuredRequestWrapperTokens(args: {
  readonly schemaName?: string;
  readonly schemaVersion?: string;
  readonly schemaFingerprint?: string;
}): number {
  return estimateStoryTokens(stableSerialize(args), "conservative-fallback");
}

function estimateMinimumOutputTokens(request: StoryPreflightRequest): number {
  if (request.minimumOutputTokens !== undefined) {
    return request.minimumOutputTokens;
  }
  const expected = request.components.find(
    (component) => component.name === "expected-output"
  );
  if (expected) {
    return expected.estimatedTokens;
  }
  const maxWords = request.targetWordRange?.max;
  if (maxWords !== undefined) {
    return Math.ceil(maxWords * 1.45) + 400;
  }
  return Math.max(1, Math.ceil(request.maxOutputTokens * 0.5));
}

function estimateCostUsd(args: {
  readonly pricing?: ModelPricing;
  readonly inputTokens: number;
  readonly outputTokens: number;
}): number | null {
  if (!args.pricing) {
    return null;
  }
  return (
    (args.inputTokens / 1_000_000) * args.pricing.inputUsdPerMillionTokens +
    (args.outputTokens / 1_000_000) * args.pricing.outputUsdPerMillionTokens
  );
}

function fingerprintModelCapabilities(capabilities: StoryModelCapabilities): string {
  return hashText(
    stableSerialize({
      canonicalModel: capabilities.canonicalModel,
      contextWindowTokens: capabilities.contextWindowTokens,
      maxOutputTokens: capabilities.maxOutputTokens,
      tokenizerStrategy: capabilities.tokenizerStrategy,
      defaultSafetyMarginTokens: capabilities.defaultSafetyMarginTokens,
    })
  );
}

function buildRequestFingerprint(args: {
  readonly request: StoryPreflightRequest;
  readonly capabilities: StoryModelCapabilities;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
}): string {
  return hashText(
    stableSerialize({
      policyVersion: STORY_PREFLIGHT_POLICY_VERSION,
      modelCapabilityFingerprint: fingerprintModelCapabilities(
        args.capabilities
      ),
      operation: args.request.operation,
      variant: args.request.variant,
      language: args.request.language,
      ...(args.request.locale ? { locale: args.request.locale } : {}),
      model: args.request.model,
      ...(args.request.reasoningEffort
        ? { reasoningEffort: args.request.reasoningEffort }
        : {}),
      maxOutputTokens: args.request.maxOutputTokens,
      ...(args.request.retryCap !== undefined
        ? { retryCap: args.request.retryCap }
        : {}),
      promptVersion: args.request.promptVersion,
      promptFingerprint: args.request.promptFingerprint,
      ...(args.request.schemaName ? { schemaName: args.request.schemaName } : {}),
      ...(args.request.schemaVersion
        ? { schemaVersion: args.request.schemaVersion }
        : {}),
      ...(args.request.schemaFingerprint
        ? { schemaFingerprint: args.request.schemaFingerprint }
        : {}),
      sourceHash: args.request.sourceHash,
      ...(args.request.targetWordRange
        ? { targetWordRange: args.request.targetWordRange }
        : {}),
      ...(args.request.targetDurationSeconds
        ? { targetDurationSeconds: args.request.targetDurationSeconds }
        : {}),
      ...(args.request.parentArtifact
        ? { parentArtifact: args.request.parentArtifact }
        : {}),
      estimatedInputTokens: args.estimatedInputTokens,
      estimatedOutputTokens: args.estimatedOutputTokens,
    })
  );
}

export function runStoryGenerationPreflight(
  request: StoryPreflightRequest
): StoryPreflightResult {
  const checkedAt = new Date().toISOString();
  const modelResolution = resolveStoryModelCapabilities(request.model);
  const capabilities = modelResolution.capabilities;
  const componentTotal = request.components
    .filter(
      (component) =>
        component.name !== "expected-output" &&
        component.name !== "safety-reserve"
    )
    .reduce((total, component) => total + component.estimatedTokens, 0);
  const estimatedInputTokens = Math.max(
    request.minimumInputTokens ?? 0,
    componentTotal
  );
  const estimatedMinimumOutputTokens = estimateMinimumOutputTokens(request);
  const safetyMarginTokens = capabilities.defaultSafetyMarginTokens;
  const totalProjectedTokens =
    estimatedInputTokens + request.maxOutputTokens + safetyMarginTokens;
  const remainingContextTokens =
    capabilities.contextWindowTokens - totalProjectedTokens;
  const estimatedCostUsd = estimateCostUsd({
    ...(request.modelPricing ? { pricing: request.modelPricing } : {}),
    inputTokens: estimatedInputTokens,
    outputTokens: request.maxOutputTokens,
  });
  const requestFingerprint = buildRequestFingerprint({
    request,
    capabilities,
    estimatedInputTokens,
    estimatedOutputTokens: estimatedMinimumOutputTokens,
  });
  const warnings = [...modelResolution.warnings];
  if (estimatedCostUsd === null && request.costCeilingUsd !== undefined) {
    warnings.push("Cost ceiling configured but no model pricing is available.");
  }
  const diagnostics: StoryPreflightDiagnostics = {
    operation: request.operation,
    variant: request.variant,
    language: request.language,
    ...(request.locale ? { locale: request.locale } : {}),
    model: request.model,
    canonicalModel: capabilities.canonicalModel,
    promptVersion: request.promptVersion,
    promptFingerprint: request.promptFingerprint,
    policyVersion: STORY_PREFLIGHT_POLICY_VERSION,
    modelCapabilityFingerprint: fingerprintModelCapabilities(capabilities),
    tokenizerStrategy: capabilities.tokenizerStrategy,
    estimatedInputTokens,
    estimatedMinimumOutputTokens,
    requestedOutputTokens: request.maxOutputTokens,
    contextWindowTokens: capabilities.contextWindowTokens,
    maxModelOutputTokens: capabilities.maxOutputTokens,
    safetyMarginTokens,
    totalProjectedTokens,
    remainingContextTokens,
    exceededTokens: Math.max(0, -remainingContextTokens),
    largestComponents: [...request.components]
      .sort((left, right) => right.estimatedTokens - left.estimatedTokens)
      .slice(0, 6),
    ...(estimatedCostUsd !== null ? { estimatedCostUsd } : {}),
    warnings,
  };
  const failureCodes: StoryPreflightFailureCode[] = [];
  if (!languageCodes.includes(request.language)) {
    failureCodes.push("UNSUPPORTED_LANGUAGE");
  }
  if (!request.schemaName || !request.schemaVersion || !request.schemaFingerprint) {
    failureCodes.push("MISSING_SCHEMA");
  }
  if (
    !Number.isInteger(request.maxOutputTokens) ||
    request.maxOutputTokens <= 0 ||
    !Number.isInteger(capabilities.contextWindowTokens) ||
    !Number.isInteger(capabilities.maxOutputTokens) ||
    !Number.isInteger(safetyMarginTokens) ||
    safetyMarginTokens <= 0
  ) {
    failureCodes.push("INVALID_TOKEN_BUDGET");
  }
  if (
    request.targetWordRange &&
    (!Number.isInteger(request.targetWordRange.min) ||
      !Number.isInteger(request.targetWordRange.max) ||
      request.targetWordRange.min <= 0 ||
      request.targetWordRange.max < request.targetWordRange.min)
  ) {
    failureCodes.push("INVALID_TARGET_RANGE");
  }
  if (
    (request.variant === "canonical-english-short" ||
      request.variant === "localized-short" ||
      request.variant === "localized-full") &&
    !request.parentArtifact
  ) {
    failureCodes.push("MISSING_PARENT_FULL_STORY");
  }
  if (request.variant === "localized-full" && request.parentArtifact) {
    if (
      request.parentArtifact.kind !== "canonical-english-full" ||
      !request.parentArtifact.fingerprint ||
      request.parentArtifact.language !== "en" ||
      request.parentArtifact.locale !== "en-US" ||
      request.parentArtifact.variant !== "full" ||
      request.parentArtifact.sourceHash !== request.sourceHash ||
      (request.parentArtifact.storyIrHash?.length ?? 0) < 64 ||
      (request.parentArtifact.contractHash?.length ?? 0) < 64 ||
      (request.parentArtifact.contractBuildFingerprint?.length ?? 0) < 64
    ) {
      failureCodes.push("INVALID_PARENT_FULL_STORY");
    }
  }
  if (request.existingFailedFingerprint) {
    failureCodes.push("DUPLICATE_FAILED_REQUEST");
  }
  if (request.maxOutputTokens > capabilities.maxOutputTokens) {
    failureCodes.push("OUTPUT_LIMIT_EXCEEDED");
  }
  if (request.maxOutputTokens < estimatedMinimumOutputTokens) {
    failureCodes.push("OUTPUT_CAP_TOO_LOW");
  }
  if (estimatedInputTokens + safetyMarginTokens >= capabilities.contextWindowTokens) {
    failureCodes.push("INPUT_TOKEN_ESTIMATE_TOO_HIGH");
  }
  if (remainingContextTokens < 0) {
    failureCodes.push("CONTEXT_WINDOW_EXCEEDED");
  }
  if (
    request.costCeilingUsd !== undefined &&
    estimatedCostUsd !== null &&
    estimatedCostUsd > request.costCeilingUsd
  ) {
    failureCodes.push("COST_CEILING_EXCEEDED");
  }
  if (failureCodes.length === 0) {
    return {
      status: "allowed",
      requestFingerprint,
      checkedAt,
      diagnostics,
    };
  }
  const reason: StoryPreflightBlockingReason = failureCodes.some((code) =>
    ["OUTPUT_LIMIT_EXCEEDED", "OUTPUT_CAP_TOO_LOW"].includes(code)
  )
    ? "output-limit"
    : failureCodes.some((code) =>
          ["INVALID_TOKEN_BUDGET", "INVALID_TARGET_RANGE", "MISSING_SCHEMA"].includes(
            code
          )
        )
      ? "invalid-configuration"
      : failureCodes.some((code) =>
            [
              "MISSING_PARENT_FULL_STORY",
              "INVALID_PARENT_FULL_STORY",
              "UNSUPPORTED_LANGUAGE",
            ].includes(code)
          )
        ? "operation-minimum-requirements"
        : "input-context-size";
  const recommendedAction =
    reason === "output-limit"
      ? "Reduce the expected output size or choose a model/output cap that supports the request."
      : reason === "input-context-size"
        ? "Reduce source or repair context, or choose a model with a larger context window."
        : reason === "invalid-configuration"
          ? "Fix the model, schema, or token budget configuration before retrying."
          : "Provide the required parent artifact or supported language before retrying.";
  return {
    status: "blocked",
    requestFingerprint,
    checkedAt,
    reason,
    failureCodes: [...new Set(failureCodes)],
    diagnostics: {
      ...diagnostics,
      recommendedAction,
    },
  };
}

export class StoryGenerationPreflightError extends Error {
  readonly result: Extract<StoryPreflightResult, { status: "blocked" }>;

  constructor(result: Extract<StoryPreflightResult, { status: "blocked" }>) {
    super(formatStoryPreflightBlockedMessage(result));
    this.name = "StoryGenerationPreflightError";
    this.result = result;
  }
}

export function formatStoryPreflightBlockedMessage(
  result: Extract<StoryPreflightResult, { status: "blocked" }>
): string {
  return [
    `Story generation preflight blocked ${result.diagnostics.variant} for ${result.diagnostics.language}.`,
    `Reason: ${result.reason}.`,
    `Codes: ${result.failureCodes.join(", ")}.`,
    `Estimated input ${result.diagnostics.estimatedInputTokens}, requested output ${result.diagnostics.requestedOutputTokens}, context limit ${result.diagnostics.contextWindowTokens}, output limit ${result.diagnostics.maxModelOutputTokens}, safety reserve ${result.diagnostics.safetyMarginTokens}.`,
    result.diagnostics.recommendedAction,
  ]
    .filter(Boolean)
    .join(" ");
}

export function assertStoryPreflightAllowed(
  result: StoryPreflightResult
): asserts result is Extract<StoryPreflightResult, { status: "allowed" }> {
  if (result.status === "blocked") {
    throw new StoryGenerationPreflightError(result);
  }
}

export function resolveStoryPreflightDirectory(cacheDirectory: string): string {
  return path.join(cacheDirectory, "preflight");
}

export function storyPreflightRecordPath(
  preflightDirectory: string,
  requestFingerprint: string
): string {
  return path.join(preflightDirectory, `${requestFingerprint}.json`);
}

export async function readStoryPreflightRecord(args: {
  readonly preflightDirectory: string;
  readonly requestFingerprint: string;
}): Promise<StoryPreflightResult | null> {
  return readJsonIfExists(
    storyPreflightRecordPath(args.preflightDirectory, args.requestFingerprint),
    (value) => storyPreflightResultSchema.parse(value)
  );
}

export async function writeStoryPreflightRecord(args: {
  readonly preflightDirectory: string;
  readonly result: StoryPreflightResult;
}): Promise<void> {
  await ensureDir(args.preflightDirectory);
  await writeJsonAtomic(
    storyPreflightRecordPath(
      args.preflightDirectory,
      args.result.requestFingerprint
    ),
    {
      schemaVersion: STORY_PREFLIGHT_SCHEMA_VERSION,
      ...args.result,
    }
  );
}

export async function runAndPersistStoryPreflight(args: {
  readonly preflightDirectory: string;
  readonly request: StoryPreflightRequest;
}): Promise<StoryPreflightResult> {
  const initial = runStoryGenerationPreflight(args.request);
  const existing = await readStoryPreflightRecord({
    preflightDirectory: args.preflightDirectory,
    requestFingerprint: initial.requestFingerprint,
  });
  const result =
    existing?.status === "blocked"
      ? runStoryGenerationPreflight({
          ...args.request,
          existingFailedFingerprint: true,
        })
      : initial;
  if (result.status === "blocked") {
    await writeStoryPreflightRecord({
      preflightDirectory: args.preflightDirectory,
      result,
    });
  }
  return result;
}
