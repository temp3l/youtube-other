Summary: Staged episode `034-not-my-reflection` in the canonical authored-script layout for `en,de,es,fr,pt`, with both full and short variants copied from the source packs and the Portuguese short aligned to the parser’s current heading convention.

Changed paths: `episodes/034-not-my-reflection/languages/`; `docs/reports/codex-runs/2026-07-10-episode-034-story-init.md`

Tests/checks:
- `pnpm mediaforge -- episode dry-run --episode 034-not-my-reflection --source episodes --language en --artifact full --output-root episodes --json`
- `pnpm mediaforge -- episode dry-run --episode 034-not-my-reflection --source episodes --language pt --artifact short --output-root episodes --json`
- `git diff --check -- episodes/034-not-my-reflection`

Results:
- English full dry-run passed with no parser warnings.
- Portuguese short still fails in the legacy dry-run path with `Missing generation manifest at episodes/034-not-my-reflection/pt/short/generation-manifest.json`.
- Whitespace check passed.

Risks remaining:
- No runtime audio/image/render assets were generated.
- PT short is staged but not fully dry-run verified because the current dry-run path expects a generated manifest in the `pt/short` runtime location.

Commit hash: `24ca8c2`
