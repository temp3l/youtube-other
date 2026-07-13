Recommended model: GPT-5/Codex  
Recommended reasoning: high

# Implement A-007: deterministic localized mathematical speech

Proceed only if A-006 is accepted. Implement only A-007.

Read `AGENTS.md`, `docs/ai-context/context-pack.md`, A-007/F-107, then inspect the locale
formatter, TTS lexicon, glossary versions, TTS fingerprints/cache keys, and existing
five-locale fixtures/tests. Preserve display formatting and semantic hashes.

Implement locale-reviewed lexical or SSML realization for integers, negatives, decimals,
rationals, powers, roots, and units in `de`, `en`, `es`, `fr`, and `pt`. Grouped display
punctuation must never be handed to a provider as the interpretation mechanism. Keep
regional policies explicit and versioned. Missing or unsupported pronunciation must fail
visibly, not silently fall back to ambiguous text.

Add five-locale display/spoken goldens covering large integers, decimal zeros, signs,
fractions, powers, roots, units, and unsupported symbols/functions. Assert display values
and semantic hashes remain stable while speech/TTS fingerprints invalidate intentionally.
Do not regenerate audio or generated assets.

Batch locale cases into one focused test command. Run a second focused cache/fingerprint
test only if separate, then at most one affected-package typecheck.

Create `docs/reports/codex-runs/YYYY-MM-DD-a007-locale-speech.md`. Document the reviewed
speech policies and any missing linguistic approval, cache/version effects, changed paths,
checks/results, commit hash or `not committed`, and the A-007 acceptance recommendation.
