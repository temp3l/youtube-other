# Microdrama plans/tasks — V5 remediated corpus update

Date: 2026-08-12

## Summary

Updated authoritative microdrama planning artifacts to adopt
`content-packs/seven-minutes-ahead-content-pack-v5-remediated/` as the
production corpus (`seven-minutes-ahead` / `v5-remediated`). V4 phase doc
marked SUPERSEDED.

## Changed files

- `docs/plans/microdrama/phase-00c-v5-seven-minutes-ahead-remediated-production.md` (new)
- `docs/plans/microdrama/phase-00c-v4-seven-minutes-ahead-multilingual-production.md`
- `docs/plans/microdrama/README.md`
- `docs/plans/microdrama/implementation-plan.md`
- `docs/plans/microdrama/phase-00-repository-characterization.md`
- `docs/tasks/microdrama/implementation-backlog.json`
- `docs/decisions/ADR-MICRODRAMA-004-one-canon-locale-projections-and-selected-audio-timing.md`

## Key corpus deltas recorded

- 434 files; `qa/sha256-v5.json` covers 433 hashes (self-excluded).
- Canonical authority: EN v5; remediation notes in `qa/showrunner-remediation-v5.md`.
- V4 German E001/E002 boundary warning removed; V5 continuity audit is authoritative.
- WPM/timing/locale constraints unchanged.

## Validation

- Verified v5 hash manifest recomputes (433/433).
- JSON backlog parses; no remaining V4 corpus references in active task text.

## Risks

- Implementation code does not yet exist; parser/admission tasks still BLOCKED on MICRO-001.
