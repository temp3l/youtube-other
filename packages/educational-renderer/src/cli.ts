import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Command } from "commander";
import { createEducationalRenderer } from "./api/create-educational-renderer.js";
import { encoderSchema, profileNameSchema, visualPlanSchema, type RenderProfileInput } from "./contracts.js";
import { RendererError, toRendererErrorData } from "./errors.js";

const program = new Command();
const abortController = new AbortController();
process.once("SIGINT", () => abortController.abort());
process.once("SIGTERM", () => abortController.abort());

const list = (value: string): string[] => value.split(",").map((item) => item.trim()).filter(Boolean);
const verboseEnabled = (): boolean => process.argv.includes("--verbose");

async function renderer() {
  const cwd = process.cwd();
  return createEducationalRenderer({ workspaceDirectory: cwd, cacheDirectory: path.join(cwd, ".cache", "educational-renderer"), temporaryDirectory: path.join(cwd, ".artifacts", "educational-renderer-tmp") });
}

async function plan(filePath: string) {
  try { return visualPlanSchema.parse(JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"))); }
  catch (cause) { throw new RendererError({ code: "INVALID_VISUAL_PLAN", message: "The visual-plan file is not valid." }, { cause }); }
}

function output(value: unknown, json: boolean): void { process.stdout.write(`${json ? JSON.stringify(value, null, 2) : human(value)}\n`); }
function human(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value);
  const record = value as Record<string, unknown>;
  if (typeof record["status"] === "string") return `Status: ${record["status"]}${record["output"] && typeof record["output"] === "object" ? `\nOutput: ${String((record["output"] as Record<string, unknown>)["videoPath"] ?? "")}` : ""}`;
  if (typeof record["valid"] === "boolean") return record["valid"] ? "Visual plan is valid." : `Visual plan is invalid: ${JSON.stringify(record["errors"])}`;
  return JSON.stringify(value, null, 2);
}

function profile(options: { profile: string; encoder?: string }): RenderProfileInput {
  const profileResult = profileNameSchema.safeParse(options.profile);
  const encoderResult = options.encoder === undefined ? undefined : encoderSchema.safeParse(options.encoder);
  if (!profileResult.success || encoderResult && !encoderResult.success) throw new RendererError({ code: "INVALID_RENDER_PROFILE", message: "The render profile is not valid." });
  return encoderResult ? { name: profileResult.data, encoder: encoderResult.data } : profileResult.data;
}

function renderOptions(command: Command): void {
  command.requiredOption("--plan <path>", "visual-plan JSON file")
    .requiredOption("--profile <name>", "preview, draft, youtube-full, or youtube-short")
    .requiredOption("--output <path>", "output directory")
    .option("--encoder <name>", "libx264, h264_vaapi, or h264_qsv")
    .option("--audio <path>").option("--subtitles <path>").option("--json").option("--verbose")
    .option("--keep-temporary-files").option("--overwrite", "replace an existing final lesson.mp4");
}

async function requestFrom(options: Record<string, unknown>) {
  const visualPlan = await plan(String(options["plan"]));
  return {
    requestVersion: "1" as const, jobId: visualPlan.lessonId, visualPlan,
    profile: profile({ profile: String(options["profile"]), ...(options["encoder"] ? { encoder: String(options["encoder"]) } : {}) }),
    outputDirectory: String(options["output"]),
    ...(options["audio"] ? { audio: { path: path.resolve(String(options["audio"])), volume: 1 } } : {}),
    ...(options["subtitles"] ? { subtitles: { path: path.resolve(String(options["subtitles"])), mode: "embedded" as const } } : {}),
    execution: { keepTemporaryFiles: Boolean(options["keepTemporaryFiles"]), overwrite: Boolean(options["overwrite"]) },
  };
}

program.name("educational-renderer").description("Deterministic, isolated Linux educational video renderer").version("0.1.0").option("--verbose", "show stack traces");
program.command("validate").requiredOption("--plan <path>").requiredOption("--profile <name>").option("--json").action(async (options) => {
  const result = await (await renderer()).validate({ requestVersion: "1", visualPlan: await plan(options.plan), profile: profile(options) });
  output(result, Boolean(options.json)); process.exitCode = result.valid ? 0 : 3;
});
const render = program.command("render"); renderOptions(render); render.action(async (options) => {
  const result = await (await renderer()).render(await requestFrom(options), { signal: abortController.signal });
  output(result, Boolean(options.json)); process.exitCode = result.status === "completed" || result.status === "completed-with-warnings" ? 0 : result.status === "cancelled" ? 130 : 5;
});
const renderScene = program.command("render-scene").requiredOption("--scene <id>"); renderOptions(renderScene); renderScene.action(async (options) => {
  const result = await (await renderer()).renderScene({ ...(await requestFrom(options)), sceneId: options.scene }, { signal: abortController.signal });
  output(result, Boolean(options.json)); process.exitCode = result.status === "completed" ? 0 : 5;
});
program.command("compose").requiredOption("--scenes <paths...>").requiredOption("--profile <name>").requiredOption("--output <path>").option("--audio <path>").option("--subtitles <path>").option("--overwrite").option("--json").option("--verbose").action(async (options) => {
  const result = await (await renderer()).compose({ requestVersion: "1", jobId: "standalone-composition", profile: profile(options), outputDirectory: options.output, scenePaths: options.scenes.map((item: string) => path.resolve(item)), ...(options.audio ? { audio: { path: path.resolve(options.audio), volume: 1 } } : {}), ...(options.subtitles ? { subtitles: { path: path.resolve(options.subtitles), mode: "embedded" } } : {}), overwrite: Boolean(options.overwrite) }, { signal: abortController.signal });
  output(result, Boolean(options.json)); process.exitCode = abortController.signal.aborted ? 130 : result.status === "completed" ? 0 : 6;
});
program.command("inspect").option("--json").action(async (options) => output(await (await renderer()).inspectCapabilities(), Boolean(options.json)));
program.command("benchmark").requiredOption("--fixture <path>").requiredOption("--profiles <list>").option("--encoders <list>", "encoder list", "libx264").requiredOption("--output <path>").option("--json").action(async (options) => {
  const profiles = list(options.profiles).map((item) => { const parsed = profileNameSchema.safeParse(item); if (!parsed.success) throw new RendererError({ code: "INVALID_RENDER_PROFILE", message: "The benchmark profile is not valid." }); return parsed.data; });
  const encoders = list(options.encoders).map((item) => { const parsed = encoderSchema.safeParse(item); if (!parsed.success) throw new RendererError({ code: "INVALID_RENDER_PROFILE", message: "The benchmark encoder is not valid." }); return parsed.data; });
  const result = await (await renderer()).benchmark({ requestVersion: "1", fixtureDirectory: options.fixture, profiles, encoders, outputDirectory: options.output });
  output(result, Boolean(options.json)); process.exitCode = result.runs.some((run) => run.status === "failed") ? 5 : 0;
});
const cache = program.command("cache");
cache.command("inspect").option("--key <cache-key>").option("--json").action(async (options) => output(await (await renderer()).inspectCache({ requestVersion: "1", ...(options.key ? { cacheKey: options.key } : {}) }), Boolean(options.json)));
cache.command("clean").option("--key <cache-key>").option("--corrupt-only").option("--json").action(async (options) => output(await (await renderer()).cleanCache({ requestVersion: "1", ...(options.key ? { cacheKey: options.key } : {}), corruptOnly: Boolean(options.corruptOnly) }), Boolean(options.json)));

program.parseAsync().catch((error: unknown) => {
  const data = toRendererErrorData(error);
  process.stderr.write(`${data.code}: ${data.message}\n`);
  if (verboseEnabled() && error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
  process.exitCode = error instanceof RendererError && ["INVALID_REQUEST", "INVALID_VISUAL_PLAN", "INVALID_RENDER_PROFILE", "INVALID_FORMULA"].includes(error.data.code) ? 3 : 1;
});
