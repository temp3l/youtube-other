import { describe, expect, it } from "vitest";
import {
  applyStoryBatchPromptCachePlans,
  buildStoryBatchPromptCachePlans,
} from "./story-localization-batch-service.js";
import type { StoryBatchItem } from "./story-localization.types.js";

function item(args: {
  readonly customId: string;
  readonly model: string;
  readonly stablePrefix: string;
  readonly dynamicSuffix: string;
}): StoryBatchItem {
  return {
    customId: args.customId,
    method: "POST",
    url: "/v1/responses",
    body: {
      model: args.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: args.stablePrefix }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: args.dynamicSuffix }],
        },
      ],
      text: { format: { type: "json_schema", name: "story", schema: {} } },
    },
    metadata: {
      episodeNumber: args.customId,
      sourceHash: args.customId.padEnd(64, "0").slice(0, 64),
      operation: "localization",
      language: "de",
      promptVersion: "story-prompt.v5",
      responseSchemaVersion: "story-output.v3",
      configurationHash: args.customId.padEnd(64, "1").slice(0, 64),
    },
  };
}

describe("Story Batch provider prompt-cache projection", () => {
  it("places an explicit GPT-5.6 breakpoint on a stable reused system prefix", () => {
    const stablePrefix = "stable story contract ".repeat(260);
    const items = [
      item({
        customId: "episode-a",
        model: "gpt-5.6-terra",
        stablePrefix,
        dynamicSuffix: "dynamic story A",
      }),
      item({
        customId: "episode-b",
        model: "gpt-5.6-terra",
        stablePrefix,
        dynamicSuffix: "dynamic story B",
      }),
    ];
    const plans = buildStoryBatchPromptCachePlans(items, {
      promptCacheMode: "explicit",
      promptCacheShardCount: "auto",
    });
    const projected = applyStoryBatchPromptCachePlans(items, plans);

    expect(plans.get("episode-a")?.promptPrefixFingerprint).toBe(
      plans.get("episode-b")?.promptPrefixFingerprint,
    );
    expect(plans.get("episode-a")?.promptCacheRoutingKey).toBe(
      plans.get("episode-b")?.promptCacheRoutingKey,
    );
    expect(projected[0]?.body["input"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          content: [
            expect.objectContaining({
              text: stablePrefix,
              prompt_cache_breakpoint: { mode: "explicit" },
            }),
          ],
        }),
      ]),
    );
    expect(projected[0]?.body).toMatchObject({
      prompt_cache_key: plans.get("episode-a")?.promptCacheRoutingKey,
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
    });
    expect(projected[0]?.body["input"]).not.toEqual(projected[1]?.body["input"]);
  });

  it("does not put GPT-5.6-only fields on a legacy model", () => {
    const stablePrefix = "stable story contract ".repeat(260);
    const items = [
      item({
        customId: "legacy-a",
        model: "gpt-5.4-mini",
        stablePrefix,
        dynamicSuffix: "story A",
      }),
      item({
        customId: "legacy-b",
        model: "gpt-5.4-mini",
        stablePrefix,
        dynamicSuffix: "story B",
      }),
    ];
    const projected = applyStoryBatchPromptCachePlans(items);
    expect(projected[0]?.body).toHaveProperty("prompt_cache_retention", "in_memory");
    expect(projected[0]?.body).not.toHaveProperty("prompt_cache_options");
    expect(JSON.stringify(projected[0]?.body)).not.toContain(
      "prompt_cache_breakpoint",
    );
  });
});
