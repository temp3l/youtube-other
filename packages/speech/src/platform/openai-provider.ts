import type {
  ProviderSpeechResult,
  ResolvedSpeechProfile,
  SpeechCostEstimate,
  SpeechProvider,
  SpeechSynthesisRequest,
} from "./contracts.js";
import { SpeechDomainError } from "./errors.js";

export interface OpenAiSpeechTransport {
  synthesize(input: {
    readonly text: string;
    readonly model: string;
    readonly voice: string;
    readonly instructions?: string;
    readonly outputFormat: string;
    readonly speed: number;
    readonly abortSignal?: AbortSignal;
  }): Promise<ProviderSpeechResult>;
}

/**
 * Provider-neutral adapter around the existing OpenAI speech transport. Model
 * fallback is intentionally absent: a resolved profile pins one model and voice.
 */
export class OpenAiSpeechProviderAdapter implements SpeechProvider {
  public readonly id = "openai" as const;

  public constructor(private readonly transport: OpenAiSpeechTransport) {}

  public async validateProfile(profile: ResolvedSpeechProfile): Promise<void> {
    if (profile.configuration.provider !== "openai") {
      throw new SpeechDomainError(
        "SPEECH_PROFILE_INVALID",
        "The supplied profile is not an OpenAI speech profile."
      );
    }
    if (
      !profile.configuration.model.trim() ||
      !profile.configuration.voice.trim()
    ) {
      throw new SpeechDomainError(
        "SPEECH_PROFILE_INVALID",
        "OpenAI model and voice are required."
      );
    }
  }

  public async estimate(
    request: SpeechSynthesisRequest
  ): Promise<SpeechCostEstimate> {
    await this.validateProfile(request.profile);
    return { billableCharacters: [...request.text].length };
  }

  public async synthesize(
    request: SpeechSynthesisRequest
  ): Promise<ProviderSpeechResult> {
    await this.validateProfile(request.profile);
    const configuration = request.profile.configuration;
    if (configuration.provider !== "openai") {
      throw new SpeechDomainError(
        "SPEECH_PROFILE_INVALID",
        "The supplied profile is not an OpenAI speech profile."
      );
    }
    try {
      return await this.transport.synthesize({
        text: request.text,
        model: configuration.model,
        voice: configuration.voice,
        ...(configuration.instructions
          ? { instructions: configuration.instructions }
          : {}),
        outputFormat: configuration.outputFormat ?? "wav",
        speed: configuration.speed,
        ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
      });
    } catch (error: unknown) {
      if (error instanceof SpeechDomainError) throw error;
      if (request.abortSignal?.aborted) {
        throw new SpeechDomainError(
          "SPEECH_GENERATION_CANCELLED",
          "OpenAI speech generation was cancelled.",
          { cause: error }
        );
      }
      throw mapOpenAiError(error);
    }
  }
}

function mapOpenAiError(error: unknown): SpeechDomainError {
  const candidate =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const status =
    typeof candidate["status"] === "number" ? candidate["status"] : undefined;
  const name = error instanceof Error ? error.name : "";
  if (
    status === 401 ||
    status === 403 ||
    name === "ProviderAuthenticationError"
  ) {
    return new SpeechDomainError(
      "SPEECH_PROVIDER_AUTHENTICATION_FAILED",
      "OpenAI speech authentication failed.",
      { cause: error }
    );
  }
  if (status === 429)
    return new SpeechDomainError(
      "SPEECH_PROVIDER_RATE_LIMITED",
      "OpenAI rate limited speech generation.",
      { cause: error }
    );
  if (status !== undefined && status >= 400 && status < 500) {
    return new SpeechDomainError(
      "SPEECH_PROVIDER_REJECTED_INPUT",
      "OpenAI rejected the speech request.",
      { cause: error }
    );
  }
  return new SpeechDomainError(
    "SPEECH_PROVIDER_UNAVAILABLE",
    "OpenAI speech generation was temporarily unavailable.",
    { cause: error }
  );
}
