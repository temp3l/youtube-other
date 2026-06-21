import fs from "node:fs/promises";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import { hashText } from "@mediaforge/shared";
import { generateYoutubeMetadataForTarget, type OpenAiMetadataClient } from "./youtube-metadata.js";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "mediaforge-metadata-integration-"));
}

function makeScenePlan() {
  return scenePlanSchema.parse({
    sourceId: "episode-fixture",
    scenes: [
      {
        id: "scene-001",
        sequenceNumber: 1,
        canonicalNarration: "The problem was simple.",
        sourceSegmentIds: ["segment-001"],
        estimatedDurationSeconds: 4,
        timing: { startSeconds: 0, endSeconds: 4 },
        visualPurpose: "introduce the idea",
        subject: "idea",
        action: "explained",
        setting: "plain background",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "calm",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "plain idea",
        expectedImageFilenames: ["scene-001__000000-000004__16x9.png"],
        qualityStatus: "draft"
      },
      {
        id: "scene-002",
        sequenceNumber: 2,
        canonicalNarration: "Then the situation changed.",
        sourceSegmentIds: ["segment-002"],
        estimatedDurationSeconds: 5,
        timing: { startSeconds: 4, endSeconds: 9 },
        visualPurpose: "show change",
        subject: "situation",
        action: "changing",
        setting: "plain background",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "calm",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "plain change",
        expectedImageFilenames: ["scene-002__000004-000009__16x9.png"],
        qualityStatus: "draft"
      },
      {
        id: "scene-003",
        sequenceNumber: 3,
        canonicalNarration: "It ended with a clear result.",
        sourceSegmentIds: ["segment-003"],
        estimatedDurationSeconds: 6,
        timing: { startSeconds: 9, endSeconds: 15 },
        visualPurpose: "close the point",
        subject: "result",
        action: "shown",
        setting: "plain background",
        composition: "centered",
        cameraFraming: "medium shot",
        mood: "calm",
        continuityReferences: [],
        onScreenText: "",
        negativeConstraints: [],
        aspectRatios: ["16:9"],
        imagePrompt: "plain result",
        expectedImageFilenames: ["scene-003__000009-000015__16x9.png"],
        qualityStatus: "draft"
      }
    ]
  });
}

function makeMetadataJson() {
  const chapterText = "00:00 Start\n00:04 Middle\n00:09 Result";
  return {
    schemaVersion: "1.0",
    source: { sourceId: "episode-fixture", sceneCount: 3, durationSeconds: 15, language: "en" },
    seo: { primaryKeyword: "problem", secondaryKeywords: ["problem"], viewerSearchIntent: "learn" },
    title: {
      recommended: "The Simple Problem and What Changed",
      alternatives: [
        "A Simple Problem and Its Result",
        "How the Situation Changed",
        "The Problem, the Change, and the Result",
        "What Happened Next in Plain Terms",
        "A Clear Look at the Result"
      ]
    },
    description: `Intro text.\n\n${chapterText}\n\nShort summary.\n\nSubscribe for more.\n\n#topic`,
    chapters: {
      text: chapterText,
      characterCount: [...chapterText].length,
      items: [
        { timestamp: "00:00", startSeconds: 0, title: "Start" },
        { timestamp: "00:04", startSeconds: 4, title: "Middle" },
        { timestamp: "00:09", startSeconds: 9, title: "Result" }
      ]
    },
    tags: {
      text: "problem, situation, result",
      characterCount: [..."problem, situation, result"].length,
      items: ["problem", "situation", "result"]
    },
    hashtags: ["#topic"],
    thumbnail: {
      recommendedText: "Simple Problem",
      alternativeTexts: ["Clear Result", "What Changed", "Plain Terms", "Big Shift"],
      imagePrompt: "16:9 composition, main subject, focal point, emotional contrast, background, safe space for text, strong small-size readability, no logos, no watermark, no generated text inside the image"
    },
    uploadSettings: {
      filename: "episode-001.mp4",
      category: "22",
      videoLanguage: "en",
      captionLanguage: "en",
      madeForKids: false,
      licence: "standard YouTube licence",
      playlists: ["Episode 001"],
      comments: "allow",
      automaticChapters: true
    },
    pinnedComment: "Pinned comment",
    socialTeaser: "A short teaser.",
    contentSummary: "A clear summary.",
    corrections: [],
    verificationWarnings: []
  };
}

describe("youtube metadata integration", () => {
  it("writes episode output files and reuses the cache on a second run", async () => {
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(path.join(episodeDir, "scenes.json"), JSON.stringify(makeScenePlan(), null, 2), "utf8");

    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => ({ id: "file_123" })),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async () => ({
          id: "resp_123",
          output_text: JSON.stringify(makeMetadataJson()),
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(makeMetadataJson()) }] }]
        }))
      }
    };

    const target = {
      sourceFilePath: path.join(episodeDir, "scenes.json"),
      episodeDir,
      outputDir: path.join(episodeDir, "output"),
      episodeSlug: "episode-001",
      sourceId: "episode-fixture",
      language: "en",
      scenePlan: makeScenePlan(),
      sourceSha256: hashText(JSON.stringify(makeScenePlan(), null, 2)),
      durationSeconds: 15
    };

    const first = await generateYoutubeMetadataForTarget(target, {
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      language: "en",
      promptText: "Prompt",
      maxRetries: 1,
      timeoutMs: 10_000,
      keepFile: false,
      client
    });

    expect(first.cacheHit).toBe(false);
    expect(await fs.readFile(first.outputs.jsonPath, "utf8")).toContain("The Simple Problem");
    expect(await fs.readFile(first.outputs.markdownPath, "utf8")).toContain("# YouTube Metadata");

    const cachedClient: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => {
          throw new Error("unexpected upload");
        }),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async () => {
          throw new Error("unexpected generation");
        })
      }
    };

    const cached = await generateYoutubeMetadataForTarget(target, {
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      language: "en",
      promptText: "Prompt",
      maxRetries: 1,
      timeoutMs: 10_000,
      keepFile: false,
      client: cachedClient
    });

    expect(cached.cacheHit).toBe(true);
    expect(cachedClient.responses.create).not.toHaveBeenCalled();
  });
});
