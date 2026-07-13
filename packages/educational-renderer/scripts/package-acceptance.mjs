import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function required(executable, args, options = {}) {
  const result = await run(executable, args, options);
  if (result.code !== 0) {
    throw new Error(`${executable} ${args.join(" ")} exited ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "educational-renderer-package-"));
try {
  const sourceManifest = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
  assert(sourceManifest.packageManager === "pnpm@10.16.0", "Source package-manager policy is missing.");
  const archiveDirectory = path.join(temporaryRoot, "archive");
  const consumer = path.join(temporaryRoot, "consumer");
  await fs.mkdir(archiveDirectory);
  await fs.mkdir(consumer);

  await required("pnpm", ["pack", "--pack-destination", archiveDirectory], { cwd: packageRoot });
  const archives = (await fs.readdir(archiveDirectory)).filter((file) => file.endsWith(".tgz"));
  assert(archives.length === 1, `Expected one package archive, found ${archives.length}.`);
  const archive = path.join(archiveDirectory, archives[0]);
  const listing = await required("tar", ["-tzvf", archive]);
  for (const expected of [
    "package/package.json",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/index.js.map",
    "package/dist/contracts.js",
    "package/dist/contracts.d.ts",
    "package/dist/errors.js",
    "package/dist/errors.d.ts",
    "package/bin/educational-renderer.js",
  ]) assert(listing.stdout.includes(expected), `Archive is missing ${expected}.`);
  assert(!listing.stdout.includes("package/dist/src/"), "Archive contains stale dist/src output.");
  const binLine = listing.stdout.split("\n").find((line) => line.includes("package/bin/educational-renderer.js"));
  assert(binLine?.startsWith("-rwxr-xr-x"), "Archive bin is not executable.");

  await fs.writeFile(path.join(consumer, "package.json"), JSON.stringify({ private: true, type: "module", packageManager: "pnpm@10.16.0" }, null, 2));
  const store = (await required("pnpm", ["store", "path", "--silent"], { cwd: repositoryRoot })).stdout.trim();
  await required("pnpm", ["add", "--offline", "--store-dir", store, archive, "typescript@5.9.2"], { cwd: consumer });

  await fs.writeFile(path.join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      skipLibCheck: false,
      noEmit: true,
    },
    include: ["consumer.ts"],
  }, null, 2));
  await fs.writeFile(path.join(consumer, "consumer.ts"), [
    'import { createEducationalRenderer, type EducationalRenderer } from "@mediaforge/educational-renderer";',
    'import { renderRequestSchema, type RenderRequest } from "@mediaforge/educational-renderer/contracts";',
    'import { RendererError, type RendererErrorData } from "@mediaforge/educational-renderer/errors";',
    'const factory: typeof createEducationalRenderer = createEducationalRenderer;',
    'const renderer: EducationalRenderer | undefined = undefined;',
    'const request: RenderRequest | undefined = undefined;',
    'const error: RendererErrorData = new RendererError({ code: "INTERNAL_ERROR", message: "test" }).data;',
    'void [factory, renderer, request, error, renderRequestSchema];',
  ].join("\n"));
  await required(path.join(consumer, "node_modules", ".bin", "tsc"), ["-p", "tsconfig.json"], { cwd: consumer });

  const runtime = await required(process.execPath, ["--input-type=module", "-e", [
    'import * as root from "@mediaforge/educational-renderer";',
    'import * as contracts from "@mediaforge/educational-renderer/contracts";',
    'import * as errors from "@mediaforge/educational-renderer/errors";',
    'if (JSON.stringify(Object.keys(root)) !== JSON.stringify(["createEducationalRenderer"])) process.exit(10);',
    'if (!contracts.renderRequestSchema || !errors.RendererError) process.exit(11);',
  ].join("\n")], { cwd: consumer });
  assert(runtime.stderr === "", `Runtime import wrote stderr: ${runtime.stderr}`);

  const installedPackageRoot = path.join(consumer, "node_modules", "@mediaforge", "educational-renderer");
  const installedManifest = JSON.parse(await fs.readFile(path.join(installedPackageRoot, "package.json"), "utf8"));
  assert(installedManifest.main === "./dist/index.js", "Installed main does not match built output.");
  assert(installedManifest.types === "./dist/index.d.ts", "Installed types do not match built output.");
  assert(installedManifest.engines?.node === ">=22.0.0", "Installed Node engine metadata is missing.");
  const installedBin = path.join(consumer, "node_modules", ".bin", "educational-renderer");
  assert(((await fs.stat(installedBin)).mode & 0o111) !== 0, "Package-manager-linked bin is not executable.");
  assert((await fs.readFile(path.join(installedPackageRoot, "bin", "educational-renderer.js"), "utf8")).startsWith("#!/usr/bin/env node\n"), "Installed bin has no shebang.");
  const help = await run(installedBin, ["--help"], { cwd: consumer });
  assert(help.code === 0, `Installed --help exited ${help.code}.`);
  assert(help.stderr === "", `Installed --help wrote stderr: ${help.stderr}`);
  assert(help.stdout.includes("Usage: educational-renderer"), "Installed --help output is incomplete.");

  const fixture = path.join(installedPackageRoot, "fixtures", "linear-equations");
  const render = await required(installedBin, [
    "render", "--plan", path.join(fixture, "visual-plan.json"), "--profile", "preview",
    "--output", "preview", "--audio", path.join(fixture, "narration.wav"),
    "--subtitles", path.join(fixture, "subtitles.vtt"), "--json",
  ], { cwd: consumer });
  const result = JSON.parse(render.stdout);
  assert(result.status === "completed", `Installed preview status is ${result.status}.`);
  assert(render.stderr === "", `Installed preview wrote stderr: ${render.stderr}`);
  assert(result.scenes.length >= 3, "Installed preview did not render representative segments.");

  const finalProbe = JSON.parse((await required("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", result.output.videoPath])).stdout);
  const streamTypes = finalProbe.streams.map((stream) => stream.codec_type);
  assert(streamTypes.includes("video"), "Installed preview has no video stream.");
  assert(streamTypes.includes("audio"), "Installed preview has no audio stream.");
  assert(streamTypes.includes("subtitle"), "Installed preview has no subtitle stream.");
  for (const scene of [result.scenes[0], result.scenes[Math.floor(result.scenes.length / 2)], result.scenes.at(-1)]) {
    const probe = JSON.parse((await required("ffprobe", ["-v", "error", "-show_streams", "-of", "json", scene.outputPath])).stdout);
    assert(probe.streams.some((stream) => stream.codec_type === "video"), `Scene ${scene.sceneId} has no video stream.`);
  }

  process.stdout.write(`packed-consumer: ok (${result.scenes.length} scenes; video/audio/subtitle verified)\n`);
} finally {
  const resolved = path.resolve(temporaryRoot);
  if (resolved.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) await fs.rm(resolved, { recursive: true, force: true });
}
