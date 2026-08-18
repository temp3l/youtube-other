import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function words(value) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function distribution(values) {
  return [
    ...new Map(
      values.map((value) => [
        value,
        values.filter((other) => other === value).length,
      ])
    ).entries(),
  ]
    .map(([value, count]) => ({ value, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value)
    );
}

function signature(plan) {
  return plan.scenes.map((scene) => scene.narrativeFunction).join(",");
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  const [baselineDir, finalDir, outputDir] = process.argv.slice(2);
  if (!baselineDir || !finalDir || !outputDir) {
    throw new Error(
      "Usage: node scripts/build-veronica-unified-v3-semantic-review-pack.mjs <baseline-dir> <final-dir> <output-dir>"
    );
  }
  const baseline = path.resolve(baselineDir);
  const final = path.resolve(finalDir);
  const output = path.resolve(outputDir);
  try {
    await fs.lstat(output);
    throw new Error(`Review-pack output directory already exists: ${output}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const [
    baselineResults,
    finalResults,
    finalLedger,
    validation,
    contentManifest,
  ] = await Promise.all([
    readJson(path.join(baseline, "portfolio-results.json")),
    readJson(path.join(final, "portfolio-results.json")),
    readJson(path.join(final, "provider-ledger.json")),
    readJson(path.join(final, "portfolio-validation.v3.json")),
    readJson("content-packs/veronica-unified-content-pack-v3/manifest.json"),
  ]);
  if (
    finalResults.corpusValidation.status !== "pass" ||
    validation.status !== "pass"
  ) {
    throw new Error("Refusing to package a failing V3 corpus validation run.");
  }
  if (
    finalLedger.providerRequests !== 0 ||
    finalLedger.attemptedDispatches !== 0 ||
    finalLedger.paidCostUsd !== 0
  ) {
    throw new Error("Refusing to package a non-zero-provider run.");
  }
  const root = path.join(output, "veronica-unified-v3-en-semantic-review-pack");
  await fs.mkdir(path.join(root, "STORY-EVIDENCE"), { recursive: true });
  await fs.mkdir(path.join(root, "STORIES"), { recursive: true });
  const plans = [];
  for (const result of finalResults.results) {
    const plan = await readJson(path.join(final, result.planPath));
    plans.push(plan);
    await fs.writeFile(
      path.join(root, "STORIES", `${result.storyId}.json`),
      `${JSON.stringify(plan, null, 2)}\n`
    );
    await fs.writeFile(
      path.join(root, "STORY-EVIDENCE", `${result.storyId}.json`),
      `${JSON.stringify(
        {
          storyId: result.storyId,
          format: result.format,
          sourceHash: result.sourceHash,
          planHash: result.planHash,
          validation: result.validation,
          subjectPlan: plan.subjectPlan,
          sceneCount: plan.scenes.length,
          baseVisualStateCount: plan.cadence.baseVisualStateCount,
          semanticNoveltyCount: plan.cadence.semanticNoveltyCount,
          thumbnail: plan.thumbnail,
        },
        null,
        2
      )}\n`
    );
  }
  const shorts = contentManifest.stories.filter(
    (story) => story.format === "short"
  );
  const timing = await Promise.all(
    shorts.map(async (story) => {
      const narration = await fs.readFile(
        path.join(
          "content-packs/veronica-unified-content-pack-v3",
          story.paths.en
        ),
        "utf8"
      );
      const count = words(narration);
      const status =
        count <= 225 ? "preferred" : count <= 230 ? "warning" : "blocked";
      return {
        id: story.id,
        wordCount: count,
        nominalWpm: 155,
        estimatedSeconds: Math.round((count / 155) * 60 * 10) / 10,
        status,
      };
    })
  );
  const sceneValues = plans.flatMap((plan) => plan.scenes);
  const finalMetrics = {
    malformedEvidenceArtifactPrompts: plans
      .flatMap((plan) => plan.assets)
      .filter((asset) => /\bevidence artifact\b/iu.test(asset.prompt)).length,
    genericSemanticBoilerplate: sceneValues.filter((scene) =>
      /a buyer observes how .*changes whether an expert is understood and chosen|decorative restatement/iu.test(
        scene.proposition
      )
    ).length,
    shortSignatureDistribution: distribution(
      plans.filter((plan) => plan.format === "short").map(signature)
    ),
    treatmentDistribution: distribution(
      sceneValues.map((scene) => scene.treatment.strategy)
    ),
    cameraDistribution: distribution(
      sceneValues.map((scene) => scene.treatment.camera)
    ),
    environmentDistribution: distribution(
      sceneValues.map((scene) => scene.treatment.environment)
    ),
    compositionDistribution: distribution(
      sceneValues.map((scene) => scene.treatment.composition)
    ),
    thumbnailDistribution: distribution(
      plans.map((plan) => plan.thumbnail.centralContradiction.toLowerCase())
    ),
    storiesWithSubjectChurn: plans.filter(
      (plan) =>
        new Set(
          plan.scenes
            .map((scene) => scene.subject.primaryIdentityId)
            .filter(Boolean)
        ).size > 2
    ).length,
    longBaseVisualStates: plans
      .filter((plan) => plan.format === "long")
      .map((plan) => plan.cadence.baseVisualStateCount),
  };
  const baselinePlans = await Promise.all(
    baselineResults.results.map((result) =>
      readJson(path.join(baseline, result.planPath))
    )
  );
  const baselineText = JSON.stringify(baselinePlans);
  const summary = {
    schemaVersion: "veronica-unified-v3-semantic-review-pack.v1",
    corpus: { longs: 18, shorts: 36, total: 54 },
    sourcePackId: finalResults.canonicalPackId,
    freshPlanner: {
      runtimePlannerHash: finalResults.runtimePlannerHash,
      coverage: finalResults.corpusValidation,
      portfolioValidation: validation.status,
    },
    providerLedger: finalLedger,
    baseline: {
      freshV2Coverage: baselineResults.corpusValidation,
      malformedEvidenceArtifactPrompts: (
        baselineText.match(/evidence artifact/giu) ?? []
      ).length,
      genericBuyerPositioningBoilerplate: (
        baselineText.match(
          /changes whether an expert is understood and chosen/giu
        ) ?? []
      ).length,
      note: "Counts are fresh V2 artifact-string occurrences; prior review's scene-level counts remain documented in SYSTEMIC-FINDINGS.md.",
    },
    final: finalMetrics,
    timing,
  };
  const markdown = {
    "README.md": `# Veronica Unified V3 English semantic review\n\nFresh deterministic V3 plans for 54 English stories. This pack is zero-provider: no TTS, image generation, remote QA, render, or network dispatch ran.\n`,
    "PORTFOLIO-CENSUS.md": `# Portfolio census\n\n- Longs: 18\n- Shorts: 36\n- Total: 54\n- Fresh V3 plan coverage: ${finalResults.corpusValidation.plannedStories}/54\n`,
    "SYSTEMIC-FINDINGS.md": `# Systemic findings\n\nConfirmed baseline: universal Short signature (36/36), generic positioning wrapper (177/486 scenes), legacy evidence-artifact extraction (486/486 prompts), subject churn (39/54), seven thumbnail concepts, and 21 Shorts above 230 words. V3 removes the malformed prompt and generic-wrapper classes, derives functions from narration spans, records continuity, and validates the portfolio.\n`,
    "BEFORE-AFTER.md": `# Before / after\n\n| Metric | Before | After |\n| --- | ---: | ---: |\n| Malformed evidence-artifact prompts | 486 scenes | ${finalMetrics.malformedEvidenceArtifactPrompts} |\n| Generic positioning wrapper | 177 scenes | ${finalMetrics.genericSemanticBoilerplate} |\n| Universal Short signature | 36/36 | ${finalMetrics.shortSignatureDistribution[0]?.count ?? 0}/36 top signature |\n| Subject churn | 39/54 | ${finalMetrics.storiesWithSubjectChurn}/54 |\n| Timing blockers (>230 words) | 21 | ${timing.filter((entry) => entry.status === "blocked").length} |\n| Fresh planner coverage | 0/54 | ${finalResults.corpusValidation.plannedStories}/54 |\n`,
    "PROVIDER-AUDIT.md": `# Provider audit\n\n- Paid provider requests: 0\n- Attempted network dispatches: 0\n- Paid provider cost: $0\n- Provider requests allowed: false\n`,
    "IMPLEMENTATION-CHANGES.md": `# Implementation changes\n\nThe packaged CLI now verifies rebuilt domain, strategic-reinvention, and CLI artifacts before source-pack planning. V3 uses source-span propositions, semantic narrative functions, concrete optional evidence objects, explicit subject continuity, base-state and semantic-novelty accounting, portfolio concentration checks, and source-specific thumbnail concepts.\n`,
    "PORTFOLIO-DIVERSITY.md": `# Portfolio diversity\n\nV3 distribution is recorded in PORTFOLIO-SUMMARY.json and portfolio-validation.v3.json. The highest treatment count is ${finalMetrics.treatmentDistribution[0]?.count ?? 0}/${sceneValues.length}; no measured concentration exceeded the validator threshold. Short signatures are content-derived; the largest signature group is ${finalMetrics.shortSignatureDistribution[0]?.count ?? 0}/36. Long base-state count is ${Math.min(...finalMetrics.longBaseVisualStates)}–${Math.max(...finalMetrics.longBaseVisualStates)}.\n`,
    "TIMING-REPORT.md": `# Timing report\n\n| ID | Words | WPM | Est. seconds | Headroom | Narration changed |\n| --- | ---: | ---: | ---: | --- | --- |\n${timing
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (entry) =>
          `| ${entry.id} | ${entry.wordCount} | ${entry.nominalWpm} | ${entry.estimatedSeconds} | ${entry.status} | ${["osc-s01b", "osc-s03a", "osc-s03b", "osc-s04a", "osc-s04b", "osc-s05a", "osc-s05b", "osc-s06a", "osc-s07a", "osc-s08a", "pos-l02-s01", "pos-l03-s02", "pos-l03-s03", "pos-l04-s03", "pos-l05-s01", "pos-l05-s02", "pos-l06-s01", "pos-l06-s02", "pos-l06-s03", "tx-s021", "tx-s027"].includes(entry.id) ? "yes" : "no"} |`
      )
      .join("\n")}\n`,
  };
  for (const [name, value] of Object.entries(markdown))
    await fs.writeFile(path.join(root, name), value, "utf8");
  await fs.writeFile(
    path.join(root, "PORTFOLIO-SUMMARY.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  await fs.writeFile(
    path.join(root, "STORY-ISSUES.json"),
    `${JSON.stringify(
      plans.map((plan) => ({
        storyId: plan.contentId,
        status: plan.validation.status,
        findings: plan.validation.findings,
      })),
      null,
      2
    )}\n`
  );
  await fs.copyFile(
    path.join(final, "portfolio-validation.v3.json"),
    path.join(root, "portfolio-validation.v3.json")
  );
  const files = (await fs.readdir(root, { recursive: true }))
    .filter((file) => typeof file === "string")
    .sort();
  const fileHashes = {};
  for (const file of files) {
    const absolute = path.join(root, file);
    if ((await fs.stat(absolute)).isFile())
      fileHashes[file] = sha256(await fs.readFile(absolute, "utf8"));
  }
  await fs.writeFile(
    path.join(root, "MANIFEST.json"),
    `${JSON.stringify({ schemaVersion: "veronica-unified-v3-semantic-review-pack-manifest.v1", sourceRun: path.relative(process.cwd(), final), baselineRun: path.relative(process.cwd(), baseline), providerLedger: finalLedger, files: fileHashes }, null, 2)}\n`
  );
  await execFileAsync(
    "zip",
    [
      "-qr",
      "veronica-unified-v3-en-semantic-review-pack.zip",
      path.basename(root),
    ],
    { cwd: output }
  );
  process.stdout.write(
    `${path.join(output, "veronica-unified-v3-en-semantic-review-pack.zip")}\n`
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
});
