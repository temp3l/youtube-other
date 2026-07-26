import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashText } from "@mediaforge/shared";
import { describe, expect, it } from "vitest";
import {
  HORROR_CALIBRATION_CORPUS_SCHEMA_VERSION,
  horrorCalibrationCorpusSchema,
} from "./horror-editorial-calibration.js";
import { stableSerialize } from "./stable-json.js";
import {
  buildHorrorCandidateDispatchAuthorization,
  buildHorrorAudienceMetricsImport,
  buildHorrorEvaluationManifest,
  buildHorrorProductionEditorialCandidateSet,
  buildHorrorRolloutApproval,
  buildHorrorRolloutDecisionArtifact,
  evaluateHorrorAudienceMetrics,
  executeNextAuthorizedHorrorCandidate,
  executeNextHorrorCandidateWithMockAdapter,
  horrorCandidateGenerationPreflightSchema,
  horrorCandidateDispatchAuthorizationSchema,
  horrorCandidateExecutionLedgerSchema,
  horrorEditorialRaterProvenanceSchema,
  horrorEvaluationManifestSchema,
  horrorRolloutDecisionArtifactSchema,
  initializeHorrorCandidateExecutionLedger,
  persistAuthorizedHorrorAudienceMetricsImport,
  persistHorrorCandidateDispatchAuthorization,
  persistHorrorCandidateGenerationPreflight,
  persistHorrorEvaluationManifest,
  persistHorrorProductionEditorialCandidateSet,
  persistSeparatedBlindHorrorProductionEditorialReviews,
  planHorrorRolloutConfigurationTransition,
  prepareHorrorCandidateGenerationPreflight,
  prepareSeparatedBlindHorrorEditorialReviews,
  prepareSeparatedBlindHorrorProductionEditorialReviews,
  resolveHorrorEvaluationArtifactPaths,
  type HorrorAudienceMetricsImport,
  type AuthorizedHorrorCandidateExecutionAdapter,
  type AuthorizedHorrorCandidateValidator,
  type HorrorCandidateGenerationPreflight,
  type HorrorEvaluationManifest,
  type MockHorrorCandidateExecutionAdapter,
  type HorrorRolloutEvidence,
  type HorrorRolloutScope,
} from "./horror-evaluation-rollout.js";

const corpusPath = new URL(
  "./__fixtures__/horror-calibration/corpus.json",
  import.meta.url
);

async function loadCorpus() {
  const corpus = JSON.parse(await fs.readFile(corpusPath, "utf8")) as unknown;
  return horrorCalibrationCorpusSchema.parse(corpus);
}

async function loadApprovedV2Manifest(): Promise<HorrorEvaluationManifest> {
  const manifestPath = path.resolve(
    import.meta.dirname,
    "../../../docs/development/horror-controlled-evaluation/evaluation-manifest.v2.json"
  );
  return horrorEvaluationManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8"))
  );
}

async function loadApprovedV3Manifest(): Promise<HorrorEvaluationManifest> {
  const manifestPath = path.resolve(
    import.meta.dirname,
    "../../../docs/development/horror-controlled-evaluation/evaluation-manifest.v3.json"
  );
  return horrorEvaluationManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8"))
  );
}

async function loadApprovedV3Preflight(): Promise<HorrorCandidateGenerationPreflight> {
  const preflightPath = path.resolve(
    import.meta.dirname,
    "../../../docs/development/horror-controlled-evaluation/candidate-generation-preflight.v3.json"
  );
  return horrorCandidateGenerationPreflightSchema.parse(
    JSON.parse(await fs.readFile(preflightPath, "utf8"))
  );
}

function rehashPreflight(
  preflight: HorrorCandidateGenerationPreflight,
  transform: (
    body: Omit<HorrorCandidateGenerationPreflight, "preflightHash">
  ) => Omit<HorrorCandidateGenerationPreflight, "preflightHash">
): HorrorCandidateGenerationPreflight {
  const { preflightHash: _preflightHash, ...body } = preflight;
  const changed = transform(body);
  return horrorCandidateGenerationPreflightSchema.parse({
    ...changed,
    preflightHash: hashText(stableSerialize(changed)),
  });
}

async function createExecutionHarness() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "horror-execution-ledger-")
  );
  const manifest = await loadApprovedV3Manifest();
  const preflight = await loadApprovedV3Preflight();
  const paths = resolveHorrorEvaluationArtifactPaths({
    outputDirectory: directory,
    evaluationId: manifest.evaluationId,
  });
  await persistHorrorEvaluationManifest({ paths, manifest });
  await persistHorrorCandidateGenerationPreflight({
    paths,
    manifest,
    preflight,
  });
  return {
    workspaceRoot: directory,
    manifest,
    preflight,
    paths,
    ledgerVersion: "production-candidate-execution-ledger-v1",
    clock: () => "2026-07-26T12:00:00+02:00",
  };
}

function successfulMockAdapter(
  invocations: string[],
  chargedCostUsd = 0.4
): MockHorrorCandidateExecutionAdapter {
  return {
    kind: "mock",
    async generate(request) {
      invocations.push(request.sampleUnitId);
      const acceptedFinalLine = `Accepted ending for ${request.sampleUnitId}.`;
      return {
        status: "completed",
        candidateText: `Mock candidate for ${request.sampleUnitId}. ${acceptedFinalLine}`,
        acceptedFinalLine,
        chargedCostUsd,
      };
    },
  };
}

function buildDispatchAuthorization(args: {
  readonly ledger: Awaited<
    ReturnType<typeof initializeHorrorCandidateExecutionLedger>
  >["ledger"];
  readonly approvalReference?: string;
  readonly authorizedAt?: string;
  readonly expiresAt?: string;
}) {
  return buildHorrorCandidateDispatchAuthorization({
    ledger: args.ledger,
    authorizationVersion: "production-candidate-dispatch-authorization-v1",
    authorityId: "test-repository-owner",
    approvalReference:
      args.approvalReference ?? "test-bounded-v3-dispatch-approval",
    authorizedAt: args.authorizedAt ?? "2026-07-26T12:00:00+02:00",
    expiresAt: args.expiresAt ?? "2026-07-26T14:00:00+02:00",
  });
}

async function persistDispatchAuthorization(
  harness: Awaited<ReturnType<typeof createExecutionHarness>>
) {
  const initialized =
    await initializeHorrorCandidateExecutionLedger(harness);
  const authorization = buildDispatchAuthorization({
    ledger: initialized.ledger,
  });
  await persistHorrorCandidateDispatchAuthorization({
    paths: harness.paths,
    manifest: harness.manifest,
    preflight: harness.preflight,
    ledger: initialized.ledger,
    authorization,
  });
  return { authorization, ledger: initialized.ledger };
}

const productionWorkspaceRoot = path.resolve(import.meta.dirname, "../../..");
const productionGenerationInventory = [
  {
    episodeSlug: "025-the-endless-backrooms",
    fullSampleUnitId: "full-025-endless-backrooms",
    shortSampleUnitId: "short-025-endless-backrooms",
  },
  {
    episodeSlug: "028-the-man-in-the-attic",
    fullSampleUnitId: "full-028-man-in-the-attic",
    shortSampleUnitId: "short-028-man-in-the-attic",
  },
  {
    episodeSlug: "041-the-town-that-calls-your-name",
    fullSampleUnitId: "full-041-town-calls-your-name",
    shortSampleUnitId: "short-041-town-calls-your-name",
  },
  {
    episodeSlug: "051-the-voice-message-from-tomorrow",
    fullSampleUnitId: "full-051-voice-message-tomorrow",
    shortSampleUnitId: "short-051-voice-message-tomorrow",
  },
].map((entry) => ({
  ...entry,
  sourceArtifactPath: `episodes/${entry.episodeSlug}/source/source-cleaned.md`,
  canonicalFullArtifactPath: `episodes/${entry.episodeSlug}/en/full/canonical-full.json`,
  baselineFullArtifactPath: `episodes/${entry.episodeSlug}/languages/script-en.md`,
  baselineShortArtifactPath: `episodes/${entry.episodeSlug}/languages/short/script-en.md`,
}));

function buildProductionCandidateSet(
  manifest: HorrorEvaluationManifest,
  options: {
    readonly manifestHash?: string;
    readonly omitLast?: boolean;
    readonly staleStrategyVersion?: boolean;
    readonly strategyMarker?: string;
  } = {}
) {
  if (manifest.sample.status !== "resolved") {
    throw new Error("Expected a resolved production sample.");
  }
  const cases = (["full", "short"] as const).flatMap((format) =>
    manifest.sample.status === "resolved"
      ? manifest.sample.value[format].map((sample) => {
          const finalLine = `Final line for ${sample.sampleUnitId}.`;
          return {
            sampleUnitId: sample.sampleUnitId,
            title: `Candidate ${sample.sampleUnitId}`,
            sourceArtifactHash: hashText(`source:${sample.sampleUnitId}`),
            acceptedFinalLine: finalLine,
            strata: {
              format,
              locale: sample.locale,
              durationBand: sample.durationBand,
              targetDurationSeconds: format === "full" ? 240 : 45,
              policy: {
                storyPolicyId: sample.genrePolicyId,
                fictionality: "fiction" as const,
                genre: "fictional-supernatural" as const,
                evidencePolicy: "fictional-source-bounded" as const,
                intensityPolicy: "restrained" as const,
              },
            },
            candidates: {
              baseline: {
                text: `Baseline narration for ${sample.sampleUnitId}. ${finalLine}`,
                strategyVersion: manifest.strategyVersions.baseline,
              },
              strategy: {
                text: `Strategy narration for ${sample.sampleUnitId}${options.strategyMarker ?? ""}. ${finalLine}`,
                strategyVersion: options.staleStrategyVersion
                  ? "stale-horror-strategy"
                  : manifest.strategyVersions.strategy,
              },
            },
          };
        })
      : []
  );
  return buildHorrorProductionEditorialCandidateSet({
    candidateSetVersion: "production-candidates-v2",
    evaluationId: manifest.evaluationId,
    manifestHash: options.manifestHash ?? manifest.manifestHash,
    createdAt: "2026-07-26T09:00:00+02:00",
    createdBy: {
      actorId: "test-operator",
      containsPersonalSecrets: false,
    },
    cases: options.omitLast ? cases.slice(0, -1) : cases,
  });
}

const sample = {
  full: [
    {
      sampleUnitId: "full-one",
      locale: "en-US",
      genrePolicyId: "fiction-supernatural",
      durationBand: "60-180s" as const,
      audienceType: "new" as const,
    },
    {
      sampleUnitId: "full-two",
      locale: "en-GB",
      genrePolicyId: "fiction-psychological",
      durationBand: "over-180s" as const,
      audienceType: "returning" as const,
    },
  ],
  short: [
    {
      sampleUnitId: "short-one",
      locale: "en-US",
      genrePolicyId: "fiction-supernatural",
      durationBand: "under-60s" as const,
      audienceType: "new" as const,
    },
    {
      sampleUnitId: "short-two",
      locale: "en-GB",
      genrePolicyId: "fiction-psychological",
      durationBand: "under-60s" as const,
      audienceType: "returning" as const,
    },
  ],
};

function buildResolvedManifest(): HorrorEvaluationManifest {
  return buildHorrorEvaluationManifest({
    evaluationId: "synthetic-controlled-evaluation",
    preregisteredAt: "2026-07-24T09:00:00+02:00",
    preregisteredBy: {
      actorId: "test-operator",
      role: "operator",
      containsPersonalSecrets: false,
    },
    outcomeInspectionStatus: "not-started",
    primaryMetric: {
      status: "resolved",
      value: "averagePercentageViewed",
      decisionReference: "synthetic-test-primary-metric",
    },
    practicalImprovementThreshold: {
      status: "resolved",
      value: 0.02,
      decisionReference: "synthetic-test-threshold",
    },
    sample: {
      status: "resolved",
      value: sample,
      decisionReference: "synthetic-test-sample",
    },
    exclusions: [
      {
        exclusionId: "missing-arm",
        rule: "Exclude a sample unit when either preregistered arm is absent.",
        decidedBeforeOutcomes: true,
      },
    ],
    stratification: {
      dimensions: ["locale", "genrePolicyId", "durationBand", "audienceType"],
      minimumSamplePerArm: 2,
      insufficientSamplesAreExploratory: true,
    },
    strategyVersions: {
      baseline: "horror-affect-baseline-v1",
      strategy: "horror-affect-strategy-v1",
    },
    costBudget: {
      status: "resolved",
      value: {
        maxIncrementalProviderCalls: 0,
        maxIncrementalCostUsd: 0,
        budgetReference: "synthetic-zero-cost-budget",
      },
      decisionReference: "synthetic-test-cost",
    },
    productDecisions: {
      productionAnalyticsAuthority: {
        status: "resolved",
        value: {
          authorityId: "test-authority",
          scopeReference: "synthetic-aggregate-export",
        },
        decisionReference: "synthetic-analytics-decision",
      },
      defaultRolloutChangeAuthority: {
        status: "resolved",
        value: {
          authorityId: "test-authority",
          scopeReference: "synthetic-rollout-scope",
        },
        decisionReference: "synthetic-rollout-decision",
      },
    },
    decisionRule: {
      promotionRequiresAllSourcePlanGates: true,
      missingDecisionOutcome: "remain-shadow",
      fullAndShortEvaluatedSeparately: true,
      ctrRequiresControlledTitleAndThumbnail: true,
      rollbackIsConfigurationOnly: true,
    },
  });
}

function buildUnresolvedManifest(): HorrorEvaluationManifest {
  const unresolved = (reason: string) => ({
    status: "unresolved" as const,
    reason,
  });
  return buildHorrorEvaluationManifest({
    evaluationId: "current-unresolved-evaluation",
    preregisteredAt: "2026-07-24T09:00:00+02:00",
    preregisteredBy: {
      actorId: "codex-task-08",
      role: "operator",
      containsPersonalSecrets: false,
    },
    outcomeInspectionStatus: "not-started",
    primaryMetric: unresolved("No primary production metric is approved."),
    practicalImprovementThreshold: unresolved(
      "No practical improvement threshold is approved."
    ),
    sample: unresolved("No production episode sample is approved."),
    exclusions: [],
    stratification: {
      dimensions: ["locale", "genrePolicyId", "durationBand", "audienceType"],
      minimumSamplePerArm: 2,
      insufficientSamplesAreExploratory: true,
    },
    strategyVersions: {
      baseline: "current-production-baseline",
      strategy: "horror-affect-strategy-v1",
    },
    costBudget: unresolved("No production evaluation cost budget is approved."),
    productDecisions: {
      productionAnalyticsAuthority: unresolved(
        "No production analytics authority exists."
      ),
      defaultRolloutChangeAuthority: unresolved(
        "No authority to change the default rollout mode exists."
      ),
    },
    decisionRule: {
      promotionRequiresAllSourcePlanGates: true,
      missingDecisionOutcome: "remain-shadow",
      fullAndShortEvaluatedSeparately: true,
      ctrRequiresControlledTitleAndThumbnail: true,
      rollbackIsConfigurationOnly: true,
    },
  });
}

function curve(ending: number) {
  return [
    { positionRatio: 0, retentionRatio: 1 },
    { positionRatio: 0.5, retentionRatio: (1 + ending) / 2 },
    { positionRatio: 1, retentionRatio: ending },
  ];
}

function buildMetricsImport(
  manifest: HorrorEvaluationManifest
): HorrorAudienceMetricsImport {
  const observations = (["full", "short"] as const).flatMap((format) =>
    sample[format].flatMap((unit, unitIndex) =>
      (["baseline", "strategy"] as const).map((arm) => {
        const improvement = arm === "strategy" ? 0.04 : 0;
        const omitShortStrategyEnding =
          format === "short" && arm === "strategy";
        return {
          observationId: `${format}-${unitIndex + 1}-${arm}`,
          sampleUnitId: unit.sampleUnitId,
          format,
          arm,
          strata: {
            locale: unit.locale,
            genrePolicyId: unit.genrePolicyId,
            durationBand: unit.durationBand,
            audienceType:
              unit.audienceType === "not-applicable"
                ? ("mixed" as const)
                : unit.audienceType,
          },
          metrics: {
            normalizedRetention: curve(0.48 + improvement),
            earlyRetention: 0.72 + improvement,
            averagePercentageViewed: 0.58 + improvement,
            ...(!omitShortStrategyEnding
              ? { endingRetention: 0.48 + improvement }
              : {}),
            ctr: 0.06 + improvement / 10,
            titleAndThumbnailControlled: false,
          },
        };
      })
    )
  );
  return buildHorrorAudienceMetricsImport({
    evaluationId: manifest.evaluationId,
    manifestHash: manifest.manifestHash,
    importedAt: "2026-07-24T10:00:00+02:00",
    source: {
      kind: "authorized-aggregate-export",
      platform: "youtube",
      aggregationLevel: "episode-arm",
      fetchPerformedByMediaforge: false,
      authorization: {
        status: "approved",
        authorityId: "test-authority",
        scopeReference: "synthetic-aggregate-export",
        grantedAt: "2026-07-24T08:00:00+02:00",
      },
    },
    observations,
  });
}

const scope: HorrorRolloutScope = {
  formats: ["full"],
  locales: ["en-US"],
  strategyVersion: "horror-affect-strategy-v1",
};

const passingEvidence: HorrorRolloutEvidence = {
  immutableFactRuleEndingRegressionFree: true,
  noExtraGenerationCall: true,
  costWithinBudget: true,
  blindEditorialPrimaryImproved: true,
  productionRetentionNotHarmed: true,
  failureBehaviorUnderstood: true,
  staleCacheBehaviorUnderstood: true,
  regressions: [],
  incrementalProviderCalls: 0,
  incrementalCostUsd: 0,
  failures: [],
  staleCacheEvidence: "Synthetic stale-cache checks passed.",
  dissentingEvidence: ["One synthetic reviewer preferred the baseline."],
  confidence: "moderate",
};

describe("controlled evaluation manifest and assignment", () => {
  it("persists exact bounded dispatch authorization and rejects placeholders or changed scope", async () => {
    const harness = await createExecutionHarness();
    const initialized =
      await initializeHorrorCandidateExecutionLedger(harness);
    const authorization = buildDispatchAuthorization({
      ledger: initialized.ledger,
    });

    await expect(
      persistHorrorCandidateDispatchAuthorization({
        paths: harness.paths,
        manifest: harness.manifest,
        preflight: harness.preflight,
        ledger: initialized.ledger,
        authorization,
      })
    ).resolves.toEqual({ persisted: true, reused: false });
    await expect(
      persistHorrorCandidateDispatchAuthorization({
        paths: harness.paths,
        manifest: harness.manifest,
        preflight: harness.preflight,
        ledger: initialized.ledger,
        authorization,
      })
    ).resolves.toEqual({ persisted: false, reused: true });

    const persisted = horrorCandidateDispatchAuthorizationSchema.parse(
      JSON.parse(
        await fs.readFile(
          harness.paths.candidateDispatchAuthorizationPath,
          "utf8"
        )
      )
    );
    expect(persisted).toMatchObject({
      evaluationId: harness.manifest.evaluationId,
      manifestHash: harness.manifest.manifestHash,
      preflightHash: harness.preflight.preflightHash,
      ledgerBindingHash: initialized.ledger.bindingHash,
      scope: {
        purpose: "candidate-generation-only",
        maxProviderCalls: 8,
        maxCostUsd: 8,
        perUnitProviderCalls: 1,
        perUnitCostUsd: 1,
        maxRetries: 0,
        ratingsAuthorized: false,
        analyticsImportAuthorized: false,
        rolloutDecisionAuthorized: false,
        rolloutPromotionAuthorized: false,
        uploadOrPublicationAuthorized: false,
      },
    });
    expect(persisted.scope.sampleUnitIds).toEqual(
      initialized.ledger.items.map((item) => item.sampleUnitId)
    );
    expect(JSON.stringify(persisted)).not.toMatch(
      /"apiKey"|"credentials?"|"authorizationValue"|"rawProviderCredentials"/u
    );
    expect(() =>
      buildHorrorCandidateDispatchAuthorization({
        ledger: initialized.ledger,
        authorizationVersion:
          "production-candidate-dispatch-authorization-v1",
        authorityId: "replace-with-authority-id",
        approvalReference: "test-approval",
        authorizedAt: "2026-07-26T12:00:00+02:00",
        expiresAt: "2026-07-26T14:00:00+02:00",
      })
    ).toThrow("unresolved placeholder");
    await expect(
      persistHorrorCandidateDispatchAuthorization({
        paths: harness.paths,
        manifest: harness.manifest,
        preflight: harness.preflight,
        ledger: initialized.ledger,
        authorization: buildDispatchAuthorization({
          ledger: initialized.ledger,
          approvalReference: "changed-approval-reference",
        }),
      })
    ).rejects.toThrow("immutable and rejects changed scope");
  });

  it("requires active persisted authorization before the production boundary", async () => {
    const harness = await createExecutionHarness();
    const invocations: string[] = [];
    const adapter: AuthorizedHorrorCandidateExecutionAdapter = {
      kind: "production",
      async generate(request) {
        invocations.push(request.sampleUnitId);
        return {
          status: "completed",
          candidateText: "This must not be generated.",
          chargedCostUsd: 0.1,
        };
      },
    };
    const validator: AuthorizedHorrorCandidateValidator = {
      async validate() {
        return {
          status: "passed",
          acceptedFinalLine: "This must not be generated.",
          contractVersion: "test-contract-v1",
          evidenceHash: hashText("test-contract-evidence"),
        };
      },
    };

    await expect(
      executeNextAuthorizedHorrorCandidate({
        ...harness,
        adapter,
        validator,
      })
    ).rejects.toThrow("requires a persisted explicit authorization");
    expect(invocations).toEqual([]);

    const initialized =
      await initializeHorrorCandidateExecutionLedger(harness);
    const expired = buildDispatchAuthorization({
      ledger: initialized.ledger,
      authorizedAt: "2026-07-26T09:00:00+02:00",
      expiresAt: "2026-07-26T10:00:00+02:00",
    });
    await persistHorrorCandidateDispatchAuthorization({
      paths: harness.paths,
      manifest: harness.manifest,
      preflight: harness.preflight,
      ledger: initialized.ledger,
      authorization: expired,
    });
    await expect(
      executeNextAuthorizedHorrorCandidate({
        ...harness,
        adapter,
        validator,
      })
    ).rejects.toThrow("authorization has expired");
    expect(invocations).toEqual([]);
  });

  it("fake-validates the authorized production boundary and persists immutable candidate output", async () => {
    const harness = await createExecutionHarness();
    await persistDispatchAuthorization(harness);
    const invocations: string[] = [];
    const adapter: AuthorizedHorrorCandidateExecutionAdapter = {
      kind: "production",
      async generate(request) {
        invocations.push(request.sampleUnitId);
        const finalLine = `Authorized final line for ${request.sampleUnitId}.`;
        return {
          status: "completed",
          candidateText: `Validated fake candidate. ${finalLine}`,
          chargedCostUsd: 0.35,
        };
      },
    };
    const validator: AuthorizedHorrorCandidateValidator = {
      async validate({ request, candidateText }) {
        const acceptedFinalLine = `Authorized final line for ${request.sampleUnitId}.`;
        expect(candidateText.endsWith(acceptedFinalLine)).toBe(true);
        return {
          status: "passed",
          acceptedFinalLine,
          contractVersion: "test-existing-story-contract-v1",
          evidenceHash: hashText(
            stableSerialize({ request, candidateText })
          ),
        };
      },
    };
    const result = await executeNextAuthorizedHorrorCandidate({
      ...harness,
      adapter,
      validator,
    });

    expect(result).toMatchObject({
      status: "completed",
      sampleUnitId: "full-025-endless-backrooms",
      providerInvoked: true,
      ledger: {
        accounting: {
          providerCallsReserved: 1,
          reservedCostUsd: 1,
          chargedCostUsd: 0.35,
        },
      },
    });
    expect(invocations).toEqual(["full-025-endless-backrooms"]);
    const outputPath = path.join(
      harness.workspaceRoot,
      harness.preflight.items[0]!.strategyOutputPath
    );
    const output = await fs.readFile(outputPath, "utf8");
    expect(hashText(output.trim())).toBe(
      (
        result.ledger.items[0] as Extract<
          (typeof result.ledger.items)[number],
          { state: "completed" }
        >
      ).result.candidateHash
    );
    expect(
      await fs
        .access(harness.paths.productionCandidateSetPath)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);
  });

  it("consumes one fake attempt on contract failure without candidate persistence or retry", async () => {
    const harness = await createExecutionHarness();
    await persistDispatchAuthorization(harness);
    const invocations: string[] = [];
    const adapter: AuthorizedHorrorCandidateExecutionAdapter = {
      kind: "production",
      async generate(request) {
        invocations.push(request.sampleUnitId);
        return {
          status: "completed",
          candidateText: `Invalid fake candidate for ${request.sampleUnitId}.`,
          chargedCostUsd: 0.2,
        };
      },
    };
    const validator: AuthorizedHorrorCandidateValidator = {
      async validate() {
        return {
          status: "failed",
          failureCode: "existing-contract-validation-failed",
        };
      },
    };
    const first = await executeNextAuthorizedHorrorCandidate({
      ...harness,
      adapter,
      validator,
    });
    expect(first.ledger.items.slice(0, 2).map((item) => item.state)).toEqual([
      "failed",
      "blocked",
    ]);
    const failedOutputPath = path.join(
      harness.workspaceRoot,
      harness.preflight.items[0]!.strategyOutputPath
    );
    expect(
      await fs
        .access(failedOutputPath)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);

    await executeNextAuthorizedHorrorCandidate({
      ...harness,
      adapter,
      validator,
    });
    expect(invocations).toEqual([
      "full-025-endless-backrooms",
      "full-028-man-in-the-attic",
    ]);
  });

  it("initializes the exact v3 atomic execution ledger and rejects changed identity", async () => {
    const harness = await createExecutionHarness();
    const first = await initializeHorrorCandidateExecutionLedger(harness);
    const persisted = horrorCandidateExecutionLedgerSchema.parse(
      JSON.parse(
        await fs.readFile(
          harness.paths.candidateExecutionLedgerPath,
          "utf8"
        )
      )
    );

    expect(first).toEqual(
      expect.objectContaining({ persisted: true, reused: false })
    );
    expect(persisted).toEqual(first.ledger);
    expect(persisted).toMatchObject({
      evaluationId: harness.manifest.evaluationId,
      manifestHash: harness.manifest.manifestHash,
      preflightHash: harness.preflight.preflightHash,
      preflightVersion: harness.preflight.preflightVersion,
      strategyVersions: harness.manifest.strategyVersions,
      budget: {
        budgetReference: "story-evaluation-cap-2026-07-25",
        maxProviderCalls: 8,
        maxCostUsd: 8,
        perUnitCostCeilingUsd: 1,
      },
      accounting: {
        providerCallsReserved: 0,
        reservedCostUsd: 0,
        chargedCostUsd: 0,
      },
    });
    expect(persisted.items.map((item) => item.sampleUnitId)).toEqual(
      harness.preflight.items.map((item) => item.sampleUnitId)
    );
    expect(
      persisted.items.every(
        (item) =>
          item.state === "planned" &&
          item.requestFingerprint.length === 64 &&
          item.idempotencyKey ===
            `horror-candidate-${item.requestFingerprint}`
      )
    ).toBe(true);
    expect(JSON.stringify(persisted)).not.toMatch(
      /authorization|api[-_]?key|credential|secret/iu
    );
    await expect(
      initializeHorrorCandidateExecutionLedger(harness)
    ).resolves.toEqual(
      expect.objectContaining({ persisted: false, reused: true })
    );
    await expect(
      initializeHorrorCandidateExecutionLedger({
        ...harness,
        ledgerVersion: "changed-ledger-version",
      })
    ).rejects.toThrow("rejects changed, stale, partial, reordered, or extra");

    const reordered = rehashPreflight(harness.preflight, (body) => ({
      ...body,
      items: [body.items[2]!, body.items[3]!, ...body.items.slice(0, 2), ...body.items.slice(4)],
    }));
    await fs.writeFile(
      harness.paths.candidateGenerationPreflightPath,
      `${stableSerialize(reordered)}\n`,
      "utf8"
    );
    await expect(
      initializeHorrorCandidateExecutionLedger({
        ...harness,
        preflight: reordered,
      })
    ).rejects.toThrow("rejects changed, stale, partial, reordered, or extra");
  });

  it("reserves durably, enforces Full-before-Short, and resumes completed units once", async () => {
    const harness = await createExecutionHarness();
    const invocations: string[] = [];
    const adapter = successfulMockAdapter(invocations);
    let result = await executeNextHorrorCandidateWithMockAdapter({
      ...harness,
      adapter,
    });
    expect(result).toMatchObject({
      status: "completed",
      sampleUnitId: "full-025-endless-backrooms",
      providerInvoked: true,
    });
    expect(result.ledger.items[0]).toMatchObject({
      state: "completed",
      attemptCount: 1,
      reservedCostUsd: 1,
      chargedCostUsd: 0.4,
    });
    expect(result.ledger.items[0]).not.toHaveProperty("candidateText");

    result = await executeNextHorrorCandidateWithMockAdapter({
      ...harness,
      adapter,
    });
    expect(result.sampleUnitId).toBe("short-025-endless-backrooms");
    expect(invocations).toEqual([
      "full-025-endless-backrooms",
      "short-025-endless-backrooms",
    ]);

    for (let index = 0; index < 6; index += 1) {
      result = await executeNextHorrorCandidateWithMockAdapter({
        ...harness,
        adapter,
      });
    }
    expect(invocations).toHaveLength(8);
    expect(new Set(invocations)).toHaveLength(8);
    expect(result.ledger.accounting).toEqual({
      providerCallsReserved: 8,
      reservedCostUsd: 8,
      chargedCostUsd: 3.2,
    });
    const idle = await executeNextHorrorCandidateWithMockAdapter({
      ...harness,
      adapter,
    });
    expect(idle).toMatchObject({
      status: "idle",
      sampleUnitId: null,
      providerInvoked: false,
    });
    expect(invocations).toHaveLength(8);
  });

  it("uses zero retries and blocks a Short after failed or uncertain Full execution", async () => {
    const failedHarness = await createExecutionHarness();
    const failedInvocations: string[] = [];
    const failedAdapter: MockHorrorCandidateExecutionAdapter = {
      kind: "mock",
      async generate(request) {
        failedInvocations.push(request.sampleUnitId);
        return {
          status: "failed",
          failureCode: "mock-provider-rejected",
          chargedCostUsd: 0.2,
        };
      },
    };
    const failed = await executeNextHorrorCandidateWithMockAdapter({
      ...failedHarness,
      adapter: failedAdapter,
    });
    expect(failed.ledger.items.slice(0, 2).map((item) => item.state)).toEqual([
      "failed",
      "blocked",
    ]);
    await executeNextHorrorCandidateWithMockAdapter({
      ...failedHarness,
      adapter: failedAdapter,
    });
    expect(failedInvocations).toEqual([
      "full-025-endless-backrooms",
      "full-028-man-in-the-attic",
    ]);

    const uncertainHarness = await createExecutionHarness();
    const uncertainInvocations: string[] = [];
    const uncertainAdapter: MockHorrorCandidateExecutionAdapter = {
      kind: "mock",
      async generate(request) {
        uncertainInvocations.push(request.sampleUnitId);
        throw new Error("synthetic interruption after reservation");
      },
    };
    const uncertain = await executeNextHorrorCandidateWithMockAdapter({
      ...uncertainHarness,
      adapter: uncertainAdapter,
    });
    expect(uncertain.ledger.items.slice(0, 2).map((item) => item.state)).toEqual([
      "uncertain",
      "blocked",
    ]);
    await executeNextHorrorCandidateWithMockAdapter({
      ...uncertainHarness,
      adapter: uncertainAdapter,
    });
    expect(uncertainInvocations).toEqual([
      "full-025-endless-backrooms",
      "full-028-man-in-the-attic",
    ]);
  });

  it("fails closed on budget changes and preserves the last ledger after atomic promotion failure", async () => {
    const budgetHarness = await createExecutionHarness();
    const overUnitBudget = rehashPreflight(
      budgetHarness.preflight,
      (body) => ({
        ...body,
        items: body.items.map((item, index) =>
          index === 0
            ? { ...item, costCeilingUsd: 1.01 }
            : index === 1
              ? { ...item, costCeilingUsd: 0.99 }
              : item
        ),
      })
    );
    await expect(
      initializeHorrorCandidateExecutionLedger({
        ...budgetHarness,
        preflight: overUnitBudget,
      })
    ).rejects.toThrow("exceeds or changes the approved call/cost budget");

    const harness = await createExecutionHarness();
    const invocations: string[] = [];
    const adapter = successfulMockAdapter(invocations);
    let writes = 0;
    const writeLedgerAtomic = async (
      ledgerPath: string,
      ledger: Parameters<
        NonNullable<
          Parameters<typeof initializeHorrorCandidateExecutionLedger>[0]["writeLedgerAtomic"]
        >
      >[1]
    ) => {
      writes += 1;
      if (writes === 3) {
        throw new Error("synthetic atomic rename failure");
      }
      await fs.writeFile(
        `${ledgerPath}.temporary`,
        `${stableSerialize(ledger)}\n`,
        "utf8"
      );
      await fs.rename(`${ledgerPath}.temporary`, ledgerPath);
    };
    await expect(
      executeNextHorrorCandidateWithMockAdapter({
        ...harness,
        adapter,
        writeLedgerAtomic,
      })
    ).rejects.toThrow("synthetic atomic rename failure");
    expect(invocations).toEqual(["full-025-endless-backrooms"]);
    const lastValid = horrorCandidateExecutionLedgerSchema.parse(
      JSON.parse(
        await fs.readFile(harness.paths.candidateExecutionLedgerPath, "utf8")
      )
    );
    expect(lastValid.items[0]).toMatchObject({
      state: "reserved",
      attemptCount: 1,
    });

    const resumedInvocations: string[] = [];
    const resumed = await executeNextHorrorCandidateWithMockAdapter({
      ...harness,
      adapter: successfulMockAdapter(resumedInvocations),
    });
    expect(resumed.ledger.items.slice(0, 2).map((item) => item.state)).toEqual([
      "uncertain",
      "blocked",
    ]);
    expect(resumedInvocations).toEqual(["full-028-man-in-the-attic"]);

    const initializationFailureHarness = await createExecutionHarness();
    const noDispatchInvocations: string[] = [];
    await expect(
      executeNextHorrorCandidateWithMockAdapter({
        ...initializationFailureHarness,
        adapter: successfulMockAdapter(noDispatchInvocations),
        writeLedgerAtomic: async () => {
          throw new Error("synthetic initial ledger write failure");
        },
      })
    ).rejects.toThrow("synthetic initial ledger write failure");
    expect(noDispatchInvocations).toEqual([]);
  });

  it("preflights the exact v3 generation cohort without provider dispatch", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "horror-generation-preflight-")
    );
    const manifest = await loadApprovedV3Manifest();
    const paths = resolveHorrorEvaluationArtifactPaths({
      outputDirectory: directory,
      evaluationId: manifest.evaluationId,
    });
    const buildPreflight = (createdAt: string) =>
      prepareHorrorCandidateGenerationPreflight({
        workspaceRoot: productionWorkspaceRoot,
        paths,
        manifest,
        preflightVersion: "production-generation-preflight-v3",
        createdAt,
        createdBy: {
          actorId: "workspace-user",
          containsPersonalSecrets: false,
        },
        inventory: productionGenerationInventory,
      });
    const preflight = await buildPreflight("2026-07-26T01:40:30+02:00");
    const preregisteredPreflight =
      horrorCandidateGenerationPreflightSchema.parse(
        JSON.parse(
          await fs.readFile(
            path.join(
              productionWorkspaceRoot,
              "docs/development/horror-controlled-evaluation/candidate-generation-preflight.v3.json"
            ),
            "utf8"
          )
        ) as unknown
      );

    expect(
      horrorCandidateGenerationPreflightSchema.parse(preflight)
    ).toEqual(preflight);
    expect(preregisteredPreflight).toEqual(preflight);
    expect(preflight.execution).toEqual({
      preflightOnly: true,
      dryRun: true,
      rolloutMode: "enforce",
      maxRetries: 0,
      providerCallsDispatched: 0,
    });
    expect(preflight.budget).toMatchObject({
      maxProviderCalls: 8,
      plannedProviderCalls: 8,
      maxCostUsd: 8,
      perUnitCostCeilingUsd: 1,
    });
    expect(preflight.items).toHaveLength(8);
    expect(
      preflight.items
        .filter((item) => item.format === "short")
        .every((item) => {
          const dependency = preflight.items.find(
            (candidate) =>
              candidate.sampleUnitId === item.dependsOnSampleUnitId
          );
          return (
            dependency?.format === "full" &&
            dependency.episodeSlug === item.episodeSlug &&
            dependency.strategyOutputPath === item.strategyInputPath
          );
        })
    ).toBe(true);
    expect(
      preflight.items.find(
        (item) => item.sampleUnitId === "full-028-man-in-the-attic"
      )
    ).toMatchObject({
      sourceArtifactPath:
        "episodes/028-the-man-in-the-attic/source/source-cleaned.md",
      status: "ready",
    });

    await expect(
      prepareHorrorCandidateGenerationPreflight({
        workspaceRoot: productionWorkspaceRoot,
        paths,
        manifest,
        preflightVersion: "production-generation-preflight-v3",
        createdAt: "2026-07-26T10:00:00+02:00",
        createdBy: {
          actorId: "workspace-user",
          containsPersonalSecrets: false,
        },
        inventory: productionGenerationInventory.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                sourceArtifactPath: entry.baselineFullArtifactPath,
              }
            : entry
        ),
      })
    ).rejects.toThrow("canonical lineage is not ready");

    await expect(
      persistHorrorCandidateGenerationPreflight({
        paths,
        manifest,
        preflight,
      })
    ).rejects.toThrow("manifest must be persisted");
    await persistHorrorEvaluationManifest({ paths, manifest });
    await expect(
      persistHorrorCandidateGenerationPreflight({
        paths,
        manifest,
        preflight,
      })
    ).resolves.toEqual({ persisted: true, reused: false });
    await expect(
      persistHorrorCandidateGenerationPreflight({
        paths,
        manifest,
        preflight,
      })
    ).resolves.toEqual({ persisted: false, reused: true });
    await expect(
      persistHorrorCandidateGenerationPreflight({
        paths,
        manifest,
        preflight: await buildPreflight("2026-07-26T10:01:00+02:00"),
      })
    ).rejects.toThrow("preflight is immutable");
  });

  it("validates the approved v2 preregistration and fail-closed decision", async () => {
    const decisionPath = path.resolve(
      import.meta.dirname,
      "../../../docs/development/horror-controlled-evaluation/rollout-decision.v2.json"
    );
    const manifest = await loadApprovedV2Manifest();
    const decision = horrorRolloutDecisionArtifactSchema.parse(
      JSON.parse(await fs.readFile(decisionPath, "utf8"))
    );

    expect(manifest.primaryMetric).toEqual(
      expect.objectContaining({ status: "resolved", value: "endingRetention" })
    );
    expect(manifest.practicalImprovementThreshold).toEqual(
      expect.objectContaining({ status: "resolved", value: 0.05 })
    );
    expect(manifest.sample).toEqual(
      expect.objectContaining({
        status: "resolved",
        value: expect.objectContaining({
          full: expect.arrayContaining([
            expect.objectContaining({
              sampleUnitId: "full-025-endless-backrooms",
            }),
          ]),
          short: expect.arrayContaining([
            expect.objectContaining({
              sampleUnitId: "short-051-voice-message-tomorrow",
            }),
          ]),
        }),
      })
    );
    expect(manifest.costBudget).toEqual(
      expect.objectContaining({
        status: "resolved",
        value: {
          maxIncrementalProviderCalls: 8,
          maxIncrementalCostUsd: 8,
          budgetReference: "story-evaluation-cap-2026-07-25",
        },
      })
    );
    expect(manifest.productDecisions.productionAnalyticsAuthority.status).toBe(
      "resolved"
    );
    expect(manifest.productDecisions.defaultRolloutChangeAuthority.status).toBe(
      "resolved"
    );
    expect(decision).toEqual(
      expect.objectContaining({
        evaluationId: manifest.evaluationId,
        manifestHash: manifest.manifestHash,
        requestedDecision: "remain-shadow",
        decision: "remain-shadow",
        confidence: "insufficient",
        humanApproval: null,
      })
    );
    expect(
      decision.gates.find(
        (gate) => gate.gateId === "product-decisions-resolved"
      )
    ).toEqual(expect.objectContaining({ passed: true }));
    expect(
      decision.gates.find(
        (gate) => gate.gateId === "explicit-human-approval"
      )
    ).toEqual(expect.objectContaining({ passed: false }));
  });

  it("prepares manifest-bound production blind packets deterministically", async () => {
    const manifest = await loadApprovedV3Manifest();
    const candidateSet = buildProductionCandidateSet(manifest);
    const first = prepareSeparatedBlindHorrorProductionEditorialReviews({
      manifest,
      candidateSet,
      seed: "production-v2-seed",
    });
    const second = prepareSeparatedBlindHorrorProductionEditorialReviews({
      manifest,
      candidateSet,
      seed: "production-v2-seed",
    });

    expect(first).toEqual(second);
    expect(first.full.reviewPacket.items).toHaveLength(4);
    expect(first.short.reviewPacket.items).toHaveLength(4);
    expect(
      first.full.answerKey.assignments.every((entry) =>
        entry.corpusCaseId.startsWith("full-")
      )
    ).toBe(true);
    expect(
      first.short.answerKey.assignments.every((entry) =>
        entry.corpusCaseId.startsWith("short-")
      )
    ).toBe(true);
    expect(JSON.stringify(first.full.reviewPacket)).not.toContain(
      "sourceArtifactHash"
    );
    expect(JSON.stringify(first.short.reviewPacket)).not.toContain(
      candidateSet.manifestHash
    );
  });

  it("fails closed for mismatched, incomplete, or stale production candidates", async () => {
    const manifest = await loadApprovedV3Manifest();

    expect(() =>
      prepareSeparatedBlindHorrorProductionEditorialReviews({
        manifest,
        candidateSet: buildProductionCandidateSet(manifest, {
          manifestHash: "f".repeat(64),
        }),
        seed: "production-v2-seed",
      })
    ).toThrow("do not match the evaluation manifest");
    expect(() =>
      prepareSeparatedBlindHorrorProductionEditorialReviews({
        manifest,
        candidateSet: buildProductionCandidateSet(manifest, {
          omitLast: true,
        }),
        seed: "production-v2-seed",
      })
    ).toThrow("exact preregistered sample");
    expect(() =>
      prepareSeparatedBlindHorrorProductionEditorialReviews({
        manifest,
        candidateSet: buildProductionCandidateSet(manifest, {
          staleStrategyVersion: true,
        }),
        seed: "production-v2-seed",
      })
    ).toThrow("stale strategy lineage");
  });

  it("persists production candidates and separated blind packets immutably", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "horror-production-candidates-")
    );
    const manifest = await loadApprovedV3Manifest();
    const paths = resolveHorrorEvaluationArtifactPaths({
      outputDirectory: directory,
      evaluationId: manifest.evaluationId,
    });
    const candidateSet = buildProductionCandidateSet(manifest);

    await expect(
      persistHorrorProductionEditorialCandidateSet({
        paths,
        manifest,
        candidateSet,
      })
    ).rejects.toThrow("manifest must be persisted");
    await persistHorrorEvaluationManifest({ paths, manifest });
    await expect(
      persistSeparatedBlindHorrorProductionEditorialReviews({
        paths,
        manifest,
        candidateSet,
        seed: "production-v2-seed",
      })
    ).rejects.toThrow("candidate set must be persisted");
    await expect(
      persistHorrorProductionEditorialCandidateSet({
        paths,
        manifest,
        candidateSet,
      })
    ).resolves.toEqual({ persisted: true, reused: false });
    await expect(
      persistHorrorProductionEditorialCandidateSet({
        paths,
        manifest,
        candidateSet,
      })
    ).resolves.toEqual({ persisted: false, reused: true });
    await expect(
      persistHorrorProductionEditorialCandidateSet({
        paths,
        manifest,
        candidateSet: buildProductionCandidateSet(manifest, {
          strategyMarker: " changed",
        }),
      })
    ).rejects.toThrow("candidate set is immutable");

    const first =
      await persistSeparatedBlindHorrorProductionEditorialReviews({
        paths,
        manifest,
        candidateSet,
        seed: "production-v2-seed",
      });
    expect(first.persisted).toBe(true);
    expect(first.reused).toBe(false);
    expect(
      JSON.parse(await fs.readFile(paths.fullBlindReviewPacketPath, "utf8"))
    ).not.toHaveProperty("assignments");
    expect(
      JSON.parse(await fs.readFile(paths.fullBlindReviewAnswerKeyPath, "utf8"))
    ).toHaveProperty("assignments");

    await expect(
      persistSeparatedBlindHorrorProductionEditorialReviews({
        paths,
        manifest,
        candidateSet,
        seed: "production-v2-seed",
      })
    ).resolves.toEqual(
      expect.objectContaining({ persisted: false, reused: true })
    );
    await expect(
      persistSeparatedBlindHorrorProductionEditorialReviews({
        paths,
        manifest,
        candidateSet,
        seed: "changed-production-seed",
      })
    ).rejects.toThrow("blind-review artifacts are immutable");

    await fs.unlink(paths.shortBlindReviewAnswerKeyPath);
    await expect(
      persistSeparatedBlindHorrorProductionEditorialReviews({
        paths,
        manifest,
        candidateSet,
        seed: "production-v2-seed",
      })
    ).rejects.toThrow("blind-review artifacts are incomplete");
  });

  it("persists an immutable preregistration before accepting authorized outcomes", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "horror-evaluation-manifest-")
    );
    const manifest = buildResolvedManifest();
    const paths = resolveHorrorEvaluationArtifactPaths({
      outputDirectory: directory,
      evaluationId: manifest.evaluationId,
    });
    const metricsImport = buildMetricsImport(manifest);

    await expect(
      persistAuthorizedHorrorAudienceMetricsImport({
        paths,
        manifest,
        artifact: metricsImport,
      })
    ).rejects.toThrow("manifest must be persisted before outcome inspection");

    await expect(
      persistHorrorEvaluationManifest({ paths, manifest })
    ).resolves.toEqual({ persisted: true, reused: false });
    await expect(
      persistHorrorEvaluationManifest({ paths, manifest })
    ).resolves.toEqual({ persisted: false, reused: true });
    await expect(
      persistAuthorizedHorrorAudienceMetricsImport({
        paths,
        manifest,
        artifact: metricsImport,
      })
    ).resolves.toBeUndefined();

    const {
      schemaVersion: _schemaVersion,
      creation: _creation,
      manifestHash: _manifestHash,
      ...manifestInput
    } = manifest;
    const changed = buildHorrorEvaluationManifest({
      ...manifestInput,
      practicalImprovementThreshold: {
        status: "resolved",
        value: 0.03,
        decisionReference: "changed-after-outcomes",
      },
    });
    await expect(
      persistHorrorEvaluationManifest({ paths, manifest: changed })
    ).rejects.toThrow("immutable after preregistration");
  });

  it("keeps seeded blind full and Short packets separate and deterministic", async () => {
    const corpus = await loadCorpus();
    expect(corpus.schemaVersion).toBe(HORROR_CALIBRATION_CORPUS_SCHEMA_VERSION);
    const first = prepareSeparatedBlindHorrorEditorialReviews({
      corpus,
      seed: "task-08-seed",
    });
    const second = prepareSeparatedBlindHorrorEditorialReviews({
      corpus,
      seed: "task-08-seed",
    });

    expect(first).toEqual(second);
    expect(first.full.reviewPacket.items).not.toHaveLength(0);
    expect(first.short.reviewPacket.items).not.toHaveLength(0);
    expect(
      first.full.reviewPacket.items.every(
        (item) => item.strata.format === "full"
      )
    ).toBe(true);
    expect(
      first.short.reviewPacket.items.every(
        (item) => item.strata.format === "short"
      )
    ).toBe(true);
    const fullItemIds = new Set(
      first.full.answerKey.assignments.map((entry) => entry.reviewItemId)
    );
    expect(
      first.short.answerKey.assignments.every(
        (entry) => !fullItemIds.has(entry.reviewItemId)
      )
    ).toBe(true);
  });

  it("requires non-secret rater provenance", () => {
    expect(
      horrorEditorialRaterProvenanceSchema.parse({
        reviewerId: "reviewer-01",
        role: "story-editor",
        organizationAlias: "internal-editorial",
        provenanceReference: "task-08-synthetic-round",
        containsPersonalSecrets: false,
      })
    ).toMatchObject({ reviewerId: "reviewer-01" });
    expect(() =>
      horrorEditorialRaterProvenanceSchema.parse({
        reviewerId: "reviewer-01",
        role: "story-editor",
        provenanceReference: "task-08-synthetic-round",
        containsPersonalSecrets: true,
      })
    ).toThrow();
  });

  it("validates the current fail-closed preregistration and decision records", async () => {
    const manifest = horrorEvaluationManifestSchema.parse(
      JSON.parse(
        await fs.readFile(
          new URL(
            "../../../docs/development/horror-controlled-evaluation/evaluation-manifest.v1.json",
            import.meta.url
          ),
          "utf8"
        )
      ) as unknown
    );
    const decision = horrorRolloutDecisionArtifactSchema.parse(
      JSON.parse(
        await fs.readFile(
          new URL(
            "../../../docs/development/horror-controlled-evaluation/rollout-decision.v1.json",
            import.meta.url
          ),
          "utf8"
        )
      ) as unknown
    );
    expect(manifest.primaryMetric.status).toBe("unresolved");
    expect(decision.manifestHash).toBe(manifest.manifestHash);
    expect(decision.decision).toBe("remain-shadow");
    expect(decision.confidence).toBe("insufficient");
  });
});

describe("controlled evaluation metrics, decision, approval, and rollback", () => {
  it("separates formats, classifies CTR, reports missing data, and marks small strata exploratory", () => {
    const manifest = buildResolvedManifest();
    const result = evaluateHorrorAudienceMetrics({
      manifest,
      artifact: buildMetricsImport(manifest),
    });

    const fullApv = result.full.overall.find(
      (metric) => metric.metric === "averagePercentageViewed"
    );
    expect(fullApv).toMatchObject({
      classification: "story-outcome",
      status: "confirmatory",
      strategyMinusBaseline: 0.04,
    });
    expect(
      result.full.overall.find((metric) => metric.metric === "ctr")
    ).toMatchObject({
      classification: "title-thumbnail-evidence",
    });
    expect(
      result.short.overall.find((metric) => metric.metric === "endingRetention")
    ).toMatchObject({
      status: "missing",
      missingObservationCount: 2,
    });
    expect(
      result.full.strata
        .flatMap((stratum) => stratum.metrics)
        .filter((metric) => metric.metric === "earlyRetention")
        .every((metric) => metric.status === "exploratory")
    ).toBe(true);
  });

  it("fails closed for unresolved decisions and missing approval", () => {
    const unresolved = buildUnresolvedManifest();
    const unresolvedDecision = buildHorrorRolloutDecisionArtifact({
      manifest: unresolved,
      generatedAt: "2026-07-24T11:00:00+02:00",
      requestedDecision: "promote-to-enforce",
      scope,
      evidence: passingEvidence,
    });
    expect(unresolvedDecision.decision).toBe("remain-shadow");
    expect(
      unresolvedDecision.gates.find(
        (gate) => gate.gateId === "product-decisions-resolved"
      )?.passed
    ).toBe(false);

    const resolved = buildResolvedManifest();
    const unapprovedDecision = buildHorrorRolloutDecisionArtifact({
      manifest: resolved,
      generatedAt: "2026-07-24T11:00:00+02:00",
      requestedDecision: "promote-to-enforce",
      scope,
      evidence: passingEvidence,
    });
    expect(unapprovedDecision.decision).toBe("remain-shadow");
    expect(
      unapprovedDecision.gates.find(
        (gate) => gate.gateId === "explicit-human-approval"
      )?.passed
    ).toBe(false);
  });

  it("promotes only with every gate and bound approval, while rollback stays configuration-only", () => {
    const manifest = buildResolvedManifest();
    const promotionApproval = buildHorrorRolloutApproval({
      decision: "promote-to-enforce",
      evaluationId: manifest.evaluationId,
      manifestHash: manifest.manifestHash,
      scope,
      approvedBy: "test-human-owner",
      approvalReference: "synthetic-promotion-approval",
      approvedAt: "2026-07-24T11:30:00+02:00",
    });
    const promotion = buildHorrorRolloutDecisionArtifact({
      manifest,
      generatedAt: "2026-07-24T12:00:00+02:00",
      requestedDecision: "promote-to-enforce",
      scope,
      evidence: passingEvidence,
      humanApproval: promotionApproval,
    });
    expect(promotion.decision).toBe("promote-to-enforce");
    expect(promotion.gates.every((gate) => gate.passed)).toBe(true);
    expect(promotion.dissentingEvidence).toEqual([
      "One synthetic reviewer preferred the baseline.",
    ]);

    const rollbackApproval = buildHorrorRolloutApproval({
      decision: "return-to-off",
      evaluationId: manifest.evaluationId,
      manifestHash: manifest.manifestHash,
      scope,
      approvedBy: "test-human-owner",
      approvalReference: "synthetic-rollback-approval",
      approvedAt: "2026-07-24T12:30:00+02:00",
    });
    const rollbackDecision = buildHorrorRolloutDecisionArtifact({
      manifest,
      generatedAt: "2026-07-24T13:00:00+02:00",
      requestedDecision: "return-to-off",
      scope,
      evidence: {
        ...passingEvidence,
        immutableFactRuleEndingRegressionFree: false,
        regressions: ["Synthetic immutable-fact regression."],
        confidence: "high",
      },
      humanApproval: rollbackApproval,
    });
    const paths = resolveHorrorEvaluationArtifactPaths({
      outputDirectory: "/tmp/task-08-transition",
      evaluationId: manifest.evaluationId,
    });
    const transition = planHorrorRolloutConfigurationTransition({
      currentMode: "enforce",
      decisionArtifact: rollbackDecision,
      approval: rollbackApproval,
      paths,
    });
    expect(transition).toMatchObject({
      configurationKey: "MEDIAFORGE_HORROR_AFFECT_ROLLOUT_MODE",
      from: "enforce",
      to: "off",
      acceptedStoriesRewritten: false,
      providerCalls: 0,
    });
    expect(transition.evidenceArtifactsRetained).toEqual([
      paths.manifestPath,
      paths.audienceMetricsImportPath,
      paths.decisionPath,
    ]);
  });
});
