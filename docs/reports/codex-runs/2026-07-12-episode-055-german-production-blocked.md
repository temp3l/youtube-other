# Episode 055 German production blocked

## Changed files

- `episodes/055-the-babysitter-and-the-attic-door/reviews/en/full/approval.json`
- `episodes/055-the-babysitter-and-the-attic-door/.batch/failed/055-the-babysitter-and-the-attic-door/de/055-the-babysitter-and-the-attic-door-de-report.json`
- `episodes/055-the-babysitter-and-the-attic-door/.batch/failed/055-the-babysitter-and-the-attic-door/de/055-the-babysitter-and-the-attic-door-de-raw.json`

## Tests/checks and results

- `pnpm mediaforge -- episode status --episode 055-the-babysitter-and-the-attic-door --output-root episodes` — passed; English analysis current and `READY`, English approval initially `not-started`
- `pnpm mediaforge -- episode review approve --episode 055-the-babysitter-and-the-attic-door --language en --artifact full --output-root episodes --reviewer codex --notes "...causality gate..."` — passed
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true pnpm mediaforge -- episode localized --episode 055-the-babysitter-and-the-attic-door --languages de --output-root episodes --no-visual-retention` — failed immediately on stale-layout wrapper resolution (`script.md` blocking canonical `languages/script-de.md`)
- `DARK_TRUTH_ENABLE_PAID_PROVIDERS=true pnpm mediaforge -- stories rewrite-full --input episodes/055-the-babysitter-and-the-attic-door/source/055-the-babysitter-and-the-attic-door-en-full.md --episode-slug 055-the-babysitter-and-the-attic-door --language de --output-root episodes --force --json` — first failed on transport; second unsandboxed run reached model but failed validation
- `pnpm mediaforge -- stories localize --file episodes/055-the-babysitter-and-the-attic-door/languages/script-en.md --episode 055-the-babysitter-and-the-attic-door --source-dir content-ideas/content/dark-truth-episodes-multilingual-production-pack --output-dir episodes --languages de --mode sync --adaptation-mode faithful --force --fallback-to-sync --verbose` — completed with `0` discovered results; did not advance German output

## Risks remaining

- `de/full` is not publishable. Failed output preserved multiple English quoted lines and exceeded localized duration ratio (`1.37`, required `0.85-1.15`).
- Because `de/full` is not approved, `de/short`, German renders, metadata, thumbnails, and uploads remain blocked by design.
- User-requested video production/upload did not proceed because the prerequisite German stage was not acceptable.

## Follow-up

- Repair localized-full prompt/validator interaction for preserved written messages in German, then rerun `de/full`.
- After approved `de/full`, continue with `en/de short`, render artifacts, metadata/thumbnails, and YouTube uploads.
