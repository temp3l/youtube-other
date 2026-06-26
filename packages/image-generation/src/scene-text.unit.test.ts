import { describe, expect, it } from "vitest";
import {
  buildSceneNegativePrompt,
  buildSceneTextPromptSection,
} from "./scene-text.js";

describe("scene text prompt helpers", () => {
  it("keeps ordinary scenes text-free by default", () => {
    const section = buildSceneTextPromptSection({ required: false });
    const negative = buildSceneNegativePrompt({ required: false }, [
      "no photorealism",
      "no watermark",
    ]);

    expect(section).toContain(
      "Do not include captions, subtitles, labels, logos, watermarks, or readable text."
    );
    expect(negative).toContain("no readable text");
    expect(negative).toContain("no captions");
  });

  it("renders required text exactly and omits blanket no-text bans", () => {
    const section = buildSceneTextPromptSection({
      required: true,
      text: 'ROOM "237"',
      placement: "on the worn brass plaque",
      reason: "The room number is essential to the narrated reveal.",
    });
    const negative = buildSceneNegativePrompt(
      {
        required: true,
        text: 'ROOM "237"',
        placement: "on the worn brass plaque",
        reason: "The room number is essential to the narrated reveal.",
      },
      ["no photorealism", "no watermark"]
    );

    expect(section).toContain('Render exactly: "ROOM \\"237\\"".');
    expect(section).toContain("Placement: on the worn brass plaque.");
    expect(section).toContain(
      "Do not add any other words, captions, subtitles, labels, logos, watermarks, or unrelated background text."
    );
    expect(negative).not.toContain("no readable text");
  });
});
