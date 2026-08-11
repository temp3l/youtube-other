import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  redactOpenAIDebugValue,
  writeOpenAIDebugLog,
} from "./openai-debug-logger.js";
import { rebuildOpenAIEpisodeCostSummary } from "./openai-cost-summary.js";

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

describe("OpenAI debug logger", () => {
  it("redacts credentials but preserves request content", () => {
    const redacted = redactOpenAIDebugValue({
      headers: {
        Authorization: "Bearer sk-test-secret",
        cookie: "session=secret",
      },
      api_key: "sk-test-secret",
      prompt: "Tell the story exactly as written.",
      model: "gpt-5.5",
      max_output_tokens: 1200,
    });

    expect(redacted).toMatchObject({
      headers: {
        Authorization: "[REDACTED_SECRET]",
        cookie: "[REDACTED_SECRET]",
      },
      api_key: "[REDACTED_SECRET]",
      prompt: "Tell the story exactly as written.",
      model: "gpt-5.5",
      max_output_tokens: 1200,
    });
  });

  it("redacts base64 image responses but preserves structured data", () => {
    const redacted = redactOpenAIDebugValue({
      data: [
        {
          revised_prompt: "A foggy hallway.",
          b64_json: Buffer.alloc(1024, 1).toString("base64"),
        },
      ],
      metadata: { size: "1536x1024", quality: "medium" },
    });

    expect(redacted).toMatchObject({
      data: [
        {
          revised_prompt: "A foggy hallway.",
          b64_json: "[REDACTED_BASE64_IMAGE_RESPONSE]",
        },
      ],
      metadata: { size: "1536x1024", quality: "medium" },
    });
  });

  it("writes episode-local unique files with full request prompts and redacted image payloads", async () => {
    const episodeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openai-debug-episode-"));
    const first = await writeOpenAIDebugLog({
      episodeRoot,
      operation: "rewrite-full",
      mode: "real",
      paidProviderCalled: true,
      model: "gpt-5.5",
      endpoint: "/v1/responses",
      request: {
        input: [{ role: "user", content: "Keep this prompt text." }],
        authorization: "Bearer sk-test-secret",
      },
      response: { id: "resp_1", output_text: "ok" },
      usage: { inputTokens: 10, outputTokens: 5 },
      durationMs: 12,
      attempt: 1,
      status: "success",
    });
    const second = await writeOpenAIDebugLog({
      episodeRoot,
      operation: "rewrite-full",
      mode: "real",
      paidProviderCalled: true,
      model: "gpt-5.5",
      endpoint: "/v1/responses",
      request: { input: "second" },
      response: { id: "resp_2" },
      durationMs: 1,
      attempt: 1,
      status: "success",
    });

    expect(first.filePath).not.toBe(second.filePath);
    expect(first.filePath).toContain(path.join(episodeRoot, "debug", "openai-calls"));
    const payload = await readJson(first.filePath);
    expect(payload).toMatchObject({
      provider: "openai",
      paidProviderCalled: true,
      request: {
        input: [{ role: "user", content: "Keep this prompt text." }],
        authorization: "[REDACTED_SECRET]",
      },
      response: { id: "resp_1", output_text: "ok" },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(first.costSummaryPath).toBe(
      path.join(episodeRoot, "openai-cost-summary.json")
    );
  });

  it("aggregates paid terminal calls with cached-token and image-modality pricing", async () => {
    const episodeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openai-cost-episode-"));
    await writeOpenAIDebugLog({
      episodeRoot,
      operation: "source-grounded-scene-judge",
      mode: "real",
      paidProviderCalled: false,
      model: "gpt-5.4-mini",
      endpoint: "/v1/responses",
      request: { input: "pending" },
      durationMs: 0,
      status: "pre-dispatch",
    });
    await Promise.all([
      writeOpenAIDebugLog({
        episodeRoot,
        operation: "source-grounded-scene-judge",
        mode: "real",
        paidProviderCalled: true,
        model: "gpt-5.4-mini",
        endpoint: "/v1/responses",
        request: { input: "scene batch" },
        response: { id: "resp_1" },
        usage: {
          inputTokens: 1_000,
          cachedInputTokens: 200,
          outputTokens: 100,
        },
        durationMs: 10,
        status: "success",
      }),
      writeOpenAIDebugLog({
        episodeRoot,
        operation: "image-generation",
        mode: "real",
        paidProviderCalled: true,
        model: "gpt-image-2",
        endpoint: "/v1/images/generations",
        request: { model: "gpt-image-2", quality: "low" },
        response: {
          usage: {
            input_tokens: 600,
            input_tokens_details: { text_tokens: 600, image_tokens: 0 },
            output_tokens: 120,
            output_tokens_details: { text_tokens: 0, image_tokens: 120 },
          },
        },
        usage: { imageCount: 1 },
        durationMs: 20,
        status: "success",
      }),
    ]);

    expect(
      await readJson(path.join(episodeRoot, "openai-cost-summary.json"))
    ).toMatchObject({
      calls: {
        loggedRecords: 3,
        paidProviderCalls: 2,
        successfulProviderCalls: 2,
        failedProviderCalls: 0,
        unpricedProviderCalls: 0,
      },
      usage: {
        inputTokens: 1_600,
        cachedInputTokens: 200,
        outputTokens: 220,
        textInputTokens: 600,
        imageOutputTokens: 120,
        imageCount: 1,
      },
      knownEstimatedCostUsd: 0.007665,
      totalEstimatedCostUsd: 0.007665,
      costCoverage: "COMPLETE",
      byModel: {
        "gpt-5.4-mini": {
          providerCalls: 1,
          knownEstimatedCostUsd: 0.001065,
        },
        "gpt-image-2": {
          providerCalls: 1,
          knownEstimatedCostUsd: 0.0066,
        },
      },
    });
  });

  it("fails cost completeness closed for unknown pricing or malformed logs", async () => {
    const episodeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openai-cost-partial-"));
    await writeOpenAIDebugLog({
      episodeRoot,
      operation: "unknown-operation",
      mode: "real",
      paidProviderCalled: true,
      model: "custom-unpriced-model",
      request: { input: "test" },
      usage: { inputTokens: 100, outputTokens: 10 },
      durationMs: 1,
      status: "success",
    });
    await fs.writeFile(
      path.join(episodeRoot, "debug", "openai-calls", "malformed.json"),
      "not json",
      "utf8"
    );
    const summary = await rebuildOpenAIEpisodeCostSummary({
      episodeRoot,
      generatedAt: "2026-08-11T00:00:00.000Z",
    });

    expect(summary).toMatchObject({
      generatedAt: "2026-08-11T00:00:00.000Z",
      calls: {
        skippedMalformedRecords: 1,
        paidProviderCalls: 1,
        unpricedProviderCalls: 1,
      },
      knownEstimatedCostUsd: 0,
      totalEstimatedCostUsd: null,
      costCoverage: "NONE",
    });
  });

  it("preserves prompt text without an opt-in flag", () => {
    expect(redactOpenAIDebugValue({ prompt: "permitted" })).toEqual({ prompt: "permitted" });
  });

  it("preserves root strings and arrays nested under content keys", () => {
    expect(redactOpenAIDebugValue("source phrase")).toBe("source phrase");
    expect(redactOpenAIDebugValue({ content: ["first phrase", "second phrase"] })).toEqual({ content: ["first phrase", "second phrase"] });
  });

  it("writes sanitized failed call details", async () => {
    const episodeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openai-debug-error-"));
    const error = new Error("failed with sk-secret");
    const { filePath } = await writeOpenAIDebugLog({
      episodeRoot,
      operation: "image-generation",
      mode: "real",
      paidProviderCalled: true,
      model: "gpt-image-2",
      endpoint: "/v1/images/generations",
      request: { prompt: "normal visual prompt", apiKey: "sk-test-secret" },
      error: {
        name: error.name,
        message: error.message,
        raw: { Authorization: "Bearer sk-test-secret" },
      },
      durationMs: 3,
      status: "error",
    });

    expect(await readJson(filePath)).toMatchObject({
      request: {
        prompt: "normal visual prompt",
        apiKey: "[REDACTED_SECRET]",
      },
      error: {
        name: "Error",
        message: "[REDACTED_SECRET]",
        raw: { Authorization: "[REDACTED_SECRET]" },
      },
    });
  });
});
