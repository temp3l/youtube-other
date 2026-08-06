# Phase Goal — Regenerate and Verify History Approval Packs V3.2

## Context

Read:

- `01-history-v3.2-master-goal.md`
- `references/history-approval-packs-v3.1-review-report.md`
- all current V3.2 plan/status/decision/verification artifacts
- completed implementation and tests from prior phases

## Objective

Run the full relevant verification suite, regenerate all three approval packs from canonical inputs, package individual and combined review ZIPs, and produce independently reproducible evidence.

Do not patch generated files manually.

## Pre-regeneration gate

Before generation, prove that:

- V3.2 contracts compile and compatibility tests pass;
- timing tests pass;
- provenance tests pass;
- map/diagram semantic tests pass;
- editorial/shot/composition tests pass;
- status/hash tests pass;
- the Math characterization issue is fixed or reproducibly baselined;
- affected non-History characterization tests pass;
- no known focused blocker remains.

If any gate fails, stop generation and repair it.

## Required target episodes

Regenerate from canonical episode roots for:

1. Napoleon’s Invasion of Russia
2. Fall of the Roman Empire
3. Black Death

Use canonical scripts and normalized metadata from the repository. Do not use hand-edited generated plans as inputs.

## Required outputs

Produce repository-conventional equivalents of:

- V3.2 plan JSON and review views per episode;
- validation and grouped diagnostic reports;
- artifact lint reports with explicitly scoped validity;
- per-episode comparison/approval summaries;
- individual redacted review ZIPs;
- combined redacted review ZIP;
- deterministic checksum manifests;
- combined comparison manifest exposing real approval states;
- final verification report.

Preserve V1/V2/V3/V3.1 outputs unless repository policy explicitly replaces generated snapshots in a versioned fixture location.

## Test and verification sequence

Run and record exact commands for:

1. dependency/install integrity if needed;
2. build;
3. TypeScript typecheck;
4. focused lint;
5. focused V3.2 unit/integration tests;
6. relevant package tests;
7. non-History characterization tests;
8. full relevant repository suite;
9. generation of each episode;
10. individual ZIP generation;
11. combined ZIP generation;
12. checksum verification;
13. schema/JSON parse verification;
14. reference-integrity verification;
15. narration-unit, beat, and shot coverage;
16. contiguous timeline and exact-end verification;
17. redaction/no-secret/no-local-path/no-symlink/no-binary checks;
18. narration hash recomputation;
19. provenance count and locator validation;
20. diagram/map semantic validation;
21. repetition and ratio-contract validation;
22. deterministic regeneration in a clean output directory or worktree;
23. byte/hash comparison according to the repository’s determinism contract.

## Per-episode acceptance report

For each episode report:

- canonical word/spoken-token count;
- target duration;
- timing source;
- base speech duration;
- bounded pauses;
- total planned/measured duration;
- delta and severity;
- total claims;
- material claims;
- supported, candidate, unresolved, disputed, and overridden counts;
- maps/diagrams emitted and rejected/fallback counts;
- visual-purpose duplication/semantic-cluster metrics;
- camera/transition repetition metrics;
- 16:9 and 9:16 contract results;
- blocker and warning summaries;
- structural/editorial/content/production approval states;
- canonical and normalized narration hashes;
- artifact paths and SHA-256 hashes.

## Approval interpretation

- `reviewable: true` is not synonymous with production approval.
- If measured audio is absent, production approval must remain provisional/ineligible.
- If any material visual-driving claim is unresolved without override, content approval must remain ineligible.
- Do not suppress legitimate warnings or blockers to satisfy a target state.

A valid final result may remain not production-eligible when the evidence genuinely does not support eligibility. Truthful blocking is preferable to false approval.

## Completion gate

Complete only when:

- all required commands have recorded outcomes;
- all three bundles and the combined ZIP exist;
- checksums and deterministic regeneration pass;
- no false-green status exists;
- final approval states match timing/provenance facts;
- `VERIFICATION.md` contains the commit SHA, commands, results, artifact hashes, and remaining limitations.

Provide a concise final release-style report and explicit verdict.
