import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanedTranscriptSchema } from "@mediaforge/domain";
import { ConservativeScriptRewriter, OpenAiCompatibleScriptRewriter } from "./index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeCleanedTranscript() {
  return cleanedTranscriptSchema.parse({
    sourceId: "episode-001",
    language: "en",
    originalText: "The source text explains how the machine works, and it is important.",
    cleanedText: "The source text explains how the machine works, and it is important.",
    segments: [
      {
        id: "segment-001",
        startSeconds: 0,
        endSeconds: 4,
        text: "The source text explains how the machine works, and it is important.",
        words: [],
        boundaryReason: "end-of-transcript"
      }
    ],
    corrections: [],
    uncertainTerms: []
  });
}

describe("ConservativeScriptRewriter", () => {
  it("rewrites source wording into a simpler, distinct script", () => {
    const rewritten = new ConservativeScriptRewriter().rewrite(makeCleanedTranscript());
    expect(rewritten.text).not.toBe(makeCleanedTranscript().cleanedText);
    expect(rewritten.text.toLowerCase()).toContain("in simple terms");
    expect(rewritten.text.toLowerCase()).toContain("makes clear how the machine works");
  });

  it("normalizes punctuation and sentence endings in the rewritten script", () => {
    const transcript = cleanedTranscriptSchema.parse({
      sourceId: "episode-001",
      language: "en",
      originalText: "hello there , world",
      cleanedText: "hello there , world",
      segments: [
        {
          id: "segment-001",
          startSeconds: 0,
          endSeconds: 2,
          text: "hello there , world",
          words: [],
          boundaryReason: "end-of-transcript"
        }
      ],
      corrections: [],
      uncertainTerms: []
    });
    const rewritten = new ConservativeScriptRewriter().rewrite(transcript);
    expect(rewritten.text).toMatch(/[.!?…]["'»”)]*$/u);
    expect(rewritten.text).not.toMatch(/\s+[,.!?;:]/u);
  });

  it("collapses repeated source runs before rewriting narration", () => {
    const transcript = cleanedTranscriptSchema.parse({
      sourceId: "episode-001",
      language: "en",
      originalText: "Open your fridge right now. Open your fridge right now. A can of soda, some yogurt.",
      cleanedText: "Open your fridge right now. Open your fridge right now. A can of soda, some yogurt.",
      segments: [
        {
          id: "segment-001",
          startSeconds: 0,
          endSeconds: 3,
          text: "Open your fridge right now. Open your fridge right now. A can of soda, some yogurt.",
          words: [],
          boundaryReason: "end-of-transcript"
        }
      ],
      corrections: [],
      uncertainTerms: []
    });
    const rewritten = new ConservativeScriptRewriter().rewrite(transcript);
    expect(rewritten.text).not.toContain("Open your fridge right now. Open your fridge right now.");
  });
});

describe("OpenAiCompatibleScriptRewriter", () => {
  it("asks for easy language and still normalizes source-like output", async () => {
    const transport = {
      async complete(request: { readonly messages: ReadonlyArray<{ readonly role: "system" | "user"; readonly content: string }> }) {
        expect(request.messages[0]?.content).toContain("easy, natural language");
        expect(request.messages[1]?.content).toContain("useSimpleLanguage");
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sourceId: "episode-001",
                  audience: "broad audience",
                  text: "The source text explains how the machine works, and it is important.",
                  sections: [
                    {
                      sectionId: "section-001",
                      transcriptSegmentIds: ["segment-001"],
                      text: "The source text explains how the machine works, and it is important.",
                      claims: ["The source text explains how the machine works, and it is important."]
                    }
                  ],
                  claims: [{ text: "The source text explains how the machine works, and it is important.", reviewRequired: false }]
                })
              }
            }
          ]
        };
      }
    };
    const rewritten = await new OpenAiCompatibleScriptRewriter({
      baseUrl: "https://example.com",
      apiKey: "test-key",
      model: "gpt-test",
      transport
    }).rewrite(makeCleanedTranscript());
    expect(rewritten.text).not.toBe("The source text explains how the machine works, and it is important.");
    expect(rewritten.text.toLowerCase()).toContain("in simple terms");
  });

  it("repairs punctuation-less model output before returning the rewritten script", async () => {
    const transport = {
      async complete(request: { readonly messages: ReadonlyArray<{ readonly role: "system" | "user"; readonly content: string }> }) {
        expect(request.messages[0]?.content).toContain("easy, natural language");
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sourceId: "episode-001",
                  audience: "broad audience",
                  text: "the machine works and it is important",
                  sections: [
                    {
                      sectionId: "section-001",
                      transcriptSegmentIds: ["segment-001"],
                      text: "the machine works and it is important",
                      claims: ["the machine works and it is important"]
                    }
                  ],
                  claims: [{ text: "the machine works and it is important", reviewRequired: false }]
                })
              }
            }
          ]
        };
      }
    };
    const rewritten = await new OpenAiCompatibleScriptRewriter({
      baseUrl: "https://example.com",
      apiKey: "test-key",
      model: "gpt-test",
      transport
    }).rewrite(makeCleanedTranscript());
    expect(rewritten.text).toMatch(/[.!?…]["'»”)]*$/u);
    expect(rewritten.text).not.toMatch(/\s+[,.!?;:]/u);
    expect(rewritten.sections[0]?.text).toMatch(/[.!?…]["'»”)]*$/u);
  });
});
