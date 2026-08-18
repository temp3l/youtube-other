# Veronica Systemic Remediation M2

Status: planning-only; implementation has not begun.

## Verified baseline

The authoritative M1 final review pack is `artifacts/veronica-systemic-remediation-m1-final/2026-08-18T00-20-00Z/veronica-systemic-remediation-m1-final-review-2026-08-18T00-20-00Z`.

The exact 48 canonical variants changed from V2 `0 PASS / 27 BLOCK / 0 REVIEW / 21 ERROR` to post-M1 `0 PASS / 19 BLOCK / 0 REVIEW / 29 ERROR`. Post-M1 root-cause counts are: `MECHANISM_REPETITION` 18, `OPENING_ACTION_NOVELTY_LOW` 17, `OPENING_NOVELTY_LOW` 13, `ADJACENT_VISUAL_DUPLICATION` 10, `LOW_INFORMATION_GAIN` 5, `ACTION_MONOTONY` 3, `CAUSE_CONSEQUENCE_EVIDENCE_INCOMPLETE` 2, and `ACTOR_OWNERSHIP_INVERSION` 3.

M1 controls remain invariants: eight missing/null-plan cases rederive; no unauthorized professional, unsupported treatment entity/environment, occupation proxy drift, internal remediation leakage, generic fallback scene, prompt overflow, semantic-hash nondeterminism, or accepted-artifact overwrite is permitted. `PACK1_CONTENT_TIMING_MIGRATION_REQUIRED` remains deferred.

## Current architecture and root causes

Current short-form flow is:

```text
Finalized semantic scene/treatment
  -> automaticSceneBeats (`veronica-visual-beats.ts`)
  -> raw validation (`validateVeronicaVisualBeatPlan`)
  -> post-hoc refinement (`diversifyVeronicaVisualBeatSequence`)
  -> materialization (`materializeVeronicaVisualBeatPlan`)
  -> prompt compilation/readiness
```

`automaticSceneBeats` creates one projected treatment per narration chunk, retaining the same action, mechanism, state, environment, and composition. `diversifyVeronicaVisualBeatSequence` then tries local replacement candidates and presentation variants in at most two passes. It has no typed candidate set, no opening-specific candidate selection, and no source-derived information-delta model. The quality validators therefore correctly expose planner limitations; thresholds must not change.

`analyzeVeronicaSequenceDiversity` owns the seven primary sequence findings. The beat validator owns causal completeness using `assessVeronicaRemovalConsequenceEvidence`. M2 must retain these validators and improve their upstream producers.

Current final-status behavior is also incorrect: `materializeVeronicaVisualBeatPlan` throws the plain error `VERONICA_VISUAL_BEAT_QUALITY_FAILED:*`; `VeronicaProviderPromptSemanticBlockerError` has findings but no `outcome`. The corpus runner in `scripts/veronica-zero-cost-preproduction-census.ts` classifies only errors with `outcome === "BLOCK"` as `BLOCK`; other expected deterministic findings become `ERROR`.

## M2 work packages

### WP-A — Deterministic outcome/status normalization

Introduce one authoritative typed deterministic-failure classifier at the preparation/corpus boundary. Known quality, ownership, unsupported-encoding, and mandatory-budget failures become `BLOCK`; explicitly typed editorial ambiguity becomes `REVIEW`; unexpected exceptions, trusted-state corruption, schema violations, and I/O failures remain `ERROR`. Preserve code, stage, affected beat IDs, evidence, root cause, retryability, and paid-stage eligibility. No `BLOCK` or `REVIEW` is paid-provider eligible.

Add `outcome: "BLOCK"` and structured findings to a new beat-quality error and to `VeronicaProviderPromptSemanticBlockerError`; update the census to use the classifier rather than exception shape. Characterize one known quality failure as `ERROR -> BLOCK` and one unknown exception as remaining `ERROR`.

### WP-B — Derived candidate contract

Extend the visual-beat contract with immutable, derived candidates: stable candidate ID, source span, action family, mechanism, environment family, composition family, evidence category, actor roles, state relation, visible information delta, causal completeness, opening suitability, and hard-gate result. These are derived from finalized M1 semantics, treatment, and evidence spans; they are not a second semantic authority.

Keep existing action and mechanism taxonomies initially. `UNRESOLVED` may be temporary but is ineligible for final selection where a mechanism is required; it must never be fabricated merely to improve diversity.

### WP-C — Sequence-aware selection

Replace default-then-repair with candidate generation followed by bounded deterministic selection. Generate at most six source-compatible candidates per beat. Hard-gate source grounding, semantic fidelity, actor authorization, polarity/state fidelity, source-authorized environment, and required causal evidence.

Use a beam width of four over a rolling five-beat window. Lexicographically minimize blocker/review findings, then maximize visible information gain, adjacent action/mechanism diversity, opening novelty, composition diversity, and causal completeness. Tie-break by candidate ID, source-span order, and stable hash. Do not use random values, timestamps, or unstable iteration.

Keep post-selection diversification only for neutral composition/camera changes; it may not change actor, action family, mechanism, state, source span, or environment authorization.

### WP-D — Opening and information gain

Select the first-beat candidate as part of sequence planning. Score only the local episode opening grammar across 5/10/15 seconds; do not introduce cross-episode coupling. Define information gain from source-span, proposition/state, causal-relation, or evidence deltas—not lexical novelty. Merge adjacent beats only when no visible delta exists and merging preserves canonical timing; otherwise retain a truthful `BLOCK`.

### WP-E — Causal evidence and residual ownership

Consume finalized causal relation/operator data rather than re-inferring prose. A removal/enablement candidate must visibly encode the obstacle/cause, the enabled buyer action, and their connection in one source-bound frame.

Fix the residual ownership exposures `p1-long-l03`, `p1-long-l06`, and `p1-short-l05-s03` producer-side. Review `actorAssignmentsForScene`, `projectVeronicaProviderPrompt`, and final asset/reference projection so buyer/observer-owned scenes cannot inherit canonical-protagonist identity/reference language. Preserve the ownership validator.

### WP-F — Provenance and proof

Version only the beat planner and diversity policy. Preserve semantic authority. Invalidate beat plans; conditionally invalidate provider projection, prompt, and readiness only when selected beat output changes. Preserve historical QA and image/render identity otherwise. Add machine-readable candidate-score diagnostics.

Run Tier 1 contracts, Tier 2 representative integration, then the exact same guarded 48 variants. Report status-normalization changes separately from removed root causes, detection exposure, and regressions.

## Representative fixtures and regression tests

Use the smallest real subset: `p1-short-l03-s03` (duplication, low gain, monotony, repetition, opening); `p2-short-03b` (causal incompleteness and opening repetition); `p2-short-04a` (causal incompleteness and duplication); the three ownership cases; one quality-status case; and one unexpected-error case. Assert semantic and sequence properties, not broad snapshots.

Tier 1 covers candidate gates, score/tie determinism, causal completeness, status mapping, and ownership. Tier 2 uses the listed corpus fixtures. Tier 3 runs the exact 48 IDs with the existing fail-closed provider guard.

## Dependency and acceptance

`WP-A -> WP-F`; `WP-B -> WP-C -> WP-D/WP-E -> WP-F`. WP-A is independently testable and must not hide infrastructure errors.

M2 succeeds only if provider dispatch remains zero during deterministic proof; expected quality outcomes no longer become infrastructure `ERROR`; unexpected errors remain `ERROR`; root-cause counts materially decline without validator weakening; no ownership inversion or M1 regression is introduced; and all 48 canonical records complete.

## Future review pack and command plan

The implementation session must create `veronica-systemic-remediation-m2-planning-review-<timestamp>.zip`, including the requested architecture, ownership/status matrices, candidate and scoring designs, fixture matrix, DAG, cache plan, risk/decision registers, implementation handoff, zero-provider proof, and SHA-256 manifest. It must install the existing fail-closed guard before any provider-capable import and record zero dispatches/prevented attempts.

Recommended later commands are targeted Vitest for visual beats, sequence diversity, prompt compiler, and production adapter; scoped typecheck/lint; guarded Tier 2; guarded 48-case corpus; and review-pack hash/ZIP validation. Do not run broad verification by default.

## Risks and decisions

The primary risks are semantic drift from diversity optimization, non-deterministic ties, reintroduced unauthorized actors/environments, taxonomy comparability loss, broad invalidation, and status normalization masking true errors. Hard gates precede scoring; stable hashes resolve ties; taxonomies remain unchanged absent fixture evidence; and the single outcome classifier preserves raw evidence. No human decision is currently required.

