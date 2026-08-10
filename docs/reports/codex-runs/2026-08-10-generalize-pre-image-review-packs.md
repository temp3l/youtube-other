# Generalize pre-image review packs — Codex run

Summary: Added the generic pre-image review-pack workflow for History and Dark Truth full and Short image production. Packs copy the narration WAV, script, scene/visual plans, manifest, optional semantic prompt review, and ChatGPT review request. Generation and resume reject missing or stale packs.

Changed paths: `apps/cli/src/pre-image-review-pack.ts`; `apps/cli/src/{index,images-resume-command}.ts`; operator guide.

Tests/checks: CLI transpiled with `--noCheck` because unrelated in-progress type errors block the standard CLI build; `mediaforge images review-pack --help` passed.

Commit: `679fcb5`.

Unresolved risks: no History or Dark Truth episode fixture with mastered audio was available for an end-to-end pack smoke test. Existing image-provider approval remains external and unchanged.
