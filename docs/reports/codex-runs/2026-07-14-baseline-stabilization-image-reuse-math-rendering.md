# Baseline Stabilization: Image Reuse and Math Rendering

## Summary

Continued Batch 1 through F11-F22. Image reuse now asserts paid-call savings,
generated/reused outcomes, manifest ownership, source scene, and output hash
equality instead of an obsolete minimum call count. Math fixtures now use the
strict preceding-stage fingerprint chain and current owned-file error wording.
No production behavior changed.

## Changed files

- `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- `packages/math-rendering/src/math-rendering.unit.test.ts`
- `docs/refactor/audit/README.md`
- This report.

## Tests/checks run and results

- Exact F11 test: failed once, then passed.
- Image-pipeline unit file: passed 42/42.
- Math-rendering unit file: failed at F21, then F22, then passed 15/15 after two fixture repairs.
- Targeted ESLint for both changed test files: passed.
- Targeted `git diff --check`: passed.

## Risks and follow-up

Batch 1 remains `IN_PROGRESS`; no broad baseline was run. F02-F03 were skipped
earlier and remain the next bounded cluster: reconcile their canonical authored
script and legacy-fallback expectations without weakening resolver validation.
Batch 2 remains blocked.
