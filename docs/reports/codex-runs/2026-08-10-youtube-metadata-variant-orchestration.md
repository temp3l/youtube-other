# Variant-aware YouTube metadata orchestration

Date: 2026-08-10

Changed files: `packages/metadata/src/youtube-metadata-orchestration.ts`, metadata cache/delivery contracts, Veronica and History metadata adapters, genre CLI registrations, focused tests, and `docs/architecture/media-assets-and-delivery.md`.

Checks: focused Vitest metadata/History/Veronica/CLI suites passed (46 tests); Veronica delivery suite passed (3 tests); affected metadata, Veronica, History, and CLI typechecks passed; targeted ESLint passed. Provider-free CLI dry-runs passed for Veronica `short/en` and `short/it`.

Result: narration, artifact paths, and cache identity are explicitly genre/episode/locale/variant scoped. The Italian helper remains a declarative localization-context helper only; it is not a second generator.

Risks/follow-up: this checkout contains no real History episode directory, so an on-disk History smoke run was not available. No commit was created. Base commit: `d9af44151ff22d972bc9e0428d3084921132059c`.
