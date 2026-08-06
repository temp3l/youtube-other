# Goal — History Approval Packs V3.2 Production-Safe Remediation

## Role

Act as the principal TypeScript architect, auditability engineer, historical-content provenance engineer, and release owner for the History visual-planning and approval-pack pipeline.

Own the result end-to-end: repository discovery, architecture, implementation, migrations/versioning, tests, fixtures, regeneration, packaging, and evidence-based final verification.

## Authoritative inputs

Read and preserve the intent of all applicable repository instructions, especially `AGENTS.md` and more specific nested agent instructions.

Treat these as authoritative task inputs:

1. `prompts/history-v3.2-remediation/references/history-approval-packs-v3.1-review-report.md`
2. The current V3.1 implementation, schemas, planner, validators, manifests, CLI integration, tests, generated fixtures, and approval bundles
3. The canonical narration and normalized metadata for:
   - Napoleon’s Invasion of Russia
   - Fall of the Roman Empire
   - Black Death
4. Existing V1, V2, and V3 contracts and compatibility behavior

Do not silently replace the review report’s requirements with a narrower interpretation.

## Mission

Implement **History Approval Packs V3.2** so that the three target episodes become structurally trustworthy, semantically defensible, provenance-aware, editorially useful, independently reproducible approval packs.

V3.2 must solve every P0 blocker and every P1 quality defect in the V3.1 rejection report. It must prevent the same defect classes from recurring in future History episodes.

Do not merely patch the three generated JSON files. Correct the underlying contracts, generation logic, validators, approval policy, reporting, and tests, then regenerate from canonical inputs.

## Mandatory scope rules

### History-first isolation

Default behavior changes to History-specific packages, History rendering/planning packages, History-specific schemas, and History CLI/workflow integration.

Changes to shared packages must be:

- additive;
- backwards compatible;
- opt-in for the History V3.2 profile;
- covered by characterization tests for Dark Truth/horror, Math Education, Veronica Benini, and other existing genres affected by the shared code path.

Preserve existing defaults and artifacts for non-History genres. Never invalidate, migrate, or regenerate unrelated episodes.

### Versioning

- Introduce versioned V3.2 schema/planner/output identifiers.
- Preserve V1, V2, V3, and V3.1 artifacts and readers unless an existing compatibility policy explicitly permits removal.
- Do not mutate historical bundles in place.
- Provide deterministic migration or compatibility handling where shared readers consume multiple versions.

### No false authority

- Never invent source IDs, source locators, quotations, URLs, page numbers, dates, or publishers.
- An LLM may propose claim-to-source candidates only from an explicit source registry and retrieved evidence passages.
- An LLM must not authoritatively assign `sourceStatus`, approval eligibility, hash validity, or semantic-lint validity.
- Compute authoritative statuses deterministically from validated evidence and recorded human decisions.

### No false-green reporting

No manifest, lint file, CLI output, comparison report, or approval surface may appear green while material blockers remain.

### No premature regeneration

Do not regenerate approval bundles until implementation and focused validations for the relevant milestones pass.

### Evidence over assertion

Do not call a failing test “unrelated” without reproducible baseline evidence. Do not claim a check passed unless the command was run successfully in the current repository state or an immutable CI artifact proves it.

## Required durable working artifacts

Create or update repository-conventional equivalents of:

```text
docs/history-v3.2/PLAN.md
docs/history-v3.2/STATUS.md
docs/history-v3.2/DECISIONS.md
docs/history-v3.2/VERIFICATION.md
```

Requirements:

- `PLAN.md`: milestones, affected surfaces, acceptance checks, validation commands, and dependencies.
- `STATUS.md`: current milestone, completed work, remaining work, failures, and next action.
- `DECISIONS.md`: non-trivial architecture/policy decisions, options considered, and rationale.
- `VERIFICATION.md`: exact commands, results, commit SHA, generated artifact hashes, and known limitations.

Update these continuously. They are the source of truth if the session is resumed.

## Required architecture and behavior

### 1. Establish the regression baseline

Before broad implementation changes:

1. Locate the reported Math Education characterization failure.
2. Run it against the current state.
3. Determine whether it exists on the pre-V3/V3.1 baseline using repository history or a safe worktree/checkpoint.
4. Record commit SHAs, commands, output, and dependency relationships.
5. Either fix the regression or formally baseline it with reproducible evidence.
6. Add/retain characterization coverage proving V3.2 does not alter unrelated genre behavior.

A statement that the failure is unrelated is insufficient.

### 2. Correct narration timing truthfulness

Replace sentence-additive duration estimation with a total-duration model:

- derive base speech duration from normalized spoken words/tokens and configured WPM;
- add only bounded punctuation and chapter/paragraph pauses;
- prevent sentence count from inflating total duration materially;
- distribute the computed total across narration units and rebalance exactly;
- maintain contiguous beat/shot timelines ending at the total planned duration;
- treat immutable measured TTS/audio duration as production truth;
- treat provisional estimates as editorial planning inputs, not final production proof.

Add explicit timing-source metadata such as:

```ts
type NarrationTimingSource =
  | 'provisional-word-estimate'
  | 'measured-tts-audio';
```

Separate at least:

- structurally reviewable;
- editorially reviewable;
- content approval eligible;
- production approval eligible.

Use configurable absolute and relative tolerances. A small provisional difference such as approximately 19 seconds may be a warning; major differences such as the V3.1 Napoleon and Fall of Rome estimates must block approval.

Add tests demonstrating near-equivalent total duration when identical narration is segmented into few versus many sentences.

### 3. Implement claim-level provenance

Introduce or complete typed, versioned contracts for:

- source registry entries;
- source locators;
- content snapshots/hashes where available;
- claim materiality;
- claim-to-source links;
- support relationship (`direct`, `strong-entailment`, `contextual`, `contradicting` or equivalent);
- candidate versus verified link state;
- deterministic `sourceStatus` derivation;
- audited human overrides.

Classify claims at least across these concerns:

- material factual;
- chronological;
- quantitative;
- causal;
- disputed;
- geographic;
- map-driving;
- diagram-driving;
- quotation;
- non-material editorial connective text.

Every material claim used by a map, diagram, quotation, quantitative graphic, or factual visual must have validated provenance before content approval eligibility.

Unresolved material claims must block approval unless an explicit human override records:

- reviewer identity;
- timestamp;
- reason;
- decision;
- prior status;
- narration hash;
- plan hash.

Candidate sources existing at episode level are not claim provenance.

Use OpenAI only as a constrained candidate matcher/entailment assistant over known source IDs and retrieved passages. Validate all IDs and locators deterministically. Never let model confidence alone produce `supported` status.

### 4. Enforce evidence-bound diagram semantics

A diagram may be emitted only when every node and edge has claim-level support.

- Bind entities and claims per node and per edge.
- Never attach a broad union of entities to every node.
- Require each edge to cite at least one claim that explicitly states or strongly entails the relationship.
- Reject weakly fitting generic templates.
- Fall back to a map, timeline, archival visual, quotation, comparison, or no diagram.
- Unsupported or ambiguous diagram relationships must block approval.

Add semantic tests reproducing the false/generic V3.1 relationship classes described in the review report.

### 5. Correct typed map semantics

Model route semantics explicitly, including distinct roles for:

- carrier/vehicle;
- moving actor;
- pathogen or transmitted condition;
- affected region/place;
- origin and destination;
- route type.

Validate at least:

- route label versus route type;
- maritime versus overland contradictions;
- geographically renderable endpoints;
- unsupported or overly broad endpoints;
- coordinates/place resolution;
- actor/carrier/pathogen role conflicts;
- whether the linked claim actually expresses movement;
- origin/destination identity errors.

Correct the Black Death maritime-trade/“Overland trade connection” defect class through the generator and validator, not a fixture-only patch.

### 6. Improve editorial specificity

Generate a structured visual-purpose representation before rendering prose. Capture at least:

- editorial function;
- concrete subject;
- evidence shown;
- change, comparison, mechanism, or uncertainty;
- supporting claims.

Measure and report:

- normalized exact duplicates;
- template-prefix concentration;
- semantic similarity clusters;
- repeated editorial-function/subject combinations;
- repeated camera and transition instructions.

Introduce configurable quality thresholds. Calibrate them against existing episodes, but do not permit the V3.1 repetition levels to be reported as `genericPurposeRate: 0` or equivalent success.

### 7. Model intentional shot treatments

Represent derived treatments explicitly, such as:

- full frame;
- detail crop;
- annotated overlay;
- route reveal;
- parallax layer;
- evidence highlight;
- comparison state;
- before/after state;
- independent render.

Generate camera and transition direction from media type, claim function, treatment, and aspect ratio. Asset reuse is acceptable only when reuse is explicit and treatments are materially distinct.

Do not suppress duplicate-asset warnings when the resulting treatments are effectively identical.

### 8. Make aspect-ratio plans production-specific

For 16:9 and 9:16, record and validate beat-specific:

- protected subjects;
- protected labels;
- focal evidence;
- title/subtitle safe zones;
- text-density limits;
- minimum label sizes;
- conflicts requiring independent portrait rendering.

Add render-contract tests for portrait map labels and diagram nodes.

### 9. Repair approval and status surfaces

The comparison manifest and CLI/reporting surfaces must include:

- reviewability states;
- content and production approval eligibility;
- blocker codes/counts;
- warning counts grouped by code;
- timing source, target, planned/measured duration, and delta;
- total/material/supported/unresolved/disputed claim counts;
- structural lint status;
- semantic lint status;
- editorial-quality status.

Deduplicate repeated warning arrays into `{code, count}` or equivalent summaries.

Clearly separate structural validity from semantic validity, editorial quality, and approval policy.

### 10. Make narration binding independently reproducible

Include explicit:

- `canonicalScriptSha256`;
- `normalizedNarrationSha256`;
- normalization algorithm identifier/version;
- documented narration-revision derivation.

Bundle generation and verification must independently recompute and validate these hashes.

## Milestone execution order

Follow this order unless repository evidence proves a dependency requires a minor adjustment. Record any adjustment in `DECISIONS.md`.

### Milestone 0 — Discovery and baseline

- Map packages, schemas, planners, validators, CLI commands, output writers, fixtures, and tests.
- Capture current failing/passing baseline.
- Establish regression evidence.
- Write the detailed plan and affected-file map.

### Milestone 1 — V3.2 contracts and approval policy

- Add versioned contracts and compatibility readers.
- Separate review/content/production approval states.
- Add claim materiality, provenance, override, map-role, diagram-support, composition, diagnostics, and narration-binding contracts.
- Add serialization/schema tests.

### Milestone 2 — Timing engine

- Implement total-duration estimation and exact allocation.
- Add bounded pause policy and timing-source handling.
- Add tolerance/approval logic and tests.

### Milestone 3 — Provenance pipeline

- Implement source registry and locator validation.
- Implement candidate-link stage and deterministic status derivation.
- Implement materiality gates and overrides.
- Link material claims in the three target episodes through reproducible research inputs; do not fabricate evidence.

### Milestone 4 — Diagram and map semantics

- Implement per-node/per-edge evidence binding.
- Implement diagram rejection/fallback.
- Implement typed map roles and route validators.
- Add regression tests for review-report examples.

### Milestone 5 — Editorial, shot, and composition quality

- Implement structured visual purpose.
- Add repetition metrics and thresholds.
- Add explicit shot treatments and differentiated direction.
- Add beat-specific 16:9/9:16 composition contracts and tests.

### Milestone 6 — Status surfaces and reproducible hashes

- Repair manifests/lint/CLI summaries.
- Add grouped diagnostics.
- Add narration hashes and independent verification.
- Ensure no false-green combinations are serializable.

### Milestone 7 — Full verification and regeneration

Only after prior focused validations pass:

- run relevant build, typecheck, lint, focused tests, characterization tests, and the full relevant suite;
- regenerate all three V3.2 plans and review packs from canonical inputs;
- produce individual and combined ZIPs;
- validate checksums, redaction, no secrets/local paths/symlinks/media binaries, schemas, references, timelines, hashes, deterministic regeneration, and approval policy;
- generate comparison and verification reports.

## Stop-and-fix rules

- If a milestone validation fails, fix it before proceeding.
- Do not hide, downgrade, delete, or reclassify a diagnostic merely to make a pack eligible.
- Do not broaden scope to unrelated architectural cleanup.
- Do not add production dependencies without demonstrating necessity and compatibility.
- If external source access is unavailable, implement the provenance machinery and leave affected material claims explicitly blocking; never fabricate completion.
- If measured TTS/audio is unavailable, production approval must remain explicitly provisional/ineligible.

## Required tests

At minimum, add or update tests for:

1. identical narration with low versus high sentence counts produces nearly identical total estimates;
2. bounded punctuation/chapter pauses;
3. exact narration-unit allocation sum;
4. measured audio supersedes estimates;
5. small provisional timing delta warning versus large conflict blocker;
6. unresolved material provenance blocks approval;
7. non-material unresolved connective claims do not necessarily block;
8. invalid source IDs/locators are rejected;
9. model candidate output cannot set authoritative status;
10. human override audit fields and hash binding;
11. unsupported diagram nodes/edges reject the diagram;
12. per-node/per-edge entity/claim binding;
13. maritime/overland label contradictions;
14. carrier/actor/pathogen separation;
15. broad/unrenderable map endpoints;
16. exact and semantic visual-purpose repetition metrics;
17. materially distinct versus effectively identical asset reuse;
18. 9:16 text density, label size, and protected-subject constraints;
19. false-green manifest combinations are impossible;
20. canonical/normalized narration hash recomputation;
21. deterministic regeneration;
22. non-History characterization and compatibility.

## V3.2 acceptance gate

Do not declare success unless all of the following are evidenced:

1. All three bundles are structurally reviewable.
2. Approval eligibility reflects timing and provenance policy separately.
3. Timing estimates are consistent with configured pace.
4. No unresolved `NARRATION_DURATION_CONFLICT` remains unless an intentional script/target change is recorded.
5. Measured audio is attached for production approval, or production approval remains explicitly provisional/ineligible.
6. Every material claim used by maps, diagrams, quotations, quantitative graphics, or factual visuals has validated provenance or an audited override.
7. No generic diagram exists without claim-supported nodes and edges.
8. No route-label/route-type contradiction exists.
9. Visual-purpose and shot-direction repetition is under explicit, reported thresholds.
10. Comparison/status surfaces present approval blockers and counts, not only lint validity.
11. Narration hashes are independently reproducible.
12. Focused tests pass.
13. The Math failure is fixed or reproducibly baselined.
14. The full relevant suite passes, or any remaining known baseline failures are explicitly evidenced and do not arise from this change.
15. Individual and combined ZIPs pass checksum, redaction, reference-integrity, schema, timeline, and deterministic-regeneration checks.
16. No non-History defaults or artifacts are unintentionally changed.

## Final response requirements

Provide a concise implementation report containing:

- architecture and policy changes;
- key files changed;
- decisions and tradeoffs;
- exact validation commands and results;
- regression-baseline conclusion;
- per-episode timing/provenance/approval summary;
- generated artifact paths and SHA-256 hashes;
- remaining limitations;
- explicit final verdict: production approval eligible or not.

Never claim production readiness when measured audio or material provenance remains unresolved.
