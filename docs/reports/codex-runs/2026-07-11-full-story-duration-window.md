Summary: Raised shared full-story timing defaults to allow roughly 10-minute full videos, switched sync and batch full-output constraints to use the shared duration window instead of source-length-derived limits, and fixed the structured-output schema so required nullable localization fields are OpenAI-compatible. Episode `035-the-wendigo-legend` was rerun after rebuild; the old word-count gate is cleared, but localized full outputs still fail content validation and localized Shorts still need an accepted English Short parent.

Changed paths:
- `packages/story-localization/src/narration-constraints.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-localization-batch-service.ts`
- `packages/story-localization/src/story-prompt-response-schemas.ts`
- `packages/story-localization/src/localization-fidelity.ts`
- `docs/architecture/story-localization.md`

Tests:
- `pnpm --filter @mediaforge/story-localization build`
- `pnpm mediaforge -- stories localize --file episodes/035-the-wendigo-legend/source/035-the-wendigo-legend-en-full.md --source-dir ./episodes --output-dir ./episodes --languages de,es,fr,pt --include-english-short --mode sync --force --json`

Commit: `96bc991b4f481e79eabaf0d4c4949f9ef50da7db`

Unresolved risks: `035` still has stale/conflicting English artifacts (`languages/script-en.md` differs from `en/full/script.md`), per-locale failed outputs under `.batch/failed/`, and localized Shorts are blocked until an English Short artifact is accepted.
