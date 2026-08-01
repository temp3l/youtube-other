import { describe, expect, it } from "vitest";

import {
  speechEstimateInputSchema,
  speechGenerationResponseSchema,
} from "./speech-contract.js";

describe("speech API contract", () => {
  it("accepts video-backed requests without exposing narration, while requiring language for direct text", () => {
    expect(speechEstimateInputSchema.parse({ videoId: "video-1" })).toEqual({
      videoId: "video-1",
    });
    expect(() =>
      speechEstimateInputSchema.parse({ videoId: "video-1", text: "Narration" })
    ).toThrow(/language/u);
  });

  it("only permits safe generation response fields", () => {
    expect(
      speechGenerationResponseSchema.parse({
        generationId: "spg-1",
        revision: 1,
        state: "SUCCEEDED",
        profileVersionId: "vpv-1",
        provider: "elevenlabs",
        cacheHit: false,
      })
    ).toMatchObject({ generationId: "spg-1", provider: "elevenlabs" });
    expect(() =>
      speechGenerationResponseSchema.parse({
        generationId: "spg-1",
        revision: 1,
        state: "SUCCEEDED",
        profileVersionId: "vpv-1",
        provider: "elevenlabs",
        cacheHit: false,
        apiKey: "secret",
      })
    ).toThrow();
  });
});
