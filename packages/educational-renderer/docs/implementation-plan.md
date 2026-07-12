# Implementation plan

1. Package/contracts: package metadata, strict TypeScript config, versioned Zod contracts, stable
   API/errors/events, profiles, and an architecture test.
2. Infrastructure: contained paths, atomic JSON/binary promotion, canonical hashing, bounded process
   execution/cancellation, FFprobe parsing, and capability probes.
3. Rendering: semantic SVG implementations for seven scene types, KaTeX validation/cache identity,
   safe restricted linear expressions, independent static scene segments, and verified composition.
4. Cache/resume: content-addressed manifests and binaries, hash/FFprobe validation, stale/corrupt
   classification, changed-only reuse, inspection, cleaning, and incomplete job manifests.
5. Adapters: factory API and a thin Commander CLI for validate/render/render-scene/compose/inspect,
   benchmark, and cache commands.
6. Evidence: deterministic linear-equations fixture, generated local WAV and subtitles, focused unit,
   architecture, integration, render, cache, changed-scene, and audio-only checks.
7. Documentation: standalone README, ADRs, benchmark results, and required Codex run report.

## Files outside the package

- `pnpm-lock.yaml` only if pnpm requires a workspace importer for reproducible dependency resolution.
  This registration-only change cannot alter an existing runtime path.
- `docs/reports/codex-runs/2026-07-13-educational-renderer.md`, required by repository policy.

No application, production CLI, existing renderer, environment, or pipeline file will change.

## Public contracts and boundaries

The root exports the factory/interface; `./contracts` exports schemas and JSON-safe types; `./errors`
exports stable error data/classes. CLI types and internal renderer classes are not exported. Domain
code depends inward; filesystem/process/clock adapters are injected by the factory. No `@mediaforge/*`
dependency is allowed.

## Acceptance

Independent build/typecheck/lint/tests pass; real FFmpeg integration renders and verifies the preview
and youtube-full fixture; a second preview uses scene cache; changed-only invalidates one scene; audio
and subtitle recomposition reuses visuals; benchmark JSON records measured cold/warm metrics; removing
this package plus its lock importer leaves existing behavior unchanged.
