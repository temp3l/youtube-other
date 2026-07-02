# Implementation Order

## Wave 1: safety characterization

Objective: freeze active Dark Truth behavior before changing paths.

Tasks: add tests for CLI registration, full/Short setup, narration, image, render, metadata, API boot, and 022 English/German resolution failures.

Validation: focused unit tests only.

Rollback: delete new tests.

Batching: isolated; do not batch with removals.

## Wave 2: canonical domain and resolver

Objective: define episode slug, language, variant, and central script resolver.

Tasks: extend shared/domain types, add resolver, add containment and ambiguity checks, add cache identity.

Validation: shared resolver tests and typecheck.

Rollback: revert resolver files and consumer imports.

Batching: can batch type definitions and resolver tests.

## Wave 3: active consumer refactor

Objective: move active CLI/story/audio/analysis consumers to resolver and typed app use cases.

Tasks: refactor story analysis, full/short resolution, audio narration, episode commands, image/render setup.

Validation: focused CLI/story/speech tests.

Rollback: restore previous consumer path construction.

Batching: split by consumer family.

## Wave 4: cache and artifact identity

Objective: make language/variant/path/hash explicit in cache and output identity.

Tasks: update story, short, narration, metadata, image, render manifests.

Validation: cache isolation tests.

Rollback: invalidate new caches and restore schemas.

Batching: isolate by owner package.

## Wave 5: migration tooling and data migration

Objective: inventory and migrate repository-owned scripts.

Tasks: dry-run utility, reports, write mode, manual divergence list, post-migration validation.

Validation: dry run, then focused resolver tests on migrated examples.

Rollback: git restore moved tracked scripts; use report for untracked/manual files.

Batching: utility first, writes separate.

## Wave 6: remove legacy entry points

Objective: disable and remove pipeline-era commands/API/package imports.

Tasks: remove CLI root legacy flow, replace API boot, remove pipeline imports, remove package dependency.

Validation: CLI/API tests, stale import search.

Rollback: restore command delegation temporarily.

Batching: API can batch with package dependency only after CLI no longer imports pipeline.

## Wave 7: simplify shared abstractions

Objective: collapse compatibility layers.

Tasks: remove root script compatibility, legacy image/audio/transcript fallbacks, old response schemas, legacy narration mode.

Validation: stale searches and focused tests.

Rollback: restore adapter for one release.

Batching: isolate destructive compatibility removal.

## Wave 8: docs and final cleanup

Objective: repository contains only active architecture docs and no unexplained stale refs.

Tasks: docs update, final stale search, lockfile cleanup, release notes.

Validation: targeted docs search, affected typechecks.

Rollback: docs-only revert or dependency re-add.

Batching: docs and stale searches can batch after code passes.
