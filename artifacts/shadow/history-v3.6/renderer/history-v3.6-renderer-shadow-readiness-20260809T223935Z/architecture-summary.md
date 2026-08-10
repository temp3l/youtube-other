# V3.6 renderer shadow boundary audit

## Existing boundaries

- `history-map-compiler-v35.ts` and the V3.5 diagram compiler/topology modules create semantic map states and diagram edges from claims and narration. V3.6 must not call them.
- `history-render-adapter-v35.ts` is the production boundary from approved V3.5 plans to generic scene plans. It does not render map/diagram pixels and remains unchanged.
- `apps/cli/src/shot-preview-output.ts` and `packages/image-generation/src/index.ts` demonstrate local deterministic SVG/Sharp preview composition. Their presentation conventions are reusable; their narration/scene interpretation is not.
- `packages/rendering/src/index.ts` is the FFmpeg production boundary. It is outside this shadow path.

No dedicated production map/diagram SVG renderer exists. V3.5 map and diagram state creation is semantic planning, not presentation rendering. The safe insertion point is therefore an additive V3.6 adapter after an accepted compiler intent and before a local shadow-only SVG preview writer.

## Reuse and exclusions

Reusable presentation-only pieces are SVG escaping/composition, deterministic coordinates, fixed fonts/colors, and local Sharp conversion for review PNGs. Excluded paths are all V3.5 semantic compilers, narration-driven placeholder composition, production scene-plan routing, FFmpeg, geocoding, and provider calls.

The V3.6 adapter consumes only typed compiler intents, resolved canonical coordinates supplied by the caller, and fixed presentation configuration. It emits deterministic JSON render specs and optionally SVG/PNG review previews under `artifacts/shadow/history-v3.6/renderer/`.

Render-spec identity covers the contract version, compiler intent ID, and semantic payload. Deterministic layout is derived from those inputs but is deliberately not semantic identity. Output contains no timestamps, paths, random seeds, or machine-specific values.
