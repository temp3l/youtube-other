#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { HybridFFmpegVideoRenderer } from "@mediaforge/rendering";
import { scenePlanSchema } from "@mediaforge/domain";

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args.set(value.slice(2), "true");
      continue;
    }
    args.set(value.slice(2), next);
    index += 1;
  }
  return args;
}

function parseBool(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  return value === "true" || value === "1";
}

async function main() {
  const args = parseArgs(process.argv);
  const episodeDir = path.resolve(
    args.get("episode-dir") ?? "episodes/009-mary-gloria-the-christmas-doll"
  );
  const scenePlanPath = path.join(episodeDir, "shared", "scenes.json");
  const outputDir = path.resolve(
    args.get("output-dir") ?? path.join(episodeDir, "en", "full", "video")
  );
  const imageDir = path.resolve(
    args.get("image-dir") ?? path.join(episodeDir, "images", "generated")
  );
  const sceneAudioDir = path.resolve(
    args.get("audio-dir") ?? path.join(episodeDir, "en", "full", "audio", "segments")
  );
  const captionBurnIn = parseBool(args.get("caption-burn-in"), false);
  const captionsPath = args.get("captions-path") ?? undefined;
  const scenePlan = scenePlanSchema.parse(
    JSON.parse(await fs.readFile(scenePlanPath, "utf8"))
  );
  const remoteRenderEnabled = parseBool(
    process.env.REMOTE_RENDER_ENABLED,
    false
  );
  const renderer = new HybridFFmpegVideoRenderer({
    enabled: remoteRenderEnabled,
    host: process.env.REMOTE_RENDER_HOST ?? "2.24.81.148",
    user: process.env.REMOTE_RENDER_USER ?? "box",
    port: Number.parseInt(process.env.REMOTE_RENDER_PORT ?? "22", 10),
    baseDir:
      process.env.REMOTE_RENDER_BASE_DIR ?? "/home/box/youtube-render-worker",
    concurrency: Number.parseInt(
      process.env.REMOTE_RENDER_CONCURRENCY ?? "1",
      10
    ),
    connectTimeoutSeconds: Number.parseInt(
      process.env.REMOTE_RENDER_CONNECT_TIMEOUT_SECONDS ?? "10",
      10
    ),
    commandTimeoutSeconds: Number.parseInt(
      process.env.REMOTE_RENDER_COMMAND_TIMEOUT_SECONDS ?? "1800",
      10
    ),
    maxRetries: Number.parseInt(process.env.REMOTE_RENDER_MAX_RETRIES ?? "2", 10),
    fallbackToLocal: parseBool(
      process.env.REMOTE_RENDER_FALLBACK_TO_LOCAL,
      true
    ),
    keepFiles: parseBool(process.env.REMOTE_RENDER_KEEP_FILES, false),
    verifyHostKey: parseBool(process.env.REMOTE_RENDER_VERIFY_HOST_KEY, true),
    knownHostsFile: process.env.REMOTE_RENDER_KNOWN_HOSTS_FILE || undefined,
    sshPrivateKey: process.env.REMOTE_RENDER_SSH_PRIVATE_KEY || undefined,
    uploadMethod: process.env.REMOTE_RENDER_UPLOAD_METHOD ?? "rsync",
    localRenderConcurrency: process.env.LOCAL_RENDER_CONCURRENCY
      ? Number.parseInt(process.env.LOCAL_RENDER_CONCURRENCY, 10)
      : 1,
    cleanupMaxAgeHours: Number.parseInt(
      process.env.REMOTE_RENDER_CLEANUP_MAX_AGE_HOURS ?? "24",
      10
    ),
  });

  process.stdout.write(
    `Rendering ${episodeDir} with remote=${remoteRenderEnabled}\n`
  );
  const result = await renderer.render(
    {
      episodeDir,
      scenePlan,
      outputDir,
      renderProfile: {
        id: "youtube",
        label: "youtube",
        width: 1920,
        height: 1080,
        fps: 30,
        aspectRatio: "16:9",
        burnCaptions: captionBurnIn,
      },
      captionBurnIn,
      ...(captionsPath ? { captionsPath } : {}),
      sceneAudioDir,
      imageDir,
    },
    new AbortController().signal
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
