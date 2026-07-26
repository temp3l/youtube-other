import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { hashFile } from "@mediaforge/shared";
import {
  bindMathPortableScene,
  bindMathSceneShardRequest,
  createMathFragmentEncoding,
  createMathRenderToolchainIdentity,
  type MathSceneShardRequest,
} from "../composition/portable-scene-contract.js";
import {
  mathRenderWorkerLogSchema,
  mathRenderWorkerResultSchema,
  mathRenderWorkerSceneResultSchema,
} from "./math-render-worker-contract.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const fixtureRoot = path.join(
  repoRoot,
  "packages/math-rendering/src/worker/test-fixtures/two-scene"
);
const temporaryRoots: string[] = [];
const containers: string[] = [];
const tag = `mediaforge-math-worker-smoke:${process.pid}-${Date.now()}`;
let buildRevision = "";
let imageId = "";

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function command(
  executable: string,
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly allowFailure?: boolean;
    readonly timeoutMs?: number;
  } = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-2_000_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (timeout !== undefined) clearTimeout(timeout);
      const result = { exitCode: code ?? 1, stdout, stderr };
      if (result.exitCode !== 0 && !options.allowFailure) {
        reject(
          new Error(
            `${executable} ${args[0] ?? ""} failed (${result.exitCode}): ${stderr.slice(-4_000)}`
          )
        );
      } else {
        resolve(result);
      }
    });
  });
}

async function docker(
  args: readonly string[],
  options: {
    readonly allowFailure?: boolean;
    readonly timeoutMs?: number;
  } = {}
): Promise<CommandResult> {
  return command("docker", args, {
    cwd: repoRoot,
    ...options,
  });
}

async function createRoots(label: string): Promise<{
  readonly root: string;
  readonly jobRoot: string;
  readonly cacheRoot: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `${label}-`));
  temporaryRoots.push(root);
  const jobRoot = path.join(root, "job");
  const cacheRoot = path.join(root, "cache");
  await Promise.all([
    fs.mkdir(jobRoot, { recursive: true, mode: 0o777 }),
    fs.mkdir(cacheRoot, { recursive: true, mode: 0o777 }),
  ]);
  await Promise.all([fs.chmod(jobRoot, 0o777), fs.chmod(cacheRoot, 0o777)]);
  return { root, jobRoot, cacheRoot };
}

async function createRequest(input: {
  readonly jobRoot: string;
  readonly sceneNumber: 1 | 2;
  readonly frameCount?: number;
  readonly assignmentId: string;
  readonly jobId?: string;
}): Promise<{ readonly request: MathSceneShardRequest; readonly manifestPath: string }> {
  const sceneId = `scene-${String(input.sceneNumber).padStart(3, "0")}`;
  const inputDir = path.join(input.jobRoot, "inputs");
  await fs.mkdir(inputDir, { recursive: true });
  const svgPath = path.join(inputDir, `${sceneId}.svg`);
  await fs.copyFile(
    path.join(fixtureRoot, `${sceneId}.svg`),
    svgPath
  );
  const frameCount = input.frameCount ?? 12;
  const order = input.sceneNumber - 1;
  const scene = bindMathPortableScene({
    sceneId,
    order,
    startFrame: order * frameCount,
    endFrame: (order + 1) * frameCount,
    expectedFrameCount: frameCount,
    svgRelativePath: `inputs/${sceneId}.svg`,
    svgHash: await hashFile(svgPath),
    minimumGlyphPx: 48,
    bounds: { x: 96, y: 54, width: 1728, height: 972 },
    animation: {
      mode: "progressive-chalk-reveal",
      rendererVersion: "math-semantic-chalk.v7",
      cues: [],
      activity: "standard",
    },
    fragmentRelativePath: `outputs/${sceneId}.mp4`,
    encoding: createMathFragmentEncoding("draft"),
    toolchain: createMathRenderToolchainIdentity(imageId),
  });
  const request = bindMathSceneShardRequest({
    artifactVersion: "math-scene-shard-request.v1",
    jobId: input.jobId ?? "docker-smoke",
    planHash: "e".repeat(64),
    assignmentId: input.assignmentId,
    workRelativePath: "work",
    scenes: [scene],
  });
  const manifestPath = path.join(
    input.jobRoot,
    "requests",
    `${input.assignmentId}.json`
  );
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(request)}\n`);
  return { request, manifestPath };
}

function containerArgs(input: {
  readonly name: string;
  readonly jobRoot: string;
  readonly cacheRoot: string;
  readonly manifestName: string;
}): string[] {
  return [
    "create",
    "--name",
    input.name,
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "64",
    "--cpus",
    "1",
    "--user",
    "65534:65534",
    "--env",
    `MATH_RENDER_WORKER_IMAGE_ID=${imageId}`,
    "--mount",
    `type=bind,src=${input.jobRoot},dst=/job`,
    "--mount",
    `type=bind,src=${input.cacheRoot},dst=/cache`,
    tag,
    "/job",
    "/cache",
    input.manifestName,
  ];
}

async function runWorker(input: {
  readonly label: string;
  readonly jobRoot: string;
  readonly cacheRoot: string;
  readonly manifestName: string;
  readonly inspectSecurity?: boolean;
}): Promise<CommandResult> {
  const name = `math-worker-${input.label}-${process.pid}-${containers.length}`;
  containers.push(name);
  await docker(
    containerArgs({
      name,
      jobRoot: input.jobRoot,
      cacheRoot: input.cacheRoot,
      manifestName: input.manifestName,
    })
  );
  if (input.inspectSecurity) {
    const inspected = JSON.parse(
      (await docker(["inspect", name])).stdout
    ) as Array<{
      Config: { User: string };
      HostConfig: {
        ReadonlyRootfs: boolean;
        NetworkMode: string;
        CapDrop: string[];
        SecurityOpt: string[];
        PidsLimit: number;
        NanoCpus: number;
        Mounts: Array<{ Target: string }>;
      };
    }>;
    const container = inspected[0]!;
    expect(container.Config.User).toBe("65534:65534");
    expect(container.HostConfig).toMatchObject({
      ReadonlyRootfs: true,
      NetworkMode: "none",
      PidsLimit: 64,
      NanoCpus: 1_000_000_000,
    });
    expect(container.HostConfig.CapDrop).toEqual(["ALL"]);
    expect(container.HostConfig.SecurityOpt).toContain(
      "no-new-privileges:true"
    );
    expect(
      container.HostConfig.Mounts.map(({ Target }) => Target).sort()
    ).toEqual(["/cache", "/job"]);
  }
  const attached = await docker(["start", "--attach", name], {
    allowFailure: true,
    timeoutMs: 300_000,
  });
  const state = await docker([
    "inspect",
    "--format",
    "{{.State.ExitCode}}",
    name,
  ]);
  return {
    ...attached,
    exitCode: Number(state.stdout.trim()),
  };
}

async function probe(filePath: string): Promise<{
  readonly streams: Array<{
    readonly codec_type?: string;
    readonly codec_name?: string;
    readonly profile?: string;
    readonly pix_fmt?: string;
    readonly width?: number;
    readonly height?: number;
    readonly avg_frame_rate?: string;
    readonly time_base?: string;
    readonly nb_read_frames?: string;
  }>;
}> {
  const result = await command("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_streams",
    "-print_format",
    "json",
    filePath,
  ]);
  return JSON.parse(result.stdout) as {
    streams: Array<{
      codec_type?: string;
      codec_name?: string;
      profile?: string;
      pix_fmt?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      time_base?: string;
      nb_read_frames?: string;
    }>;
  };
}

async function waitForPath(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await fs.stat(filePath).then(() => true).catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for worker path: ${filePath}`);
}

async function recursiveFiles(root: string): Promise<string[]> {
  return fs
    .readdir(root, { recursive: true })
    .then((entries) => entries.map(String).sort());
}

beforeAll(async () => {
  buildRevision = (
    await command("git", ["rev-parse", "HEAD"], { cwd: repoRoot })
  ).stdout.trim();
  await docker(
    [
      "build",
      "--platform",
      "linux/amd64",
      "--build-arg",
      `MATH_RENDER_WORKER_BUILD_REVISION=${buildRevision}`,
      "--file",
      "docker/math-render-worker/Dockerfile",
      "--tag",
      tag,
      ".",
    ],
    { timeoutMs: 900_000 }
  );
  const inspected = JSON.parse(
    (await docker(["image", "inspect", tag])).stdout
  ) as Array<{
    Id: string;
    Architecture: string;
    Os: string;
    Config: {
      User: string;
      Entrypoint: string[];
      Labels: Record<string, string>;
    };
  }>;
  const image = inspected[0]!;
  imageId = image.Id;
  expect(imageId).toMatch(/^sha256:[a-f0-9]{64}$/u);
  expect(image).toMatchObject({
    Architecture: "amd64",
    Os: "linux",
    Config: {
      User: "65534:65534",
      Entrypoint: ["node", "worker.mjs"],
    },
  });
  expect(image.Config.Labels["org.opencontainers.image.revision"]).toBe(
    buildRevision
  );
}, 900_000);

afterAll(async () => {
  for (const name of containers.reverse()) {
    await docker(["container", "rm", "--force", name], {
      allowFailure: true,
    });
  }
  await docker(["image", "rm", "--force", tag], { allowFailure: true });
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true })
    )
  );
});

describe("Docker math render worker offline smoke", () => {
  it("contains only the bundled scene worker and its pinned Sharp runtime", async () => {
    const name = `math-worker-image-inspect-${process.pid}`;
    containers.push(name);
    await docker([
      "create",
      "--name",
      name,
      "--entrypoint",
      "find",
      tag,
      "/opt/math-render-worker",
      "-type",
      "f",
      "-print",
    ]);
    const listing = (
      await docker(["start", "--attach", name])
    ).stdout;
    expect(listing).toContain("/opt/math-render-worker/worker.mjs");
    expect(listing).not.toMatch(
      /(?:\/episodes\/|\/docs\/reports\/|\/\.git\/|\/\.env|oauth|credential|secret|openai)/iu
    );
    const copiedRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-worker-bundle-")
    );
    temporaryRoots.push(copiedRoot);
    const bundlePath = path.join(copiedRoot, "worker.mjs");
    await docker([
      "cp",
      `${name}:/opt/math-render-worker/worker.mjs`,
      bundlePath,
    ]);
    const bundle = await fs.readFile(bundlePath, "utf8");
    expect(bundle).not.toMatch(
      /muxMathNarration|createLocalMathFinalAssembler|narrationRelativePath|openai|publishMath/iu
    );
  });

  it("rejects invalid and escaping manifests before mutating outputs", async () => {
    const invalid = await createRoots("math-worker-invalid");
    const invalidManifest = path.join(invalid.jobRoot, "invalid.json");
    await fs.writeFile(invalidManifest, "{");
    const invalidResult = await runWorker({
      label: "invalid",
      jobRoot: invalid.jobRoot,
      cacheRoot: invalid.cacheRoot,
      manifestName: "/job/invalid.json",
    });
    expect(invalidResult.exitCode, invalidResult.stderr).toBe(64);
    expect(invalidResult.stderr).toContain('"exitClass":"invalid-job"');
    expect(await recursiveFiles(invalid.jobRoot)).toEqual(["invalid.json"]);
    expect(await recursiveFiles(invalid.cacheRoot)).toEqual([]);

    const escaping = await createRoots("math-worker-escaping");
    const valid = await createRequest({
      jobRoot: escaping.jobRoot,
      sceneNumber: 1,
      assignmentId: "escape",
    });
    const raw = JSON.parse(
      await fs.readFile(valid.manifestPath, "utf8")
    ) as { scenes: Array<Record<string, unknown>> };
    raw.scenes[0]!["fragmentRelativePath"] = "../escaped.mp4";
    await fs.writeFile(valid.manifestPath, JSON.stringify(raw));
    const before = await recursiveFiles(escaping.jobRoot);
    const escapingResult = await runWorker({
      label: "escaping",
      jobRoot: escaping.jobRoot,
      cacheRoot: escaping.cacheRoot,
      manifestName: "/job/requests/escape.json",
    });
    expect(escapingResult.exitCode, escapingResult.stderr).toBe(65);
    expect(escapingResult.stderr).toContain(
      '"exitClass":"containment-integrity"'
    );
    expect(await recursiveFiles(escaping.jobRoot)).toEqual(before);
    expect(await recursiveFiles(escaping.cacheRoot)).toEqual([]);
  });

  it("renders two compatible silent fragments in separate hardened invocations", async () => {
    const roots = await createRoots("math-worker-smoke");
    const first = await createRequest({
      jobRoot: roots.jobRoot,
      sceneNumber: 1,
      assignmentId: "smoke-a",
    });
    const second = await createRequest({
      jobRoot: roots.jobRoot,
      sceneNumber: 2,
      assignmentId: "smoke-b",
    });
    const firstRun = await runWorker({
      label: "smoke-a",
      jobRoot: roots.jobRoot,
      cacheRoot: roots.cacheRoot,
      manifestName: "/job/requests/smoke-a.json",
      inspectSecurity: true,
    });
    expect(firstRun.exitCode, firstRun.stderr).toBe(0);
    const secondRun = await runWorker({
      label: "smoke-b",
      jobRoot: roots.jobRoot,
      cacheRoot: roots.cacheRoot,
      manifestName: "/job/requests/smoke-b.json",
    });
    expect(secondRun.exitCode, secondRun.stderr).toBe(0);

    const fragments = [
      path.join(roots.jobRoot, "outputs", "scene-001.mp4"),
      path.join(roots.jobRoot, "outputs", "scene-002.mp4"),
    ];
    const probes = await Promise.all(fragments.map(probe));
    for (const media of probes) {
      const video = media.streams.filter(
        ({ codec_type }) => codec_type === "video"
      );
      expect(video).toHaveLength(1);
      expect(media.streams).not.toContainEqual(
        expect.objectContaining({ codec_type: "audio" })
      );
      expect(video[0]).toMatchObject({
        codec_name: "h264",
        pix_fmt: "yuv420p",
        width: 1920,
        height: 1080,
        avg_frame_rate: "30/1",
        nb_read_frames: "12",
      });
    }
    expect(probes[0]!.streams[0]!.profile).toBe(
      probes[1]!.streams[0]!.profile
    );
    expect(probes[0]!.streams[0]!.time_base).toBe(
      probes[1]!.streams[0]!.time_base
    );

    for (const request of [first.request, second.request]) {
      const resultRoot = path.join(
        roots.jobRoot,
        "work",
        "worker-results",
        request.assignmentId
      );
      const result = mathRenderWorkerResultSchema.parse(
        JSON.parse(await fs.readFile(path.join(resultRoot, "shard.json"), "utf8"))
      );
      const sceneResult = mathRenderWorkerSceneResultSchema.parse(
        JSON.parse(
          await fs.readFile(
            path.join(resultRoot, `${request.scenes[0]!.sceneId}.json`),
            "utf8"
          )
        )
      );
      expect(result.worker).toMatchObject({
        imageId,
        buildRevision,
        nodeVersion: expect.stringMatching(/^v22\./u),
        encoder: "libx264",
        cpuQuota: 1,
        uid: 65_534,
        gid: 65_534,
        networkInterfaces: ["lo"],
      });
      expect(sceneResult.fragment.sha256).toBe(
        await hashFile(
          path.join(
            roots.jobRoot,
            sceneResult.fragment.relativePath
          )
        )
      );
      const logRaw = await fs.readFile(
        path.join(
          roots.jobRoot,
          "work",
          "worker-logs",
          `${request.assignmentId}.jsonl`
        ),
        "utf8"
      );
      const logs = logRaw
        .trim()
        .split("\n")
        .map((line) => mathRenderWorkerLogSchema.parse(JSON.parse(line)));
      expect(logs.map(({ event }) => event)).toEqual([
        "started",
        "succeeded",
      ]);
      expect(`${JSON.stringify(result)}${logRaw}`).not.toMatch(
        /(?:\/tmp\/|narration|oauth|credential|secret|OPENAI_API_KEY)/u
      );
    }
  }, 300_000);

  it("maps SIGTERM to cancellation and promotes no partial fragment", async () => {
    const roots = await createRoots("math-worker-cancel");
    await createRequest({
      jobRoot: roots.jobRoot,
      sceneNumber: 1,
      frameCount: 1_800,
      assignmentId: "cancel-a",
      jobId: "docker-cancel",
    });
    const name = `math-worker-cancel-${process.pid}`;
    containers.push(name);
    await docker(
      containerArgs({
        name,
        jobRoot: roots.jobRoot,
        cacheRoot: roots.cacheRoot,
        manifestName: "/job/requests/cancel-a.json",
      })
    );
    await docker(["start", name]);
    const logPath = path.join(
      roots.jobRoot,
      "work",
      "worker-logs",
      "cancel-a.jsonl"
    );
    await waitForPath(logPath);
    await docker(["kill", "--signal", "SIGTERM", name]);
    const waited = await docker(["wait", name]);
    expect(Number(waited.stdout.trim())).toBe(130);
    await expect(
      fs.stat(path.join(roots.jobRoot, "outputs", "scene-001.mp4"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (await recursiveFiles(roots.jobRoot)).filter((value) =>
        /\.tmp(?:\.|$)|partial/iu.test(value)
      )
    ).toEqual([]);
    expect(
      (await recursiveFiles(roots.cacheRoot)).filter((value) =>
        /\.tmp(?:\.|$)|partial/iu.test(value)
      )
    ).toEqual([]);
    const logs = (await fs.readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => mathRenderWorkerLogSchema.parse(JSON.parse(line)));
    expect(logs.at(-1)).toMatchObject({
      event: "failed",
      exitClass: "cancellation",
    });
  }, 300_000);
});
