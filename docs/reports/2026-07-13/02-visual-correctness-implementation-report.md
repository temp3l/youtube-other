# Visual correctness implementation report

- Source plan: `docs/plans/linux-math-renderer/02-visual-correctness.md`
- Date: 2026-07-13

## Summary

Replaced the KaTeX plain-text approximation with `native-svg-math.v1`: deterministic contained SVG text/path layout for the supported grade 5–10 TeX subset. Unsupported commands/markup fail closed with `INVALID_FORMULA`. Cache/renderer identities advanced to `educational-video.v2`/`svg-static.v3` while request version remains 1. Fade metadata was removed from v1 (hard boundaries only). Added the source fixture covering all public scenes and associated geometry labels with shapes.

## Files and tasks

Changed renderer/contracts/cache identity, fixture/docs/ADR, and focused formula tests. Completed: formula decision, validation, cache identity, hard-boundary decision, all-scene input fixture, preview/full/short real renders. Partial: visual inspection sampled formula and triangle frames; no automated bounding-box test. Not completed: no composition fades (deliberately removed).

## Checks

`vitest formula-svg`: 0. Direct unit/architecture suite: 0. Build plus integration: renderer and package smoke passed; packed consumer failed because the pnpm store is read-only (`ERR_PNPM_EROFS`). Typecheck: 0. FFprobe verified 960×540/15, 1920×1080/24, 1080×1920/24, yuv420p, 9s outputs under `/tmp/educational-visual-RXzqMv`.

## Risks and next steps

The restricted TeX grammar needs expansion only with tests. Re-run packed acceptance in a writable pnpm-store environment.
