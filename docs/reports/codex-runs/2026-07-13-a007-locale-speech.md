# A-007 locale speech

Summary: implemented deterministic five-locale math speech under explicit user gate
override. Speech format bumped to `math-speech-format.v2`, intentionally invalidating
localization/TTS fingerprints. Exact integers/decimals now use locale lexicon digits
instead of grouped display punctuation; negatives, rationals, powers, roots, and units
have deterministic spoken forms. Unsupported symbols/functions fail visibly.

Changed paths: `packages/math-education/src/localization/{tts-lexicon.ts,locale-formatter.ts,localization.unit.test.ts}`;
this report.

Tests: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/math-education/src/localization/localization.unit.test.ts`
failed on expected fixture drift twice, then passed, 9 tests. `pnpm --filter
@mediaforge/math-education typecheck` passed.

Commit: not committed.

Risks: linguistic approval was bypassed by request, not independently reviewed. Speech is
conservative digit-by-digit, so naturalness is lower than full locale prose.
