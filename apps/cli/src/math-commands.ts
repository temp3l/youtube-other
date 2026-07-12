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
  mathPublishDryRunSchema,
  mathQualityReportSchema,
  planMathBatchItems,
  qualityExitCode,
  readAuthoritativeStageArtifact,
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
        if (!opts.dryRun)
          throw new Error("Math publish requires --dry-run.");
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
          const relativePath = `locales/${opts.language}/publish-dry-run.json`;
          const packet = await readAuthoritativeStageArtifact({
            root: paths.lesson(opts.lesson),
            manifest,
            stage: "metadata-playlists",
            relativePath,
            schemaVersion: "math-publish-dry-run.v1",
            schema: mathPublishDryRunSchema,
          });
          if (
            packet.lessonId !== opts.lesson ||
            packet.lessonId !== manifest.lessonId ||
            packet.language !== opts.language
          )
            throw new Error(
              `Publish packet identity does not match ${opts.lesson}/${opts.language}.`
            );
          print({ quality, packet });
        } catch (error) {
          process.exitCode =
            error instanceof MathCliSemanticError ? error.exitCode : 1;
          throw error;
        }
      }
    );
}
