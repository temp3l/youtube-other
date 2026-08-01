import {
  bindMathPortableScene,
  bindMathSceneShardRequest,
  createMathFragmentEncoding,
  createMathRenderToolchainIdentity,
} from "@mediaforge/math-rendering";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildMathRemoteCleanupScript,
  buildMathShardDownloadInvocation,
  buildMathShardUploadInvocation,
  buildStrictSshArgs,
  checkMathRemoteWorker,
  createMathRemoteJobId,
  deployMathRemoteWorker,
  parseMathRemoteLogs,
  parseMathRemoteSettings,
  parseMathRemoteStatus,
  promoteDownloadedMathFragment,
  quoteRemoteShellValue,
  readMathRemoteDeploymentReceipt,
  stageMathRemoteShard,
  type CommandInvocation,
  type CommandResult,
  type MathRemoteProcessExecutor,
  type MathRemoteSettings,
} from "./math-render-remote.js";
import { loadRuntimeConfig } from "@mediaforge/config";

vi.mock("@mediaforge/config", async () =>
  import("../../../packages/config/src/index.js")
);
vi.mock("@mediaforge/math-rendering", async () =>
  import("../../../packages/math-rendering/src/index.js")
);

const imageA = `sha256:${"a".repeat(64)}`;
const imageB = `sha256:${"b".repeat(64)}`;
const revision = "c".repeat(40);
const jobId = "math-20260726t120000z-12345678-abcd-4abc-8abc-123456789abc";

async function settings(
  overrides: Parameters<typeof loadRuntimeConfig>[0] = {}
): Promise<MathRemoteSettings> {
  return parseMathRemoteSettings(
    await loadRuntimeConfig({
      remoteRenderEnabled: true,
      remoteRenderHost: "renderer.example",
      remoteRenderUser: "worker",
      remoteRenderPort: 2202,
      remoteRenderBaseDir: "/srv/mediaforge worker",
      remoteRenderVerifyHostKey: true,
      remoteRenderKnownHostsFile: "/tmp/known hosts",
      remoteRenderSshPrivateKey: "/tmp/private key",
      mathRenderExecutor: "hybrid",
      mathRemoteImageId: imageA,
      ...overrides,
    })
  );
}

class FakeExecutor implements MathRemoteProcessExecutor {
  readonly invocations: CommandInvocation[] = [];

  constructor(
    private readonly respond: (
      invocation: CommandInvocation
    ) => CommandResult = (invocation) => {
      if (
        invocation.command === "ssh" &&
        invocation.args.at(-1)?.includes("docker info")
      ) {
        return { status: 0, stdout: "x86_64\n", stderr: "" };
      }
      if (invocation.command === "git") {
        return { status: 0, stdout: `${revision}\n`, stderr: "" };
      }
      if (
        invocation.command === "docker" &&
        (invocation.args[0] === "build" || invocation.args[0] === "image")
      ) {
        return { status: 0, stdout: `${imageA}\n`, stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    }
  ) {}

  async run(invocation: CommandInvocation): Promise<CommandResult> {
    this.invocations.push(invocation);
    return this.respond(invocation);
  }
}

function svgRequest(svg: Uint8Array) {
  const svgHash = createHash("sha256").update(svg).digest("hex");
  const scene = bindMathPortableScene({
    sceneId: "scene-001",
    order: 0,
    startFrame: 0,
    endFrame: 12,
    expectedFrameCount: 12,
    svgRelativePath: `inputs/${svgHash}.svg`,
    svgHash,
    minimumGlyphPx: 48,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    animation: {
      mode: "progressive-chalk-reveal",
      rendererVersion: "math-semantic-chalk.v7",
      cues: [],
      activity: "standard",
    },
    fragmentRelativePath: "output/scene-001.mp4",
    encoding: createMathFragmentEncoding("draft"),
    toolchain: createMathRenderToolchainIdentity(imageA),
  });
  return {
    svgHash,
    request: bindMathSceneShardRequest({
      artifactVersion: "math-scene-shard-request.v1",
      jobId,
      planHash: "d".repeat(64),
      assignmentId: "remote-a",
      workRelativePath: "work",
      scenes: [scene],
    }),
  };
}

describe("math remote transport configuration", () => {
  it("quotes spaces and apostrophes while keeping strict host keys", async () => {
    const remote = await settings();
    expect(quoteRemoteShellValue("/srv/worker's jobs")).toBe(
      `'/srv/worker'\"'\"'s jobs'`
    );
    expect(buildStrictSshArgs(remote.transport)).toEqual(
      expect.arrayContaining([
        "StrictHostKeyChecking=yes",
        "UserKnownHostsFile=/tmp/known hosts",
        "/tmp/private key",
      ])
    );
    expect(createMathRemoteJobId(new Date("2026-07-26T12:00:00.000Z"))).toMatch(
      /^math-20260726t120000z-/u
    );
  });

  it("rejects malicious connection fields, traversal, and disabled host keys", async () => {
    await expect(
      settings({ remoteRenderHost: "host;touch pwned" })
    ).rejects.toThrow();
    await expect(
      settings({ remoteRenderUser: "worker@attacker" })
    ).rejects.toThrow();
    await expect(
      settings({ remoteRenderBaseDir: "/srv/../root" })
    ).rejects.toThrow(/contained/u);
    const remote = await settings();
    expect(() =>
      buildStrictSshArgs({
        ...remote.transport,
        verifyHostKey: false,
      })
    ).toThrow(/host-key/u);
    expect(() =>
      buildMathShardUploadInvocation(remote, "/tmp/stage", "../job")
    ).toThrow();
  });
});

describe("math remote deployment and preflight", () => {
  it("deploys by resumable archive and writes a redacted nonsecret identity receipt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-deploy-test-"));
    const remote = await settings();
    const executor = new FakeExecutor();
    const receipt = await deployMathRemoteWorker({
      settings: remote,
      repositoryRoot: root,
      executor,
      now: new Date("2026-07-26T12:00:00.000Z"),
    });

    expect(receipt).toMatchObject({
      imageId: imageA,
      architecture: "linux/amd64",
      repositoryRevision: revision,
    });
    expect(
      await readMathRemoteDeploymentReceipt(root, remote.transport)
    ).toEqual(receipt);
    expect(
      executor.invocations.find((item) => item.command === "rsync")?.args
    ).toEqual(expect.arrayContaining(["--partial", "--append-verify"]));
    expect(
      executor.invocations.find(
        (item) => item.command === "docker" && item.args[0] === "save"
      )?.args
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          path.join(root, ".cache", "math-pipeline", "state", "remote-deploy")
        ),
      ])
    );
    const serializedReceipt = JSON.stringify(receipt);
    expect(receipt.target).toBe(
      `sha256:${createHash("sha256")
        .update("worker@renderer.example:2202")
        .digest("hex")}`
    );
    expect(serializedReceipt).not.toContain("renderer.example");
    expect(serializedReceipt).not.toContain("worker@");
    expect(serializedReceipt).not.toContain("/srv/mediaforge worker");
    expect(serializedReceipt).not.toContain("/tmp/private key");
    expect(serializedReceipt).not.toContain(root);
  });

  it("fails closed on configured build and local/remote image mismatches", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-mismatch-test-")
    );
    const configuredMismatch = await settings({ mathRemoteImageId: imageB });
    await expect(
      deployMathRemoteWorker({
        settings: configuredMismatch,
        repositoryRoot: root,
        executor: new FakeExecutor(),
      })
    ).rejects.toThrow(/configured immutable ID/u);

    const remote = await settings();
    await deployMathRemoteWorker({
      settings: remote,
      repositoryRoot: root,
      executor: new FakeExecutor(),
    });
    const preflight = new FakeExecutor((invocation) => {
      if (invocation.command === "ssh") {
        return { status: 0, stdout: `${imageB}\n`, stderr: "" };
      }
      if (invocation.command === "docker" && invocation.args[0] === "image") {
        return { status: 0, stdout: `${imageA}\n`, stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    });
    await expect(
      checkMathRemoteWorker({
        settings: remote,
        repositoryRoot: root,
        executor: preflight,
      })
    ).rejects.toThrow(/image IDs differ/u);
    expect(
      preflight.invocations
        .slice(0, 2)
        .map((item) => item.command)
        .sort()
    ).toEqual(["docker", "ssh"]);
  });
});

describe("math shard transfer and inspection", () => {
  it("stages only content-addressed SVGs and uses resumable partial transfer", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-shard-test-"));
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"/>'
    );
    const { request, svgHash } = svgRequest(svg);
    const jobRoot = await stageMathRemoteShard({
      stagingRoot: root,
      request,
      svgInputs: new Map([[svgHash, svg]]),
    });
    const remote = await settings();
    const upload = buildMathShardUploadInvocation(remote, jobRoot, jobId);
    const download = buildMathShardDownloadInvocation(
      remote,
      jobId,
      path.join(root, "partial")
    );

    expect(await fs.readdir(path.join(jobRoot, "inputs"))).toEqual([
      `${svgHash}.svg`,
    ]);
    expect(JSON.stringify(upload.args)).not.toMatch(/\.(?:wav|mp3|png)/u);
    expect(upload.args).toEqual(
      expect.arrayContaining([
        "--partial-dir=.rsync-partial",
        "--delay-updates",
      ])
    );
    expect(download.args).toEqual(
      expect.arrayContaining(["--partial", "--append-verify", "--exclude=*"])
    );
  });

  it("rejects interrupted fragments and promotes only exact bytes", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "math-download-test-")
    );
    const partial = path.join(root, "scene.mp4.partial");
    const final = path.join(root, "scene.mp4");
    await fs.writeFile(partial, "short");
    await expect(
      promoteDownloadedMathFragment({
        partialPath: partial,
        finalPath: final,
        expected: { sha256: "e".repeat(64), byteLength: 100 },
      })
    ).rejects.toThrow(/hash or byte length/u);
    await expect(fs.stat(partial)).resolves.toBeDefined();
    await expect(fs.stat(final)).rejects.toMatchObject({ code: "ENOENT" });

    const complete = Buffer.from("complete fragment");
    await fs.writeFile(partial, complete);
    await promoteDownloadedMathFragment({
      partialPath: partial,
      finalPath: final,
      expected: {
        sha256: createHash("sha256").update(complete).digest("hex"),
        byteLength: complete.byteLength,
      },
    });
    await expect(fs.readFile(final)).resolves.toEqual(complete);
  });

  it.each([
    ["queued", "queued"],
    ["running", "running"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["fallback", "fallback"],
  ] as const)("parses %s status", (state, expected) => {
    expect(
      parseMathRemoteStatus(
        jobId,
        JSON.stringify({ jobId, state, sceneCount: 1 })
      ).state
    ).toBe(expected);
  });

  it("classifies malformed and missing status and validates structured logs", () => {
    expect(parseMathRemoteStatus(jobId, "{").state).toBe("malformed");
    expect(parseMathRemoteStatus(jobId, undefined).state).toBe("missing");
    const line = JSON.stringify({
      artifactVersion: "math-render-worker-log.v1",
      event: "started",
      jobId,
      assignmentId: "remote-a",
      requestHash: "f".repeat(64),
      exitClass: "success",
      sceneCount: 1,
    });
    expect(parseMathRemoteLogs(`${line}\n`)).toEqual([line]);
    expect(() => parseMathRemoteLogs('{"secret":"value"}')).toThrow();
  });
});

describe("guarded math cleanup", () => {
  it("removes only an old recognized job and preserves cache, running, and unknown paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-cleanup-test-"));
    const jobs = path.join(root, "jobs");
    const eligible = path.join(jobs, jobId);
    const runningId =
      "math-20260726t120001z-12345678-abcd-4abc-8abc-123456789abc";
    const running = path.join(jobs, runningId);
    const unknown = path.join(jobs, "unknown-entry");
    await Promise.all([
      fs.mkdir(path.join(eligible, "metadata"), { recursive: true }),
      fs.mkdir(path.join(running, "metadata"), { recursive: true }),
      fs.mkdir(unknown, { recursive: true }),
      fs.mkdir(path.join(root, "cache"), { recursive: true }),
    ]);
    await Promise.all([
      fs.writeFile(
        path.join(eligible, "metadata", "request.json"),
        JSON.stringify({
          artifactVersion: "math-scene-shard-request.v1",
          jobId,
        })
      ),
      fs.writeFile(
        path.join(running, "metadata", "request.json"),
        JSON.stringify({
          artifactVersion: "math-scene-shard-request.v1",
          jobId: runningId,
        })
      ),
      fs.writeFile(path.join(running, "running"), "running"),
    ]);
    const old = new Date(Date.now() - 10 * 60_000);
    await Promise.all([
      fs.utimes(eligible, old, old),
      fs.utimes(running, old, old),
      fs.utimes(unknown, old, old),
    ]);

    execFileSync(
      "bash",
      ["-lc", buildMathRemoteCleanupScript(), "--", root, "1"],
      { stdio: "pipe" }
    );

    await expect(fs.stat(eligible)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(running)).resolves.toBeDefined();
    await expect(fs.stat(unknown)).resolves.toBeDefined();
    await expect(fs.stat(path.join(root, "cache"))).resolves.toBeDefined();
    expect(buildMathRemoteCleanupScript()).not.toContain('rm -rf -- "$jobs"');
    expect(buildMathRemoteCleanupScript()).not.toContain('rm -rf -- "$base"');
  });
});
