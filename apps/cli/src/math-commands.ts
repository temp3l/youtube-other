import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  buildAllLessonVariants,
  canonicalHash,
  importCurriculumSeed,
  loadCurriculumRelease,
  MathWorkspacePathResolver,
  evaluateMinorEditApproval,
  loadWorkflowManifest,
  mathMinorEditApprovalSchema,
  mathBrandPolicyArtifactSchema,
  mathFinalMediaEvidenceSchema,
  mathMetadataSchema,
  mathPlaylistCatalogSchema,
  mathThumbnailArtifactSchema,
  mathPublishDryRunSchema,
  mathQualityReportSchema,
  planMathBatchItems,
  outputsAreValid,
  qualityExitCode,
  readAuthoritativeStageArtifact,
  readAuthoritativeBinaryArtifact,
  runMathBatch,
  runPilotSimulation,
  validateVariantDifferentiation,
  type LessonVariant,
  type MathBatchItem,
  type MathLanguage,
} from "@mediaforge/math-education";
import { writeJsonAtomic } from "@mediaforge/shared";

interface MathSelectionOptions {
  skill?: string;
  grade?: string;
  variant?: LessonVariant;
  language?: MathLanguage;
  workspace?: string;
  simulate?: boolean;
  resume?: boolean;
  dryRun?: boolean;
  python?: string;
}

export class MathCliSemanticError extends Error {
  readonly exitCode = 3 as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MathCliSemanticError";
  }
}

function repositoryRoot(): string {
  return process.cwd();
}
async function importedCurriculumSeed() {
  const root = repositoryRoot();
  const markdown = await fs.readFile(
    path.join(root, "docs/mathe/curriculum/03-machine-readable-seed.md"),
    "utf8"
  );
  return importCurriculumSeed(markdown);
}
async function curriculum() {
  return loadCurriculumRelease(
    path.join(repositoryRoot(), "packages/math-education/data/curriculum/v1")
  );
}
function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
function selection(command: Command): MathSelectionOptions {
  return command.optsWithGlobals<MathSelectionOptions>();
}
function requireSimulationWorkspace(options: MathSelectionOptions): string {
  if (!options.simulate)
    throw new Error(
      "Math generation requires --simulate unless paid providers are explicitly enabled by a future reviewed implementation."
    );
  if (!options.workspace)
    throw new Error(
      "Math simulation requires an explicit --workspace outside the production workspace."
    );
  return options.workspace;
}
async function simulate(options: MathSelectionOptions) {
  return runPilotSimulation({
    repositoryRoot: repositoryRoot(),
    workspaceDir: requireSimulationWorkspace(options),
    skillId: options.skill ?? "M5-ZO-001",
    variant: options.variant ?? "standard",
    ...(options.language ? { languages: [options.language] } : {}),
    ...(options.python ? { pythonExecutable: options.python } : {}),
    ...(options.resume === undefined ? {} : { resume: options.resume }),
  });
}

async function authoritativeQuality(workspace: string, lessonId: string) {
  const paths = new MathWorkspacePathResolver(workspace);
  const lessonRoot = paths.lesson(lessonId);
  const manifest = await loadWorkflowManifest(paths.manifest(lessonId));
  if (!manifest || manifest.lessonId !== lessonId)
    throw new Error(`Missing or identity-mismatched workflow manifest for ${lessonId}.`);
  const relativePath = "canonical/quality.json";
  const report = await readAuthoritativeStageArtifact({
    root: lessonRoot,
    manifest,
    stage: "quality-gate",
    relativePath,
    schemaVersion: "math-quality.v2",
    schema: mathQualityReportSchema,
  });
  if (report.lessonId !== lessonId || report.lessonId !== manifest.lessonId)
    throw new Error(
      `Quality report identity does not match requested lesson ${lessonId}.`
    );
  const stage = manifest.stages.find((record) => record.stage === "quality-gate")!;
  const lineage = stage.outputArtifacts.find((artifact) => artifact.relativePath === relativePath)!;
  const approvalLineage = stage.outputArtifacts.find((artifact) => artifact.relativePath === "canonical/minor-edit-approval.json" && artifact.schemaVersion === "math-minor-approval.v1");
  const approval = approvalLineage
    ? await readAuthoritativeStageArtifact({ root: lessonRoot, manifest, stage: "quality-gate", relativePath: approvalLineage.relativePath, schemaVersion: "math-minor-approval.v1", schema: mathMinorEditApprovalSchema })
    : undefined;
  const approvalResult = evaluateMinorEditApproval({ report, qualityRelativePath: relativePath, qualityContentHash: lineage.contentHash, approval });
  return {
    lessonId,
    derivedStatus: report.status,
    blockers: report.blockers,
    selectedScope: { locales: report.selectedLocales },
    approval: approvalResult,
    permissions: {
      renderPreflightAllowed: report.renderPreflightAllowed,
      finalMediaReady: report.finalMediaReady,
      publishAllowed: report.publishableWithoutApproval || approvalResult.approved,
    },
    report,
  };
}

async function printQualitySelection(workspace: string, lessonIds: readonly string[]) {
  try {
    const results = await Promise.all(lessonIds.map((lessonId) => authoritativeQuality(workspace, lessonId)));
    process.exitCode = qualityExitCode(results.map((result) => result.derivedStatus));
    print(results.length === 1 ? results[0] : { results, exitCode: process.exitCode });
  } catch (error) {
    process.exitCode = 1;
    throw error;
  }
}

export function registerMathCommands(program: Command): void {
  const math = program
    .command("math")
    .description("Deterministic mathematics education pipeline");
  const curriculumCommand = math
    .command("curriculum")
    .description("Import and inspect the versioned math curriculum");
  curriculumCommand
    .command("import")
    .option("--dry-run", "validate without writing normalized data")
    .action(async (_opts, command) => {
      const result = await importedCurriculumSeed();
      const options = selection(command);
      const target = path.join(
        repositoryRoot(),
        "packages/math-education/data/curriculum/v1/skills.json"
      );
      if (!options.dryRun)
        throw new Error(
          "Curriculum import writes require an atomic reviewed release migration; use --dry-run."
        );
      const normalized = await curriculum();
      print({
        structurallyValid: true,
        dryRun: true,
        skillCount: result.skills.length,
        releaseHash: result.releaseHash,
        matchesNormalizedRelease: result.releaseHash === normalized.releaseHash,
        outputPath: target,
      });
    });
  curriculumCommand.command("validate").action(async () => {
    const result = await curriculum();
    print({
      structurallyValid: true,
      readyForProduction: result.readyForProduction,
      releaseStatus: result.release.status,
      skillCount: result.skills.length,
      sourceCount: result.registry.sources.length,
      incompleteProvenanceCount: result.provenance.incompleteSkillIds.length,
      graphNodes: result.graph.order.length,
      graphEdges: result.prerequisites.edges.length,
      disconnectedSkillIds: result.graph.disconnectedSkillIds,
      releaseHash: result.releaseHash,
    });
  });
  curriculumCommand
    .command("list")
    .option("--grade <grade>", "grade 5-10", "5")
    .action(async (opts: { grade: string }) => {
      const grade = Number(opts.grade);
      const result = await curriculum();
      print(result.skills.filter((skill) => skill.canonicalGrade === grade));
    });
  curriculumCommand
    .command("inspect")
    .requiredOption("--skill <skill-id>")
    .action(async (opts: { skill: string }) => {
      const result = await curriculum();
      const skill = result.skills.find((item) => item.skillId === opts.skill);
      if (!skill) throw new Error(`Unknown skill: ${opts.skill}`);
      print(skill);
    });
  curriculumCommand.command("graph").action(async () => {
    const result = await curriculum();
    print({
      order: result.graph.order,
      edges: result.prerequisites.edges,
      disconnectedSkillIds: result.graph.disconnectedSkillIds,
      reviewStatus: result.prerequisites.reviewStatus,
    });
  });

  const lesson = math
    .command("lesson")
    .description("Plan or simulate a lesson");
  lesson
    .command("plan")
    .requiredOption("--skill <skill-id>")
    .option(
      "--variant <variant>",
      "foundation, standard, challenge",
      "standard"
    )
    .action(async (opts: { skill: string; variant: LessonVariant }) => {
      const result = await curriculum();
      const skill = result.skills.find((item) => item.skillId === opts.skill);
      if (!skill) throw new Error(`Unknown skill: ${opts.skill}`);
      const variants = buildAllLessonVariants(skill);
      validateVariantDifferentiation(variants);
      print(
        opts.variant
          ? variants.find((item) => item.variant === opts.variant)
          : variants
      );
    });
  lesson
    .command("generate")
    .requiredOption("--skill <skill-id>")
    .option("--variant <variant>", "lesson variant", "standard")
    .option("--language <language>", "de, en, es, fr, pt")
    .option("--simulate")
    .option("--workspace <path>")
    .option("--python <path>")
    .action(async (_opts, command) =>
      print(await simulate(selection(command)))
    );

  const production = math
    .command("production")
    .description("Plan and run resumable math production");
  production
    .command("plan")
    .option("--skill <skill-id>", "skill id", "M5-ZO-001")
    .option("--variant <variant>", "lesson variant", "standard")
    .option("--language <language>", "target language", "de")
    .action((_opts, command) => {
      const options = selection(command);
      print({
        dryRun: true,
        writes: 0,
        subprocesses: 0,
        providers: 0,
        selection: {
          skill: options.skill ?? "M5-ZO-001",
          grade: 5,
          variant: options.variant ?? "standard",
          language: options.language ?? "de",
        },
        stages: [
          "curriculum-import",
          "source-validation",
          "prerequisite-graph",
          "lesson-spec",
          "math-verification",
          "canonical-narration",
          "scene-timing",
          "localization",
          "visual-assets",
          "tts",
          "timing-reflow",
          "render",
          "metadata-playlists",
          "quality-gate",
          "publish",
        ],
      });
    });
  for (const name of ["run", "resume"] as const)
    production
      .command(name)
      .option("--skill <skill-id>", "skill id", "M5-ZO-001")
      .option("--variant <variant>", "lesson variant", "standard")
      .option("--language <language>")
      .option("--simulate")
      .requiredOption("--workspace <path>")
      .option("--python <path>")
      .action(async (_opts, command) =>
        print(
          await simulate({ ...selection(command), resume: name === "resume" })
        )
      );
  for (const name of ["status", "inspect"] as const)
    production
      .command(name)
      .requiredOption("--lesson <lesson-id...>")
      .requiredOption("--workspace <path>")
      .action(async (opts: { lesson: string[]; workspace: string }) =>
        printQualitySelection(opts.workspace, opts.lesson)
      );

  const batch = math
    .command("batch")
    .description("Create and process isolated math batch items");
  batch
    .command("create")
    .option("--grade <grade>", "grade 5-10", "5")
    .option("--variant <variant>", "lesson variant", "standard")
    .option("--language <language>", "target language", "de")
    .requiredOption("--workspace <path>")
    .action(
      async (opts: {
        grade: string;
        variant: LessonVariant;
        language: MathLanguage;
        workspace: string;
      }) => {
        const result = await curriculum();
        const selectedSkills = result.skills.filter(
          (skill) => skill.canonicalGrade === Number(opts.grade)
        );
        const { items, excluded } = planMathBatchItems({
          skills: selectedSkills,
          variant: opts.variant,
          language: opts.language,
        });
        const batchId = `math-${opts.grade}-${opts.variant}-${opts.language}-${canonicalHash(items).slice(0, 12)}`;
        const paths = new MathWorkspacePathResolver(opts.workspace);
        const filePath = paths.resolve("state", "batches", `${batchId}.json`);
        await paths.assertWritable(filePath);
        await writeJsonAtomic(filePath, {
          artifactVersion: "math-batch.v1",
          batchId,
          items,
          excluded,
        });
        print({
          batchId,
          itemCount: items.length,
          excludedCount: excluded.length,
          path: filePath,
        });
      }
    );
  batch
    .command("process")
    .argument("<batch-id>")
    .requiredOption("--workspace <path>")
    .option("--simulate")
    .option("--python <path>")
    .action(
      async (
        batchId: string,
        opts: { workspace: string; simulate?: boolean; python?: string }
      ) => {
        if (!opts.simulate)
          throw new Error("Batch processing currently requires --simulate.");
        const paths = new MathWorkspacePathResolver(opts.workspace);
        const batchPath = paths.resolve("state", "batches", `${batchId}.json`);
        const raw = (await paths.readJson(batchPath)) as {
          items?: MathBatchItem[];
        };
        if (!Array.isArray(raw.items))
          throw new Error(`Invalid batch manifest: ${batchPath}`);
        const report = await runMathBatch(
          batchId,
          raw.items,
          async (item) => {
            await runPilotSimulation({
              repositoryRoot: repositoryRoot(),
              workspaceDir: opts.workspace,
              skillId: item.skillId,
              variant: item.variant,
              languages: [item.language],
              ...(opts.python ? { pythonExecutable: opts.python } : {}),
              resume: true,
            });
          },
          {
            retryBudget: 0,
            checkpointPath: paths.resolve(
              "state",
              "batches",
              `${batchId}.report.json`
            ),
          }
        );
        process.exitCode = report.exitCode;
        print(report);
      }
    );

  math
    .command("verify")
    .requiredOption("--skill <skill-id>")
    .option("--variant <variant>", "lesson variant", "standard")
    .option("--simulate")
    .requiredOption("--workspace <path>")
    .option("--python <path>")
    .action(async (_opts, command) =>
      print(await simulate(selection(command)))
    );
  const quality = math
    .command("quality")
    .description("Inspect the derived, fail-closed math quality status");
  quality
    .command("check")
    .requiredOption("--lesson <lesson-id...>")
    .requiredOption("--workspace <path>")
    .action(async (opts: { lesson: string[]; workspace: string }) =>
      printQualitySelection(opts.workspace, opts.lesson)
    );
  const metadata = math
    .command("metadata")
    .description("Inspect generated math metadata");
  metadata
    .command("generate")
    .requiredOption("--lesson <lesson-id...>")
    .requiredOption("--workspace <path>")
    .option("--language <language>", "target language", "de")
    .action(
      async (opts: { lesson: string; workspace: string; language: string }) => {
        const paths = new MathWorkspacePathResolver(opts.workspace);
        print(
          await paths.readJson(
            path.join(paths.locale(opts.lesson, opts.language), "metadata.json")
          )
        );
      }
    );
  math
    .command("status")
    .requiredOption("--lesson <lesson-id...>")
    .requiredOption("--workspace <path>")
    .action(async (opts: { lesson: string[]; workspace: string }) =>
      printQualitySelection(opts.workspace, opts.lesson)
    );
  math
    .command("publish")
    .requiredOption("--lesson <lesson-id>")
    .requiredOption("--workspace <path>")
    .option("--language <language>", "target language", "de")
    .option("--dry-run", "publishing is only available as a dry run")
    .action(
      async (
        _opts: { lesson: string; workspace: string; language: string },
        command: Command
      ) => {
        const opts = command.optsWithGlobals<{
          lesson: string;
          workspace: string;
          language: string;
          dryRun?: boolean;
        }>();
        if (!opts.dryRun) {
          process.exitCode = 1;
          throw new Error("Math publish requires --dry-run.");
        }
        try {
          const quality = await authoritativeQuality(opts.workspace, opts.lesson);
          if (!quality.permissions.publishAllowed) {
            throw new MathCliSemanticError(
              `Publishing blocked: ${quality.derivedStatus}.`
            );
          }
          if (!quality.report.selectedLocales.includes(opts.language as MathLanguage))
            throw new Error(
              `Publish language ${opts.language} is outside the authoritative quality scope.`
            );
          const paths = new MathWorkspacePathResolver(opts.workspace);
          const manifest = await loadWorkflowManifest(paths.manifest(opts.lesson));
          if (!manifest || manifest.lessonId !== opts.lesson)
            throw new Error(
              `Missing or identity-mismatched workflow manifest for ${opts.lesson}.`
            );
          const localeRoot = `locales/${opts.language}`;
          const metadataRelativePath = `${localeRoot}/metadata.json`;
          const catalogRelativePath = `${localeRoot}/playlist-catalog.json`;
          const thumbnailRelativePath = `${localeRoot}/thumbnail.svg.manifest.json`;
          const policyRelativePath = `${localeRoot}/brand-policy.json`;
          const relativePath = `${localeRoot}/publish-dry-run.json`;
          const metadataStageRecord = manifest.stages.find((stage) => stage.stage === "metadata-playlists")!;
          for (const required of [
            [catalogRelativePath, "math-playlist-catalog.v1"],
            [policyRelativePath, "math-brand-policy.v1"],
          ] as const) {
            const count = metadataStageRecord.outputArtifacts.filter(
              (artifact) => artifact.relativePath === required[0] && artifact.schemaVersion === required[1]
            ).length;
            if (count !== 1)
              throw new MathCliSemanticError(`PUBLISH_BLOCKED: missing or duplicate ${required[0]}.`);
          }
          const metadata = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson), manifest, stage: "metadata-playlists",
            relativePath: metadataRelativePath, schemaVersion: "math-metadata.v2", schema: mathMetadataSchema,
          });
          const catalog = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson), manifest, stage: "metadata-playlists",
            relativePath: catalogRelativePath, schemaVersion: "math-playlist-catalog.v1", schema: mathPlaylistCatalogSchema,
          });
          const thumbnail = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson), manifest, stage: "metadata-playlists",
            relativePath: thumbnailRelativePath, schemaVersion: "math-thumbnail.v1", schema: mathThumbnailArtifactSchema,
          });
          const rawPolicy = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson), manifest, stage: "metadata-playlists",
            relativePath: policyRelativePath, schemaVersion: "math-brand-policy.v1", schema: mathBrandPolicyArtifactSchema,
          });
          const policy = rawPolicy;
          const languages = policy.channels.map((candidate) => candidate.language);
          const requiredLanguages = ["de", "en", "es", "fr", "pt"];
          if (
            new Set(languages).size !== languages.length ||
            requiredLanguages.some((language) => !languages.includes(language as MathLanguage)) ||
            new Set(policy.channels.map((candidate) => candidate.channelId)).size !== policy.channels.length ||
            policy.channels.some((candidate) => {
              const ids = Object.values(candidate.playlists);
              return new Set(ids).size !== ids.length;
            })
          )
            throw new MathCliSemanticError("PUBLISH_BLOCKED: duplicate math channel policy.");
          const channel = policy.channels.find((candidate) => candidate.language === opts.language);
          if (!channel)
            throw new MathCliSemanticError(`PUBLISH_BLOCKED: missing channel policy for ${opts.language}.`);
          const packet = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath,
            schemaVersion: "math-publish-dry-run.v2",
            schema: mathPublishDryRunSchema,
          });
          const canonicalQualityPath = "canonical/quality.json";
          const canonicalFinalEvidencePath = `${localeRoot}/final-media.json`;
          const canonicalFinalMediaPath = `${localeRoot}/render/final.mp4`;
          if (
            packet.quality.path !== canonicalQualityPath ||
            packet.finalMedia.evidencePath !== canonicalFinalEvidencePath ||
            packet.finalMedia.mediaPath !== canonicalFinalMediaPath
          ) throw new Error("Publish packet uses a non-canonical quality or final-media path.");
          const finalMedia = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson), manifest, stage: "render",
            relativePath: packet.finalMedia.evidencePath,
            schemaVersion: "math-final-media.v1",
            schema: mathFinalMediaEvidenceSchema,
          });
          if (
            packet.identity.lessonId !== opts.lesson ||
            packet.identity.lessonId !== manifest.lessonId ||
            packet.identity.language !== opts.language ||
            metadata.identity.lessonId !== opts.lesson ||
            metadata.identity.language !== opts.language ||
            thumbnail.identity.lessonId !== opts.lesson ||
            thumbnail.identity.language !== opts.language ||
            finalMedia.identity.lessonId !== opts.lesson ||
            finalMedia.identity.language !== opts.language
          )
            throw new Error(
              `Publish packet identity does not match ${opts.lesson}/${opts.language}.`
            );
          const lessonRoot = paths.lesson(opts.lesson);
          const metadataStage = manifest.stages.find((stage) => stage.stage === "metadata-playlists")!;
          const lineageHash = (artifactPath: string) => {
            const matches = metadataStage.outputArtifacts.filter((artifact) => artifact.relativePath === artifactPath);
            if (matches.length !== 1) throw new Error(`Expected exactly one authoritative ${artifactPath}.`);
            return matches[0]!.contentHash;
          };
          for (const stageName of new Set(Object.values(thumbnail.sourceLineage).map((source) => source.stage))) {
            const sourceStage = manifest.stages.find((candidate) => candidate.stage === stageName);
            if (!sourceStage || !(await outputsAreValid(lessonRoot, sourceStage)))
              throw new Error(`Thumbnail source stage ${stageName} is stale or invalid.`);
          }
          const thumbnailSourceLineageValid = Object.values(thumbnail.sourceLineage).every((source) => {
            const stage = manifest.stages.find((candidate) => candidate.stage === source.stage);
            const matches = stage?.outputArtifacts.filter((artifact) =>
              artifact.relativePath === source.relativePath &&
              artifact.schemaVersion === source.schemaVersion &&
              artifact.producedBy === source.stage &&
              artifact.producer === source.producer &&
              artifact.producerVersion === source.producerVersion &&
              artifact.contentHash === source.contentHash &&
              canonicalHash(artifact.parentHashes) === canonicalHash(source.parentFingerprints)
            ) ?? [];
            return matches.length === 1;
          });
          const thumbnailAssetRelativePath = path.posix.join(localeRoot, thumbnail.outputPath);
          const thumbnailAsset = await readAuthoritativeBinaryArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath: thumbnailAssetRelativePath,
            schemaVersion: "math-thumbnail-binary.v1",
            expectedIdentity: {
              lessonId: opts.lesson,
              skillId: metadata.identity.skillId,
              language: opts.language as MathLanguage,
              variant: metadata.identity.variant,
            },
            producer: "math-thumbnail-renderer",
            producerVersion: "math-thumbnail-renderer.v3",
          });
          const finalMediaAsset = await readAuthoritativeBinaryArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "render",
            relativePath: finalMedia.mediaPath,
            schemaVersion: "math-final-media-binary.v1",
            expectedIdentity: {
              lessonId: opts.lesson,
              skillId: metadata.identity.skillId,
              language: opts.language as MathLanguage,
              variant: metadata.identity.variant,
            },
            producer: "provider-free-media",
            producerVersion: "provider-free-media.v1",
          });
          const qualityMatches = manifest.stages.find((stage) => stage.stage === "quality-gate")!
            .outputArtifacts.filter((artifact) => artifact.relativePath === canonicalQualityPath && artifact.schemaVersion === "math-quality.v2");
          if (qualityMatches.length !== 1)
            throw new Error("Expected exactly one canonical workflow-owned quality artifact.");
          const qualityHash = qualityMatches[0]!.contentHash;
          const expectedPlaylistIds = metadata.playlists.map((playlist) => {
            const catalogEntries = catalog.entries.filter((entry) => entry.key === playlist.key && entry.kind === playlist.kind);
            if (catalogEntries.length !== 1 || catalogEntries[0]!.localizedNames[opts.language as MathLanguage] !== playlist.localizedName)
              throw new MathCliSemanticError(`PUBLISH_BLOCKED: catalog mismatch for ${playlist.key}.`);
            const playlistId = channel.playlists[playlist.key];
            if (!playlistId) throw new MathCliSemanticError(`PUBLISH_BLOCKED: unmapped playlist ${playlist.key}.`);
            return { key: playlist.key, kind: playlist.kind, playlistId };
          });
          const packetBound = {
            identity: packet.identity,
            metadata: packet.metadata,
            thumbnail: packet.thumbnail,
            finalMedia: packet.finalMedia,
            quality: packet.quality,
            brandPolicy: packet.brandPolicy,
            channelId: packet.channelId,
            privacyStatus: packet.privacyStatus,
            madeForKids: packet.madeForKids,
            containsSyntheticMedia: packet.containsSyntheticMedia,
            playlistAssignments: packet.playlistAssignments,
          };
          const hashesMatch =
            packet.metadata.path === metadataRelativePath && packet.metadata.contentHash === canonicalHash(metadata) &&
            packet.thumbnail.manifestPath === thumbnailRelativePath && packet.thumbnail.manifestHash === lineageHash(thumbnailRelativePath) &&
            packet.thumbnail.assetPath === thumbnailAssetRelativePath && packet.thumbnail.assetHash === thumbnail.contentHash && packet.thumbnail.assetHash === thumbnailAsset.contentHash && thumbnail.byteLength === thumbnailAsset.byteLength &&
            packet.finalMedia.evidencePath === canonicalFinalEvidencePath && packet.finalMedia.evidenceHash === canonicalHash(finalMedia) && packet.finalMedia.mediaPath === canonicalFinalMediaPath && packet.finalMedia.mediaPath === finalMedia.mediaPath && packet.finalMedia.mediaHash === finalMedia.mediaHash && finalMedia.mediaHash === finalMediaAsset.contentHash && packet.finalMedia.qualityEvidenceHash === qualityHash && finalMedia.qualityEvidenceHash === qualityHash &&
            packet.quality.contentHash === qualityHash && packet.brandPolicy.path === policyRelativePath && packet.brandPolicy.contentHash === lineageHash(policyRelativePath) &&
            packet.channelId === channel.channelId && packet.privacyStatus === policy.privacyStatus && packet.madeForKids === policy.madeForKids && packet.containsSyntheticMedia === policy.containsSyntheticMedia &&
            metadata.catalogHash === canonicalHash(catalog) && thumbnail.inputHashes.metadata === canonicalHash(metadata) && thumbnail.inputHashes.lessonContent === metadata.identity.lessonContentHash && thumbnail.factId === metadata.thumbnail.formulaFactId &&
            thumbnailSourceLineageValid && thumbnail.sourceLineage.lesson.relativePath === "canonical/lesson-spec.json" && thumbnail.sourceLineage.verification.relativePath === "canonical/verification.json" && thumbnail.sourceLineage.localization.relativePath === `${localeRoot}/narration.json` && thumbnail.sourceLineage.localizedVerification.relativePath === `${localeRoot}/display-verification.json` && thumbnail.sourceLineage.metadata.relativePath === metadataRelativePath &&
            canonicalHash(packet.playlistAssignments) === canonicalHash(expectedPlaylistIds) && packet.requestFingerprint === canonicalHash(packetBound);
          if (!hashesMatch) throw new Error("Publish preflight artifact hashes or policy bindings do not match authoritative inputs.");
          if (
            thumbnail.teacherVersion.includes("placeholder") ||
            thumbnail.artwork.status !== "approved-publish-artwork" ||
            !thumbnail.artwork.publishReady ||
            thumbnail.artwork.blockers.length > 0
          )
            throw new MathCliSemanticError("PUBLISH_BLOCKED: placeholder teacher thumbnail is not publish-ready.");
          print({
            status: "PREFLIGHT_VALID",
            lessonId: opts.lesson,
            language: opts.language,
            channelId: channel.channelId,
            privacyStatus: "private",
            playlistAssignments: expectedPlaylistIds,
            authoritative: {
              metadata: packet.metadata,
              thumbnail: packet.thumbnail,
              finalMedia: packet.finalMedia,
              quality: packet.quality,
              brandPolicy: packet.brandPolicy,
            },
            blockers: [], dispatchAllowed: false, paidProviderCalled: false,
            networkCalls: 0, mutations: 0,
          });
        } catch (error) {
          process.exitCode =
            error instanceof MathCliSemanticError ? error.exitCode : 1;
          throw error;
        }
      }
    );
}
