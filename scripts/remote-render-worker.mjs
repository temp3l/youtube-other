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

function createLifecycleMetadata(job, status, extra = {}) {
  return {
    clipId: job.clipId,
    sequenceNumber: job.sequenceNumber,
    attempt: 1,
    status,
    ...extra,
  };
}

async function writeLifecycleMetadata(workspaceRoot, job, status, extra = {}) {
  const metadataPath = safeResolve(workspaceRoot, job.metadataPath);
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(createLifecycleMetadata(job, status, extra), null, 2)}\n`,
    "utf8"
  );
}

function isValidReadyMarker(job, marker) {
  if (!marker || typeof marker !== "object") {
    return false;
  }
  if (marker.clipId !== job.clipId || !Array.isArray(marker.inputPaths)) {
    return false;
  }
  if (!Array.isArray(marker.dependencies)) {
    return false;
  }
  return job.inputPaths.every((inputPath) => marker.inputPaths.includes(inputPath));
}

async function tryClaimReadyJob(workspaceRoot, pendingJobs) {
  for (const [clipId, job] of pendingJobs) {
    const metadataPath = safeResolve(workspaceRoot, job.metadataPath);
    const existingMetadata = await fs.readFile(metadataPath, "utf8").then((raw) => JSON.parse(raw)).catch(() => null);
    if (existingMetadata?.status === "failed" || existingMetadata?.status === "succeeded") {
      pendingJobs.delete(clipId);
      continue;
    }
    const readyPath = safeResolve(workspaceRoot, job.readyPath ?? path.join("ready", `${clipId}.json`));
    try {
      const rawReady = JSON.parse(await fs.readFile(readyPath, "utf8"));
      if (!isValidReadyMarker(job, rawReady)) {
        continue;
      }
      if (!pendingJobs.has(clipId)) {
        continue;
      }
      pendingJobs.delete(clipId);
      return { job, readyMarker: rawReady };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      continue;
    }
  }
  return null;
}

async function waitForClaimableJob(workspaceRoot, pendingJobs, timeoutMs = 30 * 60 * 1000) {
  const startedAt = Date.now();
  while (!abortRequested) {
    const claim = await tryClaimReadyJob(workspaceRoot, pendingJobs);
    if (claim) {
      return claim;
    }
    if (pendingJobs.size === 0) {
      return null;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for clip readiness: ${[...pendingJobs.keys()].join(", ")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
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

async function renderClip(workspaceRoot, job, readyMarker) {
  const outputPath = safeResolve(workspaceRoot, job.outputPath);
  const logPath = safeResolve(workspaceRoot, job.logPath);
  const metadataPath = safeResolve(workspaceRoot, job.metadataPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await writeLifecycleMetadata(workspaceRoot, job, "queued", {
    readyAt: readyMarker.generatedAt ?? new Date().toISOString(),
  });
  const startedAt = Date.now();
  await writeLifecycleMetadata(workspaceRoot, job, "rendering", {
    readyAt: readyMarker.generatedAt ?? new Date().toISOString(),
    startedAt: new Date(startedAt).toISOString(),
  });
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
  const result = createLifecycleMetadata(job, "failed", {
    exitCode,
    durationMs: Date.now() - startedAt,
    outputSizeBytes: 0,
    readyAt: readyMarker.generatedAt ?? new Date().toISOString(),
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
  });
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
  const pendingJobs = new Map(jobs.map((job) => [job.clipId, job]));
  const results = [];
  let failed = false;
  const pool = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (pendingJobs.size > 0) {
      const claim = await waitForClaimableJob(workspaceRoot, pendingJobs);
      if (!claim) {
        return;
      }
      const { job, readyMarker } = claim;
      try {
        const result = await renderClip(workspaceRoot, job, readyMarker);
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
        await writeLifecycleMetadata(workspaceRoot, job, "failed", {
          exitCode: 1,
          durationMs: 0,
          outputSizeBytes: 0,
          errorMessage: failure.errorMessage,
          completedAt: new Date().toISOString(),
        }).catch(() => {});
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
  const summaryResults = await Promise.all(
    jobs.map(async (job) => {
      const metadataPath = safeResolve(workspaceRoot, job.metadataPath);
      return await fs.readFile(metadataPath, "utf8").then((raw) => JSON.parse(raw)).catch(() => {
        return results.find((result) => result.clipId === job.clipId) ?? null;
      });
    })
  );
  await fs.writeFile(
    path.join(path.dirname(manifestPath), "results.json"),
    `${JSON.stringify(summaryResults.filter(Boolean), null, 2)}\n`,
    "utf8"
  );
  if (failed || abortRequested) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
