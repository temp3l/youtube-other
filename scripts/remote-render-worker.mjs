#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import process from "node:process";

process.umask(0o077);
const { setTimeout } = globalThis;

const activeChildren = new Set();
let abortRequested = false;
const MAX_CONCURRENCY = 4;
const CLIP_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ISO_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/u;
function isCanonicalIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const match = ISO_DATETIME_PATTERN.exec(value);
  if (!match) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime())
    && parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() + 1 === Number(match[2])
    && parsed.getUTCDate() === Number(match[3])
    && parsed.getUTCHours() === Number(match[4])
    && parsed.getUTCMinutes() === Number(match[5])
    && parsed.getUTCSeconds() === Number(match[6] ?? "0");
}

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

function isAbsoluteTraversalFreePath(value) {
  return typeof value === "string" && path.posix.isAbsolute(value) && !value.split("/").includes("..");
}

function assertWorkspacePath(workspaceRoot, value) {
  if (!isAbsoluteTraversalFreePath(value) || !safeResolve(workspaceRoot, value).startsWith(`${path.resolve(workspaceRoot)}${path.sep}`)) {
    throw new Error(`Remote manifest path escapes workspace: ${String(value)}`);
  }
}

function isContained(root, candidate) {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  return normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function validateFfmpegPathArguments(args, workspaceRoot, assetRoot) {
  for (const value of args) {
    if (/(?:^|[=,:/\\])\.{1,2}(?=[/\\])/u.test(value)) throw new Error(`Remote manifest ffmpeg argument contains relative traversal: ${value}`);
    if (/\b(?:movie|subtitles)=(?:file:)?\/|^(?:file|https?|concat|subfile|crypto|data):/iu.test(value)) throw new Error(`Remote manifest ffmpeg argument uses a forbidden path/protocol: ${value}`);
    for (const matched of value.match(/(?:^|[=,:])((?:\/)[^\s,:']+)/gu) ?? []) {
      const candidate = matched.replace(/^[=,:]/u, "");
      if (!isContained(workspaceRoot, candidate) && !isContained(assetRoot, candidate)) throw new Error(`Remote manifest ffmpeg path escapes controlled roots: ${candidate}`);
    }
    if (path.posix.isAbsolute(value) && !isContained(workspaceRoot, value) && !isContained(assetRoot, value)) {
      throw new Error(`Remote manifest ffmpeg path escapes controlled roots: ${value}`);
    }
  }
}

export function validateManifest(rawManifest, workspaceRoot, assetRoot) {
  if (!rawManifest || typeof rawManifest !== "object" || rawManifest.schemaVersion !== 2 || !Array.isArray(rawManifest.jobs)) {
    throw new Error("Invalid remote render manifest schema.");
  }
  if (!Number.isInteger(rawManifest.concurrency) || rawManifest.concurrency < 1 || rawManifest.concurrency > MAX_CONCURRENCY) {
    throw new Error(`Remote render concurrency must be between 1 and ${MAX_CONCURRENCY}.`);
  }
  if (Object.keys(rawManifest).some((key) => !["schemaVersion", "runId", "episodeId", "concurrency", "jobs", "generatedAt"].includes(key)) || typeof rawManifest.runId !== "string" || rawManifest.runId.length === 0 || typeof rawManifest.episodeId !== "string" || rawManifest.episodeId.length === 0 || !isCanonicalIsoDateTime(rawManifest.generatedAt)) throw new Error("Invalid remote render manifest fields.");
  const clipIds = new Set();
  for (const job of rawManifest.jobs) {
    if (!job || typeof job !== "object" || Object.keys(job).some((key) => !["clipId", "sequenceNumber", "inputPaths", "readyPath", "dependencies", "outputPath", "metadataPath", "logPath", "ffmpegArguments", "expectedDurationSeconds", "expectedWidth", "expectedHeight"].includes(key)) || !CLIP_ID_PATTERN.test(job.clipId ?? "") || clipIds.has(job.clipId) || !Number.isInteger(job.sequenceNumber) || job.sequenceNumber < 0 || (job.expectedDurationSeconds !== undefined && (!Number.isFinite(job.expectedDurationSeconds) || job.expectedDurationSeconds <= 0)) || (job.expectedWidth !== undefined && (!Number.isInteger(job.expectedWidth) || job.expectedWidth <= 0)) || (job.expectedHeight !== undefined && (!Number.isInteger(job.expectedHeight) || job.expectedHeight <= 0))) {
      throw new Error(`Remote manifest has an invalid or duplicate clip ID: ${String(job?.clipId)}`);
    }
    clipIds.add(job.clipId);
    if (!Array.isArray(job.inputPaths) || job.inputPaths.length === 0 || !Array.isArray(job.dependencies) || job.dependencies.length === 0 || !Array.isArray(job.ffmpegArguments)) {
      throw new Error(`Remote manifest has invalid job fields for ${job.clipId}.`);
    }
    for (const field of ["readyPath", "outputPath", "metadataPath", "logPath"]) {
      assertWorkspacePath(workspaceRoot, job[field]);
    }
    const dependencyPaths = new Set();
    for (const dependency of job.dependencies) {
      if (!dependency || Object.keys(dependency).some((key) => !["sourcePath", "contentHash", "remotePath", "sizeBytes"].includes(key)) || typeof dependency.sourcePath !== "string" || dependency.sourcePath.length === 0 || !CONTENT_HASH_PATTERN.test(dependency.contentHash ?? "") || !isAbsoluteTraversalFreePath(dependency.remotePath) || !isContained(assetRoot, dependency.remotePath) || !Number.isInteger(dependency.sizeBytes) || dependency.sizeBytes < 0) {
        throw new Error(`Remote manifest has invalid dependency for ${job.clipId}.`);
      }
      dependencyPaths.add(dependency.remotePath);
    }
    if (dependencyPaths.size !== job.dependencies.length || job.inputPaths.length !== job.dependencies.length || job.inputPaths.some((inputPath, index) => inputPath !== job.dependencies[index]?.remotePath || !isContained(assetRoot, inputPath))) {
      throw new Error(`Remote manifest dependencies do not match inputs for ${job.clipId}.`);
    }
    validateFfmpegPathArguments(job.ffmpegArguments, workspaceRoot, assetRoot);
  }
  return rawManifest;
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

export function isValidReadyMarker(job, marker) {
  if (!marker || typeof marker !== "object") {
    return false;
  }
  if (Object.keys(marker).some((key) => !["schemaVersion", "clipId", "inputPaths", "dependencyHashes", "dependencies", "generatedAt"].includes(key)) || marker.schemaVersion !== 1 || marker.clipId !== job.clipId || !isCanonicalIsoDateTime(marker.generatedAt) || !Array.isArray(marker.inputPaths) || marker.inputPaths.some((value) => typeof value !== "string") || !Array.isArray(marker.dependencyHashes) || marker.dependencyHashes.some((value) => !CONTENT_HASH_PATTERN.test(value))) {
    return false;
  }
  if (!Array.isArray(marker.dependencies)) {
    return false;
  }
  if (marker.inputPaths.length !== job.inputPaths.length || marker.dependencyHashes.length !== job.dependencies.length || marker.dependencies.length !== job.dependencies.length) return false;
  return job.inputPaths.every((inputPath, index) => inputPath === marker.inputPaths[index])
    && job.dependencies.every((dependency, index) => {
      const markerDependency = marker.dependencies[index];
      return Object.keys(markerDependency ?? {}).every((key) => ["sourcePath", "contentHash", "remotePath", "sizeBytes"].includes(key))
        && marker.dependencyHashes[index] === dependency.contentHash
        && markerDependency?.contentHash === dependency.contentHash
        && markerDependency?.remotePath === dependency.remotePath
        && markerDependency?.sizeBytes === dependency.sizeBytes && markerDependency?.sourcePath === dependency.sourcePath;
    });
}

async function verifyReadyDependencies(job) {
  for (const dependency of job.dependencies) {
    const digest = crypto.createHash("sha256").update(await fs.readFile(dependency.remotePath)).digest("hex");
    if (digest !== dependency.contentHash) throw new Error(`Remote dependency hash mismatch: ${dependency.remotePath}`);
  }
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
      await verifyReadyDependencies(job);
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
  const manifest = validateManifest(rawManifest, workspaceRoot, path.resolve(path.dirname(path.dirname(workspaceRoot)), "assets"));
  const jobs = manifest.jobs;
  const concurrency = manifest.concurrency;
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

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
