import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildVeronicaCanonicalVisualPlan,
  buildVeronicaUnifiedV3SemanticPlan,
  canonicalSourceEpisodeFromRegistry,
  canonicalSourceEpisodePlannerInput,
  resolveVeronicaContentSource,
  validateVeronicaUnifiedV3Portfolio,
  type VeronicaPortfolioValidationV3,
  type VeronicaUnifiedV3SemanticPlan,
} from "@mediaforge/strategic-reinvention";

export const VERONICA_ENGLISH_SOURCE_PACK_RUNNER_VERSION =
  "veronica-english-source-pack-runner.v1" as const;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function runtimePlannerHash(): string | null {
  try {
    const provenance = JSON.parse(
      process.env["MEDIAFORGE_QA_RUNTIME_PROVENANCE"] ?? ""
    ) as {
      readonly fingerprints?: readonly {
        readonly packageName?: string;
        readonly sourceFingerprint?: string;
      }[];
    };
    return (
      provenance.fingerprints?.find(
        (fingerprint) => fingerprint.packageName === "strategic-reinvention"
      )?.sourceFingerprint ?? null
    );
  } catch {
    return null;
  }
}

async function assertFreshOutputDirectory(outputDir: string): Promise<void> {
  try {
    await fs.lstat(outputDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(
    `Fresh English source-pack planning requires a new output directory: ${outputDir}`
  );
}

export interface VeronicaEnglishSourcePackPlanResult {
  readonly schemaVersion: typeof VERONICA_ENGLISH_SOURCE_PACK_RUNNER_VERSION;
  readonly outputDir: string;
  readonly resultsPath: string;
  readonly providerLedgerPath: string;
  readonly portfolioValidationPath: string | null;
  readonly manifestPath: string;
  readonly corpusValidation: {
    readonly status: "pass" | "fail";
    readonly expectedStories: 54;
    readonly plannedStories: number;
    readonly failedStories: number;
  };
  readonly providerLedger: {
    readonly providerRequests: 0;
    readonly attemptedDispatches: 0;
    readonly paidCostUsd: 0;
  };
  readonly runtimePlannerHash: string | null;
  readonly portfolioContextHash: string;
  readonly portfolioValidation: VeronicaPortfolioValidationV3 | null;
}

/**
 * Runs the V3 semantic planner against every canonical English story.
 * Its new output directory is the cache boundary: no prior vocabulary or plan
 * artifact can be reused, and this service has no provider adapter dependency.
 */
export async function runVeronicaEnglishSourcePackPlan(input: {
  readonly repositoryRoot: string;
  readonly outputDir: string;
  readonly legacyBaseline?: boolean;
}): Promise<VeronicaEnglishSourcePackPlanResult> {
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const outputDir = path.resolve(input.outputDir);
  await assertFreshOutputDirectory(outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const source = await resolveVeronicaContentSource({
    repositoryRoot,
    useCache: false,
  });
  const portfolioContextHash = sha256(
    JSON.stringify(
      source.registry.stories.map((story) => ({
        storyId: story.storyId,
        contentHash: story.contentHash,
        seriesEpisodeOrder: story.seriesEpisodeOrder,
        seriesSlot: story.seriesSlot,
      }))
    )
  );
  const verifiedRuntimePlannerHash = runtimePlannerHash();
  const results: unknown[] = [];
  const v3Plans: VeronicaUnifiedV3SemanticPlan[] = [];
  for (const story of source.registry.stories) {
    const storyOutputDir = path.join(outputDir, "stories", story.storyId);
    const english = story.localeVariants.get("en");
    if (!english) {
      results.push({
        storyId: story.storyId,
        status: "fail",
        error: "VERONICA_LOCALE_UNAVAILABLE:en",
      });
      continue;
    }
    try {
      const plannerInput = canonicalSourceEpisodePlannerInput({
        sourceEpisode: canonicalSourceEpisodeFromRegistry({ story }),
        locale: "en",
      });
      const plan = input.legacyBaseline
        ? await buildVeronicaCanonicalVisualPlan({
            plannerInput,
            outputDir: storyOutputDir,
          })
        : await buildVeronicaUnifiedV3SemanticPlan({
            plannerInput,
            outputDir: storyOutputDir,
          });
      if (plan.schemaVersion === "veronica-unified-v3-semantic-plan.v3") {
        v3Plans.push(plan);
      }
      const planPath = path.join(
        storyOutputDir,
        input.legacyBaseline ? "visual-plan.v2.json" : "visual-plan.v3.json"
      );
      const planJson = `${JSON.stringify(plan, null, 2)}\n`;
      await fs.mkdir(storyOutputDir, { recursive: true });
      await fs.writeFile(planPath, planJson, "utf8");
      results.push({
        storyId: story.storyId,
        format: story.kind,
        status: plan.validation.status === "pass" ? "pass" : "fail",
        sourceHash: english.sourceSha256,
        plannerVersion: plan.plannerVersion,
        planHash: plan.planHash,
        planArtifactSha256: sha256(planJson),
        validation: plan.validation,
        planPath: path.relative(outputDir, planPath).split(path.sep).join("/"),
        providerRequests: 0,
        attemptedDispatches: 0,
        paidCostUsd: 0,
      });
    } catch (error) {
      results.push({
        storyId: story.storyId,
        format: story.kind,
        status: "fail",
        sourceHash: english.sourceSha256,
        error: error instanceof Error ? error.message : String(error),
        providerRequests: 0,
        attemptedDispatches: 0,
        paidCostUsd: 0,
      });
    }
  }

  const failedStories = results.filter(
    (result) => (result as { status: string }).status !== "pass"
  ).length;
  const providerLedger = {
    providerRequests: 0 as const,
    attemptedDispatches: 0 as const,
    paidCostUsd: 0 as const,
  };
  const portfolioValidation = input.legacyBaseline
    ? null
    : validateVeronicaUnifiedV3Portfolio(v3Plans);
  const corpusValidation = {
    status:
      failedStories === 0 &&
      results.length === 54 &&
      (portfolioValidation?.status ?? "pass") === "pass"
        ? ("pass" as const)
        : ("fail" as const),
    expectedStories: 54 as const,
    plannedStories: results.length - failedStories,
    failedStories,
  };
  const resultsPath = path.join(outputDir, "portfolio-results.json");
  const providerLedgerPath = path.join(outputDir, "provider-ledger.json");
  const portfolioValidationPath = portfolioValidation
    ? path.join(outputDir, "portfolio-validation.v3.json")
    : null;
  const resultsPayload = `${JSON.stringify({ schemaVersion: VERONICA_ENGLISH_SOURCE_PACK_RUNNER_VERSION, mode: input.legacyBaseline ? "legacy-v2-baseline" : "v3-semantic", canonicalPackId: source.registry.contentPackId, runtimePlannerHash: verifiedRuntimePlannerHash, portfolioContextHash, results, corpusValidation }, null, 2)}\n`;
  const providerLedgerPayload = `${JSON.stringify({ schemaVersion: "veronica-zero-provider-ledger.v1", ...providerLedger, stories: results.length }, null, 2)}\n`;
  const portfolioValidationPayload = portfolioValidation
    ? `${JSON.stringify(portfolioValidation, null, 2)}\n`
    : null;
  await Promise.all([
    fs.writeFile(resultsPath, resultsPayload, "utf8"),
    fs.writeFile(providerLedgerPath, providerLedgerPayload, "utf8"),
    ...(portfolioValidationPath
      ? [
          fs.writeFile(
            portfolioValidationPath,
            portfolioValidationPayload!,
            "utf8"
          ),
        ]
      : []),
  ]);
  const manifestPath = path.join(outputDir, "MANIFEST.json");
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "veronica-english-source-pack-manifest.v1",
        mode: input.legacyBaseline ? "legacy-v2-baseline" : "v3-semantic",
        canonicalPackId: source.registry.contentPackId,
        runtimePlannerHash: verifiedRuntimePlannerHash,
        portfolioContextHash,
        corpusValidation,
        files: [
          { path: "portfolio-results.json", sha256: sha256(resultsPayload) },
          {
            path: "provider-ledger.json",
            sha256: sha256(providerLedgerPayload),
          },
          ...(portfolioValidationPayload
            ? [
                {
                  path: "portfolio-validation.v3.json",
                  sha256: sha256(portfolioValidationPayload),
                },
              ]
            : []),
        ],
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return {
    schemaVersion: VERONICA_ENGLISH_SOURCE_PACK_RUNNER_VERSION,
    outputDir,
    resultsPath,
    providerLedgerPath,
    portfolioValidationPath,
    manifestPath,
    corpusValidation,
    providerLedger,
    runtimePlannerHash: verifiedRuntimePlannerHash,
    portfolioContextHash,
    portfolioValidation,
  };
}
