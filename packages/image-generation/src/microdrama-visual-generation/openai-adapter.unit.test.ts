import { describe, expect, it } from "vitest";

import { createOpenAiMicrodramaImageProvider } from "./openai-adapter.js";
import type { MicrodramaVisualGenerationRequest } from "./contracts.js";

const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const request: MicrodramaVisualGenerationRequest = {
  schemaVersion: "mediaforge.microdrama.visual-generation.v1",
  requestId: "req.visual.plate.sem.e002.010",
  seriesId: "series.seven-minutes-ahead",
  episodeId: "E002",
  sceneShotPlanRevisionId: "rev.scene-shot.e002.v1",
  assetKind: "source_plate",
  shotSemanticId: "shot.sem.e002.006.001",
  sourcePlateSemanticId: "plate.sem.e002.010",
  sceneSemanticId: "scene.sem.e002.006",
  blockingKind: "reaction",
  registryReferences: [],
  promptText:
    "Photoreal cinematic still. PRIMARY ACTION TO DEPICT: A woman slips down the concrete ramp. This still must match the spoken narration window below, not a generic episode mood.",
  forceRegeneration: false,
};

describe("openai microdrama image provider violence retry", () => {
  it("retries once with a rewritten brief after a violence safety refusal", async () => {
    const prompts: string[] = [];
    const provider = createOpenAiMicrodramaImageProvider({
      apiKey: "test-key",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { prompt: string };
        prompts.push(body.prompt);
        if (prompts.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                message:
                  "Your request was rejected by the safety system. safety_violations=[violence].",
              },
            }),
            { status: 400 }
          );
        }
        return new Response(
          JSON.stringify({
            id: "img-retry-1",
            data: [{ b64_json: PNG_1X1_B64 }],
          }),
          { status: 200 }
        );
      },
    });

    const result = await provider.generate({
      request,
      cacheKey: "cache.e002.010",
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("slips down");
    expect(prompts[1]).toContain("No accident, no injury");
    expect(prompts[1]).not.toContain("slips down");
    expect(result.providerRequestId).toBe("img-retry-1");
  });
});
