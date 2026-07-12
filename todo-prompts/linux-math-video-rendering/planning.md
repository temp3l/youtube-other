# Implement an Isolated Linux-Native Educational Video Renderer Package

Act as a senior TypeScript platform architect and Linux media-pipeline engineer.

You are working inside an existing YouTube/Mediaforge repository containing production functionality for story generation, localization, audio, images, video rendering, metadata, publishing and episode workflows.

Your task is to design and implement a completely isolated package that renders mathematical education videos using local Linux tools.

The package must expose:

1. a small, stable TypeScript API;
2. a standalone CLI built on that same API;
3. deterministic local rendering;
4. scene-level caching and resumability;
5. benchmarking suitable for low-powered hardware;
6. no integration with existing production pipelines yet.

The initial package must be usable and testable without invoking any existing Mediaforge command.

---

# Primary objective

Create a new package, preferably at:

```text
packages/educational-renderer/
```

Preferred package name:

```text
@youtube/educational-renderer
```

If the repository uses a different package scope or naming convention, adopt the existing convention and document the decision.

The package must generate instructional mathematics visuals using local Linux tools only.

The rendered lesson body must not require:

- image-generation APIs;
- OpenAI APIs;
- cloud rendering;
- external web services;
- proprietary video editors;
- manual timeline editing;
- network access during rendering.

The initial implementation should support 3–5 minute mathematics lessons for German school grades 5–10, while remaining generic enough to support other educational subjects later.

---

# Mandatory isolation

The new package must not modify, replace or integrate with existing:

- horror-video rendering;
- story generation;
- story rewriting;
- localization;
- audio generation;
- image generation;
- thumbnail generation;
- metadata generation;
- episode workflows;
- publishing;
- playlist handling;
- existing Mediaforge CLI commands;
- existing output path behavior;
- existing environment-variable behavior.

Do not register the renderer in an existing production pipeline.

Do not add a Mediaforge command that invokes it.

Do not migrate existing episodes.

Do not alter existing runtime behavior.

Do not remove or refactor existing renderers as part of this task.

## Permitted changes outside the package

Changes outside `packages/educational-renderer/` are allowed only when technically necessary for package registration:

- workspace configuration;
- root package scripts dedicated exclusively to this package;
- lockfile updates;
- TypeScript project references;
- an isolated CI job;
- lint configuration required to recognize the package.

Before modifying an external file:

1. identify the file;
2. explain why the change is required;
3. confirm that it does not change existing runtime behavior;
4. keep the change minimal.

At the end, list every file changed outside the package.

Deleting the new package and reverting its workspace registration must leave the existing application functionally unchanged.

---

# Required execution process

## Stage 1: repository audit

Before implementation, inspect the repository and determine:

- package manager;
- workspace structure;
- TypeScript configuration;
- ESM or CommonJS conventions;
- Node.js version;
- test runner;
- linting setup;
- formatting rules;
- logging conventions;
- error conventions;
- dependency-injection patterns, if any;
- CLI libraries already in use;
- filesystem abstractions;
- subprocess helpers;
- FFmpeg utilities;
- cache implementations;
- atomic-write utilities;
- hashing utilities;
- existing renderers;
- existing workspace package naming conventions;
- CI setup;
- existing architecture-boundary enforcement.

Look specifically for duplicated CLI and programmatic rendering implementations.

Do not reuse existing utilities if doing so creates reverse coupling from the new package into the Mediaforge application.

Reuse a shared infrastructure package only when it is already intended to be depended upon by independent packages.

Document verified findings before implementation.

## Stage 2: implementation plan

Create a concise implementation plan with reviewable milestones.

The plan must identify:

- files to add;
- files outside the package that must change;
- public contracts;
- package-internal boundaries;
- dependencies;
- test strategy;
- benchmark strategy;
- rollout order;
- acceptance criteria.

Proceed with implementation after producing the plan unless a truly blocking repository issue prevents safe work.

Do not ask for preferences that have sensible defaults.

---

# Dependency direction

The only allowed future dependency direction is:

```text
Existing Mediaforge application
        ↓
Future integration adapter
        ↓
@youtube/educational-renderer
```

The renderer must never import from:

- existing Mediaforge application code;
- episode-domain types;
- story-domain types;
- existing CLI handlers;
- existing workflow-log implementations;
- NestJS application modules;
- production publishing code.

Add an automated architecture test or lint rule that prevents forbidden imports.

Use the repository’s existing boundary tool if available. Otherwise use one of:

- ESLint import restrictions;
- dependency-cruiser;
- a focused package-boundary test.

Do not add a large dependency solely for one trivial boundary assertion unless justified.

---

# Preferred technical stack

Use a TypeScript-first implementation.

Preferred technologies:

- TypeScript with strict type checking;
- Node.js;
- Zod or the repository’s standard runtime-schema library;
- Motion Canvas for animated vector scenes;
- SVG and Canvas for mathematical visuals;
- KaTeX for formulas;
- D3 utilities for scales, axes and coordinate calculations;
- FFmpeg for final composition and encoding;
- FFprobe for output verification;
- `resvg` for deterministic SVG rasterization when useful;
- Graphviz for selected tree diagrams;
- Blender only for optional 3D geometry scenes.

Do not add Blender, Graphviz or Python as mandatory dependencies for the initial vertical slice.

A lesson that contains no 3D scene must not require Blender.

A lesson that contains no Graphviz scene must not require Graphviz.

Evaluate Motion Canvas against repository constraints before committing to it. Use another renderer only if repository or benchmark evidence clearly supports the alternative.

Do not maintain several overlapping implementations for the same scene types.

---

# Package structure

Use a structure close to:

```text
packages/educational-renderer/
├── src/
│   ├── index.ts
│   │
│   ├── api/
│   │   ├── create-educational-renderer.ts
│   │   ├── educational-renderer.ts
│   │   ├── requests.ts
│   │   ├── results.ts
│   │   ├── events.ts
│   │   └── errors.ts
│   │
│   ├── domain/
│   │   ├── visual-plan/
│   │   ├── scenes/
│   │   ├── render-profile/
│   │   ├── manifest/
│   │   ├── cache/
│   │   └── benchmark/
│   │
│   ├── application/
│   │   ├── validate/
│   │   ├── render/
│   │   ├── render-scene/
│   │   ├── compose/
│   │   ├── inspect/
│   │   └── benchmark/
│   │
│   ├── components/
│   │   ├── core/
│   │   └── math/
│   │
│   ├── renderers/
│   │   ├── motion-canvas/
│   │   ├── svg/
│   │   └── still-frame/
│   │
│   ├── composition/
│   │   ├── ffmpeg/
│   │   ├── audio/
│   │   ├── subtitles/
│   │   └── concat/
│   │
│   ├── infrastructure/
│   │   ├── filesystem/
│   │   ├── subprocess/
│   │   ├── hashing/
│   │   ├── locks/
│   │   ├── clock/
│   │   └── temporary-files/
│   │
│   ├── capabilities/
│   ├── observability/
│   └── cli/
│
├── fixtures/
│   └── linear-equations/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── architecture/
│   └── visual/
├── scripts/
├── package.json
├── tsconfig.json
└── README.md
```

Adapt this structure to repository conventions where appropriate.

Avoid unnecessary one-class-per-file ceremony when it reduces clarity.

---

# Public API

Expose a deliberately small API.

The preferred factory is:

```ts
import {
  createEducationalRenderer,
  type EducationalRenderer,
} from "@youtube/educational-renderer";

const renderer: EducationalRenderer = await createEducationalRenderer({
  workspaceDirectory: "/tmp/educational-renderer",
  cacheDirectory: "/var/cache/educational-renderer",
  temporaryDirectory: "/tmp/educational-renderer/tmp",
});
```

The public interface should include:

```ts
export interface EducationalRenderer {
  validate(request: ValidateRequest): Promise<ValidationResult>;

  render(
    request: RenderRequest,
    options?: RenderOptions
  ): Promise<RenderResult>;

  renderScene(
    request: RenderSceneRequest,
    options?: RenderOptions
  ): Promise<SceneRenderResult>;

  compose(request: ComposeRequest): Promise<ComposeResult>;

  inspectCapabilities(): Promise<RendererCapabilities>;

  benchmark(request: BenchmarkRequest): Promise<BenchmarkResult>;

  inspectCache(request?: InspectCacheRequest): Promise<CacheInspectionResult>;

  cleanCache(request?: CleanCacheRequest): Promise<CleanCacheResult>;
}
```

Add `plan()` only if the package performs deterministic plan normalization or compilation.

Do not add an AI-based lesson planner to this package.

## Public contract requirements

Public contracts must:

- use strict TypeScript types;
- use readonly properties;
- avoid `any`;
- avoid unchecked `unknown`;
- be runtime validated;
- be JSON-serializable where practical;
- contain explicit format versions;
- use discriminated unions;
- contain no Mediaforge-specific types;
- contain no NestJS-specific types;
- contain no CLI-library types;
- contain no renderer-internal classes;
- expose typed warnings and errors;
- remain suitable for a CLI, worker, Node.js application or future HTTP adapter.

Export types and schemas from explicit package export paths.

Do not expose the entire internal source tree through wildcard exports.

---

# Neutral input contract

The renderer must not inspect existing episode directories.

The renderer must not infer inputs from Mediaforge paths.

All inputs must be explicit.

A representative request contract is:

```ts
export interface RenderRequest {
  readonly requestVersion: "1";
  readonly jobId: string;
  readonly visualPlan: VisualPlanInput;
  readonly profile: RenderProfileInput;
  readonly outputDirectory: string;

  readonly assets?: Readonly<Record<string, AssetReference>>;
  readonly audio?: AudioInput;
  readonly subtitles?: SubtitleInput;

  readonly execution?: {
    readonly changedOnly?: boolean;
    readonly resume?: boolean;
    readonly overwrite?: boolean;
    readonly renderConcurrency?: number;
    readonly encoderConcurrency?: number;
  };
}
```

Accept either:

- a validated object;
- an explicitly supported JSON file through the CLI.

Do not allow ambiguous input precedence.

When both inline data and a path would represent the same field, reject or document deterministic precedence.

---

# Structured result contract

Return a complete structured result.

A representative contract is:

```ts
export interface RenderResult {
  readonly resultVersion: "1";
  readonly jobId: string;

  readonly status:
    | "completed"
    | "completed-with-warnings"
    | "incomplete"
    | "failed"
    | "cancelled";

  readonly output?: {
    readonly videoPath: string;
    readonly manifestPath: string;
    readonly durationMs: number;
    readonly width: number;
    readonly height: number;
    readonly frameRate: number;
    readonly videoCodec: string;
    readonly audioCodec?: string;
    readonly sha256: string;
  };

  readonly scenes: readonly SceneRenderResult[];
  readonly cache: CacheSummary;
  readonly metrics: RenderMetrics;
  readonly capabilities: RendererCapabilitiesSummary;
  readonly warnings: readonly RendererWarning[];
  readonly errors: readonly RendererErrorData[];
}
```

The caller must not need to:

- parse console output;
- parse debug logs;
- inspect temporary directories;
- infer success from file existence.

Verify final media with FFprobe before returning `completed`.

---

# Visual plan

Implement a versioned, human-editable visual-plan format.

Use a discriminated union for scenes.

Initial scene types:

1. `title`
2. `text`
3. `equation`
4. `equation-transformation`
5. `coordinate-graph`
6. `geometry`
7. `summary`

The initial end-to-end fixture only needs to use:

- title;
- equation;
- equation transformation;
- coordinate graph;
- summary.

A representative structure is:

```ts
export interface VisualPlan {
  readonly version: "1";
  readonly lessonId: string;
  readonly locale: SupportedLocale;
  readonly title: string;
  readonly scenes: readonly VisualScene[];
}
```

Common scene properties should include:

```ts
interface BaseScene {
  readonly id: string;
  readonly type: string;
  readonly durationMs: number;
  readonly localeSensitivity:
    | "language-neutral"
    | "localized"
    | "timing-sensitive";
  readonly transition?: TransitionDefinition;
  readonly narrationCue?: NarrationCue;
}
```

Each scene type must have its own validated payload.

Validate:

- unique scene IDs;
- positive durations;
- finite coordinates;
- supported formula syntax;
- valid asset references;
- safe text;
- supported locale;
- supported profile;
- scene/profile compatibility;
- timing consistency;
- output-safe dimensions;
- graph ranges;
- invalid or infinite mathematical values.

Fail before rendering when static validation can detect an error.

---

# Initial mathematical components

Implement only the components required by the vertical slice, but create extensible contracts for future components.

Initial components:

- title card;
- instructional text block;
- KaTeX equation;
- term highlight;
- equation step transition;
- coordinate axes;
- grid;
- plotted line;
- plotted point;
- axis labels;
- summary card;
- simple arrow;
- simple annotation.

Plan, but do not necessarily implement yet:

- number line;
- fraction bar;
- percentage grid;
- ratio diagram;
- algebra tiles;
- balance scale;
- triangle;
- polygon;
- circle;
- angle arc;
- measurement line;
- slope triangle;
- table;
- bar chart;
- line chart;
- pie chart;
- probability tree;
- sample-space grid;
- pause question;
- countdown;
- answer reveal;
- 3D solid.

Use semantic inputs rather than arbitrary rendering commands.

For example, prefer:

```ts
{
  type: 'coordinate-graph',
  xRange: [-5, 5],
  yRange: [-5, 5],
  functions: [
    {
      expression: '2*x + 1',
      domain: [-3, 3]
    }
  ]
}
```

over exposing imperative Canvas code in the visual plan.

Do not evaluate arbitrary JavaScript expressions from plan files.

Use a safe mathematical expression parser or a restricted internal representation.

---

# Rendering profiles

Implement centrally validated profiles.

Required profiles:

## Preview

```text
Resolution: 960×540
Frame rate: 15 fps
Encoder: libx264
Preset: ultrafast
Purpose: rapid local iteration
```

## Draft

```text
Resolution: 1280×720
Frame rate: 24 fps
Encoder: libx264
Preset: veryfast
Purpose: editorial review
```

## YouTube full

```text
Resolution: 1920×1080
Frame rate: 24 or 25 fps
Encoder: libx264 by default
Preset: veryfast or faster configurable production preset
Pixel format: yuv420p
Audio: AAC
Purpose: final 16:9 lesson
```

## YouTube Short

```text
Resolution: 1080×1920
Frame rate: 24 or 25 fps
Pixel format: yuv420p
Purpose: responsive 9:16 layout
```

Do not implement YouTube Short by cropping the 16:9 video.

Profiles must be included in cache keys.

Allow explicit frame-rate overrides only through validated configuration.

Use 24 fps as the initial production default unless repository evidence supports 25 fps.

---

# Scene-level rendering

Render every scene independently.

The package must support:

- rendering all scenes;
- rendering one scene;
- rendering only changed scenes;
- resuming an interrupted render;
- retrying failed scenes;
- reusing completed scenes;
- independently validating scene outputs;
- composing compatible scene outputs;
- reporting incomplete jobs;
- preserving successful results after another scene fails.

Do not implement the lesson as one indivisible renderer invocation.

A failed scene must not delete successful scene output.

Use atomic promotion:

```text
temporary scene file
        ↓
validate
        ↓
atomic rename into final scene cache
```

Do not expose a partially written file as a valid cached result.

---

# Static-interval optimization

Do not generate hundreds of identical frames for scenes that remain static.

Implement or prototype a hybrid representation:

- static scenes become one rendered still plus a defined duration;
- animated scenes become video segments;
- FFmpeg assembles static and animated segments into compatible scene files;
- final composition concatenates normalized scene files.

A static ten-second title or explanation must not require 240 separately rendered image files unless the selected renderer makes this unavoidable.

Document:

- how static intervals are represented;
- how transitions are handled;
- how audio synchronization is maintained;
- how frame-rate compatibility is guaranteed;
- how cache keys distinguish static and animated output.

If the initial renderer cannot support this safely, implement a documented fallback and add a benchmark-backed follow-up task.

---

# Cache design

Implement content-addressed scene caching.

The cache key must include all output-affecting inputs:

- normalized scene payload;
- scene schema version;
- renderer name;
- renderer version;
- package rendering-format version;
- render profile;
- width;
- height;
- frame rate;
- theme version;
- locale when relevant;
- font identities;
- font file hashes or stable fingerprints;
- referenced asset hashes;
- formula renderer version;
- SVG renderer version;
- relevant dependency versions;
- animation settings;
- transition settings;
- deterministic random seed;
- relevant feature flags.

Do not include inputs that cannot influence the output.

A narration-only change must not invalidate visual scene output unless it changes scene timing or animation cues.

A localized text change must not invalidate language-neutral geometry.

## Cache requirements

The cache must:

- be inspectable;
- use manifests;
- detect missing output files;
- detect corrupt files;
- validate hashes;
- use atomic writes;
- handle stale locks;
- survive interruption;
- report hit and miss reasons;
- support selective cleaning;
- never silently return an invalid entry.

Required cache states:

```ts
type CacheStatus = "hit" | "miss" | "stale" | "corrupt" | "disabled";
```

Provide a readable cache-inspection CLI command.

---

# Layer separation

Separate:

- language-neutral geometry;
- localized text;
- equations;
- annotations;
- theme/background;
- subtitles;
- narration;
- final audio;
- final video composition.

Where technically practical, cache language-neutral layers independently from localized overlays.

At minimum, design the manifest and cache contracts so this separation can be implemented without breaking the public API later.

---

# FFmpeg integration

Use FFmpeg for:

- still-frame duration expansion;
- scene normalization;
- audio attachment;
- subtitle integration;
- concatenation;
- final encoding;
- final remuxing;
- output metadata;
- format normalization.

Use FFprobe for:

- width;
- height;
- frame rate;
- duration;
- codec;
- pixel format;
- audio stream verification;
- file validity.

Execute subprocesses using argument arrays.

Do not build commands through unescaped shell-string concatenation.

For example:

```ts
await processRunner.run("/usr/bin/ffmpeg", [
  "-y",
  "-i",
  inputPath,
  "-c:v",
  "libx264",
  outputPath,
]);
```

Capture:

- executable;
- safe argument representation;
- start time;
- completion time;
- exit code;
- bounded stdout;
- bounded stderr;
- timeout status.

Do not log binary data.

---

# Direct frame piping

Evaluate these rendering paths:

1. PNG sequence;
2. JPEG sequence;
3. WebP sequence;
4. raw frames piped to FFmpeg;
5. renderer-native FFmpeg export;
6. scene-level video segments;
7. hybrid still and animated segments.

Prefer direct piping or scene-level segments where reliable.

Avoid writing thousands of full-resolution PNG files by default.

However, maintain a diagnostic mode that can preserve intermediate frames for debugging.

Select the initial default based on:

- implementation reliability;
- crash recovery;
- memory use;
- disk writes;
- X220 performance;
- image quality;
- debuggability;
- scene-cache compatibility.

Record the decision in an ADR.

---

# Formula and SVG caching

Cache repeated:

- normalized KaTeX expressions;
- generated formula HTML or SVG;
- rasterized formula assets;
- parsed SVG;
- coordinate-grid backgrounds;
- font measurements;
- recurring symbols;
- theme assets.

Do not recompute static formula layout on every frame.

Normalize LaTeX conservatively.

Do not normalize formulas in a way that changes mathematical meaning.

Invalid KaTeX must produce a typed validation error before expensive rendering.

---

# Capability inspection

Implement:

```ts
renderer.inspectCapabilities();
```

Probe at least:

- Node.js version;
- FFmpeg availability;
- FFmpeg version;
- FFprobe availability;
- `libx264`;
- `h264_vaapi`;
- `h264_qsv`;
- `/dev/dri/render*`;
- required fonts;
- Graphviz availability;
- Blender availability;
- SVG renderer availability;
- available CPU count;
- available memory where safely detectable;
- temporary and output filesystem free space where practical.

A capability result must distinguish:

- available;
- unavailable;
- untested;
- available but failed self-test.

Do not select hardware encoding just because an encoder name appears in `ffmpeg -encoders`.

For VA-API or QSV:

1. detect the encoder;
2. detect the device;
3. run a short test encode;
4. verify the output with FFprobe;
5. fall back to `libx264` on failure.

Hardware encoding is optional.

Software encoding must always remain supported.

---

# X220-oriented performance defaults

The target low-powered system is approximately:

```text
ThinkPad X220
Intel Core i7-2620M
2 physical cores / 4 threads
Intel HD Graphics 3000
Linux
```

Initial conservative defaults:

```text
Render concurrency: 1
FFmpeg encoder concurrency: 1
Preview resolution: 960×540
Preview frame rate: 15 fps
Draft frame rate: 24 fps
Production frame rate: 24 fps
Preview encoder preset: ultrafast
Production encoder preset: veryfast
Hardware encoding: disabled until self-test succeeds
```

Allow concurrency `2` through explicit configuration and benchmarks.

Do not default to concurrency based solely on logical CPU count.

Use bounded queues.

Avoid running multiple expensive FFmpeg encoders simultaneously on the X220 profile.

---

# Benchmark command

Implement a standalone benchmark command.

Preferred form:

```bash
educational-renderer benchmark \
  --fixture fixtures/linear-equations \
  --profiles preview,draft,youtube-full \
  --encoders libx264,h264_vaapi,h264_qsv \
  --output .artifacts/benchmarks
```

The command must continue when an optional encoder is unavailable and report it accurately.

## Benchmark fixture

Create a deterministic fixture containing:

- static title;
- localized text;
- KaTeX formula;
- equation transformation;
- coordinate graph;
- plotted function;
- annotation;
- simple transition;
- narration;
- subtitles;
- summary;
- one deliberately expensive visual option for comparison.

Do not use copyrighted or externally downloaded assets.

Generate a simple local narration placeholder or include a small repository-safe fixture created for testing.

## Benchmark metrics

Record:

- machine-readable timestamp;
- package version;
- renderer-format version;
- tool versions;
- CPU information where available;
- logical CPU count;
- total wall-clock duration;
- duration per scene;
- rendered frame count;
- effective frame-render rate;
- FFmpeg duration;
- composition duration;
- validation duration;
- cache hits;
- cache misses;
- cache bytes read;
- temporary bytes written where measurable;
- final output size;
- peak memory where practical;
- encoder;
- profile;
- exit status;
- warnings;
- failures.

Write results as JSON.

Optionally produce a concise Markdown summary from the JSON.

Do not claim performance improvements unless benchmarked.

---

# Standalone CLI

Expose a binary such as:

```text
educational-renderer
```

The CLI must be a thin adapter over the public TypeScript API.

Do not create separate rendering logic for the CLI.

Required commands:

```bash
educational-renderer validate
educational-renderer render
educational-renderer render-scene
educational-renderer compose
educational-renderer inspect
educational-renderer benchmark
educational-renderer cache inspect
educational-renderer cache clean
```

## Validate

Example:

```bash
educational-renderer validate \
  --plan fixtures/linear-equations/visual-plan.json \
  --profile preview
```

## Render

Example:

```bash
educational-renderer render \
  --plan fixtures/linear-equations/visual-plan.json \
  --profile preview \
  --output .artifacts/linear-equations
```

Options should include:

```text
--changed-only
--resume
--overwrite
--render-concurrency <number>
--encoder <name>
--json
--verbose
--keep-temporary-files
```

## Render one scene

```bash
educational-renderer render-scene \
  --plan fixtures/linear-equations/visual-plan.json \
  --scene equation-example \
  --profile preview \
  --output .artifacts/linear-equations
```

## Inspect

```bash
educational-renderer inspect --json
```

## CLI behavior

The CLI must:

- validate arguments;
- produce useful `--help`;
- use stable exit codes;
- support human-readable output;
- support machine-readable JSON output;
- avoid progress noise in JSON mode;
- emit errors to stderr;
- avoid stack traces by default;
- expose stack traces in verbose/debug mode;
- handle SIGINT and SIGTERM;
- preserve resumable work on interruption;
- avoid reporting success before output verification.

Suggested exit codes:

```text
0  completed successfully
1  unexpected internal failure
2  invalid CLI arguments
3  invalid visual plan
4  missing required capability
5  scene rendering incomplete or failed
6  composition failed
7  output verification failed
8  cache corruption could not be recovered
130 interrupted
```

Adapt these if repository conventions already define exit codes.

---

# Events and observability

Expose an optional structured event callback.

Representative events:

```ts
export type RendererEvent =
  | {
      readonly type: "job-started";
      readonly jobId: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "scene-started";
      readonly jobId: string;
      readonly sceneId: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "scene-cache-hit";
      readonly jobId: string;
      readonly sceneId: string;
      readonly cacheKey: string;
    }
  | {
      readonly type: "scene-completed";
      readonly jobId: string;
      readonly sceneId: string;
      readonly durationMs: number;
    }
  | {
      readonly type: "scene-failed";
      readonly jobId: string;
      readonly sceneId: string;
      readonly error: RendererErrorData;
    }
  | {
      readonly type: "job-completed";
      readonly jobId: string;
      readonly status: RenderResult["status"];
    };
```

The renderer must not depend on an existing Mediaforge logger.

A future adapter must be able to translate these events into Mediaforge workflow-log entries.

Use structured internal logs.

Do not log:

- rendered frame buffers;
- binary data;
- full audio payloads;
- base64 assets;
- secrets;
- excessive subprocess output.

Bound captured subprocess logs.

---

# Typed errors

Define stable error codes.

At minimum:

```ts
export type RendererErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_VISUAL_PLAN"
  | "INVALID_RENDER_PROFILE"
  | "UNSUPPORTED_SCENE_TYPE"
  | "INVALID_FORMULA"
  | "MISSING_ASSET"
  | "MISSING_FONT"
  | "MISSING_TOOL"
  | "UNSUPPORTED_CAPABILITY"
  | "SCENE_RENDER_FAILED"
  | "FFMPEG_FAILED"
  | "FFPROBE_FAILED"
  | "OUTPUT_VALIDATION_FAILED"
  | "CACHE_CORRUPTED"
  | "INSUFFICIENT_DISK_SPACE"
  | "PROCESS_TIMEOUT"
  | "PROCESS_INTERRUPTED"
  | "FILESYSTEM_BOUNDARY_VIOLATION"
  | "LOCK_ACQUISITION_FAILED"
  | "INTERNAL_ERROR";
```

Do not expose arbitrary thrown objects in JSON results.

Convert unknown exceptions at the package boundary.

Preserve the original cause internally where supported.

Never catch and silently ignore errors.

---

# Filesystem containment

All writes must remain within explicitly configured roots:

- workspace root;
- output root;
- cache root;
- temporary root.

Resolve and validate paths before use.

Protect against:

- `..` traversal;
- absolute-path injection;
- symlink escape;
- output path collisions;
- deleting a parent directory accidentally;
- cleanup outside package-owned directories.

The package must never assume or write directly to:

```text
episodes/<episode>/languages/<locale>/
```

The package must not scan the repository for lessons unless explicitly given a path by its standalone CLI.

Use atomic writes for:

- manifests;
- cache metadata;
- benchmark results;
- result JSON;
- final scene promotion.

---

# Suggested output layout

Inside a caller-provided output directory:

```text
<output>/
├── final/
│   └── lesson.mp4
│
├── manifest.json
├── result.json
│
└── renderer/
    ├── scenes/
    │   ├── <scene-id>/
    │   │   ├── scene.mp4
    │   │   ├── scene.json
    │   │   └── verification.json
    │   └── ...
    │
    ├── layers/
    ├── logs/
    ├── diagnostics/
    ├── temporary/
    └── benchmarks/
```

Do not duplicate cached binary content unnecessarily.

If outputs reference global cache objects, ensure manifests remain useful after cache cleaning or clearly document the lifecycle.

---

# Manifest

Write a versioned manifest containing:

- job ID;
- visual-plan version;
- renderer package version;
- renderer-format version;
- render profile;
- locale;
- toolchain versions;
- font identities;
- scene order;
- scene input hashes;
- scene output hashes;
- cache keys;
- cache statuses;
- scene durations;
- scene output paths;
- final output metadata;
- warnings;
- errors;
- timestamps;
- incomplete status;
- deterministic seed.

The manifest must be written even when a job is incomplete, unless the process cannot safely write to disk.

Use atomic replacement.

---

# Audio-only and subtitle-only fast paths

Implement composition so that:

- replacing narration does not rerender visuals;
- adjusting audio levels does not rerender visuals;
- changing music does not rerender visuals;
- changing subtitles does not rerender visual scenes;
- changing container metadata does not rerender visual scenes.

Only rerender a visual scene when audio or subtitle changes alter visual timing or narration-driven animation cues.

Provide integration tests for these paths.

---

# Security and reliability

Address:

- shell injection;
- path traversal;
- arbitrary JavaScript execution;
- unsafe mathematical-expression evaluation;
- malformed SVG;
- unsafe HTML;
- LaTeX injection;
- process timeouts;
- process cancellation;
- stale locks;
- corrupt cache entries;
- disk exhaustion;
- excessive scene duration;
- excessive dimensions;
- excessive frame rate;
- excessive number of scenes;
- oversized input assets;
- unsafe symlinks;
- temporary-directory cleanup.

Set configurable but safe limits.

Do not attempt to create a full hostile multi-tenant sandbox, but establish clear trust boundaries and reject obviously unsafe input.

Use subprocess argument arrays.

Never use `eval`, `new Function` or equivalent dynamic code evaluation for scene inputs.

---

# Determinism

Record or control:

- Node.js version;
- package version;
- lockfile;
- FFmpeg version and build;
- FFprobe version;
- renderer version;
- Motion Canvas version;
- Chromium/browser version if applicable;
- KaTeX version;
- SVG renderer version;
- fonts;
- locale;
- timezone;
- random seed;
- render profile;
- CPU-dependent capability decisions.

Set deterministic seeds for any random visual behavior.

Avoid current timestamps inside rendered visual content unless supplied explicitly.

Document whether output is expected to be:

- byte-identical;
- visually equivalent;
- semantically equivalent.

Do not promise byte-identical video across different FFmpeg builds unless verified.

---

# Fonts

Use explicitly configured fonts.

The renderer must:

- verify required font availability;
- avoid silent font substitution;
- report selected font files;
- include font identity in cache keys;
- support mathematical symbols;
- support German, English, Spanish, French and Portuguese text;
- provide a safe open-font default;
- document font installation requirements.

Do not copy or distribute proprietary system fonts.

Tests should use a font that can legally be referenced or distributed within the repository.

---

# Testing

Use the repository’s existing test framework where practical.

Required test categories:

## Unit tests

- schema validation;
- cache-key stability;
- cache invalidation;
- path containment;
- typed-error conversion;
- render-profile normalization;
- scene-registry dispatch;
- formula normalization;
- FFmpeg argument construction;
- FFprobe result parsing;
- event ordering.

## Property-based or parameterized tests

For:

- coordinate transformation;
- graph ranges;
- finite-number validation;
- aspect-ratio layout boundaries;
- path containment.

Use the existing property-test library if available. Do not add one unless it provides meaningful value.

## Architecture tests

Verify that the package does not import forbidden Mediaforge application modules.

## Integration tests

Use real local Linux tools when available for:

- one-scene render;
- complete fixture render;
- FFmpeg composition;
- FFprobe verification;
- cache hit;
- changed-scene render;
- interrupted render and resume;
- failed-scene preservation;
- audio-only recomposition;
- subtitle-only recomposition;
- cache corruption recovery;
- missing optional tool behavior.

Tests requiring an unavailable system tool should report a clear skip reason rather than silently passing.

## Visual regression tests

Use a small number of representative SVG or frame snapshots.

Do not store thousands of rendered frames.

Use documented image-comparison tolerances.

## Existing tests

Run relevant existing repository tests before and after changes.

Existing behavior must continue to pass unchanged.

If an existing test fails before your changes, record it separately rather than falsely attributing it to the package.

---

# Documentation

Create a standalone README covering:

- purpose;
- non-goals;
- architecture;
- package isolation;
- installation;
- required Linux tools;
- optional Linux tools;
- public API;
- CLI usage;
- visual-plan format;
- render profiles;
- cache behavior;
- output layout;
- capability inspection;
- benchmark usage;
- error handling;
- troubleshooting;
- future integration adapter;
- known limitations.

Include complete examples for:

1. validating a plan;
2. rendering through TypeScript;
3. rendering through CLI;
4. rendering one scene;
5. resuming;
6. changed-only rendering;
7. inspecting capabilities;
8. running benchmarks;
9. cleaning cache.

Add architecture decision records for:

- package isolation;
- primary animation renderer;
- scene-level output;
- static-scene strategy;
- FFmpeg export strategy;
- cache design;
- font strategy;
- hardware-encoding policy;
- optional Blender and Graphviz usage.

---

# Initial fixture

Create:

```text
fixtures/linear-equations/
├── visual-plan.json
├── narration.wav
├── subtitles.vtt
└── README.md
```

The lesson should demonstrate:

```text
3x + 6 = 15
3x = 9
x = 3
```

Include:

- a title;
- learning objective;
- equation setup;
- highlighted subtraction;
- division step;
- answer;
- simple graph of `y = 3x + 6` or another relevant linear function;
- summary.

Keep all fixture content original and repository-safe.

The fixture must render without network access.

---

# Required package scripts

Provide package-local commands equivalent to:

```bash
npm --workspace @youtube/educational-renderer run build
npm --workspace @youtube/educational-renderer run typecheck
npm --workspace @youtube/educational-renderer run lint
npm --workspace @youtube/educational-renderer run test
npm --workspace @youtube/educational-renderer run test:integration
npm --workspace @youtube/educational-renderer run benchmark
```

Adapt syntax to the repository’s actual package manager.

Do not assume npm if the repository uses pnpm, Yarn or another supported workspace manager.

Provide a standalone CLI invocation for rendering the fixture.

---

# Performance acceptance criteria

Measure rather than assume.

The first implementation must report:

- cold preview render duration;
- warm cached preview render duration;
- changed-one-scene duration;
- audio-only recomposition duration;
- final 1080p render duration;
- temporary data written;
- cache hit rate.

Do not set unrealistic hard time limits before measuring the target machine.

The package architecture must ensure:

- unchanged scenes are not rendered again;
- static scenes avoid unnecessary frame generation where implemented;
- audio-only changes do not render visuals;
- cached rebuilds perform only validation and composition work;
- render concurrency is bounded;
- optional hardware encoders have a software fallback.

---

# Quality acceptance criteria

The fixture output must:

- be playable;
- pass FFprobe validation;
- use the requested resolution;
- use the requested frame rate;
- use `yuv420p` for normal YouTube output;
- contain the expected audio stream when narration is supplied;
- contain the expected duration within documented tolerance;
- display equations correctly;
- avoid clipped formulas;
- avoid missing glyphs;
- avoid text outside safe areas;
- produce a valid manifest;
- produce a valid structured result;
- preserve successful scene outputs after a later scene fails.

---

# Isolation acceptance criteria

The implementation is accepted only when:

- the package can build independently;
- the package can type-check independently;
- the package can test independently;
- the package can render its fixture independently;
- no existing Mediaforge command invokes it;
- no existing pipeline imports it;
- the renderer imports no Mediaforge domain or application code;
- existing production behavior is unchanged;
- external repository changes are minimal and documented;
- deleting the package and workspace registration leaves existing behavior intact.

---

# Required final verification

Run the equivalent of:

```bash
npm --workspace @youtube/educational-renderer run build
npm --workspace @youtube/educational-renderer run typecheck
npm --workspace @youtube/educational-renderer run lint
npm --workspace @youtube/educational-renderer run test
npm --workspace @youtube/educational-renderer run test:integration
npm --workspace @youtube/educational-renderer run benchmark
```

Then render the fixture:

```bash
educational-renderer render \
  --plan fixtures/linear-equations/visual-plan.json \
  --profile preview \
  --output .artifacts/linear-equations-preview
```

Also render a final profile:

```bash
educational-renderer render \
  --plan fixtures/linear-equations/visual-plan.json \
  --profile youtube-full \
  --output .artifacts/linear-equations-full
```

Run the preview render twice to demonstrate a cold render and a cached render.

Modify one fixture scene in a temporary test copy and demonstrate changed-only rendering.

Perform an audio-only recomposition without rerendering scenes.

Do not leave intentional fixture modifications in the final working tree.

---

# Implementation milestones

Use small, reviewable milestones.

## Milestone 0 — Audit and baseline

- inspect repository;
- identify package conventions;
- identify permitted external modifications;
- inspect available Linux tools;
- create implementation plan;
- record existing relevant test status.

## Milestone 1 — Package and contracts

- create package;
- configure build;
- implement public API types;
- implement runtime schemas;
- implement typed errors;
- implement architecture boundary checks;
- add minimal README.

## Milestone 2 — Infrastructure

- filesystem containment;
- atomic writes;
- process runner;
- cancellation;
- hashing;
- tool capability inspection;
- FFprobe validation.

## Milestone 3 — Minimal renderers

- title;
- text;
- equation;
- equation transformation;
- coordinate graph;
- summary;
- preview profile.

## Milestone 4 — Scene composition

- independent scene outputs;
- static-scene handling;
- FFmpeg normalization;
- concatenation;
- audio;
- subtitles;
- final verification.

## Milestone 5 — Cache and resume

- content-addressed scene cache;
- manifests;
- changed-only rendering;
- interruption recovery;
- corrupt-cache handling;
- cache CLI.

## Milestone 6 — Standalone CLI

- validate;
- render;
- render-scene;
- compose;
- inspect;
- benchmark;
- cache commands;
- JSON output;
- stable exit codes.

## Milestone 7 — Benchmarking and optimization

- benchmark fixture;
- cold and warm runs;
- direct-pipe comparison where practical;
- frame-rate comparison;
- encoder self-tests;
- X220 defaults;
- metrics output.

## Milestone 8 — Hardening and documentation

- integration tests;
- visual regression;
- security review;
- ADRs;
- complete README;
- final isolation verification.

Create commits only if the repository workflow explicitly expects Codex to commit.

Do not mix unrelated repository cleanup into these milestones.

---

# Scope control

Do not implement:

- Mediaforge integration adapter;
- new Mediaforge CLI commands;
- lesson generation through AI;
- curriculum ingestion;
- automatic script writing;
- TTS generation;
- image-generation APIs;
- YouTube upload;
- metadata generation;
- playlist assignment;
- thumbnails;
- Blender scenes;
- a web UI;
- distributed rendering;
- Kubernetes jobs;
- remote workers;
- database persistence.

Design the public API so these can be added externally later without changing core rendering contracts unnecessarily.

---

# Code quality requirements

Use:

- strict TypeScript;
- explicit public return types;
- exhaustive discriminated-union handling;
- `satisfies` where useful;
- immutable domain contracts;
- dependency inversion at operating-system boundaries;
- small cohesive modules;
- clear inline documentation for non-obvious algorithms;
- explicit lifecycle ownership;
- deterministic cleanup;
- safe error conversion.

Avoid:

- `any`;
- non-null assertions without proof;
- unsafe casts;
- broad service-locator patterns;
- global mutable state;
- hidden singleton configuration;
- environment-variable access scattered through domain code;
- shell command construction through string concatenation;
- duplicated API and CLI implementations;
- premature abstraction;
- generic `utils.ts` dumping grounds;
- swallowing subprocess failures;
- tests that merely assert that no exception occurred.

Document the reason for any unavoidable unsafe cast.

---

# Final response

After implementation, return:

1. architecture summary;
2. final package path and package name;
3. public API summary;
4. CLI command summary;
5. implemented scene types;
6. rendering and composition strategy;
7. cache strategy;
8. benchmark results;
9. cold versus cached performance;
10. files added;
11. files changed outside the package;
12. tests and commands run;
13. existing tests verified;
14. known limitations;
15. deferred improvements;
16. confirmation that no existing production pipeline was integrated or modified.

Clearly distinguish:

- completed functionality;
- partially implemented functionality;
- benchmark-backed findings;
- estimates;
- unavailable optional capabilities.

Do not claim completion if the fixture cannot be rendered and verified successfully.
