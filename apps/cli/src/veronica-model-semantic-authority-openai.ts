import {
  VERONICA_SEMANTIC_BEAT_PLAN_JSON_SCHEMA,
  VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
  VERONICA_SEMANTIC_MODEL_CONFIGURATION,
  VERONICA_SEMANTIC_PROMPT_VERSION,
  VERONICA_SEMANTIC_STABLE_PROMPT,
  VeronicaSemanticProviderError,
  veronicaSemanticUsageSchema,
  type VeronicaSemanticProviderPort,
  type VeronicaSemanticProviderResponse,
  type VeronicaSemanticRequest,
} from "@mediaforge/strategic-reinvention";
import type { LogicalRequestFingerprint } from "@mediaforge/shared";

interface OpenAiSemanticResponse {
  readonly id?: string;
  readonly model?: string;
  readonly output_text?: string;
  readonly output?: readonly {
    readonly type?: string;
    readonly content?: readonly {
      readonly type?: string;
      readonly refusal?: string;
    }[];
  }[];
  readonly incomplete_details?: { readonly reason?: string } | null;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly input_tokens_details?: { readonly cached_tokens?: number };
    readonly output_tokens_details?: { readonly reasoning_tokens?: number };
  };
}

export interface OpenAiSemanticClient {
  readonly responses: {
    create(
      request: Readonly<Record<string, unknown>>,
      options?: { readonly signal?: AbortSignal },
    ): Promise<OpenAiSemanticResponse>;
  };
}

function providerError(error: unknown): VeronicaSemanticProviderError {
  const record =
    error && typeof error === "object"
      ? (error as {
          readonly status?: unknown;
          readonly code?: unknown;
          readonly name?: unknown;
          readonly message?: unknown;
        })
      : null;
  const status = typeof record?.status === "number" ? record.status : null;
  const code = typeof record?.code === "string" ? record.code : null;
  const name = typeof record?.name === "string" ? record.name : null;
  const retryable =
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (status !== null && status >= 500 && status <= 599) ||
    name === "AbortError" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT";
  return new VeronicaSemanticProviderError(
    typeof record?.message === "string"
      ? record.message.replace(/sk-[A-Za-z0-9_-]+/gu, "[REDACTED]")
      : "OpenAI semantic request failed.",
    retryable,
    status === 401 || status === 403
      ? "SEMANTIC_PROVIDER_AUTHENTICATION_ERROR"
      : status === 400
        ? "SEMANTIC_PROVIDER_REQUEST_REJECTED"
        : status === 429
          ? "SEMANTIC_PROVIDER_RATE_LIMITED"
          : retryable
            ? "SEMANTIC_PROVIDER_TRANSIENT_ERROR"
            : "SEMANTIC_PROVIDER_REJECTED",
    error instanceof Error ? { cause: error } : undefined,
  );
}

function refusal(response: OpenAiSemanticResponse): string | null {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") return content.refusal ?? "refused";
    }
  }
  return null;
}

function parseStrictStructuredOutput(response: OpenAiSemanticResponse): unknown {
  const refusalText = refusal(response);
  if (refusalText) {
    throw new VeronicaSemanticProviderError(
      `Semantic provider refusal: ${refusalText}`,
      false,
      "SEMANTIC_PROVIDER_REFUSAL",
    );
  }
  if (response.incomplete_details) {
    throw new VeronicaSemanticProviderError(
      `Semantic provider response was incomplete: ${response.incomplete_details.reason ?? "unknown"}.`,
      false,
      "SEMANTIC_PROVIDER_INCOMPLETE",
    );
  }
  if (typeof response.output_text !== "string" || response.output_text.length === 0) {
    throw new VeronicaSemanticProviderError(
      "Semantic provider returned no Structured Outputs payload.",
      false,
      "SEMANTIC_STRUCTURED_OUTPUT_MISSING",
    );
  }
  try {
    return JSON.parse(response.output_text) as unknown;
  } catch (error) {
    throw new VeronicaSemanticProviderError(
      "Semantic provider Structured Outputs payload was not valid JSON.",
      false,
      "SEMANTIC_STRUCTURED_OUTPUT_MALFORMED",
      { cause: error },
    );
  }
}

function dynamicPayload(request: VeronicaSemanticRequest): string {
  return JSON.stringify({
    task: "Interpret only this bounded source window.",
    source: request.source,
    contextBefore: request.contextBefore,
    contextAfter: request.contextAfter,
    allowedActionOwnerTypes: request.allowedOwnerTypes,
    semanticSchemaVersion: VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
    promptVersion: VERONICA_SEMANTIC_PROMPT_VERSION,
  });
}

export class OpenAiVeronicaSemanticAuthorityAdapter
  implements VeronicaSemanticProviderPort
{
  public constructor(
    private readonly client: OpenAiSemanticClient,
    private readonly timeoutMs = VERONICA_SEMANTIC_MODEL_CONFIGURATION.timeoutMs,
  ) {}

  public async plan(input: {
    readonly request: VeronicaSemanticRequest;
    readonly semanticFingerprint: LogicalRequestFingerprint;
    readonly signal?: AbortSignal;
  }): Promise<VeronicaSemanticProviderResponse> {
    const request = {
      model: VERONICA_SEMANTIC_MODEL_CONFIGURATION.model,
      reasoning: VERONICA_SEMANTIC_MODEL_CONFIGURATION.reasoning,
      store: VERONICA_SEMANTIC_MODEL_CONFIGURATION.store,
      max_output_tokens: VERONICA_SEMANTIC_MODEL_CONFIGURATION.maxOutputTokens,
      prompt_cache_key: "veronica-semantic-authority:gpt-5.6-sol:v1",
      tools: [],
      input: [
        {
          role: "system",
          content: [
            { type: "input_text", text: VERONICA_SEMANTIC_STABLE_PROMPT },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: dynamicPayload(input.request) }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "veronica_semantic_beat_plan",
          strict: true,
          schema: VERONICA_SEMANTIC_BEAT_PLAN_JSON_SCHEMA,
        },
      },
      metadata: {
        semantic_fingerprint: input.semanticFingerprint.slice(0, 32),
        prompt_version: VERONICA_SEMANTIC_PROMPT_VERSION,
      },
    } as const;
    try {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const signal = input.signal
        ? AbortSignal.any([input.signal, timeout])
        : timeout;
      const response = await this.client.responses.create(request, { signal });
      return {
        output: parseStrictStructuredOutput(response),
        providerRequestId: response.id ?? null,
        actualModel:
          response.model ?? VERONICA_SEMANTIC_MODEL_CONFIGURATION.model,
        usage: veronicaSemanticUsageSchema.parse({
          inputTokens: response.usage?.input_tokens ?? 0,
          cachedInputTokens:
            response.usage?.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          reasoningTokens:
            response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
        }),
      };
    } catch (error) {
      if (error instanceof VeronicaSemanticProviderError) throw error;
      throw providerError(error);
    }
  }
}
