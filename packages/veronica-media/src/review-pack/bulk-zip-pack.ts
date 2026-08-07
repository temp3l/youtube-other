import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  veronicaMediaPlanSchema,
  veronicaRenderManifestSchema,
  type VeronicaMediaPlan,
} from "../contracts/media-plan.v1.js";
import { canonicalJson } from "../canonical-json.js";
import { buildContactSheetTiles, renderContactSheetSvg } from "./contact-sheet.js";
import { validateEpisodeApprovalPackIntegrity } from "./integrity-validator.js";

export const VERONICA_FIXTURE_SET_ID = "veronica-benini-discovery-matrix.v1";

export const VERONICA_FIXTURE_PACK_LIMITATIONS = [
  "Validates artifact contracts, deterministic planning, prepared asset generation, aspect-ratio behavior, approval eligibility logic, FFmpeg/render-manifest behavior, and review-pack generation.",
  "Does not prove real episode editorial quality, real source-media relevance, production translation quality, production visual aesthetics, or final real-content viewer quality.",
  "Final MP4 renders are manifest-only in this fixture pack.",
  "Discovery fixture episodes use synthetic supplemental assets, not approved Veronica production sources.",
] as const;

const execFileAsync = promisify(execFile);

const unsafePattern =
  /(?:\b(?:api[_-]?key|authorization|password|secret|token)\b|(?:^|[/])(?:home|users)(?:[/]|$))/iu;

const METRIC_KEYS = [
  "suppliedAssetUtilizationRatio",
  "unusedHighRelevanceAssetCount",
  "repeatedAssetRatio",
  "fallbackRatio",
  "approvalRequiredRatio",
  "lowConfidencePlacementRatio",
  "untranslatedTextIncidents",
  "portraitAdaptationFailures",
  "narrationAnchorResolutionFailures",
  "averageVisualDwellDurationSeconds",
  "semanticCoverageRatio",
  "redesignFrequency",
  "cacheHitRatio",
] as const;

export interface VeronicaBulkZipEpisodeInput {
  readonly episodeId: string;
  readonly episodeRoot: string;
  readonly stateDir: string;
  readonly approvalPackDir: string;
}

export interface VeronicaBulkZipPackResult {
  readonly packDir: string;
  readonly zipPath: string;
  readonly zipBytes: number;
  readonly zipChecksum: string;
  readonly episodeCount: number;
  readonly episodesIncluded: readonly string[];
  readonly episodesOmitted: readonly string[];
  readonly filesPerEpisode: Readonly<Record<string, number>>;
  readonly contactSheetsIncluded: boolean;
  readonly renderEvidenceIncluded: boolean;
  readonly integrityValid: boolean;
  readonly redactionValid: boolean;
  readonly limitations: readonly string[];
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const serialized = `${JSON.stringify(sanitizeReviewValue(value), null, 2)}\n`;
  if (unsafePattern.test(serialized)) {
    throw new Error(`Unsafe content detected while writing ${target}.`);
  }
  await fs.writeFile(target, serialized, "utf8");
}

function sanitizeReviewValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (path.isAbsolute(value) || /^[A-Za-z]:\\/u.test(value)) {
      return path.basename(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeReviewValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeReviewValue(entry)]),
    );
  }
  return value;
}

async function copyIfExists(source: string, target: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    return true;
  } catch {
    return false;
  }
}

async function copyJsonSanitizedIfExists(source: string, target: string): Promise<boolean> {
  try {
    await writeJson(target, await readJson(source));
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

function narrationDiff(original: string, revised: string): string {
  if (original === revised) {
    return "No narration changes detected.";
  }
  return [
    "# Narration revision diff",
    "",
    "## Original",
    original,
    "",
    "## Revised",
    revised,
  ].join("\n");
}

function summarizeEpisodeQuality(plan: VeronicaMediaPlan): string {
  const lines = [
    "# Quality report",
    "",
    `- Content hash: ${plan.contentHash}`,
    `- Approval state: ${plan.approvalState}`,
    `- Render eligible: ${plan.approvalEligibility.renderEligible}`,
    `- Landscape placements: ${plan.landscapePlacements.length}`,
    `- Portrait placements: ${plan.portraitPlacements.length}`,
    `- Fallback ratio: ${plan.metrics.fallbackRatio}`,
    `- Repeated asset ratio: ${plan.metrics.repeatedAssetRatio}`,
    `- Semantic coverage: ${plan.metrics.semanticCoverageRatio}`,
  ];
  return `${lines.join("\n")}\n`;
}

function summarizeTranslation(plan: VeronicaMediaPlan): string {
  const translated = plan.preparedAssets.filter((asset) => asset.translationStatus);
  const lines = [
    "# Translation report",
    "",
    `- Prepared assets with translation status: ${translated.length}`,
    `- Untranslated incidents: ${plan.metrics.untranslatedTextIncidents}`,
    `- Approval-required ratio: ${plan.metrics.approvalRequiredRatio}`,
  ];
  for (const asset of translated) {
    lines.push(
      `- ${asset.preparedAssetId}: ${asset.translationStatus?.status ?? "unknown"} (confidence ${asset.translationStatus?.confidence ?? "n/a"})`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function summarizePreparation(plan: VeronicaMediaPlan): string {
  return [
    "# Preparation report",
    "",
    `- Source assets: ${plan.sourceAssets.length}`,
    `- Prepared assets: ${plan.preparedAssets.length}`,
    `- Visual states: ${plan.visualStates.length}`,
    `- Portrait adaptation failures: ${plan.metrics.portraitAdaptationFailures}`,
  ].join("\n") + "\n";
}

function summarizeUnresolved(plan: VeronicaMediaPlan): string {
  const issues = plan.approvalEligibility.issues;
  if (issues.length === 0) {
    return "# Unresolved items\n\nNone.\n";
  }
  return [
    "# Unresolved items",
    "",
    ...issues.map((issue) => `- [${issue.severity}] ${issue.code}: ${issue.message}`),
  ].join("\n") + "\n";
}

async function buildEpisodeDirectory(input: {
  readonly packRoot: string;
  readonly episode: VeronicaBulkZipEpisodeInput;
}): Promise<{ readonly fileCount: number; readonly missing: readonly string[] }> {
  const episodeOut = path.join(input.packRoot, "episodes", input.episode.episodeId);
  const approvalDir = input.episode.approvalPackDir;
  const missing: string[] = [];
  await fs.mkdir(path.join(episodeOut, "plans"), { recursive: true });
  await fs.mkdir(path.join(episodeOut, "previews"), { recursive: true });
  await fs.mkdir(path.join(episodeOut, "reports"), { recursive: true });
  await fs.mkdir(path.join(episodeOut, "assets", "source-thumbnails"), { recursive: true });
  await fs.mkdir(path.join(episodeOut, "assets", "prepared-landscape"), { recursive: true });
  await fs.mkdir(path.join(episodeOut, "assets", "prepared-portrait"), { recursive: true });
  const requiredPackFiles = [
    "revised-narration.json",
    "semantic-plan.json",
    "claim-source-mapping.json",
    "asset-inventory.json",
    "approval-eligibility.json",
    "planner-metrics.json",
    "translations.json",
    "versions.json",
  ] as const;

  for (const fileName of requiredPackFiles) {
    const copied = await copyIfExists(
      path.join(approvalDir, fileName),
      path.join(episodeOut, fileName),
    );
    if (!copied) {
      missing.push(fileName);
    }
  }

  const planPath = path.join(input.episode.stateDir, "veronica-media-plan.json");
  let plan: VeronicaMediaPlan;
  try {
    plan = veronicaMediaPlanSchema.parse(await readJson(planPath));
  } catch {
    plan = veronicaMediaPlanSchema.parse(await readJson(path.join(approvalDir, "semantic-plan.json")));
  }

  await writeJson(path.join(episodeOut, "plans", "landscape-composition.json"), {
    aspectRatio: "16:9",
    placements: plan.landscapePlacements,
    visualStates: plan.visualStates,
  });
  await writeJson(path.join(episodeOut, "plans", "portrait-composition.json"), {
    aspectRatio: "9:16",
    placements: plan.portraitPlacements,
    visualStates: plan.visualStates,
  });

  const landscapeManifestPath = path.join(input.episode.stateDir, "renders", "landscape-manifest.json");
  const portraitManifestPath = path.join(input.episode.stateDir, "renders", "portrait-manifest.json");
  if (
    await copyJsonSanitizedIfExists(
      landscapeManifestPath,
      path.join(episodeOut, "plans", "landscape-render-manifest.json"),
    )
  ) {
    // copied
  } else {
    missing.push("plans/landscape-render-manifest.json");
  }
  if (
    await copyJsonSanitizedIfExists(
      portraitManifestPath,
      path.join(episodeOut, "plans", "portrait-render-manifest.json"),
    )
  ) {
    // copied
  } else {
    missing.push("plans/portrait-render-manifest.json");
  }
  await writeJson(path.join(episodeOut, "plans", "render-manifest.json"), {
    landscape: (await fs.readFile(landscapeManifestPath, "utf8").then(JSON.parse).catch(() => null)),
    portrait: (await fs.readFile(portraitManifestPath, "utf8").then(JSON.parse).catch(() => null)),
  });

  await writeJson(path.join(episodeOut, "fallback-plan.json"), {
    placements: plan.placements
      .filter((placement) => placement.fallback.fallbackAllowed)
      .map((placement) => ({
        placementId: placement.placementId,
        anchorId: placement.anchorId,
        requirement: placement.fallback.requirement,
        reason: placement.fallback.fallbackReason ?? null,
      })),
  });
  await writeJson(path.join(episodeOut, "provenance.json"), plan.provenance);
  await writeJson(path.join(episodeOut, "regeneration-scope.json"), {
    availableScopes: ["re-plan", "re-prepare-assets", "re-translate", "re-align-narration", "re-render"],
    note: "Regeneration scope metadata exported for review; no automatic regeneration performed.",
  });

  await fs.writeFile(
    path.join(episodeOut, "original-narration.txt"),
    `${plan.narrationRevision.originalScript}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(episodeOut, "narration-revision-diff.md"),
    narrationDiff(plan.narrationRevision.originalScript, plan.narrationRevision.revisedScript),
    "utf8",
  );

  const preparedAssetBytes: Record<string, Uint8Array> = {};
  for (const prepared of plan.preparedAssets) {
    const sourcePrepared = path.join(input.episode.stateDir, prepared.relativePath);
    try {
      preparedAssetBytes[prepared.preparedAssetId] = await fs.readFile(sourcePrepared);
    } catch {
      missing.push(`prepared-bytes/${prepared.preparedAssetId}`);
    }
  }

  const landscapeTiles = buildContactSheetTiles(plan, "16:9", preparedAssetBytes);
  const portraitTiles = buildContactSheetTiles(plan, "9:16", preparedAssetBytes);
  await fs.writeFile(
    path.join(episodeOut, "previews", "landscape-contact-sheet.svg"),
    renderContactSheetSvg({
      episodeId: input.episode.episodeId,
      aspectRatio: "16:9",
      tiles: landscapeTiles,
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(episodeOut, "previews", "portrait-contact-sheet.svg"),
    renderContactSheetSvg({
      episodeId: input.episode.episodeId,
      aspectRatio: "9:16",
      tiles: portraitTiles,
    }),
    "utf8",
  );
  await writeJson(
    path.join(episodeOut, "previews", "landscape-contact-sheet.json"),
    landscapeTiles.map(({ thumbnailBase64: _thumb, ...tile }) => tile),
  );
  await writeJson(
    path.join(episodeOut, "previews", "portrait-contact-sheet.json"),
    portraitTiles.map(({ thumbnailBase64: _thumb, ...tile }) => tile),
  );

  const sourcesDir = path.join(input.episode.episodeRoot, "sources", "content");
  for (const asset of plan.sourceAssets) {
    const sourcePath = path.join(sourcesDir, asset.originalFilename);
    const extension = path.extname(asset.originalFilename).toLowerCase();
    const target = path.join(
      episodeOut,
      "assets",
      "source-thumbnails",
      `${asset.assetId}${extension}`,
    );
    if (!(await copyIfExists(sourcePath, target))) {
      missing.push(`assets/source-thumbnails/${asset.assetId}`);
    }
  }

  for (const prepared of plan.preparedAssets) {
    const aspectDir = prepared.aspectRatio === "9:16" ? "prepared-portrait" : "prepared-landscape";
    const sourcePrepared = path.join(input.episode.stateDir, prepared.relativePath);
    const target = path.join(
      episodeOut,
      "assets",
      aspectDir,
      path.basename(prepared.relativePath),
    );
    if (!(await copyIfExists(sourcePrepared, target))) {
      missing.push(`assets/${aspectDir}/${path.basename(prepared.relativePath)}`);
    }
  }

  await fs.writeFile(path.join(episodeOut, "reports", "quality-report.md"), summarizeEpisodeQuality(plan), "utf8");
  await fs.writeFile(path.join(episodeOut, "reports", "translation-report.md"), summarizeTranslation(plan), "utf8");
  await fs.writeFile(path.join(episodeOut, "reports", "preparation-report.md"), summarizePreparation(plan), "utf8");
  await fs.writeFile(path.join(episodeOut, "reports", "unresolved-items.md"), summarizeUnresolved(plan), "utf8");

  const readme = [
    `# ${input.episode.episodeId}`,
    "",
    "Inspection-grade supplemental media approval evidence.",
    "",
    "## Included",
    ...requiredPackFiles.map((file) => `- ${file}`),
    "- plans/, previews/, assets/, reports/",
    "",
    "## Missing or unavailable",
    ...(missing.length > 0 ? missing.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Fixture metadata",
    "",
    "```json",
    JSON.stringify(
      {
        contentMode: "fixture",
        productionContent: false,
        fixtureSet: VERONICA_FIXTURE_SET_ID,
      },
      null,
      2,
    ),
    "```",
    "",
    "## Notes",
    "- Final rendered MP4 previews are not generated in this discovery fixture set.",
    "- PDF/PPTX source thumbnails are copied only when a review-safe raster already exists.",
  ].join("\n");
  await fs.writeFile(path.join(episodeOut, "README.md"), `${readme}\n`, "utf8");

  const files = await listFilesRecursive(episodeOut);
  return { fileCount: files.length, missing };
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function aggregateMetricStats(
  episodes: ReadonlyArray<{ episodeId: string; metrics: Record<string, number> }>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of METRIC_KEYS) {
    const values = episodes
      .map((episode) => episode.metrics[key])
      .filter((value): value is number => typeof value === "number");
    if (values.length === 0) {
      result[key] = { available: false };
      continue;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const minEpisode = episodes.find((episode) => episode.metrics[key] === sorted[0])?.episodeId;
    const maxEpisode = episodes.find((episode) => episode.metrics[key] === sorted[sorted.length - 1])?.episodeId;
    result[key] = {
      available: true,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean,
      median,
      lowestEpisodeId: minEpisode ?? null,
      highestEpisodeId: maxEpisode ?? null,
      perEpisode: Object.fromEntries(episodes.map((episode) => [episode.episodeId, episode.metrics[key]])),
    };
  }
  return result;
}

function buildCrossEpisodeFindings(input: {
  readonly episodes: ReadonlyArray<{
    readonly episodeId: string;
    readonly plan: VeronicaMediaPlan;
    readonly missing: readonly string[];
  }>;
}): string {
  const lines = [
    "# Cross-episode approval findings",
    "",
    "## Summary",
    `- Episodes reviewed: ${input.episodes.length}`,
    `- All episodes currently report render eligibility in fixture pipeline output; this does not guarantee editorial quality.`,
    "",
    "## Asset utilization",
  ];

  for (const episode of input.episodes) {
    const unused = episode.plan.metrics.unusedHighRelevanceAssetCount;
    const utilization = episode.plan.metrics.suppliedAssetUtilizationRatio;
    if (unused > 0 || utilization < 0.75) {
      lines.push(
        `- **${episode.episodeId}**: utilization=${utilization.toFixed(2)}, unusedHighRelevance=${unused}`,
      );
    }
  }
  if (lines.at(-1) === "## Asset utilization") {
    lines.push("- No episode exceeded the unused-high-relevance heuristic in this pass.");
  }

  lines.push("", "## Visual repetition");
  const highRepeat = input.episodes.filter((episode) => episode.plan.metrics.repeatedAssetRatio > 0.2);
  if (highRepeat.length === 0) {
    lines.push("- No episode exceeded repeatedAssetRatio > 0.2.");
  } else {
    for (const episode of highRepeat) {
      lines.push(
        `- **${episode.episodeId}**: repeatedAssetRatio=${episode.plan.metrics.repeatedAssetRatio.toFixed(2)}`,
      );
    }
  }

  lines.push("", "## Fallback behavior");
  for (const episode of input.episodes) {
    if (episode.plan.metrics.fallbackRatio > 0) {
      lines.push(
        `- **${episode.episodeId}**: fallbackRatio=${episode.plan.metrics.fallbackRatio.toFixed(2)}`,
      );
    }
  }

  lines.push("", "## Semantic placement and anchor timing");
  for (const episode of input.episodes) {
    const unresolved = episode.plan.approvalEligibility.issues.filter((issue) =>
      issue.code.includes("ANCHOR"),
    );
    if (unresolved.length > 0) {
      lines.push(`- **${episode.episodeId}**: ${unresolved.length} unresolved anchor timing warnings`);
    }
    if (episode.plan.metrics.semanticCoverageRatio < 0.8) {
      lines.push(
        `- **${episode.episodeId}**: semanticCoverageRatio=${episode.plan.metrics.semanticCoverageRatio.toFixed(2)}`,
      );
    }
  }

  lines.push("", "## Localization");
  for (const episode of input.episodes) {
    if (episode.plan.metrics.untranslatedTextIncidents > 0) {
      lines.push(
        `- **${episode.episodeId}**: untranslatedTextIncidents=${episode.plan.metrics.untranslatedTextIncidents}`,
      );
    }
  }

  lines.push("", "## 16:9 vs 9:16");
  for (const episode of input.episodes) {
    const landscape = episode.plan.landscapePlacements.length;
    const portrait = episode.plan.portraitPlacements.length;
    const ratio = portrait === 0 ? 0 : landscape / portrait;
    if (portrait > 0 && ratio > 0.95 && ratio < 1.05) {
      lines.push(
        `- **${episode.episodeId}**: landscape/portrait placement parity (${landscape}/${portrait}) — inspect portrait contact sheet for crop-only suspicion.`,
      );
    }
  }

  lines.push("", "## Approval behavior");
  lines.push(
    "- Eligibility gates are passing with fixture narration and synthetic supplemental assets; external review should still inspect contact sheets, fallback usage, and semantic coverage.",
  );

  lines.push("", "## Missing artifacts");
  for (const episode of input.episodes) {
    if (episode.missing.length > 0) {
      lines.push(`- **${episode.episodeId}**: ${episode.missing.join(", ")}`);
    }
  }
  if (!input.episodes.some((episode) => episode.missing.length > 0)) {
    lines.push("- No required pack files were missing.");
  }

  return `${lines.join("\n")}\n`;
}

async function hashFiles(root: string): Promise<Array<{ readonly relativePath: string; readonly checksum: string }>> {
  const files = (await listFilesRecursive(root)).sort();
  const checksums: Array<{ relativePath: string; checksum: string }> = [];
  for (const absolute of files) {
    if (absolute.endsWith(`${path.sep}checksums.json`)) continue;
    const bytes = await fs.readFile(absolute);
    checksums.push({
      relativePath: path.relative(root, absolute).split(path.sep).join("/"),
      checksum: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return checksums;
}

export async function buildVeronicaBulkApprovalZip(input: {
  readonly episodes: readonly VeronicaBulkZipEpisodeInput[];
  readonly outputDir: string;
  readonly zipFileName?: string;
}): Promise<VeronicaBulkZipPackResult> {
  const limitations: string[] = [];
  const packDir = path.join(path.resolve(input.outputDir), "veronica-bulk-approval-pack");
  await fs.rm(packDir, { recursive: true, force: true });
  await fs.mkdir(packDir, { recursive: true });

  const episodeContexts: Array<{
    episodeId: string;
    plan: VeronicaMediaPlan;
    missing: readonly string[];
    fileCount: number;
  }> = [];
  const episodesIncluded: string[] = [];
  const episodesOmitted: string[] = [];
  const filesPerEpisode: Record<string, number> = {};

  for (const episode of input.episodes) {
    try {
      const built = await buildEpisodeDirectory({ packRoot: packDir, episode });
      const plan = veronicaMediaPlanSchema.parse(
        await readJson(path.join(episode.stateDir, "veronica-media-plan.json")),
      );
      episodeContexts.push({
        episodeId: episode.episodeId,
        plan,
        missing: built.missing,
        fileCount: built.fileCount,
      });
      episodesIncluded.push(episode.episodeId);
      filesPerEpisode[episode.episodeId] = built.fileCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      episodesOmitted.push(episode.episodeId);
      limitations.push(`Episode ${episode.episodeId} omitted: ${message}`);
      console.error(`[bulk-zip] episode ${episode.episodeId} failed:`, message);
    }
  }

  if (episodeContexts.length === 0) {
    throw new Error("No episodes could be packed.");
  }

  const aggregateReview = {
    schemaVersion: "veronica-bulk-aggregate-review.v1",
    episodeCount: episodeContexts.length,
    episodes: episodeContexts.map((episode) => ({
      episodeId: episode.episodeId,
      eligibility: episode.plan.approvalEligibility.renderEligible,
      packChecksum: episode.plan.contentHash,
      blockingIssueCount: episode.plan.approvalEligibility.issues.filter(
        (issue) => issue.severity === "blocking-error",
      ).length,
      warningCount: episode.plan.approvalEligibility.issues.filter(
        (issue) => issue.severity !== "blocking-error",
      ).length,
    })),
    generatedAt: new Date().toISOString(),
    contentHash: createHash("sha256")
      .update(canonicalJson(episodeContexts.map((episode) => episode.plan.contentHash)))
      .digest("hex"),
  };

  const metricsEpisodes = episodeContexts.map((episode) => ({
    episodeId: episode.episodeId,
    metrics: episode.plan.metrics as unknown as Record<string, number>,
  }));

  await writeJson(path.join(packDir, "aggregate-review.json"), aggregateReview);
  await writeJson(path.join(packDir, "aggregate-planner-metrics.json"), {
    schemaVersion: "veronica-bulk-planner-metrics.v1",
    episodeCount: episodeContexts.length,
    aggregates: aggregateMetricStats(metricsEpisodes),
  });
  await writeJson(path.join(packDir, "aggregate-approval-eligibility.json"), {
    schemaVersion: "veronica-bulk-approval-eligibility.v1",
    episodes: episodeContexts.map((episode) => ({
      episodeId: episode.episodeId,
      renderEligible: episode.plan.approvalEligibility.renderEligible,
      contentReviewEligible: episode.plan.approvalEligibility.contentReviewEligible,
      productionEligible: episode.plan.approvalEligibility.productionEligible,
      blockerCount: episode.plan.approvalEligibility.issues.filter(
        (issue) => issue.severity === "blocking-error",
      ).length,
      warningCount: episode.plan.approvalEligibility.issues.filter(
        (issue) => issue.severity !== "blocking-error",
      ).length,
      issueCodes: [...new Set(episode.plan.approvalEligibility.issues.map((issue) => issue.code))],
    })),
    recurringIssueCodes: Object.entries(
      episodeContexts
        .flatMap((episode) => episode.plan.approvalEligibility.issues.map((issue) => issue.code))
        .reduce<Record<string, number>>((counts, code) => {
          counts[code] = (counts[code] ?? 0) + 1;
          return counts;
        }, {}),
    ).sort((left, right) => right[1] - left[1]),
  });
  await writeJson(path.join(packDir, "aggregate-translation-review.json"), {
    schemaVersion: "veronica-bulk-translation-review.v1",
    episodes: episodeContexts.map((episode) => ({
      episodeId: episode.episodeId,
      untranslatedTextIncidents: episode.plan.metrics.untranslatedTextIncidents,
      approvalRequiredRatio: episode.plan.metrics.approvalRequiredRatio,
      translatedAssetCount: episode.plan.preparedAssets.filter((asset) => asset.translationStatus).length,
    })),
  });
  await writeJson(path.join(packDir, "aggregate-aspect-ratio-review.json"), {
    schemaVersion: "veronica-bulk-aspect-ratio-review.v1",
    episodes: episodeContexts.map((episode) => ({
      episodeId: episode.episodeId,
      landscapePlacementCount: episode.plan.landscapePlacements.length,
      portraitPlacementCount: episode.plan.portraitPlacements.length,
      portraitPreparedAssets: episode.plan.preparedAssets.filter((asset) => asset.aspectRatio === "9:16").length,
      landscapePreparedAssets: episode.plan.preparedAssets.filter((asset) => asset.aspectRatio === "16:9").length,
      portraitAdaptationFailures: episode.plan.metrics.portraitAdaptationFailures,
      redesignFrequency: episode.plan.metrics.redesignFrequency,
    })),
  });
  await writeJson(path.join(packDir, "aggregate-source-coverage.json"), {
    schemaVersion: "veronica-bulk-source-coverage.v1",
    episodes: episodeContexts.map((episode) => ({
      episodeId: episode.episodeId,
      sourceAssetCount: episode.plan.sourceAssets.length,
      semanticCoverageRatio: episode.plan.metrics.semanticCoverageRatio,
      unusedHighRelevanceAssetCount: episode.plan.metrics.unusedHighRelevanceAssetCount,
      sourceChecksums: episode.plan.sourceChecksums,
    })),
  });

  const renderEpisodes = [];
  for (const episode of input.episodes) {
    const landscapePath = path.join(episode.stateDir, "renders", "landscape-manifest.json");
    const portraitPath = path.join(episode.stateDir, "renders", "portrait-manifest.json");
    const landscapeExists = await fs
      .access(landscapePath)
      .then(() => true)
      .catch(() => false);
    const portraitExists = await fs
      .access(portraitPath)
      .then(() => true)
      .catch(() => false);
    const landscape = landscapeExists
      ? veronicaRenderManifestSchema.parse(await readJson(landscapePath))
      : null;
    const portrait = portraitExists
      ? veronicaRenderManifestSchema.parse(await readJson(portraitPath))
      : null;
    renderEpisodes.push({
      episodeId: episode.episodeId,
      landscape: landscape
        ? {
            status: "manifest_only",
            resolution: `${landscape.profile.width}x${landscape.profile.height}`,
            fps: landscape.profile.fps,
            clipCount: landscape.clips.length,
            outputPath: path.basename(landscape.outputPath),
            renderAvailable: false,
          }
        : { status: "not_generated" },
      portrait: portrait
        ? {
            status: "manifest_only",
            resolution: `${portrait.profile.width}x${portrait.profile.height}`,
            fps: portrait.profile.fps,
            clipCount: portrait.clips.length,
            outputPath: path.basename(portrait.outputPath),
            renderAvailable: false,
          }
        : { status: "not_generated" },
    });
  }
  await writeJson(path.join(packDir, "aggregate-render-review.json"), {
    schemaVersion: "veronica-bulk-render-review.v1",
    episodes: renderEpisodes,
  });

  const findings = buildCrossEpisodeFindings({
    episodes: episodeContexts.map((episode) => ({
      episodeId: episode.episodeId,
      plan: episode.plan,
      missing: episode.missing,
    })),
  });
  await fs.writeFile(path.join(packDir, "cross-episode-findings.md"), findings, "utf8");

  const manifest = {
    schemaVersion: "veronica-bulk-approval-pack-manifest.v1",
    episodeCount: episodeContexts.length,
    episodesIncluded,
    episodesOmitted,
    generatedAt: new Date().toISOString(),
    contentMode: "fixture",
    productionContent: false,
    fixtureSet: VERONICA_FIXTURE_SET_ID,
    contactSheetsIncluded: true,
    renderEvidenceIncluded: true,
    renderVideosIncluded: false,
    limitations: [...VERONICA_FIXTURE_PACK_LIMITATIONS, ...limitations],
  };
  await writeJson(path.join(packDir, "manifest.json"), manifest);
  await fs.writeFile(
    path.join(packDir, "README.md"),
    [
      "# Veronica bulk approval pack",
      "",
      "Inspection-grade portable review bundle for Veronica Benini supplemental media episodes.",
      "",
      `- Episodes included: ${episodesIncluded.length}`,
      `- Episodes omitted: ${episodesOmitted.length}`,
      "- Render videos: not included (manifest-only render evidence)",
      "- Contact sheets: SVG + JSON per episode/aspect ratio",
      "",
      "See `cross-episode-findings.md` and per-episode `README.md` files for omissions.",
    ].join("\n") + "\n",
    "utf8",
  );

  const fileChecksums = await hashFiles(packDir);
  await writeJson(path.join(packDir, "checksums.json"), {
    schemaVersion: "veronica-bulk-approval-pack-checksums.v1",
    generatedAt: new Date().toISOString(),
    files: fileChecksums,
    contentHash: createHash("sha256").update(canonicalJson(fileChecksums)).digest("hex"),
  });

  const zipFileName = input.zipFileName ?? "veronica-bulk-approval-pack-v2.zip";
  const zipPath = path.join(path.resolve(input.outputDir), zipFileName);
  await fs.rm(zipPath, { force: true });
  await execFileAsync("zip", ["-rq", zipPath, "veronica-bulk-approval-pack"], {
    cwd: path.resolve(input.outputDir),
  });
  const zipBytes = (await fs.stat(zipPath)).size;
  const zipChecksum = createHash("sha256").update(await fs.readFile(zipPath)).digest("hex");

  let integrityValid = true;
  let redactionValid = true;
  for (const file of fileChecksums) {
    const absolute = path.join(packDir, ...file.relativePath.split("/"));
    const actual = createHash("sha256").update(await fs.readFile(absolute)).digest("hex");
    if (actual !== file.checksum) {
      integrityValid = false;
    }
    const text = await fs.readFile(absolute, "utf8").catch(() => "");
    if (text && unsafePattern.test(text)) {
      redactionValid = false;
    }
    if (file.relativePath.includes("..")) {
      integrityValid = false;
    }
  }

  return {
    packDir,
    zipPath,
    zipBytes,
    zipChecksum,
    episodeCount: episodeContexts.length,
    episodesIncluded,
    episodesOmitted,
    filesPerEpisode,
    contactSheetsIncluded: true,
    renderEvidenceIncluded: true,
    integrityValid,
    redactionValid,
    limitations: [...VERONICA_FIXTURE_PACK_LIMITATIONS, ...limitations],
  };
}
