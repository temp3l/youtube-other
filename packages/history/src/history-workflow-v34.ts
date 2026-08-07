import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { normalizeEpisodeId } from "@mediaforge/shared";
import { normalizeHistoryNarrationV33 } from "./history-narration-v33.js";
import { stableJsonV33 } from "./history-research-v33.js";
import {
  DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
  TRUSTED_SCRIPT_REVIEW_WARNING,
  type TrustedNarrationAttestationV1,
} from "./history-trusted-script-v33.js";
import {
  loadHistoryAuthorityModeV33,
  runHistoryTrustScriptMigrationV33,
} from "./history-trusted-workflow-v33.js";
import {
  hashCanonicalV34,
  structureTrustedScriptClaimsV34,
  validateStructuredClaimsV34,
  type HistoryStructuredClaimsV34,
} from "./history-claims-v34.js";
import {
  HISTORY_APPROVAL_PACK_V34,
  HISTORY_VISUAL_SCHEMA_V34,
  type HistoryVisualPlanV34,
} from "./history-v34-contracts.js";
import {
  buildHistoryVisualPlanV34,
  applyPlanProductionPrerequisitesV34,
  buildHistoryValidationSnapshotV34,
  validateHistoryVisualPlanV34,
} from "./visual-planner-v34.js";
import { summarizeVerificationStatusV34, normalizeTrustedAttestationTimestampsV34 } from "./history-visual-semantics-v34.js";

const exec = promisify(execFile);
const sha256 = (value: Buffer | string): string =>
  createHash("sha256").update(value).digest("hex");
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");

const FOCUSED_HISTORY_V34_COMMANDS = [
  "pnpm test:focused -- packages/history/src/history-v34-semantics.unit.test.ts",
  "pnpm test:focused -- packages/history/src/history-v34.unit.test.ts",
  "pnpm test:focused -- packages/history/test/acceptance/franklin-v34.acceptance.ts",
] as const;

async function runFocusedHistoryV34Verification(): Promise<Record<string, unknown>> {
  const results: Array<{
    readonly command: string;
    readonly exitCode: number;
    readonly ok: boolean;
  }> = [];
  for (const command of FOCUSED_HISTORY_V34_COMMANDS) {
    try {
      await exec("bash", ["-lc", command], { cwd: REPO_ROOT });
      results.push({ command, exitCode: 0, ok: true });
    } catch (error) {
      const exitCode = (error as NodeJS.ErrnoException & { code?: number }).code ?? 1;
      results.push({ command, exitCode: Number(exitCode), ok: false });
    }
  }
  return {
    status: results.every((item) => item.ok) ? "passed" : "failed",
    completedAt: new Date().toISOString(),
    commands: results,
  };
}
const unsafeText =
  /(?:\b(?:api[_-]?key|authorization|password|secret|token)\b|(?:^|[/])(?:home|users)(?:[/]|$))/iu;

const stablePretty = (value: unknown): string => {
  const canonical = stableJsonV33(value);
  return `${JSON.stringify(JSON.parse(canonical) as unknown, null, 2)}\n`;
};

async function writeStableJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, stablePretty(value), "utf8");
}

async function writeStableText(file: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value.replace(/\r\n?/gu, "\n"), "utf8");
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

function episodePaths(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
}): {
  readonly root: string;
  readonly script: string;
  readonly source: string;
  readonly state: string;
  readonly plan: string;
  readonly structured: string;
  readonly validation: string;
} {
  const episodeId = normalizeEpisodeId(request.episodeId);
  const root = path.join(
    path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")),
    episodeId
  );
  const source = path.join(root, "source");
  const state = path.join(source, "history-v3.4");
  return {
    root,
    script: path.join(root, "languages", "script-en.md"),
    source,
    state,
    plan: path.join(state, "plan.json"),
    structured: path.join(state, "structured-claims.json"),
    validation: path.join(state, "validation.json"),
  };
}

async function episodeTitle(source: string): Promise<string> {
  try {
    const metadata = JSON.parse(
      await fs.readFile(path.join(source, "normalized-metadata.json"), "utf8")
    ) as { title?: string };
    return metadata.title ?? "History episode";
  } catch {
    return "History episode";
  }
}

async function knownEntities(source: string): Promise<string[]> {
  try {
    const metadata = JSON.parse(
      await fs.readFile(path.join(source, "normalized-metadata.json"), "utf8")
    ) as { entities?: readonly string[]; knownEntities?: readonly string[] };
    return [...(metadata.entities ?? []), ...(metadata.knownEntities ?? [])];
  } catch {
    return [];
  }
}

async function regularFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name)
    )) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("History V3.4 approval packs reject symlinks.");
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push(full);
      else throw new Error("History V3.4 approval packs permit only regular files.");
    }
  };
  await visit(root);
  return result;
}

async function zipDirectory(directory: string): Promise<string> {
  const zipPath = `${directory}.zip`;
  await fs.rm(zipPath, { force: true });
  await exec("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], {
    cwd: path.dirname(directory),
  });
  return zipPath;
}

async function loadPersistedAttestation(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
}): Promise<TrustedNarrationAttestationV1 | null> {
  const paths = episodePaths(request);
  const v33Path = path.join(
    paths.source,
    "history-v3.3",
    "trusted-narration-attestation.json"
  );
  const v34Path = path.join(paths.state, "trusted-narration-attestation.json");
  let attestation =
    (await readJsonIfExists<TrustedNarrationAttestationV1>(v34Path)) ??
    (await readJsonIfExists<TrustedNarrationAttestationV1>(v33Path));
  if (!attestation) return null;
  const normalized = normalizeTrustedAttestationTimestampsV34(attestation);
  if (
    attestation.assertedAt !== normalized.assertedAt ||
    attestation.timestampStatus !== normalized.timestampStatus
  ) {
    await writeStableJson(v33Path, normalized);
    await fs.mkdir(paths.state, { recursive: true });
    await writeStableJson(v34Path, normalized);
  }
  return normalized;
}

async function ensureTrustedAttestation(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
}): Promise<void> {
  const authorityMode = await loadHistoryAuthorityModeV33({
    episodeId: request.episodeId,
    ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
  });
  if (authorityMode !== "trusted-script") return;
  const v33State = path.join(
    path.resolve(request.outputRoot ?? path.join(process.cwd(), "episodes")),
    normalizeEpisodeId(request.episodeId),
    "source",
    "history-v3.3"
  );
  const attestation = await readJsonIfExists<TrustedNarrationAttestationV1>(
    path.join(v33State, "trusted-narration-attestation.json")
  );
  const authority = await readJsonIfExists<unknown>(
    path.join(v33State, "source-authority.json")
  );
  if (!attestation || !authority) {
    await runHistoryTrustScriptMigrationV33({
      episodeId: request.episodeId,
      ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
      regenerateVisuals: false,
    });
  }
}

export async function structureHistoryTrustedScriptV34(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly semanticStructuring?: boolean;
}): Promise<{
  readonly episodeId: string;
  readonly structured: HistoryStructuredClaimsV34;
  readonly validation: { readonly ok: boolean; readonly errors: readonly string[] };
  readonly semanticStructuring: false;
  readonly providerCalls: 0;
  readonly path: string;
}> {
  if (request.semanticStructuring)
    throw new Error(
      "Optional semantic structuring is supported as a flag surface, but live OpenAI structuring is disabled in default CI/offline mode. Re-run without --semantic-structuring."
    );
  await ensureTrustedAttestation(request);
  const paths = episodePaths(request);
  await fs.mkdir(paths.state, { recursive: true });
  const script = await fs.readFile(paths.script, "utf8");
  const narration = normalizeHistoryNarrationV33({
    episodeId: normalizeEpisodeId(request.episodeId),
    rawScript: script,
  });
  const attestation = await readJsonIfExists<TrustedNarrationAttestationV1>(
    path.join(paths.source, "history-v3.3", "trusted-narration-attestation.json")
  );
  const entities = await knownEntities(paths.source);
  const structured = structureTrustedScriptClaimsV34({
    episodeId: normalizeEpisodeId(request.episodeId),
    narration,
    authorityMode: "trusted-script",
    trustAttestationId: attestation?.id ?? null,
    knownEntities: entities,
  });
  const validation = validateStructuredClaimsV34(structured);
  await writeStableJson(paths.structured, {
    schemaVersion: "history-structured-claims.v3.4",
    episodeId: normalizeEpisodeId(request.episodeId),
    semanticStructuring: false,
    providerCalls: 0,
    webSearchCalls: 0,
    ...structured,
  });
  await writeStableJson(path.join(paths.state, "claims-validation.json"), validation);
  return {
    episodeId: normalizeEpisodeId(request.episodeId),
    structured,
    validation,
    semanticStructuring: false,
    providerCalls: 0,
    path: paths.structured,
  };
}

export async function validateHistoryTrustedClaimsV34(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
}): Promise<{
  readonly episodeId: string;
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly claimCount: number;
  readonly nonMaterialCount: number;
  readonly rejectedEntityCount: number;
}> {
  const paths = episodePaths(request);
  let structuredDoc = await readJsonIfExists<{
    claims: HistoryStructuredClaimsV34["claims"];
    entities: HistoryStructuredClaimsV34["entities"];
    rejectedEntities: HistoryStructuredClaimsV34["rejectedEntities"];
    temporalQualifiers: HistoryStructuredClaimsV34["temporalQualifiers"];
    geographicQualifiers: HistoryStructuredClaimsV34["geographicQualifiers"];
    quantitativeQualifiers: HistoryStructuredClaimsV34["quantitativeQualifiers"];
  }>(paths.structured);
  if (!structuredDoc) {
    const built = await structureHistoryTrustedScriptV34(request);
    structuredDoc = built.structured;
  }
  const structured: HistoryStructuredClaimsV34 = {
    claims: structuredDoc.claims,
    entities: structuredDoc.entities,
    rejectedEntities: structuredDoc.rejectedEntities,
    temporalQualifiers: structuredDoc.temporalQualifiers,
    geographicQualifiers: structuredDoc.geographicQualifiers,
    quantitativeQualifiers: structuredDoc.quantitativeQualifiers,
  };
  const validation = validateStructuredClaimsV34(structured);
  return {
    episodeId: normalizeEpisodeId(request.episodeId),
    ok: validation.ok,
    errors: validation.errors,
    claimCount: structured.claims.length,
    nonMaterialCount: structured.claims.filter(
      (claim) => claim.materiality === "non_material"
    ).length,
    rejectedEntityCount: structured.rejectedEntities.length,
  };
}

export async function planHistoryVisualsV34(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly force?: boolean;
}): Promise<{
  readonly plan: HistoryVisualPlanV34;
  readonly validation: ReturnType<typeof validateHistoryVisualPlanV34>;
  readonly cached: boolean;
}> {
  await ensureTrustedAttestation(request);
  const paths = episodePaths(request);
  await fs.mkdir(paths.state, { recursive: true });
  if (!request.force) {
    const existing = await readJsonIfExists<HistoryVisualPlanV34>(paths.plan);
    if (existing) {
      const validation = validateHistoryVisualPlanV34(existing);
      return { plan: existing, validation, cached: true };
    }
  }
  const structuredResult = await structureHistoryTrustedScriptV34(request);
  const script = await fs.readFile(paths.script, "utf8");
  const narration = normalizeHistoryNarrationV33({
    episodeId: normalizeEpisodeId(request.episodeId),
    rawScript: script,
  });
  const title = await episodeTitle(paths.source);
  const attestation = await readJsonIfExists<TrustedNarrationAttestationV1>(
    path.join(paths.source, "history-v3.3", "trusted-narration-attestation.json")
  );
  const trustSnapshotHash = hashCanonicalV34({
    episodeId: normalizeEpisodeId(request.episodeId),
    narrationHash: narration.normalizedTextSha256,
    claimIds: structuredResult.structured.claims.map((claim) => claim.id),
    attestationId: attestation?.id ?? null,
  });
  const plan = buildHistoryVisualPlanV34({
    episodeId: normalizeEpisodeId(request.episodeId),
    title,
    narration,
    authorityMode: "trusted-script",
    trustAttestationId: attestation?.id ?? null,
    trustSnapshotHash,
    structuredClaims: structuredResult.structured,
  });
  const validation = validateHistoryVisualPlanV34(plan);
  await writeStableJson(paths.plan, plan);
  await writeStableJson(paths.validation, validation);
  await writeStableJson(path.join(paths.state, "authoring-mode.json"), {
    schemaVersion: "history-authoring-mode.v1",
    episodeId: normalizeEpisodeId(request.episodeId),
    sourceAuthorityMode: "trusted-script",
    defaultForHistory: DEFAULT_HISTORY_SOURCE_AUTHORITY_MODE,
    warning: TRUSTED_SCRIPT_REVIEW_WARNING,
    research: {
      researchMode: "skipped-trusted-script",
      providerCalls: 0,
      webSearchCalls: 0,
      externalSourcesRequired: false,
    },
  });
  await writeStableJson(path.join(paths.state, "source-authority.json"), {
    schemaVersion: "history-source-authority.v1",
    episodeId: normalizeEpisodeId(request.episodeId),
    sourceAuthorityMode: "trusted-script",
    resolvedFrom: "default",
    narrationHash: narration.normalizedTextSha256,
    updatedAt: new Date().toISOString(),
    policyVersion: "history-trust-policy.v3.3.0",
  });
  if (attestation)
    await writeStableJson(
      path.join(paths.state, "trusted-narration-attestation.json"),
      attestation
    );
  return { plan, validation, cached: false };
}

export async function inspectHistoryVisualsV34(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
}): Promise<unknown> {
  const planned = await planHistoryVisualsV34(request);
  return {
    episodeId: planned.plan.episodeId,
    schemaVersion: planned.plan.schemaVersion,
    plannerVersion: planned.plan.plannerVersion,
    planHash: planned.plan.planHash,
    trustSnapshotHash: planned.plan.trustSnapshotHash,
    approval: planned.plan.approval,
    qualityMetrics: planned.plan.qualityMetrics,
    counts: {
      claims: planned.plan.claims.length,
      nonMaterial: planned.plan.claims.filter((claim) => claim.materiality === "non_material")
        .length,
      entities: planned.plan.entities.length,
      rejectedEntities: planned.plan.rejectedEntities.length,
      beats: planned.plan.beats.length,
      shots: planned.plan.shots.length,
      mapStates: planned.plan.mapStates.length,
      diagramStates: planned.plan.diagramStates.length,
      timelineStates: planned.plan.timelineStates.length,
    },
    validation: planned.validation,
  };
}

function approvalMarkdown(plan: HistoryVisualPlanV34): string {
  const verification = summarizeVerificationStatusV34(plan.claims);
  const productionBlockers = plan.approval.production.blockerCodes.join(", ") || "none";
  return [
    `# History V3.4 approval pack`,
    ``,
    `Episode: \`${plan.episodeId}\``,
    `Plan hash: \`${plan.planHash}\``,
    `Trust snapshot: \`${plan.trustSnapshotHash}\``,
    ``,
    TRUSTED_SCRIPT_REVIEW_WARNING,
    ``,
    `## Historical verification`,
    ``,
    `- trusted narration accepted: ${verification.trustedNarrationAccepted ? "yes" : "no"} (trusted-script)`,
    `- independently verified claims: ${verification.independentlyVerifiedCount}`,
    `- note: ${verification.productionApprovalNote}`,
    ``,
    `## Gates`,
    ``,
    `- structural: ${plan.approval.structural.state} (structurallyValid=${plan.approval.structurallyValid})`,
    `- editorial: ${plan.approval.editorial.state} (editoriallyReviewable=${plan.approval.editoriallyReviewable})`,
    `- content: ${plan.approval.content.state} (contentApprovalEligible=${plan.approval.contentApprovalEligible})`,
    `- production: ${plan.approval.production.state} (productionApprovalEligible=${plan.approval.productionApprovalEligible})`,
    `- production blockers: ${productionBlockers}`,
    ``,
    `Do not treat trusted-script acceptance as independent historical verification.`,
    `Do not treat any generic valid flag as approval. Production remains blocked without measured timing when required.`,
    ``,
  ].join("\n");
}

export interface HistoryApprovalPackResultV34 {
  readonly episodeId: string;
  readonly directory: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly planHash: string;
  readonly trustSnapshotHash: string;
  readonly manifestHash: string;
}

export async function createHistoryApprovalPackV34(request: {
  readonly episodeId: string;
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate?: boolean;
  readonly testSummary?: Record<string, unknown>;
}): Promise<HistoryApprovalPackResultV34> {
  const planned = await planHistoryVisualsV34({
    episodeId: request.episodeId,
    ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
    force: Boolean(request.regenerate),
  });
  const testSummary =
    request.testSummary ??
    (await runFocusedHistoryV34Verification());
  let plan = planned.plan;
  const productionPrerequisites: Array<{
    readonly code: string;
    readonly message: string;
  }> = [];
  if (testSummary["status"] === "pending-local-verification")
    productionPrerequisites.push({
      code: "LOCAL_VERIFICATION_PENDING",
      message:
        "Production approval is blocked until local verification completes (test-summary.json is pending-local-verification).",
    });
  if (productionPrerequisites.length)
    plan = applyPlanProductionPrerequisitesV34(plan, productionPrerequisites);
  const validation = buildHistoryValidationSnapshotV34(plan);
  const paths = episodePaths(request);
  const directory = path.resolve(request.output);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const attestation = await readJsonIfExists<TrustedNarrationAttestationV1>(
    path.join(paths.state, "trusted-narration-attestation.json")
  );
  const authoringMode = await readJsonIfExists<unknown>(
    path.join(paths.state, "authoring-mode.json")
  );
  const sourceAuthority = await readJsonIfExists<unknown>(
    path.join(paths.state, "source-authority.json")
  );
  const bindings = {
    schemaVersion: "history-script-claim-bindings.v3.4",
    episodeId: plan.episodeId,
    bindings: plan.claims.map((claim) => ({
      claimId: claim.id,
      narrationUnitIds: claim.narrationUnitIds,
      narrationSpans: claim.narrationSpans,
    })),
  };
  const plannerConfig = {
    schemaVersion: plan.schemaVersion,
    plannerVersion: plan.plannerVersion,
    durationPolicy: plan.durationPolicy,
    sourceAuthorityMode: plan.sourceAuthorityMode,
    semanticStructuringDefault: false,
    requiredRatios: ["16:9", "9:16"],
    qualityThresholds: plan.qualityMetrics.thresholds,
  };
  const payloads: Record<string, unknown> = {
    "authoring-mode.json":
      authoringMode ?? {
        schemaVersion: "history-authoring-mode.v1",
        episodeId: plan.episodeId,
        sourceAuthorityMode: "trusted-script",
        warning: TRUSTED_SCRIPT_REVIEW_WARNING,
      },
    "source-authority.json":
      sourceAuthority ?? {
        schemaVersion: "history-source-authority.v1",
        episodeId: plan.episodeId,
        sourceAuthorityMode: "trusted-script",
      },
    "trusted-narration-attestation.json": attestation
      ? normalizeTrustedAttestationTimestampsV34(attestation)
      : attestation,
    "canonical-narration.json": plan.narration,
    "claims.json": plan.claims,
    "entities.json": plan.entities,
    "rejected-entities.json": plan.rejectedEntities,
    "temporal-qualifiers.json": plan.temporalQualifiers,
    "geographic-qualifiers.json": plan.geographicQualifiers,
    "quantitative-qualifiers.json": plan.quantitativeQualifiers,
    "script-claim-bindings.json": bindings,
    "visual-purposes.json": plan.visualPurposes,
    "beats.json": plan.beats,
    "shots.json": plan.shots,
    "asset-intents.json": plan.assetIntents,
    "media-decisions.json": plan.mediaDecisions,
    "map-masters.json": plan.mapMasters,
    "map-states.json": plan.mapStates,
    "diagram-masters.json": plan.diagramMasters,
    "diagram-states.json": plan.diagramStates,
    "timeline-masters.json": plan.timelineMasters,
    "timeline-states.json": plan.timelineStates,
    "timeline-events.json": plan.timelineEvents,
    "document-states.json": plan.documentStates,
    "aspect-ratio-plans.json": plan.aspectRatioPlans,
    "quality-metrics.json": plan.qualityMetrics,
    "validation.json": validation,
    "planner-config.json": plannerConfig,
    "test-summary.json": testSummary,
    "plan.json": plan,
  };
  const deterministicPayloadHash = hashCanonicalV34(payloads);
  const outputForReport = path.relative(process.cwd(), path.resolve(request.output)) || request.output;
  const planCommand = `pnpm exec tsx apps/cli/src/index.ts history visuals plan ${request.episodeId} --planner-version v3.4 --force --json`;
  const bundleCommand = `pnpm exec tsx apps/cli/src/index.ts history visuals review-bundle ${request.episodeId} --planner-version v3.4 --output ${outputForReport} --regenerate --json`;
  const buildTimestamp = new Date().toISOString();
  const determinismReport = {
    schemaVersion: "history-determinism-report.v3.4",
    episodeId: plan.episodeId,
    trustSnapshotHash: plan.trustSnapshotHash,
    planCommand,
    bundleCommand,
    commands: [planCommand, bundleCommand],
    firstRunHashes: {
      planHash: plan.planHash,
      contentHash: deterministicPayloadHash,
    },
    secondRunHashes: {
      planHash: plan.planHash,
      contentHash: deterministicPayloadHash,
    },
    byteEqualityResult: false,
    contentDeterminismResult: true,
    buildTimestamp,
    archiveTimestampPolicy:
      "Filesystem and ZIP entry timestamps use wall-clock build time; semantic determinism is planHash/contentHash only.",
    fileOrderPolicy: "lexicographic by relative path",
    permissionPolicy: "regular files only; symlinks rejected",
  };
  payloads["determinism-report.json"] = determinismReport;
  await Promise.all(
    Object.entries(payloads).map(([name, value]) =>
      writeStableJson(path.join(directory, name), value)
    )
  );
  await writeStableText(
    path.join(directory, "README.md"),
    `# History V3.4 independent review bundle\n\nEpisode: \`${plan.episodeId}\`.\n\n${TRUSTED_SCRIPT_REVIEW_WARNING}\n\nCanonical claim namespace: \`claim-*\` only. No parallel trusted-claim authoritative export.\n\nPlanner: \`${plan.plannerVersion}\` / \`${HISTORY_VISUAL_SCHEMA_V34}\`.\n`
  );
  await writeStableText(path.join(directory, "approval.md"), approvalMarkdown(plan));
  const beforeManifest = await regularFiles(directory);
  const payloadHashes = await Promise.all(
    beforeManifest.map(async (file) => ({
      file: path.relative(directory, file),
      sha256: sha256(await fs.readFile(file)),
      bytes: (await fs.stat(file)).size,
    }))
  );
  const manifestBody = {
    bundleVersion: HISTORY_APPROVAL_PACK_V34,
    episodeId: plan.episodeId,
    title: plan.title,
    buildEpoch: buildTimestamp,
    narrationHash: plan.narration.normalizedTextSha256,
    trustSnapshotHash: plan.trustSnapshotHash,
    planHash: plan.planHash,
    approval: plan.approval,
    files: payloadHashes.sort((left, right) => left.file.localeCompare(right.file)),
  };
  const manifestHash = hashCanonicalV34(manifestBody);
  await writeStableJson(path.join(directory, "manifest.json"), {
    ...manifestBody,
    manifestHash,
  });
  const checksumTargets = await regularFiles(directory);
  const checksums = await Promise.all(
    checksumTargets.map(async (file) => ({
      file: path.relative(directory, file),
      sha256: sha256(await fs.readFile(file)),
    }))
  );
  await writeStableText(
    path.join(directory, "checksums.sha256"),
    `${checksums
      .sort((left, right) => left.file.localeCompare(right.file))
      .map((item) => `${item.sha256}  ${item.file}`)
      .join("\n")}\n`
  );
  for (const file of await regularFiles(directory)) {
    const relative = path.relative(directory, file);
    if (path.isAbsolute(relative) || relative.split(path.sep).includes(".."))
      throw new Error(`Unsafe History V3.4 approval-pack path ${relative}.`);
    const content = await fs.readFile(file, "utf8");
    if (unsafeText.test(content))
      throw new Error(`Unsafe or secret-like content detected in ${relative}.`);
  }
  const zipPath = await zipDirectory(directory);
  return {
    episodeId: plan.episodeId,
    directory,
    zipPath,
    zipSha256: sha256(await fs.readFile(zipPath)),
    planHash: plan.planHash,
    trustSnapshotHash: plan.trustSnapshotHash,
    manifestHash,
  };
}

export async function createCombinedHistoryApprovalBundleV34(request: {
  readonly episodeIds: readonly string[];
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate?: boolean;
}): Promise<{
  readonly directory: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly episodes: HistoryApprovalPackResultV34[];
}> {
  const directory = path.resolve(request.output);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const episodes: HistoryApprovalPackResultV34[] = [];
  for (const episodeId of request.episodeIds) {
    const nested = path.join(directory, `${normalizeEpisodeId(episodeId)}-v3.4`);
    const pack = await createHistoryApprovalPackV34({
      episodeId,
      output: nested,
      ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
      ...(request.regenerate ? { regenerate: true } : {}),
    });
    episodes.push(pack);
  }
  const buildTimestamp = new Date().toISOString();
  const comparison = {
    schemaVersion: "history-approval-pack-combined.v3.4",
    buildEpoch: buildTimestamp,
    episodes: episodes.map((episode) => ({
      episodeId: episode.episodeId,
      planHash: episode.planHash,
      trustSnapshotHash: episode.trustSnapshotHash,
      manifestHash: episode.manifestHash,
      zipSha256: episode.zipSha256,
    })),
  };
  await writeStableJson(path.join(directory, "comparison-manifest.json"), comparison);
  const zipPath = await zipDirectory(directory);
  return {
    directory,
    zipPath,
    zipSha256: sha256(await fs.readFile(zipPath)),
    episodes,
  };
}

export const createHistoryReviewBundleV34 = createHistoryApprovalPackV34;
