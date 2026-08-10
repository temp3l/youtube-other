# Veronica auto-remediation and timing integrity

Date: 2026-08-10

## Changed files

- `packages/strategic-reinvention/src/veronica-{production-policy,pre-image-semantic-gate}.ts`
- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
- `packages/speech/src/veronica-short-pacing.ts`
- `apps/cli/src/{index,veronica-short-pacing,veronica-pre-image-review-pack}.ts`
- Focused unit tests and `scripts/build-veronica-semantic-regression-archive.ts`

## Root causes and result

Semantic findings were persisted after a single Short-biased pre-gate rewrite; no findings-driven convergence loop existed. A generic two-round gate/remediate/regate orchestrator now repairs only actionable scenes, preserves action ownership, records provenance, and fails closed.

Adaptive TTS promoted the selected WAV but reran narration validation only. Post-selection production reconciliation now rebuilds hash-owned canonical timing, scenes, events, cadence, manifests, and diagnostics. Pack hashes and cross-artifact integrity are separate gates.

Natural conceptual-explainer pacing replaces the 58–60s target: <=120s normal, 120–180s editorial review, >180s hard format failure.

## Checks

- Focused Vitest: 30 tests passed.
- CLI typecheck: pass.
- Speech, strategic-reinvention, CLI builds: pass.
- Targeted ESLint: pass.
- Eight cached-audio regenerations: 0 final blockers; integrity/hash/ZIP pass.
- Provider calls: TTS 0; images 0.

## Risks / follow-up

Non-English pacing bands remain intentionally undefined pending locale-specific approval. Human pre-image approval remains required.
