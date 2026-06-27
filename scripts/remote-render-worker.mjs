#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

process.umask(0o077);
const { setTimeout } = globalThis;

const activeChildren = new Set();
let abortRequested = false;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function safeResolve(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(root, target);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`) && resolvedTarget !== resolvedRoot) {
    throw new Error(`Unsafe path outside workspace: ${target}`);
  }
  return resolvedTarget;
}

async function waitForFile(filePath, timeoutMs = 30 * 60 * 1000) {
  const startedAt = Date.now();
  while (!abortRequested) {
    try {
      await fs.access(filePath);
      return;
    } catch {
      // Keep waiting until rsync uploads the input file.
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for input file: ${filePath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Aborted while waiting for input file: ${filePath}`);
}

async function waitForInputs(workspaceRoot, inputPaths) {
  for (const inputPath of inputPaths ?? []) {
    const resolved = safeResolve(workspaceRoot, inputPath);
    await waitForFile(resolved);
  }
}

async function validateOutput(filePath, options = {}) {
  const stats = await fs.stat(filePath);
  const probe = await new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`ffprobe exited with code ${exitCode}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number.parseFloat(probe.format?.duration ?? video?.duration ?? "0");
  const issues = [];
  if (stats.size <= 0) {
    issues.push("Empty output file.");
  }
  if (!video) {
    issues.push("Missing video stream.");
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    issues.push("Invalid duration.");
  }
  if (options.expectedWidth && video?.width !== options.expectedWidth) {
    issues.push(`Unexpected width ${video?.width}; expected ${options.expectedWidth}.`);
  }
  if (options.expectedHeight && video?.height !== options.expectedHeight) {
    issues.push(`Unexpected height ${video?.height}; expected ${options.expectedHeight}.`);
  }
  if (typeof options.expectedDurationSeconds === "number") {
    const tolerance = options.durationToleranceSeconds ?? 0.5;
    if (Math.abs(duration - options.expectedDurationSeconds) > tolerance) {
      issues.push(`Unexpected duration ${duration.toFixed(3)}s.`);
    }
  }
  return {
    valid: issues.length === 0,
    durationSeconds: duration,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    issues,
  };
}

async function renderClip(workspaceRoot, job) {
  const outputPath = safeResolve(workspaceRoot, job.outputPath);
  const logPath = safeResolve(workspaceRoot, job.logPath);
  const metadataPath = safeResolve(workspaceRoot, job.metadataPath);
  await waitForInputs(workspaceRoot, job.inputPaths);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  const startedAt = Date.now();
  const stderr = [];
  const child = spawn("ffmpeg", job.ffmpegArguments, {
    cwd: workspaceRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });
  activeChildren.add(child);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk);
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  }).finally(() => {
    activeChildren.delete(child);
  });
  await fs.writeFile(logPath, stderr.join(""), "utf8");
  const result = {
    clipId: job.clipId,
    sequenceNumber: job.sequenceNumber,
    attempt: 1,
    exitCode,
    durationMs: Date.now() - startedAt,
    outputSizeBytes: 0,
    status: "failed",
  };
  if (exitCode === 0 && await fs.stat(outputPath).then((stats) => stats.size > 0).catch(() => false)) {
    const validation = await validateOutput(outputPath, job);
    result.outputSizeBytes = (await fs.stat(outputPath)).size;
    if (validation.valid) {
      result.status = "succeeded";
    } else {
      result.status = "failed";
      result.errorMessage = validation.issues.join("; ");
    }
  } else if (exitCode !== 0) {
    result.errorMessage = `ffmpeg exited with code ${exitCode}`;
  }
  await fs.writeFile(metadataPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    throw new Error("Usage: remote-render-worker.mjs <manifest-path>");
  }
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    throw new Error("Remote worker must not run as root.");
  }
  const rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const workspaceRoot = path.resolve(path.dirname(path.dirname(manifestPath)));
  if (!rawManifest || typeof rawManifest !== "object" || !Array.isArray(rawManifest.jobs)) {
    throw new Error("Invalid remote render manifest.");
  }
  const jobs = rawManifest.jobs;
  const concurrency = Number.isInteger(rawManifest.concurrency) && rawManifest.concurrency > 0 ? rawManifest.concurrency : 1;
  const queue = [...jobs];
  const results = [];
  let failed = false;
  const pool = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) {
        return;
      }
      try {
        const result = await renderClip(workspaceRoot, job);
        results.push(result);
        if (result.status !== "succeeded") {
          failed = true;
        }
      } catch (error) {
        failed = true;
        const failure = {
          clipId: job.clipId,
          sequenceNumber: job.sequenceNumber,
          attempt: 1,
          exitCode: 1,
          durationMs: 0,
          outputSizeBytes: 0,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        };
        results.push(failure);
        await fs.writeFile(
          safeResolve(workspaceRoot, job.metadataPath),
          `${JSON.stringify(failure, null, 2)}\n`,
          "utf8"
        ).catch(() => {});
      }
    }
  });
  const shutdown = () => {
    abortRequested = true;
    for (const child of activeChildren) {
      child.kill("SIGTERM");
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await Promise.all(pool);
  await fs.writeFile(
    path.join(path.dirname(manifestPath), "results.json"),
    `${JSON.stringify(results, null, 2)}\n`,
    "utf8"
  );
  if (failed || abortRequested) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
