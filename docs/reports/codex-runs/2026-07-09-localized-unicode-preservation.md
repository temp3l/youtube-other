# Localized Unicode Preservation

Date: 2026-07-09

Changed files:
- `packages/shared/src/index.ts`
- `packages/shared/src/index.unit.test.ts`
- `packages/story-localization/src/localized-content-text.ts`
- `packages/story-localization/src/localized-content-text.unit.test.ts`
- `packages/story-localization/src/__fixtures__/localized-unicode/bad-german-ascii.md`
- `packages/story-localization/src/__fixtures__/localized-unicode/good-german-unicode.md`
- `packages/story-localization/src/generated-story-validator.ts`
- `packages/story-localization/src/generated-story-validator.unit.test.ts`
- `packages/story-localization/src/story-localization.service.ts`
- `packages/story-localization/src/story-prompt-module-registry.ts`
- `packages/story-localization/src/story-prompt-response-schemas.ts`
- `packages/speech/src/openai-tts-request.unit.test.ts`
- `docs/architecture/story-localization.md`

Summary:
- Added NFC-only localized content normalization and Unicode-loss diagnostics.
- Added German hard gate for ASCII-transliterated narration before TTS.
- Added softer warnings for other accent-heavy locales.
- Kept ASCII folding scoped to `toAsciiSlug`/`slugify`.
- Updated localization prompts and docs.

Tests/checks:
- Passed: focused Vitest for localized content, generated validator, shared helper, and TTS request tests.
- Passed: `pnpm typecheck:affected`.
- Failed: `pnpm lint:affected` on unrelated `packages/story-localization/src/story-quality-gate.ts`.

Risks/follow-up:
- Dry-run localization flow not run due verification budget.
- Lint failure should be handled separately.
