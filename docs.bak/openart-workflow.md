# Scene Workflow

MediaForge uses a local, consistent rough ink-and-paper scene workflow. The workbook stays provider-neutral, but the default image generation is local and deterministic.

## Workflow

1. Run `pnpm mediaforge images export-openart <episode-id>`.
2. Open the generated workbook in `episodes/<slug>/images/scene-workbook.html`.
3. Review the local scene prompts and batch files.
4. Generate or inspect images in the shared rough ink-and-paper style.
5. Use the requested aspect ratio.
6. Save or move any external images into `episodes/<slug>/images/inbox/` if you are overriding the local output.
7. Run `pnpm mediaforge images import <episode-id> --from <directory>`.
8. Review mapping warnings.
9. Validate missing or duplicate scenes with `pnpm mediaforge images validate <episode-id>`.
10. Regenerate only rejected or missing scenes.
11. Render the final video.

## Guardrails

- No cookie scraping.
- No password scraping.
- No undocumented private API reverse engineering.
- No bot bypass.
- No unattended claim that any external image provider is fully automated.
- No browser credential scraping.
- No password scraping.
- No undocumented private API reverse engineering.

## Workbook contents

Each workbook entry includes:

- scene ID
- timestamp
- narration excerpt
- visual intent
- full prompt
- negative prompt
- aspect ratio
- expected filename
- import status
- validation status
- rejection reason
