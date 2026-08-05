# Codex Run: Strategic Task 08 Lineage Repair

## Summary

Repaired Italian canonical route/script QA to use the event-backed approval evaluator and exact canonical artifact fields. Corrected six-coordinate test event times so approval events never precede their records. No provider, publication, API mutation, or gate relaxation occurred.

## Changed Paths

- `packages/story-localization/src/strategic-italian-qa.ts`
- `packages/story-localization/src/strategic-italian-media-persistence.unit.test.ts`
- This report and the dated strategic implementation report

## Tests

- Focused reproduction: failed at `ITALIAN_ROUTE_OR_SCRIPT_LINEAGE_REQUIRED` as expected before repair.
- Exact focused regression: 1/1 passed; the other two file tests were skipped by the exact name filter.
- `pnpm typecheck:story-localization`: passed.

## Commit

Base HEAD `2029f3f`; changes are uncommitted.

## Unresolved Risks And Follow-up

Tasks 09–13 remain unstarted. History provider/map work, speech exporter and direct orchestration, worker abort/quarantine work, and the research-informed horror plan remain deferred by ADR-OPERATIONS-001. Strategic rights, creator-media, CTA, remote-render, reference-edit, approval, and reconciliation gates remain fail-closed.
