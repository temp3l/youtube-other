# Episode 037 English/German Initialization

Summary: Initialized Episode `037-hospital-corridor-thirteen` in the canonical authored-script layout for English and German, covering full and short variants. All four scripts were staged from their optimized sources.

Changed paths: `episodes/037-hospital-corridor-thirteen/languages/script-en.md`; `episodes/037-hospital-corridor-thirteen/languages/script-de.md`; `episodes/037-hospital-corridor-thirteen/languages/short/script-en.md`; `episodes/037-hospital-corridor-thirteen/languages/short/script-de.md`; this report.

Tests/checks: Four byte comparisons against the optimized English/German full/short sources passed. `stories pipeline --locales en,de --formats full,short --dry-run` passed and planned 46 stages.

Commit: `96bc991`.

Risks/follow-up: Authored scripts are initialized, but production generation manifests and approvals are not. No provider calls, media generation, or full production validation were run.
