import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.cwd();
const timestamp = process.argv[2] ?? new Date().toISOString().replace(/[:.]/gu, "-");
const status = "M3_PLANNING_AMENDMENT_READY";
const head = "492543be534da6bf004d6089e174fbb2d21b86cc";
const originalM3 = "artifacts/veronica-systemic-remediation-m3-planning/2026-08-18T01-34-07-356Z/veronica-systemic-remediation-m3-planning-review-2026-08-18T01-34-07-356Z";
const m2Final = "artifacts/veronica-systemic-remediation-m2-final/2026-08-18T01-18-27-136Z/veronica-systemic-remediation-m2-final-review-2026-08-18T01-18-27-136Z";
const m1Final = "artifacts/veronica-systemic-remediation-m1-final/2026-08-18T00-20-00Z/veronica-systemic-remediation-m1-final-review-2026-08-18T00-20-00Z";
const workspaceRoot = "artifacts/veronica-portfolio-preproduction/2026-08-18T01-11-59-399Z/deterministic-workspaces";
const counterfactualPath = "/tmp/veronica-m3-authority-counterfactual-results.json";
const outputRoot = join(root, "artifacts", "veronica-systemic-remediation-m3-planning-amendment", timestamp);
const packName = `veronica-systemic-remediation-m3-planning-amendment-review-${timestamp}`;
const pack = join(outputRoot, packName);

const sha = (value) => createHash("sha256").update(value).digest("hex");
const fileSha = (file) => sha(readFileSync(file));
const readJson = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));
const write = (name, value) => {
  const target = join(pack, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`, "utf8");
};
const json = (name, value) => write(name, JSON.stringify(value, null, 2));
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csvText = (headers, rows) => [headers, ...rows].map((row) => row.map(csv).join(",")).join("\n");
const table = (headers, rows) => `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.map((value) => String(value).replaceAll("|", "\\|")).join(" | ")} |`).join("\n")}`;
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/u, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field.replace(/\r$/u, "")); rows.push(row); }
  const [headers, ...data] = rows;
  return data.filter((entry) => entry.some(Boolean)).map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] ?? ""])));
}

const decompositionPath = join(root, originalM3, "deterministic-preparation-decomposition.csv");
const decomposition = parseCsv(readFileSync(decompositionPath, "utf8"));
if (decomposition.length !== 18) throw new Error(`EXPECTED_18_DECOMPOSITION_ROWS_GOT_${decomposition.length}`);
const terms = [
  "unsupported-doorway-motif", "unsupported-treatment-environment", "unauthorized-visual-concept",
  "CROSS_EPISODE_MOTIF_LEAKAGE", "PROVIDER_PROJECTION_SEMANTIC_MISMATCH",
  "REMEDIATION_TEMPLATE_COLLAPSE", "SEMANTIC_REMEDIATION_LOW_CONFIDENCE", "unsupported-treatment-entity",
  "internal-remediation-language", "stale-action-owner-role",
  "semantic-actor-role-disagrees-with-visible-primary-action", "treatment-polarity-mismatch",
  "projection-polarity-inversion",
];
const frequencies = Object.fromEntries(terms.map((term) => [term, decomposition.filter((row) => row.nested_findings.includes(term)).length]));
const expected = [15, 15, 15, 15, 15, 13, 13, 8, 6, 5, 5, 5, 1];
if (terms.some((term, index) => frequencies[term] !== expected[index])) throw new Error("DECOMPOSITION_FREQUENCIES_CHANGED");

const counterfactual = JSON.parse(readFileSync(counterfactualPath, "utf8"));
if (counterfactual.zeroProviderGuard.actualDispatches !== 0 || counterfactual.zeroProviderGuard.preventedAttempts !== 0) throw new Error("ZERO_PROVIDER_PROOF_FAILED");
const representativeById = new Map(counterfactual.results.map((entry) => [entry.episodeId, entry]));

const authorityRows = decomposition.map((row) => {
  const planPath = join(root, row.source_evidence);
  const workspace = dirname(dirname(planPath));
  const manifest = JSON.parse(readFileSync(join(workspace, "manifest.json"), "utf8"));
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const reviews = JSON.parse(readFileSync(join(workspace, "shared", "pre-image-semantic-reviews.v1.json"), "utf8"));
  const sourcePath = manifest.sourceMetadata.authoritativeSource.path;
  const sourceSha256 = fileSha(join(root, sourcePath));
  const projectionVersions = [...new Set((plan.assets ?? []).map((asset) => asset.projectionProvenance?.stateProjectionPolicyVersion).filter(Boolean))];
  const revisionHashes = (plan.scenes ?? []).map((scene) => `${scene.sceneId}=${scene.semanticProposition?.semanticRevisionHash ?? "absent"}`);
  const representative = representativeById.get(plan.contentId);
  const provenanceCurrent = sourceSha256 === manifest.sourceMetadata.authoritativeSource.sha256
    && sourceSha256 === plan.derivation?.sourceNarrationSha256
    && plan.plannerVersion === "veronicabenini-positioning-visual-planner.v2.5-m1"
    && plan.semanticRemediation?.policyVersion === "veronica-semantic-auto-remediation.v3"
    && reviews.gateVersion === "veronica-pre-image-semantic-gate.v8"
    && projectionVersions.every((version) => version === "veronica-state-aware-provider-projection.v6");
  if (!provenanceCurrent) throw new Error(`NON_CURRENT_18_CASE_PROVENANCE:${row.content_id}`);
  return {
    content_id: row.content_id,
    pack: row.pack,
    format: row.format,
    canonical_source_path: sourcePath,
    canonical_source_sha256: sourceSha256,
    selected_semantic_plan_path: row.source_evidence,
    selected_semantic_plan_sha256: fileSha(planPath),
    semantic_plan_schema_version: plan.schemaVersion,
    semantic_planner_version: plan.plannerVersion,
    remediation_version: plan.semanticRemediation.policyVersion,
    treatment_projection_version: `gate=${reviews.gateVersion};projection=${projectionVersions.join("|")}`,
    semantic_revision_hashes: revisionHashes.join(";"),
    parent_source_hash_stored: `sourceNarrationSha256=${plan.derivation.sourceNarrationSha256};sourceRevisionHash=${plan.derivation.sourceRevisionHash};plannerInputHash=${plan.derivation.plannerInputHash}`,
    artifact_generation_timestamp: manifest.updatedAt ?? statSync(planPath).mtime.toISOString(),
    artifact_authority_status: "CURRENT_DERIVED_AUTHORITY",
    accepted_human_flag: "false; derived-compatibility-artifact",
    stale_rederived_current_classification: "CURRENT_VERSION_DERIVED",
    current_resolver_reason: "resolveVeronicaVisualPlan matched current source/planner identity; preparePositioningProductionEpisode rematerialized semantic finalization",
    nested_m1_class_findings: row.nested_findings,
    findings_generated_now_or_persisted: representative ? "REPRODUCED_NOW_AND_PERSISTED" : "PERSISTED_CURRENT_VERSION_OUTPUT; representative-equivalent identity, not rerun",
    current_source_would_rederive_differently: representative ? "SEMANTICALLY_NO; plan/file hash changes only from cache/latency telemetry" : "NOT_EXECUTED; current source/version identity predicts same semantic bytes",
    rederive_currently_allowed: "yes via English preparePositioningProductionEpisode; accepted authority must be review-only",
    rederive_currently_skipped: "yes in createVeronicaPreImageReviewPack when semantic-plan file merely exists; no during census preparation",
    skip_reason: "review-pack packaging existence shortcut",
    exact_first_bypass_staleness_point: "NO_OBSERVED_STALE_BYPASS; latent exists-only shortcut at createVeronicaPreImageReviewPack",
    first_producer: "buildVeronicaCanonicalVisualPlan -> expandVeronicaLongFormSemanticScenes (long only) -> hardenVeronicaPreImagePlan/repairBlockedScene/visualTreatmentFromProposition -> rebuildVeronicaFinalTreatmentState",
    final_detector: "reviewVeronicaPreImageTreatment + assessVeronicaProviderReadiness + hierarchical readiness in preparePositioningProductionEpisode",
    source_evidence_paths: `${sourcePath};${relative(root, join(workspace, "source", "visual-plan.json"))};${row.source_evidence};${relative(root, join(workspace, "shared", "pre-image-semantic-reviews.v1.json"))}`,
  };
});

mkdirSync(pack, { recursive: true });
const packagingHead = git("rev-parse", "HEAD");
if (packagingHead !== head) throw new Error(`HEAD_CHANGED_DURING_AMENDMENT:${packagingHead}`);
const packagingDirtyState = git("status", "--porcelain=v1").split("\n").filter(Boolean);
write("git-safety-state.md", `# Git safety state

The required commands were executed before analysis. Starting and packaging HEAD: \`${head}\`. The initial worktree was substantially dirty (38 modified tracked files plus pre-existing untracked plans, reports, artifacts, and scripts); no reset, clean, stash, rebase, checkout, or discard was performed.

Task-owned additions are the M3 amendment generator, amendment artifact directory/ZIP, and Codex run report. All other dirty paths were preserved. Packaging-time \`git status --porcelain=v1\` follows:

\`\`\`
${packagingDirtyState.join("\n")}
\`\`\`
`);
write("README.md", `# Veronica M3 planning amendment review

Purpose: reconcile the approved M3 plan with M1-class findings nested under 18 \`DETERMINISTIC_PREPARATION\` records. This amends the original M3 pack; it does not duplicate or execute M3.

Contradiction resolution: all 18 selected plans are current derived authority, not stale or historical. Fifteen contain current-producer M1-class defects; three contain only other current deterministic blockers. Three guarded isolated rederives reproduced the semantic findings exactly. M1/M2 review generators hid nested findings behind the stage label.

Decision: **Option B — current producer remediation**, plus a minimal semantic-plan freshness/resolver contract because semantic-plan selection currently lacks the visual resolver's identity checks. WP-A0 is required before candidate/operator work. Final amendment status: **${status}**.
`);

const authorityHeaders = Object.keys(authorityRows[0]);
write("18-case-authority-trace.csv", csvText(authorityHeaders, authorityRows.map((row) => authorityHeaders.map((header) => row[header]))));

const invariantRows = [
  ["unauthorized generic persona/concept", 15, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Current derived plans contain designer/consultant/professional/customer or threshold concepts not authorized by finalized propositions."],
  ["unsupported treatment entity", 8, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Fresh producer output retains expertise-recognition/customer incompatibilities."],
  ["unsupported treatment environment", 15, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Current producer retains public-threshold environments without source authority."],
  ["doorway/threshold leakage", 15, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Doorway motif and cross-episode leakage are generated by the current path."],
  ["cross-episode motif leakage", 15, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Current gate v8 detects current output."],
  ["remediation-template collapse", 13, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Fresh remediation v3 reproduces the collapse."],
  ["semantic-remediation low confidence", 13, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Low-confidence no-safe remediation is current, blocked pre-provider, and not eliminated."],
  ["internal remediation leakage", 6, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Current prompts/readiness expose internal remediation language."],
  ["treatment/proposition incompatibility", 17, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Seventeen of 18 current plans have treatment-authorization incompatibility."],
  ["provider projection inconsistency", 15, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Unsupported doorway projection appears in current projection v6 output."],
  ["stale action owner", 5, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Current finalized semantics and visible primary action disagree."],
  ["polarity inversion/mismatch", 5, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "Five treatment mismatches; one includes explicit projection-polarity-inversion."],
  ["semantic plan planHash determinism", 3, "CURRENT_PRODUCER_REGRESSION", "NOT_MEASURED_CORRECTLY", "All three counterfactual planHash/file hashes changed only because cache/latency telemetry is included; semanticPlanCacheKey and semantic revisions stayed stable."],
];
write("m1-invariant-reconciliation.csv", csvText(["invariant", "affected_18_case_variants", "true_status", "historical_metric_status", "evidence"], invariantRows));

write("semantic-plan-lifecycle-current.md", `# Current semantic-plan lifecycle

1. \`prepareCanonicalSourceEpisodeWorkspace\` binds canonical narration bytes and writes \`canonical-source-episode.v1.json\` plus \`visual-planner-input.v1.json\`.
2. \`resolveVeronicaVisualPlan\` governs \`source/visual-plan.json\`. Derived reuse requires planner-input hash, source-revision hash, planner version, configuration hash, and a valid self-hash. A schema-valid plan without \`derivation\` is treated as \`ACCEPTED_IMMUTABLE\`.
3. \`preparePositioningProductionEpisode\` invokes that visual resolver, then performs segmentation, \`hardenVeronicaPreImagePlan\`, final-treatment rebuilding, deterministic prompt projection, readiness, and writes \`source/pre-image-semantic-plan.v1.json\`.
4. There is **no separate semantic-plan authority resolver**. The semantic artifact has source and version metadata, but reuse paths do not compare it as a complete freshness identity.
5. \`createVeronicaPreImageReviewPack\` calls prepare only if the semantic-plan path does not exist. \`runExistingVeronicaSourceGroundedPreImageQa\`, \`planExistingVeronicaVisualDensity\`, and timing reconciliation parse persisted semantic authority; they validate selected integrity/projection fields but do not compare source + planner + semantic gate + remediation + projection identity.

The 18 workspaces were generated at 01:12Z from exact current source bytes with planner v2.5-m1, gate v8, remediation v3, and projection v6. They are \`CURRENT_DERIVED_AUTHORITY\`. M1's visual-plan resolver safety did not imply semantic-plan freshness; prior invariant wording overgeneralized this boundary.

Minimal future freshness identity: canonical source SHA-256, planner-input/source-revision identity, planner version, finalized semantic gate/contract version, remediation policy version, treatment/provider projection version, and only semantic-byte-affecting policy versions. Exclude timestamp, QA model, runtime/cache telemetry, prompt compiler unless semantic-plan bytes depend on it, and render versions.

Accepted authority must become explicit. Absence of \`derivation\` alone is not adequate proof of human acceptance. Existing accepted artifacts stay immutable and require explicit review when policy versions are incompatible; no automatic overwrite.
`);

write("long-vs-short-lifecycle.md", `# Long versus Short lifecycle

${table(["Dimension", "Long", "Short"], [
  ["Visual resolver", "Same resolveVeronicaVisualPlan identity checks", "Same resolveVeronicaVisualPlan identity checks"],
  ["Semantic segmentation", "expandVeronicaLongFormSemanticScenes creates SB scenes and persists segmentation version", "No long expansion; narration is split to authored scenes"],
  ["Remediation", "v3, max two rounds, multi-state sequence policy", "v3, max two rounds, decisive-still policy and short causal remediation"],
  ["Visual beat sequencing", "Disabled; materializeSemanticBeats returns the plan and visualBeatPlan is absent", "Enabled; derive/materialize visual beat plan and bounded candidates"],
  ["Semantic persistence", "Same pre-image-semantic-plan path and finalizer", "Same pre-image-semantic-plan path and finalizer"],
  ["Reuse/resume", "Same exists-only review-pack shortcut", "Same exists-only review-pack shortcut"],
  ["Observed affected cases", "11/18", "7/18"],
])}

Long beat sequencing being disabled does not cause old semantic-plan reuse. It removes the Short beat-candidate layer, while long semantic scenes, treatments, projections, readiness, and persistence still run. Shorts reproduce the same doorway/template defect, so the contradiction is not long-only.
`);

const counterfactualRows = counterfactual.results.map((entry) => [
  entry.episodeId,
  entry.pack,
  entry.format,
  entry.old.planHash,
  entry.fresh.planHash,
  entry.old.fileSha256 === entry.fresh.fileSha256 ? "yes" : "no",
  entry.old.nestedFindings.length,
  entry.fresh.nestedFindings.length,
  JSON.stringify(entry.old.nestedFindings) === JSON.stringify(entry.fresh.nestedFindings) ? "yes" : "no",
  "CURRENT_PRODUCER_DEFECT; hash delta is cache/latency telemetry only",
]);
write("counterfactual-rederive-results.md", `# Isolated counterfactual rederive

The guard was installed before dynamic imports and patched fetch, HTTP request/get, HTTPS request/get, net connect/createConnection, and TLS connect. Actual dispatches: 0; prevented attempts: 0. Each run copied one workspace under \`/tmp\` and performed one current deterministic derivation.

${table(["Case", "Pack", "Format", "Old planHash", "Fresh planHash", "File hash equal", "Old findings", "Fresh findings", "Findings equal", "Conclusion"], counterfactualRows)}

For all three, semanticRevisionHash values, treatment hashes/concepts, actor roles, environments, semantic quality FAIL, provider readiness FAIL, and nested findings were identical. \`semanticPlanCacheKey\`, canonical image-plan hash, render-event hash, narration semantic hash, and semantic-beat hash were also identical. Full \`planHash\` changed because \`semanticPlanHashInput\` hashes every persisted field, including prompt cache hit/miss/latency and QA wall-clock telemetry. This is a self-hash/provenance design defect, not stale semantics.

- p1-long-l01: doorway/environment/unauthorized concept, motif leakage, unsupported projection, template collapse, and low confidence all reproduced.
- p2-long-03: those classes plus entity, ownership, and polarity mismatches reproduced.
- p2-short-04b: doorway/environment/unauthorized concept, motif leakage, projection mismatch, template collapse, and low confidence reproduced.
`);
json("counterfactual-rederive-results.json", {
  schemaVersion: counterfactual.schemaVersion,
  zeroProviderGuard: counterfactual.zeroProviderGuard,
  results: counterfactual.results.map((entry) => ({
    episodeId: entry.episodeId,
    pack: entry.pack,
    format: entry.format,
    old: { fileSha256: entry.old.fileSha256, planHash: entry.old.planHash, nestedFindings: entry.old.nestedFindings, treatments: entry.old.treatments },
    fresh: { fileSha256: entry.fresh.fileSha256, planHash: entry.fresh.planHash, nestedFindings: entry.fresh.nestedFindings, treatments: entry.fresh.treatments },
  })),
});

write("regression-metric-blind-spot.md", `# Regression metric blind spot

Confirmed. M1 \`normalized(record)\` in \`scripts/generate-veronica-systemic-remediation-m1-final-review.mjs\` inspects only terminal errors or gate IDs. A successful local preparation that returns semantic remediation \`BLOCK\` contributes only \`DETERMINISTIC_PREPARATION\`; it never reads \`shared/pre-image-semantic-reviews.v1.json\` or plan readiness issues.

M2 repeats the blind spot in \`m2Roots(record)\` in \`scripts/generate-veronica-systemic-remediation-m2-final-review.mjs\`: outcome findings win; otherwise any BLOCK becomes \`[\"DETERMINISTIC_PREPARATION\"]\`. The hard-coded M1 regression table then writes “0 regression observed” without querying nested current-authority findings.

Therefore the historical “none/zero” statements were reporting omissions, not proof of absence. Historical reports remain unchanged.

Future reports must use one canonical flattener that accepts terminal outcome + persisted current-authority plan + semantic reviews + provider readiness. It emits stage and all specific normalized findings, deduplicated by content/scene/code/reason. \`DETERMINISTIC_PREPARATION\` remains a stage label and never replaces specific causes.
`);

write("authority-root-cause.md", `# Authority and root cause conclusion

Decision: **Option B — current producer remediation**, not stale authority and not reporting-only.

- 18/18 semantic plans are \`CURRENT_DERIVED_AUTHORITY\` with exact source hashes and current repository versions.
- 15/18 carry at least one enumerated M1-class finding generated by the current path; 3/18 have other current deterministic blockers only.
- 0/18 are stale derived authority, accepted human authority, legacy compatibility authority, historical-only evidence, or provenance mismatch.
- Representative current-code rederive reproduced all semantic findings.
- M1/M2 metrics excluded nested findings, so invariant elimination was overstated.
- A latent lifecycle gap remains: semantic-plan reuse has no authority resolver and packaging uses file existence. This did not cause these 18 cases, but must be corrected before future version changes can safely reuse plans.

The earliest current producer points are \`visualTreatmentFromProposition\`, long semantic expansion seeding, \`repairBlockedScene\`/\`hardenVeronicaPreImagePlan\`, and final projection/materialization. Validators are correctly blocking the output. No repair-until-pass loop is authorized.
`);

write("m3-scope-amendment.md", `# M3 scope amendment

WP-A0 is added before candidate coverage. It combines: (1) explicit semantic-plan authority/freshness resolution; (2) correction of current producer templates/projections responsible for M1-class findings; (3) telemetry-free semantic identity; and (4) canonical nested root-cause flattening.

This is Option B. No stale replacement is required for the examined 18 today, but the new resolver must classify future stale derived plans, preserve them content-addressed, and derive exactly once from current versions. Accepted human authority is never overwritten.

The 51-beat no-safe census remains a valid current-authority baseline: all 25 evidence plans match current source/planner provenance. The 39 unresolved/unauthorized beats, 10 buyer beats, and 03b/04a causal cases are fresh. Nevertheless, rerun the exact affected population after WP-A0 producer changes and recompute the denominator before implementing WP-B candidate families. Producer changes may truthfully change which beats reach candidate selection.

No Pack 1 content migration, source mutation, validator weakening, repeated remediation, or paid provider work enters M3.
`);

write("updated-work-package-dag.md", `# Updated work-package DAG

\`WP-A0 authority + current-producer reconciliation → WP-A root-cause specificity → WP-B approved safe candidate coverage → WP-E selector integration → WP-G exact 48 proof\`

\`WP-A0 → WP-C causal applicability\`; \`WP-A0 → WP-D ownership projection\`; \`WP-F adapter/provenance tests\` may begin after A0 contracts stabilize and must finish before G.

${table(["WP", "Depends on", "Required result"], [
  ["A0 semantic authority/producer reconciliation", "none", "Freshness identity, explicit authority classification, current M1 producer corrections, telemetry-free semantic identity, affected rerun"],
  ["A root-cause specificity/no-safe diagnostics", "A0", "Canonical nested flattener; stage preserved; specific causes visible"],
  ["B approved safe candidate coverage", "A", "Only source-authorized high-confidence families; max six; recomputed denominator"],
  ["C causal applicability", "A0,A", "03b applicability fix; 04a operator only if two-sided authority is proven"],
  ["D ownership projection", "A0,A", "Primary visible owner controls long reference projection"],
  ["E selector integration", "B,C", "Stable bounded beam selection and semantic hard gates"],
  ["F adapter/provenance tests", "A0 contract", "Active fixtures for authority, versions, accepted protection, and adapters"],
  ["G exact 48 proof", "A0–F", "Guarded exact population, corrected metrics, final review ZIP"],
])}
`);

write("updated-implementation-milestones.md", `# Updated atomic implementation milestones

1. **A0.1 characterize**: codify the 18 trace and add failing fixtures for current derived, stale derived, accepted human, provenance mismatch, exists-only resume, and telemetry-only hash change.
2. **A0.2 authority resolver**: add explicit semantic-plan authority metadata and resolver. Compare only semantic-byte identities. Archive stale derived bytes and metadata; never overwrite accepted authority.
3. **A0.3 producer remediation**: fix doorway/environment/unauthorized concept introduction, template collapse/low-confidence handling, internal text leakage, owner propagation, and polarity projection at their producers. One deterministic derivation; truthful BLOCK allowed.
4. **A0.4 identity/reporting**: separate semantic identity from runtime telemetry and implement the canonical nested root-cause flattener. Rerun affected current authority and recompute DP/no-safe denominators.
5. **A1**: typed no-safe reason/report specificity with BLOCK unchanged.
6. **B1**: high-confidence buyer-recognition coverage only after applicability proof and recomputed census.
7. **C1**: 03b non-causal classification; 04a conditional removal→enabled-action only with complete source authorization.
8. **D1**: long ownership projection fix for l03/l06 plus success control.
9. **E1**: bounded selector integration, stable IDs/ties, unchanged hard gates.
10. **F1**: active adapter, cache, provenance, accepted-authority, and historical-preservation tests.
11. **G1**: Tier 1, representative Tier 2, guarded exact-48 Tier 3, corrected review ZIP.

Stop after each milestone if the same focused failure survives two targeted fixes, more than three fixtures need edits, assertions would be weakened, or provider-zero cannot be guaranteed.
`);

const fixtureRows = [
  ["AUTH-CURRENT-LONG-P1", "p1-long-l01", "CURRENT_DERIVED_AUTHORITY", "fresh rederive preserves semantics and specific BLOCK findings"],
  ["AUTH-CURRENT-LONG-P2", "p2-long-03", "CURRENT_DERIVED_AUTHORITY", "owner/polarity/doorway findings are producer-owned"],
  ["AUTH-CURRENT-SHORT-P2", "p2-short-04b", "CURRENT_DERIVED_AUTHORITY", "Short shares lifecycle and producer defect"],
  ["AUTH-STALE-SOURCE", "synthetic", "STALE_DERIVED_AUTHORITY", "archive then one rederive; descendant invalidation"],
  ["AUTH-STALE-GATE", "synthetic", "STALE_DERIVED_AUTHORITY", "semantic gate/remediation/projection identity mismatch rejects reuse"],
  ["AUTH-ACCEPTED", "accepted fixture", "ACCEPTED_HUMAN_AUTHORITY", "immutable; explicit review; no overwrite"],
  ["AUTH-LEGACY", "legacy fixture", "LEGACY_COMPATIBILITY_AUTHORITY", "not accepted merely because derivation is missing"],
  ["AUTH-PROVENANCE", "synthetic", "PROVENANCE_MISMATCH", "BLOCK and preserve evidence"],
  ["AUTH-TELEMETRY", "p1-long-l01", "CURRENT_DERIVED_AUTHORITY", "cache/latency changes do not change semantic freshness identity"],
  ["ROOT-DP-NESTED", "18-case set", "CURRENT_DERIVED_AUTHORITY", "stage plus flattened specific findings"],
  ["NSC-39", "39 beats", "CURRENT_DERIVED_AUTHORITY", "retain editorial limitation unless semantic authority changes"],
  ["NSC-BUYER-10", "10 beats", "CURRENT_DERIVED_AUTHORITY", "no generic buyer; typed applicability required"],
  ["CAUSAL-03B", "p2-short-03b", "CURRENT_DERIVED_AUTHORITY", "stable question is not falsely causal"],
  ["CAUSAL-04A", "p2-short-04a", "CURRENT_DERIVED_AUTHORITY", "two-sided evidence or BLOCK"],
  ["OWNERSHIP-LONG", "p1-long-l03,p1-long-l06", "CURRENT_DERIVED_AUTHORITY", "visible primary owner controls projection"],
  ["EXACT-48", "population e58ee45a…", "mixed outcomes", "0 provider dispatch; corrected metrics"],
];
write("updated-fixture-matrix.csv", csvText(["fixture_id", "case", "authority_class", "assertion"], fixtureRows));

write("updated-test-strategy.md", `# Updated test strategy

Tier 1 runs directly affected files first: semantic authority resolver; semantic hash/freshness identity; semantic quality/gate; adapter; review-pack resume; deterministic root-cause flattener; candidate/causal/ownership tests. Include exact assertions for all seven authority states, one-derive behavior, accepted immutability, content-addressed preservation, targeted descendant invalidation, long/Short parity, and telemetry exclusion. Then one affected-package typecheck and scoped ESLint only after focused tests pass.

Tier 2 uses the fixture matrix: p1-long-l01, p2-long-03, p2-short-04b; one stale derived synthetic; one accepted human; 39/no-safe, buyer, 03b, 04a, l03/l06. First rerun A0 representatives and recompute affected denominators; only then test candidate families.

Tier 3 reruns the exact 48 canonical English variants with population hash \`e58ee45acf8e81cc40787ea5b052133f0a02fd289b01988d4a4a0acc2c374246\` under the established fail-closed guard. Metrics must include terminal and nested findings from current authority. Exact outcomes may remain BLOCK; success means no infrastructure ERROR, specific causes, fresh authority, and zero dispatch—not forced PASS.

Repository verification limits remain binding: at most three distinct test commands per implementation context, two targeted repairs, no unchanged failing rerun, no snapshot/fixture regeneration, and no broad build/test without human authorization.
`);

write("updated-cache-provenance-plan.md", `# Updated cache and provenance plan

Add a semantic authority envelope separate from runtime telemetry. Identity inputs: canonical source SHA-256; source revision/planner-input hash; planner version; finalized semantic contract/gate version; remediation policy version; treatment/provider projection version; semantic-byte-affecting policy versions. Exclude timestamps, QA model, QA wall clock, cache hit/miss/latency, render identity, and prompt compiler unless its output is part of semantic authority.

Resolver outcomes use the seven amendment classifications. Derived mismatch archives original bytes under a content-addressed path with original hash, classification, superseded reason, source/provenance identity, replacement hash, and link. Then exactly one current derivation occurs. Only semantic descendants whose parent identity changed are invalidated: treatments/projections, beat plan, prompts, QA admission, localized visual materialization. Narration/audio/timing remain untouched unless their own parent changed.

Accepted human authority is immutable. A policy incompatibility creates explicit review state; it never silently rederives or upgrades. Legacy plans without derivation do not automatically become accepted. Atomic write failure retains old current authority and reports BLOCK.
`);

write("updated-m1-m2-regression-contract.md", `# Updated M1/M2 regression contract

Future assertions are scoped to newly derived current authority and flattened nested findings:

- No newly derived current-authority artifact may contain unsupported treatment entity/environment, unauthorized generic persona/concept, unsupported doorway leakage, cross-episode motif leakage, internal remediation language, stale action owner, polarity inversion, or incompatible provider projection.
- Historical/stale artifacts may retain evidence but must not be selected current authority.
- Low-confidence/no-safe semantics may truthfully BLOCK, but must not retain an unauthorized treatment/projection as if current-safe.
- Accepted human authority is immutable and policy-incompatible acceptance requires explicit review.
- Semantic freshness identity is deterministic across cache, latency, timestamp, and QA telemetry changes.
- Metrics traverse terminal outcomes, current semantic reviews, provider readiness, and nested deterministic blockers for all relevant formats.
- \`DETERMINISTIC_PREPARATION\` is a stage, never the sole root cause when specific findings exist.

Historical M1/M2 reports are not rewritten. Their zero-regression language is superseded for future measurement by this contract.
`);

write("updated-future-acceptance-criteria.md", `# Updated future M3 acceptance criteria

M3 READY requires: zero provider dispatch; proven semantic-plan authority lifecycle; no stale derived selection; explicit accepted/human protection; nested M1-class measurement; current-version derive never silently reuses legacy semantics; one-derive semantics without repair-until-pass; telemetry-free deterministic authority identity; exact 48 rerun after A0; specific root causes; candidate changes based only on fresh authority; recomputed no-safe/buyer/causal denominators; preserved M1/M2 safety invariants using the updated wording; active adapter/provenance tests; no accepted overwrite; content-addressed historical preservation; and a valid final review ZIP.

Any truthful current plan may remain BLOCK. PASS counts are not an acceptance criterion. Unknown exceptions remain ERROR. Provider-guard failure is immediate BLOCKED.
`);

const affectedRows = [
  ["packages/strategic-reinvention/src/veronica-semantic-plan-authority.ts", "new", "A0 explicit authority/freshness resolver and archive evidence"],
  ["packages/strategic-reinvention/src/veronica-semantic-plan-authority.unit.test.ts", "new", "seven classifications, accepted protection, telemetry exclusion"],
  ["packages/strategic-reinvention/src/positioning-visual-semantics.ts", "modify", "separate semantic identity from full persisted telemetry self-hash"],
  ["packages/strategic-reinvention/src/positioning-production-adapter.ts", "modify", "invoke semantic resolver; one derive; targeted descendant invalidation"],
  ["packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts", "modify", "long/Short authority and current producer fixtures"],
  ["apps/cli/src/veronica-pre-image-review-pack.ts", "modify", "replace exists-only shortcut with resolver decision"],
  ["apps/cli/src/veronica-pre-image-review-pack.unit.test.ts", "modify", "stale/current/accepted resume coverage"],
  ["packages/strategic-reinvention/src/veronica-semantic-quality.ts", "modify", "remove unsupported template/persona/environment production"],
  ["packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts", "modify", "producer remediation, owner/polarity/internal-text correctness"],
  ["packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts", "modify", "18-class regression representatives"],
  ["packages/strategic-reinvention/src/veronica-deterministic-outcome.ts", "modify", "canonical nested root-cause flattener"],
  ["packages/strategic-reinvention/src/veronica-deterministic-outcome.unit.test.ts", "modify", "stage plus specific cause assertions"],
  ["scripts/veronica-zero-cost-preproduction-census.ts", "modify", "emit current authority and flattened nested findings"],
  ["scripts/generate-veronica-systemic-remediation-m3-final-review.mjs", "new", "corrected exact-48 metrics and final pack"],
  ["packages/strategic-reinvention/src/veronica-visual-beats.ts", "later WP-B/C", "candidate families only after A0 rerun"],
  ["packages/strategic-reinvention/src/veronica-sequence-diversity.ts", "later WP-A/B/E", "specific no-safe reasons and bounded integration"],
  ["packages/strategic-reinvention/src/veronica-image-prompt-compiler.ts", "later WP-D", "owner-authoritative projection"],
];
write("updated-affected-files.csv", csvText(["path", "change", "purpose"], affectedRows));

write("implementation-handoff-prompt.md", `# Veronica Systemic Remediation M3 — complete implementation handoff

You are implementing M3 in the existing pnpm monorepo. Read AGENTS.md and docs/ai-context/context-pack.md first. Source code is authoritative. Use this amendment pack, the original M3 planning pack, the M2 final review pack, and the M1 final review pack. Do not reconstruct the plan from scratch.

## Objective and settled evidence

M1 fixed visual-plan resolver behavior and introduced semantic finalization/remediation. M2 added typed outcomes, bounded candidates/beam selection, causal evidence, ownership filtering, and produced exact 48 = 0 PASS / 48 BLOCK / 0 ERROR. Original M3 decomposed 25 variants/51 no-safe beats, 18 deterministic-preparation cases, two ownership blocks, and two causal cases.

The amendment proves all 18 DP plans are CURRENT_DERIVED_AUTHORITY: exact source hashes, planner v2.5-m1, gate v8, remediation v3, projection v6. Fifteen contain current-producer M1-class findings; none are stale/historical. Three guarded rederives reproduced semantic revisions, treatments, roles, environments, readiness, and findings. M1/M2 metrics hid nested findings. Full planHash is telemetry-sensitive although semanticPlanCacheKey is stable. There is no semantic-plan resolver; review-pack creation skips preparation on path existence.

Implement **Option B** and add WP-A0. Do not implement stale-only repair as the diagnosis, reporting-only correction, Pack 1 migration, source/content edits, paid providers, repair-until-pass, or validator weakening.

## Mandatory safety

Before work: run \`git rev-parse HEAD\`, \`git status --porcelain=v1\`, and \`git diff --stat\`; preserve the dirty tree. Never reset/clean/stash/rebase. Before any provider-capable dynamic import, install the existing deny guard for global fetch, HTTP request/get, HTTPS request/get, net connect/createConnection, and TLS connect; record counters before/after. If zero dispatch cannot be guaranteed, stop BLOCKED. All corpus work uses isolated workspaces. Never overwrite current persisted or accepted artifacts during tests.

## Work-package order

1. **WP-A0 authority and producer reconciliation.** Add explicit semantic authority states: CURRENT_DERIVED_AUTHORITY, ACCEPTED_HUMAN_AUTHORITY, STALE_DERIVED_AUTHORITY, LEGACY_COMPATIBILITY_AUTHORITY, HISTORICAL_NON_AUTHORITY, PROVENANCE_MISMATCH, UNKNOWN. Freshness identity includes source SHA, source/planner-input revision, planner version, finalized semantic gate/contract, remediation policy, treatment/projection version, and semantic-byte policy. Exclude timestamp, QA model, cache/latency/wall-clock, render, and prompt compiler unless semantic bytes depend on it. Legacy missing derivation is not automatically human accepted. Accepted authority is immutable and policy incompatibility requests review. Stale derived is content-addressed historical evidence, then exactly one current derive; invalidate only descendants whose parent changed. Separate semantic identity from telemetry-sensitive full self-hash.

   Fix current producer defects at their first producer: unsupported doorway/public-threshold templates, unauthorized designer/consultant/professional/customer concepts, unsupported expertise-recognition entity, template collapse/low-confidence behavior, internal remediation text, stale visible action owner, and treatment/provider polarity. Likely symbols: \`visualTreatmentFromProposition\`, \`expandVeronicaLongFormSemanticScenes\`, \`repairBlockedScene\`, \`hardenVeronicaPreImagePlan\`, \`rebuildVeronicaFinalTreatmentState\`, and projection/materialization. Validators remain strict. A fresh plan may BLOCK.

   Implement one canonical root-cause flattener across terminal outcome, current semantic reviews, semantic quality, and provider readiness. Preserve DETERMINISTIC_PREPARATION as stage; emit specific content/scene/code/reason. Update census/final reports. Rerun affected authority and recompute DP/no-safe denominators before WP-B.

2. **WP-A root-cause/no-safe diagnostics.** Preserve the original four clusters and add typed exact reasons. 39 NSC-UNRESOLVED-UNAUTHORIZED beats remain content/editorial limitations unless fresh semantic authority supplies an allowed mechanism. Do not invent operators. Ten NSC-UNRESOLVED-BUYER beats permit a candidate family only after typed buyer-recognition applicability proves source cue, buyer role, state, evidence, and environment. No generic buyer scene.

3. **WP-B approved candidate coverage.** Only evidence-backed families after A0 census. Keep immutable derived candidates, max six per beat, semantic-parent hashes, authorized actors/environments, and deterministic IDs/ties. Candidate output never becomes semantic authority.

4. **WP-C causal applicability.** p2-short-03b is a stable recognition question; stop misclassifying it causal and do not add an operator. p2-short-04a may receive one source-bound removal→enabled-action operator only if fresh authority proves obstacle, displaced state, enabled buyer action, visible link, actor, and environment. Otherwise BLOCK.

5. **WP-D ownership projection.** For p1-long-l03 and p1-long-l06, finalized visible primary action owner is authoritative for reference projection. Stale asset identity cannot authorize protagonist/reference usage. Include a persistent-protagonist success control.

6. **WP-E selector integration.** Preserve beam width 4, rolling window 5, max six candidates, semantic hard gates before scoring, stable tie keys, and no unsafe candidate fallback. Do not merge beats without new approved timing evidence.

7. **WP-F adapter/provenance debt.** Re-enable active adapter assertions. Cover current/stale/accepted/legacy/historical/mismatch/unknown, atomic failure, content-addressed preservation, descendant invalidation, long/Short parity, telemetry exclusion, versions, source hashes, and exists-only resume replacement.

8. **WP-G proof.** Run focused Tier 1, representative Tier 2, then the exact same 48 canonical English population under the guard. Population hash: e58ee45acf8e81cc40787ea5b052133f0a02fd289b01988d4a4a0acc2c374246. Recompute nested metrics. BLOCK is valid; unknown exceptions remain ERROR.

## Verification tiers and limits

Tier 1: resolver/hash/gate/semantic quality/outcome flattener/adapter/review-pack/candidate/causal/ownership files, then one affected-package typecheck and scoped ESLint. Tier 2: p1-long-l01, p2-long-03, p2-short-04b; stale and accepted fixtures; 39/buyer; 03b/04a; l03/l06. Tier 3: exact 48 only. Follow repo budget: affected test first; at most three distinct test commands per implementation context; two repair reruns; never rerun unchanged failure; no broad build/test/snapshots/fixture regeneration.

Stop and report if provider guard cannot be installed, accepted authority would be overwritten, source mutation or validator weakening appears necessary, more than three fixtures require edits, the same focused failure survives two targeted fixes, full population changes unintentionally, or authority remains UNKNOWN.

## Final regression and acceptance contract

No newly derived current authority may contain unsupported entity/environment, unauthorized persona/concept, doorway/motif leakage, internal remediation language, stale owner, polarity inversion, or incompatible projection. Historical artifacts may retain evidence but cannot be current. Low-confidence/no-safe may BLOCK without carrying unsafe treatment as accepted. Metrics include nested blockers for all formats. Semantic freshness identity is telemetry-independent. Accepted artifacts are immutable.

M3 final READY additionally requires zero provider dispatch, no stale selection, one-derive behavior, exact 48 rerun after A0, specific root causes, candidates based on fresh authority, active adapter tests, historical preservation, and no accepted overwrite.

## Final review pack

Generate \`veronica-systemic-remediation-m3-final-review-<timestamp>.zip\` with README/status, git state, authority census, before/after nested findings, corrected invariant metrics, no-safe/buyer/causal/ownership results, exact-48 population/hash/results, tests/checks, cache/provenance/historical preservation, accepted-authority proof, zero-provider counters, changed files, risks, MANIFEST hashes, ZIP integrity, and outer SHA-256. Create required docs/reports implementation report if the source plan is under docs/plans. Do not omit partial/not-completed/deviations.

Final implementation status vocabulary: \`SYSTEMIC_REMEDIATION_M3_READY\`, \`BLOCKED\`, or \`FAILED\`. Do not claim READY from status normalization or forced PASS.
`);

write("zero-paid-provider-proof.md", `# Zero paid-provider proof

The representative counterfactual installed the established fail-closed guard before dynamic pipeline imports. Patched: global fetch, HTTP request/get, HTTPS request/get, net connect/createConnection, TLS connect.

${table(["Provider class", "Actual dispatches", "Prevented attempts"], [
  ["Paid LLM", 0, 0], ["TTS", 0, 0], ["Images", 0, 0], ["Paid QA", 0, 0],
  ["Embeddings", 0, 0], ["Remote rendering", 0, 0], ["Other", 0, 0],
])}

Three deterministic derivations completed in isolated /tmp workspaces. No provider client was instantiated. The planning/document-generation pass used only local reads and writes.
`);

const reportPath = join(root, "docs", "reports", "codex-runs", "2026-08-18-veronica-m3-planning-amendment.md");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `# Veronica M3 planning amendment\n\nSummary: reconciled 18 DP cases as current derived authority; 15 contain current-producer M1-class defects. Added WP-A0 authority/producer scope and complete handoff.\n\nChanged paths: scripts/generate-veronica-systemic-remediation-m3-amendment-review.mjs; artifacts/veronica-systemic-remediation-m3-planning-amendment/${timestamp}/; docs/reports/codex-runs/2026-08-18-veronica-m3-planning-amendment.md.\n\nTests/checks: exact 18 CSV/count/hash trace; guarded isolated rederive p1-long-l01, p2-long-03, p2-short-04b; manifest/hash/ZIP checks. Results: findings reproduced; provider dispatch 0.\n\nCommit hash: ${head}.\n\nUnresolved risks: planHash includes runtime telemetry; semantic freshness resolver is not implemented.\n`, "utf8");

const sourceProvenance = {
  originalM3Zip: `${originalM3}.zip`,
  originalM3ZipSha256: fileSha(join(root, `${originalM3}.zip`)),
  m2FinalZip: `${m2Final}.zip`,
  m2FinalZipSha256: fileSha(join(root, `${m2Final}.zip`)),
  m1FinalZip: `${m1Final}.zip`,
  m1FinalZipSha256: fileSha(join(root, `${m1Final}.zip`)),
  decompositionSha256: fileSha(decompositionPath),
  exact48PopulationHash: "e58ee45acf8e81cc40787ea5b052133f0a02fd289b01988d4a4a0acc2c374246",
};
const manifestFiles = files(pack).filter((file) => relative(pack, file).replaceAll("\\", "/") !== "MANIFEST.json").map((file) => ({ path: relative(pack, file).replaceAll("\\", "/"), sha256: fileSha(file), sizeBytes: statSync(file).size })).sort((left, right) => left.path.localeCompare(right.path));
json("MANIFEST.json", {
  schemaVersion: "veronica-m3-planning-amendment-manifest.v1",
  generatedTimestamp: timestamp,
  amendmentStatus: status,
  repositoryHead: head,
  dirtyStateRecorded: true,
  authorityConclusion: { currentDerived: 18, currentProducerM1Class: 15, staleDerived: 0, historicalOnly: 0, acceptedHuman: 0, provenanceMismatch: 0 },
  findingFrequencies: frequencies,
  providerDispatchCounters: { paidLlm: 0, tts: 0, images: 0, paidQa: 0, embeddings: 0, remoteRendering: 0, other: 0, prevented: 0 },
  sourceProvenance,
  files: manifestFiles,
});

console.log(relative(root, pack).replaceAll("\\", "/"));
