# Educational renderer audit repair

Date: 2026-07-13

## Changed files

- `packages/educational-renderer/`: contracts/API, cache/filesystem containment, cancellation, cache
  identity/font use, build/bin layout, CLI, focused tests, README, and ADRs.
- `pnpm-lock.yaml`: educational-renderer importer only.
- This report.

## Checks

- Cache security Vitest: exit 0, 10 passed.
- Unit/architecture Vitest: exit 0, 31 passed.
- Package smoke + real renderer Vitest: exit 0, 8 passed.
- Package build, typecheck, and lint: exit 0.
- Filtered lockfile install: exit 0. Unfiltered attempt: exit 1 on unrelated registry 403.
- Fresh `/tmp` preview: exit 0; FFprobe verified 38s H.264/yuv420p, AAC, subtitles, and 7 segments.
- Tiled frames: title, text, equation, transformation, graph, and summary inspected without clipping.

## Risks and follow-up

Peak RSS and hardware performance remain unmeasured. Static SVG rendering has no animated transitions.
Hash-valid scene cache hits are not FFprobe-rechecked. Geometry was not fixture-rendered. Crash recovery
does not preserve a prior valid cache pair after every possible mid-promotion process death, and ENOSPC
has typed write-failure mapping but no predictive preflight. Focused test-command budget is exhausted.
