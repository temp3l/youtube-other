# History V3.5 review pack regeneration (post map compiler)

## Command
```bash
pnpm exec tsx scripts/history-v35-regenerate-combined.mjs
```

## Output
- Combined directory: `artifacts/chatgpt-review/history-approval-packs-v3.5/`
- Combined ZIP: `artifacts/chatgpt-review/history-approval-packs-v3.5.zip`
- Combined ZIP SHA-256: `ac541e16f38b4a1a62b3e35fe069f0783fc8fae18e75e2e23531afcd22899da4`
- Comparison: `comparison-summary.md`, `comparison-quality-report.json`

## Determinism
`planHashDeterministic: true` (script double-run).

## Episodes

| Episode | planHash (prefix) | zip SHA-256 (prefix) |
|---|---|---|
| Napoleon | `ce129ce4…` | `97bc569f…` |
| Roman Empire | `8217188e…` | `e44350e8…` |
| Black Death | `93cdfe3b…` | `4a6bc63a…` |
| Franklin | `c4184194…` | `e093d73d…` |

## Production blockers (all episodes)
`EDITORIAL_REPETITION_THRESHOLD`, `TIMING_MEASUREMENT_REQUIRED` only. No `MAP_ROUTE_ACTOR_UNSUPPORTED`.

## Map remediation
Napoleon retreat beat (`beat-0035`) no longer emits Moscow→Berezina; plan uses archival fallback for that beat. Map compiler diagnostics present in per-episode `approval.md` and `map-states.json`.
