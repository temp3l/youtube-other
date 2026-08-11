import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
  SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTIONS,
  sourceGroundedPassJudgement,
  sourceGroundedQaExecutionPolicy,
  sourceGroundedSceneJudgementJsonSchema,
  type SourceGroundedSceneJudgementInput,
} from "@mediaforge/strategic-reinvention";
import {
  createVeronicaSourceGroundedVisualQaComposition,
  OpenAiSourceGroundedVisualQaAdapter,
} from "./veronica-source-grounded-visual-qa-composition.js";

const createClientMock = vi.hoisted(() =>
  vi.fn(() => ({ responses: { create: vi.fn() } }))
);

vi.mock("@mediaforge/config", () => ({
  loadRuntimeConfig: vi.fn(async () => ({
    openAiValidatorModel: "gpt-5.4-mini",
    openAiValidatorReasoningEffort: "low",
    openAiValidatorMaxOutputTokens: 800,
    openAiStoryMaxOutputTokens: 1_800,
    openAiPromptCacheMode: "enabled",
  })),
}));

vi.mock("@mediaforge/story-localization", () => ({
  createOpenAiStoryClientWithOptions: createClientMock,
}));

const payload: SourceGroundedSceneJudgementInput = {
  sceneId: "semantic-001",
  episodeId: "episode-private-operational-id",
  format: "LONG_FORM",
  narrationBeat:
    "The buyer identifies the problem before evaluating the offer.",
  semantic: {
    actorRole: "buyer",
    actionOwner: "buyer",
    action: "identifies the problem",
    consequence: "evaluates a relevant offer",
    polarity: "POSITIVE_STATE",
    visualMechanism: "problem-first-sequence",
  },
  structuredState: {
    relation: "CAUSAL_BEFORE_AFTER",
    initialState: "problem recognized",
    outcomeState: "offer evaluated",
  },
  treatment: {
    environment: "service consultation",
    actor: "buyer",
    action: "reviews evidence",
    props: ["service sample"],
    composition: "documentary medium shot",
  },
  providerPrompt:
    "A buyer first recognizes a concrete problem, then examines a matching service sample. No readable text.",
  constraints: { readableTextAllowed: false, aspectRatio: "16:9" },
};

function requestInput(profile: "INTERACTIVE" | "COST_OPTIMIZED" | "BULK") {
  return {
    payload,
    model: { model: "gpt-5.4-mini", reasoningEffort: "low" as const },
    instructions: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTIONS,
    instructionVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
    jsonSchema: sourceGroundedSceneJudgementJsonSchema,
    cachePolicy: {
      enabled: true,
      key: "veronica-scene-judge:test-prefix",
      stablePrefixVersion: SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTION_VERSION,
    },
    execution: sourceGroundedQaExecutionPolicy(profile),
  };
}

describe("OpenAI source-grounded QA adapter", () => {
  it("defaults to cache-only, one remediation round, and zero SDK retries", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-qa-policy-"));
    const episodeDir = path.join(workspaceRoot, "episode");
    const routine = await createVeronicaSourceGroundedVisualQaComposition({
      workspaceRoot,
      episodeDir,
    });
    expect(routine.policy.execution).toMatchObject({
      providerMode: "CACHE_ONLY",
    });
    expect(routine.policy.sceneJudge).toMatchObject({
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
    });
    expect(routine.policy.sequenceJudge).toMatchObject({
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
    });
    expect(routine.policy.escalation).toMatchObject({
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
    });
    expect(routine.policy.remediationAdvisor).toMatchObject({
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
    });
    expect(routine.policy.maxRemediationRounds).toBe(1);
    expect(createClientMock).toHaveBeenLastCalledWith({
      apiKey: undefined,
      baseUrl: undefined,
      maxRetries: 0,
    });

    const paid = await createVeronicaSourceGroundedVisualQaComposition({
      workspaceRoot,
      episodeDir,
      paidOpenAiQa: {
        maxProviderCalls: 3,
        maxEstimatedCostUsd: 0.1,
        maxFlagshipCallsPerPack: 1,
      },
    });
    expect(paid.policy.execution).toMatchObject({
      providerMode: "LIVE_AUTHORIZED",
      budget: {
        maxProviderCalls: 3,
        maxEstimatedCostUsd: 0.1,
        maxFlagshipCallsPerPack: 1,
      },
    });
  });

  it("places stable instructions before compact dynamic data and scopes prompt caching to the adapter", async () => {
    const create = vi.fn(async () => ({
      id: "response-1",
      output_text: JSON.stringify(sourceGroundedPassJudgement()),
      usage: {
        input_tokens: 120,
        output_tokens: 60,
        input_tokens_details: { cached_tokens: 80 },
      },
    }));
    const adapter = new OpenAiSourceGroundedVisualQaAdapter({
      responses: { create },
    });
    const result = await adapter.judge(requestInput("INTERACTIVE"));
    const request = create.mock.calls[0]![0] as Record<string, unknown>;
    const messages = request["input"] as Array<{
      role: string;
      content: Array<{ text: string }>;
    }>;
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0]!.content[0]!.text).toBe(
      SOURCE_GROUNDED_SCENE_JUDGE_INSTRUCTIONS
    );
    expect(messages[1]).toMatchObject({ role: "user" });
    expect(messages[1]!.content[0]!.text).toContain(payload.narrationBeat);
    expect(messages[1]!.content[0]!.text).not.toContain(payload.episodeId);
    expect(messages[1]!.content[0]!.text).not.toContain(payload.sceneId);
    expect(request["prompt_cache_key"]).toBe(
      "veronica-scene-judge:test-prefix"
    );
    expect(request["max_output_tokens"]).toBe(800);
    expect(result.usage).toEqual({
      inputTokens: 120,
      outputTokens: 60,
      cachedInputTokens: 80,
    });
  });

  it("writes QA calls and aggregate cost into the episode folder", async () => {
    const episodeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-qa-cost-"));
    const create = vi.fn(async () => ({
      id: "response-cost-1",
      output_text: JSON.stringify(sourceGroundedPassJudgement()),
      usage: {
        input_tokens: 1_000,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 200 },
      },
    }));
    const adapter = new OpenAiSourceGroundedVisualQaAdapter(
      { responses: { create } },
      120_000,
      episodeRoot
    );

    await adapter.judge(requestInput("INTERACTIVE"));

    const callFiles = await fs.readdir(
      path.join(episodeRoot, "debug", "openai-calls")
    );
    expect(callFiles).toHaveLength(2);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(episodeRoot, "openai-cost-summary.json"),
          "utf8"
        )
      )
    ).toMatchObject({
      calls: {
        loggedRecords: 2,
        paidProviderCalls: 1,
        unpricedProviderCalls: 0,
      },
      knownEstimatedCostUsd: 0.001065,
      totalEstimatedCostUsd: 0.001065,
      byOperation: {
        "source-grounded-scene-judge": { providerCalls: 1 },
      },
    });
  });

  it("uses Flex only when explicitly selected and fails explicitly for unsupported Batch", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify(sourceGroundedPassJudgement()),
    }));
    const adapter = new OpenAiSourceGroundedVisualQaAdapter({
      responses: { create },
    });
    await adapter.judge(requestInput("COST_OPTIMIZED"));
    expect(create.mock.calls[0]![0]).toMatchObject({ service_tier: "flex" });
    await expect(adapter.judge(requestInput("BULK"))).rejects.toThrow(
      /does not submit interactive remediation loops through Batch/u
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
