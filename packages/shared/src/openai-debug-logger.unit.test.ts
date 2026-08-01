import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  redactOpenAIDebugValue,
  writeOpenAIDebugLog,
} from "./openai-debug-logger.js";

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

describe("OpenAI debug logger", () => {
  it("redacts credentials and content by default", () => {
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
      prompt: "[REDACTED_CONTENT]",
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
          revised_prompt: "[REDACTED_CONTENT]",
          b64_json: "[REDACTED_BASE64_IMAGE_RESPONSE]",
        },
      ],
      metadata: { size: "1536x1024", quality: "medium" },
    });
  });

  it("writes episode-local unique files with sanitized request and response", async () => {
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
        input: [{ role: "user", content: "[REDACTED_CONTENT]" }],
        authorization: "[REDACTED_SECRET]",
      },
      response: { id: "resp_1", output_text: "[REDACTED_CONTENT]" },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });

  it("allows explicit content debug only for non-protected sources", () => {
    expect(redactOpenAIDebugValue({ prompt: "permitted" }, undefined, true)).toEqual({ prompt: "permitted" });
  });

  it("redacts root strings and arrays nested under content keys", () => {
    expect(redactOpenAIDebugValue("source phrase")).toBe("[REDACTED_CONTENT]");
    expect(redactOpenAIDebugValue({ content: ["first phrase", "second phrase"] })).toEqual({ content: ["[REDACTED_CONTENT]", "[REDACTED_CONTENT]"] });
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
        prompt: "[REDACTED_CONTENT]",
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
