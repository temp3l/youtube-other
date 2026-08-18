# Veronica English portfolio systemic remediation

## State

`PARTIALLY_REMEDIATED` — canonical provenance and QA availability are now deterministic and typed. Three visual-beat failures remain deliberately blocked rather than being varied cosmetically.

## Implemented

- `prepareCanonicalSourceEpisodeWorkspace` now fails closed with `STALE_WORKSPACE_SOURCE_MAPPING` when an existing script differs from its active canonical source. A caller must explicitly set `allowSourceReplacement` to replace it; this protects selected audio/timing provenance.
- Added regression coverage for an active localized short, stale source mapping, missing/replacement behavior, and explicit replacement.
- Added typed operational classification for QA `UNAVAILABLE`: budget, prerequisite, or provider. Budget exhaustion remains resumable and is not a semantic failure or negative cache entry.
- Re-ran deterministic source discovery and recensus. Eight former planner-input errors are correctly classified as stale workspace-source mappings.

## Deferred safely

The three diversity blockers require a source-compatible action candidate that the bounded refiner cannot yet prove for their legacy planner evidence. A trial that broadened refinement made the opening-novelty contract fail; it was reverted. No quality threshold or source semantics changed.

## Validation

- Focused ingestion + QA tests: 57 passing.
- Visual-beat focused suite exposed the above pre-existing/refiner contract conflict; no weakening applied.
- `pnpm --filter @mediaforge/strategic-reinvention typecheck`: PASS.
- `git diff --check`: PASS.

## External calls

Historical census ledger: 4 QA requests, `$0.069837`. This run: paid QA/TTS/image/thumbnail/render/publication/playlist calls `0`; cost `$0`.

## Risks / follow-up

Explicitly authorize workspace source replacement only together with audio/timing regeneration. Add proposition-preserving candidate generation for the three legacy diversity cases before another QA tranche.
