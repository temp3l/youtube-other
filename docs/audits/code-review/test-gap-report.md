# Test Gap Report

## Existing Test Summary

The repository has 127 focused test files under `apps/**/src` and `packages/**/src`. Coverage is strongest around shared path helpers, story workflow schemas, image batch planning/import/retry, rendering fixtures, speech/narration helpers, metadata generation, and CLI command registration.

Notable existing files:

- `packages/shared/src/episode-filesystem.unit.test.ts`
- `packages/image-generation/src/image-batch-planner.unit.test.ts`
- `packages/image-generation/src/image-batch-service.unit.test.ts`
- `packages/rendering/src/index.unit.test.ts`
- `apps/cli/src/story-pipeline-command.unit.test.ts`
- `packages/youtube-upload/src/index.unit.test.ts`
- `apps/cli/src/render-remote-shell.unit.test.ts`

## Missing Tests By Area

- Path resolution: generated-script versus authored-script ownership; generated image filename containment.
- CLI behavior: dry-run output should distinguish canonical authored paths from generated runtime paths.
- Localization routing: `pt` behavior across shared workflow and Dark Truth parser.
- Image reuse identity: short portrait aliasing with same subject/output but different localized visual intent.
- Full/short separation: independent short manifests, 9:16 timeline validation, and short upload manifest selection.
- Manifest validation: remote render job/result, scene generation manifest, short scene manifest, upload selection manifest.
- Batch provider boundary: provider JSONL line schemas and malformed response bodies.
- Reference images: edit-batch blocked behavior plus future real-provider verification notes.
- Render input construction: missing scene audio should fail before render; caption path escaping; absolute source image rejection.
- Remote render job handling: partial result sets, missing metadata, failed metadata, timeout, log retrieval, cleanup cutoff.
- Resume/retry: story workflow fingerprints from real inputs; upload selection when stale outputs coexist.
- Legacy compatibility: explicit adapter tests before deleting stale layout support.

## Required Characterization Tests Before Refactor

1. `packages/shared/src/episode-filesystem.unit.test.ts`: generated image filename traversal rejection.
2. `apps/cli/src/story-full-rewrite-command.unit.test.ts`: current dry-run generated output paths, marked legacy/generated.
3. `packages/story-localization/src/story-localization.unit.test.ts`: generated full/short writes and compatibility outputs.
4. `packages/rendering/src/index.unit.test.ts`: render refuses missing scene audio when no validated audio manifest exists.
5. `packages/rendering/src/index.unit.test.ts`: subtitle path escaping and absolute shot source path rejection.
6. `packages/image-generation/src/image-batch-service.unit.test.ts`: malformed provider body and malformed auxiliary manifests.
7. `packages/image-generation/src/image-batch-planner.unit.test.ts`: short alias collision when visual intent differs.
8. `packages/youtube-upload/src/index.unit.test.ts`: manifest-first video selection beats stale scanned files.
9. `apps/cli/src/story-pipeline-command.integration.test.ts`: resumed workflow detects changed input fingerprints once implemented.
10. New remote worker tests or script harness: invalid job manifest and partial result behavior.

## Recommended Fake Providers

- Fake OpenAI batch client for files/batches/content retrieval.
- Fake image generator for direct image responses.
- Fake FFmpeg/process runner returning media probe fixtures.
- Fake remote render client/worker result files.
- Fake YouTube client for upload/thumbnail behavior.
- Temporary filesystem workspaces for path and manifest tests.

## Recommended Smoke Tests

- `pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts`
- `pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts`
- `pnpm test:focused -- packages/image-generation/src/image-batch-service.unit.test.ts`
- `pnpm test:focused -- packages/rendering/src/index.unit.test.ts`
- `pnpm test:focused -- packages/youtube-upload/src/index.unit.test.ts`
- `pnpm test:focused -- apps/cli/src/story-pipeline-command.unit.test.ts`

## Suggested Verification Commands

Use `scripts/test-focused.sh` through:

- `pnpm test:focused -- <test-file>`
- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 <test-file>`
- `pnpm exec vitest run -c vitest.integration.config.ts --bail=1 <test-file>`
- `pnpm --filter @mediaforge/<package> typecheck`
- `git diff --check -- docs/audits/code-review docs/plans/code-review-follow-up`

Do not run broad tests, broad builds, provider calls, uploads, remote renders, or fixture regeneration without explicit authorization.
