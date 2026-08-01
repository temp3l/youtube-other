import { describe, expect, it } from "vitest";

import {
  CreatorMediaPolicyError,
  dispatchCreatorMediaGeneration,
} from "./creator-media-policy.js";
import {
  OpenAIImageGenerator,
  type EpisodeImagePipelineSettings,
  type ImageGenerationRequest,
} from "./episode-image-pipeline.js";
import {
  generateOpenAiSceneImages,
  type OpenAiImageGenerationSettings,
} from "./openai-image.js";
import { ThumbnailImageGenerator } from "./thumbnail-image-generator.js";
import { OpenAiImageBatchProvider } from "./openai-image-batch-provider.js";

function expectPolicyCode(
  error: unknown,
  code: CreatorMediaPolicyError["code"] = "SYNTHETIC_LIKENESS_BLOCKED",
): void {
  expect(error).toBeInstanceOf(CreatorMediaPolicyError);
  expect((error as CreatorMediaPolicyError).code).toBe(code);
}

describe("creator media policy", () => {
  it("blocks synthetic likeness before a provider mutation", async () => {
    let mutations = 0;

    try {
      await dispatchCreatorMediaGeneration({
        request: { syntheticLikeness: true },
        dispatch: async () => {
          mutations += 1;
          return "provider-result";
        },
      });
      throw new Error("Expected synthetic likeness to be blocked.");
    } catch (error) {
      expect(error).toBeInstanceOf(CreatorMediaPolicyError);
      expect((error as CreatorMediaPolicyError).code).toBe("SYNTHETIC_LIKENESS_BLOCKED");
    }

    expect(mutations).toBe(0);
  });

  it("permits non-likeness work to reach the provider", async () => {
    await expect(dispatchCreatorMediaGeneration({
      request: { syntheticLikeness: false },
      dispatch: async () => "provider-result",
    })).resolves.toBe("provider-result");
  });

  it("fails closed when creator-media context is missing", async () => {
    let mutations = 0;
    try {
      await dispatchCreatorMediaGeneration({
        request: undefined as never,
        dispatch: async () => {
          mutations += 1;
          return "provider-result";
        },
      });
      throw new Error("Expected missing context to be blocked.");
    } catch (error) {
      expectPolicyCode(error, "CREATOR_MEDIA_CONTEXT_REQUIRED");
    }
    expect(mutations).toBe(0);
  });

  it("blocks synthetic likeness at both production OpenAI dispatch entries", async () => {
    let directClientCalls = 0;
    const directSettings: OpenAiImageGenerationSettings = {
      apiKey: "test-key",
      baseUrl: undefined,
      organization: undefined,
      project: undefined,
      profile: "full",
      model: "mock-image-model",
      requestedSize: "1536x864",
      renderSize: "1920x1080",
      apiSize: "1536x864",
      quality: "low",
      outputFormat: "png",
      concurrency: 1,
      maxRetries: 0,
      timeoutMs: 1000,
      debug: false,
    };
    try {
      await generateOpenAiSceneImages([
        {
          scene: {} as never,
          prompt: "must not dispatch",
          episodeSlug: "episode-strategy",
          language: "it",
          episodeDir: "/tmp/not-used",
          normalizedFilename: "not-used.png",
          videoKind: "full",
          creatorMedia: { syntheticLikeness: true },
        },
      ], directSettings, {
        client: {
          images: {
            async generate() {
              directClientCalls += 1;
              return { data: [] };
            },
          },
        },
      });
      throw new Error("Expected direct OpenAI dispatch to be blocked.");
    } catch (error) {
      expectPolicyCode(error);
    }
    try {
      await generateOpenAiSceneImages([{
        scene: {} as never,
        prompt: "must not dispatch",
        episodeSlug: "episode-strategy",
        language: "it",
        episodeDir: "/tmp/not-used",
        normalizedFilename: "not-used.png",
        videoKind: "full",
      } as never], directSettings, {
        client: {
          images: {
            async generate() {
              directClientCalls += 1;
              return { data: [] };
            },
          },
        },
      });
      throw new Error("Expected missing direct context to be blocked.");
    } catch (error) {
      expectPolicyCode(error, "CREATOR_MEDIA_CONTEXT_REQUIRED");
    }

    let pipelineClientCalls = 0;
    const pipelineSettings: EpisodeImagePipelineSettings = {
      apiKey: "test-key",
      profile: "full",
      model: "mock-image-model",
      size: "1536x864",
      renderSize: "1920x1080",
      resolvedSize: "1536x864",
      quality: "low",
      concurrency: 1,
      maxRetries: 0,
      timeoutMs: 1000,
      allowUnapprovedCharacterReferences: false,
      force: false,
      debug: false,
    };
    const generator = new OpenAIImageGenerator(pipelineSettings, {
      images: {
        generate() {
          pipelineClientCalls += 1;
          throw new Error("provider should not be called");
        },
        edit() {
          pipelineClientCalls += 1;
          throw new Error("provider should not be called");
        },
      },
    } as never);
    const request = {
      providerRequest: {},
      referenceImages: [],
      context: {
        episodeId: "episode-strategy",
        language: "it",
        profile: "full",
        creatorMedia: { syntheticLikeness: true },
      },
    } as unknown as ImageGenerationRequest;
    try {
      await generator.generate(request);
      throw new Error("Expected pipeline OpenAI dispatch to be blocked.");
    } catch (error) {
      expectPolicyCode(error);
    }
    try {
      await generator.generate({
        ...request,
        context: { episodeId: "episode-strategy", language: "it", profile: "full" },
      } as unknown as ImageGenerationRequest);
      throw new Error("Expected missing pipeline context to be blocked.");
    } catch (error) {
      expectPolicyCode(error, "CREATOR_MEDIA_CONTEXT_REQUIRED");
    }

    expect(directClientCalls).toBe(0);
    expect(pipelineClientCalls).toBe(0);
  });

  it("blocks missing or synthetic context before thumbnail, file, and batch mutations", async () => {
    let thumbnailCalls = 0;
    const thumbnail = new ThumbnailImageGenerator({} as never, {
      images: {
        async edit() {
          thumbnailCalls += 1;
          return { data: [] };
        },
      },
    });
    for (const [creatorMedia, code] of [
      [undefined, "CREATOR_MEDIA_CONTEXT_REQUIRED"],
      [{ syntheticLikeness: true }, "SYNTHETIC_LIKENESS_BLOCKED"],
    ] as const) {
      try {
        await thumbnail.generateBackground({
          creatorMedia,
        } as never);
        throw new Error("Expected thumbnail mutation to be blocked.");
      } catch (error) {
        expectPolicyCode(error, code);
      }
    }

    let fileCalls = 0;
    let batchCalls = 0;
    const client = {
      files: {
        async create() {
          fileCalls += 1;
          return { id: "file-should-not-exist" };
        },
        async retrieve() {
          return { id: "unused" };
        },
        async content() {
          return { text: async () => "" };
        },
      },
      batches: {
        async create() {
          batchCalls += 1;
          return { id: "batch-should-not-exist", status: "submitted" };
        },
        async retrieve() {
          return { id: "unused", status: "completed" };
        },
        async cancel() {
          return { id: "unused", status: "cancelled" };
        },
      },
    };
    for (const [creatorMedia, code] of [
      [undefined, "CREATOR_MEDIA_CONTEXT_REQUIRED"],
      [{ syntheticLikeness: true }, "SYNTHETIC_LIKENESS_BLOCKED"],
    ] as const) {
      const provider = new OpenAiImageBatchProvider(client as never, creatorMedia as never);
      for (const mutation of [
        () => provider.uploadInputFile("/path/must-not-be-opened.jsonl"),
        () => provider.uploadReferenceFile({ localPath: "/path/must-not-be-opened.png", mimeType: "image/png" }),
        () => provider.createBatch({
          inputFileId: "file-unused",
          endpoint: "/v1/images/generations" as const,
          completionWindow: "24h" as const,
          metadata: {},
        }),
      ]) {
        try {
          await mutation();
          throw new Error("Expected batch mutation to be blocked.");
        } catch (error) {
          expectPolicyCode(error, code);
        }
      }
    }

    expect(thumbnailCalls).toBe(0);
    expect(fileCalls).toBe(0);
    expect(batchCalls).toBe(0);
  });
});
