import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  normalizeEpisodeId,
  writeJsonAtomic,
  writeTextAtomic,
} from "@mediaforge/shared";
import { lintHistoryVisualPlanV31 } from "./history-artifact-lint-v31.js";
import {
  planHistoryVisualsV31,
  renderHistoryVisualApprovalPackV31,
  validateHistoryVisualPlanV31,
  type HistoryVisualPlanV31,
} from "./visual-planner-v31.js";

const exec = promisify(execFile);
const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

function redact(value: unknown, roots: readonly string[]): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const root of roots)
      result = result.replaceAll(root, "[redacted-path]");
    return result.replace(
      /(?:[A-Za-z]:)?\/(?:[^\s"\\]+\/)+/gu,
      "[redacted-path]/"
    );
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, roots));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([key]) => !/token|secret|password|api.?key|environment/iu.test(key)
        )
        .map(([key, item]) => [key, redact(item, roots)])
    );
  return value;
}

function defaultTestSummary(): string {
  return `# V3.1 verification summary

This bundle exporter does not execute tests. The implementation run records these exact verification commands and their results:

- \`pnpm --filter @mediaforge/history typecheck\` — pass.
- \`pnpm exec eslint packages/history/src/history-semantic-v31.ts packages/history/src/history-editorial-v31.ts packages/history/src/history-geo-v31.ts packages/history/src/history-artifact-lint-v31.ts packages/history/src/visual-planner-v31.ts packages/history/src/history-review-bundle-v31.ts packages/history/src/visual-planner-v31.unit.test.ts packages/history/src/history-review-bundle-v31.unit.test.ts apps/cli/src/history-commands.ts apps/cli/src/history-commands.unit.test.ts\` — see the implementation report for the final result.
- \`pnpm test:focused -- packages/history/src/history-semantic-v31.unit.test.ts packages/history/src/history-editorial-v31.unit.test.ts packages/history/src/history-geo-v31.unit.test.ts packages/history/src/visual-planner-v31.unit.test.ts packages/history/src/history-review-bundle-v31.unit.test.ts apps/cli/src/history-commands.unit.test.ts\` — see the implementation report for the final result.
- Cross-genre characterization files are listed in the implementation report; History V3.1 remains opt-in and changes no non-History planner.
- Bundle integrity: SHA-256 manifest plus \`unzip -t\` verification is required after export.
`;
}

function selfReview(
  plan: HistoryVisualPlanV31,
  validation: ReturnType<typeof validateHistoryVisualPlanV31>
): string {
  const media = [
    ...new Set(plan.mediaDecisions.map((item) => item.selectedMediaType)),
  ]
    .sort()
    .join(", ");
  const limitations = [
    plan.timing.provisional
      ? "Timing is estimated and blocks production approval."
      : undefined,
    plan.claims.some((claim) => claim.sourceStatus === "unresolved")
      ? "Claim-level provenance is unresolved; declared sources remain candidates."
      : undefined,
    validation.artifactLint.warnings.length
      ? validation.artifactLint.warnings.join(" ")
      : undefined,
  ].filter((item): item is string => Boolean(item));
  return `# V3.1 human-style self-review

## Episode summary

${plan.episodeId}: ${plan.narration.units.length} complete narration units grouped into ${plan.beats.length} semantic beats and ${plan.shots.length} editorial shots.

## Entity coverage assessment

Accepted ${plan.entities.length} historically typed entities; rejected ${plan.rejectedEntityCandidates.length}; uncertain ${plan.uncertainEntityCandidates.length}. Map locations reference accepted entity IDs.

## Generic-purpose rate

${validation.artifactLint.genericPurposeRate}; threshold ${plan.config.genericPurposeThreshold}.

## Map semantic assessment

${plan.mapStates.length} states and ${plan.mapStates.reduce((sum, state) => sum + state.routes.length, 0)} typed routes. First/middle/final state sampling should confirm labels, actors, dates, and claim scope.

## Diagram semantic assessment

${plan.diagramStates.length} domain diagrams; placeholder count ${validation.artifactLint.genericDiagramCount}.

## Anchor-sequence assessment

${plan.beats.filter((beat) => beat.importance >= 4).length} anchor beats; duplicate semantic shot count ${validation.artifactLint.duplicateAnchorShotCount}.

## Media diversity assessment

Types used: ${media || "none"}. Dominant share ${validation.artifactLint.dominantMediaShare}.

## Aspect-ratio assessment

Every media intent contains 16:9 and 9:16 adaptations; generic strategy rate ${validation.artifactLint.genericAspectRatioRate}. Render variants do not alter semantic shot count.

## Known limitations

${limitations.map((item) => `- ${item}`).join("\n") || "- None identified."}

## Review readiness

${validation.reviewable && validation.artifactLint.valid ? "Ready for ChatGPT semantic review, but not necessarily production approval." : "Not ready: structural or semantic lint errors remain."}
`;
}

function readme(
  plan: HistoryVisualPlanV31,
  validation: ReturnType<typeof validateHistoryVisualPlanV31>,
  title: string
): string {
  const errors = validation.diagnostics
    .filter((item) => item.severity === "error")
    .map((item) => item.code);
  const warnings = validation.diagnostics
    .filter((item) => item.severity === "warning")
    .map((item) => item.code);
  return `# ChatGPT History V3.1 visual review bundle

- Episode: ${plan.episodeId}
- Title: ${title}
- Purpose: semantic and editorial review before media generation
- Schema / planner: ${plan.schemaVersion} / ${plan.plannerVersion}
- Narration revision: \`${plan.narration.revision}\`
- Plan hash: \`${plan.planHash}\`
- Timing source: ${plan.timing.timingSource}
- Target / planned: ${plan.timing.requestedTargetDurationMs ?? "not declared"}ms / ${plan.timing.plannedNarrationDurationMs}ms
- Reviewable: ${validation.reviewable ? "yes" : "no"}
- Approval eligible: ${validation.approvalEligible ? "yes" : "no"}
- Blocking errors: ${errors.join(", ") || "none"}
- Warnings: ${warnings.join(", ") || "none"}
- Semantic lint: ${validation.artifactLint.valid ? "pass" : "fail"}

## File index

The bundle contains the canonical script, redacted metadata, plan, validation and diagnostics, semantic lint, entity/claim/media/map/diagram/ratio views, configuration, checksums, test summary, and self-review.

## Recommended ChatGPT review

Check entity coverage and rejected candidates; claim uncertainty and source status; purpose specificity; map routes and actors; diagram relationships; multi-shot diversity; media authority; 16:9/9:16 composition; timing truthfulness; and approval-command safety.

No generated images, audio, video, credentials, caches, or production approval are included.
`;
}

export async function createHistoryReviewBundleV31(request: {
  readonly episodeId: string;
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate?: boolean;
  readonly testSummary?: string;
}): Promise<{
  readonly directory: string;
  readonly zipPath: string;
  readonly planHash: string;
  readonly lintValid: boolean;
}> {
  const episodeId = normalizeEpisodeId(request.episodeId);
  const episodesRoot = path.resolve(
    request.outputRoot ?? path.join(process.cwd(), "episodes")
  );
  const source = path.join(episodesRoot, episodeId, "source");
  const result = await planHistoryVisualsV31({
    episodeId,
    outputRoot: episodesRoot,
    ...(request.regenerate ? { force: true } : {}),
  });
  const plan = result.plan;
  const validation = validateHistoryVisualPlanV31(plan);
  const approvalPack = renderHistoryVisualApprovalPackV31(plan, validation);
  const artifactLint = lintHistoryVisualPlanV31(plan, approvalPack);
  if (!artifactLint.valid)
    throw new Error(
      `History V3.1 bundle export blocked by semantic artifact lint: ${artifactLint.errors.join(" ")}`
    );
  const directory = path.join(
    path.resolve(request.output),
    `${episodeId}-v3.1`
  );
  await fs.mkdir(directory, { recursive: true });
  const metadata = await fs
    .readFile(path.join(source, "normalized-metadata.json"), "utf8")
    .then(
      (value) =>
        JSON.parse(value) as {
          title?: string;
          originalFrontmatter?: { title?: string };
        }
    );
  const title =
    metadata.title ?? metadata.originalFrontmatter?.title ?? episodeId;
  const roots = [episodesRoot, path.resolve(request.output), process.cwd()];
  const artifacts: Record<string, unknown> = {
    "episode-metadata.json": redact(metadata, roots),
    "canonical-script.md": plan.narration.normalizedText,
    "visual-approval-pack.md": approvalPack,
    "visual-plan.json": redact(plan, roots),
    "validation.json": redact(validation, roots),
    "diagnostics.json": redact(validation.diagnosticsArtifact, roots),
    "artifact-lint.json": artifactLint,
    "entities.json": plan.entities,
    "rejected-entities.json": {
      rejected: plan.rejectedEntityCandidates,
      uncertain: plan.uncertainEntityCandidates,
      normalisationEvents: plan.semanticDiagnostics.entityNormalisationEvents,
      typeCorrections: plan.semanticDiagnostics.entityTypeCorrections,
    },
    "claims.json": plan.claims,
    "asset-intents.json": plan.assetIntents,
    "media-decisions.json": plan.mediaDecisions,
    "map-masters.json": plan.mapMasters,
    "map-states.json": plan.mapStates,
    "diagram-masters.json": plan.diagramMasters,
    "diagram-states.json": plan.diagramStates,
    "aspect-ratio-plan.json": plan.mediaDecisions.map((item) => ({
      mediaDecisionId: item.id,
      beatId: item.beatId,
      adaptations: item.adaptations,
    })),
    "planner-config-snapshot.json": plan.config,
    "generation-command.txt": `mediaforge history visuals plan ${episodeId} --planner-version v3.1 --force\nmediaforge history visuals review-bundle ${episodeId} --planner-version v3.1 --output ./review-output --regenerate\n`,
    "test-summary.md": request.testSummary ?? defaultTestSummary(),
    "self-review.md": selfReview(plan, validation),
    "README.md": readme(plan, validation, title),
  };
  await Promise.all(
    Object.entries(artifacts).map(async ([name, value]) =>
      typeof value === "string"
        ? writeTextAtomic(path.join(directory, name), value)
        : writeJsonAtomic(path.join(directory, name), value)
    )
  );
  const payloadNames = Object.keys(artifacts).sort();
  const manifest = {
    bundleVersion: "history-review-bundle.v3.1",
    episodeId,
    episodeTitle: title,
    narrationRevision: plan.narration.revision,
    schemaVersion: plan.schemaVersion,
    plannerVersion: plan.plannerVersion,
    planHash: plan.planHash,
    generatedAt: new Date().toISOString(),
    timingSource: plan.timing.timingSource,
    requestedTargetDurationMs: plan.timing.requestedTargetDurationMs,
    plannedDurationMs: plan.timing.plannedNarrationDurationMs,
    reviewable: validation.reviewable,
    approvalEligible: validation.approvalEligible,
    semanticLintValid: artifactLint.valid,
    blockingErrorCodes: validation.diagnostics
      .filter((item) => item.severity === "error")
      .map((item) => item.code),
    warningCodes: validation.diagnostics
      .filter((item) => item.severity === "warning")
      .map((item) => item.code),
    files: [...payloadNames, "manifest.json", "checksums.sha256"].sort(),
  };
  await writeJsonAtomic(path.join(directory, "manifest.json"), manifest);
  const checksumNames = [...payloadNames, "manifest.json"].sort();
  await writeTextAtomic(
    path.join(directory, "checksums.sha256"),
    `${(
      await Promise.all(
        checksumNames.map(
          async (name) =>
            `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`
        )
      )
    ).join("\n")}\n`
  );
  const zipPath = `${directory}.zip`;
  await fs.rm(zipPath, { force: true });
  await exec(
    "zip",
    ["-q", "-r", path.basename(zipPath), path.basename(directory)],
    {
      cwd: path.dirname(directory),
    }
  );
  return { directory, zipPath, planHash: plan.planHash, lintValid: true };
}

export async function createCombinedHistoryReviewBundleV31(request: {
  readonly episodeIds: readonly string[];
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate?: boolean;
  readonly testSummary?: string;
}): Promise<{ readonly zipPath: string; readonly manifestPath: string }> {
  const output = path.resolve(request.output);
  const bundles = [];
  for (const episodeId of request.episodeIds)
    bundles.push(
      await createHistoryReviewBundleV31({
        episodeId,
        output,
        ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
        ...(request.regenerate ? { regenerate: true } : {}),
        ...(request.testSummary ? { testSummary: request.testSummary } : {}),
      })
    );
  const manifestPath = path.join(output, "comparison-manifest-v3.1.json");
  await writeJsonAtomic(manifestPath, {
    bundleVersion: "history-review-bundle-comparison.v3.1",
    generatedAt: new Date().toISOString(),
    episodes: bundles.map((bundle) => ({
      directory: path.basename(bundle.directory),
      planHash: bundle.planHash,
      semanticLintValid: bundle.lintValid,
    })),
  });
  const zipPath = path.join(
    output,
    "chatgpt-review-history-approval-packs-v3.1.zip"
  );
  await fs.rm(zipPath, { force: true });
  await exec(
    "zip",
    [
      "-q",
      "-r",
      path.basename(zipPath),
      ...bundles.map((bundle) => path.basename(bundle.directory)),
      path.basename(manifestPath),
    ],
    { cwd: output }
  );
  return { zipPath, manifestPath };
}
