# Veronica visual/localization pipeline run

## Summary

Added strict visual-treatment/bible artifacts, canonical Veronica reference-pack verification, deterministic final image-prompt compilation, locale-owned timing/alignment/captions/events, per-scene cross-locale image reuse, explicit locale visual overrides, and render/publish readiness lineage. Normal image resume/review paths now require deterministic prompt artifacts. Paid provider and publishing calls: 0.

## Changed files

- `packages/strategic-reinvention/src/{veronica-visual-artifacts,veronica-localized-production,veronica-image-prompt-compiler,veronica-provider-image-prompt-artifact,positioning-production-adapter,positioning-visual-contracts,index}.ts`
- `packages/strategic-reinvention/src/veronica-visual-localization.unit.test.ts`
- `apps/cli/src/{veronica-image-prompt-compiler-composition,veronica-media-commands,images-resume-command,veronica-pre-image-review-pack}.ts`
- `docs/architecture/veronica-supplemental-media/overview.md`

## Tests/checks

- Visual/localization focused tests: 2 passed.
- Strategic typecheck/build: passed.
- CLI build: passed after two repairs.
- `git diff --check`: passed.
- Compiler focused suite: 4 passed, deterministic case failed on leaked validator wording, 1 not run after bail; repaired but not rerun after retry budget.
- L06-S01 cache-only acceptance: 0 API calls; stopped after two repairs at legacy plan missing `visualStoryBible`; fallback added but not rerun.

## Risks/follow-up

Rerun the compiler test and L06-S01 acceptance in a fresh verification budget. Confirm emitted artifacts and run one German localized preparation. Commit: `30aba68` (pre-existing HEAD; changes uncommitted).
