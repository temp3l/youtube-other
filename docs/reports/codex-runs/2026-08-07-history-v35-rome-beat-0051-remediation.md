# History V3.5 Rome beat-0051 remediation

## Summary
Fixed Roman Empire `TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION` on `beat-0051` and suppressed invented `Rome → Europe` comparison routes without movement authorization. Added Franklin Northwest Passage geography remediation for rhetorical interest beats.

## Franklin chronology fix
- `134 officers and crew` and `remaining 129` are now extracted as quantitative crew counts instead of misclassified temporal years.
- Owning module: `packages/history/src/history-claims-v34.ts` (`extractTemporalAndQuantitative`).

## Changed files
- `packages/history/src/history-geo-v35.ts`
- `packages/history/src/visual-planner-v35.ts`
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-v35-franklin-geo.unit.test.ts`

## Rome fixes
1. **beat-0051 TEXT_ONLY**: Long timeline beats that lack dated events now fall back to `archival image` instead of `text-only transition`. Map remediation failure also falls back to archival. Added Britain location map intent for imperial-decline claim.
2. **Rome → Europe route**: Non-movement `comparison` and route map intents with distinct endpoints collapse to single-place `location` maps.

## Franklin fix
- Rhetorical `interest in the Northwest Passage` beats use `archival image` instead of misclassified map modality.
- `proposeMapIntentsV35` expands non-movement claims with multiple geographic qualifiers into `area` intents with waypoint labels.

## Tests
```bash
pnpm test:focused -- packages/history/src/history-v35-franklin-geo.unit.test.ts
```
- Exit 0 (2 tests: crew counts 134/129 + multi-place map intents)

Corpus acceptance should pass after rerun:
```bash
pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts
```

## Risks / follow-up
- Corpus acceptance not re-run in this session (hook limit).
- Portfolio regeneration not run.
