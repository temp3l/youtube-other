# L05 timing-only narration reconciliation

## Changed files

- `apps/cli/src/index.ts` — staged Veronica Shorts narration now invokes timing-only reconciliation after selected-audio promotion.
- `packages/strategic-reinvention/src/positioning-production-adapter.ts` — added persisted-artifact timing reconciliation without semantic/prompt regeneration.
- `apps/cli/src/veronica-short-pacing.ts` — cached selected pacing audio is re-promoted after assembly.
- `episodes/l05-s01-you-dont-need-a-publisher/` — selected EN/DE WAVs, canonical timing, localized events, captions, and delivery manifests.

## Checks

- Strategic and CLI builds: passed.
- Focused localization tests: 2 passed.
- Staged narration `generate`, `assemble`, cached `generate`, and final status: EN/DE `READY`.
- Integrity: selected WAV hashes match pacing, timing, localized artifacts; six image reuses each; zero image/video outputs; `git diff --check` passed.

## Result and risks

English is 53.193s; German is 50.639s. Both use `derived-audio-silence-alignment`; semantic plan, treatments, Bible, and prompt hashes stayed unchanged. Source-grounded QA and human pre-image approval remain blocking image requests. Commit: `30aba68`.
