import { describe, expect, it } from "vitest";
import {
  buildDeterministicVisualDirectionFallbackV1,
  buildVisualDirectionResolverInputV1,
  renderPersistedVisualDirectionPromptSectionsV1,
} from "./history-visual-direction-v1.js";
import { finalizeHistoricalVisualDirectionProfileV1 } from "./history-visual-direction-v1.js";

describe("history visual direction prompt rendering", () => {
  it("does not inject generic 35mm cinematic defaults when persisted direction is used", () => {
    const input = buildVisualDirectionResolverInputV1({
      plan: {
        episodeId: "history-youtube-history-test",
        title: "Test",
        trustSnapshotHash: "a".repeat(64),
        beats: [],
        shots: [
          {
            id: "shot-0001-01",
            beatId: "beat-0001",
            startMs: 0,
            endMs: 1000,
            subject: "Napoleon",
            background: "Russia",
            action: "reviews troops",
          },
        ],
        visualConcepts: [],
        places: [],
        historicalPersonReferences: {
          usages: [],
          resolvedPersonCount: 0,
          attachedReferenceCount: 0,
        },
        narration: {
          normalizedText: "Napoleon reviewed the army.",
          units: [],
        },
      } as never,
    });
    const body = buildDeterministicVisualDirectionFallbackV1(input);
    const profile = finalizeHistoricalVisualDirectionProfileV1({
      body,
      resolverInput: input,
      provider: "deterministic-fallback",
      model: "deterministic-fallback",
      providerStatus: "fallback",
    });
    const sections = renderPersistedVisualDirectionPromptSectionsV1({
      profile,
      sceneId: "scene-001",
    });
    expect(sections.cameraDirection).not.toMatch(/\b35mm cinematic\b/iu);
    expect(sections.aestheticDirection).toContain("documentary-reconstruction");
  });
});
