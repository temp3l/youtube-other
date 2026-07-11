Summary: Regenerated and replaced episode 035 English full story. Four localized full generations returned complete model responses but remained blocked by a runtime `Character names are missing` result despite containing `Jonah Rainer`. Shorts could not start without accepted localized full parents. Paid retries stopped at the non-convergence limit.

Changed files:
- Episode 035 English full canonical script, sidecar, manifest, compatibility script, debug, cache, and failed localization artifacts
- `packages/story-localization/src/canonical-facts.service.ts`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/story-localization.service.ts`
- Matching validator and prompt-compiler tests
- `docs/reports/codex-runs/2026-07-11-episode-035-regeneration.md`

Tests/checks:
- Focused validator and prompt-compiler tests: 36 passed
- Exact localized-full regression: passed after fixture correction
- Story-localization and CLI builds: passed
- Path checks: English full present (1625 words); all localized fulls and all shorts missing
- Misplaced `episodes/script.md` resolver artifacts: removed

Risks: Runtime validation still disagrees with direct validation of the same response. Likely owner: story-localization preflight/StoryIR construction or stale per-run validation inputs. Smallest follow-up: persist the effective StoryIR and rename map beside failures, then compare them with the direct validator reproducer before any provider retry.

Commit: `96bc991b4f481e79eabaf0d4c4949f9ef50da7db`
