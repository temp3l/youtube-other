import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashFile } from "@mediaforge/shared";
import {
  bindMathPortableScene,
  bindMathSceneShardRequest,
  bindMathSceneShardResult,
  createMathFragmentEncoding,
  createMathRenderToolchainIdentity,
  type MathSceneShardRequest,
} from "../composition/portable-scene-contract.js";
import {
  mathRenderWorkerLogSchema,
  mathRenderWorkerResultSchema,
  mathRenderWorkerSceneResultSchema,
  MATH_RENDER_WORKER_GID,
  MATH_RENDER_WORKER_MAX_LOG_BYTES,
  MATH_RENDER_WORKER_UID,
} from "./math-render-worker-contract.js";
import {
  mathRenderWorkerExitCode,
  runMathRenderWorker,
  type MathRenderWorkerDependencies,
} from "./math-render-worker.js";

const imageId = `sha256:${"a".repeat(64)}`;
const buildRevision = "b".repeat(64);
const roots: string[] = [];

afterEach(async () => {
  delete process.env["MATH_RENDER_WORKER_IMAGE_ID"];
  delete process.env["MATH_RENDER_WORKER_BUILD_REVISION"];
  delete process.env["OPENAI_API_KEY"];
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    )
  );
});

async function fixture(): Promise<{
  readonly root: string;
  readonly jobRoot: string;
  readonly cacheRoot: string;
  readonly manifestPath: string;
  readonly request: MathSceneShardRequest;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-worker-unit-"));
  roots.push(root);
  const jobRoot = path.join(root, "job");
  const cacheRoot = path.join(root, "cache");
  const svgPath = path.join(jobRoot, "inputs", "scene-001.svg");
  await Promise.all([
    fs.mkdir(path.dirname(svgPath), { recursive: true }),
    fs.mkdir(cacheRoot, { recursive: true }),
  ]);
  await fs.writeFile(
    svgPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><g data-chalk-step="a"><path d="M0 0H10"/></g></svg>'
  );
  const scene = bindMathPortableScene({
    sceneId: "scene-001",
    order: 0,
    startFrame: 0,
    endFrame: 12,
    expectedFrameCount: 12,
    svgRelativePath: "inputs/scene-001.svg",
    svgHash: await hashFile(svgPath),
    minimumGlyphPx: 48,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    animation: {
      mode: "progressive-chalk-reveal",
      rendererVersion: "math-semantic-chalk.v7",
      cues: [],
      activity: "standard",
    },
    fragmentRelativePath: "outputs/scene-001.mp4",
    encoding: createMathFragmentEncoding("draft"),
    toolchain: createMathRenderToolchainIdentity(imageId),
  });
  const request = bindMathSceneShardRequest({
    artifactVersion: "math-scene-shard-request.v1",
    jobId: "worker-unit",
    planHash: "c".repeat(64),
    assignmentId: "unit-a",
    workRelativePath: "work",
    scenes: [scene],
  });
  const manifestPath = path.join(jobRoot, "requests", "unit-a.json");
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(request)}\n`);
  return { root, jobRoot, cacheRoot, manifestPath, request };
}

function dependencies(
  request: MathSceneShardRequest
): MathRenderWorkerDependencies {
  return {
    getUid: () => MATH_RENDER_WORKER_UID,
    getGid: () => MATH_RENDER_WORKER_GID,
    networkInterfaces: async () => ["lo"],
    cpuQuota: async () => 1,
    ffmpegVersion: async () => "ffmpeg version worker-unit",
    ensureResources: async () => undefined,
    createExecutor: () => ({
      execute: async () =>
        bindMathSceneShardResult({
          artifactVersion: "math-scene-shard-result.v1",
          jobId: request.jobId,
          planHash: request.planHash,
          assignmentId: request.assignmentId,
          requestHash: request.requestHash,
          fragments: request.scenes.map((scene) => ({
            sceneId: scene.sceneId,
            order: scene.order,
            sceneHash: scene.sceneHash,
            svgHash: scene.svgHash,
            relativePath: scene.fragmentRelativePath,
            sha256: "d".repeat(64),
            byteLength: 1_024,
            frameCount: scene.expectedFrameCount,
            width: 1920,
            height: 1080,
            fps: 30,
            pixelFormat: "yuv420p",
            codec: "h264",
            codecProfile: "High",
            timeBase: "1/15360",
            audioStreamCount: 0,
            encoding: scene.encoding,
            toolchain: scene.toolchain,
            renderDurationMs: 10,
            cacheHitCount: 0,
            cacheMissCount: 1,
          })),
        }),
    }),
  };
}

function setWorkerIdentity(): void {
  process.env["MATH_RENDER_WORKER_IMAGE_ID"] = imageId;
  process.env["MATH_RENDER_WORKER_BUILD_REVISION"] = buildRevision;
}

describe("Docker math render worker contract", () => {
  it("requires exactly three arguments and stable invalid-job exit semantics", async () => {
    await expect(runMathRenderWorker([])).rejects.toMatchObject({
      exitClass: "invalid-job",
    });
    await expect(
      runMathRenderWorker(["/job", "/cache", "/job/request.json", "extra"])
    ).rejects.toMatchObject({ exitClass: "invalid-job" });
    expect(mathRenderWorkerExitCode(new SyntaxError("invalid JSON"))).toBe(64);
  });

  it("rejects invalid and escaping requests before output mutation", async () => {
    setWorkerIdentity();
    const invalid = await fixture();
    await fs.writeFile(invalid.manifestPath, "{");
    await expect(
      runMathRenderWorker(
        [invalid.jobRoot, invalid.cacheRoot, invalid.manifestPath],
        dependencies(invalid.request)
      )
    ).rejects.toMatchObject({ exitClass: "invalid-job" });
    await expect(fs.stat(path.join(invalid.jobRoot, "work"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const escaping = await fixture();
    const raw = JSON.parse(
      await fs.readFile(escaping.manifestPath, "utf8")
    ) as Record<string, unknown> & {
      scenes: Array<Record<string, unknown>>;
    };
    raw.scenes[0]!["svgRelativePath"] = "../outside.svg";
    await fs.writeFile(escaping.manifestPath, JSON.stringify(raw));
    await expect(
      runMathRenderWorker(
        [escaping.jobRoot, escaping.cacheRoot, escaping.manifestPath],
        dependencies(escaping.request)
      )
    ).rejects.toMatchObject({ exitClass: "containment-integrity" });
    await expect(fs.stat(path.join(escaping.jobRoot, "work"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a contained symlink that resolves outside the job root", async () => {
    setWorkerIdentity();
    const input = await fixture();
    const outside = path.join(input.root, "outside.svg");
    await fs.writeFile(outside, "outside");
    await fs.unlink(path.join(input.jobRoot, "inputs", "scene-001.svg"));
    await fs.symlink(outside, path.join(input.jobRoot, "inputs", "scene-001.svg"));
    await expect(
      runMathRenderWorker(
        [input.jobRoot, input.cacheRoot, input.manifestPath],
        dependencies(input.request)
      )
    ).rejects.toMatchObject({ exitClass: "containment-integrity" });
    await expect(fs.stat(path.join(input.jobRoot, "work"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("writes strict bounded per-scene and shard results without paths or secrets", async () => {
    setWorkerIdentity();
    process.env["OPENAI_API_KEY"] = "must-not-enter-worker-results";
    const input = await fixture();
    await runMathRenderWorker(
      [input.jobRoot, input.cacheRoot, input.manifestPath],
      dependencies(input.request)
    );
    const resultRoot = path.join(input.jobRoot, "work", "worker-results", "unit-a");
    const sceneRaw = await fs.readFile(
      path.join(resultRoot, "scene-001.json"),
      "utf8"
    );
    const shardRaw = await fs.readFile(path.join(resultRoot, "shard.json"), "utf8");
    const logRaw = await fs.readFile(
      path.join(input.jobRoot, "work", "worker-logs", "unit-a.jsonl"),
      "utf8"
    );
    expect(() =>
      mathRenderWorkerSceneResultSchema.parse(JSON.parse(sceneRaw))
    ).not.toThrow();
    expect(() =>
      mathRenderWorkerResultSchema.parse(JSON.parse(shardRaw))
    ).not.toThrow();
    const logs = logRaw.trim().split("\n").map((line) =>
      mathRenderWorkerLogSchema.parse(JSON.parse(line))
    );
    expect(logs.map(({ event }) => event)).toEqual(["started", "succeeded"]);
    expect(Buffer.byteLength(logRaw)).toBeLessThanOrEqual(
      MATH_RENDER_WORKER_MAX_LOG_BYTES
    );
    const emitted = `${sceneRaw}${shardRaw}${logRaw}`;
    expect(emitted).not.toContain(input.root);
    expect(emitted).not.toContain("must-not-enter-worker-results");
    expect(emitted).not.toMatch(/narration|oauth|provider/iu);
  });
});
