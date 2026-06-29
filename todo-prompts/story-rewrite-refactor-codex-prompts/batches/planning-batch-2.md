# Planning Batch 2 Prompt

You are working in `/home/box/workspace/fehmarn-seo/youtube/other`.

Task: plan all work for Planning Batch 2 only.

Batch 2 tasks from todo-prompts/story-rewrite-refactor-codex-prompts:

- `05-full-story-prompt-compiler.md`
- `06-token-budgeting-and-preflight.md`
- `07-canonical-english-full-generation.md`
- `08-full-localization-lineage-and-locale-validation.md`
- `09-short-adaptation-contract-and-beat-extraction.md`
- `10-short-prompt-compiler-and-generation.md`

Batch 2 scope:

- full generation
- localization
- short adaptation and generation

This is strictly planning-only. Do not implement production code. Do not prepare implementation by editing source code. Do not begin batch 3, 4, or 5 work. Do not drift into unrelated refactors.

## Hard Constraints

- Inspect source code before writing or changing any docs.
- Treat source code as authoritative when docs conflict.
- Use `rg` and targeted file reads. Do not preload unrelated docs.
- Ignore the root `README.md` for architecture guidance.
- Ignore `docs.bak`.
- Preserve unrelated working-tree changes.
- Do not create branches, commit, push, merge, rebase, reset, stash, or discard files.
- Do not run paid API calls.
- Do not edit production code.
- Do not edit tests, fixtures, or generated assets unless a plan doc explicitly requires a doc reference.
- Do not stop after analysis. You must write the final planning docs in the repo.

## Required Inspection Order

1. Inspect current batch-1 planning artifacts so batch 2 aligns with the established baseline:
   - `docs/plans/story-ir-and-artifact-variant-modeling-plan.md`
   - `docs/plans/story-ir-and-artifact-variant-modeling.md`
   - `docs/plans/03-source-cleaning-and-provenance-plan.md`
   - `docs/plans/04-genre-policies-and-full-story-contract-plan.md`
2. Inspect the live story rewrite/localization implementation:
   - `apps/cli/src/story-localization-commands.ts`
   - `apps/cli/src/story-full-rewrite-command.ts`
   - `apps/cli/src/story-short-rewrite-command.ts`
   - `packages/story-localization/src/story-localization.service.ts`
   - `packages/story-localization/src/story-localization-batch-service.ts`
   - `packages/story-localization/src/localization-prompt-builder.ts`
   - `packages/story-localization/src/short-rewrite.service.ts`
   - `packages/story-localization/src/short-rewrite.prompt.ts`
   - `packages/story-localization/src/story-localization.schemas.ts`
   - `packages/story-localization/src/full-rewrite.resolution.ts`
   - `packages/story-localization/src/short-rewrite.resolution.ts`
   - `packages/story-localization/src/story-markdown-renderer.ts`
3. Inspect only the minimum supporting code needed to explain lineage, cache, and output ownership:
   - `packages/story-localization/src/index.ts`
   - `packages/story-localization/src/story-localization.types.ts`
   - `packages/story-localization/src/language-profiles.ts`
   - `packages/shared/src/episode-filesystem.ts`
   - `packages/config/src/index.ts`
4. If and only if a file is directly referenced by the inspected code and materially affects batch 2, read it. Otherwise stop.

## What You Must Determine

You must determine what is already done and what is still missing for the remaining batch-2 work:

- full generation and optimization
- localized full generation
- English short adaptation and localized short generation
- lineage and contract boundaries between full and short artifacts
- what full generation may read and write
- what localization may read and write
- what short generation may read and write
- what must invalidate downstream outputs
- what must never be regenerated independently
- how sync and batch behavior differ today
- which gaps still exist after batch 1

## Required Output

Create repository-grounded planning docs, not implementation under: docs/plans/

If you choose a different split, justify it in the docs themselves and keep it equally specific.

Each plan doc must include these sections in this exact order:

1. `# <Title>`
2. `## Current State`
3. `## Gaps`
4. `## Remaining Tasks`
5. `## Decision Points`
6. `## Done Criteria`
7. `## Validation Commands`
8. `## Risks And Assumptions`

## Opinionated Content Requirements

Be strict and specific. Do not write generic architecture prose.

For the full-generation plan:

- treat the English optimized full story as the canonical upstream artifact
- define exactly what input contract full generation consumes after batch 1
- define exactly what output artifacts full generation owns
- state clearly which metadata/audio/scene/render/publication concerns are out of scope for the input contract
- identify the sync and batch paths that currently diverge
- call out cache/resume and invalidation rules only as they relate to full generation

For the localization plan:

- treat localization as consuming the validated optimized English full artifact, not raw source
- define the localized full-story contract and its boundaries
- state which fields are allowed into localization prompts and which are forbidden
- define what localization may reuse from the full-generation stage
- distinguish full localization from any legacy combined full+short behavior
- identify any batch manifest or import implications that localization actually needs

For the short-adaptation/generation plan:

- treat short generation as derived from validated full artifacts
- remove raw-source compatibility paths from the plan unless they are explicitly retained for compatibility
- distinguish English short from localized short lineage
- define short-specific constraints such as hooks, beat structure, word range, and duration targets
- identify short-specific schemas, persistence, and manifest implications
- state clearly what should invalidate shorts when upstream full artifacts change

## Validation Requirements

Every plan doc must include narrow validation commands that actually exist in the repository.
Prefer filtered `pnpm` test/typecheck commands and direct file-existence checks over repo-wide validation.
Do not add any paid API or network validation steps.

## Quality Bar

- The result must be opinionated and implementation-guiding, not exploratory.
- Every remaining task must be mapped to likely files or modules.
- Every major decision point must have a recommended direction, not just a list of options.
- If a behavior is already correct, say so and do not plan work for it.
- If a behavior is partially correct, describe the exact delta, not the whole subsystem.
- Keep the scope pinned to batch 2. Mention batch 3+ only as deferred follow-up if a dependency makes that necessary.

## Final Response

When finished, report:

- which files you added or changed
- which validation commands you ran, if any
- anything you could not verify
