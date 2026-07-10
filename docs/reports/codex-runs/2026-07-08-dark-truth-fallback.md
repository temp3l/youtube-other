Summary: Added a Dark Truth-only fallback that ensures canonical source materialization leaves a minimal `Episode Metadata` block with `Fictional horror narration.` when the raw pack source omits metadata, so `stories rewrite-full` can infer genre instead of failing on `UNKNOWN_GENRE_UNSAFE`.

Changed paths:
- `packages/story-localization/src/short-rewrite.bootstrap.ts`
- `packages/story-localization/src/source-cleaning-persistence.ts`
- `packages/story-localization/src/story-localization.unit.test.ts`
- `docs/multilingual-story-localization-settings.md`

Tests/checks run:
- `pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts`
- `pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts -t "rejects localized full outputs that would require short-specific repair"`
- `pnpm test:focused -- packages/story-localization/src/story-localization.unit.test.ts -t "adds a Dark Truth fallback disclosure when materializing a raw source without metadata"`

Results: the focused suite hit an unrelated existing ENOENT in `rejects localized full outputs that would require short-specific repair`. The new Dark Truth test failed before the final wrapper-side fallback fix was added, and I could not rerun after the last patch because the focused test budget was exhausted.

Risks: the new wrapper fallback is unverified; one unrelated unit test remains failing in the focused suite.
