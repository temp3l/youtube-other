# Episode 040 Upload Artifacts

Summary: Created the missing root episode manifest for `040-room-1413` and populated it with the canonical shared scene plan so the standard CLI can resolve the episode for package/upload-related flows. Commit: `8cc3876`.

Changed paths: `episodes/040-room-1413/manifest.json`.

Tests/checks: `pnpm mediaforge -- package 040-room-1413` passed; `pnpm mediaforge -- --language de --dry-run metadata generate 040-room-1413` passed manifest/scene-plan resolution and produced a dry-run summary.

Unresolved risks: `metadata generate` still resolved English metadata paths in dry-run despite `--language de`, so localized uploads may still require explicit localized metadata paths until that CLI language wiring is fixed.
