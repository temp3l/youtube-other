# Shared Visuals Implementation Notes

Date: 2026-07-08

## Implemented Foundation

- Added strict shared visual domain contracts for `en`, `de`, `es`, `fr`, `pt` and `full | short`.
- Added canonical visual manifest, localized alignment manifest, and localized visual validation report schemas.
- Added central path helpers for:
  - `visuals/full/scene-plan.json`
  - `visuals/full/images/<sceneId>.png`
  - `visuals/short/scene-plan.json`
  - `visuals/short/images/<sceneId>.png`
  - `languages/<lang>/<variant>/script.md`
  - `languages/<lang>/<variant>/audio.mp3`
  - `languages/<lang>/<variant>/alignment.json`
  - `languages/<lang>/<variant>/visual-validation.json`
- Added manifest-driven image generation helper with idempotent reuse and explicit generator injection.
- Added deterministic localized visual validation for scene order, missing scene IDs, variant manifest paths, image paths, missing images, and timing drift.
- Added renderer-facing timeline resolution from localized alignments to canonical image paths by `sceneId`.

## Behavior

Images are canonical per variant, not per language. Full renders use only `visuals/full/images`. Short renders use only `visuals/short/images`. Localized narration can be longer or shorter; render timing comes from localized alignment rows, while image lookup remains the canonical scene ID.

Validation blocks missing scenes, unknown scenes, reordered scenes, missing images, blocked reports, and cross-variant path references. Long or short localized durations produce warnings when they exceed canonical timing guidance.

## Compatibility

Existing `shared/images/generated` and `shared/short/images/generated` helpers remain unchanged. The new `visuals/<variant>` contract is additive and does not move existing episode assets.

## Remaining Integration

- Wire CLI commands to create canonical visual manifests from existing scene plans.
- Route provider-backed image generation through `ensureCanonicalVisualManifestImages`.
- Make render orchestration load alignment and validation manifests before calling FFmpeg.
- Decide whether current short portrait derivation from full landscape images remains an explicit migration-only mode.

