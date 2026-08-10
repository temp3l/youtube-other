# Dual-genre semantic image-prompt preflight

Date: 2026-08-10

## Summary

Preserved the interrupted Veronica implementation, extracted its provider, strict-schema, cache, validation, retry, chunking, and deterministic assembly logic into `@mediaforge/shared`, then added thin Veronica and History adapters. Both image-resume paths now derive or reuse a canonical brief before image generation and fail closed on invalid output. Follow-up CLI smoke work corrected canonical-source discovery, global dry-run handling, and OpenAI Structured Outputs schema normalization. It persisted the validated offline L01-S01 fixture; no image, research, TTS, rendering, or successful paid provider call occurred.

## Changed files

- Shared: `packages/shared/src/semantic-image-prompt.ts`, its unit test, and package export.
- Veronica: semantic adapter, L01-S01 fixture/test, package export, CLI/resume integration.
- History: V3.5 semantic adapter/test, package export, CLI/resume integration.
- CLI/docs: targeted command tests, shared architecture doc, Veronica/History operator docs, docs index.

## Tests and checks

- Focused Vitest: 10 files, 77 tests passed (shared core, Veronica semantics/diversity, History fixtures/maps/diagrams/references, CLI/resume).
- Affected package typechecks: shared, strategic-reinvention, History, and CLI passed after rebuilding dependency outputs.
- Targeted ESLint on all affected TypeScript files: passed.
- `git diff --check`: passed.
- Follow-up shared and CLI builds: passed. Veronica `--dry-run` now exits before provider dispatch; fixture derivation and inspection succeeded.

## Risks remaining

- A user-authorized live Veronica semantic attempt was rejected by provider timeout/schema validation before a result was produced; it did not persist a live brief. History remains blocked by the absence of an approved V3.5 episode plan in this checkout.
- No full corpus derivation or paid image generation was performed; human prompt-preview review remains the rollout gate.

## Follow-up

- Inspect Veronica: `pnpm mediaforge -- veronica-media images inspect-image-prompts --workspace episodes --episode-id l01-s01-being-good-isnt-enough --json`
- Inspect History: `pnpm mediaforge -- history visuals inspect-image-prompts history-youtube-history-02-napoleons-invasion-of-russia --output-root episodes --json`
