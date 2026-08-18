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

function tuple(scene) {
  return [scene.treatment.strategy, scene.treatment.environment, scene.treatment.composition, scene.treatment.camera].join(" | ");
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
          visualDirectionHash: result.visualDirectionHash,
          planHash: result.planHash,
          validation: result.validation,
          subjectPlan: plan.subjectPlan,
          sceneCount: plan.scenes.length,
          baseVisualStateCount: plan.cadence.baseVisualStateCount,
          semanticNoveltyCount: plan.cadence.semanticNoveltyCount,
          semanticStateCount: plan.cadence.semanticStateCount,
          trueMultiStateAssetCount: plan.cadence.trueMultiStateAssetCount,
          thumbnail: plan.thumbnail,
          editorialReview: {
            status: "not-synthesized",
            method: "Deterministic validation only; numeric editorial scoring is deliberately unavailable in this zero-provider pack.",
          },
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
  const assetValues = plans.flatMap((plan) => plan.assets);
  const characterScenes = sceneValues.filter((scene) => scene.subject.mode === "character-led");
  const weakEvidencePattern = /^(?:book|order|page|product|proposal|website|same product|this product|important product|after product|improves comparison)$/iu;
  const jointTuples = distribution(sceneValues.map(tuple));
  const adjacentTuples = distribution(plans.flatMap((plan) => {
    const values = plan.scenes.map(tuple);
    return values.slice(1).map((value, index) => `${values[index]} => ${value}`);
  }));
  const subjectModeDistribution = distribution(sceneValues.map((scene) => scene.subject.mode));
  const longMetrics = plans.filter((plan) => plan.format === "long").map((plan) => ({
    storyId: plan.contentId,
    baseAssetCount: plan.assets.length,
    semanticStateCount: plan.visualStates.length,
    motionEventCount: plan.visualEvents.length,
    averageSemanticStateDurationMs: Math.round(plan.visualStates.reduce((sum, state) => sum + state.durationMs, 0) / plan.visualStates.length),
    longestSemanticStateDurationMs: Math.max(...plan.visualStates.map((state) => state.durationMs)),
    trueMultiStateAssets: plan.assets.filter((asset) => asset.multiState !== null).length,
    estimatedPaidImageCount: plan.assets.length,
  }));
  const finalMetrics = {
    totalScenes: sceneValues.length,
    propositionCopyDepictions: sceneValues.filter((scene) => scene.proposition === scene.depiction?.description || scene.proposition === scene.visualizableClaim).length,
    abstractOrNonvisualDepictions: plans.flatMap((plan) => plan.validation.findings).filter((finding) => finding.code === "DEPICTION_NOT_CONCRETE").length,
    subjectModeDistribution,
    characterLedPromptContinuityCoverage: {
      covered: characterScenes.filter((scene) => {
        const prompt = assetValues.find((asset) => asset.sceneId === scene.sceneId)?.prompt ?? "";
        return scene.subject.primaryIdentityId && prompt.includes(scene.subject.primaryIdentityId);
      }).length,
      total: characterScenes.length,
    },
    weakEvidenceObjects: sceneValues.filter((scene) => scene.evidenceNeed.objectPhrase && weakEvidencePattern.test(scene.evidenceNeed.objectPhrase)).length,
    concreteProviderPrompts: assetValues.filter((asset) => /Depict:|Primary subject:|Visible action:/u.test(asset.prompt)).length,
    jointTupleDistribution: jointTuples,
    adjacentTupleDistribution: adjacentTuples,
    longMetrics,
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
    trueMultiStateAssets: assetValues.filter((asset) => asset.multiState !== null).length,
  };
  const baselinePlans = await Promise.all(
    baselineResults.results.map((result) =>
      readJson(path.join(baseline, result.planPath))
    )
  );
  const baselineText = JSON.stringify(baselinePlans);
  const baselineScenes = baselinePlans.flatMap((plan) => plan.scenes ?? []);
  const baselineMetrics = {
    totalScenes: baselineScenes.length,
    propositionCopyDepictions: baselineScenes.filter((scene) => scene.proposition === (scene.depiction?.description ?? scene.visualizableClaim)).length,
    characterLedScenes: baselineScenes.filter((scene) => scene.subject?.mode === "character-led").length,
    identityPromptCoverage: baselinePlans.reduce((count, plan) => count + plan.scenes.filter((scene) => {
      const prompt = plan.assets.find((asset) => asset.sceneId === scene.sceneId)?.prompt ?? "";
      return scene.subject?.primaryIdentityId && prompt.includes(scene.subject.primaryIdentityId);
    }).length, 0),
    jointTupleCount: new Set(baselineScenes.map(tuple)).size,
    trueMultiStateAssets: baselinePlans.flatMap((plan) => plan.assets ?? []).filter((asset) => asset.multiState !== null && asset.multiState !== undefined).length,
    hashOnlyThumbnailDistinctions: baselinePlans.filter((plan) => /^source claim [a-f0-9]+$/iu.test(plan.thumbnail?.distinctFromNeighboringEpisodes ?? "")).length,
  };
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
      ...baselineMetrics,
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
    "README.md": `# Veronica Unified V3 English visual-direction review\n\nFresh deterministic provider-ready plans for 54 English stories. This pack is zero-provider: no TTS, image generation, remote QA, render, publication, or network dispatch ran. Paid generation remains unauthorized pending independent review.\n`,
    "PORTFOLIO-CENSUS.md": `# Portfolio census\n\n- Longs: 18\n- Shorts: 36\n- Total: 54\n- Fresh V3 plan coverage: ${finalResults.corpusValidation.plannedStories}/54\n`,
    "SYSTEMIC-FINDINGS.md": `# Systemic findings\n\nThe fresh before-run reproduced ${baselineMetrics.propositionCopyDepictions}/${baselineMetrics.totalScenes} proposition-copy visual directions, ${baselineMetrics.characterLedScenes}/${baselineMetrics.totalScenes} character-led scenes, ${baselineMetrics.identityPromptCoverage} prompts with an operational identity key, ${baselineMetrics.jointTupleCount} full visual tuples, ${baselineMetrics.trueMultiStateAssets} true multi-state assets, and ${baselineMetrics.hashOnlyThumbnailDistinctions}/54 hash-only thumbnail distinctions. The final compiler uses reviewed story direction, structured depictions, semantic subject modes, crop-safe long-form states, state-derived choreography, joint portfolio analysis, and editorial thumbnail distinctions.\n`,
    "BEFORE-AFTER.md": `# Before / after\n\n| Metric | Before | After |\n| --- | ---: | ---: |\n| Proposition copied as visual direction | ${baselineMetrics.propositionCopyDepictions}/${baselineMetrics.totalScenes} | ${finalMetrics.propositionCopyDepictions}/${finalMetrics.totalScenes} |\n| Character-led scenes | ${baselineMetrics.characterLedScenes}/${baselineMetrics.totalScenes} | ${subjectModeDistribution.find((entry) => entry.value === "character-led")?.count ?? 0}/${finalMetrics.totalScenes} |\n| Character identity encoded in prompt | ${baselineMetrics.identityPromptCoverage} | ${finalMetrics.characterLedPromptContinuityCoverage.covered}/${finalMetrics.characterLedPromptContinuityCoverage.total} |\n| Distinct full visual tuples | ${baselineMetrics.jointTupleCount} | ${jointTuples.length} |\n| True multi-state assets | ${baselineMetrics.trueMultiStateAssets} | ${finalMetrics.trueMultiStateAssets} |\n| Hash-only thumbnail distinctions | ${baselineMetrics.hashOnlyThumbnailDistinctions}/54 | ${plans.filter((plan) => /^source claim /iu.test(plan.thumbnail.distinctFromNeighboringEpisodes)).length}/54 |\n| Shorts above 225 words | 14 | ${timing.filter((entry) => entry.wordCount > 225).length} |\n| Fresh planner coverage | 54/54 | ${finalResults.corpusValidation.plannedStories}/54 |\n`,
    "PROVIDER-AUDIT.md": `# Provider audit\n\n- Paid provider requests: 0\n- Attempted network dispatches: 0\n- Paid provider cost: $0\n- Provider requests allowed: false\n`,
    "IMPLEMENTATION-CHANGES.md": `# Implementation changes\n\nAdded a schema-validated visual-direction source for all 54 stories and carried its hash through canonical source admission, source revision, fresh-run results, and plan hashes. The V3 compiler now emits structured depictions and concrete prompts, scene-specific subject modes, operational identity continuity, semantic treatment variants, genuine three-region long assets, state-derived motion, specific thumbnails, and joint-distribution validation. Only the 14 warning Shorts were trimmed.\n`,
    "PORTFOLIO-DIVERSITY.md": `# Portfolio diversity\n\n- Full treatment/environment/composition/camera tuples: ${jointTuples.length}; top tuple ${jointTuples[0]?.count ?? 0}/${sceneValues.length}.\n- Top adjacent tuple transition: ${adjacentTuples[0]?.count ?? 0}/${Math.max(1, adjacentTuples.reduce((sum, entry) => sum + entry.count, 0))}.\n- Story-sequence similarity evidence: ${JSON.stringify(validation.distributions.storySequenceSimilarity ?? [])}.\n- Subject modes: ${subjectModeDistribution.map((entry) => `${entry.value}=${entry.count}`).join(", ")}.\n- Environments: ${finalMetrics.environmentDistribution.length}; cameras: ${finalMetrics.cameraDistribution.length}.\n- Thumbnail exact-concept distribution top count: ${finalMetrics.thumbnailDistribution[0]?.count ?? 0}.\n\nSee PORTFOLIO-SUMMARY.json and portfolio-validation.json for complete distributions and findings.\n`,
    "TIMING-REPORT.md": `# Timing report\n\n| ID | Words | WPM | Est. seconds | Headroom | Narration changed |\n| --- | ---: | ---: | ---: | --- | --- |\n${timing
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (entry) =>
          `| ${entry.id} | ${entry.wordCount} | ${entry.nominalWpm} | ${entry.estimatedSeconds} | ${entry.status} | ${["osc-s01a", "osc-s02a", "osc-s02b", "osc-s06b", "osc-s07b", "osc-s08b", "pos-l01-s01", "pos-l01-s02", "pos-l01-s03", "pos-l02-s02", "pos-l03-s01", "pos-l04-s01", "pos-l04-s02", "pos-l05-s03"].includes(entry.id) ? "yes" : "no"} |`
      )
      .join("\n")}\n`,
    "VISUAL-GROUNDING-REPORT.md": `# Visual grounding report\n\n- Total scenes: ${finalMetrics.totalScenes}\n- Proposition equals final depiction: ${finalMetrics.propositionCopyDepictions}\n- Abstract/nonvisual depiction findings: ${finalMetrics.abstractOrNonvisualDepictions}\n- Subject modes: ${subjectModeDistribution.map((entry) => `${entry.value}=${entry.count}`).join(", ")}\n- Character-led prompt continuity: ${finalMetrics.characterLedPromptContinuityCoverage.covered}/${finalMetrics.characterLedPromptContinuityCoverage.total}\n- Weak evidence-object findings: ${finalMetrics.weakEvidenceObjects}\n- Concrete provider prompts: ${finalMetrics.concreteProviderPrompts}/${assetValues.length}\n\nBefore, narration prose was repeated after “Visible claim.” After, each prompt names a primary subject, action, concrete objects, environment, spatial relationship, composition, camera, and semantic focus; character prompts also carry the stable identity key and visible description.\n`,
    "LONG-MULTISTATE-REPORT.md": `# Long multi-state report\n\n| Story | Base assets | Semantic states | Motion events | Avg state ms | Longest state ms | True multi-state assets | Est. paid images |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${longMetrics.map((entry) => `| ${entry.storyId} | ${entry.baseAssetCount} | ${entry.semanticStateCount} | ${entry.motionEventCount} | ${entry.averageSemanticStateDurationMs} | ${entry.longestSemanticStateDurationMs} | ${entry.trueMultiStateAssets} | ${entry.estimatedPaidImageCount} |`).join("\n")}\n`,
    "TEMPLATE-AUDIT.md": `# Template audit\n\n- Environment sequence patterns: ${JSON.stringify(validation.distributions.environmentSequence ?? [])}\n- Intent breakpoint patterns: ${JSON.stringify(validation.distributions.intentBreakpointPattern ?? [])}\n- Subject sequence patterns: ${JSON.stringify(validation.distributions.subjectSequence ?? [])}\n- Primary-action shells: ${JSON.stringify(validation.distributions.primaryActionShell ?? [])}\n- Semantic-state role sequences: ${JSON.stringify(validation.distributions.semanticStateRoleSequence ?? [])}\n- Motion sequences: ${JSON.stringify(validation.distributions.motionSequence ?? [])}\n- Thumbnail action templates: ${JSON.stringify(validation.distributions.thumbnailActionTemplate ?? [])}\n- Thumbnail composition templates: ${JSON.stringify(validation.distributions.thumbnailCompositionTemplate ?? [])}\n- Thumbnail title-relationship templates: ${JSON.stringify(validation.distributions.thumbnailTitleRelationshipTemplate ?? [])}\n\nEach long semantic state has renderer-usable normalized crop geometry validated for bounds, 16:9-source aspect, focal-object declaration, and adjacent-state change.\n`,
    "EDITORIAL-SPOT-CHECK.md": `# Editorial spot check\n\nNumeric persona scores are deliberately unavailable: deterministic gates are not editorial-review evidence. Independent review should inspect every scene for six representative longs and twelve Shorts spanning OSC, positioning, and TX material. Each story's narration spans, depictions, state purposes, crop geometry, transitions, and thumbnail direction are in \`STORIES/\`. Provider QA is unavailable by design.\n`,
    "THUMBNAIL-REPORT.md": `# Thumbnail report\n\n| Story | Central contradiction | Focal subject/object | Visible action/tension | Composition | Title relationship | Neighbor distinction | Result |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${plans.map((plan) => `| ${plan.contentId} | ${plan.thumbnail.centralContradiction.replaceAll("|", "/")} | ${plan.thumbnail.primaryObjectOrPerson.replaceAll("|", "/")} | ${(plan.thumbnail.visibleActionOrState + "; " + plan.thumbnail.tension).replaceAll("|", "/")} | ${plan.thumbnail.composition.replaceAll("|", "/")} | ${(plan.thumbnail.authoredTitleRelationship ?? plan.thumbnail.titleRelationship).replaceAll("|", "/")} | ${plan.thumbnail.distinctFromNeighboringEpisodes.replaceAll("|", "/")} | ${plan.validation.findings.some((finding) => finding.code.startsWith("THUMBNAIL_")) ? "FAIL" : "PASS"} |`).join("\n")}\n`,
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
  await fs.copyFile(
    path.join(final, "portfolio-validation.v3.json"),
    path.join(root, "portfolio-validation.json")
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
