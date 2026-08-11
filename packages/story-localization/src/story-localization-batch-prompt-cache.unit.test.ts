import { estimatePromptTokens } from "@mediaforge/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  applyStoryBatchPromptCachePlans,
  buildStoryBatchPromptCachePlans,
} from "./story-localization-batch-service.js";
import type { StoryBatchItem } from "./story-localization.types.js";
import { EnglishGeneratedStoryPackageSchema } from "./story-localization.schemas.js";
import {
  localizedAffectNarrationResponseSchema,
  narrationOnlyFullRewriteResponseSchema,
} from "./story-prompt-response-schemas.js";

function item(args: {
  readonly customId: string;
  readonly model: string;
  readonly stablePrefix: string;
  readonly dynamicSuffix: string;
  readonly operation?: StoryBatchItem["metadata"]["operation"];
  readonly language?: StoryBatchItem["metadata"]["language"];
  readonly format?: Readonly<Record<string, unknown>>;
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
      text: {
        format: args.format ?? {
          type: "json_schema",
          name: "story",
          schema: {},
          strict: true,
        },
      },
    },
    metadata: {
      episodeNumber: args.customId,
      sourceHash: args.customId.padEnd(64, "0").slice(0, 64),
      operation: args.operation ?? "localization",
      language: args.language ?? "de",
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

  it("accounts for real Story structured-output variants without counting dynamic narration", () => {
    const stablePrefix = "x".repeat(576);
    const variants = [
      {
        id: "full",
        operation: "canonical-english-full" as const,
        language: "en" as const,
        schema: narrationOnlyFullRewriteResponseSchema,
      },
      {
        id: "localized-affect",
        operation: "localization" as const,
        language: "de" as const,
        schema: localizedAffectNarrationResponseSchema,
      },
      {
        id: "short",
        operation: "english-short" as const,
        language: "en" as const,
        schema: EnglishGeneratedStoryPackageSchema,
      },
    ];

    for (const variant of variants) {
      const format = {
        type: "json_schema",
        name: variant.id,
        schema: z.toJSONSchema(variant.schema),
        strict: true,
      } as const;
      const items = ["a", "b"].map((suffix) =>
        item({
          customId: `${variant.id}-${suffix}`,
          model: "gpt-5.6-terra",
          stablePrefix,
          dynamicSuffix: `dynamic narration ${suffix} ${"dynamic ".repeat(2_000)}`,
          operation: variant.operation,
          language: variant.language,
          format,
        }),
      );
      const plans = buildStoryBatchPromptCachePlans(items, {
        promptCacheMode: "explicit",
        promptCacheShardCount: "auto",
      });
      const plan = plans.get(`${variant.id}-a`);
      const schemaTokens = estimatePromptTokens(JSON.stringify(format.schema));
      expect(plan?.estimatedExplicitContentPrefixTokens).toBe(144);
      expect(plan?.estimatedStructuredOutputPrefixTokens).toBe(schemaTokens);
      expect(plan?.estimatedEffectiveProviderCachePrefixTokens).toBe(
        144 + schemaTokens,
      );
      expect(plan?.mode).toBe(
        144 + schemaTokens >= 1_024 ? "explicit" : "disabled",
      );
    }
  });

  it("does not count dynamic payloads or mismatched schemas as one reusable prefix", () => {
    const stablePrefix = "short stable prefix";
    const largeDynamicPayload = "dynamic narration ".repeat(2_000);
    const first = item({
      customId: "schema-a",
      model: "gpt-5.6-terra",
      stablePrefix,
      dynamicSuffix: largeDynamicPayload,
      format: {
        type: "json_schema",
        name: "story_a",
        schema: { type: "object", properties: { a: { type: "string" } } },
      },
    });
    const second = item({
      customId: "schema-b",
      model: "gpt-5.6-terra",
      stablePrefix,
      dynamicSuffix: `${largeDynamicPayload} changed`,
      format: {
        type: "json_schema",
        name: "story_b",
        schema: { type: "object", properties: { b: { type: "string" } } },
      },
    });
    const plans = buildStoryBatchPromptCachePlans([first, second], {
      promptCacheMode: "explicit",
      promptCacheShardCount: "auto",
    });

    expect(plans.get("schema-a")?.expectedReuseCount).toBe(1);
    expect(plans.get("schema-b")?.expectedReuseCount).toBe(1);
    expect(plans.get("schema-a")?.promptPrefixFingerprint).not.toBe(
      plans.get("schema-b")?.promptPrefixFingerprint,
    );
    expect(plans.get("schema-a")?.downgradeReason).toBe("PREFIX_TOO_SHORT");
  });
});
