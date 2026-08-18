import { describe, expect, it, vi } from "vitest";
import {
  VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
  VERONICA_SEMANTIC_MODEL_CONFIGURATION,
  VeronicaSemanticProviderError,
} from "@mediaforge/strategic-reinvention";
import {
  OpenAiVeronicaSemanticAuthorityAdapter,
  type OpenAiSemanticClient,
} from "./veronica-model-semantic-authority-openai.js";

const fingerprint = "a".repeat(64) as Parameters<
  OpenAiVeronicaSemanticAuthorityAdapter["plan"]
>[0]["semanticFingerprint"];
const request = {
  source: "Revenue is large while retained margin is small.",
  contextBefore: "",
  contextAfter: "",
  allowedOwnerTypes: ["none", "abstract"] as const,
};
const output = {
  schemaVersion: VERONICA_SEMANTIC_BEAT_PLAN_SCHEMA_VERSION,
  semanticIntent: "retained_value",
  subject: "retained margin",
  actionOwner: { type: "abstract", sourceReference: "retained margin" },
  semanticClaims: [
    {
      claim: "Retained margin is small relative to revenue.",
      sourceEvidence: "Revenue is large while retained margin is small.",
    },
  ],
  visualStrategies: [
    {
      family: "retained-value-reveal",
      description: "Contrast the larger incoming value with the smaller retained value.",
      preservesMeaning: true,
      requiresUnsupportedAction: false,
    },
  ],
  forbiddenInterpretations: ["A person intentionally caused the margin."],
  ambiguity: "none",
  abstain: false,
  abstentionReason: null,
};

describe("OpenAI Veronica semantic-authority adapter", () => {
  it("uses only Responses Structured Outputs with the fixed model and reasoning mode", async () => {
    const create = vi.fn(async () => ({
      id: "resp_fixture",
      model: "gpt-5.6-sol",
      output_text: JSON.stringify(output),
      usage: {
        input_tokens: 100,
        output_tokens: 80,
        input_tokens_details: { cached_tokens: 20 },
        output_tokens_details: { reasoning_tokens: 30 },
      },
    }));
    const adapter = new OpenAiVeronicaSemanticAuthorityAdapter({
      responses: { create },
    });
    const result = await adapter.plan({ request, semanticFingerprint: fingerprint });
    expect(result).toMatchObject({
      output,
      providerRequestId: "resp_fixture",
      actualModel: "gpt-5.6-sol",
      usage: {
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 80,
        reasoningTokens: 30,
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { mode: "pro", effort: "medium" },
      store: false,
      max_output_tokens: VERONICA_SEMANTIC_MODEL_CONFIGURATION.maxOutputTokens,
      tools: [],
      text: {
        format: {
          type: "json_schema",
          strict: true,
        },
      },
    });
  });

  it("fails closed on refusal, malformed output, and missing output without retry hints", async () => {
    const responses = [
      { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] },
      { output_text: "not-json" },
      {},
    ];
    for (const response of responses) {
      const adapter = new OpenAiVeronicaSemanticAuthorityAdapter({
        responses: { create: vi.fn(async () => response) },
      } as OpenAiSemanticClient);
      const error = await adapter
        .plan({ request, semanticFingerprint: fingerprint })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(VeronicaSemanticProviderError);
      expect((error as VeronicaSemanticProviderError).retryable).toBe(false);
    }
  });

  it("classifies only transport-shaped failures as retryable and redacts key-shaped text", async () => {
    const adapter = new OpenAiVeronicaSemanticAuthorityAdapter({
      responses: {
        create: vi.fn(async () => {
          throw Object.assign(new Error("failed sk-secret-value"), { status: 429 });
        }),
      },
    });
    const error = await adapter
      .plan({ request, semanticFingerprint: fingerprint })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VeronicaSemanticProviderError);
    expect(error).toMatchObject({
      retryable: true,
      code: "SEMANTIC_PROVIDER_RATE_LIMITED",
    });
    expect((error as Error).message).not.toContain("sk-secret-value");
  });

  it("distinguishes credential and request rejection", async () => {
    for (const [status, code] of [
      [401, "SEMANTIC_PROVIDER_AUTHENTICATION_ERROR"],
      [400, "SEMANTIC_PROVIDER_REQUEST_REJECTED"],
    ] as const) {
      const adapter = new OpenAiVeronicaSemanticAuthorityAdapter({
        responses: {
          create: vi.fn(async () => {
            throw Object.assign(new Error("provider rejected request"), { status });
          }),
        },
      });
      const error = await adapter
        .plan({ request, semanticFingerprint: fingerprint })
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ retryable: false, code });
    }
  });
});
