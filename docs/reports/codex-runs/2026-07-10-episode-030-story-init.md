Summary: Staged episode `030-the-woman-inside-the-painting` in canonical authored-script layout under `episodes/030-the-woman-inside-the-painting/languages`, using the optimized full and short rewrites for `en,de,es,fr,pt`. Normalized non-English section headings so the legacy episode parser can identify localized authored scripts.

Changed paths: `episodes/030-the-woman-inside-the-painting/languages/`; `docs/reports/codex-runs/2026-07-10-episode-030-story-init.md`

Tests: `pnpm mediaforge -- episode inspect --episode 030-the-woman-inside-the-painting --source episodes --output-root episodes` (passed; episode folder discovered, legacy source candidates remain absent because inspect still looks for pre-canonical per-locale source files). Attempted `node_modules/.bin/tsx ...` and `pnpm exec tsx ...` parser checks; both failed because `tsx` is not installed in this workspace.

Commit hash: `a22fbda`

Unresolved risks: No paid-provider episode generation run was executed, so `generation-manifest.json`, `current-artifact.json`, and review/runtime artifacts were not initialized. `pt` scripts were staged canonically, but the legacy `episode` workflow still only operationally supports `en,de,es,fr`.
