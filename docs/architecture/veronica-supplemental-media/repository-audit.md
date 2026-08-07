# Repository Audit (Veronica Supplemental Media)

## Monorepo boundaries

- Primary new package: `packages/veronica-media`
- Genre profile: `packages/strategic-reinvention` (`strategic-reinvention` / creator `veronica-benini`)
- CLI surface: `apps/cli/src/veronica-media-commands.ts`

## Reusable generic infrastructure

| Capability | Location | Reuse strategy |
|------------|----------|----------------|
| Content-source provenance | `packages/domain`, `packages/source-ingestion` | Consumed |
| Editorial supplied media | `packages/visual-planning/editorial-documentary-plan.ts` | Reference only |
| Render manifest pattern | `packages/rendering` | Reference only; Veronica owns compiler |
| Workflow approvals | `packages/domain/workflow-contracts.ts` | Consumed |
| Episode artifact paths | `packages/shared` | Consumed |

## History-specific (not reused)

- `packages/history/src/visual-planner-v35.ts`
- History claims/maps/chronology contracts

## Tests and fixtures

- Pilot fixture: `packages/veronica-media/src/fixtures/pilot.ts`
- E2E: `packages/veronica-media/src/pipeline/orchestrator.integration.test.ts`
