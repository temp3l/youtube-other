# Independent Review — History Approval Packs V3.2

## Reviewer role

Act as an independent principal reviewer for TypeScript architecture, historical provenance, deterministic media pipelines, editorial planning, and production approval controls.

Review only. Do not modify the repository, generated artifacts, tests, or manifests.

Do not trust implementation summaries. Derive findings from repository code, tests, commands, and generated bundles.

## Inputs

Read:

- `01-history-v3.2-master-goal.md`
- `references/history-approval-packs-v3.1-review-report.md`
- V3.2 plan/status/decision/verification artifacts
- the implementation diff or target commit
- all three individual V3.2 review ZIPs
- the combined V3.2 review ZIP and comparison manifest
- canonical scripts and normalized metadata

## Review objective

Determine whether V3.2 actually resolves every V3.1 P0 blocker and P1 defect and whether the packs are safe for their declared approval state.

A structurally valid diagnostic export may pass reviewability while failing content or production approval. Preserve that distinction.

## Required independent checks

### Repository and regression

- Confirm the inspected commit SHA and clean/dirty state.
- Re-run relevant typecheck, lint, tests, and package verification.
- Inspect evidence for the Math characterization baseline; reject an unsupported “unrelated” classification.
- Confirm non-History behavior remains characterized and unchanged where required.

### Timing

- Independently recompute spoken word counts and WPM-based estimates.
- Verify pauses are bounded.
- Compare low- and high-sentence segmentation behavior.
- Verify narration-unit allocations sum exactly.
- Verify measured-audio status and immutable binding.
- Confirm production approval is impossible from provisional timing alone.

### Provenance

- Count total and material claims.
- Validate claim-source IDs and locators.
- Sample and inspect evidence for material, map-driving, diagram-driving, quantitative, causal, chronological, disputed, and quotation claims.
- Confirm candidate links are not treated as verified.
- Confirm authoritative statuses are deterministically derived.
- Inspect every override and verify reviewer, timestamp, reason, prior status, and narration/plan hashes.
- Confirm unresolved material claims block content approval.

### Diagrams

- Inspect every diagram.
- Verify every node and edge has specific supporting claims and entities.
- Confirm the linked claims entail labels and relationships.
- Confirm no broad entity union is copied to every node.
- Confirm weak templates are rejected and fallbacks are semantically appropriate.

### Maps

- Inspect route types, labels, endpoints, place resolution, carrier, actor, pathogen, and affected-region roles.
- Confirm no maritime/overland contradiction.
- Confirm no unsupported or unrenderable endpoints.
- Confirm linked claims express the rendered movement.

### Editorial quality

- Recompute normalized exact visual-purpose duplication.
- Inspect semantic repetition and template-prefix concentration.
- Inspect shot treatments, camera directions, transitions, and asset reuse.
- Confirm reuse is intentional and materially differentiated.
- Confirm reported metrics match actual data.

### Aspect ratios

- Inspect every 16:9 and 9:16 adaptation.
- Validate protected subjects/labels, focal evidence, safe zones, text density, minimum label size, and independent portrait renders.
- Reject generic policy metadata that does not define a production composition.

### Status surfaces

- Compare artifact lint, semantic validation, approval summaries, and combined manifest.
- Confirm scoped validity labels are not misleading.
- Confirm blockers/warnings are grouped and counts match raw diagnostics.
- Confirm no surface appears green while another contains approval blockers.

### Hashes and determinism

- Recompute canonical script and normalized narration SHA-256 values.
- Reproduce narration revision using the documented algorithm/version.
- Verify all ZIP/file checksums.
- Regenerate into a clean output directory/worktree and compare according to the determinism contract.
- Check redaction, binaries, local paths, secrets, and symlinks.

## Required acceptance criteria

The next bundle is acceptable only if:

1. all three are structurally reviewable;
2. content and production approval eligibility reflect timing and provenance truthfully;
3. configured pace and estimates are internally consistent;
4. no unresolved duration conflict remains without a documented intentional decision;
5. production approval has measured immutable audio;
6. every material visual-driving claim is supported or explicitly overridden;
7. every diagram node/edge is claim-supported;
8. maps contain no semantic contradictions;
9. repetition metrics are below documented thresholds and honestly reported;
10. ratio plans are production-specific;
11. status surfaces expose all blockers and counts;
12. narration binding is independently reproducible;
13. focused and relevant full suites pass or remaining baseline failures are independently proven pre-existing;
14. deterministic regeneration, integrity, and redaction checks pass;
15. unrelated genres remain unaffected.

## Output format

Write a review report with:

1. **Verdict**: `APPROVE`, `CONDITIONAL APPROVE`, or `REJECT`.
2. **Scope and inspected artifacts**.
3. **Acceptance summary table**.
4. **P0 blockers** with file/JSON pointer/test evidence.
5. **P1 defects** with evidence.
6. **Per-episode timing/provenance/approval table**.
7. **Regression and test evidence**.
8. **Integrity/determinism evidence**.
9. **Strengths to retain**.
10. **Exact required remediation**, if rejected.

Do not dilute a blocker because the implementation is materially improved. Do not approve final media generation when production approval remains provisional.
