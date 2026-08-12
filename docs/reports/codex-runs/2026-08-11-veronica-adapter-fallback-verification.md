# Veronica adapter fallback verification

Date: 2026-08-11  
HEAD: `cf42724e2361e11e39b49f454422a9e76af5f6ee`

## Changed files

- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
  - limited automatic semantic-beat materialization to Shorts so full-form legacy fallback provenance stays coherent;
  - supplied a deterministic narration hash when a legacy plan lacks `canonicalSourceHash`;
  - accepts an explicit canonical reference-pack root.
- `packages/strategic-reinvention/src/veronica-visual-artifacts.ts`
  - replaced workspace/parent probing with configured-path precedence and a module-owned canonical default;
  - added a typed missing-pack error containing the exact attempted manifest path;
  - derives visual-bible vocabulary fields deterministically for accepted legacy plans.
- `packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts`
  - derives a stable scene asset ID when an accepted legacy plan omits it.
- `packages/strategic-reinvention/src/veronica-visual-artifacts.unit.test.ts`
  - covers explicit-path resolution and fail-closed missing-path behavior; not run because the required adapter test did not pass.
- This report.

## Focused test

Command (initial run plus two permitted repair reruns):

`pnpm test:focused -- packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts -t "runs full-form planning through the same semantic finalizer without Short cadence"`

Prior task results:

1. FAIL: mixed scene/beat projection provenance.
2. FAIL: missing legacy `masterNarrationHash` input.
3. FAIL: temporary workspace cannot discover `content-packs/veronica-character-reference-v1/manifest.json`.

Reference-resolution task runs:

1. Reference resolution succeeded; FAIL on missing legacy `visualVocabulary`.
2. Reference/vocabulary resolution succeeded; FAIL on missing legacy `assetId`.
3. Artifact persistence completed; FAIL assertion: expected one `DECISIVE_TRANSITION_MOMENT`, received two `SINGLE_STATE` scenes.

The reference-pack defect was fixed. The remaining assertion was then classified in a separate authorized verification as a stale expectation rather than a production defect.

## Resolution hierarchy

Old behavior probed only `<workspace>/content-packs/...` and the workspace parent. New behavior uses an explicitly injected pack root when supplied; otherwise it resolves the repository-owned canonical pack relative to the installed module URL. A missing explicit path fails immediately with `VeronicaCanonicalReferencePackResolutionError`; it never falls through to another pack or crawls parent directories.

## Semantic-state decision

The exact units are `A buyer sees evidence.` at 0–5 s and `The expert makes a clearer choice.` at 5–10 s. Each derives one distinct `STABLE` proposition with buyer/expert ownership respectively. Neither sentence encodes an atomic before/after, causal consequence, reversal, or state change. The old `DECISIVE_TRANSITION_MOMENT` expectation came from reusable treatment vocabulary (`reveal`/`contrast`), not source proposition structure, so it was obsolete under the source-grounded finalizer contract.

The adapter test now asserts exact source-span coverage, order, timing, distinct proposition hashes, actor roles, stable relations, and two `SINGLE_STATE` projections. A separate finalizer regression proves `The buyer hesitates, then commits after seeing the proof.` remains `SEQUENTIAL_PROGRESSION` and `DECISIVE_TRANSITION_MOMENT`.

## Final verification

- Adapter test: 1 passed, 6 skipped.
- Reference resolver tests: 2 passed.
- Atomic-transition finalizer test: 1 passed, 52 skipped.
- `git diff --check`: PASS.

## Preserved canary evidence

- Source: `4e82a65208256d74b2171c4475ee624d9506cfd6f0b21b1f055074d4062c7503`.
- Selected WAV: `2dfc4193f3b325d98bb972d64af168b8dddf9d7f34d267710144965be6190622`.
- Canonical timing: `67e2a4539d37d41e6cf574c73e360697cb294d037243bdd1be3daf3c6c7ccbb2`.
- Semantic plan: `f4960a394a523f10dd9149d1425fbe48fe0320bd11e84bcaa907b7176ca49a4b`.
- Existing 01A deterministic artifact remains PASS: 8 scenes, 13 beats, semantic/provider/validation PASS.

## Safety and follow-up

External calls: OpenAI/TTS/QA/image/thumbnail/render/publication/playlist all 0.

Deterministic adapter/reference/state verification is complete. No paid QA was executed in this task.
