# History Approval Packs V3.2 Remediation Plan

## Objective

Deliver History-only, opt-in V3.2 approval packs for Napoleon's Invasion of
Russia, Fall of the Roman Empire, and Black Death. V3.2 must make timing,
provenance, visual semantics, editorial quality, status, and package integrity
independently reproducible without changing V1-V3.1 behavior or unrelated
genres.

Authoritative inputs:

- `prompts/history-v3.2-remediation/01-history-v3.2-master-goal.md`
- `prompts/history-v3.2-remediation/references/history-approval-packs-v3.1-review-report.md`
- Current History source, contracts, tests, canonical episode inputs, and V3.1
  review artifacts

## Fixed Decisions

- Preserve V1-V3.1 contracts, readers, defaults, and generated artifacts.
- Add V3.2 as an explicit History planner/bundle version.
- Retain the current canonical scripts. Update their truthful word and duration
  metadata; classify Napoleon and Rome as History `long` episodes and Black
  Death as `standard`.
- Keep changes History-specific. Shared changes must be additive, opt-in, and
  covered by non-History characterization tests.
- Formally baseline the pre-existing Math Education task-order failure. Do not
  change Math production behavior as part of this remediation.
- Never infer human verification or source authority. Candidate evidence cannot
  make a claim supported or content-approval eligible.
- Regenerate V3.2 packs only after Milestones 0-6 pass their focused gates.

## Milestone 0 - Control Plane and Regression Baseline

Deliverables:

- Create `PLAN.md`, `STATUS.md`, `DECISIONS.md`, and `VERIFICATION.md`.
- Record current/pre-V3 commit SHAs and exact Math reproduction evidence.
- Record the focused V3.1 baseline and current canonical input discrepancies.
- Inventory applicable code, tests, canonical roots, and generated bundles.

Validation:

```bash
pnpm test:focused -- packages/math-education/src/task-registry.unit.test.ts
pnpm test:focused -- packages/history/src/history-semantic-v31.unit.test.ts packages/history/src/history-editorial-v31.unit.test.ts packages/history/src/history-geo-v31.unit.test.ts packages/history/src/visual-planner-v31.unit.test.ts packages/history/src/history-review-bundle-v31.unit.test.ts apps/cli/src/history-commands.unit.test.ts
```

Run the Math command against commit `2655c9e6e1471bca88ec0dc649fbf3a647c5ee89`
from an isolated temporary archive using the same installed dependencies.

Stop gate: do not edit production code until the control documents and baseline
evidence exist. Stop if canonical roots or the baseline cannot be reproduced.

## Milestone 1 - Versioned Contracts and Compatibility

Deliverables:

- Add strict V3.2 contracts for narration identity, timing, provenance, visual
  semantics, ratio treatments, approval states, diagnostics, and manifests.
- Add V3.2 exports/readers and explicit CLI dispatch without changing defaults.
- Define independent structural, editorial, content, and production states.
- Preserve all legacy fixtures and readers.

Validation:

```bash
pnpm test:focused -- packages/history/src/history-v32-contracts.unit.test.ts
pnpm test:focused -- apps/cli/src/history-commands.unit.test.ts -t "V3.2"
pnpm --filter @mediaforge/history typecheck
```

Stop gate: any legacy reader, fixture, output identifier, or default CLI behavior
changes unexpectedly.

## Milestone 2 - Canonical Narration and Timing Truth

Deliverables:

- Add raw-script and normalized-narration hashes plus a versioned reproducible
  revision algorithm.
- Estimate total speech from normalized words at 108 WPM, add bounded pauses,
  and allocate the exact total across units, beats, and shots.
- Support `provisional-word-estimate` and immutable `measured-tts-audio`; require
  measured audio for production eligibility.
- Use pass tolerance `max(5s, 1%)`, warning tolerance `max(60s, 10%)`, and block
  larger deltas.
- Correct content-pack metadata and the importer no-op identity rule so changing
  three entries does not revise the other seven episodes.
- Import only the three target episodes and invalidate their derived tasks; do
  not generate V3.2 plans or approval packs yet.

Timing policy:

- Clause pause: 60 ms; terminal pause: 120 ms; paragraph pause: 250 ms;
  chapter pause: 500 ms.
- Punctuation pause cap: `min(15s, 1.5% of base speech)`.
- Paragraph pause cap: `min(12s, 1.5% of base speech)`.
- Chapter pause cap: `min(6s, 1% of base speech)`.
- Largest-remainder allocation must end exactly at the declared duration.

Canonical metadata:

- Napoleon: 1,411 spoken words, target 13.1 minutes, `long`.
- Fall of Rome: 1,860 spoken words, target 17.2 minutes, `long`.
- Black Death: 1,117 spoken words, target 10.3 minutes, `standard`.
- History `long` bounds: 12-20 minutes and 1,300-2,200 words. Existing
  `standard` bounds remain unchanged.

Validation:

```bash
pnpm test:focused -- packages/history/src/history-timing-v32.unit.test.ts
pnpm test:focused -- packages/history/src/content-pack.unit.test.ts -t "duration metadata|no-op"
pnpm --filter @mediaforge/history typecheck
```

Stop gate: unrelated episode mutation, segment-count duration inflation,
non-contiguous timelines, or any allocation mismatch.

## Milestone 3 - Claim-Level Provenance

Deliverables:

- Add versioned source registries, typed locators, evidence hashes, claim
  materiality/concerns, candidate and verified links, and deterministic statuses.
- Treat direct and strong-entailment verified links as supporting evidence;
  contextual and contradicting links remain visible but cannot silently support.
- Add audited overrides bound to reviewer, timestamp, reason, prior status,
  decision, narration hash, and plan hash; stale overrides block.
- Preserve existing episode sources as candidates unless real evidence and a
  human verification record exist.

Validation:

```bash
pnpm test:focused -- packages/history/src/history-provenance-v32.unit.test.ts
pnpm test:focused -- packages/history/src/visual-planner-v32.unit.test.ts -t "provenance"
pnpm --filter @mediaforge/history typecheck
```

Stop gate: invented metadata, dangling locators, model-authored authority, stale
override acceptance, or unresolved material claims becoming eligible.

## Milestone 4 - Evidence-Bound Diagrams and Typed Maps

Deliverables:

- Bind diagram nodes and edges to their own entities, claims, and verified
  evidence links; reject unsupported or weak generic templates.
- Add deterministic fallback to map, timeline, archival evidence, quotation,
  comparison, or no diagram.
- Model map origin, destination, carrier, moving actor, pathogen, affected
  region, route type, label, coordinates, and movement claim separately.
- Prevent the Black Death maritime/overland contradiction and identity/broad
  endpoint defects at generation and validation time.

Validation:

```bash
pnpm test:focused -- packages/history/src/history-geo-v32.unit.test.ts
pnpm test:focused -- packages/history/src/history-semantic-v32.unit.test.ts -t "diagram|map"
pnpm --filter @mediaforge/history typecheck
```

Stop gate: any unsupported edge, role conflict, unrenderable endpoint, identity
route, or route type/label contradiction survives validation.

## Milestone 5 - Editorial, Shot, and Ratio Quality

Deliverables:

- Generate structured purposes containing editorial function, concrete subject,
  evidence, change/comparison/mechanism/uncertainty, and supporting claims.
- Measure exact duplicates, five-token prefixes, token-bigram cosine clusters,
  repeated function/subject pairs, cameras, and transitions.
- Represent explicit shot treatments and require materially different treatment
  when reusing an asset.
- Add beat-specific 16:9 and 9:16 protected subjects, labels, focal evidence,
  safe zones, density, size, and independent-render conflicts.

Thresholds:

- Exact purpose duplicates: warn above 5%, block above 15%.
- Prefix concentration: warn above 10%, block above 20%.
- Cosine cluster at similarity 0.78 or higher: warn above 15%, block above 30%.
- Dominant camera/transition instruction: warn above 20%, block above 35%.
- Maximum labels: 12 landscape, 8 portrait; portrait diagram nodes: 5.
- Minimum label sizes: 28 px landscape, 32 px portrait; maximum label length:
  48 characters; reserve top/bottom 10% title-safe zones.

Validation:

```bash
pnpm test:focused -- packages/history/src/history-editorial-v32.unit.test.ts
pnpm test:focused -- packages/history/src/history-ratio-v32.unit.test.ts
pnpm --filter @mediaforge/history typecheck
```

Stop gate: V3.1 repetition reports green, effectively identical reused shots are
accepted, or either ratio lacks a production-specific contract.

## Milestone 6 - Status, CLI, Bundles, and Integrity

Deliverables:

- Implement V3.2 plan, individual/combined review-bundle, verification, and
  scoped approval CLI surfaces.
- Report grouped blocker/warning counts, all four approval axes, timing truth,
  provenance counts, and reproducible narration/plan hashes everywhere.
- Package sorted entries with fixed build epoch, normalized metadata, complete
  SHA-256 manifest, no symlinks, no binaries, and no secret/local-path leakage.

Validation:

```bash
pnpm test:focused -- packages/history/src/history-review-bundle-v32.unit.test.ts
pnpm test:focused -- apps/cli/src/history-commands.unit.test.ts -t "V3.2"
pnpm --filter @mediaforge/history typecheck
```

Stop gate: false-green output, incomplete checksum coverage, unrecomputable
hashes, unsafe archive entries, or nondeterministic same-epoch output.

## Milestone 7 - Controlled Regeneration and Acceptance

Prerequisite: all Milestones 0-6 gates pass. Then generate only the three target
V3.2 plans, individual bundles, combined review pack, and ZIPs. Build each twice
under the same fixed epoch and compare every manifest/file/ZIP hash.

Final validation:

```bash
pnpm test:focused -- packages/history/src/history-semantic-v31.unit.test.ts packages/history/src/history-editorial-v31.unit.test.ts packages/history/src/history-geo-v31.unit.test.ts packages/history/src/visual-planner-v31.unit.test.ts packages/history/src/history-review-bundle-v31.unit.test.ts apps/cli/src/history-commands.unit.test.ts
pnpm test:focused -- packages/dark-truth/src/canonical-task-composition.unit.test.ts packages/strategic-reinvention/src/profile.unit.test.ts packages/dynamic-genre/src/base-profiles.unit.test.ts
pnpm test:focused -- packages/math-education/src/task-registry.unit.test.ts
```

Also run affected-package typechecks, focused ESLint on changed source files, the
V3.2 bundle verifier, `unzip -t`, SHA-256 verification, reference-integrity and
redaction checks.

Acceptance requires reproducible evidence in `VERIFICATION.md`. Structural and
editorial reviewability may pass while content remains blocked for missing human
provenance and production remains blocked for missing measured audio. Such a
truthful blocked result is valid; a false-green result is not.
