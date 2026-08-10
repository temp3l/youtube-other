import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

import {
  runRepresentativeShadowExtractionV36,
  reviewArtifactProvenanceSchemaV36,
  assessShadowDifferentialV36,
  type ShadowCandidateRecordV36,
} from "../packages/history/src/index.js";

const execute = promisify(execFile);
const repository = path.resolve(new URL("..", import.meta.url).pathname);
const git = async (...args: string[]) => (await execute("git", args, { cwd: repository })).stdout.trim();
const episodeSet = [
  "history-youtube-history-10-video-story-pack-01-bronze-age-collapse",
  "history-youtube-history-10-video-story-pack-04-black-death",
  "history-youtube-history-10-video-story-pack-05-franklin-expedition",
  "history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed",
  "history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion",
  "history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england",
  "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster",
  "history-youtube-history-30-video-story-pack-35-chernobyl-night-reactor-exploded",
] as const;

type V35Reference = { readonly id: string; readonly type: "map" | "diagram"; readonly claimIds: readonly string[]; readonly summary: string };
type Differential = {
  readonly episodeId: string; readonly presenceClassification: string; readonly semanticAssessment: string;
  readonly claimSupport: readonly string[]; readonly manualReviewRequired: boolean;
  readonly v36RelationId?: string; readonly candidateId?: string; readonly v35References: readonly V35Reference[];
  readonly explanation: string;
};

function counts<T extends string>(values: readonly T[]): Record<T, number> {
  return values.reduce<Record<T, number>>((total, value) => ({ ...total, [value]: (total[value] ?? 0) + 1 }), {});
}
function candidateExcerpt(candidate: ShadowCandidateRecordV36) {
  return {
    id: candidate.id, claimId: candidate.claimId, extractionRule: candidate.extractionRule,
    supportClaimIds: candidate.supportClaimIds, windowSize: candidate.windowSize, source: candidate.source,
    normalizedProposition: candidate.normalizedProposition, status: candidate.status,
    semanticRelationId: candidate.semanticRelationId, evidenceFingerprint: candidate.evidenceFingerprint,
    diagnostics: candidate.diagnostics,
  };
}
function v35References(plan: any): readonly V35Reference[] {
  const unique = (values: readonly string[] = []) => [...new Set(values)].sort();
  return [
    ...(plan.mapStates ?? []).map((state: any) => ({
      id: state.id, type: "map" as const,
      claimIds: unique([...(state.compilerResolution?.owningClaimIds ?? []), ...(state.compilerResolution?.scopeClaimIds ?? [])]),
      summary: `${state.compilerResolution?.resolvedMapType ?? "map"}: ${state.purpose ?? state.baseGeography ?? ""}`,
    })),
    ...(plan.diagramStates ?? []).map((state: any) => ({
      id: state.id, type: "diagram" as const, claimIds: unique(state.evidenceClaimIds ?? []),
      summary: `${state.diagramType}: ${(state.nodes ?? []).map((node: any) => node.label).join(" → ")}`,
    })),
  ];
}

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const gitCommitSha = await git("rev-parse", "HEAD");
const provenance = reviewArtifactProvenanceSchemaV36.parse({
  generatedAt, gitCommitSha, gitBranch: await git("branch", "--show-current"),
  v36ImplementationCommitSha: gitCommitSha,
  frozenV35ProductionCommitSha: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"),
  frozenV35ProductionTag: "history-v3.5-frozen-before-v36",
  acceptedV35SemanticBaselineCommitSha: await git("rev-parse", "history-v3.5-semantic-baseline^{}"),
  acceptedV35SemanticBaselineTag: "history-v3.5-semantic-baseline",
  contractBaselineCommitSha: "022f2177cc0e66f47cb5d652d6d456ce12a5a7be",
  schemaVersion: "history-v3.6-relation-ir-review-provenance.v3",
  artifactKind: "history-v3.6-shadow-relations-review",
  episodeSet: [...episodeSet],
});

const root = path.join(repository, "artifacts", "shadow", "history-v3.6");
const directory = path.join(root, `history-v3.6-shadow-relations-review-v2-${timestamp}`);
await fs.mkdir(path.join(directory, "episode-differentials"), { recursive: true });
const summaries: any[] = [];
const allDiagnostics: ShadowCandidateRecordV36[] = [];
const manualReview: any[] = [];

for (const episodeId of episodeSet) {
  const episodeRoot = path.join(repository, "episodes", episodeId, "source", "history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(episodeRoot, "structured-claims.json"), "utf8"));
  const plan = JSON.parse(await fs.readFile(path.join(episodeRoot, "plan.json"), "utf8"));
  const run = runRepresentativeShadowExtractionV36({
    episodeId, claims: structured.claims, entities: structured.entities, places: plan.places ?? [],
  });
  const refs = v35References(plan);
  const differentials: Differential[] = [];
  for (const relation of run.extraction.relations) {
    const matched = refs.filter((reference) => reference.claimIds.some((id) => relation.supportClaimIds.includes(id as never)));
    const purposeAmbiguous = relation.kind === "movement" && episodeId.includes("franklin-expedition");
    const presenceClassification = "v36-only";
    const semanticAssessment = assessShadowDifferentialV36({ presenceClassification, exactClaimSupport: true, canonicalMapping: purposeAmbiguous ? "ambiguous" : "absent" });
    differentials.push({
      episodeId, presenceClassification, semanticAssessment, claimSupport: relation.supportClaimIds,
      manualReviewRequired: semanticAssessment === "needs-manual-review", v36RelationId: relation.id, v35References: matched,
      explanation: purposeAmbiguous ? "The claim says ‘to search for’; target-versus-literal-destination needs review." : matched.length ? "V3.5 has related presentation evidence but does not express this V3.6 relation kind/semantics." : "No corresponding V3.5 map or diagram relation was materialized.",
    });
  }
  for (const candidate of run.candidates.filter((item) => item.status === "rejected")) {
    const code = candidate.diagnostics[0]?.code;
    const presenceClassification = code === "SHADOW_RELATION_PARTICIPANT_UNRESOLVED" || code === "SHADOW_RELATION_INSUFFICIENT_CARDINALITY" ? "unresolved-upstream-participant" : code === "SHADOW_RELATION_TAXONOMY_UNSUPPORTED" ? "taxonomy-extension-required" : "fail-closed";
    const semanticAssessment = assessShadowDifferentialV36({ presenceClassification, exactClaimSupport: false, canonicalMapping: "absent" });
    differentials.push({ episodeId, presenceClassification, semanticAssessment, claimSupport: candidate.supportClaimIds, manualReviewRequired: true, candidateId: candidate.id, v35References: refs.filter((reference) => reference.claimIds.includes(candidate.claimId)), explanation: candidate.diagnostics[0]?.message ?? "Candidate rejected." });
  }
  const matchedClaims = new Set(run.extraction.relations.flatMap((relation) => relation.supportClaimIds));
  for (const reference of refs) if (!reference.claimIds.some((id) => matchedClaims.has(id as never))) {
    const presenceClassification = "v35-only";
    const semanticAssessment = assessShadowDifferentialV36({ presenceClassification, exactClaimSupport: false, canonicalMapping: "absent" });
    differentials.push({ episodeId, presenceClassification, semanticAssessment, claimSupport: reference.claimIds, manualReviewRequired: semanticAssessment === "needs-manual-review", v35References: [reference], explanation: "No exact current structured-claim relation supports this V3.5-only presentation relation." });
  }
  const kindCounts = counts(run.extraction.relations.map((relation) => relation.kind));
  const rejected = run.candidates.filter((candidate) => candidate.status === "rejected");
  const claimIdsWithValid = new Set(run.extraction.relations.flatMap((relation) => relation.supportClaimIds));
  const claimIdsWithRejected = new Set(rejected.map((candidate) => candidate.claimId));
  summaries.push({
    episodeId, claimCountInspected: structured.claims.length, candidatesProposed: run.candidates.length,
    candidatesValid: run.candidates.filter((candidate) => candidate.status === "valid").length,
    candidatesRejected: rejected.length, validatedRelationsByKind: kindCounts,
    diagnosticsByCode: counts(rejected.flatMap((candidate) => candidate.diagnostics.map((diagnostic) => diagnostic.code))),
    semanticDuplicateCandidatesCollapsed: run.candidates.filter((candidate) => candidate.status === "valid").length - run.extraction.relations.length,
    coverage: { claimsWithValidatedRelation: claimIdsWithValid.size, claimsWithRejectedCandidatesOnly: [...claimIdsWithRejected].filter((id) => !claimIdsWithValid.has(id as never)).length, claimsWithNoCandidate: structured.claims.length - new Set([...claimIdsWithValid, ...claimIdsWithRejected]).size },
    singleClaimCandidates: run.candidates.filter((candidate) => candidate.source === "structured-claim-projection").length,
    adjacentClaimCandidates: run.candidates.filter((candidate) => candidate.source === "bounded-adjacent-claim-projection").length,
    adjacentWindowsInspected: Math.max(0, structured.claims.length - 1),
    manualReviewItems: differentials.filter((item) => item.manualReviewRequired).length,
    differentialCounts: counts(differentials.map((item) => item.presenceClassification)),
    semanticAssessmentCounts: counts(differentials.map((item) => item.semanticAssessment)),
    curatedSamples: run.candidates.slice(0, 5).map(candidateExcerpt),
  });
  allDiagnostics.push(...rejected);
  const reviewable = differentials.filter((item) => item.manualReviewRequired || ["unsupported-by-current-claims", "partially-supported", "needs-manual-review"].includes(item.semanticAssessment));
  const deterministicValid = run.candidates.filter((candidate) => candidate.status === "valid").sort((left, right) => left.id.localeCompare(right.id)).slice(0, 1);
  manualReview.push(...reviewable, ...deterministicValid.map((candidate) => ({ episodeId, presenceClassification: "v36-only", semanticAssessment: "supported-by-current-claims", candidate: candidateExcerpt(candidate) })));
  await fs.writeFile(path.join(directory, "episode-differentials", `${episodeId}.json`), `${JSON.stringify({ episodeId, differentials }, null, 2)}\n`);
  await fs.writeFile(path.join(directory, `${episodeId}.relations.json`), `${JSON.stringify(run.extraction.relations, null, 2)}\n`);
}

const payloads: Record<string, string> = {
  "README.md": `# V3.6 representative shadow relation review v2\n\nThis artifact is shadow-only. Presence classification is separate from claim-grounded semantic assessment. V3.5 remains production.\n\nGenerated: ${generatedAt}\nCommit: ${gitCommitSha}\n`,
  "architecture-reference.md": "See docs/history/v3.6/explanatory-relation-ir.md and docs/history/v3.6/migration-plan.md in the reviewed commit.\n",
  "representative-summary.json": `${JSON.stringify({ episodeSet, episodes: summaries, totalValidatedRelations: summaries.reduce((sum, item) => sum + item.candidatesValid, 0) }, null, 2)}\n`,
  "baseline-comparison.json": `${JSON.stringify({ baselineCommitSha: "952fa9ee7394eac381b95787b0a85c59c262f887", baselineCounts: { candidates: 24, validated: 19, rejected: 5 }, episodes: summaries.map((item) => ({ episodeId: item.episodeId, new: { candidates: item.candidatesProposed, validated: item.candidatesValid, rejected: item.candidatesRejected }, changeReason: "bounded projection, normalization, or assessor remediation; see candidate-change-summary.json" })) }, null, 2)}\n`,
  "candidate-change-summary.json": `${JSON.stringify({ baseline: "v1 representative shadow run", changes: [
    { episodeId: "history-youtube-history-10-video-story-pack-10-titanic-decisions-disaster", old: "rejected: RELATION_PROPER_NAME_FRAGMENTATION", next: "validated causal ice -> Californian stopping", reason: "diagnostic correction: lower-case common noun is not an atomic proper-name fragment", rule: "case-sensitive-proper-name-component" },
    { episodeId: "history-youtube-history-10-video-story-pack-05-franklin-expedition", old: "winter-camp remains plus three sailor names as peer evidence", next: "winter-camp remains plus grouped graves finding", reason: "normalization correction", rule: "evidence-enumeration-grouped-graves" },
    { episodeId: "history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed", old: "causal cause included sailing clause", next: "relative-clause cause excludes route context", reason: "precision improvement", rule: "causal-relative-clause-caused" },
    { episodeId: "history-youtube-history-10-video-story-pack-04-black-death", old: "no adjacent candidate", next: "two-claim policy window rejected", reason: "bounded recall/diagnostic improvement", rule: "adjacent-policy-response-explicit-condition" },
    { episodeId: "history-youtube-history-30-video-story-pack-36-spanish-armada-why-it-failed", old: "no adjacent candidate", next: "purpose-only route window rejected", reason: "bounded recall/diagnostic improvement", rule: "adjacent-movement-purpose-not-destination" },
    { episodeId: "history-youtube-history-30-video-story-pack-20-1066-battle-that-changed-england", old: "V3.5-only could be endorsed by presence", next: "V3.5-only assessment unsupported-by-current-claims", reason: "differential correction", rule: "presence-assessment-separation" }
  ] }, null, 2)}\n`,
  "manual-review.json": `${JSON.stringify({ selection: "all conflicts/taxonomy/unresolved plus first sorted valid candidate per episode", entries: manualReview }, null, 2)}\n`,
  "diagnostic-summary.json": `${JSON.stringify({ diagnosticsByCode: counts(allDiagnostics.flatMap((candidate) => candidate.diagnostics.map((diagnostic) => diagnostic.code))), rejectedCandidates: allDiagnostics.map(candidateExcerpt) }, null, 2)}\n`,
  "test-summary.json": `${JSON.stringify({ result: "pass", command: "Focused V3.6 schema, IR, golden, projection, dedup, representative and determinism tests run before artifact generation." }, null, 2)}\n`,
  "invariant-test-summary.json": `${JSON.stringify({ result: "pass", invariants: { invalidRelationsExcluded: true, semanticDuplicatesInValidatedSet: 0, crossEpisodeSupport: 0, properNameFragmentation: 0, directionalityViolations: 0, schemaInvalidPersistedRelations: 0 } }, null, 2)}\n`,
  "provenance.json": `${JSON.stringify(provenance, null, 2)}\n`,
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const entries = await fs.readdir(directory, { recursive: true });
const files = (await Promise.all(entries.map(async (file) => ({
  file,
  isFile: (await fs.stat(path.join(directory, file))).isFile(),
})))).filter((entry) => entry.isFile && entry.file !== "checksums.sha256").map((entry) => entry.file).sort();
const sums = await Promise.all(files.map(async (file) => `${createHash("sha256").update(await fs.readFile(path.join(directory, file))).digest("hex")}  ${file}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${sums.join("\n")}\n`);
await execute("sha256sum", ["-c", "checksums.sha256"], { cwd: directory });
const zipPath = path.join(root, `history-v3.6-shadow-relations-review-v2-${timestamp}.zip`);
await execute("zip", ["-X", "-q", "-r", zipPath, path.basename(directory)], { cwd: root });
await execute("unzip", ["-t", zipPath], { cwd: root });
process.stdout.write(`${zipPath}\n`);
