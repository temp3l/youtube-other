import { describe, expect, it } from "vitest";
import { resolveMediaDependencies } from "./story-workflow-media.js";

describe("story workflow media adapters", () => {
  it("blocks render when audio is missing", () => {
    const result = resolveMediaDependencies({
      locale: "es",
      format: "full",
      storyAccepted: true,
      audioReady: false,
      metadataReady: true,
      thumbnailReady: true,
    });
    expect(result.render).toBe("blocked");
    expect(result.publish).toBe("planned");
  });

  it("blocks publish when metadata or thumbnail is missing", () => {
    const result = resolveMediaDependencies({
      locale: "es",
      format: "short",
      storyAccepted: true,
      audioReady: true,
      metadataReady: false,
      thumbnailReady: true,
      renderReady: true,
    });
    expect(result.publish).toBe("blocked");
  });
});
