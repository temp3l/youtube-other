# Persist Veronica image prompts

Date: 2026-08-11

## Changed files

- `packages/strategic-reinvention/src/veronica-provider-image-prompt-artifact.ts`
- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
- `packages/strategic-reinvention/src/index.ts`
- `packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts`
- `apps/cli/src/veronica-pre-image-review-pack.ts`
- `apps/cli/src/veronica-long-form-dry-run.unit.test.ts`
- `docs/architecture/veronica-supplemental-media/overview.md`

## Result

Provider prompts now persist per episode locale/variant as typed JSON and Markdown. Both are manifest-tracked with SHA-256 checksums. Planning-only and audio-backed pre-image packs copy the exact persisted bytes and fail closed on missing, stale, corrupt, or mixed-snapshot artifacts.

L01 was rematerialized from 25 cache hits with zero paid calls. Its fresh planning pack is `episodes/l01-why-being-good-at-your-job-isnt-enough/review-packs/pre-image-planning/en-full/run-1786423497304`.

## Checks

- Adapter persistence test: passed (1/1).
- Review-pack persistence assertions passed before an unrelated existing semantic-blocker assertion failed.
- Strategic-reinvention build: passed.
- CLI build: passed.
- Episode/pack Markdown and JSON SHA-256 comparisons: identical.

## Remaining risk

Source/sequence QA and human pre-image approval remain required; provider readiness stays fail-closed.
