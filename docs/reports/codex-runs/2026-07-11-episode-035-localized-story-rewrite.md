Summary: Attempted to rewrite every `035-the-wendigo-legend` full and short locale (`en`, `de`, `es`, `fr`, `pt`). The English full artifact was regenerated once, but all localized fulls failed acceptance and no short passed its required parent gate.

Changed files:
- `episodes/035-the-wendigo-legend/en/full/{canonical-full.json,generation-manifest.json,script.md}`
- `episodes/035-the-wendigo-legend/script.md`
- `episodes/035-the-wendigo-legend/.batch/failed/035-the-wendigo-legend/{de,es,fr,pt}/*`
- `episodes/035-the-wendigo-legend/debug/**`
- `docs/reports/codex-runs/2026-07-11-episode-035-localized-story-rewrite.md`

Tests/checks:
- `pnpm --filter @mediaforge/story-localization build` — passed
- `pnpm --filter @mediaforge/cli build` — passed
- `pnpm mediaforge -- stories rewrite-full ... --languages de,es,fr,pt --force --json` — failed: regenerated English parent was rejected for forbidden boilerplate/outline structure
- `pnpm mediaforge -- stories localize ... --languages de,es,fr,pt --include-english-short --mode sync --force` — failed: localized fulls omitted required character/climax/ending content; localized shorts then lacked an accepted English short parent
- Path checks — `de/es/fr/pt` full and short scripts missing; English short missing

Risks remaining: No localized variant is publishable. Failure artifacts are diagnostic only. Likely owners are story prompt/response parsing and `short-rewrite.service` parent persistence. Follow-up: fix parsing so structured responses persist narration and ensure English short persistence precedes localized-short resolution, then retry once.

Commit: `96bc991b4f481e79eabaf0d4c4949f9ef50da7db`
