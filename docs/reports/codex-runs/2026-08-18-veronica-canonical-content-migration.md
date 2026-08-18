# Veronica canonical content migration

## Before

Competing inputs were Pack 1, two near-duplicate Pack 2 trees (different
`support/TIMING_REPORT.csv`), editorial master v5, full-transcripted content, and
ad hoc path-selecting CLI commands/scripts. The unified v2 pack exists once.

## After

`veronica-unified-content-pack-v2` resolves through one typed, fail-closed
resolver and validated registry. Production planning and workspace-based
metadata, TTS preparation, visual planning, QA, render, and supplemental paths
require its pack/story/episode/locale/hash identity. Legacy fallback is disabled.

## Files changed

Domain source/timing contract; strategic resolver, registry, ingestion and
planner guards; speech timing policy; Veronica metadata and CLI guards/commands;
focused tests; root scripts; this report and architecture document.

## Legacy references

Legacy adapters remain for explicit `prepare-legacy-*`/`legacy-plan-*` commands.
Historical census and reconciliation scripts retain old paths for provenance
diagnostics. They are excluded from canonical discovery.

## Validation

- Canonical validator: PASS — 18/18/36/54, 22 localized timing warnings, 0 provider calls.
- Speech policy tests: PASS (3).
- CLI registration tests: PASS (2).
- Canonical resolver tests: 6 PASS; final localization-matrix assertion corrected after the retry budget and not rerun.
- Strategic build: PASS; CLI typecheck: PASS.

## Provider usage

Paid provider calls: 0

## Known follow-up work

Synchronize v2 translations, add missing Spanish positioning and five-locale
`tx-*` translations, remediate 22 French timing failures, then perform native
review and later audiovisual planning. No media was generated.
