# Veronica M4 semantic-authority baseline

Captured before M4 implementation edits on 2026-08-18.

## Repository state

- HEAD: `492543be534da6bf004d6089e174fbb2d21b86cc`
- Branch: `codex/veronicabenini-positioning-visual-planning`
- Dirty entries: 167 (`39` tracked modifications; `128` untracked entries)
- Exact pre-M4 `git status --short`: `2026-08-18-veronica-m4-semantic-authority-baseline-git-status.txt`
- Snapshot SHA-256: `cc9c854082dda35320f782dab7260aede9ac25cb991985395beb8becf96c177e`

The dirty worktree contains the preserved M1/M2/M3 changes plus earlier production and review artifacts. M4 must not reset, overwrite, or normalize those paths.

## M3 evidence

- Latest final review: `artifacts/veronica-systemic-remediation-m3-final/2026-08-18T04-35-00Z/veronica-systemic-remediation-m3-final-review-2026-08-18T04-35-00Z/`
- Latest implementation report: `docs/reports/codex-runs/2026-08-18-veronica-systemic-remediation-m3-implementation.md`
- Blocking test: `packages/strategic-reinvention/src/veronica-sequence-diversity.unit.test.ts`, `recognizes adjective-first incoming and retained-value contrasts`
- M3 status: `BLOCKED`; Tier 2, exact 48, typecheck, and lint were not run.

## Traced call path

`veronica-media prepare-production` calls `preparePositioningProductionEpisode`, which resolves source authority and current semantic authority, runs `hardenVeronicaPreImagePlan`, materializes beats, generates candidates in `veronica-sequence-diversity.ts`, applies `candidateHardGate`, then beam-selects a sequence. Actor ownership remains enforced by `veronica-pre-image-semantic-gate.ts` and `candidateHardGate`.

The retained-value generator emits “reveals the retained result … beside …”, while the family recognizer only identifies “retained result … emerges” before falling through to generic comparison. This immediate mismatch is evidence of a heuristic maintenance defect, but M4 treats it as one example rather than the architectural root cause.

## Authority and provenance

`veronica-semantic-plan-authority.ts` already supplies strict envelopes, telemetry-free semantic identity, provenance mismatch detection, accepted-human preservation, stale archival, atomic publication, and descendant invalidation. Its current `DERIVED` kind conflates deterministic derivation and has no model-derived state.

Accepted human authority is reusable even when current policy identity differs, and production preparation explicitly refuses to replace it. Model output must enter before deterministic rebuilding and remain subject to existing actor, source, state, and provider-readiness gates.

## Provider and cost infrastructure

- Responses API adapter pattern: `apps/cli/src/veronica-source-grounded-visual-qa-composition.ts`
- Request/cache identity: `packages/shared/src/openai-paid-request.ts`
- Model policy: `packages/shared/src/openai-model-policy.ts`
- Pricing and redacted logging: `packages/shared/src/openai-cost-summary.ts`, `packages/shared/src/openai-debug-logger.ts`
- Existing QA scheduler is not reused for M4 retries because its process policy currently permits two retries; M4 requires at most one retry.
- Credential presence: true (boolean check only; credential value was not printed or persisted).
- Paid provider dispatches during baseline: 0.

## M4-owned path policy

Prefer new M4 modules, tests, scripts, decisions, reports, and artifacts. Touch existing shared exports or authority types only where the new component cannot be exposed safely without doing so. Do not alter the M3 retained-value assertion or canonical content.
