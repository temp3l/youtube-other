# Story Rewrite Pipeline Refactor - Codex Execution Pack

This pack is a repository-grounded implementation programme for refactoring the existing story rewrite pipeline. Do not implement all prompts in one thread. Start a fresh Codex session for each numbered prompt, inspect the repository again, and preserve public CLI commands unless the prompt explicitly documents a required compatibility change.

The source code is authoritative. Ignore the root README for architecture guidance, ignore `docs.bak`, and prefer targeted reads and `rg` over broad scans.

## Repository Facts To Preserve

- Package manager: `pnpm`.
- Primary operator surface: `apps/cli`.
- Main story package: `packages/story-localization`.
- Current story CLI commands include `stories localize`, `stories rewrite-full`, `stories rewrite-short`, and `stories:batches`.
- Current story languages are `en`, `de`, `es`, `fr`, and `pt`.
- Current locales include `en-US`, `de-DE`, `es-419`, `fr-FR`, and `pt-BR`.
- Current downstream commands include `metadata generate`, `metadata youtube`, `audio generate`, `audio generate-localized`, `images plan`, `images generate`, `images resume`, `render --profile youtube`, `render --profile vertical`, and `youtube upload`.

## Model Policy

| Work type | Recommended model | Reasoning effort |
|---|---|---|
| Repository analysis, lineage, StoryIR, compiler architecture, repair routing, persistence, final audit | GPT-5.5 | Medium |
| Focused implementation after an approved plan | GPT-5.4 | Medium |
| Isolated tests, docs, small fixes | GPT-5.4-mini | Low or medium |
| Final audit or unresolved architecture conflicts | GPT-5.5 | High |

Use only models already available to the current Codex environment. Do not invent model names. Do not use a mini model for StoryIR, prompt compiler design, full-story generation routing, repair routing, cache invalidation, or the final audit.

## Execution Rules

1. Start each major prompt in Plan mode.
2. Let Codex inspect the repo and produce a plan before implementation.
3. Use "clear context and implement" for phases 02, 05, 08, 09, 12, 16, and 19 unless context usage is low.
4. Commit after each completed phase.
5. Run narrow validation before every commit; do not default to full repo test/build unless the prompt requires it.
6. If a prompt discovers repository differences, update the current plan and any later docs before implementation.
7. Do not issue paid API requests in planning or test validation unless a prompt explicitly asks for a mocked or gated integration and credentials are intentionally supplied.

## Prompt Order

1. `01-repository-analysis-and-baseline.md`
2. `02-story-ir-and-artifact-variant-modeling.md`
3. `03-source-cleaning-and-provenance.md`
4. `04-genre-policies-and-full-story-contract.md`
5. `05-full-story-prompt-compiler.md`
6. `06-token-budgeting-and-preflight.md`
7. `07-canonical-english-full-generation.md`
8. `08-full-localization-lineage-and-locale-validation.md`
9. `09-short-adaptation-contract-and-beat-extraction.md`
10. `10-short-prompt-compiler-and-generation.md`
11. `11-full-and-short-validation-matrix.md`
12. `12-repair-routing-regeneration-and-retry-hardening.md`
13. `13-metadata-and-audio-stage-separation.md`
14. `14-scene-image-render-publish-separation.md`
15. `15-cost-controls-fingerprints-and-telemetry.md`
16. `16-persistence-cache-resume-and-invalidation.md`
17. `17-regression-and-integration-tests.md`
18. `18-migration-documentation-and-cleanup.md`
19. `19-final-cross-cutting-audit.md`

## Dependency Graph

- 01 is analysis-only and blocks all implementation prompts.
- 02 depends on 01.
- 03 depends on 02.
- 04 depends on 02 and 03.
- 05 depends on 02, 03, and 04.
- 06 depends on 05.
- 07 depends on 02 through 06.
- 08 depends on 07.
- 09 depends on 02, 07, and 08.
- 10 depends on 09.
- 11 depends on 07 through 10.
- 12 depends on 11.
- 13 depends on 07 through 12.
- 14 depends on 13.
- 15 depends on 07 through 14.
- 16 depends on 07 through 15.
- 17 depends on 16.
- 18 depends on 17.
- 19 is audit-only and depends on all previous prompts.

## Review Checkpoints

- After 04: StoryIR, source cleaning, and full-story genre policy are stable.
- After 08: canonical English full and localized full lineage are validated and separate from shorts.
- After 12: full and short validation, repair, regeneration, retry, and token exhaustion are variant-safe.
- After 16: cache, resume, invalidation, cost, telemetry, and fingerprints are variant-aware.
- After 19: final audit confirms no full/short routing leaks and no narration prompt contains metadata, audio, visual, rendering, or publication instructions.

## Commit Boundaries

Use one commit per phase. Suggested prefixes:

- `docs(story-pipeline): audit current story rewrite pipeline`
- `feat(story-ir): add artifact variant model`
- `feat(story-cleaning): add deterministic source provenance`
- `feat(story-generation): enforce canonical full story flow`
- `feat(story-shorts): add short adaptation contract`
- `feat(story-validation): add full and short validation matrix`
- `feat(story-repair): add typed repair routing`
- `feat(story-assets): split metadata audio visual stages`
- `feat(story-resume): add variant-aware invalidation`
- `test(story-pipeline): add regression coverage`
- `docs(story-pipeline): document migration`

## Validation Guidance

Each prompt must name exact tests before implementation. Prefer:

- file-targeted Vitest runs;
- single-package typecheck when touched;
- path-existence checks for docs-only work;
- dry-run CLI checks where available.

Do not invent scripts. Inspect `package.json`, `pnpm-workspace.yaml`, and relevant package scripts first.

## Handling New Discoveries

If later implementation proves a prompt assumption wrong, update the affected prompt or migration docs in the same phase. Preserve the repository's actual Portuguese locale (`pt-BR`) unless code is intentionally changed with migration coverage. Keep French (`fr-FR`) as a repository-supported extra locale even when a task focuses on `en`, `es`, `de`, and `pt`.

## Original Master Specification

The programme-level source remains:

```text
master-specification.md
```

The numbered prompts are the ordered implementation plan. If they conflict with source code, inspect source code first and update the task plan rather than guessing.
