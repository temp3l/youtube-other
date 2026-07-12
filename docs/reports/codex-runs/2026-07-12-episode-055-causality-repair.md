# Episode 055 causality repair

## Changed files

- `episodes/055-the-babysitter-and-the-attic-door/source/055-the-babysitter-and-the-attic-door-en-full.md`
- `episodes/055-the-babysitter-and-the-attic-door/languages/script-en.md`
- `episodes/055-the-babysitter-and-the-attic-door/en/full/canonical-full.json`
- `episodes/055-the-babysitter-and-the-attic-door/en/full/generation-manifest.json`
- `episodes/055-the-babysitter-and-the-attic-door/en/full/story-production-analysis.json`

## Tests/checks and results

- `git diff --check -- episodes/055-the-babysitter-and-the-attic-door/source/055-the-babysitter-and-the-attic-door-en-full.md episodes/055-the-babysitter-and-the-attic-door/languages/script-en.md episodes/055-the-babysitter-and-the-attic-door/en/full/canonical-full.json episodes/055-the-babysitter-and-the-attic-door/en/full/generation-manifest.json episodes/055-the-babysitter-and-the-attic-door/en/full/story-production-analysis.json` — passed
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true pnpm mediaforge -- stories rewrite-full --input episodes/055-the-babysitter-and-the-attic-door/source/055-the-babysitter-and-the-attic-door-en-full.md --episode-slug 055-the-babysitter-and-the-attic-door --language en --output-root episodes --force --json` — passed after one earlier transport-error retry
- `pnpm mediaforge -- stories analyze --episode 055-the-babysitter-and-the-attic-door --language en --format full --output-root episodes --force --json` — passed; verdict `READY`, overall `85`, timeline/causality `pass`
- `pnpm mediaforge -- episode validate --episode 055-the-babysitter-and-the-attic-door --language en --artifact full --output-root episodes --json` — still fails on unrelated missing summary manifest and invalid `generation-manifest.json` schema expectations

## Risks remaining

- `episode validate` is still blocked by non-story manifest/schema issues unrelated to the repaired narrative gate.
- German localization, media continuation, and upload were not resumed.

## Follow-up

- Continue from `en/full` with the next approved workflow stage, or repair the separate episode-manifest validation path before relying on `episode validate` for release readiness.
