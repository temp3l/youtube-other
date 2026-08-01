import { z } from "zod";
import { hashText } from "@mediaforge/shared";
import {
  canonicalGenreAnalysisInputSchema,
  creativeBriefSchema,
  dynamicGenreProfileSchema,
  type CanonicalGenreAnalysisInput,
  type DynamicGenreAnalyzer,
  type GenreAnalysisContext,
  type GenreAnalysisResult,
  type ResolutionWarning,
} from "./contracts.js";
import { DynamicGenreError } from "./errors.js";
import { selectBaseProfile } from "./base-profiles.js";
import {
  createNeutralCreativeBrief,
  createNeutralDynamicGenreProfile,
  NEUTRAL_FALLBACK_WARNING,
} from "./neutral-fallback.js";
import {
  buildDynamicGenreAnalysisPrompt,
  buildDynamicGenreRepairPrompt,
  DYNAMIC_GENRE_ANALYSIS_PROMPT_VERSION,
} from "./prompt.js";

/** Schema a trusted provider adapter may use for native structured-output requests. */
export const dynamicGenreStructuredOutputSchema = z
  .strictObject({
    creativeBrief: creativeBriefSchema,
    profile: dynamicGenreProfileSchema,
  })
  .superRefine((value, context) => {
    if (
      value.creativeBrief.primaryGenre !==
      value.profile.classification.primaryGenre
    ) {
      context.addIssue({
        code: "custom",
        path: ["profile", "classification", "primaryGenre"],
        message: "Profile primary genre must match the creative brief.",
      });
    }
    if (
      Math.abs(
        value.creativeBrief.genreConfidence -
          value.profile.classification.confidence
      ) > 0.001
    ) {
      context.addIssue({
        code: "custom",
        path: ["profile", "classification", "confidence"],
        message: "Profile confidence must match the creative brief.",
      });
    }
    const trustedBase = selectBaseProfile(
      value.profile.classification.primaryGenre,
      value.profile.classification.secondaryGenres
    );
    if (value.profile.classification.selectedBaseProfile !== trustedBase) {
      context.addIssue({
        code: "custom",
        path: ["profile", "classification", "selectedBaseProfile"],
        message:
          "Base-profile hint must match the deterministic semantic mapping.",
      });
    }
  });
export const MAX_DYNAMIC_GENRE_REPAIR_ATTEMPTS = 1;

export interface DynamicGenreStructuredOutputResponse {
  readonly value: unknown;
  readonly providerMetadata: {
    readonly provider: string;
    readonly model: string;
    readonly requestId?: string;
  };
}

/** An adapter-owned port: this package never instantiates an LLM/OpenAI client. */
export interface DynamicGenreStructuredOutputProvider {
  analyze(request: {
    readonly prompt: string;
    readonly signal: AbortSignal;
  }): Promise<DynamicGenreStructuredOutputResponse>;
  repair(request: {
    readonly prompt: string;
    readonly validationIssues: readonly string[];
    readonly previousResponse: unknown;
    readonly signal: AbortSignal;
  }): Promise<DynamicGenreStructuredOutputResponse>;
}

export interface DynamicGenreAnalyzerOptions {
  readonly timeoutMs?: number;
}
const providerEnvelopeSchema = z.strictObject({
  value: z.unknown(),
  providerMetadata: z.strictObject({
    provider: z.string().trim().min(1).max(120),
    model: z.string().trim().min(1).max(120),
    requestId: z.string().trim().min(1).max(160).optional(),
  }),
});

function validationIssues(error: z.ZodError): readonly string[] {
  return error.issues
    .slice(0, 30)
    .map((issue) =>
      `${issue.path.join(".") || "response"}: ${issue.message}`.slice(0, 240)
    );
}

function normalizePayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
function normalizeProviderEnvelope(
  value: z.infer<typeof providerEnvelopeSchema>
): DynamicGenreStructuredOutputResponse {
  return {
    value: value.value,
    providerMetadata: {
      provider: value.providerMetadata.provider,
      model: value.providerMetadata.model,
      ...(value.providerMetadata.requestId === undefined
        ? {}
        : { requestId: value.providerMetadata.requestId }),
    },
  };
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function mergeSignals(
  external: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; dispose: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timeoutFired = false;
  const timeout = setTimeout(() => {
    timeoutFired = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  external?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      external?.removeEventListener("abort", onAbort);
    },
    timedOut: () => timeoutFired,
  };
}

export class StructuredDynamicGenreAnalyzer implements DynamicGenreAnalyzer {
  readonly #timeoutMs: number;
  constructor(
    readonly provider: DynamicGenreStructuredOutputProvider,
    options: DynamicGenreAnalyzerOptions = {}
  ) {
    this.#timeoutMs = options.timeoutMs ?? 20_000;
  }

  async analyze(
    input: CanonicalGenreAnalysisInput,
    context: GenreAnalysisContext
  ): Promise<GenreAnalysisResult> {
    const parsedInput = canonicalGenreAnalysisInputSchema.safeParse(input);
    if (!parsedInput.success)
      throw new DynamicGenreError(
        "invalid_analysis_input",
        "Dynamic genre input is invalid.",
        false,
        validationIssues(parsedInput.error)
      );
    if (!Number.isFinite(this.#timeoutMs) || this.#timeoutMs <= 0)
      throw new DynamicGenreError(
        "resolution_failure",
        "Dynamic genre analyzer timeout is invalid."
      );

    const lifecycle = mergeSignals(context.signal, this.#timeoutMs);
    const attempts: {
      attempt: number;
      valid: boolean;
      issues: readonly string[];
    }[] = [];
    let response: DynamicGenreStructuredOutputResponse;
    if (lifecycle.signal.aborted) {
      lifecycle.dispose();
      throw new DynamicGenreError(
        "analysis_provider_unavailable",
        "Dynamic genre analysis was cancelled.",
        true
      );
    }
    try {
      const rawResponse = await this.provider.analyze({
        prompt: buildDynamicGenreAnalysisPrompt(parsedInput.data, context),
        signal: lifecycle.signal,
      });
      const envelope = providerEnvelopeSchema.safeParse(rawResponse);
      if (!envelope.success)
        throw new DynamicGenreError(
          "analysis_provider_unavailable",
          "Dynamic genre provider returned an invalid response envelope.",
          true
        );
      response = normalizeProviderEnvelope(envelope.data);
    } catch (error) {
      lifecycle.dispose();
      if (lifecycle.timedOut())
        throw new DynamicGenreError(
          "analysis_timeout",
          "Dynamic genre analysis timed out.",
          true
        );
      if (isAbort(error) || context.signal?.aborted)
        throw new DynamicGenreError(
          "analysis_provider_unavailable",
          "Dynamic genre analysis was cancelled.",
          true
        );
      throw new DynamicGenreError(
        "analysis_provider_unavailable",
        "Dynamic genre analysis provider is unavailable.",
        true
      );
    }

    let candidate = normalizePayload(response.value);
    let validation = dynamicGenreStructuredOutputSchema.safeParse(candidate);
    if (validation.success) {
      attempts.push({ attempt: 1, valid: true, issues: [] });
      lifecycle.dispose();
      return this.result(validation.data, response, attempts, false, []);
    }
    const firstIssues = validationIssues(validation.error);
    attempts.push({ attempt: 1, valid: false, issues: firstIssues });

    if (context.budgetTier === "economy") {
      lifecycle.dispose();
      return this.fallback(
        parsedInput.data,
        response,
        attempts,
        "Analysis validation failed and the economy tier permits one analysis call."
      );
    }

    try {
      const rawRepair = await this.provider.repair({
        prompt: buildDynamicGenreRepairPrompt(firstIssues),
        validationIssues: firstIssues,
        previousResponse: candidate,
        signal: lifecycle.signal,
      });
      const envelope = providerEnvelopeSchema.safeParse(rawRepair);
      if (!envelope.success)
        throw new DynamicGenreError(
          "structured_output_validation_failed",
          "Dynamic genre repair returned an invalid response envelope."
        );
      response = normalizeProviderEnvelope(envelope.data);
      candidate = normalizePayload(response.value);
      validation = dynamicGenreStructuredOutputSchema.safeParse(candidate);
      if (validation.success) {
        attempts.push({ attempt: 2, valid: true, issues: [] });
        lifecycle.dispose();
        return this.result(validation.data, response, attempts, false, []);
      }
      attempts.push({
        attempt: 2,
        valid: false,
        issues: validationIssues(validation.error),
      });
    } catch (error) {
      if (lifecycle.timedOut()) {
        lifecycle.dispose();
        throw new DynamicGenreError(
          "analysis_timeout",
          "Dynamic genre analysis repair timed out.",
          true
        );
      }
      if (isAbort(error) || context.signal?.aborted) {
        lifecycle.dispose();
        throw new DynamicGenreError(
          "analysis_provider_unavailable",
          "Dynamic genre analysis repair was cancelled.",
          true
        );
      }
      attempts.push({
        attempt: 2,
        valid: false,
        issues: ["repair: provider unavailable"],
      });
    }
    lifecycle.dispose();
    return this.fallback(
      parsedInput.data,
      response,
      attempts,
      "Structured analysis validation failed after one repair attempt."
    );
  }

  private fallback(
    input: CanonicalGenreAnalysisInput,
    response: DynamicGenreStructuredOutputResponse,
    attempts: readonly {
      readonly attempt: number;
      readonly valid: boolean;
      readonly issues: readonly string[];
    }[],
    message: string
  ): GenreAnalysisResult {
    return {
      creativeBrief: createNeutralCreativeBrief(input),
      profile: createNeutralDynamicGenreProfile(),
      providerMetadata: response.providerMetadata,
      rawStructuredResponse: redactedInvalidResponse(response.value),
      validationAttempts: attempts,
      fallbackApplied: true,
      warnings: [
        NEUTRAL_FALLBACK_WARNING,
        { code: "repair-exhausted", message, field: "analysis" },
      ],
    };
  }

  private result(
    value: z.infer<typeof dynamicGenreStructuredOutputSchema>,
    response: DynamicGenreStructuredOutputResponse,
    attempts: readonly {
      readonly attempt: number;
      readonly valid: boolean;
      readonly issues: readonly string[];
    }[],
    fallbackApplied: boolean,
    warnings: readonly ResolutionWarning[]
  ): GenreAnalysisResult {
    return {
      creativeBrief: value.creativeBrief,
      profile: value.profile,
      providerMetadata: response.providerMetadata,
      rawStructuredResponse: value,
      validationAttempts: attempts,
      fallbackApplied,
      warnings,
    };
  }
}

function redactedInvalidResponse(value: unknown): unknown {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = "[unserializable]";
  }
  return {
    redacted: true,
    sha256: hashText(serialized),
    byteLength: Buffer.byteLength(serialized, "utf8"),
  };
}

/** Default analyzer implementation; its provider must be supplied by a trusted adapter. */
export class DefaultDynamicGenreAnalyzer extends StructuredDynamicGenreAnalyzer {}

export { DYNAMIC_GENRE_ANALYSIS_PROMPT_VERSION };
