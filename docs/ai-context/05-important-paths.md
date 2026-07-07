# AI Context: Important Paths

## Source Paths

- `apps/cli/src/index.ts`: main CLI registration and legacy command surface.
- `apps/cli/src/*commands*.ts`: focused CLI command modules.
- `packages/shared/src/episode-filesystem.ts`: canonical path resolver and authored-script identity.
- `packages/story-localization/src/`: story generation/localization/workflow.
- `packages/image-generation/src/`: image generation and batch lifecycle.
- `packages/speech/src/`: narration/audio.
- `packages/rendering/src/`: FFmpeg rendering and motion.
- `packages/visual-planning/src/`: shot planning/validation.
- `packages/config/src/index.ts`: config/env mapping.

## Canonical Episode Paths

- Episode root: `episodes/<episode-id>/`.
- Authored full script: `episodes/<episode-id>/languages/script-<locale>.md`.
- Authored short script: `episodes/<episode-id>/languages/short/script-<locale>.md`.
- Locale/variant root: `episodes/<episode-id>/locales/<locale>/<variant>/`.
- Audio: `episodes/<episode-id>/locales/<locale>/<variant>/audio/`.
- Transcript: `episodes/<episode-id>/locales/<locale>/<variant>/transcript/`.
- Thumbnails: `episodes/<episode-id>/locales/<locale>/<variant>/thumbnails/`.
- Renders: `episodes/<episode-id>/locales/<locale>/<variant>/renders/`.
- Shared generated images: `episodes/<episode-id>/shared/images/generated/`.
- Shared short generated images: `episodes/<episode-id>/shared/short/images/generated/`.
- Shared character references: `episodes/<episode-id>/shared/images/character-references/`.
- Image state: `episodes/<episode-id>/state/image-generation/`.
- Image batch root: `episodes/<episode-id>/state/image-generation/.batch/`.
- Visual retention state: `episodes/<episode-id>/state/visual-retention/`.
- Batch state: `episodes/<episode-id>/state/batch/`.
- Render state: `episodes/<episode-id>/state/render/`.
- Upload state: `episodes/<episode-id>/state/upload/`.
- Logs: `episodes/<episode-id>/logs/`.

## Docs And Reports

- Plans: `docs/plans/`.
- Audits: `docs/audits/`.
- Required dated plan reports: `docs/reports/<YYYY-MM-DD>/`.
- Codex-run reports: `docs/reports/codex-runs/`.
- AI context pack: `docs/ai-context/context-pack.md`.

## Avoid Or Treat Carefully

- `docs.bak/`: ignore.
- Large generated trees: `node_modules/`, `dist/`, `coverage/`, `episodes/**/output/`, `episodes/**/state/`, `episodes/**/generated-assets/`, `audio/`, `video/`, `images/`, `transcripts/`, `logs/`.
- Historical/stale layouts such as `episodes/<episode>/<locale>/full/script.md` and `episodes/<episode>/locales/<locale>/full/script.md`.
- `secrets/` and private env values: never include in docs/reports.
- Untracked content archives under `content-ideas/`: do not modify unless requested.
