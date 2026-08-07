# History V3.5 restart handoff

Use this prompt to resume History V3.5 work. Read this file first.

## Session status (2026-08-07 evening, resumed)

- Corpus acceptance green; four-episode portfolio regenerated deterministically.
- Franklin trusted script restored to canonical 129-officer chronology and HMS Terror hatch wording.
- Combined review pack: `artifacts/chatgpt-review/history-approval-packs-v3.5/` (`planHashDeterministic: true`).

## Session status (2026-08-07 evening, prior)

- Stuck agent `fa1473d1` (PID 3445008) was terminated after 60+ minutes at ~33% CPU with no child processes — inference/edit spiral, not a hung shell.
- Root cause (again): scope drift into visual-repetition remediation, ad-hoc `pnpm exec tsx -e` debug attempts, and permissive `inferHistoricalEntitySeedFromSurfaceV34` hook in claim extraction creating garbage geographic entities (`Russian`, `Each French`, `Fires`, etc.) that broke map geography acceptance.
- `packages/history/test/acceptance/history-v35-corpus.acceptance.ts` **passes** after:
  - Canonical seeds for Tsar Alexander / Russian / Poland
  - Rejecting discourse quantifiers (`each`, `tensions`, standalone `alexander`)
  - Map compiler adds scoped geographic-qualifier places to labels
  - Poland place seed in `history-geo-v34.ts`
  - **Removed** infer fallback from `extractEntitiesForUnit` (keep function for targeted tests only)

## Do first

1. Read `.cursor/rules/history-v34-focused.mdc` and obey anti-loop verification rules.
2. Run exactly one focused command:

```bash
pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts
```

3. If green, proceed to portfolio regeneration — do not reopen planner churn without a failing focused test.

## Explicit stop rules

- Do not use ad-hoc `node -e` / `tsx -e` debug scripts.
- Do not chain `pnpm build` with `pnpm test:focused`.
- Do not rerun the same focused test more than twice without a code change.
- After 12 edits to the same file, stop and report.
- Do not hand-edit generated `episodes/*-v3.5/` JSON.

## Still pending

- Napoleon `EDITORIAL_REPETITION_THRESHOLD` content blocker (other three episodes structurally/content reviewable except timing)
- `TIMING_MEASUREMENT_REQUIRED` production blockers (expected)
- Human historical attestation (`HISTORICAL_APPROVAL_UNATTESTED`)

## Fresh session start

```
Read and follow prompts/history-v35-cursor/00-restart-handoff.md
```
