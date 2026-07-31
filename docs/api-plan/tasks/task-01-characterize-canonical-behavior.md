# Task 01: Characterize Canonical Behavior

## Objective

Freeze current CLI, workflow, artifact, gate, and resume behavior before extracting shared use cases.

## Existing Functionality To Reuse

`apps/cli`, `packages/workflow-engine`, `packages/story-localization`, `packages/dark-truth`, `packages/math-education`, and `packages/youtube-upload`.

## Scope

- map all required operations to entry points, writable stores, artifacts, gates, and external effects
- add provider-free Dark Truth full/Short and mathematics fixtures
- assert Dark Truth story-bible, canonical-fact, continuity, and reference-image behavior
- assert education curriculum, grade, difficulty, renderer, presentation, and audio preset revisions
- classify every divergence as defect, intentional behavior, or unresolved product choice

## Tests And Verification

Add focused characterization tests beside the owning modules. Run `pnpm test:focused -- <changed-test-file>` one file at a time.

## Acceptance Criteria

Every operation has a named current authority and normalized outcome, and no refactor begins until divergent canonical behavior is approved.

## Risks

Characterization can accidentally canonize defects; every surprising result needs an explicit classification.
