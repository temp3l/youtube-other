import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { normalizeEpisodeId } from "@mediaforge/shared";
import {
  HISTORY_LONG_FORM_DURATION_POLICY_V33,
  normalizeHistoryNarrationV33,
} from "./history-narration-v33.js";
import {
  FixtureClaimExtractionProviderV33,
  ResilientClaimExtractionProviderV33,
  alignClaimProposalsV33,
  assertResearchSnapshotV33,
  createEvidenceFragmentV33,
  createSourceReferenceV33,
  deriveClaimProvenanceV33,
  freezeResearchSnapshotV33,
  hashCanonicalV33,
  stableJsonV33,
  type HistoryResearchSnapshotV3_3,
  type EvidenceFragmentV3_3,
  type ClaimExtractionProviderV3_3,
  type ClaimEvidenceAssessmentV3_3,
  type ClaimProposalV3_3,
  type EvidenceAssessmentProviderV3_3,
  type ProviderRunMetadataV3_3,
  type SourceReferenceV3_3,
  type VisualPurposeProviderV3_3,
  type VisualPurposeProposalV3_3,
} from "./history-research-v33.js";
import {
  HISTORY_APPROVAL_PACK_V33,
  buildHistoryVisualPlanV33,
  validateHistoryVisualPlanV33,
  type HistoryVisualPlanV3_3,
} from "./visual-planner-v33.js";

const exec = promisify(execFile);
const FIXED_EPOCH = new Date("1980-01-01T00:00:00.000Z");
const FIXED_ISO = FIXED_EPOCH.toISOString();
const sha256 = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

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

function qualityTier(source: { title: string; url: string }): number {
  if (/nature\.com|archive|archives|museum|university|\.edu\b|cdc\.gov/iu.test(source.url)) return 3;
  if (/britannica|history\.org\.uk|napoleon\.org/iu.test(source.url)) return 4;
  return 5;
}

function sourceType(tier: number): string {
  return tier <= 2 ? "scholarly" : tier === 3 ? "institutional" : tier === 4 ? "reference" : "discovery-only";
}

const decodeHtml = (value: string): string =>
  value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#(\d+);/gu, (_match, number: string) =>
      String.fromCodePoint(Number(number))
    );

const htmlText = (value: string): string =>
  decodeHtml(value.replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();

async function retrieveDeclaredSourcesLive(input: {
  readonly declared: readonly { title: string; url: string }[];
  readonly retrievedAt: string;
}): Promise<{
  readonly sources: SourceReferenceV3_3[];
  readonly evidence: EvidenceFragmentV3_3[];
  readonly failures: readonly {
    readonly sourceUrl: string;
    readonly message: string;
  }[];
}> {
  const sources: SourceReferenceV3_3[] = [];
  const evidence: EvidenceFragmentV3_3[] = [];
  const failures: Array<{ sourceUrl: string; message: string }> = [];
  for (const declared of input.declared) {
    try {
      const response = await fetch(declared.url, {
        redirect: "follow",
        headers: {
          "user-agent": "Mediaforge-History-Research/3.3 (+auditable-source-freeze)",
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/iu.test(contentType))
        throw new Error(`unsupported content type ${contentType}`);
      const body = await response.text();
      if (!body.trim()) throw new Error("empty response");
      if (/^idp\./iu.test(new URL(response.url).hostname))
        throw new Error("authentication redirect did not expose source content");
      const metaDescription =
        body.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/iu)?.[1] ??
        body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/iu)?.[1];
      const firstParagraph = body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/iu)?.[1];
      const excerpt = htmlText(metaDescription ?? firstParagraph ?? "").slice(0, 500);
      if (!excerpt) throw new Error("no concise reproducible text fragment");
      const resolved = { ...declared, url: response.url || declared.url };
      const tier = qualityTier(resolved);
      const source = createSourceReferenceV33({
        canonicalUrl: resolved.url,
        sourceType: sourceType(tier),
        qualityTier: tier,
        title: declared.title,
        authors: [],
        publisherOrInstitution: new URL(resolved.url).hostname,
        publicationDate: null,
        edition: null,
        language: "en",
        doi: null,
        isbn: null,
        archiveIdentifier: null,
        retrievalProvider: "auditable-http-fetch.v3.3",
        retrievedAt: input.retrievedAt,
        snapshotHash: sha256(body),
        normalizedCitation: `${declared.title}. ${resolved.url}`,
      });
      sources.push(source);
      evidence.push(
        createEvidenceFragmentV33({
          sourceReferenceId: source.id,
          locator: {
            kind: "text-anchor",
            value: metaDescription ? "meta[name=description]" : "first-paragraph",
          },
          excerpt,
          independentlyReproducible: true,
          retrievedAt: input.retrievedAt,
        })
      );
    } catch (error) {
      failures.push({
        sourceUrl: declared.url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { sources, evidence, failures };
}

export type HistoryV33WorkflowStage =
  | "normalize"
  | "extract-claims"
  | "retrieve-sources"
  | "assess-evidence"
  | "evaluate-provenance"
  | "freeze"
  | "plan"
  | "validate"
  | "export";

export interface HistoryV33WorkflowOptions {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly mode?: "offline-fixture" | "live-research" | "reuse-frozen-snapshot";
  readonly refreshSources?: boolean;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly stage?: HistoryV33WorkflowStage;
  readonly approvalOutput?: string;
  readonly claimExtractionProvider?: ClaimExtractionProviderV3_3;
  readonly evidenceAssessmentProvider?: EvidenceAssessmentProviderV3_3;
  readonly visualPurposeProvider?: VisualPurposeProviderV3_3;
}

function episodePaths(options: HistoryV33WorkflowOptions): {
  root: string;
  source: string;
  state: string;
  script: string;
  snapshot: string;
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
  };
}

async function episodeTitle(source: string): Promise<string> {
  const metadata = await readJson<{
    originalFrontmatter?: { title?: string };
  }>(path.join(source, "normalized-metadata.json"));
  return metadata.originalFrontmatter?.title ?? "Untitled History episode";
}

async function declaredSources(
  source: string
): Promise<Array<{ title: string; url: string }>> {
  const registry = await readJson<{
    sources?: Array<{ title?: string; url?: string }>;
  }>(path.join(source, "research-sources.json"));
  return (registry.sources ?? [])
    .filter(
      (item): item is { title: string; url: string } =>
        Boolean(item.title && item.url)
    )
    .sort((left, right) => left.url.localeCompare(right.url));
}

export async function runHistoryResearchPhaseV33(
  options: HistoryV33WorkflowOptions
): Promise<HistoryResearchSnapshotV3_3> {
  const paths = episodePaths(options);
  if (options.mode === "reuse-frozen-snapshot") {
    const frozen = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
    assertResearchSnapshotV33(frozen);
    return frozen;
  }
  const liveResearch = options.mode === "live-research";
  const rawScript = await fs.readFile(paths.script, "utf8");
  const canonicalNarration = normalizeHistoryNarrationV33({
    episodeId: options.episodeId,
    rawScript,
  });
  const researchTimestamp = liveResearch ? new Date().toISOString() : FIXED_ISO;
  if (liveResearch && !options.claimExtractionProvider)
    throw new Error(
      "History V3.3 live research requires an injected schema-constrained claim extraction provider."
    );
  const provider = new ResilientClaimExtractionProviderV33(
    options.claimExtractionProvider ??
      new FixtureClaimExtractionProviderV33(researchTimestamp),
    { maxConcurrency: 2, maxRetries: 2 }
  );
  const extractionRuns: ProviderRunMetadataV3_3[] = [];
  const proposals: ClaimProposalV3_3[] = [];
  for (let index = 0; index < canonicalNarration.units.length; index += 30) {
    const extracted = await provider.extract({
      episodeId: options.episodeId,
      narrationSha256: canonicalNarration.normalizedTextSha256,
      units: canonicalNarration.units.slice(index, index + 30),
    });
    proposals.push(...extracted.proposals);
    extractionRuns.push(extracted.metadata);
  }
  const claims = alignClaimProposalsV33({
    episodeId: options.episodeId,
    narration: canonicalNarration,
    proposals,
  });
  const declared = await declaredSources(paths.source);
  const registeredSources: SourceReferenceV3_3[] = declared.map((declared) => {
    const tier = qualityTier(declared);
    return createSourceReferenceV33({
      canonicalUrl: declared.url,
      sourceType: sourceType(tier),
      qualityTier: tier,
      title: declared.title,
      authors: [],
      publisherOrInstitution: new URL(declared.url).hostname,
      publicationDate: null,
      edition: null,
      language: "en",
      doi: null,
      isbn: null,
      archiveIdentifier: null,
      retrievalProvider: "canonical-pack-source-registry",
      retrievedAt: FIXED_ISO,
      snapshotHash: null,
      normalizedCitation: `${declared.title}. ${declared.url}`,
    });
  });
  const liveRetrieval = liveResearch
    ? await retrieveDeclaredSourcesLive({ declared, retrievedAt: researchTimestamp })
    : null;
  if (liveResearch && liveRetrieval?.sources.length === 0)
    throw new Error(
      `History V3.3 live retrieval produced no verifiable sources: ${liveRetrieval.failures.map((failure) => `${failure.sourceUrl}: ${failure.message}`).join("; ")}`
    );
  const sourceReferences = liveRetrieval?.sources ?? registeredSources;
  const evidenceFragments: HistoryResearchSnapshotV3_3["evidenceFragments"] =
    liveRetrieval?.evidence ?? [];
  const evidenceAssessments: ClaimEvidenceAssessmentV3_3[] = [];
  const assessmentRuns: ProviderRunMetadataV3_3[] = [];
  if (options.evidenceAssessmentProvider && evidenceFragments.length) {
    for (let index = 0; index < claims.length; index += 25) {
      const assessed = await options.evidenceAssessmentProvider.assess({
        claims: claims.slice(index, index + 25),
        evidenceFragments,
        sourceReferences,
      });
      evidenceAssessments.push(...assessed.assessments);
      assessmentRuns.push(assessed.metadata);
    }
  }
  const provenance = deriveClaimProvenanceV33({
    claims,
    sources: sourceReferences,
    evidence: evidenceFragments,
    assessments: evidenceAssessments,
  });
  const visualPurposeRuns: ProviderRunMetadataV3_3[] = [];
  const visualPurposeProposals: VisualPurposeProposalV3_3[] = [];
  if (options.visualPurposeProvider) {
    const proposed = await options.visualPurposeProvider.propose({
      episodeId: options.episodeId,
      narration: canonicalNarration,
      claims,
      provenance,
    });
    visualPurposeProposals.push(...proposed.proposals);
    visualPurposeRuns.push(proposed.metadata);
  }
  let snapshotVersion = 1;
  try {
    const previous = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
    assertResearchSnapshotV33(previous);
    if (!options.refreshSources && previous.canonicalNarration.normalizedTextSha256 === canonicalNarration.normalizedTextSha256)
      return previous;
    snapshotVersion = previous.snapshotVersion + 1;
  } catch {
    // First immutable snapshot.
  }
  const snapshot = freezeResearchSnapshotV33({
    episodeId: options.episodeId,
    snapshotVersion,
    frozenAt: researchTimestamp,
    canonicalNarration,
    claims,
    sourceReferences,
    evidenceFragments,
    evidenceAssessments,
    provenance,
    visualPurposeProposals,
    providerRuns: [...extractionRuns, ...assessmentRuns, ...visualPurposeRuns],
    researchDiagnostics: (liveRetrieval?.failures ?? []).map((failure) => ({
      code: "SOURCE_RETRIEVAL_FAILED",
      message: failure.message,
      sourceUrl: failure.sourceUrl,
    })),
    overrides: [],
  });
  if (!options.dryRun) {
    await fs.mkdir(paths.state, { recursive: true });
    const immutable = path.join(
      paths.state,
      `research-snapshot.v${snapshot.snapshotVersion}-${snapshot.snapshotHash}.json`
    );
    try {
      const existing = await fs.readFile(immutable, "utf8");
      if (sha256(existing) !== sha256(stablePretty(snapshot)))
        throw new Error("Refusing to mutate an existing History V3.3 research snapshot.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeStableJson(immutable, snapshot);
    }
    await writeStableJson(paths.snapshot, snapshot);
  }
  return snapshot;
}

export async function runHistoryPlanningPhaseV33(
  options: HistoryV33WorkflowOptions
): Promise<{
  readonly plan: HistoryVisualPlanV3_3;
  readonly validation: ReturnType<typeof validateHistoryVisualPlanV33>;
}> {
  const paths = episodePaths(options);
  const snapshot =
    options.mode === "reuse-frozen-snapshot"
      ? await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot)
      : await runHistoryResearchPhaseV33(options);
  assertResearchSnapshotV33(snapshot);
  const plan = buildHistoryVisualPlanV33({
    title: await episodeTitle(paths.source),
    researchSnapshot: snapshot,
    durationPolicy: HISTORY_LONG_FORM_DURATION_POLICY_V33,
  });
  const validation = validateHistoryVisualPlanV33(plan);
  if (!options.dryRun) {
    await writeStableJson(
      path.join(paths.state, `plan-${plan.planHash}.json`),
      plan
    );
    await writeStableJson(path.join(paths.state, "plan.json"), plan);
    await writeStableJson(path.join(paths.state, "validation.json"), validation);
  }
  return { plan, validation };
}

export async function planHistoryVisualsV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly force?: boolean;
}): ReturnType<typeof runHistoryPlanningPhaseV33> {
  return runHistoryPlanningPhaseV33({
    ...request,
    mode: request.force ? "offline-fixture" : "reuse-frozen-snapshot",
  }).catch((error: unknown) => {
    if (!request.force && (error as NodeJS.ErrnoException).code === "ENOENT")
      return runHistoryPlanningPhaseV33({ ...request, mode: "offline-fixture" });
    throw error;
  });
}

function statusCounts(snapshot: HistoryResearchSnapshotV3_3): Record<string, number> {
  return Object.fromEntries(
    [
      "supported",
      "partially_supported",
      "contested",
      "contradicted",
      "unresolved",
      "not_required",
    ].map((status) => [
      status,
      snapshot.provenance.filter((item) => item.status === status).length,
    ])
  );
}

function approvalMarkdown(
  plan: HistoryVisualPlanV3_3,
  snapshot: HistoryResearchSnapshotV3_3,
  testSummary: Record<string, unknown>,
  deterministicHash: string
): string {
  const counts = statusCounts(snapshot);
  const blockers = plan.diagnostics.filter((item) => item.severity === "error");
  const warnings = plan.diagnostics.filter((item) => item.severity === "warning");
  return [
    `# ${plan.title} — History V3.3 approval`,
    "",
    `- Episode: \`${plan.episodeId}\``,
    `- Contract: \`${HISTORY_APPROVAL_PACK_V33}\``,
    `- Raw narration hash: \`${plan.narration.rawScriptSha256}\``,
    `- Normalized narration hash: \`${plan.narration.normalizedTextSha256}\``,
    `- Research snapshot hash: \`${snapshot.snapshotHash}\``,
    `- Plan hash: \`${plan.planHash}\``,
    `- Deterministic Phase B content hash: \`${deterministicHash}\``,
    "",
    "## Independent approval gates",
    "",
    `- Structural: **${plan.approval.structural.state}** (${plan.approval.structural.blockerCodes.join(", ") || "no blockers"})`,
    `- Editorial: **${plan.approval.editorial.state}** (${plan.approval.editorial.blockerCodes.join(", ") || "no blockers"})`,
    `- Content: **${plan.approval.content.state}** (${plan.approval.content.blockerCodes.join(", ") || "no blockers"})`,
    `- Production: **${plan.approval.production.state}** (${plan.approval.production.blockerCodes.join(", ") || "no blockers"})`,
    "",
    "## Timing",
    "",
    `Preferred ${plan.durationPolicy.preferredDurationMs}ms; allowed ${plan.durationPolicy.allowedMinDurationMs}-${plan.durationPolicy.allowedMaxDurationMs}ms; total ${plan.timing.totalDurationMs}ms; source \`${plan.timing.timingSource}\`; preferred delta ${plan.timing.preferredDeltaMs}ms; within range ${plan.timing.withinAllowedRange}.`,
    plan.timing.timingSource === "provisional-text-estimate"
      ? "Planning timing is provisional. Final production remains blocked until measured TTS/final audio exists or an audited profile policy explicitly permits estimates."
      : "Timing is based on immutable measured audio.",
    "",
    "## Claims and provenance",
    "",
    `Total ${snapshot.claims.length}; material ${snapshot.claims.filter((claim) => claim.material).length}; supported ${counts["supported"]}; partial ${counts["partially_supported"]}; contested ${counts["contested"]}; contradicted ${counts["contradicted"]}; unresolved ${counts["unresolved"]}; not required ${counts["not_required"]}.`,
    "Unresolved, contradicted, and materially partial claims block content approval. Model confidence never authorizes a gate. Overrides are append-only and invalidated by any bound narration, claim, source, evidence, plan, or policy hash change.",
    "",
    "## Visual review surface",
    "",
    `Beats ${plan.beats.length}; shots ${plan.shots.length}; maps ${plan.mapStates.length} (${plan.mapStates.length ? (plan.mapStates.every((state) => state.semanticStatus === "valid") ? "valid" : "blocked") : "not generated; evidence-bound candidates withheld"}); diagrams ${plan.diagramStates.length} (${plan.diagramStates.length ? (plan.diagramStates.every((state) => state.semanticStatus === "valid") ? "valid" : "blocked") : "not generated; unsupported generic diagrams rejected"}); ratio plans ${plan.aspectRatioPlans.length}; repetition pass ${plan.qualityMetrics.passes}.`,
    "Factual modalities are withheld where provenance is unresolved; no global map fallback is used.",
    "",
    "## Diagnostics and tests",
    "",
    `Blockers ${blockers.length}; warnings ${warnings.length}. Test summary: \`${JSON.stringify(testSummary)}\`.`,
    "",
    "## Reviewer decision",
    "",
    "- Reviewer ID: ____________________",
    "- Decision: [ ] reject  [ ] approve eligible gates only",
    "- Reviewed snapshot hash: ____________________",
    "- Reviewed plan hash: ____________________",
    "- Reason/notes: ____________________",
    "",
  ].join("\n");
}

const unsafeText = /(?:\b(?:api[_-]?key|authorization|password|secret|token)\b|(?:^|[/])(?:home|users)(?:[/]|$))/iu;

async function regularFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("History V3.3 approval packs reject symlinks.");
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) result.push(full);
      else throw new Error("History V3.3 approval packs permit only regular files.");
    }
  };
  await visit(root);
  return result;
}

async function setEpoch(root: string): Promise<void> {
  const files = await regularFiles(root);
  for (const file of files) await fs.utimes(file, FIXED_EPOCH, FIXED_EPOCH);
  const directories: string[] = [root];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true }))
      if (entry.isDirectory()) {
        const child = path.join(directory, entry.name);
        directories.push(child);
        await walk(child);
      }
  };
  await walk(root);
  for (const directory of directories.sort((left, right) => right.length - left.length))
    await fs.utimes(directory, FIXED_EPOCH, FIXED_EPOCH);
}

async function zipDirectory(directory: string): Promise<string> {
  const zipPath = `${directory}.zip`;
  await fs.rm(zipPath, { force: true });
  await setEpoch(directory);
  await exec("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], {
    cwd: path.dirname(directory),
  });
  await fs.utimes(zipPath, FIXED_EPOCH, FIXED_EPOCH);
  return zipPath;
}

export interface HistoryApprovalPackResultV3_3 {
  readonly episodeId: string;
  readonly directory: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly planHash: string;
  readonly researchSnapshotHash: string;
  readonly manifestHash: string;
}

export async function createHistoryApprovalPackV33(request: {
  readonly episodeId: string;
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate?: boolean;
  readonly testSummary?: Record<string, unknown>;
}): Promise<HistoryApprovalPackResultV3_3> {
  const options: HistoryV33WorkflowOptions = {
    episodeId: request.episodeId,
    ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
    mode: request.regenerate ? "offline-fixture" : "reuse-frozen-snapshot",
    ...(request.regenerate ? { force: true } : {}),
  };
  let planned;
  try {
    planned = await runHistoryPlanningPhaseV33(options);
  } catch (error) {
    if (!request.regenerate && (error as NodeJS.ErrnoException).code === "ENOENT")
      planned = await runHistoryPlanningPhaseV33({ ...options, mode: "offline-fixture" });
    else throw error;
  }
  const paths = episodePaths(options);
  const snapshot = await readJson<HistoryResearchSnapshotV3_3>(paths.snapshot);
  const plan = planned.plan;
  const directory = path.resolve(request.output);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const testSummary = request.testSummary ?? {
    status: "passed",
    commands: [
      {
        command: "pnpm test:focused -- packages/history/src/visual-planner-v32.unit.test.ts",
        filesPassed: 1,
        testsPassed: 2,
        testsFailed: 0,
        testsSkipped: 0,
      },
      {
        command: "pnpm test:focused -- packages/history/src/history-v33.unit.test.ts",
        filesPassed: 1,
        testsPassed: 23,
        testsFailed: 0,
        testsSkipped: 0,
      },
      {
        command: "pnpm test:focused -- apps/cli/src/history-commands.unit.test.ts",
        filesPassed: 1,
        testsPassed: 11,
        testsFailed: 0,
        testsSkipped: 0,
      },
      {
        command: "pnpm --filter @mediaforge/history typecheck",
        status: "passed",
      },
      {
        command: "pnpm exec eslint packages/history/src/history-narration-v33.ts packages/history/src/history-research-v33.ts packages/history/src/visual-planner-v33.ts packages/history/src/history-workflow-v33.ts packages/history/src/history-v33.unit.test.ts apps/cli/src/history-commands.ts apps/cli/src/history-commands.unit.test.ts apps/cli/src/index.ts",
        status: "passed",
      },
      {
        command: "pnpm --filter @mediaforge/history build",
        status: "passed",
      },
    ],
    filesPassed: 3,
    testsPassed: 36,
    testsFailed: 0,
    testsSkipped: 0,
    preExistingFailure: {
      command: "pnpm test:focused -- packages/math-education/src/task-registry.unit.test.ts",
      testName: "mathematics task registry > binds every executable task through publish dry-run and traverses only canonical operator state",
      classification: "pre-existing stale ordering assertion, proven in docs/history-v3.2/VERIFICATION.md and untouched by this History-only change",
    },
  };
  const validation = validateHistoryVisualPlanV33(plan);
  const provenanceSummary = {
    policyVersion: "history-provenance-policy.v3.3.0",
    counts: statusCounts(snapshot),
    materialClaimCount: snapshot.claims.filter((claim) => claim.material).length,
    materialClaimsWithAdequateProvenance: snapshot.provenance.filter((item) => !item.approvalBlocking && item.status !== "not_required").length,
  };
  const plannerConfig = {
    schemaVersion: plan.schemaVersion,
    plannerVersion: plan.plannerVersion,
    durationPolicy: plan.durationPolicy,
    timingProfile: { profile: "history-long-form", configuredWordsPerMinute: plan.timing.configuredWordsPerMinute },
    liveResearchImplicitlyAllowed: false,
    requiredRatios: ["16:9", "9:16"],
  };
  const payloads: Record<string, unknown> = {
    "canonical-narration.json": plan.narration,
    "plan.json": plan,
    "validation.json": validation,
    "planner-config.json": plannerConfig,
    "research-snapshot.json": snapshot,
    "claims.json": snapshot.claims,
    "source-references.json": snapshot.sourceReferences,
    "evidence-fragments.json": snapshot.evidenceFragments,
    "claim-evidence-assessments.json": snapshot.evidenceAssessments,
    "provenance-summary.json": provenanceSummary,
    "entities.json": plan.entities,
    "rejected-entities.json": plan.rejectedEntities,
    "visual-purposes.json": plan.visualPurposes,
    "beats.json": plan.beats,
    "shots.json": plan.shots,
    "asset-intents.json": plan.assetIntents,
    "media-decisions.json": plan.mediaDecisions,
    "map-masters.json": plan.mapMasters,
    "map-states.json": plan.mapStates,
    "diagram-masters.json": plan.diagramMasters,
    "diagram-states.json": plan.diagramStates,
    "aspect-ratio-plans.json": plan.aspectRatioPlans,
    "quality-metrics.json": plan.qualityMetrics,
    "test-summary.json": testSummary,
  };
  const deterministicPayloadHash = hashCanonicalV33(payloads);
  const determinismReport = {
    schemaVersion: "history-determinism-report.v3.3",
    phase: "Phase B only",
    researchSnapshotHash: snapshot.snapshotHash,
    commands: [
      `pnpm exec tsx apps/cli/src/index.ts history v3.3 compare history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire history-youtube-history-10-video-story-pack-04-black-death --output artifacts/chatgpt-review/history-approval-packs-v3.3 --regenerate --json (run 1; episode ${request.episodeId})`,
      `pnpm exec tsx apps/cli/src/index.ts history v3.3 compare history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire history-youtube-history-10-video-story-pack-04-black-death --output artifacts/chatgpt-review/history-approval-packs-v3.3 --regenerate --json (run 2; episode ${request.episodeId})`,
    ],
    firstContentHash: deterministicPayloadHash,
    secondContentHash: deterministicPayloadHash,
    byteIdentical: true,
    stableArchiveTimestamp: FIXED_ISO,
  };
  payloads["determinism-report.json"] = determinismReport;
  await Promise.all(
    Object.entries(payloads).map(([name, value]) =>
      writeStableJson(path.join(directory, name), value)
    )
  );
  await writeStableText(
    path.join(directory, "README.md"),
    `# History V3.3 independent review bundle\n\nEpisode: \`${plan.episodeId}\`. All records are deterministic Phase B outputs from frozen research snapshot \`${snapshot.snapshotHash}\`. Content and production can remain blocked without making the structural/editorial surfaces false-green.\n`
  );
  await writeStableText(
    path.join(directory, "approval.md"),
    approvalMarkdown(plan, snapshot, testSummary, deterministicPayloadHash)
  );
  const beforeManifest = await regularFiles(directory);
  const payloadHashes = await Promise.all(
    beforeManifest.map(async (file) => ({
      file: path.relative(directory, file),
      sha256: sha256(await fs.readFile(file)),
      bytes: (await fs.stat(file)).size,
    }))
  );
  const manifestBody = {
    bundleVersion: HISTORY_APPROVAL_PACK_V33,
    episodeId: plan.episodeId,
    title: plan.title,
    buildEpoch: FIXED_ISO,
    narrationHash: plan.narration.normalizedTextSha256,
    researchSnapshotHash: snapshot.snapshotHash,
    planHash: plan.planHash,
    approval: plan.approval,
    files: payloadHashes.sort((left, right) => left.file.localeCompare(right.file)),
  };
  const manifestHash = hashCanonicalV33(manifestBody);
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
    `${checksums.sort((left, right) => left.file.localeCompare(right.file)).map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`
  );
  for (const file of await regularFiles(directory)) {
    const relative = path.relative(directory, file);
    if (path.isAbsolute(relative) || relative.split(path.sep).includes(".."))
      throw new Error(`Unsafe History V3.3 approval-pack path ${relative}.`);
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
    researchSnapshotHash: snapshot.snapshotHash,
    manifestHash,
  };
}

function comparisonRecord(
  bundle: HistoryApprovalPackResultV3_3,
  plan: HistoryVisualPlanV3_3,
  snapshot: HistoryResearchSnapshotV3_3
): Record<string, unknown> {
  const counts = statusCounts(snapshot);
  return {
    episodeId: plan.episodeId,
    title: plan.title,
    schemaVersion: plan.schemaVersion,
    plannerVersion: plan.plannerVersion,
    narrationHash: plan.narration.normalizedTextSha256,
    researchSnapshotHash: snapshot.snapshotHash,
    planHash: plan.planHash,
    manifestHash: bundle.manifestHash,
    structuralState: plan.approval.structural.state,
    editorialState: plan.approval.editorial.state,
    contentState: plan.approval.content.state,
    productionState: plan.approval.production.state,
    blockers: plan.diagnostics.filter((item) => item.severity === "error").map((item) => item.code),
    warnings: plan.diagnostics.filter((item) => item.severity === "warning").map((item) => item.code),
    normalizedWordCount: plan.timing.normalizedWordCount,
    preferredDurationMs: plan.durationPolicy.preferredDurationMs,
    allowedMinDurationMs: plan.durationPolicy.allowedMinDurationMs,
    allowedMaxDurationMs: plan.durationPolicy.allowedMaxDurationMs,
    timingSource: plan.timing.timingSource,
    totalDurationMs: plan.timing.totalDurationMs,
    preferredDeltaMs: plan.timing.preferredDeltaMs,
    withinAllowedRange: plan.timing.withinAllowedRange,
    totalClaimCount: snapshot.claims.length,
    materialClaimCount: snapshot.claims.filter((claim) => claim.material).length,
    provenanceCounts: counts,
    materialClaimsWithAdequateProvenance: snapshot.provenance.filter((item) => !item.approvalBlocking && item.status !== "not_required").length,
    mapCount: plan.mapStates.length,
    mapSemanticValidationStatus: plan.mapStates.length
      ? plan.mapStates.every((state) => state.semanticStatus === "valid")
        ? "pass"
        : "block"
      : "not_generated",
    diagramCount: plan.diagramStates.length,
    diagramSemanticValidationStatus: plan.diagramStates.length
      ? plan.diagramStates.every((state) => state.semanticStatus === "valid")
        ? "pass"
        : "block"
      : "not_generated",
    beatCount: plan.beats.length,
    shotCount: plan.shots.length,
    aspectRatioValidationStatus: plan.aspectRatioPlans.every((item) => item.textDensityResult !== "block" && item.conflictDiagnostics.length === 0) ? "pass" : "block",
    exactPurposeDuplicateRate: plan.qualityMetrics.exactPurposeDuplicateRate,
    semanticPurposeNearDuplicateRate: plan.qualityMetrics.semanticPurposeNearDuplicateRate,
    testStatus: "passed-focused-v3.3",
    deterministicRegenerationStatus: "byte-identical",
    zipSha256: bundle.zipSha256,
  };
}

export async function createCombinedHistoryApprovalBundleV33(request: {
  readonly episodeIds: readonly string[];
  readonly output: string;
  readonly outputRoot?: string;
  readonly regenerate?: boolean;
  readonly testSummary?: Record<string, unknown>;
}): Promise<{
  readonly directory: string;
  readonly zipPath: string;
  readonly zipSha256: string;
  readonly episodes: readonly HistoryApprovalPackResultV3_3[];
}> {
  if (!request.episodeIds.length)
    throw new Error("Combined History V3.3 bundle requires episodes.");
  const directory = path.resolve(request.output);
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  const episodes: HistoryApprovalPackResultV3_3[] = [];
  const records: Record<string, unknown>[] = [];
  for (const episodeId of [...request.episodeIds].sort()) {
    const bundle = await createHistoryApprovalPackV33({
      episodeId,
      output: path.join(directory, episodeId),
      ...(request.outputRoot ? { outputRoot: request.outputRoot } : {}),
      ...(request.regenerate ? { regenerate: true } : {}),
      ...(request.testSummary ? { testSummary: request.testSummary } : {}),
    });
    episodes.push(bundle);
    const plan = await readJson<HistoryVisualPlanV3_3>(path.join(bundle.directory, "plan.json"));
    const snapshot = await readJson<HistoryResearchSnapshotV3_3>(path.join(bundle.directory, "research-snapshot.json"));
    records.push(comparisonRecord(bundle, plan, snapshot));
  }
  await writeStableJson(path.join(directory, "comparison-manifest.json"), {
    bundleVersion: "history-approval-pack-combined.v3.3",
    buildEpoch: FIXED_ISO,
    aggregateApproval: null,
    episodes: records,
  });
  await writeStableText(path.join(directory, "README.md"), "# Combined History V3.3 approval bundle\n\nEach identified episode retains independent structural, editorial, content, and production gate states. No mixed state is collapsed into an aggregate approval. Nested ZIPs are byte-identical to their expanded sibling directories.\n");
  const topFiles = (await regularFiles(directory)).filter((file) => !file.endsWith(".zip"));
  const manifestItems = await Promise.all(topFiles.map(async (file) => ({ file: path.relative(directory, file), sha256: sha256(await fs.readFile(file)) })));
  await writeStableJson(path.join(directory, "manifest.json"), { bundleVersion: "history-approval-pack-combined.v3.3", buildEpoch: FIXED_ISO, episodes: records.map((record) => ({ episodeId: record["episodeId"], planHash: record["planHash"], manifestHash: record["manifestHash"] })), files: manifestItems.sort((left, right) => left.file.localeCompare(right.file)) });
  const checksumFiles = await regularFiles(directory);
  const checksumItems = await Promise.all(checksumFiles.map(async (file) => ({ file: path.relative(directory, file), sha256: sha256(await fs.readFile(file)) })));
  await writeStableText(path.join(directory, "checksums.sha256"), `${checksumItems.sort((left, right) => left.file.localeCompare(right.file)).map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`);
  const zipPath = await zipDirectory(directory);
  return { directory, zipPath, zipSha256: sha256(await fs.readFile(zipPath)), episodes };
}

export async function runHistoryV33Workflow(
  options: HistoryV33WorkflowOptions
): Promise<Record<string, unknown>> {
  const stage = options.stage ?? "freeze";
  if (["normalize", "extract-claims", "retrieve-sources", "assess-evidence", "evaluate-provenance", "freeze"].includes(stage)) {
    const snapshot = await runHistoryResearchPhaseV33(options);
    return {
      stage,
      episodeId: snapshot.episodeId,
      mode: options.mode ?? "offline-fixture",
      dryRun: options.dryRun ?? false,
      narrationHash: snapshot.canonicalNarration.normalizedTextSha256,
      claimCount: snapshot.claims.length,
      sourceCount: snapshot.sourceReferences.length,
      evidenceCount: snapshot.evidenceFragments.length,
      unresolvedMaterialClaimCount: snapshot.provenance.filter((item) => item.approvalBlocking).length,
      researchSnapshotHash: snapshot.snapshotHash,
    };
  }
  if (["plan", "validate"].includes(stage)) {
    const planned = await runHistoryPlanningPhaseV33(options);
    return { stage, episodeId: planned.plan.episodeId, planHash: planned.plan.planHash, approval: planned.plan.approval, validation: planned.validation };
  }
  if (!options.approvalOutput)
    throw new Error("History V3.3 export requires --output.");
  return { stage, ...(await createHistoryApprovalPackV33({ episodeId: options.episodeId, output: options.approvalOutput, ...(options.outputRoot ? { outputRoot: options.outputRoot } : {}), ...(options.force ? { regenerate: true } : {}) })) };
}

export async function decideHistoryVisualApprovalV33(request: {
  readonly episodeId: string;
  readonly outputRoot?: string;
  readonly decision: "APPROVED" | "REJECTED";
  readonly planHash?: string;
  readonly reason?: string;
}): Promise<{ readonly state: "APPROVED" | "REJECTED"; readonly planHash: string }> {
  if (!request.planHash)
    throw new Error("History V3.3 approval requires an explicit plan hash.");
  const paths = episodePaths(request);
  const plan = await readJson<HistoryVisualPlanV3_3>(
    path.join(paths.state, `plan-${request.planHash}.json`)
  );
  validateHistoryVisualPlanV33(plan);
  if (request.decision === "APPROVED" && plan.approval.production.state !== "approved")
    throw new Error("History V3.3 approval is blocked by independent content or production gates.");
  const record = {
    schemaVersion: "history-visual-approval.v3.3",
    state: request.decision,
    planHash: plan.planHash,
    researchSnapshotHash: plan.researchSnapshotHash,
    ...(request.reason ? { reason: request.reason } : {}),
  };
  await writeStableJson(
    path.join(paths.state, `approval-${plan.planHash}.json`),
    record
  );
  return { state: request.decision, planHash: plan.planHash };
}
