# @mediaforge/educational-renderer

An isolated, deterministic TypeScript package for rendering educational videos with local Linux tools.
It has no dependency on Mediaforge application/domain packages and is not registered in any production
CLI or workflow. The repository's established `@mediaforge/*` scope was selected over `@youtube/*`.

## Scope and architecture

The public API accepts a versioned neutral visual plan, renders every semantic scene independently,
verifies it with FFprobe, promotes it atomically to a content-addressed cache, then composes verified
segments with FFmpeg. Static scenes are one SVG input expanded to a duration by FFmpeg; no frame
sequence is written. Audio, subtitles, and container composition are separate from visual cache keys.
Transitions are validated and included in cache identity; v0.1 records fade metadata but renders a
hard scene boundary. Animated segments remain a compatible future manifest representation.

Non-goals include lesson planning/AI, TTS, image APIs, Mediaforge integration, publishing, thumbnails,
3D, remote rendering, and a web UI.

## Requirements

- Node.js 22+ and pnpm 10
- FFmpeg and FFprobe with `libx264`, librsvg, and AAC
- DejaVu Sans at `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`
- Optional: Graphviz, Blender, VA-API, or QSV (reported but not required)

No network access is used during validation or rendering. DejaVu is an open font; the package records
its file hash and never silently substitutes another font. German, English, Spanish, French, Portuguese,
and common mathematical symbols are supported by the input contract and default font.

## Build and test

```bash
pnpm --filter @mediaforge/educational-renderer build
pnpm --filter @mediaforge/educational-renderer typecheck
pnpm --filter @mediaforge/educational-renderer lint
pnpm --filter @mediaforge/educational-renderer test
pnpm --filter @mediaforge/educational-renderer test:integration
```

## TypeScript API

```ts
import {createEducationalRenderer} from '@mediaforge/educational-renderer';

const renderer = await createEducationalRenderer({
  workspaceDirectory: process.cwd(),
  cacheDirectory: `${process.cwd()}/.cache/educational-renderer`,
  temporaryDirectory: `${process.cwd()}/.artifacts/educational-renderer-tmp`,
});
const result = await renderer.render({
  requestVersion: '1',
  jobId: 'linear-equations',
  visualPlan,
  profile: 'preview',
  outputDirectory: `${process.cwd()}/.artifacts/linear-equations`,
});
```

The stable interface exposes `validate`, `render`, `renderScene`, `compose`, `inspectCapabilities`,
`benchmark`, `inspectCache`, and `cleanCache`. Contracts and schemas are exported explicitly from
`@mediaforge/educational-renderer/contracts`; stable errors come from `./errors`.

## CLI

After `build`, invoke `packages/educational-renderer/bin/educational-renderer.js` or the workspace bin:

```bash
educational-renderer validate --plan fixtures/linear-equations/visual-plan.json --profile preview
educational-renderer render --plan fixtures/linear-equations/visual-plan.json --profile preview --output .artifacts/linear-equations --audio fixtures/linear-equations/narration.wav --subtitles fixtures/linear-equations/subtitles.vtt
educational-renderer render-scene --plan fixtures/linear-equations/visual-plan.json --scene equation-setup --profile preview --output .artifacts/linear-equations
educational-renderer render --plan fixtures/linear-equations/visual-plan.json --profile preview --output .artifacts/linear-equations --resume
educational-renderer render --plan fixtures/linear-equations/visual-plan.json --profile preview --output .artifacts/linear-equations --changed-only
educational-renderer inspect --json
educational-renderer benchmark --fixture fixtures/linear-equations --profiles preview,draft,youtube-full --encoders libx264,h264_vaapi,h264_qsv --output .artifacts/benchmarks
educational-renderer cache inspect --verify
educational-renderer cache clean --corrupt-only
```

`--json` suppresses human progress output. Errors go to stderr; stack traces require `--verbose`.
Exit codes are 0 success, 1 internal/adapter failure, 3 invalid plan, 5 incomplete scene render,
6 composition failure, and 130 interruption.

## Visual plan and profiles

Version 1 supports `title`, `text`, `equation`, `equation-transformation`, `coordinate-graph`, `geometry`,
and `summary`. Linear graph expressions use a restricted `ax+b` grammar; arbitrary JavaScript is never
evaluated. KaTeX validates equations before FFmpeg starts. Limits cover scene count/duration, dimensions,
frame rate, coordinates, graph ranges, strings, and IDs.

Profiles: preview 960×540/15/ultrafast, draft 1280×720/24/veryfast, youtube-full
1920×1080/24/veryfast, and independently laid-out youtube-short 1080×1920/24/veryfast. All use yuv420p.
Frame rate can be explicitly set to 15, 24, or 25. Default concurrency is one and is capped at two.

## Cache, outputs, and determinism

Scene keys include normalized scene data, schemas/format/renderer versions, profile, timing/transition,
locale only when sensitive, theme, font identity/hash, KaTeX/SVG identity, deterministic seed, and
representation. Cache manifests and SHA-256 detect missing/corrupt objects. Locks expire after five
minutes. Temporary videos are validated then atomically renamed; output scene files are hard-linked
when possible. Successful scenes survive later failures. Narration/subtitle changes only recompose.

Outputs contain `final/lesson.mp4`, `manifest.json`, `result.json`, and `renderer/scenes/*/scene.mp4`.
Incomplete jobs still receive manifest/result JSON. Cache cleaning can invalidate hard-linked global
objects without deleting already-linked output scene files.

The same host/toolchain/font/profile/input is intended to be byte-reproducible, but only visual and
semantic equivalence is promised across FFmpeg builds or CPUs. Timestamps exist in manifests, never
rendered pixels. Timezone and locale are fixed for subprocesses.

## Capabilities, benchmark, and troubleshooting

Inspection distinguishes available, unavailable, untested, and failed-self-test states. Hardware
encoders are never selected by default; an encoder listing without `/dev/dri/render*` is unavailable.
The benchmark continues past unavailable optional encoders and writes `benchmark.json` with cold/warm
duration, output bytes, cache hit rate, tool/machine identity, and status.

- `MISSING_TOOL`: install FFmpeg/FFprobe.
- `MISSING_FONT`: install `fonts-dejavu-core` or explicitly configure an open font file.
- `INVALID_FORMULA`: correct KaTeX syntax before rendering.
- `OUTPUT_VALIDATION_FAILED`: inspect FFprobe/tool versions and available disk space.
- `CACHE_CORRUPTED`: rerender automatically repairs the entry; use `cache clean --corrupt-only` if needed.

Known limitations: v0.1 has static SVG scenes only, fade metadata is not animated, formula pixels use a
safe SVG text representation after KaTeX validation rather than KaTeX DOM rasterization, cache layers
are designed but not independently materialized, hardware self-test is benchmark-gated but not yet
executed automatically, and peak RSS/temporary-byte accounting is best-effort. A future integration
adapter may depend on this API; this package must never depend back on the application.
