# Entity Resolution Architectural Remediation (V3.5)

**Date:** 2026-08-08

## Summary

Replaced loose geographic heuristics with a typed candidate pipeline, strict geographic eligibility, deterministic resolution states, and corrected `ENTITY_RESOLUTION_COVERAGE_LOW` denominator semantics. Added canonical registry entries for Pearl Harbor, Rapa Nui/Easter Island, and representative geographic/non-geographic entities. HMS Terror alias matching now blocks historical-event Terror contexts.

## Root cause

1. `isCredibleGeographicCandidateV35` inferred `place` from any two-token proper noun via `inferHistoricalEntitySeedFromSurfaceV34`, polluting the geographic coverage denominator with people, organizations, and military units.
2. Missing canonical seeds for Pearl Harbor and Rapa Nui/Easter Island caused `uncanonical-surface` rejections for core subjects.
3. Weak `Terror` alias on HMS Terror could match event narration without ship/Franklin context.

## Architecture

**Pipeline:** candidate surface → `classifyEntityCandidateV35` (kind + geographic relevance) → geographic path via `isEligibleGeographicResolutionCandidateV35` → `resolveCanonicalEntityV35` (resolved | ambiguous | unresolved) → optional `adjudicateEntityResolutionV35` (ambiguous-only, fail-closed).

**Resolution precedence:** exact canonical → exact strong alias → normalized strong alias → contextual weak alias (blocked when unsafe) → ambiguous → unresolved. No substring-to-identity.

**Geographic coverage:** denominator = resolved geographic entities + rejected entities that pass typed geographic eligibility only. Zero eligible candidates → no `ENTITY_RESOLUTION_COVERAGE_LOW` (payload `geographicCoverageStatus: not-applicable` when measured path runs).

**LLM adjudication:** `adjudicateEntityResolutionV35` accepts bounded candidate IDs only; unavailable adjudicator preserves ambiguous/unresolved.

## Changed files

- `packages/history/src/history-entity-resolution-v35.ts`
- `packages/history/src/history-claims-v34.ts`
- `packages/history/src/history-visual-semantics-v35.ts`
- `packages/history/src/history-core-subject-v35.ts`
- `packages/history/src/history-entity-resolution-v35.unit.test.ts`

## Tests run

- `pnpm test:focused -- packages/history/src/history-entity-resolution-v35.unit.test.ts` — 43/44 passed; fixed `island` → `place` kind mapping (Hatteras Island)
- `pnpm test:focused -- packages/history/src/history-v35.unit.test.ts` — 14/14 passed

## Follow-up

- Re-run entity-resolution unit tests after island kind fix
- Run `history-core-subject-v35.unit.test.ts` and focused episode regeneration (Pearl Harbor, Rapa Nui, Reign of Terror)
- Full 01–40 corpus acceptance after focused validation

## Risks

- Focused episode regeneration not yet executed in this session
- `inferHistoricalEntitySeedFromSurfaceV34` still used for non-geographic surfacing; monitor for new false negatives on obscure place names
