# Architecture

MediaForge is a local-first pnpm workspace organized around a small number of shared packages and a single orchestration layer.

## Layout

- `packages/domain`: strict Zod-backed domain model, branded IDs, and error types.
- `packages/shared`: deterministic helpers for paths, filenames, timestamps, captions, and hashing.
- `packages/config`: runtime configuration loading and precedence.
- `packages/persistence`: SQLite manifest and run-state storage.
- `packages/process-runner`: safe child-process execution.
- `packages/source-ingestion`: source adapters and local-file support.
- `packages/transcript-cleaning`: conservative transcript cleanup.
- `packages/rewriting`: broad-audience rewrite stage.
- `packages/scene-planning`: scene timing and prompt planning.
- `packages/speech`: mock and OpenAI-compatible TTS interfaces.
- `packages/alignment`: canonical caption timing and subtitle generation.
- `packages/image-generation`: scene workbook export, local rough-ink image generation, placeholder images, and import validation.
- `packages/rendering`: FFmpeg-based video rendering and ffprobe validation.
- `packages/metadata`: publishing metadata generation.
- `packages/pipeline`: the orchestration layer that wires the whole flow together.
- `apps/cli`: the primary user interface.
- `apps/api` and `apps/web`: minimal scaffolds for later expansion.

## Flow

The manifest in `episodes/<slug>/manifest.json` is the source of truth for each episode. Files under the episode directory are outputs; the database stores indexes, hashes, and pipeline step state.

## Design constraints

- Keep provider logic out of the domain layer.
- Prefer deterministic filenames and manifest-backed ordering.
- Use FFmpeg for rendering and validation rather than custom media code.
- Keep the image workflow provider-neutral and deterministic by default.
