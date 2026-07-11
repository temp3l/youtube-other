import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import {
  createImagesBatchCommandHandlers,
  registerImagesBatchCommands,
} from "./images-batch-commands.js";

function makeDeps() {
  return {
    loadRuntimeConfig: vi.fn(async () => ({
      workspaceDir: "/workspace",
      openAiImageReferenceModel: "gpt-image-ref",
      openAiImageReferenceQuality: "high",
      openAiImageReferenceSize: "1536x1024",
    })),
    loadEpisodeImageGenerationSettings: vi.fn(() => ({
      model: "gpt-image-2",
      resolvedSize: "1920x1088",
      quality: "medium",
      allowUnapprovedCharacterReferences: false,
      force: false,
    })),
    loadOpenAiImageGenerationSettings: vi.fn(() => ({
      apiKey: "test-key",
      baseUrl: "https://api.example.test/v1",
      organization: "org-test",
      project: "proj-test",
      profile: "full",
      model: "gpt-image-2",
      requestedSize: "1920x1088",
      renderSize: "1920x1088",
      apiSize: "1920x1088",
      quality: "medium",
      outputFormat: "webp",
      concurrency: 2,
      maxRetries: 7,
      timeoutMs: 456000,
      debug: false,
    })),
    prepareFullSceneImageBatches: vi.fn(async () => ({
      episodeId: "001-demo",
      languages: ["en"],
      variant: "full",
      groups: [
        {
          storagePlan: { localBatchId: "imgb-001" },
          referencePlans: [],
          scenePlans: [{}, {}],
        },
      ],
      stagePreviews: [
        {
          kind: "scene-images",
          operation: "generation",
          itemCount: 2,
          requestCount: 2,
          endpoint: "/v1/images/generations",
          model: "gpt-image-2",
          size: "1920x1088",
          quality: "medium",
        },
      ],
    })),
    prepareReferenceImageBatchForEpisode: vi.fn(async () => ({
      groups: [
        {
          storagePlan: { localBatchId: "imgb-ref-001" },
          referencePlans: [],
          scenePlans: [],
        },
      ],
      stagePreviews: [],
      writtenFiles: [],
    })),
    prepareShortSceneImageBatches: vi.fn(async () => ({
      episodeId: "001-demo",
      languages: ["de"],
      variant: "short",
      groups: [
        {
          storagePlan: { localBatchId: "imgb-short-001" },
          referencePlans: [],
          scenePlans: [{}],
        },
      ],
      stagePreviews: [
        {
          kind: "scene-images",
          operation: "generation",
          itemCount: 1,
          requestCount: 1,
          endpoint: "/v1/images/generations",
          model: "gpt-image-2",
          size: "1024x1536",
          quality: "medium",
        },
      ],
      localWorkPlan: {
        manifestPath: "/workspace/001-demo/state/image-generation/shorts-local-work.de.json",
        deterministicTransforms: [],
        cacheReuse: [],
      },
      previewCounts: {
        paidNativeGenerations: 1,
        freeLocalTransforms: 2,
        cacheHits: 3,
        blocked: 0,
      },
      writtenFiles: [],
    })),
    submitImageBatch: vi.fn(async () => ({
      localBatchId: "imgb-001",
      openAIBatchId: "batch_001",
      openAIInputFileId: "file_001",
      status: "submitted",
    })),
    cancelImageBatch: vi.fn(async () => ({
      localBatchId: "imgb-001",
      status: "cancelling",
      endpoint: "/v1/images/generations",
      model: "gpt-image-2",
      items: [],
    })),
    validateImageBatchArtifacts: vi.fn(async () => ({
      localBatchId: "imgb-001",
      validItemCount: 1,
      invalidItemCount: 0,
      skippedItemCount: 0,
      items: [{ customId: "cid-1", status: "valid" }],
    })),
    refreshImageBatch: vi.fn(async () => ({
      localBatchId: "imgb-001",
      openAIBatchId: "batch_001",
      status: "completed",
      endpoint: "/v1/images/generations",
      model: "gpt-image-2",
      items: [
        {
          identity: {
            episodeId: "001-demo",
            language: "en",
            variant: "full",
            assetRole: "full-scene",
          },
          customId: "cid-1",
          requestedSize: "1920x1088",
          quality: "medium",
          status: "submitted",
        },
      ],
    })),
    importImageBatch: vi.fn(async () => ({
      localBatchId: "imgb-001",
      importedItemCount: 1,
      failedItemCount: 0,
      persistedFiles: [],
      retryableItemCount: 0,
      unknownResultCount: 0,
      duplicateResultCount: 0,
      providerStatus: "completed",
      status: "imported",
    })),
    retryFailedImageBatch: vi.fn(async () => ({
      localBatchId: "imgb-002",
      manifestPath: "/workspace/001-demo/state/image-generation/.batch/manifests/batch-imgb-002.manifest.json",
      inputFilePath: "/workspace/001-demo/state/image-generation/.batch/inputs/batch-imgb-002.jsonl",
      itemCount: 2,
      skippedCachedItemCount: 0,
    })),
    resolveImageBatchManifest: vi.fn(async (_outputDirectory: string, batchRef: string) => ({
      localBatchId: batchRef === "batch_001" ? "imgb-001" : batchRef,
      manifestPath: `/workspace/001-demo/state/image-generation/.batch/manifests/batch-${batchRef}.manifest.json`,
      matchedBy: batchRef.startsWith("batch_") ? "openAIBatchId" : "localBatchId",
      manifest: {
        localBatchId: batchRef === "batch_001" ? "imgb-001" : batchRef,
        openAIBatchId: batchRef.startsWith("batch_") ? batchRef : "batch_001",
        status: "prepared",
        endpoint: "/v1/images/generations",
        model: "gpt-image-2",
        items: [
          {
            identity: {
              episodeId: "001-demo",
              language: "en",
              variant: "full",
              assetRole: "full-scene",
            },
            customId: "cid-1",
            requestedSize: "1920x1088",
            quality: "medium",
            status: "retry-required",
            error: { category: "missing-result", message: "missing" },
          },
        ],
      },
    })),
    createOpenAiStoryClientWithOptions: vi.fn(() => ({ files: {}, batches: {} })),
  };
}

describe("images batch commands", () => {
  it("registers the documented lifecycle subcommands", () => {
    const program = new Command();
    const images = program.command("images");
    registerImagesBatchCommands(images, makeDeps() as never);

    const batch = images.commands.find((command) => command.name() === "batch");
    expect(batch).toBeDefined();
    expect(batch?.commands.map((command) => command.name())).toEqual([
      "inspect",
      "prepare",
      "submit",
      "status",
      "download",
      "ingest",
      "validate",
      "retry",
      "cancel",
      "resume",
    ]);
  });

  it("keeps prepare local-only and does not create a provider client", async () => {
    const deps = makeDeps();
    const handlers = createImagesBatchCommandHandlers(deps as never);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await handlers.prepare({ episode: "001-demo", json: true });
    } finally {
      stdout.mockRestore();
    }

    expect(deps.prepareFullSceneImageBatches).toHaveBeenCalledTimes(1);
    expect(deps.prepareFullSceneImageBatches).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          model: "gpt-image-2",
          requestedSize: "1920x1088",
          quality: "medium",
          outputFormat: "webp",
        }),
      })
    );
    expect(deps.prepareReferenceImageBatchForEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          model: "gpt-image-ref",
          requestedSize: "1536x1024",
          quality: "high",
          outputFormat: "webp",
        }),
      })
    );
    expect(deps.createOpenAiStoryClientWithOptions).not.toHaveBeenCalled();
    expect(deps.submitImageBatch).not.toHaveBeenCalled();
  });

  it("routes short variant preparation through the short batch planner", async () => {
    const deps = makeDeps();
    const handlers = createImagesBatchCommandHandlers(deps as never);
    let output = "";
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    try {
      await handlers.prepare({
        episode: "001-demo",
        languages: "de",
        variants: "short",
        json: true,
      });
    } finally {
      stdout.mockRestore();
    }

    expect(deps.prepareShortSceneImageBatches).toHaveBeenCalledTimes(1);
    expect(deps.prepareFullSceneImageBatches).not.toHaveBeenCalled();
    expect(JSON.parse(output)).toMatchObject({
      previewCounts: {
        paidNativeGenerations: 1,
        freeLocalTransforms: 2,
        cacheHits: 3,
        blocked: 0,
      },
      localWorkPlan:
        "/workspace/001-demo/state/image-generation/shorts-local-work.de.json",
    });
  });

  it("stops auto planning after missing reference assets are prepared", async () => {
    const deps = makeDeps();
    deps.prepareReferenceImageBatchForEpisode.mockResolvedValueOnce({
      groups: [
        {
          storagePlan: { localBatchId: "imgb-ref-002" },
          referencePlans: [{ manifestItem: {} }],
          scenePlans: [],
        },
      ],
      stagePreviews: [
        {
          kind: "reference-images",
          operation: "generation",
          itemCount: 1,
          requestCount: 1,
          endpoint: "/v1/images/generations",
          model: "gpt-image-2",
          size: "1920x1088",
          quality: "medium",
        },
      ],
      writtenFiles: [],
    } as never);
    const handlers = createImagesBatchCommandHandlers(deps as never);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await handlers.prepare({ episode: "001-demo", json: true });
    } finally {
      stdout.mockRestore();
    }
    expect(deps.prepareReferenceImageBatchForEpisode).toHaveBeenCalledTimes(1);
    expect(deps.prepareFullSceneImageBatches).not.toHaveBeenCalled();
  });

  it("submits only through the explicit submit command", async () => {
    const deps = makeDeps();
    const handlers = createImagesBatchCommandHandlers(deps as never);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await handlers.submit({ episode: "001-demo", batch: "imgb-001", json: true });
    } finally {
      stdout.mockRestore();
    }

    expect(deps.createOpenAiStoryClientWithOptions).toHaveBeenCalledTimes(1);
    expect(deps.createOpenAiStoryClientWithOptions).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseUrl: "https://api.example.test/v1",
      organization: "org-test",
      project: "proj-test",
      maxRetries: 7,
      timeoutMs: 456000,
    });
    expect(deps.submitImageBatch).toHaveBeenCalledWith(
      "/workspace/001-demo/state/image-generation",
      "imgb-001",
      expect.any(Object)
    );
  });

  it("routes status, download, and resume through the batch service helpers", async () => {
    const deps = makeDeps();
    const handlers = createImagesBatchCommandHandlers(deps as never);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await handlers.status({ episode: "001-demo", batch: "batch_001", json: true });
      await handlers.download({ episode: "001-demo", batch: "batch_001", json: true });
      await handlers.resume({ episode: "001-demo", batch: "imgb-001", json: true });
    } finally {
      stdout.mockRestore();
    }

    expect(deps.refreshImageBatch).toHaveBeenCalledWith(
      "/workspace/001-demo/state/image-generation",
      "batch_001",
      expect.any(Object)
    );
    expect(deps.importImageBatch).toHaveBeenCalledWith(
      "/workspace/001-demo/state/image-generation",
      "batch_001",
      expect.any(Object)
    );
    expect(deps.retryFailedImageBatch).toHaveBeenCalledWith(
      "/workspace/001-demo/state/image-generation",
      "imgb-001"
    );
  });
});
