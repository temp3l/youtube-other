# Unfinished Plans Audit

Date: 2026-07-07

## 2026-07-07 Reconciliation Note

After this audit was written, a guarded implementation run added required
reports under `docs/reports/2026-07-07/` for story pipeline Tasks 05, 06, and
07-10; post-refactor Task 07; FFmpeg motion Tasks 07 and 08-09; CLI batch image
provider-reference verification status; short multilingual image aliasing; and
Task 13 metadata/audio compatibility. Provider edit-batch support remains
blocked because paid provider reference semantics were not approved or verified.
The original findings below are retained as historical audit evidence, not as
the final current state.

## Executive Summary

Scanned 199 files under `docs/plans`: 196 Markdown files and 3 JSON report artifacts. The required `docs/reports/*` tree did not exist before this audit, so no plan has a corresponding implementation report in the required location. Several plans are implemented in code and tests but are missing reports. The highest-risk unfinished work is the durable story pipeline, which is still documented and implemented as a dry-run skeleton. Other live gaps are FFmpeg render-motion CLI wiring, batch-image provider edit verification, short multilingual image alias policy, and controlled post-refactor smoke verification.

No application code was changed.

## Scanned Plan Files

- `docs/plans/03-source-cleaning-and-provenance-plan.md`
- `docs/plans/03.1-restored-settings-docs.md`
- `docs/plans/04-genre-policies-and-full-story-contract-plan.md`
- `docs/plans/05-modular-prompt-compiler-plan.md`
- `docs/plans/06-token-budgeting-and-preflight-plan.md`
- `docs/plans/07-canonical-english-full-generation-plan.md`
- `docs/plans/08-full-localization-lineage-and-locale-validation-plan.md`
- `docs/plans/09-short-adaptation-contract-and-beat-extraction-plan.md`
- `docs/plans/10-short-prompt-compiler-and-generation-plan.md`
- `docs/plans/11-16-cross-task-dependency-plan.md`
- `docs/plans/11-full-and-short-validation-matrix-plan.md`
- `docs/plans/12-repair-routing-regeneration-and-retry-hardening-plan.md`
- `docs/plans/13-metadata-and-audio-stage-separation-plan.md`
- `docs/plans/14-scene-image-render-publish-separation-plan.md`
- `docs/plans/15-cost-controls-fingerprints-and-telemetry-plan.md`
- `docs/plans/16-persistence-cache-resume-and-invalidation-plan.md`
- `docs/plans/17-streamed-remote-rendering-plan.md`
- `docs/plans/18-openai-thumbnail-generation-plan.md`
- `docs/plans/19-story-production-analysis-plan.md`
- `docs/plans/cli-batch-images/README.md`
- `docs/plans/cli-batch-images/batch-image-audit.md`
- `docs/plans/cli-batch-images/provider-reference-semantics-checklist.md`
- `docs/plans/cli-batch-images/remaining-risks-triage.md`
- `docs/plans/cli-batch-images/tasks/task-01-characterization-tests.md`
- `docs/plans/cli-batch-images/tasks/task-02-batch-types-and-identity.md`
- `docs/plans/cli-batch-images/tasks/task-03-reference-asset-stages.md`
- `docs/plans/cli-batch-images/tasks/task-04-full-scene-batch-workflow.md`
- `docs/plans/cli-batch-images/tasks/task-05-batch-lifecycle-cli.md`
- `docs/plans/cli-batch-images/tasks/task-06-reconciliation-validation-resume.md`
- `docs/plans/cli-batch-images/tasks/task-07-short-image-strategy.md`
- `docs/plans/cli-batch-images/tasks/task-08-paths-renderer-integration.md`
- `docs/plans/cli-batch-images/tasks/task-09-operator-docs-and-smoke-verification.md`
- `docs/plans/cli-batch-images/tasks/task-10-provider-reference-safeguards.md`
- `docs/plans/cli-batch-images/tasks/task-11-multilingual-full-scene-shared-output.md`
- `docs/plans/cli-batch-images/tasks/task-12-short-batch-downstream-verification.md`
- `docs/plans/cli-batch-images/tasks/task-13-remaining-risks-triage-and-docs.md`
- `docs/plans/ffmpeg-motion-presets/implementation-plan.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-01-characterization-tests.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-02-motion-types-and-config.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-03-preset-registry.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-04-seeded-selection.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-05-ffmpeg-filter-builder.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-06-renderer-integration.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-07-cli-and-manifest-integration.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-08-debug-reporting.md`
- `docs/plans/ffmpeg-motion-presets/tasks/task-09-smoke-tests-and-docs.md`
- `docs/plans/natural-openai-narration/00-current-state-analysis.md`
- `docs/plans/natural-openai-narration/01-target-architecture.md`
- `docs/plans/natural-openai-narration/02-spoken-narration-preparation.md`
- `docs/plans/natural-openai-narration/03-narration-domain-schemas.md`
- `docs/plans/natural-openai-narration/04-performance-direction-planner.md`
- `docs/plans/natural-openai-narration/05-openai-tts-chunk-generation.md`
- `docs/plans/natural-openai-narration/06-pronunciation-and-text-normalization.md`
- `docs/plans/natural-openai-narration/07-audio-validation-and-continuity.md`
- `docs/plans/natural-openai-narration/08-assembly-and-mastering.md`
- `docs/plans/natural-openai-narration/09-quality-gate-and-observability.md`
- `docs/plans/natural-openai-narration/10-cli-and-batch-integration.md`
- `docs/plans/natural-openai-narration/11-migration-and-deprecation.md`
- `docs/plans/natural-openai-narration/12-testing-strategy.md`
- `docs/plans/natural-openai-narration/13-implementation-roadmap.md`
- `docs/plans/natural-openai-narration/tasks/01-current-state-and-path-contracts.md`
- `docs/plans/natural-openai-narration/tasks/02-narration-domain-schemas.md`
- `docs/plans/natural-openai-narration/tasks/03-spoken-narration-preparation.md`
- `docs/plans/natural-openai-narration/tasks/04-deterministic-beat-segmentation.md`
- `docs/plans/natural-openai-narration/tasks/05-performance-direction-planner.md`
- `docs/plans/natural-openai-narration/tasks/06-pronunciation-normalization.md`
- `docs/plans/natural-openai-narration/tasks/07-openai-tts-request-builder.md`
- `docs/plans/natural-openai-narration/tasks/08-chunk-cache-and-resume.md`
- `docs/plans/natural-openai-narration/tasks/09-chunk-technical-validation.md`
- `docs/plans/natural-openai-narration/tasks/10-manifest-assembly-and-continuity.md`
- `docs/plans/natural-openai-narration/tasks/11-mastering-profiles.md`
- `docs/plans/natural-openai-narration/tasks/12-quality-gate-and-reports.md`
- `docs/plans/natural-openai-narration/tasks/13-cli-integration.md`
- `docs/plans/natural-openai-narration/tasks/14-voice-benchmarking.md`
- `docs/plans/natural-openai-narration/tasks/15-batch-partial-failure-status.md`
- `docs/plans/natural-openai-narration/tasks/16-dark-truth-compatibility-adapter.md`
- `docs/plans/natural-openai-narration/tasks/17-observability-and-cost-controls.md`
- `docs/plans/natural-openai-narration/tasks/18-migration-deprecation-and-docs.md`
- `docs/plans/post-refactor-stability/README.md`
- `docs/plans/post-refactor-stability/evidence/task-07-verification-and-controlled-smoke.md`
- `docs/plans/post-refactor-stability/prompts/task-01-story-localization-routing-test.md`
- `docs/plans/post-refactor-stability/prompts/task-04-shot-plan-reproducibility.md`
- `docs/plans/post-refactor-stability/prompts/task-05-episode-validation-semantics.md`
- `docs/plans/post-refactor-stability/prompts/task-06-cross-manifest-integrity-validator.md`
- `docs/plans/post-refactor-stability/prompts/task-07-verification-and-controlled-smoke.md`
- `docs/plans/post-refactor-stability/prompts/tasks-02-03-resolver-identity-and-metadata.md`
- `docs/plans/post-refactor-stability/tasks/task-01-story-localization-routing-test.md`
- `docs/plans/post-refactor-stability/tasks/task-02-resolver-cache-identity.md`
- `docs/plans/post-refactor-stability/tasks/task-03-resolver-metadata-propagation.md`
- `docs/plans/post-refactor-stability/tasks/task-04-shot-plan-reproducibility.md`
- `docs/plans/post-refactor-stability/tasks/task-05-episode-validation-semantics.md`
- `docs/plans/post-refactor-stability/tasks/task-06-cross-manifest-integrity-validator.md`
- `docs/plans/post-refactor-stability/tasks/task-07-verification-and-controlled-smoke.md`
- `docs/plans/remove-legacy-and-normalize-paths/00-executive-summary.md`
- `docs/plans/remove-legacy-and-normalize-paths/01-git-and-repository-baseline.md`
- `docs/plans/remove-legacy-and-normalize-paths/02-current-system-architecture.md`
- `docs/plans/remove-legacy-and-normalize-paths/03-dark-truth-pipeline-boundary.md`
- `docs/plans/remove-legacy-and-normalize-paths/04-legacy-system-inventory.md`
- `docs/plans/remove-legacy-and-normalize-paths/05-component-classification-matrix.md`
- `docs/plans/remove-legacy-and-normalize-paths/06-episode-workspace-layout-audit.md`
- `docs/plans/remove-legacy-and-normalize-paths/07-canonical-episode-workspace-contract.md`
- `docs/plans/remove-legacy-and-normalize-paths/08-script-resolution-architecture.md`
- `docs/plans/remove-legacy-and-normalize-paths/09-cli-and-application-orchestration.md`
- `docs/plans/remove-legacy-and-normalize-paths/10-shared-abstraction-simplification.md`
- `docs/plans/remove-legacy-and-normalize-paths/11-data-storage-cache-and-queue-impact.md`
- `docs/plans/remove-legacy-and-normalize-paths/12-api-and-contract-impact.md`
- `docs/plans/remove-legacy-and-normalize-paths/13-dependency-and-build-impact.md`
- `docs/plans/remove-legacy-and-normalize-paths/14-episode-migration-plan.md`
- `docs/plans/remove-legacy-and-normalize-paths/15-test-and-validation-strategy.md`
- `docs/plans/remove-legacy-and-normalize-paths/16-risk-register.md`
- `docs/plans/remove-legacy-and-normalize-paths/17-target-architecture.md`
- `docs/plans/remove-legacy-and-normalize-paths/18-implementation-order.md`
- `docs/plans/remove-legacy-and-normalize-paths/19-final-cleanup-checklist.md`
- `docs/plans/remove-legacy-and-normalize-paths/20-planning-report.md`
- `docs/plans/remove-legacy-and-normalize-paths/reports/task-08-dry-run-after.md`
- `docs/plans/remove-legacy-and-normalize-paths/reports/task-08-dry-run-before.md`
- `docs/plans/remove-legacy-and-normalize-paths/reports/task-08-review.md`
- `docs/plans/remove-legacy-and-normalize-paths/reports/task-08-write.md`
- `docs/plans/remove-legacy-and-normalize-paths/reports/task-09-10-16-approval.md`
- `docs/plans/remove-legacy-and-normalize-paths/reports/task-20-final-cleanup-and-validation.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/01-add-dark-truth-characterization-tests.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/02-define-canonical-episode-domain-types.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/03-introduce-central-script-resolver.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/04-refactor-application-orchestration.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/05-refactor-cli-workers-and-api-entry-points.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/06-update-cache-and-artifact-identity.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/07-build-episode-layout-migration-tool.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/08-migrate-repository-owned-episodes.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/09-remove-legacy-entry-points.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/10-remove-legacy-orchestration.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/11-remove-legacy-generation-components.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/12-simplify-shared-abstractions.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/13-remove-legacy-api-events-and-queues.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/14-remove-legacy-persistence-and-storage-code.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/15-remove-legacy-configuration.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/16-remove-legacy-dependencies-and-build-wiring.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/17-update-tests-and-fixtures.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/18-update-documentation-and-operations.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/19-remove-temporary-layout-compatibility.md`
- `docs/plans/remove-legacy-and-normalize-paths/tasks/20-final-repository-cleanup-and-validation.md`
- `docs/plans/story-ir-and-artifact-variant-modeling-plan.md`
- `docs/plans/story-ir-and-artifact-variant-modeling.md`
- `docs/plans/story-pipeline-batch-strategy.md`
- `docs/plans/story-pipeline-cache-invalidation-matrix.md`
- `docs/plans/story-pipeline-dependency-graphs.md`
- `docs/plans/story-pipeline-deprecation-inventory.md`
- `docs/plans/story-pipeline-implementation-roadmap.md`
- `docs/plans/story-pipeline-repository-map.md`
- `docs/plans/story-pipeline-schema-design.md`
- `docs/plans/story-pipeline-task-index.md`
- `docs/plans/story-pipeline-tasks/01-locale-guard-and-sp-audit.md`
- `docs/plans/story-pipeline-tasks/02-workflow-schema-contracts.md`
- `docs/plans/story-pipeline-tasks/03-workflow-manifest-store.md`
- `docs/plans/story-pipeline-tasks/04-unified-cli-skeleton.md`
- `docs/plans/story-pipeline-tasks/05-english-rewrite-stage-wrapper.md`
- `docs/plans/story-pipeline-tasks/06-english-source-fallback-flow.md`
- `docs/plans/story-pipeline-tasks/07-quality-gate-adapter-full-and-short.md`
- `docs/plans/story-pipeline-tasks/08-locale-branch-isolation-and-fallback.md`
- `docs/plans/story-pipeline-tasks/09-independent-short-outcomes.md`
- `docs/plans/story-pipeline-tasks/10-visual-branch-boundary.md`
- `docs/plans/story-pipeline-tasks/11-media-stage-adapters.md`
- `docs/plans/story-pipeline-tasks/12-provider-batch-hybrid.md`
- `docs/plans/story-pipeline-tasks/13-cost-budgets-and-telemetry.md`
- `docs/plans/story-pipeline-tasks/14-status-and-inspect-reports.md`
- `docs/plans/story-pipeline-tasks/15-resume-and-invalidation.md`
- `docs/plans/story-pipeline-tasks/16-legacy-command-delegation.md`
- `docs/plans/story-pipeline-tasks/17-end-to-end-hardening.md`
- `docs/plans/story-pipeline-test-strategy.md`
- `docs/plans/story-rewrite-repository-analysis-and-baseline-plan.md`
- `docs/plans/story-to-multilocale-batch-pipeline-master-plan.md`
- `docs/plans/visual-retention-shot-architecture/README.md`
- `docs/plans/visual-retention-shot-architecture/architecture-plan.md`
- `docs/plans/visual-retention-shot-architecture/current-pipeline-characterization.md`
- `docs/plans/visual-retention-shot-architecture/dependency-graph.md`
- `docs/plans/visual-retention-shot-architecture/production-defaults.md`
- `docs/plans/visual-retention-shot-architecture/task-index.md`
- `docs/plans/visual-retention-shot-architecture/tasks/01-current-pipeline-characterization.md`
- `docs/plans/visual-retention-shot-architecture/tasks/02-shot-domain-schemas.md`
- `docs/plans/visual-retention-shot-architecture/tasks/03-path-and-artifact-contracts.md`
- `docs/plans/visual-retention-shot-architecture/tasks/04-pacing-and-budget-config.md`
- `docs/plans/visual-retention-shot-architecture/tasks/05-treatment-catalog-types.md`
- `docs/plans/visual-retention-shot-architecture/tasks/06-focal-metadata-and-local-analysis-contract.md`
- `docs/plans/visual-retention-shot-architecture/tasks/07-deterministic-shot-planner.md`
- `docs/plans/visual-retention-shot-architecture/tasks/08-shot-validation-engine.md`
- `docs/plans/visual-retention-shot-architecture/tasks/09-evidence-insert-model.md`
- `docs/plans/visual-retention-shot-architecture/tasks/10-caption-rhythm-and-collision-plan.md`
- `docs/plans/visual-retention-shot-architecture/tasks/11-ffmpeg-filter-builder-layer.md`
- `docs/plans/visual-retention-shot-architecture/tasks/12-shot-aware-renderer-integration.md`
- `docs/plans/visual-retention-shot-architecture/tasks/13-derived-clip-cache-and-fingerprints.md`
- `docs/plans/visual-retention-shot-architecture/tasks/14-preview-and-inspection-cli.md`
- `docs/plans/visual-retention-shot-architecture/tasks/15-canonical-pipeline-integration.md`
- `docs/plans/visual-retention-shot-architecture/tasks/16-dark-truth-episode-integration.md`
- `docs/plans/visual-retention-shot-architecture/tasks/17-legacy-episode-migration.md`
- `docs/plans/visual-retention-shot-architecture/tasks/18-rollout-deprecation-and-telemetry.md`
- `docs/plans/visual-retention-shot-architecture/treatment-catalog.md`
- `docs/plans/visual-retention-shot-architecture/validation-plan.md`
- JSON artifacts: `docs/plans/remove-legacy-and-normalize-paths/reports/task-08-dry-run-before.json`, `task-08-dry-run-after.json`, `task-08-write.json`.

## Per-Plan Status

| Plan set | Status | Evidence | Report status |
| --- | --- | --- | --- |
| Story rewrite Tasks 03-19 | PARTIALLY_DONE | Source cleaning, genre policy, prompt compiler, preflight, canonical full generation, localization lineage, short contract/generation, validation, retry routing, remote rendering, thumbnails, and story production analysis exist with focused tests. Metadata/audio separation still has compatibility adapter fields in story schemas. | Missing under `docs/reports/*`. |
| Story-to-multilocale durable pipeline | PARTIALLY_DONE | Workflow schemas, manifest store, dry-run CLI, status, inspect, cost helpers, and some adapters exist. `docs/cli.md` explicitly says `stories pipeline` is a dry-run skeleton. English fallback, execution stages, batch hybrid, media adapters, resume/invalidation, legacy delegation, and E2E hardening are not proven. | Missing. |
| Remove legacy and normalize paths | PARTIALLY_DONE | Central resolver, canonical path helpers, migration command/tests, and cleanup reports exist. Current post-refactor plans show follow-up was needed for resolver identity, metadata propagation, validation, and cross-manifest integrity; code now appears to include those. Reports are stored under `docs/plans/.../reports`, not required `docs/reports/*`. | Missing/misplaced. |
| Visual retention shot architecture | DONE except production artifact proof | Domain schemas, treatment catalog, shot planner, validation engine, caption collision, preview/inspect output, CLI `shots`, legacy migration, and renderer-facing contracts exist with tests. Repository-owned episode shot-plan artifacts are not consistently present. | Missing. |
| Natural OpenAI narration | DONE for staged pipeline | `packages/speech` contains schemas, segmentation, spoken narration, pronunciation, TTS request builder, cache/resume, validation, assembly, mastering, quality gate, telemetry, voice benchmark, status, and CLI docs. | Missing. |
| CLI batch images | PARTIALLY_DONE | Prepare/submit/status/download/resume/index verification, batch identity, short strategy, shared full-scene aliasing, and tests exist. Remaining risks document says provider `/v1/images/edits` batch semantics are unverified and short multilingual alias policy is missing. | Missing. |
| FFmpeg motion presets | PARTIALLY_DONE | Rendering motion module, preset registry, seeded selection, filter builder, debug report, renderer integration, docs, and smoke test exist. CLI flag plan required `--motion-render-preset`; source only shows visual-retention `--motion-preset` on episode commands and no `--motion-render-preset`. | Missing. |
| Post-refactor stability | PARTIALLY_DONE | Code now includes resolver v2 identity with path, typed source propagation, shot validation, `episode validate`, and cross-manifest validator. Task 07 evidence records stale failed smoke cells; no fresh proof all dry-run/validation/shot-validation cells pass. | Missing; evidence file is not an implementation report. |

## Completed Tasks

- Story rewrite implementation: Tasks 03-12, 15, 17, 18, and 19 are supported by code/tests in `packages/story-localization`, `apps/cli`, and docs.
- Natural narration Tasks 01-18 appear implemented in `packages/speech`, `apps/cli/src/index.ts`, `docs/cli-audio.md`, and `docs/development/commands.md`.
- Visual retention Tasks 01-18 appear implemented in `packages/domain`, `packages/visual-planning`, `apps/cli/src/shots.ts`, and rendering integration surfaces.
- Post-refactor Tasks 01-06 appear implemented in current code, despite stale plan/evidence files.
- Remove-legacy Tasks 02, 03, 07, 08, 20 and most cleanup work are evidenced by resolver, migration command, tests, and plan-local reports.

## Unfinished Tasks

| Item | Status | Risk | Evidence missing or conflict | Next prompt |
| --- | --- | --- | --- | --- |
| Story pipeline Tasks 05-17 | PARTIALLY_DONE | HIGH | `stories pipeline` only plans/persists manifests; no proof it executes rewrite, fallback, localization, shorts, media stages, provider batches, resume, invalidation, or E2E workflow. | "Implement the next executable stage of `docs/plans/story-pipeline-tasks`, starting with Task 05 English rewrite stage wrapper, and write the required implementation report." |
| FFmpeg motion Task 07 CLI integration | PARTIALLY_DONE | MEDIUM | Plan requires `--motion-render-preset`; source search found render motion config but no CLI option with that name. | "Finish `docs/plans/ffmpeg-motion-presets/tasks/task-07-cli-and-manifest-integration.md`: add render-motion CLI flags without conflicting with visual-retention `--motion-preset`, then add focused tests and report." |
| CLI batch provider reference support | PARTIALLY_DONE | MEDIUM | `remaining-risks-triage.md` says edit batch provider semantics remain unverified and blocked. | "Execute the safe manual verification plan in `docs/plans/cli-batch-images/provider-reference-semantics-checklist.md` using disposable assets, then either keep support blocked or add tested provider edit support." |
| CLI batch short multilingual alias policy | NOT_DONE | MEDIUM | `remaining-risks-triage.md` says short multilingual batching lacks alias policy because portrait outputs are shared. | "Design and implement a short multilingual image alias policy for `images batch prepare --variants short`, with planner/service tests and docs." |
| Post-refactor Task 07 smoke verification | PARTIALLY_DONE | HIGH | Existing evidence records failed/stale validation cells; no current report proves all required cells pass. | "Rerun post-refactor Task 07 focused verification without paid calls, update evidence, and create the required report under `docs/reports/2026-07-07/`." |
| Story metadata/audio separation cleanup | UNCLEAR | MEDIUM | Story prompt response schemas still contain compatibility metadata/audio fields; unclear whether all are intentional adapters. | "Audit Task 13 metadata/audio separation against current code and either document intentional compatibility fields or remove unsupported prompt-owned metadata/audio dependencies." |

## Partially Implemented Tasks

- Story pipeline: schema/store/status are DONE; execution wrappers and E2E behavior are NOT_DONE/UNCLEAR.
- FFmpeg motion: renderer layer is DONE; operator CLI and manifest/report fields are PARTIALLY_DONE.
- Batch images: local lifecycle is DONE; real reference-edit provider path and short multilingual aliasing are NOT_DONE.
- Post-refactor stability: code tasks appear DONE; controlled smoke and required reports are PARTIALLY_DONE.
- Remove-legacy: legacy reports are misplaced; final current-state validation is UNCLEAR without running focused tests.

## Missing Tests

- Story pipeline executable stages need integration tests for English fallback, locale isolation, full/short independent outcomes, provider batch hybrid, media boundary, resume/invalidation, and legacy delegation.
- FFmpeg motion needs CLI help/option tests for render-motion flags and manifest/debug report assertions if CLI flags are added.
- Batch image provider reference support needs characterization tests before enabling `/v1/images/edits` batch support.
- Short multilingual image aliasing needs planner, import, resume, and collision tests.
- Post-refactor Task 07 needs fresh focused command evidence for dry-run, validate, and shot-validation cells.

## Missing Documentation

- Missing implementation reports under `docs/reports/*` for all executed plan sets.
- FFmpeg motion docs describe renderer behavior but not the planned `--motion-render-preset` operator flag because it is not implemented.
- Story pipeline docs correctly call the CLI a skeleton; docs must be updated only after executable stages land.
- Batch image docs intentionally document provider edit support as blocked/manual; update only after verification.

## Missing Implementation Reports

No corresponding implementation report exists under `docs/reports/*` for any executed `docs/plans/*` work. Plan-local files under `docs/plans/remove-legacy-and-normalize-paths/reports/*` and audit files under `docs/audits/*` are useful evidence but fail the required location rule.

Likely executed without required reports:

- Story rewrite Tasks 03-19.
- Natural OpenAI narration Tasks 01-18.
- Visual retention shot architecture Tasks 01-18.
- CLI batch images Tasks 01-13.
- Remove-legacy Tasks 01-20.
- Post-refactor stability Tasks 01-06.
- FFmpeg motion Tasks 01-09, partially.

## Recommended Order

1. HIGH: Implement story pipeline Task 05, then Tasks 06-10, because this closes the largest gap between plans and runtime.
2. HIGH: Rerun post-refactor Task 07 verification and write the required report.
3. MEDIUM: Finish FFmpeg motion CLI integration.
4. MEDIUM: Resolve batch-image provider reference verification and short multilingual aliasing.
5. MEDIUM: Audit metadata/audio compatibility fields and document or remove them.
6. LOW: Backfill implementation reports for already executed plan groups.

## Checks Run

- `find docs/plans -type f -name '*.md'`
- `find docs/plans -type f`
- `find docs/reports -type f`
- Targeted `rg` searches across `apps`, `packages`, `docs`, and `scripts` for plan-specific symbols.
- Targeted `sed` reads of validation, resolver, motion, batch-image, and narration evidence.

No tests were run; this was a no-code audit.
