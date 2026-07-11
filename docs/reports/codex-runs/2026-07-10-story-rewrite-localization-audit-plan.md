# Story Rewrite Localization Audit Plan

Date: 2026-07-10

## Reproduction

- Inspect Episode 034 and Episode 030 final scripts plus optimized source artifacts.
- Run focused validation against renderer and story-localization validators.

## Independently Testable Changes

1. Strengthen deterministic narration validation for scaffolding leakage, repeated boilerplate, alternative-rule placeholders, low specificity, and severe localization compression.
2. Make short duration validation use actual narration metrics instead of model-supplied metadata.
3. Render production instructions and duration metadata from structured language/profile data, not model-generated instruction fields.
4. Bump prompt/compiler/schema identities where validation or prompt contracts change so incompatible caches do not look equivalent.
5. Add Episode 034 regression fixtures/tests for English commentary, localized repeated motif blocks, generic localization loss, short duration mismatch, wrong narrator language, and metadata recalculation.
6. Document root causes, fixes, checks, and remaining risks in the required run report.
