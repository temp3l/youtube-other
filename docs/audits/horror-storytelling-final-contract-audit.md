# Horror Storytelling Final Contract Audit

Date: 2026-07-24
Scope: Tasks 01–08 of the research-informed horror storytelling plan

## Result

The source contracts support a fail-closed controlled rollout. The production
default remains `shadow`; no analytics import, human comparison, provider call,
publication, or rollout change occurred. V3 has a ready, zero-dispatch
candidate-generation preflight, but no production outcomes or decision.

## Contract Evidence

| Path                  | Source-backed finding                                                                                                                                                                                                                     | Status |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Canonical full        | `story-prompt-compiler.ts` builds the source-grounded plan in off/shadow/enforce modes; only valid enforce plans enter prompt and cache identity. `story-localization.service.ts` persists the canonical envelope before downstream work. | Pass   |
| Short                 | `short-horror-affect-projection.ts` projects one accepted causal chain. `short-rewrite.service.ts` reuses it in generation, persistence, resume, repair, and regeneration.                                                                | Pass   |
| Localized full        | `localization-horror-affect-projection.ts`, `localization-prompt-builder.ts`, and `localization-fidelity.ts` preserve semantic IDs and parent lineage without authorizing plot changes.                                                   | Pass   |
| Sync and batch        | `story-localization.service.ts` and `story-localization-batch-service.ts` use the same prompt/persistence contracts; focused Task 02/05 tests establish byte-equivalent planning and requests.                                            | Pass   |
| Resume and inspection | `horror-affect-plan.persistence.ts` classifies missing/current/stale/invalid artifacts; `story-workflow-command-helpers.ts` and `story-production-command.ts` expose status without provider work.                                        | Pass   |
| Cache/workflow        | `story-localization-cache.ts`, `story-workflow-batch.ts`, and `story-workflow-status.ts` preserve lineage, partial results, staleness, and dependency status. Shadow mode preserves narration identity.                                   | Pass   |
| Analysis V2           | `story-production-analysis.ts`, its service, and persistence module keep evidence-bearing V2 advisory and subordinate to deterministic failures.                                                                                          | Pass   |
| Repair                | `story-retry-routing.ts` and `story-quality-repair.ts` allow one evidence-bound local repair; architecture failures regenerate or block. Complete contracts rerun afterward.                                                              | Pass   |
| Cost/telemetry        | `story-localization.cost-tracker.ts`, `story-workflow-cost.ts`, and `story-request-telemetry.ts` retain existing bounded cost and redacted telemetry semantics. Evaluation adds no provider path.                                         | Pass   |
| Evaluation/rollout    | `horror-evaluation-rollout.ts` preregisters immutable inputs; binds zero-retry candidate generation to exact accepted lineage and aggregate/per-unit budgets before dispatch; immutably persists candidates and separate Full/Short blind artifacts; accepts only authorized aggregates; enforces all promotion gates; and emits configuration-only transitions. | Pass   |

## Residual Evidence Gaps

- Task 03 is synthetic and English-only. V3 replaces the non-regenerable v2
  Episode 034 unit with Episode 028 before outcome inspection. Its source-backed
  preflight is ready, but no strategy candidates or blind ratings exist.
- The v3 metric, threshold, cost ceiling, analytics authority, and default-mode
  authority are resolved; no production audience aggregate, v3 decision, or
  manifest-bound promotion approval exists.
- Production failure and stale-cache behavior remain unobserved, so promotion
  gates remain closed.

## Verification Addendum — 2026-07-25

The prior Task 04 residual gap is closed. Focused enforce-persistence and
plan-change resume-identity cases both pass after semantic rule matching and
fixture-path corrections. This does not change the rollout decision: production
evaluation outcomes and promotion approval remain absent.
