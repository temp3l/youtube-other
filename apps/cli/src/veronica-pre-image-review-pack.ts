import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { scenePlanSchema } from "@mediaforge/domain";
import { veronicaShortPacingCalibrationSchema } from "@mediaforge/speech";
import { z } from "zod";

const PACK_SCHEMA_VERSION = "veronica-pre-image-review-pack.v3" as const;
const execFileAsync = promisify(execFile);
const reviewManifestSchema = z.strictObject({
  schemaVersion: z.literal(PACK_SCHEMA_VERSION), episodeId: z.string().min(1), language: z.string().min(1), variant: z.enum(["full", "short"]),
  sceneCount: z.number().int().positive(), narrationDurationSeconds: z.number().positive(), timingSource: z.string().min(1),
  providerRequestsAllowed: z.literal(false), sources: z.array(z.strictObject({ name: z.string().min(1), path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/u) })).min(1),
  artifactHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
  packFileHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
  narrationDiagnostic: z.discriminatedUnion("mode", [
    z.strictObject({ mode: z.literal("short-adaptive"), wordCount: z.number().int().nonnegative(), narrationDurationSeconds: z.number().positive(), approximateWordsPerMinute: z.number().nonnegative(), timingSource: z.string().min(1), initialTtsSpeed: z.number().positive(), ttsSpeed: z.number().positive(), calibrationAttemptCount: z.number().int().positive(), speedNormalizationApplied: z.boolean(), preferredDurationRangeSeconds: z.tuple([z.number().positive(), z.number().positive()]), preferredWpmRange: z.tuple([z.number().positive(), z.number().positive()]).optional(), pacingStatus: z.enum(["within-target", "slightly-fast", "fast", "very-fast", "slightly-slow", "slow"]), durationAcceptanceStatus: z.enum(["WITHIN_PREFERRED_RANGE", "WITHIN_ACCEPTANCE_TOLERANCE", "PACING_TARGET_MISSED"]) }),
    z.strictObject({ mode: z.literal("full-current-policy"), wordCount: z.number().int().nonnegative(), narrationDurationSeconds: z.number().positive(), approximateWordsPerMinute: z.number().nonnegative(), timingSource: z.string().min(1), pacingStatus: z.literal("not-configured"), durationAcceptanceStatus: z.literal("NOT_APPLICABLE") }),
  ]),
});

export interface VeronicaPreImageReviewPackResult {
  readonly packDir: string;
  readonly manifestPath: string;
  readonly readmePath: string;
  readonly promptPath: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly generatedAtMs: number;
}

interface PackInput {
  readonly episodeDir: string;
  readonly language: string;
  readonly variant: "full" | "short";
}

function packRoot(input: PackInput): string {
  return path.join(input.episodeDir, "review-packs", "pre-image", `${input.language}-${input.variant}`);
}

function packDir(input: PackInput, generatedAtMs: number): string { return path.join(packRoot(input), `run-${generatedAtMs}`); }

function zipFileName(input: PackInput, generatedAtMs: number): string {
  return `veronica-pre-image-review-pack-${input.language}-${input.variant}-${generatedAtMs}.zip`;
}

async function fileHash(filePath: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function requiredFile(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Veronica pre-image review pack requires ${label}: ${filePath}`);
  }
}

function promptReviewMarkdown(input: {
  readonly narration: string;
  readonly pacingSummary: string;
  readonly scenes: ReturnType<typeof scenePlanSchema.parse>["scenes"];
  readonly findingsByScene: ReadonlyMap<string, readonly string[]>;
  readonly stateByScene: ReadonlyMap<string, string>;
  readonly actorByScene: ReadonlyMap<string, string>;
}): string {
  return [
    "# ChatGPT pre-image review request",
    "",
    "Review this Short before any image-provider request. For each scene, answer pass/edit/block for: narration alignment; visible thesis; 1–2 second muted instant-read; buyer/customer action; cause/effect; occupation-proxy drift; abstract-prop drift; generic stock drift; continuity; harmful repetition; text/logo risk; 9:16 readability; new information; and whether provider generation should proceed. Return concise numbered edits; do not rewrite narration unless visual alignment requires it.",
    "",
    "## English narration",
    "",
    input.narration,
    "",
    `Pacing: ${input.pacingSummary}`,
    "",
    "## Scene prompts",
    "",
    ...input.scenes.flatMap((scene) => [
      `### ${scene.id} — ${scene.timing.startSeconds.toFixed(3)}s to ${scene.timing.endSeconds.toFixed(3)}s`,
      "",
      `Narration: ${scene.canonicalNarration}`,
      "",
      `State complexity: ${input.stateByScene.get(scene.id) ?? "SINGLE_STATE"}`,
      "",
      `Action owner: ${input.actorByScene.get(scene.id) ?? "not applicable"}`,
      "",
      `Prompt: ${scene.imagePrompt}`,
      "",
      `Automated findings: ${(input.findingsByScene.get(scene.id) ?? []).join("; ") || "none"}`,
      "",
    ]),
  ].join("\n");
}

function providerPromptsMarkdown(scenes: ReturnType<typeof scenePlanSchema.parse>["scenes"], stateByScene: ReadonlyMap<string, string>, actorByScene: ReadonlyMap<string, string>): string {
  return ["# UNAPPROVED — DO NOT SUBMIT", "", "These provider-oriented prompts are intentionally blocked until human pre-image approval is recorded.", "", ...scenes.flatMap((scene) => [`## ${scene.id}`, "", `State complexity: ${stateByScene.get(scene.id) ?? "SINGLE_STATE"}`, `Action owner: ${actorByScene.get(scene.id) ?? "not applicable"}`, "", scene.imagePrompt, ""])].join("\n");
}

function shortNarrationDiagnostic(narrationDurationSeconds: number, timingSource: string, calibration: ReturnType<typeof veronicaShortPacingCalibrationSchema.parse>) {
  const initial = calibration.attempts[0]!;
  return { mode: "short-adaptive" as const, wordCount: calibration.wordCount, narrationDurationSeconds, approximateWordsPerMinute: Math.round(calibration.wordCount / narrationDurationSeconds * 60 * 10) / 10, timingSource, initialTtsSpeed: initial.requestedSpeed, ttsSpeed: calibration.selectedSpeed, calibrationAttemptCount: calibration.attempts.length, speedNormalizationApplied: calibration.speedNormalizationApplied, preferredDurationRangeSeconds: calibration.targetDurationRange, ...(calibration.preferredWpmRange ? { preferredWpmRange: calibration.preferredWpmRange } : {}), pacingStatus: calibration.selectedPacingStatus, durationAcceptanceStatus: calibration.selectedDurationAcceptanceStatus };
}

export async function createVeronicaPreImageReviewPack(
  input: PackInput,
): Promise<VeronicaPreImageReviewPackResult> {
  const localeRoot = path.join(input.episodeDir, "locales", input.language, input.variant);
  const sourcePlanPath = path.join(input.episodeDir, "source", "pre-image-semantic-plan.v1.json");
  const narrationPath = path.join(localeRoot, "audio", "narration.wav");
  const scriptPath = path.join(localeRoot, "script.md");
  const scenePlanPath = path.join(localeRoot, "scene-plan.json");
  const manifestPath = path.join(input.episodeDir, "manifest.json");
  const timingPath = path.join(localeRoot, "canonical-timing.v1.json");
  const eventPath = path.join(localeRoot, "retimed-visual-events.json");
  const semanticReviewPath = path.join(input.episodeDir, "shared", "pre-image-semantic-reviews.v1.json");
  const pacingCalibrationPath = path.join(localeRoot, "audio", "narration", "pacing-calibration.v1.json");
  await Promise.all([
    requiredFile(sourcePlanPath, "the canonical visual plan"),
    requiredFile(narrationPath, "mastered narration.wav"),
    requiredFile(scriptPath, "the English script"),
    requiredFile(scenePlanPath, "the retimed scene plan"),
    requiredFile(manifestPath, "the episode manifest"),
    requiredFile(timingPath, "canonical locale timing"),
    requiredFile(eventPath, "retimed visual events"),
    requiredFile(semanticReviewPath, "semantic gate reviews"),
    ...(input.variant === "short" ? [requiredFile(pacingCalibrationPath, "adaptive pacing calibration")] : []),
  ]);
  const [narration, scenePlanRaw, semanticReviewRaw, pacingCalibrationRaw] = await Promise.all([
    fs.readFile(scriptPath, "utf8"),
    fs.readFile(scenePlanPath, "utf8"),
    fs.readFile(semanticReviewPath, "utf8"),
    input.variant === "short" ? fs.readFile(pacingCalibrationPath, "utf8") : Promise.resolve(null),
  ]);
  const scenePlan = scenePlanSchema.parse(JSON.parse(scenePlanRaw) as unknown);
  const timing = JSON.parse(await fs.readFile(timingPath, "utf8")) as { readonly timingSource?: unknown; readonly narrationDurationSeconds?: unknown };
  if (typeof timing.timingSource !== "string" || typeof timing.narrationDurationSeconds !== "number") throw new Error(`Invalid canonical locale timing artifact: ${timingPath}`);
  const diagnostic = input.variant === "short"
    ? shortNarrationDiagnostic(timing.narrationDurationSeconds, timing.timingSource, veronicaShortPacingCalibrationSchema.parse(JSON.parse(pacingCalibrationRaw ?? "") as unknown))
    : { mode: "full-current-policy" as const, wordCount: narration.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)?/gu)?.length ?? 0, narrationDurationSeconds: timing.narrationDurationSeconds, approximateWordsPerMinute: Math.round((narration.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)?/gu)?.length ?? 0) / timing.narrationDurationSeconds * 60 * 10) / 10, timingSource: timing.timingSource, pacingStatus: "not-configured" as const, durationAcceptanceStatus: "NOT_APPLICABLE" as const };
  const finalPlan = z.object({ continuity: z.object({ mode: z.string() }).optional(), selectedRecurringMotif: z.object({ concept: z.string() }).optional(), scenes: z.array(z.object({ sceneId: z.string(), stateComplexity: z.enum(["SINGLE_STATE", "DECISIVE_TRANSITION_MOMENT", "MULTI_STATE_REQUIRED"]).optional(), treatment: z.object({ actionOwnerRole: z.enum(["expert", "buyer", "shared", "none"]).optional() }) })) }).parse(JSON.parse(await fs.readFile(sourcePlanPath, "utf8")) as unknown);
  const stateByScene = new Map(scenePlan.scenes.map((scene, index) => [scene.id, finalPlan.scenes[index]?.stateComplexity ?? "SINGLE_STATE"] as const));
  const actorByScene = new Map(scenePlan.scenes.map((scene, index) => [scene.id, finalPlan.scenes[index]?.treatment.actionOwnerRole ?? "not applicable"] as const));
  const semanticReviews = z.object({ reviews: z.array(z.object({ sceneId: z.string(), findings: z.array(z.object({ code: z.string(), severity: z.string(), message: z.string() })) })) }).parse(JSON.parse(semanticReviewRaw) as unknown);
  const findingsByScene = new Map(semanticReviews.reviews.map((review) => [review.sceneId, review.findings.map((finding) => `${finding.severity}:${finding.code} — ${finding.message}`)] as const));
  const allFindings = semanticReviews.reviews.flatMap((review) => review.findings);
  const warningCount = allFindings.filter((finding) => finding.severity === "warning" || finding.severity === "info").length;
  const blockerCount = allFindings.filter((finding) => finding.severity === "blocker" || finding.severity === "error").length;
  const generatedAtMs = Date.now();
  const outputDir = packDir(input, generatedAtMs);
  await fs.mkdir(outputDir, { recursive: true });
  const files: Array<readonly [string, string]> = [
    ["narration.wav", narrationPath],
    ["script.md", scriptPath],
    ["retimed-scene-plan.json", scenePlanPath],
    ["canonical-locale-timing.v1.json", timingPath],
    ["retimed-visual-events.json", eventPath],
    ["visual-plan.json", sourcePlanPath],
    ["episode-manifest.json", manifestPath],
    ["pre-image-semantic-reviews.v1.json", semanticReviewPath],
    ...(input.variant === "short" ? [["pacing-calibration.v1.json", pacingCalibrationPath] as const] : []),
  ];
  await Promise.all(files.map(([fileName, sourcePath]) => fs.copyFile(sourcePath, path.join(outputDir, fileName))));
  const promptPath = path.join(outputDir, "chatgpt-pre-image-review-request.md");
  const promptsPath = path.join(outputDir, "provider-image-prompts.md");
  const pacingSummary = diagnostic.mode === "short-adaptive"
    ? `${diagnostic.wordCount} words; ${diagnostic.narrationDurationSeconds.toFixed(3)}s; ${diagnostic.approximateWordsPerMinute} WPM; ${diagnostic.pacingStatus}; ${diagnostic.durationAcceptanceStatus}; selected speed ${diagnostic.ttsSpeed}; calibration ${diagnostic.speedNormalizationApplied ? "applied" : "not required"}.`
    : `${diagnostic.wordCount} words; ${diagnostic.narrationDurationSeconds.toFixed(3)}s; ${diagnostic.approximateWordsPerMinute} WPM; full-form pacing policy not configured.`;
  const promptMarkdown = promptReviewMarkdown({ narration, pacingSummary, scenes: scenePlan.scenes, findingsByScene, stateByScene, actorByScene });
  await Promise.all([
    fs.writeFile(promptPath, promptMarkdown, "utf8"),
    fs.writeFile(promptsPath, providerPromptsMarkdown(scenePlan.scenes, stateByScene, actorByScene), "utf8"),
  ]);
  const artifactFiles: readonly (readonly [string, string])[] = [
    ["chatgpt-pre-image-review-request.md", promptPath],
    ["provider-image-prompts.md", promptsPath],
  ];
  const artifactHashes = Object.fromEntries(await Promise.all(artifactFiles.map(async ([name, artifactPath]) => [name, await fileHash(artifactPath)] as const)));
  const sources = await Promise.all(files.map(async ([name, sourcePath]) => ({ name, path: path.relative(input.episodeDir, sourcePath), sha256: await fileHash(sourcePath) })));
  const packFileHashes = Object.fromEntries(await Promise.all([
    ...files.map(async ([name]) => [name, await fileHash(path.join(outputDir, name))] as const),
    ["chatgpt-pre-image-review-request.md", await fileHash(promptPath)] as const,
    ["provider-image-prompts.md", await fileHash(promptsPath)] as const,
  ]));
  const reviewManifestPath = path.join(outputDir, "review-manifest.json");
  await fs.writeFile(
    reviewManifestPath,
    `${JSON.stringify(reviewManifestSchema.parse({
      schemaVersion: PACK_SCHEMA_VERSION,
      episodeId: path.basename(input.episodeDir),
      language: input.language,
      variant: input.variant,
      sceneCount: scenePlan.scenes.length,
      narrationDurationSeconds: timing.narrationDurationSeconds,
      timingSource: timing.timingSource,
      providerRequestsAllowed: false,
      sources,
      artifactHashes,
      packFileHashes,
      narrationDiagnostic: diagnostic,
    }), null, 2)}\n`,
    "utf8",
  );
  const readmePath = path.join(outputDir, "README.md");
  await fs.writeFile(
    readmePath,
    `# Veronica pre-image review pack\n\n- Episode: \`${path.basename(input.episodeDir)}\`
- Locale / variant: \`${input.language}/${input.variant}\`
- Narration duration: \`${timing.narrationDurationSeconds.toFixed(3)}s\`
- Word count / approximate WPM: \`${diagnostic.wordCount}\` / \`${diagnostic.approximateWordsPerMinute}\`${diagnostic.mode === "short-adaptive" ? ` (\`${diagnostic.pacingStatus}\`; preferred duration \`${diagnostic.preferredDurationRangeSeconds.join("–")}s\`${diagnostic.preferredWpmRange ? `; WPM guidance \`${diagnostic.preferredWpmRange.join("–")}\`` : ""})\n- TTS pacing: initial \`${diagnostic.initialTtsSpeed}\`, selected \`${diagnostic.ttsSpeed}\`, \`${diagnostic.calibrationAttemptCount}\` measured attempt(s), normalization \`${diagnostic.speedNormalizationApplied}\`, acceptance \`${diagnostic.durationAcceptanceStatus}\`` : "\n- TTS pacing: full-form current policy preserved; no Short adaptive calibration."}
- Canonical timing source: \`${timing.timingSource}\`
- Scene count: \`${scenePlan.scenes.length}\`
- Selected recurring motif: \`${finalPlan.selectedRecurringMotif?.concept ?? "none"}\`
- Continuity strategy: \`${finalPlan.continuity?.mode ?? "not recorded"}\`
- Automated semantic gate: review-required (\`${warningCount}\` warnings; \`${blockerCount}\` blockers); human pre-image approval is not recorded.
- Provider request allowed: **false** — \`BLOCKED_PENDING_HUMAN_PRE_IMAGE_APPROVAL\`.
- Pack validity: every source and copied pack file must match its SHA-256 in \`review-manifest.json\`.

Review \`chatgpt-pre-image-review-request.md\`, \`visual-plan.json\`, \`retimed-scene-plan.json\`, \`canonical-locale-timing.v1.json\`, and \`retimed-visual-events.json\`; respond scene-by-scene, then record human approval through the normal workflow. \`provider-image-prompts.md\` is **UNAPPROVED / DO NOT SUBMIT**.\n`,
    "utf8",
  );
  await fs.writeFile(path.join(packRoot(input), "latest.json"), `${JSON.stringify({ schemaVersion: "veronica-pre-image-review-pack-latest.v1", packDir: path.basename(outputDir) })}\n`, "utf8");
  const zipPath = path.resolve(packRoot(input), zipFileName(input, generatedAtMs));
  await execFileAsync("zip", ["-X", "-q", "-r", zipPath, path.basename(outputDir)], {
    cwd: packRoot(input),
  });
  await execFileAsync("unzip", ["-t", zipPath], { cwd: packRoot(input) });
  return { packDir: outputDir, manifestPath: reviewManifestPath, readmePath, promptPath, zipPath, zipSha256: await fileHash(zipPath), generatedAtMs };
}

export async function assertVeronicaPreImageReviewPackCurrent(input: PackInput): Promise<void> {
  const latestPath = path.join(packRoot(input), "latest.json");
  const latest = z.object({ schemaVersion: z.literal("veronica-pre-image-review-pack-latest.v1"), packDir: z.string().regex(/^run-\d+$/u) }).parse(JSON.parse(await fs.readFile(latestPath, "utf8")) as unknown);
  const manifestPath = path.join(packRoot(input), latest.packDir, "review-manifest.json");
  let stored: z.infer<typeof reviewManifestSchema>;
  try {
    stored = reviewManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown);
  } catch {
    throw new Error(`Veronica image generation requires a current pre-image review pack. Run: mediaforge veronica-media images review-pack --workspace ${path.dirname(input.episodeDir)} --episode-id ${path.basename(input.episodeDir)} --language ${input.language} --variant ${input.variant}`);
  }
  if (!stored.providerRequestsAllowed) {
    throw new Error("Veronica image generation is blocked: this pack is awaiting explicit human pre-image approval.");
  }
  if (!stored.sources.some((source) => source.name === "pre-image-semantic-reviews.v1.json")) {
    throw new Error(
      "Veronica image generation requires a review pack containing current semantic-gate evidence. Regenerate the Veronica pre-image review pack, obtain human approval, then retry image generation.",
    );
  }
  for (const source of stored.sources) {
    const fileName = source.name;
    const sourcePath = fileName === "narration.wav"
      ? path.join(input.episodeDir, "locales", input.language, input.variant, "audio", "narration.wav")
      : fileName === "script.md"
        ? path.join(input.episodeDir, "locales", input.language, input.variant, "script.md")
        : fileName === "retimed-scene-plan.json"
          ? path.join(input.episodeDir, "locales", input.language, input.variant, "scene-plan.json")
          : fileName === "visual-plan.json"
          ? path.join(input.episodeDir, "source", "pre-image-semantic-plan.v1.json")
            : fileName === "episode-manifest.json"
              ? path.join(input.episodeDir, "manifest.json")
              : fileName === "canonical-locale-timing.v1.json" || fileName === "retimed-visual-events.json"
                ? path.join(input.episodeDir, "locales", input.language, input.variant, fileName)
                : fileName === "pacing-calibration.v1.json"
                  ? path.join(input.episodeDir, "locales", input.language, input.variant, "audio", "narration", fileName)
                : path.join(input.episodeDir, "shared", fileName);
    if (await fileHash(sourcePath) !== source.sha256) {
      throw new Error(`Veronica pre-image review pack is stale because ${fileName} changed. Recreate it before image generation.`);
    }
  }
}
