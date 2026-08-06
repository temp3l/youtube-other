import fs from "node:fs/promises";
import path from "node:path";
import { normalizeEpisodeId } from "@mediaforge/shared";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import {
  assertResearchSnapshotV33,
  type HistoryResearchSnapshotV3_3,
} from "./history-research-v33.js";
import {
  DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
  TRUSTED_SCRIPT_REVIEW_WARNING,
  buildTrustedScriptClaimBindingsV33,
  createAuthorityTransitionV1,
  createHistorySourceAuthorityRecordV33,
  createTrustedNarrationAttestationV1,
  diffTrustedScriptNarrationV33,
  extractDeterministicTrustedClaimsV33,
  freezeTrustedScriptResearchSnapshotV33,
  importTrustedClaimsFromStoryGenerationV33,
  invalidateTrustedNarrationAttestationV1,
  isHistorySourceAuthorityMode,
  resolveHistorySourceAuthorityMode,
  trustedResearchDiagnosticsV33,
  type HistoryAuthorityTransitionV1,
  type HistorySourceAuthorityMode,
  type HistorySourceAuthorityRecordV33,
  type HistoryStoryGenerationResultV1,
  type HistoryTrustDeltaReportV33,
  type HistoryTrustedClaimV1,
  type TrustedNarrationAttestationV1,
} from "./history-trusted-script-v33.js";
import {
  buildHistoryVisualPlanV33,
  validateHistoryVisualPlanV33,
  type HistoryVisualPlanV3_3,
} from "./visual-planner-v33.js";
import { HISTORY_LONG_FORM_DURATION_POLICY_V33 } from "./history-narration-v33.js";

const FIXED_ISO = "1980-01-01T00:00:00.000Z";

const stablePretty = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

async function writeStableJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stablePretty(value), "utf8");
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

async function readJsonIfExists<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function episodePaths(options: {
  readonly episodeId: string;
  readonly outputRoot?: string;
}): {
  root: string;
  source: string;
  state: string;
  script: string;
  snapshot: string;
  authority: string;
  attestation: string;
  attestationLog: string;
  trustedClaims: string;
  bindings: string;
  deltaReport: string;
  transitionLog: string;
  authoringMode: string;
} {
  const root = path.join(
    path.resolve(options.outputRoot ?? path.join(process.cwd(), "episodes")),
    normalizeEpisodeId(options.episodeId)
  );
  const source = path.join(root, "source");
  const state = path.join(source, "history-v3.3");
  return {
    root,
    source,
    state,
    script: path.join(root, "languages", "script-en.md"),
    snapshot: path.join(state, "research-snapshot.json"),
    authority: path.join(state, "source-authority.json"),
    attestation: path.join(state, "trusted-narration-attestation.json"),
    attestationLog: path.join(state, "trusted-narration-attestation-log.json"),
    trustedClaims: path.join(state, "trusted-claims.json"),
    bindings: path.join(state, "script-claim-bindings.json"),
    deltaReport: path.join(state, "trust-delta-report.json"),
    transitionLog: path.join(state, "authority-transition-log.json"),
    authoringMode: path.join(state, "authoring-mode.json"),
  };
}

async function episodeTitle(source: string): Promise<string> {
  const metadata = await readJson<{
    originalFrontmatter?: { title?: string };
  }>(path.join(source, "normalized-metadata.json"));
  return metadata.originalFrontmatter?.title ?? "Untitled History episode";
}

async function knownEntities(source: string): Promise<string[]> {
  const metadata = await readJson<{
    geographicScope?: { labels?: string[] };
  }>(path.join(source, "normalized-metadata.json"));
  return metadata.geographicScope?.labels ?? [];
}

async function appendJsonArray<T>(file: string, item: T): Promise<T[]> {
  const existing = (await readJsonIfExists<T[]>(file)) ?? [];
  const next = [...existing, item];
  await writeStableJson(file, next);
  return next;
}

async function persistAuthoringArtifacts(input: {
  readonly paths: ReturnType<typeof episodePaths>;
  readonly authority: HistorySourceAuthorityRecordV33;
  readonly attestation: TrustedNarrationAttestationV1 | null;
  readonly trustedClaims: readonly HistoryTrustedClaimV1[];
  readonly diagnostics: ReturnType<typeof trustedResearchDiagnosticsV33>;
  readonly deltaReport?: HistoryTrustDeltaReportV33 | null;
}): Promise<void> {
  await writeStableJson(input.paths.authority, input.authority);
  await writeStableJson(input.paths.authoringMode, {
    schemaVersion: "history-authoring-mode.v1",
    episodeId: input.authority.episodeId,
    sourceAuthorityMode: input.authority.sourceAuthorityMode,
    defaultForHistory: DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
    warning:
      input.authority.sourceAuthorityMode === "trusted-script"
        ? TRUSTED_SCRIPT_REVIEW_WARNING
        : null,
    research: input.diagnostics,
    updatedAt: input.authority.updatedAt,
  });
  if (input.attestation)
    await writeStableJson(input.paths.attestation, input.attestation);
  await writeStableJson(input.paths.trustedClaims, {
    schemaVersion: "history-trusted-claims.v1",
    episodeId: input.authority.episodeId,
    claims: input.trustedClaims,
  });
  await writeStableJson(input.paths.bindings, {
    schemaVersion: "history-script-claim-bindings.v1",
    episodeId: input.authority.episodeId,
    bindings: buildTrustedScriptClaimBindingsV33({
      trustedClaims: input.trustedClaims,
    }),
  });
  if (input.deltaReport)
    await writeStableJson(input.paths.deltaReport, input.deltaReport);
}

export async function getHistoryAuthoringStatusV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
}): Promise<Record<string, unknown>> {
  const paths = episodePaths(request);
  const authority = await readJsonIfExists<HistorySourceAuthorityRecordV33>(
    paths.authority
  );
  const attestation = await readJsonIfExists<TrustedNarrationAttestationV1>(
    paths.attestation
  );
  const trustedClaimsDoc = await readJsonIfExists<{
    claims: HistoryTrustedClaimV1[];
  }>(paths.trustedClaims);
  const metadata = await readJsonIfExists<{
    sourceAuthorityMode?: unknown;
    canonicalGenre?: string;
  }>(path.join(paths.source, "normalized-metadata.json"));
  const resolved = resolveHistorySourceAuthorityMode({
    genreId: metadata?.canonicalGenre ?? "history",
    episodeMetadataMode: metadata?.sourceAuthorityMode,
    persistedMode: authority?.sourceAuthorityMode,
  });
  const diagnostics = trustedResearchDiagnosticsV33();
  return {
    episodeId: request.episodeId,
    defaultSourceAuthorityMode: DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
    sourceAuthorityMode: resolved.mode,
    resolvedFrom: resolved.resolvedFrom,
    attestation: attestation
      ? {
          id: attestation.id,
          assertion: attestation.assertion,
          authority: attestation.authority,
          narrationHash: attestation.narrationHash,
          valid: attestation.invalidatedAt === null,
          invalidatedAt: attestation.invalidatedAt,
        }
      : null,
    trustedClaimCount:
      trustedClaimsDoc?.claims.filter((claim) => claim.materiality === "material")
        .length ?? 0,
    nonMaterialClaimCount:
      trustedClaimsDoc?.claims.filter(
        (claim) => claim.materiality === "non_material"
      ).length ?? 0,
    research:
      resolved.mode === "trusted-script"
        ? diagnostics
        : {
            researchMode: "research-backed-or-unverified",
            providerCalls: null,
            webSearchCalls: null,
            externalSourcesRequired: resolved.mode === "research-backed",
          },
    warning:
      resolved.mode === "trusted-script" ? TRUSTED_SCRIPT_REVIEW_WARNING : null,
  };
}

export async function setHistorySourceAuthorityV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly mode: HistorySourceAuthorityMode;
  readonly actor?: string;
  readonly reason?: string;
  readonly assertion?: TrustedNarrationAttestationV1["assertion"];
  readonly dryRun?: boolean;
}): Promise<Record<string, unknown>> {
  if (!isHistorySourceAuthorityMode(request.mode))
    throw new Error(`Unsupported History authority mode: ${String(request.mode)}`);
  const paths = episodePaths(request);
  const previous = await readJsonIfExists<HistorySourceAuthorityRecordV33>(
    paths.authority
  );
  const rawScript = await fs.readFile(paths.script, "utf8");
  const narration = normalizeHistoryNarrationV33({
    episodeId: request.episodeId,
    rawScript,
  });
  const previousSnapshot = await readJsonIfExists<HistoryResearchSnapshotV3_3>(
    paths.snapshot
  );
  const transition = createAuthorityTransitionV1({
    episodeId: request.episodeId,
    fromMode: previous?.sourceAuthorityMode ?? null,
    toMode: request.mode,
    actor: request.actor ?? "editorial-workflow",
    reason:
      request.reason ??
      `Explicit authority transition to ${request.mode}.`,
    narrationHash: narration.normalizedTextSha256,
    previousSnapshotHash: previousSnapshot?.snapshotHash ?? null,
  });
  const authority = createHistorySourceAuthorityRecordV33({
    episodeId: request.episodeId,
    mode: request.mode,
    resolvedFrom: "cli",
    narrationHash: narration.normalizedTextSha256,
  });
  if (request.dryRun)
    return {
      dryRun: true,
      authority,
      transition,
      warning:
        request.mode === "trusted-script" ? TRUSTED_SCRIPT_REVIEW_WARNING : null,
    };
  await appendJsonArray(paths.transitionLog, transition);
  await writeStableJson(paths.authority, authority);
  if (request.mode === "trusted-script") {
    return runHistoryTrustScriptMigrationV33({
      episodeId: request.episodeId,
      ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
      assertion:
        request.assertion ?? "accepted-without-independent-verification",
      actor: request.actor ?? "editorial-workflow",
      reason: request.reason ?? "Authority set to trusted-script.",
    });
  }
  await writeStableJson(paths.authoringMode, {
    schemaVersion: "history-authoring-mode.v1",
    episodeId: request.episodeId,
    sourceAuthorityMode: request.mode,
    defaultForHistory: DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
    warning: null,
    research: {
      researchMode:
        request.mode === "research-backed"
          ? "explicit-research-backed"
          : "unverified-external",
      providerCalls: null,
      webSearchCalls: null,
      externalSourcesRequired: request.mode === "research-backed",
    },
    updatedAt: FIXED_ISO,
  });
  return {
    episodeId: request.episodeId,
    authority,
    transition,
    migrated: false,
  };
}

export async function attestHistoryTrustedNarrationV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly assertion?: TrustedNarrationAttestationV1["assertion"];
  readonly authority?: TrustedNarrationAttestationV1["authority"];
  readonly authorityName?: string | null;
  readonly scope?: TrustedNarrationAttestationV1["scope"];
  readonly selectedClaimIds?: readonly string[];
  readonly dryRun?: boolean;
}): Promise<Record<string, unknown>> {
  const paths = episodePaths(request);
  const rawScript = await fs.readFile(paths.script, "utf8");
  const narration = normalizeHistoryNarrationV33({
    episodeId: request.episodeId,
    rawScript,
  });
  const previous = await readJsonIfExists<TrustedNarrationAttestationV1>(
    paths.attestation
  );
  const attestation = createTrustedNarrationAttestationV1({
    episodeId: request.episodeId,
    narrationHash: narration.normalizedTextSha256,
    assertion: request.assertion ?? "factually-verified",
    authority: request.authority ?? "user",
    authorityName: request.authorityName ?? null,
    scope: request.scope ?? "entire-narration",
    selectedClaimIds: request.selectedClaimIds ?? [],
    parentAttestationId: previous?.id ?? null,
  });
  if (request.dryRun) return { dryRun: true, attestation };
  if (previous && !previous.invalidatedAt) {
    const invalidated = invalidateTrustedNarrationAttestationV1(previous, {
      reason: "Superseded by explicit re-attestation.",
      invalidatedAt: FIXED_ISO,
    });
    await appendJsonArray(paths.attestationLog, invalidated);
  }
  await appendJsonArray(paths.attestationLog, attestation);
  await writeStableJson(paths.attestation, attestation);
  const trustedDoc = await readJsonIfExists<{ claims: HistoryTrustedClaimV1[] }>(
    paths.trustedClaims
  );
  if (trustedDoc) {
    const rebound = trustedDoc.claims.map((claim) => ({
      ...claim,
      trustAttestationId: attestation.id,
      provenanceStatus:
        claim.materiality === "material"
          ? ("trusted_input" as const)
          : ("not_required" as const),
    }));
    await writeStableJson(paths.trustedClaims, {
      schemaVersion: "history-trusted-claims.v1",
      episodeId: request.episodeId,
      claims: rebound,
    });
  }
  return {
    episodeId: request.episodeId,
    attestation,
    warning: TRUSTED_SCRIPT_REVIEW_WARNING,
  };
}

export async function runHistoryTrustScriptMigrationV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly assertion?: TrustedNarrationAttestationV1["assertion"];
  readonly actor?: string;
  readonly reason?: string;
  readonly dryRun?: boolean;
  readonly storyGeneration?: HistoryStoryGenerationResultV1;
  readonly regenerateVisuals?: boolean;
}): Promise<Record<string, unknown>> {
  const paths = episodePaths(request);
  const providerCallsBefore = 0;
  const rawScript = await fs.readFile(paths.script, "utf8");
  const narration = normalizeHistoryNarrationV33({
    episodeId: request.episodeId,
    rawScript,
  });
  const previousSnapshot = await readJsonIfExists<HistoryResearchSnapshotV3_3>(
    paths.snapshot
  );
  if (previousSnapshot) assertResearchSnapshotV33(previousSnapshot);
  const previousAttestation = await readJsonIfExists<TrustedNarrationAttestationV1>(
    paths.attestation
  );
  const previousTrusted = await readJsonIfExists<{
    claims: HistoryTrustedClaimV1[];
  }>(paths.trustedClaims);
  const attestation = createTrustedNarrationAttestationV1({
    episodeId: request.episodeId,
    narrationHash: narration.normalizedTextSha256,
    assertion:
      request.assertion ?? "accepted-without-independent-verification",
    authority:
      request.assertion === "factually-verified" ? "user" : "editorial-workflow",
    authorityName: request.actor ?? null,
    parentAttestationId: previousAttestation?.id ?? null,
  });
  const entities = await knownEntities(paths.source);
  const extracted = request.storyGeneration
    ? importTrustedClaimsFromStoryGenerationV33({
        episodeId: request.episodeId,
        narration,
        generation: request.storyGeneration,
        attestationId: attestation.id,
      })
    : extractDeterministicTrustedClaimsV33({
        episodeId: request.episodeId,
        narration,
        attestationId: attestation.id,
        knownEntities: entities,
      });
  let deltaReport: HistoryTrustDeltaReportV33 | null = null;
  if (previousTrusted && previousSnapshot) {
    deltaReport = diffTrustedScriptNarrationV33({
      episodeId: request.episodeId,
      previousNarration: previousSnapshot.canonicalNarration,
      nextNarration: narration,
      previousClaims: previousTrusted.claims,
      nextClaims: extracted.trustedClaims,
    });
  }
  const snapshotVersion = (previousSnapshot?.snapshotVersion ?? 0) + 1;
  const snapshot = freezeTrustedScriptResearchSnapshotV33({
    episodeId: request.episodeId,
    snapshotVersion,
    canonicalNarration: narration,
    claims: extracted.claims,
    trustedClaims: extracted.trustedClaims,
    attestation,
  });
  const authority = createHistorySourceAuthorityRecordV33({
    episodeId: request.episodeId,
    mode: "trusted-script",
    resolvedFrom: "cli",
    narrationHash: narration.normalizedTextSha256,
  });
  const diagnostics = trustedResearchDiagnosticsV33();
  if (request.dryRun) {
    return {
      dryRun: true,
      episodeId: request.episodeId,
      authority,
      attestation,
      trustedClaimCount: extracted.trustedClaims.filter(
        (claim) => claim.materiality === "material"
      ).length,
      nonMaterialClaimCount: extracted.trustedClaims.filter(
        (claim) => claim.materiality === "non_material"
      ).length,
      research: diagnostics,
      providerCalls: providerCallsBefore,
      warning: TRUSTED_SCRIPT_REVIEW_WARNING,
      deltaReport,
    };
  }
  await fs.mkdir(paths.state, { recursive: true });
  if (previousSnapshot) {
    await writeStableJson(
      path.join(
        paths.state,
        `research-snapshot.prior-non-authoritative-${previousSnapshot.snapshotHash}.json`
      ),
      {
        ...previousSnapshot,
        nonAuthoritativeForTrustedScript: true,
        preservedForAudit: true,
      }
    );
  }
  if (previousAttestation && !previousAttestation.invalidatedAt) {
    await appendJsonArray(
      paths.attestationLog,
      invalidateTrustedNarrationAttestationV1(previousAttestation, {
        reason: "Superseded by trusted-script migration.",
        invalidatedAt: FIXED_ISO,
      })
    );
  }
  await appendJsonArray(paths.attestationLog, attestation);
  const immutable = path.join(
    paths.state,
    `research-snapshot.v${snapshot.snapshotVersion}-${snapshot.snapshotHash}.json`
  );
  await writeStableJson(immutable, snapshot);
  await writeStableJson(paths.snapshot, snapshot);
  await persistAuthoringArtifacts({
    paths,
    authority,
    attestation,
    trustedClaims: extracted.trustedClaims,
    diagnostics,
    deltaReport,
  });
  const metadataPath = path.join(paths.source, "normalized-metadata.json");
  const metadata = await readJson<Record<string, unknown>>(metadataPath);
  await writeStableJson(metadataPath, {
    ...metadata,
    sourceAuthorityMode: "trusted-script",
    factCheck: {
      ...((metadata["factCheck"] as Record<string, unknown> | undefined) ?? {}),
      researchProvenancePresent: false,
      trustedScriptAccepted: true,
      independentlyVerifiedByPipeline: false,
      claimExtraction: "trusted-deterministic",
      sourceAssessment: "not-required-trusted-script",
      quotationVerification: "trusted-input",
      chronologyValidation: "trusted-input",
    },
  });
  let plan: HistoryVisualPlanV3_3 | null = null;
  let validation: ReturnType<typeof validateHistoryVisualPlanV33> | null = null;
  if (request.regenerateVisuals !== false) {
    plan = buildHistoryVisualPlanV33({
      title: await episodeTitle(paths.source),
      researchSnapshot: snapshot,
      durationPolicy: HISTORY_LONG_FORM_DURATION_POLICY_V33,
    });
    validation = validateHistoryVisualPlanV33(plan);
    await writeStableJson(path.join(paths.state, `plan-${plan.planHash}.json`), plan);
    await writeStableJson(path.join(paths.state, "plan.json"), plan);
    await writeStableJson(path.join(paths.state, "validation.json"), validation);
  }
  return {
    episodeId: request.episodeId,
    sourceAuthorityMode: "trusted-script",
    narrationHash: narration.normalizedTextSha256,
    attestationId: attestation.id,
    attestationValid: attestation.invalidatedAt === null,
    trustedClaimCount: extracted.trustedClaims.filter(
      (claim) => claim.materiality === "material"
    ).length,
    nonMaterialClaimCount: extracted.trustedClaims.filter(
      (claim) => claim.materiality === "non_material"
    ).length,
    unresolvedDeltaCount: deltaReport?.invalidatedClaimIds.length ?? 0,
    research: diagnostics,
    providerCalls: 0,
    webSearchCalls: 0,
    planHash: plan?.planHash ?? null,
    approval: plan?.approval ?? null,
    warning: TRUSTED_SCRIPT_REVIEW_WARNING,
    priorSnapshotPreserved: Boolean(previousSnapshot),
  };
}

export async function extractHistoryTrustedClaimsCommandV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly dryRun?: boolean;
}): Promise<Record<string, unknown>> {
  const paths = episodePaths(request);
  const rawScript = await fs.readFile(paths.script, "utf8");
  const narration = normalizeHistoryNarrationV33({
    episodeId: request.episodeId,
    rawScript,
  });
  const attestation = await readJsonIfExists<TrustedNarrationAttestationV1>(
    paths.attestation
  );
  const extracted = extractDeterministicTrustedClaimsV33({
    episodeId: request.episodeId,
    narration,
    attestationId: attestation?.id ?? null,
    knownEntities: await knownEntities(paths.source),
  });
  if (request.dryRun)
    return {
      dryRun: true,
      claimCount: extracted.trustedClaims.length,
      claims: extracted.trustedClaims,
      research: trustedResearchDiagnosticsV33(),
    };
  await writeStableJson(paths.trustedClaims, {
    schemaVersion: "history-trusted-claims.v1",
    episodeId: request.episodeId,
    claims: extracted.trustedClaims,
  });
  await writeStableJson(paths.bindings, {
    schemaVersion: "history-script-claim-bindings.v1",
    episodeId: request.episodeId,
    bindings: buildTrustedScriptClaimBindingsV33({
      trustedClaims: extracted.trustedClaims,
    }),
  });
  return {
    episodeId: request.episodeId,
    claimCount: extracted.trustedClaims.length,
    materialCount: extracted.trustedClaims.filter(
      (claim) => claim.materiality === "material"
    ).length,
    research: trustedResearchDiagnosticsV33(),
  };
}

export async function diffHistoryTrustedScriptV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly previousScriptPath?: string;
}): Promise<HistoryTrustDeltaReportV33> {
  const paths = episodePaths(request);
  const currentScript = await fs.readFile(paths.script, "utf8");
  const nextNarration = normalizeHistoryNarrationV33({
    episodeId: request.episodeId,
    rawScript: currentScript,
  });
  const previousScript = request.previousScriptPath
    ? await fs.readFile(request.previousScriptPath, "utf8")
    : (
        await readJsonIfExists<HistoryResearchSnapshotV3_3>(paths.snapshot)
      )?.canonicalNarration
      ? null
      : currentScript;
  const previousSnapshot = await readJsonIfExists<HistoryResearchSnapshotV3_3>(
    paths.snapshot
  );
  const previousNarration =
    previousSnapshot?.canonicalNarration ??
    normalizeHistoryNarrationV33({
      episodeId: request.episodeId,
      rawScript: previousScript ?? currentScript,
    });
  const previousClaims =
    (
      await readJsonIfExists<{ claims: HistoryTrustedClaimV1[] }>(
        paths.trustedClaims
      )
    )?.claims ??
    extractDeterministicTrustedClaimsV33({
      episodeId: request.episodeId,
      narration: previousNarration,
    }).trustedClaims;
  const nextClaims = extractDeterministicTrustedClaimsV33({
    episodeId: request.episodeId,
    narration: nextNarration,
  }).trustedClaims;
  const report = diffTrustedScriptNarrationV33({
    episodeId: request.episodeId,
    previousNarration,
    nextNarration,
    previousClaims,
    nextClaims,
  });
  await writeStableJson(paths.deltaReport, report);
  return report;
}

export async function reattestHistoryTrustDeltasV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly claimIds?: readonly string[];
  readonly assertion?: TrustedNarrationAttestationV1["assertion"];
  readonly dryRun?: boolean;
}): Promise<Record<string, unknown>> {
  const paths = episodePaths(request);
  const report =
    (await readJsonIfExists<HistoryTrustDeltaReportV33>(paths.deltaReport)) ??
    (await diffHistoryTrustedScriptV33(request));
  const selected =
    request.claimIds ??
    report.invalidatedClaimIds;
  if (request.dryRun)
    return {
      dryRun: true,
      selectedClaimIds: selected,
      reattestationRequired: report.reattestationRequired,
    };
  if (!selected.length)
    return {
      episodeId: request.episodeId,
      reattested: false,
      reason: "No invalidated claims require re-attestation.",
    };
  return attestHistoryTrustedNarrationV33({
    episodeId: request.episodeId,
    ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
    assertion:
      request.assertion ?? "accepted-without-independent-verification",
    authority: "editorial-workflow",
    scope: "selected-claims",
    selectedClaimIds: selected,
  });
}

export async function regenerateHistoryTrustedVisualsV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly dryRun?: boolean;
}): Promise<Record<string, unknown>> {
  const paths = episodePaths(request);
  const authority = await readJsonIfExists<HistorySourceAuthorityRecordV33>(
    paths.authority
  );
  const mode = authority?.sourceAuthorityMode ?? DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE;
  if (mode === "unverified-external")
    throw new Error(
      "Factual visual planning remains blocked for unverified-external History stories."
    );
  const snapshot = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
  assertResearchSnapshotV33(snapshot);
  const plan = buildHistoryVisualPlanV33({
    title: await episodeTitle(paths.source),
    researchSnapshot: snapshot,
    durationPolicy: HISTORY_LONG_FORM_DURATION_POLICY_V33,
  });
  const validation = validateHistoryVisualPlanV33(plan);
  if (request.dryRun)
    return {
      dryRun: true,
      planHash: plan.planHash,
      approval: plan.approval,
      research: trustedResearchDiagnosticsV33(),
    };
  await writeStableJson(path.join(paths.state, `plan-${plan.planHash}.json`), plan);
  await writeStableJson(path.join(paths.state, "plan.json"), plan);
  await writeStableJson(path.join(paths.state, "validation.json"), validation);
  return {
    episodeId: request.episodeId,
    planHash: plan.planHash,
    approval: plan.approval,
    mapCount: plan.mapStates.length,
    diagramCount: plan.diagramStates.length,
    beatCount: plan.beats.length,
    shotCount: plan.shots.length,
    research: trustedResearchDiagnosticsV33(),
    warning: TRUSTED_SCRIPT_REVIEW_WARNING,
  };
}

export function assertLiveResearchAllowedForAuthorityV33(input: {
  readonly mode: HistorySourceAuthorityMode | null | undefined;
  readonly promoteToResearchBacked?: boolean;
}): void {
  if (input.mode === "trusted-script" && !input.promoteToResearchBacked)
    throw new Error(
      "Live research against a trusted-script episode requires --promote-to-research-backed."
    );
}

export async function loadHistoryAuthorityModeV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
}): Promise<HistorySourceAuthorityMode> {
  const paths = episodePaths(request);
  const authority = await readJsonIfExists<HistorySourceAuthorityRecordV33>(
    paths.authority
  );
  const metadata = await readJsonIfExists<{
    sourceAuthorityMode?: unknown;
    canonicalGenre?: string;
  }>(path.join(paths.source, "normalized-metadata.json"));
  return (
    resolveHistorySourceAuthorityMode({
      genreId: metadata?.canonicalGenre ?? "history",
      episodeMetadataMode: metadata?.sourceAuthorityMode,
      persistedMode: authority?.sourceAuthorityMode,
    }).mode ?? DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE
  );
}

export type { HistoryAuthorityTransitionV1 };
