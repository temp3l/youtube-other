# Repository audit

Date: 2026-07-13

- Package manager/workspaces: pnpm 10.16.0; `apps/*` and `packages/*` workspace globs.
- Runtime/module system: Node.js >=22, ESM packages, TypeScript `NodeNext`, ES2022.
- Type safety: strict mode plus unchecked-index, exact-optional, and unknown-catch checks.
- Tests/tooling: Vitest 3 unit/integration configs, flat ESLint 9, Prettier 3.
- Package naming: independent packages use the `@mediaforge/*` scope. This package therefore uses
  `@mediaforge/educational-renderer`, not the requested fallback `@youtube/*` scope.
- CLI: Commander 14 is the existing CLI library. Package CLIs use a small JavaScript launcher for
  compiled ESM output.
- Infrastructure: shared hashing, atomic writes, subprocesses, logging, paths, and renderers exist,
  but depend on Mediaforge domain/application packages. Reuse would violate the required dependency
  direction, so this package implements narrow OS adapters itself.
- Rendering: the existing math renderer uses Remotion/Chromium and imports math-education, shared,
  speech, rendering, and process-runner. Its CLI and programmatic entry points are coupled to lesson
  workflows. It is not reused or modified.
- Boundaries: no dependency-cruiser setup was found. A focused architecture test will inspect package
  imports and reject Mediaforge application/domain imports.
- Linux baseline: `/usr/bin/ffmpeg` and `/usr/bin/ffprobe` 5.1.8 are available with libx264 and
  librsvg; Graphviz and DejaVu Sans are available; Blender is absent. Optional hardware paths need
  device/self-test probing.
- Repository state: pre-existing edits are present in CLI, math packages, reports, and temporary
  files. They are unrelated and will be preserved.

## Renderer decision

Motion Canvas would introduce a browser/bundler toolchain and per-frame rendering cost for an initial
slice whose required scenes can be expressed as deterministic SVG. The initial implementation uses
semantic SVG stills expanded directly by FFmpeg into independently verified H.264 scene segments.
This is the lowest-write, most crash-resumable path for low-powered Linux hardware. The contracts and
manifest retain a static/animated representation discriminator; animation can be added without
changing the public API.
