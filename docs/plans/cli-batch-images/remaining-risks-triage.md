# Batch Image Remaining Risks Triage

Date: 2026-07-04
Branch: `plan/remove-legacy-and-normalize-paths`
Base commit inspected: `a3f62dd82ba3620a4c78bab0ab2c296eea7be075`

## Scope Summary

This triage separates in-scope batch-image work from unrelated workspace state.
It does not authorize destructive cleanup.

## In-Scope Files

These paths are part of the batch-image implementation and are safe to review or
edit while working on Tasks 10-13:

- `apps/cli/src/images-batch-commands.ts`
- `apps/cli/src/images-batch-commands.unit.test.ts`
- `packages/image-generation/src/image-batch-planner.ts`
- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- `packages/image-generation/src/image-batch-service.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`
- `packages/image-generation/src/image-batch-normalization.ts`
- `packages/image-generation/src/image-batch.schemas.ts`
- `packages/image-generation/src/image-batch.types.ts`
- `docs/cli-batch-images.md`
- `docs/plans/cli-batch-images/batch-image-audit.md`
- `docs/plans/cli-batch-images/provider-reference-semantics-checklist.md`
- `docs/plans/cli-batch-images/remaining-risks-triage.md`

## Unrelated Local Changes

These changes were present in the worktree and are outside the batch-image
hardening scope. Do not modify or revert them as part of this work:

- General docs edits:
  `README.md`, `docs/cli-steps.md`, `docs/cli-video.md`,
  `docs/story-to-video.md`, `docs/plans/cli-batch-images/README.md`
- Rendering and motion work:
  `packages/rendering/src/index.ts`,
  `packages/rendering/src/index.unit.test.ts`,
  `packages/rendering/src/filter-builders.unit.test.ts`,
  `packages/rendering/src/motion/`, `docs/plans/ffmpeg-motion-presets/`,
  `todo-prompts/motion-pictures/`
- Unrelated archives and content staging:
  `content-ideas/content/*.zip`,
  `content-ideas/content/youtube-horror-rewrites/other/`,
  `content-ideas/professional-youtube-horror-stories.zip`,
  `todo-prompts/risk-followups/`

## Stale Artifact Notes

These artifacts are treated as unrelated workspace concerns unless a separate
task explicitly asks for cleanup or regeneration:

- `docs/diagrams/rendered/story-artifact-lineage.{svg,png}`
- `docs/diagrams/rendered/story-stage-state-machine.{svg,png}`
- `apps/cli/bin/mediaforge.js`

Status:

- The diagram files are tracked render outputs. They may fail freshness checks
  even when the batch-image source changes are correct.
- The CLI runtime file is a built artifact. It may not reflect the current
  source-registered `images batch` subtree until the CLI package is rebuilt.

## Verified Behavior

- Full-scene multilingual same-path collisions can be prepared when they are
  proven equivalent and represented as one owner item plus alias followers.
- Unsafe full-scene same-path collisions fail during preparation.
- Short batch prepare/import/resume only submits native generation items.
- Deterministic short transforms remain local-only.
- Reference-assisted batch edit requests fail during preparation with
  `unsupported-edit-batch-request`.

## Remaining Risks

- `/v1/images/edits` batch request semantics for image/file inputs remain
  unverified against a real provider. Use the manual checklist before widening
  support.
- Short multilingual batching still lacks an alias policy because portrait
  outputs are shared.
- Stale rendered diagrams can still fail `pnpm docs:diagrams:check` even though
  they are not part of the batch-image implementation.
- `apps/cli/bin/mediaforge.js` can mislead operators if they inspect the built
  runtime instead of the source tree.

## Safe Verification Commands

```bash
pnpm test:focused -- apps/cli/src/images-batch-commands.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm --filter @mediaforge/shared --filter @mediaforge/image-generation --filter @mediaforge/rendering --filter @mediaforge/cli typecheck
```

## Safe Cleanup Guidance

Do not run cleanup by default. If a separate maintenance task authorizes it:

- Rebuild the CLI runtime intentionally instead of editing `apps/cli/bin/mediaforge.js`.
- Refresh diagram renders from their owning docs pipeline instead of deleting the
  rendered files blindly.
- Remove unrelated untracked archives only after confirming they are not needed
  by the user.
