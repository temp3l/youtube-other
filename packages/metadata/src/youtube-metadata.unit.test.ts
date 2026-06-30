import fs from "node:fs/promises";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { scenePlanSchema } from "@mediaforge/domain";
import { hashText } from "@mediaforge/shared";
import {
  ConfigurationError,
  MetadataValidationError,
  OpenAIResponseError,
  OpenAIUploadError,
  OutputWriteError,
  SourceFileError,
  SourceValidationError,
  YOUTUBE_METADATA_OWNER,
  YOUTUBE_METADATA_OWNER_VERSION,
  YOUTUBE_METADATA_PROMPT_VERSION,
  YOUTUBE_METADATA_SCHEMA_VERSION,
  computeYoutubeMetadataCacheKey,
  computeYoutubeMetadataModelConfigFingerprint,
  computeYoutubeMetadataPromptSchemaFingerprint,
  extractResponseText,
  generateYoutubeMetadataForTarget,
  findEpisodeScenesFile,
  listEpisodeSceneFiles,
  readAndValidateScenesFile,
  parseScenesFile,
  youtubeMetadataSchema,
  type OpenAiMetadataClient,
  type YoutubeMetadataTarget
} from "./youtube-metadata.js";

function createWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "mediaforge-metadata-"));
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

function makeScenariosJson(scenePlan = makeScenePlan()): string {
  return JSON.stringify(scenePlan, null, 2);
}

function makeTarget(workspaceDir: string): YoutubeMetadataTarget {
  const sourceFilePath = path.join(workspaceDir, "episode-001", "scenes.json");
  const scenePlan = makeScenePlan();
  const narrationText = scenePlan.scenes
    .map((scene) => scene.canonicalNarration)
    .join("\n\n");
  return {
    sourceFilePath,
    episodeDir: path.dirname(sourceFilePath),
    outputDir: path.join(path.dirname(sourceFilePath), "output"),
    episodeSlug: "episode-001",
    sourceId: "episode-fixture",
    language: "en",
    locale: "en-US",
    variant: "full",
    scenePlan,
    sourceSha256: hashText(makeScenariosJson(scenePlan)),
    durationSeconds: 15,
    narration: {
      episodeNumber: "001",
      episodeSlug: "episode-001",
      language: "en",
      locale: "en-US",
      variant: "full",
      narrationText,
      narrationFingerprint: hashText(narrationText),
    }
  };
}

function makeValidMetadata(chapterText: string, tagText: string) {
  const chapters = chapterText
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, index) => ({
      timestamp: line.split(" ")[0] ?? "00:00",
      startSeconds: [0, 4, 9][index] ?? 0,
      title: line.slice(6)
    }));
  const tags = tagText.split(",").map((tag) => tag.trim()).filter(Boolean);
  return {
    schemaVersion: "1.0",
    source: {
      sourceId: "episode-fixture",
      sceneCount: 3,
      durationSeconds: 15,
      language: "en"
    },
    seo: {
      primaryKeyword: "problem",
      secondaryKeywords: ["problem", "situation", "result"],
      viewerSearchIntent: "learn how the situation develops"
    },
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
      items: chapters
    },
    tags: {
      text: tagText,
      characterCount: [...tagText].length,
      items: tags
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

function makeChapterText(totalCharacters: number): string {
  const base = "00:00 Start\n00:04 Middle\n00:09 End";
  if (totalCharacters < base.length) {
    throw new Error("Total characters too small for chapter text fixture.");
  }
  if (totalCharacters === base.length) {
    return base;
  }
  const pad = "x".repeat(totalCharacters - base.length);
  return `${base.slice(0, -3)}${pad}End`;
}

function makeTagText(totalCharacters: number): string {
  const base = "problem, situation, result";
  if (totalCharacters < base.length) {
    throw new Error("Total characters too small for tag text fixture.");
  }
  return `${base}${"x".repeat(totalCharacters - base.length)}`;
}

function runWithMetadata(metadata: ReturnType<typeof makeValidMetadata>, overrides: Partial<Parameters<typeof generateYoutubeMetadataForTarget>[1]> = {}) {
  const workspaceDir = createWorkspace();
  const episodeDir = path.join(workspaceDir, "episode-001");
  return fs.mkdir(episodeDir, { recursive: true }).then(async () => {
    const sourceFilePath = path.join(episodeDir, "scenes.json");
    await fs.writeFile(sourceFilePath, makeScenariosJson(), "utf8");
    const target = makeTarget(workspaceDir);
    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => ({ id: "file_123" })),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async () => ({
          id: "resp_123",
          output_text: JSON.stringify(metadata),
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(metadata) }] }]
        }))
      }
    };
    return generateYoutubeMetadataForTarget(target, {
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      language: "en",
      promptText: "Prompt",
      maxRetries: 1,
      timeoutMs: 10_000,
      keepFile: false,
      client,
      ...overrides
    }).then((result) => ({ result, client, sourceFilePath, target }));
  });
}

describe("youtube metadata helpers", () => {
  it("finds shared scenes files and lists them for episode discovery", async () => {
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(path.join(episodeDir, "shared"), { recursive: true });
    const scenesPath = path.join(episodeDir, "shared", "scenes.json");
    await fs.writeFile(scenesPath, makeScenariosJson(), "utf8");

    await expect(findEpisodeScenesFile(workspaceDir, "episode-001")).resolves.toBe(scenesPath);
    await expect(listEpisodeSceneFiles(workspaceDir)).resolves.toEqual([
      { episodeSlug: "episode-001", sourceFilePath: scenesPath }
    ]);
    await expect(readAndValidateScenesFile(scenesPath, "en")).resolves.toMatchObject({
      episodeDir,
      outputDir: path.join(episodeDir, "locales", "en", "full", "metadata")
    });
  });

  it("parses a valid scenes file and calculates duration from the last scene end", () => {
    const target = parseScenesFile(makeScenariosJson(), "/workspace/episodes/episode-001/scenes.json");
    expect(target.durationSeconds).toBe(15);
    expect(target.scenePlan.scenes).toHaveLength(3);
    expect(target.narration.narrationText).toContain("The problem was simple.");
  });

  it.each([
    { name: "missing scenes", raw: JSON.stringify({}) },
    { name: "empty scenes", raw: JSON.stringify({ scenes: [] }) },
    { name: "malformed timing", raw: JSON.stringify({ scenes: [{ id: "scene-001", sequenceNumber: 1, canonicalNarration: "x", timing: { startSeconds: 1, endSeconds: 1 } }] }) },
    { name: "overlapping scenes", raw: JSON.stringify({ scenes: [
      { id: "scene-001", sequenceNumber: 1, canonicalNarration: "x", timing: { startSeconds: 0, endSeconds: 4 } },
      { id: "scene-002", sequenceNumber: 2, canonicalNarration: "x", timing: { startSeconds: 3.5, endSeconds: 5 } }
    ] }) },
    { name: "unsorted scenes", raw: JSON.stringify({ scenes: [
      { id: "scene-001", sequenceNumber: 1, canonicalNarration: "x", timing: { startSeconds: 5, endSeconds: 6 } },
      { id: "scene-002", sequenceNumber: 2, canonicalNarration: "x", timing: { startSeconds: 0, endSeconds: 1 } }
    ] }) }
  ])("rejects invalid scenes data: $name", ({ raw }) => {
    expect(() => parseScenesFile(raw, "/workspace/episodes/episode-001/scenes.json")).toThrow();
  });

  it("keeps cache keys stable for identical inputs", () => {
    const input = {
      sourceSha256: "a".repeat(64),
      parentNarrationFingerprint: "b".repeat(64),
      promptText: "prompt",
      promptVersion: YOUTUBE_METADATA_PROMPT_VERSION,
      model: "gpt-4o-mini",
      schemaVersion: YOUTUBE_METADATA_SCHEMA_VERSION,
      language: "en",
      modelConfigFingerprint: "c".repeat(64),
      promptSchemaFingerprint: "d".repeat(64),
    };
    expect(computeYoutubeMetadataCacheKey(input)).toBe(computeYoutubeMetadataCacheKey(input));
  });

  it("invalidates cache keys when the validated narration changes", () => {
    const modelConfigFingerprint = computeYoutubeMetadataModelConfigFingerprint({
      model: "gpt-4o-mini",
      reasoningEffort: "low",
      maxOutputTokens: 3000,
    });
    const promptSchemaFingerprint = computeYoutubeMetadataPromptSchemaFingerprint({
      promptText: "prompt",
      promptVersion: YOUTUBE_METADATA_PROMPT_VERSION,
      schemaVersion: YOUTUBE_METADATA_SCHEMA_VERSION,
    });
    const first = computeYoutubeMetadataCacheKey({
      sourceSha256: "a".repeat(64),
      parentNarrationFingerprint: "b".repeat(64),
      promptText: "prompt",
      promptVersion: YOUTUBE_METADATA_PROMPT_VERSION,
      model: "gpt-4o-mini",
      schemaVersion: YOUTUBE_METADATA_SCHEMA_VERSION,
      language: "en",
      modelConfigFingerprint,
      promptSchemaFingerprint,
    });
    const second = computeYoutubeMetadataCacheKey({
      sourceSha256: "a".repeat(64),
      parentNarrationFingerprint: "c".repeat(64),
      promptText: "prompt",
      promptVersion: YOUTUBE_METADATA_PROMPT_VERSION,
      model: "gpt-4o-mini",
      schemaVersion: YOUTUBE_METADATA_SCHEMA_VERSION,
      language: "en",
      modelConfigFingerprint,
      promptSchemaFingerprint,
    });
    expect(first).not.toBe(second);
  });

  it("extracts response text from the structured output", () => {
    expect(
      extractResponseText({
        output_text: "hello",
        output: []
      })
    ).toBe("hello");

    expect(
      extractResponseText({
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: "hello" },
              { type: "output_text", text: " world" }
            ]
          }
        ]
      })
    ).toBe("hello world");

    expect(
      extractResponseText({
        output: [
          {
            type: "message",
            content: [
              { type: "text", text: "hello" },
              { type: "text", text: " world" }
            ]
          }
        ]
      })
    ).toBe("hello world");
  });

  it("accepts a fully valid metadata payload", () => {
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    expect(youtubeMetadataSchema.parse(makeValidMetadata(chapterText, tagText)).chapters.text).toBe(chapterText);
  });

  it("rejects unsafe output filenames in the validated schema path", async () => {
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const metadata = makeValidMetadata(chapterText, tagText);
    metadata.uploadSettings.filename = "../escape.mp4";
    await expect(runWithMetadata(metadata)).rejects.toBeInstanceOf(MetadataValidationError);
  });
});

describe("youtube metadata generation", () => {
  it("writes outputs, validates metadata, and deletes the uploaded OpenAI file", async () => {
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const metadata = makeValidMetadata(chapterText, tagText);
    const { result, client } = await runWithMetadata(metadata);
    expect(result.cacheHit).toBe(false);
    expect(result.generation.owner).toBe(YOUTUBE_METADATA_OWNER);
    expect(result.generation.ownerVersion).toBe(YOUTUBE_METADATA_OWNER_VERSION);
    expect(result.generation.status).toBe("completed");
    expect(result.generation.parentNarrationFingerprint).toBe(
      result.generation.narration.narrationFingerprint
    );
    expect(await fs.readFile(result.outputs.jsonPath, "utf8")).toContain("The Simple Problem");
    expect(client.files.delete).toHaveBeenCalledWith("file_123");
  });

  it("normalizes model-provided chapter timestamps onto real scene timings", async () => {
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const metadata = makeValidMetadata(chapterText, tagText);
    metadata.chapters.items = metadata.chapters.items.map((chapter, index) => ({
      ...chapter,
      timestamp: `${index === 0 ? "00:00" : "07"}:${10 + index}`,
      startSeconds: 430 + index * 10
    }));
    metadata.chapters.text = metadata.chapters.items.map((chapter) => `${chapter.timestamp} ${chapter.title}`).join("\n");
    metadata.description = `Intro text.\n\n${metadata.chapters.text}\n\nShort summary.\n\nSubscribe for more.\n\n#topic`;
    const { result } = await runWithMetadata(metadata);
    const refreshed = await fs.readFile(result.outputs.jsonPath, "utf8");
    expect(refreshed).toContain("00:00");
    expect(refreshed).toContain("00:04");
  });

  it("uses the cached generation on subsequent runs", async () => {
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const metadata = makeValidMetadata(chapterText, tagText);
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(path.join(episodeDir, "scenes.json"), makeScenariosJson(), "utf8");
    const target = makeTarget(workspaceDir);
    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => ({ id: "file_123" })),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async () => ({
          id: "resp_123",
          output_text: JSON.stringify(metadata),
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(metadata) }] }]
        }))
      }
    };
    await generateYoutubeMetadataForTarget(target, {
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      language: "en",
      promptText: "Prompt",
      maxRetries: 1,
      timeoutMs: 10_000,
      keepFile: false,
      client
    });

    const cachedClient: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => {
          throw new Error("should not upload on cache hit");
        }),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async () => {
          throw new Error("should not generate on cache hit");
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

  it("supports a dry-run path without calling OpenAI", async () => {
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(path.join(episodeDir, "scenes.json"), makeScenariosJson(), "utf8");
    const target = makeTarget(workspaceDir);
    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => ({ id: "file_123" })),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async () => ({
          id: "resp_123",
          output_text: "{}",
          output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }]
        }))
      }
    };
    await expect(
      generateYoutubeMetadataForTarget(target, {
        apiKey: "sk-test",
        model: "gpt-4o-mini",
        language: "en",
        promptText: "Prompt",
        maxRetries: 1,
        timeoutMs: 10_000,
        keepFile: false,
        dryRun: true,
        client
      })
    ).rejects.toBeInstanceOf(OutputWriteError);
    expect(client.files.create).not.toHaveBeenCalled();
    expect(client.responses.create).not.toHaveBeenCalled();
  });

  it("retries retryable OpenAI failures and stops on non-retryable failures", async () => {
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(episodeDir, { recursive: true });
    const sourceFilePath = path.join(episodeDir, "scenes.json");
    await fs.writeFile(sourceFilePath, makeScenariosJson(), "utf8");
    const target = makeTarget(workspaceDir);
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const metadata = makeValidMetadata(chapterText, tagText);
    let uploadAttempts = 0;
    const retryableError = {
      status: 429,
      code: "rate_limit",
      error: { message: "rate limited", code: "rate_limit" }
    };
    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => {
          uploadAttempts += 1;
          if (uploadAttempts === 1) {
            throw retryableError;
          }
          return { id: "file_123" };
        }),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async () => ({
          id: "resp_123",
          output_text: JSON.stringify(metadata),
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(metadata) }] }]
        }))
      }
    };

    await expect(
      generateYoutubeMetadataForTarget(target, {
        apiKey: "sk-test",
        model: "gpt-4o-mini",
        language: "en",
        promptText: "Prompt",
        maxRetries: 2,
        timeoutMs: 10_000,
        keepFile: false,
        client
      })
    ).resolves.toMatchObject({ cacheHit: false });
    expect(uploadAttempts).toBe(2);
  });

  it("falls back to the next configured model when the elected metadata model is at capacity", async () => {
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(path.join(episodeDir, "scenes.json"), makeScenariosJson(), "utf8");
    const target = makeTarget(workspaceDir);
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const metadata = makeValidMetadata(chapterText, tagText);
    const calls: string[] = [];
    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => ({ id: "file_123" })),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async (request) => {
          calls.push(request.model);
          if (request.model === "gpt-4.1-mini") {
            throw new Error("elected model is at capacity. Please try a different model.");
          }
          return {
            id: "resp_123",
            output_text: JSON.stringify(metadata),
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(metadata) }] }]
          };
        })
      }
    };

    const result = await generateYoutubeMetadataForTarget(target, {
      apiKey: "sk-test",
      model: "gpt-4.1-mini",
      fallbackModels: ["gpt-4o-mini"],
      language: "en",
      promptText: "Prompt",
      maxRetries: 0,
      timeoutMs: 10_000,
      keepFile: false,
      client
    });

    expect(calls).toEqual(["gpt-4.1-mini", "gpt-4o-mini"]);
    expect(result.generation.model).toBe("gpt-4o-mini");
  });

  it("repairs a malformed response once before failing", async () => {
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(path.join(episodeDir, "scenes.json"), makeScenariosJson(), "utf8");
    const target = makeTarget(workspaceDir);
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const valid = makeValidMetadata(chapterText, tagText);
    const requests: Array<{ readonly instructions?: string | null }> = [];
    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => ({ id: "file_123" })),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async (request) => {
          requests.push({ instructions: request.instructions ?? null });
          if (requests.length === 1) {
            return {
              id: "resp_123",
              output_text: JSON.stringify({ bad: true }),
              output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ bad: true }) }] }]
            };
          }
          return {
            id: "resp_456",
            output_text: JSON.stringify(valid),
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(valid) }] }]
          };
        })
      }
    };

    await generateYoutubeMetadataForTarget(target, {
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      language: "en",
      promptText: "Prompt",
      maxRetries: 1,
      timeoutMs: 10_000,
      keepFile: false,
      client
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.instructions ?? "").toContain("Validation errors");
    expect(requests[1]?.instructions ?? "").toContain("Previous JSON");
  });

  it("repairs syntactically invalid JSON before schema validation", async () => {
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(episodeDir, { recursive: true });
    await fs.writeFile(path.join(episodeDir, "scenes.json"), makeScenariosJson(), "utf8");
    const target = makeTarget(workspaceDir);
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const valid = makeValidMetadata(chapterText, tagText);
    const requests: Array<{ readonly instructions?: string | null }> = [];
    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => ({ id: "file_123" })),
        delete: vi.fn(async () => ({ deleted: true })),
      },
      responses: {
        create: vi.fn(async (request) => {
          requests.push({ instructions: request.instructions ?? null });
          if (requests.length === 1) {
            return {
              id: "resp_123",
              output_text: "{\"bad\":",
              output: [{ type: "message", content: [{ type: "output_text", text: "{\"bad\":" }] }],
            };
          }
          return {
            id: "resp_456",
            output_text: JSON.stringify(valid),
            output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(valid) }] }],
          };
        }),
      },
    };

    await generateYoutubeMetadataForTarget(target, {
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      language: "en",
      promptText: "Prompt",
      maxRetries: 1,
      timeoutMs: 10_000,
      keepFile: false,
      client,
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.instructions ?? "").toContain("not valid JSON");
    expect(requests[1]?.instructions ?? "").toContain("Previous response");
  });

  it("returns a structured validation error for malformed model output", async () => {
    const workspaceDir = createWorkspace();
    const episodeDir = path.join(workspaceDir, "episode-001");
    await fs.mkdir(episodeDir, { recursive: true });
    const sourceFilePath = path.join(episodeDir, "scenes.json");
    await fs.writeFile(sourceFilePath, makeScenariosJson(), "utf8");
    const target = makeTarget(workspaceDir);
    const client: OpenAiMetadataClient = {
      files: {
        create: vi.fn(async () => ({ id: "file_123" })),
        delete: vi.fn(async () => ({ deleted: true }))
      },
      responses: {
        create: vi.fn(async () => ({
          id: "resp_123",
          output_text: JSON.stringify({ bad: true }),
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ bad: true }) }] }]
        }))
      }
    };

    await expect(
      generateYoutubeMetadataForTarget(target, {
        apiKey: "sk-test",
        model: "gpt-4o-mini",
        language: "en",
        promptText: "Prompt",
        maxRetries: 0,
        timeoutMs: 10_000,
        keepFile: false,
        client
      })
    ).rejects.toBeInstanceOf(MetadataValidationError);
  });

  it("rejects a title that exceeds the maximum length", async () => {
    const chapterText = makeChapterText(72);
    const tagText = makeTagText(26);
    const metadata = makeValidMetadata(chapterText, tagText);
    metadata.title.recommended = "x".repeat(101);
    await expect(
      runWithMetadata(metadata)
    ).rejects.toBeInstanceOf(MetadataValidationError);
  });

  it("accepts chapter text at exactly 800 characters and rejects 801", async () => {
    const chapterText800 = makeChapterText(800);
    const tagText = makeTagText(26);
    const exact = makeValidMetadata(chapterText800, tagText);
    const ok = await runWithMetadata(exact);
    expect(ok.result.cacheHit).toBe(false);

    const chapterText801 = `${chapterText800}x`;
    const tooLong = makeValidMetadata(chapterText801.slice(0, 801), tagText);
    await expect(runWithMetadata(tooLong)).rejects.toBeInstanceOf(MetadataValidationError);
  });

  it("accepts tag text at exactly 500 characters and rejects 501", async () => {
    const chapterText = makeChapterText(72);
    const tagText500 = makeTagText(500);
    const ok = makeValidMetadata(chapterText, tagText500);
    await expect(runWithMetadata(ok)).resolves.toBeDefined();

    const tagText501 = `${tagText500}x`;
    const bad = makeValidMetadata(chapterText, tagText501.slice(0, 501));
    await expect(runWithMetadata(bad)).rejects.toBeInstanceOf(MetadataValidationError);
  });

  it("produces the expected helper errors", () => {
    expect(new ConfigurationError("x").code).toBe("configuration_error");
    expect(new SourceFileError("x").code).toBe("source_file_error");
    expect(new OpenAIUploadError("x").code).toBe("openai_upload_error");
    expect(new OpenAIResponseError("x").code).toBe("openai_response_error");
    expect(new OutputWriteError("x").code).toBe("output_write_error");
  });
});
