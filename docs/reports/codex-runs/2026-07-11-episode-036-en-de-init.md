# Episode 036 English/German Initialization

Summary: Initialized Episode `036-the-house-of-voices` in the canonical authored-script layout for English and German, covering full and short variants. The existing full scripts already matched the optimized sources byte-for-byte; the missing short scripts were staged from their optimized sources.

Changed paths: `episodes/036-the-house-of-voices/languages/short/script-en.md`; `episodes/036-the-house-of-voices/languages/short/script-de.md`; this report.

Tests/checks: Four byte comparisons against the optimized English/German full/short sources passed. `stories pipeline --locales en,de --formats full,short --dry-run --json` passed and planned 46 stages. `episode dry-run` passed for English full and short. German full source resolution and parsing completed, but the command then failed on the pre-existing production gate requiring `de/full/generation-manifest.json`.

Commit: `96bc991`.

Risks/follow-up: Authored scripts are initialized, but production generation manifests and approvals are not. No provider calls, media generation, or full production validation were run.
