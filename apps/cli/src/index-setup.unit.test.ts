import { Command } from "commander";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MATH_QUALITY_GATES,
  MATH_STAGES,
  canonicalHash,
  createArtifactLineage,
  deriveMathQuality,
  qualityCheck,
  saveWorkflowManifest,
  type MathArtifactLineage,
  type WorkflowManifest,
} from "@mediaforge/math-education";
import { writeJsonAtomic } from "@mediaforge/shared";

const registerEpisodeCommandsMock = vi.hoisted(() => vi.fn());
const registerShotsCommandsMock = vi.hoisted(() => vi.fn());
const registerStoryLocalizationCommandsMock = vi.hoisted(() => vi.fn());
const registerThumbnailCommandsMock = vi.hoisted(() => vi.fn());
const createExecutionTelemetryMock = vi.hoisted(() =>
  vi.fn(() => ({
    finalize: vi.fn(async () => undefined),
  }))
);
const withExecutionTelemetryMock = vi.hoisted(() =>
  vi.fn(async (_telemetry: unknown, callback: () => Promise<void>) => {
    await callback();
  })
);
const createLoggerMock = vi.hoisted(() => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return vi.fn(() => logger);
});

vi.mock("./episode-commands.js", () => ({
  registerEpisodeCommands: registerEpisodeCommandsMock,
}));
vi.mock("./shots.js", () => ({
  registerShotsCommands: registerShotsCommandsMock,
}));
vi.mock("./story-localization-commands.js", () => ({
  registerStoryLocalizationCommands: registerStoryLocalizationCommandsMock,
}));
vi.mock("./thumbnail-commands.js", () => ({
  registerThumbnailCommands: registerThumbnailCommandsMock,
}));
vi.mock("@mediaforge/observability", () => ({
  createExecutionTelemetry: createExecutionTelemetryMock,
  createLogger: createLoggerMock,
  currentExecutionTelemetry: vi.fn(() => undefined),
  withExecutionTelemetry: withExecutionTelemetryMock,
}));

describe("CLI application setup", () => {
  const originalArgv = process.argv;
  let parseAsyncSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.resetModules();
    registerEpisodeCommandsMock.mockReset();
    registerShotsCommandsMock.mockReset();
    registerStoryLocalizationCommandsMock.mockReset();
    registerThumbnailCommandsMock.mockReset();
    createExecutionTelemetryMock.mockClear();
    withExecutionTelemetryMock.mockClear();
    process.argv = ["node", "cli"];
    process.exitCode = undefined;
    parseAsyncSpy = vi
      .spyOn(Command.prototype, "parseAsync")
      .mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    parseAsyncSpy?.mockRestore();
    process.argv = originalArgv;
    process.exitCode = undefined;
  });

  it(
    "registers the active command surfaces when the CLI module boots",
    async () => {
      await import("./index.js");

      expect(registerEpisodeCommandsMock).toHaveBeenCalledTimes(1);
      expect(registerShotsCommandsMock).toHaveBeenCalledTimes(1);
      expect(registerStoryLocalizationCommandsMock).toHaveBeenCalledTimes(1);
      expect(registerThumbnailCommandsMock).toHaveBeenCalledTimes(1);
      expect(createExecutionTelemetryMock).toHaveBeenCalledTimes(1);
      expect(withExecutionTelemetryMock).toHaveBeenCalledTimes(1);
    },
    15_000
  );

  it("preserves a blocked math publish exit through the real command and top-level catch", async () => {
    parseAsyncSpy?.mockRestore();
    parseAsyncSpy = undefined;
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "math-index-blocked-"));
    const lessonId = "m5-zo-001-standard";
    const lessonRoot = path.join(workspace, lessonId);
    const evidenceHash = (label: string) => canonicalHash({ lessonId, label });
    const quality = deriveMathQuality({
      contractVersion: "math-quality-contract.v2",
      lessonId,
      selectedLocales: ["de"],
      checks: MATH_QUALITY_GATES.map((gate) =>
        qualityCheck({
          checkId: gate.checkId,
          ready: gate.checkId !== "render",
          ...(gate.checkId === "render"
            ? {}
            : { evidenceHash: evidenceHash(gate.checkId) }),
          message: `${gate.checkId} evidence`,
          ...(gate.checkId === "localization"
            ? { assessedLocales: ["de"] }
            : {}),
        })
      ),
    });
    await writeJsonAtomic(path.join(lessonRoot, "canonical", "quality.json"), quality);
    let parentFingerprints = [canonicalHash({ lessonId, root: true })];
    const now = "2026-07-13T12:00:00.000Z";
    const stages = MATH_STAGES.map((stage) => {
      const fingerprint = canonicalHash({ lessonId, stage, parentFingerprints });
      const record = {
        stage,
        status: stage === "quality-gate" ? ("succeeded" as const) : ("planned" as const),
        fingerprint,
        parentFingerprints,
        outputArtifacts: [] as MathArtifactLineage[],
        updatedAt: now,
      };
      parentFingerprints = [fingerprint];
      return record;
    });
    const qualityStage = stages.find((stage) => stage.stage === "quality-gate")!;
    qualityStage.outputArtifacts.push(
      await createArtifactLineage({
        root: lessonRoot,
        relativePath: "canonical/quality.json",
        schemaVersion: "math-quality.v2",
        parentHashes: qualityStage.parentFingerprints,
        producedBy: "quality-gate",
      })
    );
    const manifest: WorkflowManifest = {
      artifactVersion: "math-workflow.v2",
      lessonId,
      curriculumReleaseId: "de-gems-5-10-v1",
      simulated: true,
      paidProviderCalled: false,
      stages,
      failures: [],
    };
    await saveWorkflowManifest(path.join(lessonRoot, "manifest.json"), manifest);
    process.argv = [
      "node",
      "cli",
      "math",
      "publish",
      "--lesson",
      lessonId,
      "--workspace",
      workspace,
      "--dry-run",
    ];
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await import("./index.js");
      expect(
        process.exitCode,
        String(stderr.mock.calls.at(-1)?.[0] ?? "no serialized CLI error")
      ).toBe(3);
      const telemetry = createExecutionTelemetryMock.mock.results[0]?.value;
      expect(telemetry.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, exitCode: 3 })
      );
    } finally {
      stderr.mockRestore();
    }
  }, 15_000);

  it("does not preserve an ambient blocked code for an unclassified failure", async () => {
    parseAsyncSpy?.mockRejectedValue(new Error("invalid authoritative data"));
    process.exitCode = 3;
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await import("./index.js");
      expect(process.exitCode).toBe(1);
      const telemetry = createExecutionTelemetryMock.mock.results[0]?.value;
      expect(telemetry.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, exitCode: 1 })
      );
    } finally {
      stderr.mockRestore();
    }
  });
});
