# Task 13: Derived Clip Cache And Fingerprints

## 1. Objective

Add content-addressed cache and resume behavior for derived shot clips and expensive local treatments.

## 2. Dependencies

Tasks 03, 11, and 12.

## 3. Likely Files

- `packages/shared/src/episode-filesystem.ts`
- `packages/rendering/src/index.ts`
- `packages/rendering/src/*.unit.test.ts`

## 4. Implementation Steps

- Define shot-plan fingerprint and derived-shot fingerprint helpers.
- Include source image hash, shot metadata, renderer version, output profile, overlay asset hashes, and treatment catalog version.
- Reuse existing output when manifest and file hash match.
- Invalidate only dependent clips when one source image or one shot changes.
- Add cache-hit/miss summary fields for later telemetry.

## 5. Tests

- `pnpm test:focused -- packages/rendering/src/index.unit.test.ts`
- `pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts`

## 6. Acceptance Criteria

- Motion/crop changes do not invalidate source images.
- Replacing one image invalidates only dependent shot clips.
- Partial derived-clip failure can resume.

## 7. Risks

- Cache explosion. Use content-addressing and avoid pre-rendering every simple inline shot unless configured.

## 8. Parallelization

Serial after renderer integration.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit cache/fingerprint implementation and tests only.

