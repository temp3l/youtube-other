# @mediaforge/educational-renderer

An isolated, deterministic TypeScript package for rendering educational videos with local Linux tools.
It has no dependency on Mediaforge application/domain packages and is not registered in any production
CLI or workflow. The repository's established `@mediaforge/*` scope was selected over `@youtube/*`.

## Scope and architecture

The public API accepts a versioned neutral visual plan, renders every semantic scene independently,
verifies it with FFprobe, transactionally promotes it to a content-addressed cache, then composes verified
segments with FFmpeg. Static scenes are one SVG input expanded to a duration by FFmpeg; no frame
sequence is written. Audio, subtitles, narration cues, and scene metadata are separate from visual cache
keys. Version 1 has explicit hard boundaries only; fade metadata is rejected rather than accepted inertly.

Non-goals include lesson planning/AI, TTS, image APIs, Mediaforge integration, publishing, thumbnails,
3D, remote rendering, and a web UI.

## Requirements

- Node.js 22+ and pnpm 10
- FFmpeg and FFprobe with `libx264`, librsvg, and AAC
- DejaVu Sans at `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, or an explicit `fontFile`
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

Every request and result is runtime-validated with strict version 1 Zod schemas. The stable interface exposes `validate`, `render`, `renderScene`, `compose`, `inspectCapabilities`,
`benchmark`, `inspectCache`, and `cleanCache`. Contracts and schemas are exported explicitly from
`@mediaforge/educational-renderer/contracts`; stable errors come from `./errors`.

## CLI

After `build`, invoke `packages/educational-renderer/bin/educational-renderer.js` or the workspace bin:

```bash
educational-renderer validate --plan fixtures/linear-equations/visual-plan.json --profile preview
educational-renderer render --plan fixtures/linear-equations/visual-plan.json --profile preview --output .artifacts/linear-equations --audio fixtures/linear-equations/narration.wav --subtitles fixtures/linear-equations/subtitles.vtt
educational-renderer render-scene --plan fixtures/linear-equations/visual-plan.json --scene equation-setup --profile preview --output .artifacts/linear-equations
educational-renderer inspect --json
educational-renderer benchmark --fixture fixtures/linear-equations --profiles preview --encoders libx264,h264_vaapi,h264_qsv --output "$(mktemp -u /tmp/educational-renderer-benchmark-XXXXXX)"
educational-renderer cache inspect
educational-renderer cache clean --corrupt-only
```

`--json` suppresses human progress output and writes exactly one command result, including a structured
failed/incomplete render with `INSUFFICIENT_DISK_SPACE`, to stdout. Commander, setup, and other thrown
errors go to stderr; stack traces require `--verbose`.
Exit codes are 0 success, 1 internal/adapter failure, 3 invalid plan, 5 incomplete scene render,
6 composition failure, and 130 interruption.

## Visual plan and profiles

Version 1 supports `title`, `text`, `equation`, `equation-transformation`, `coordinate-graph`, `geometry`,
and `summary`. Linear graph expressions use a restricted `ax+b` grammar; arbitrary JavaScript is never
evaluated. The native contained SVG math renderer validates and lays out the supported TeX subset before
FFmpeg starts. Limits cover scene count/duration, dimensions,
frame rate, coordinates, graph ranges, strings, and IDs.

Profiles: preview 960×540/15/ultrafast, draft 1280×720/24/veryfast, youtube-full
1920×1080/24/veryfast, and independently laid-out youtube-short 1080×1920/24/veryfast. All use yuv420p.
Frame rate can be explicitly set to 15, 24, or 25. Rendering is sequential. Successful promoted scenes
remain cached after later failures, so rerunning resumes in canonical scene order. There are no separate
resume, changed-only, or concurrency flags. Existing `final/lesson.mp4` files are refused by default;
pass `--overwrite` (or `execution.overwrite: true` through the render API) to replace one after the same
writable-path containment checks.

## Cache, outputs, and determinism

Scene keys include rendered scene data, schemas/format/renderer versions, profile, visual timing,
locale only when sensitive, theme, configured font hash, formula/SVG identity, FFmpeg build identity, deterministic seed, and
representation. Cache manifests validate key, renderer, representation, byte count, and SHA-256. A
same-filesystem promotion transaction stages the new pair and snapshots a valid prior pair before commit.
Recovery keeps a fully installed pair, otherwise restores the prior pair, or returns miss/corrupt when no
prior pair exists. A live validated lock makes inspection and cleaning leave its transaction untouched.
Locks become reclaimable after five minutes only when their recorded owner is no longer live. Output scene files are hard-linked
when possible. Successful scenes survive later failures. Narration/subtitle changes only recompose.

Outputs contain `final/lesson.mp4`, `manifest.json`, `result.json`, and `renderer/scenes/*/scene.mp4`.
Incomplete jobs still receive manifest/result JSON. Cache cleaning can invalidate hard-linked global
objects without deleting already-linked output scene files.

Every writable component is checked for symlinks immediately before mutation. Replacement content is
staged in the destination directory and promoted atomically on the same filesystem; no-overwrite final
promotion uses an exclusive hard link. The Linux/Node API does not expose a portable `openat2` directory
handle workflow, so a hostile process with the same account could still race by renaming a checked parent
in the final system-call window. Random staging names and repeated checks make that window narrow; writable
roots must therefore not be shared with untrusted same-user processes.

`@mediaforge/educational-renderer/errors` intentionally exports `toRendererErrorData` as a stable public
normalizer. Known `RendererError` data is preserved. Unknown exceptions always become the generic
`INTERNAL_ERROR` message; raw messages and stacks are available only from CLI `--verbose` diagnostics.

Before scene rendering, cache promotion, composition, and benchmark writes, each target filesystem is
checked with `statfs`. The conservative requirement is
`width × height × ceil(durationSeconds × fps) ÷ 8 × stagingCopies + 64 MiB`. A missing target uses its
nearest existing ancestor on the same filesystem. Unsupported `statfs` continues without a preflight;
actual ENOSPC from files or FFmpeg still maps to `INSUFFICIENT_DISK_SPACE`. If result JSON cannot be
written, the returned result retains the disk error and already promoted scenes remain resumable.

The same host/toolchain/font/profile/input is intended to be byte-reproducible, but only visual and
semantic equivalence is promised across FFmpeg builds or CPUs. Timestamps exist in manifests, never
rendered pixels. Timezone and locale are fixed for subprocesses.

## Capabilities, benchmark, and troubleshooting

Inspection distinguishes available, unavailable, untested, and failed-self-test states. FFmpeg/FFprobe,
font resolution, and optional-tool availability are detected separately. `libx264` is verified by a
bounded 64x64, 0.2-second encode and FFprobe check. VA-API/QSV additionally need an accessible
`/dev/dri/render*` device and the same real device encode/probe; Graphviz and Blender are inspection-only.
Hardware encoders are never selected by default. The benchmark requires a new, non-existent directory
directly under the OS temporary directory; it continues after unavailable optional encoders and records
their exact capability reason.

- `MISSING_TOOL`: install FFmpeg/FFprobe.
- `MISSING_FONT`: install `fonts-dejavu-core` or explicitly configure an open font file.
- `INVALID_FORMULA`: use only the supported grade 5–10 TeX subset.
- `OUTPUT_VALIDATION_FAILED`: inspect FFprobe/tool versions and available disk space.
- `INSUFFICIENT_DISK_SPACE`: free space on the reported output/cache/temporary filesystem and rerun.
- `CACHE_CORRUPTED`: rerender automatically repairs the entry; use `cache clean --corrupt-only` if needed.

Final output is always FFprobe-verified before success. Hash-valid scene cache hits are not re-probed.

Known limitations: v0.1 has static SVG scenes only and explicit hard boundaries; formula support is a
deliberately restricted grade 5–10 TeX subset; cache layers are designed but not independently materialized.
On Linux, peak renderer subprocess RSS is sampled from `/proc` and includes active descendants; it is omitted
when the host facility is unavailable. Peak temporary disk occupancy and cumulative bytes written are not yet
measured, so neither field is emitted. A future integration
adapter may depend on this API; this package must never depend back on the application.
