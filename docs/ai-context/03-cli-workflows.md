# AI Context: CLI Workflows

## Entrypoint

- Source: `apps/cli/src/index.ts`.
- Binary wrapper: `apps/cli/bin/mediaforge.js`.
- Root script wrapper: `pnpm mediaforge -- <args>`.
- Built runtime uses `apps/cli/dist/index.js`; source changes require build before binary reflects them.

## Command Areas

- `doctor`, `init`, `db migrate`.
- `episode inspect|dry-run|analyze|plan|english|localized|short|status|validate`.
- `episode review prepare|approve|reject|status`.
- `episode sync-characters|bootstrap-characters|resume-images`.
- `stories localize`, `stories resume-images`, `stories bootstrap-shared`, `stories sync-characters`.
- `stories pipeline --dry-run`, plus `stories pipeline status|inspect`.
- `stories:batches list|latest|pending|ready|completed|failed|expired|find|show|status|refresh|import|import-ready|retry-failed|cancel|verify-index|rebuild-index`.
- `images plan|generate|generate-character-references|approve-character|regenerate-character|export-openart|open-openart|import|status|validate|missing|reject|regenerate-workbook|assign`.
- `images batch prepare|submit|status|download|resume`.
- `shots plan|inspect|validate|preview|migrate`.
- `audio generate|generate-localized|narration <stage>|benchmark-voices`.
- `transcript generate|normalize|validate|export`.
- `render <episode-id>`, `render remote check|cleanup|test|verify|status|logs`.
- `metadata generate|youtube|package`.
- `thumbnails generate`.
- `youtube upload`.

## Important Safe Modes

- `episode dry-run` is zero-cost planning.
- `episode english|localized|short --dry-run` should not execute paid providers.
- `stories pipeline` currently requires `--dry-run`.
- `stories localize --dry-run` plans story localization.
- `thumbnails generate --dry-run` validates inputs/compiles prompt without OpenAI.
- `render --dry-run` emits planned paths and render-motion config.

## Provider/Paid Boundaries

Do not casually run:

- OpenAI story/localization/short/validator calls.
- OpenAI image generation or image batch submission.
- TTS/transcription with real providers.
- Remote rendering.
- YouTube upload or auth flows.
- Metadata generation with OpenAI unless explicitly approved.

## Recently Added Dirty-Tree CLI Surface

Render motion flags on `render`:

- `--motion`, `--no-motion`
- `--motion-mode <off|safe|cinematic|shorts>`
- `--motion-seed <seed>`
- `--motion-debug`
- `--motion-render-preset <presetId>`

These are separate from episode visual-retention `--motion-preset`.
