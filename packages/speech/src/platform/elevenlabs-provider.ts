import { Readable, Transform } from "node:stream";
import type {
  ProviderSpeechResult,
  ResolvedSpeechProfile,
  SpeechCostEstimate,
  SpeechProvider,
  SpeechSynthesisRequest,
} from "./contracts.js";
import { SpeechDomainError, type SpeechErrorCode } from "./errors.js";

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_AUDIO_RESPONSE_BYTES = 100 * 1024 * 1024;

export interface ElevenLabsSpeechProviderOptions {
  readonly apiKey?: string;
  readonly featureEnabled: boolean;
  readonly baseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly maxResponseBytes?: number;
  /** Trusted deployment allowlist for an explicitly configured proxy origin. */
  readonly allowedBaseUrlHosts?: readonly string[];
  readonly fetchImplementation?: typeof fetch;
}

interface ElevenLabsErrorBody {
  readonly detail?: unknown;
  readonly message?: unknown;
}

/**
 * Provider-only adapter: all profile resolution, quotas, caching, retries and
 * artifact persistence deliberately remain in SpeechGenerationService.
 */
export class ElevenLabsSpeechProvider implements SpeechProvider {
  public readonly id = "elevenlabs" as const;

  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImplementation: typeof fetch;

  public constructor(
    private readonly options: ElevenLabsSpeechProviderOptions
  ) {
    this.baseUrl = validateBaseUrl(
      options.baseUrl,
      options.allowedBaseUrlHosts
    );
    this.timeoutMs = validatePositiveInteger(
      options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      "requestTimeoutMs"
    );
    this.maxResponseBytes = validatePositiveInteger(
      options.maxResponseBytes ?? MAX_AUDIO_RESPONSE_BYTES,
      "maxResponseBytes"
    );
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  public async validateProfile(profile: ResolvedSpeechProfile): Promise<void> {
    if (profile.configuration.provider !== this.id) {
      throw speechError(
        "SPEECH_PROFILE_INVALID",
        "The supplied profile is not an ElevenLabs profile."
      );
    }
    const config = profile.configuration;
    if (
      !config.modelId.trim() ||
      !config.voiceId.trim() ||
      !config.outputFormat.trim()
    ) {
      throw speechError(
        "SPEECH_PROFILE_INVALID",
        "ElevenLabs model, voice, and output format must be configured."
      );
    }
    const settings = config.settings;
    if (
      ![
        settings.speed,
        settings.stability,
        settings.similarityBoost,
        settings.style,
      ].every(Number.isFinite)
    ) {
      throw speechError(
        "SPEECH_PROFILE_INVALID",
        "ElevenLabs voice settings must be finite numbers."
      );
    }
    if (
      settings.speed <= 0 ||
      settings.stability < 0 ||
      settings.stability > 1 ||
      settings.similarityBoost < 0 ||
      settings.similarityBoost > 1 ||
      settings.style < 0 ||
      settings.style > 1
    ) {
      throw speechError(
        "SPEECH_PROFILE_INVALID",
        "ElevenLabs voice settings are outside their supported ranges."
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
    this.assertEnabledAndConfigured();
    const config = request.profile.configuration;
    if (config.provider !== this.id) {
      throw speechError(
        "SPEECH_PROFILE_INVALID",
        "The supplied profile is not an ElevenLabs profile."
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("ElevenLabs request timed out.")),
      this.timeoutMs
    );
    const signal = mergeAbortSignals(request.abortSignal, controller.signal);
    try {
      const response = await this.fetchImplementation(
        new URL(
          `/v1/text-to-speech/${encodeURIComponent(config.voiceId)}/stream?output_format=${encodeURIComponent(config.outputFormat)}`,
          this.baseUrl
        ),
        {
          method: "POST",
          headers: {
            Accept: "audio/mpeg, audio/*;q=0.9",
            "Content-Type": "application/json",
            "xi-api-key": this.options.apiKey!,
          },
          body: JSON.stringify({
            text: request.text,
            model_id: config.modelId,
            language_code: request.profile.language,
            voice_settings: {
              stability: config.settings.stability,
              similarity_boost: config.settings.similarityBoost,
              style: config.settings.style,
              use_speaker_boost: config.settings.useSpeakerBoost,
              speed: config.settings.speed,
            },
            apply_text_normalization: config.textNormalization ?? "auto",
            pronunciation_dictionary_locators:
              config.pronunciationDictionaryVersions.map((dictionaryId) => ({
                pronunciation_dictionary_id: dictionaryId,
                version_id: dictionaryId,
              })),
            ...contextBody(request),
          }),
          redirect: "error",
          signal,
        }
      );
      if (!response.ok) throw await providerResponseError(response);
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (!contentType || !contentType.startsWith("audio/")) {
        throw speechError(
          "SPEECH_PROVIDER_INVALID_RESPONSE",
          "ElevenLabs returned a response that was not audio."
        );
      }
      const contentLength = response.headers.get("content-length");
      if (
        contentLength &&
        (!/^\d+$/u.test(contentLength) ||
          Number(contentLength) > this.maxResponseBytes)
      ) {
        throw speechError(
          "SPEECH_PROVIDER_INVALID_RESPONSE",
          "ElevenLabs returned an audio response exceeding the configured size limit."
        );
      }
      if (!response.body)
        throw speechError(
          "SPEECH_PROVIDER_INVALID_RESPONSE",
          "ElevenLabs returned an empty audio response."
        );
      const providerRequestId =
        response.headers.get("request-id") ??
        response.headers.get("x-request-id");
      const actualBillableCharacters = parseUsageHeader(
        response.headers,
        "character-count"
      );
      const actualCredits = parseUsageHeader(response.headers, "credits-used");
      return {
        rawAudio: limitStream(
          Readable.fromWeb(response.body as never),
          this.maxResponseBytes
        ),
        rawContentType: contentType,
        ...(providerRequestId === null ? {} : { providerRequestId }),
        ...(actualBillableCharacters === undefined
          ? {}
          : { actualBillableCharacters }),
        ...(actualCredits === undefined ? {} : { actualCredits }),
      };
    } catch (error: unknown) {
      if (isSpeechGenerationError(error)) throw error;
      if (request.abortSignal?.aborted)
        throw speechError(
          "SPEECH_GENERATION_CANCELLED",
          "ElevenLabs speech generation was cancelled."
        );
      if (controller.signal.aborted)
        throw speechError(
          "SPEECH_PROVIDER_TIMEOUT",
          "ElevenLabs speech generation timed out."
        );
      throw speechError(
        "SPEECH_PROVIDER_UNAVAILABLE",
        "ElevenLabs speech generation could not be completed.",
        error
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertEnabledAndConfigured(): void {
    if (!this.options.featureEnabled)
      throw speechError(
        "SPEECH_PROVIDER_DISABLED",
        "ElevenLabs speech generation is disabled by configuration."
      );
    if (!this.options.apiKey?.trim())
      throw speechError(
        "SPEECH_PROVIDER_AUTHENTICATION_FAILED",
        "ElevenLabs speech generation requires a backend API key."
      );
  }
}

function validateBaseUrl(
  rawBaseUrl: string | undefined,
  allowedHosts: readonly string[] | undefined
): URL {
  let url: URL;
  try {
    url = new URL(rawBaseUrl ?? DEFAULT_BASE_URL);
  } catch {
    throw speechError(
      "SPEECH_PROFILE_INVALID",
      "ElevenLabs base URL is invalid."
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw speechError(
      "SPEECH_PROFILE_INVALID",
      "ElevenLabs base URL must be an absolute HTTPS origin without credentials."
    );
  }
  const allowlist = new Set(
    (allowedHosts ?? ["api.elevenlabs.io"]).map((host) =>
      host.trim().toLowerCase()
    )
  );
  if (!allowlist.has(url.hostname.toLowerCase())) {
    throw speechError(
      "SPEECH_PROFILE_INVALID",
      "ElevenLabs base URL host is not in the deployment allowlist."
    );
  }
  return url;
}

function validatePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw speechError(
      "SPEECH_PROFILE_INVALID",
      `${name} must be a positive integer.`
    );
  return value;
}

function contextBody(request: SpeechSynthesisRequest): Record<string, string> {
  const previous = request.chunk?.previousContext;
  const next = request.chunk?.nextContext;
  return {
    ...(previous ? { previous_text: previous } : {}),
    ...(next ? { next_text: next } : {}),
  };
}

function parseUsageHeader(headers: Headers, name: string): number | undefined {
  const value =
    headers.get(`x-elevenlabs-${name}`) ?? headers.get(`xi-${name}`);
  if (!value || !/^\d+(?:\.\d+)?$/u.test(value)) return undefined;
  return Number(value);
}

async function providerResponseError(
  response: Response
): Promise<SpeechDomainError> {
  const body = await readBoundedJson(response, 64 * 1024);
  const detail = providerErrorDetail(body);
  if (response.status === 401 || response.status === 403)
    return speechError(
      "SPEECH_PROVIDER_AUTHENTICATION_FAILED",
      "ElevenLabs authentication failed."
    );
  if (response.status === 429)
    return speechError(
      "SPEECH_PROVIDER_RATE_LIMITED",
      "ElevenLabs rate limited the request."
    );
  if (response.status >= 500)
    return speechError(
      "SPEECH_PROVIDER_UNAVAILABLE",
      "ElevenLabs is temporarily unavailable."
    );
  if (
    response.status === 400 ||
    response.status === 404 ||
    response.status === 422
  )
    return speechError(
      "SPEECH_PROVIDER_REJECTED_INPUT",
      detail
        ? `ElevenLabs rejected the synthesis request: ${detail}`
        : "ElevenLabs rejected the synthesis request."
    );
  return speechError(
    "SPEECH_PROVIDER_INVALID_RESPONSE",
    "ElevenLabs returned an unexpected error response."
  );
}

async function readBoundedJson(
  response: Response,
  maximumBytes: number
): Promise<unknown> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maximumBytes) return undefined;
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk))
  ).toString("utf8");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function providerErrorDetail(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const candidate = body as ElevenLabsErrorBody;
  const value =
    typeof candidate.detail === "string"
      ? candidate.detail
      : typeof candidate.message === "string"
        ? candidate.message
        : undefined;
  return value?.replace(/[\r\n]+/gu, " ").slice(0, 300);
}

function mergeAbortSignals(
  external: AbortSignal | undefined,
  timeout: AbortSignal
): AbortSignal {
  if (!external) return timeout;
  if (typeof AbortSignal.any === "function")
    return AbortSignal.any([external, timeout]);
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  external.addEventListener("abort", abort, { once: true });
  timeout.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function limitStream(stream: Readable, maximumBytes: number): Readable {
  let bytesRead = 0;
  return stream.pipe(
    new Transform({
      transform(chunk: unknown, _encoding, callback): void {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as Uint8Array);
        bytesRead += buffer.byteLength;
        if (bytesRead > maximumBytes) {
          callback(
            speechError(
              "SPEECH_PROVIDER_INVALID_RESPONSE",
              "ElevenLabs audio response exceeded the configured size limit."
            )
          );
          return;
        }
        callback(null, buffer);
      },
    })
  );
}

function speechError(
  code: SpeechErrorCode,
  message: string,
  cause?: unknown
): SpeechDomainError {
  return new SpeechDomainError(
    code,
    message,
    cause === undefined ? undefined : { cause }
  );
}

function isSpeechGenerationError(error: unknown): error is SpeechDomainError {
  return error instanceof SpeechDomainError;
}
