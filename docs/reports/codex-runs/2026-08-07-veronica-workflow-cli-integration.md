# Veronica workflow CLI integration

**Date:** 2026-08-07  
**Branch:** `veronica-media-integration-v2`

## Summary

Registered the strategic supplemental-media workflow in `workflow-commands` as the `strategic-episode` resource. Added operator factory exports in `strategic-reinvention` and a CLI profile-fixture path.

## Changed files

- `apps/cli/src/workflow-commands.ts`
- `apps/cli/src/workflow-commands.unit.test.ts`
- `apps/cli/src/veronica-media-commands.ts`
- `packages/strategic-reinvention/src/workflow-operator.ts`
- `packages/strategic-reinvention/src/index.ts`
- `docs/architecture/veronica-supplemental-media/MERGE-STATUS.md`

## Tests

| Command | Result |
|---------|--------|
| `pnpm test:focused -- packages/strategic-reinvention/src/workflow.integration.test.ts` | pass (3) |
| `pnpm test:focused -- apps/cli/src/veronica-media-commands.unit.test.ts` | pass (1) |
| `pnpm test:focused -- apps/cli/src/workflow-commands.unit.test.ts` | blocked — `@mediaforge/math-education` dist missing |

## Risks / follow-up

- `workflow-commands.unit.test.ts` needs built `math-education`/`dark-truth` dist or vitest alias before it can run in a clean checkout.
- Batch schema does not yet accept `strategic-reinvention`.
- Tasks 10–13 (publishing, full pilot fixture, operator docs) remain open.

## CLI usage

```bash
pnpm mediaforge -- workflow strategic-episode profile-fixture
pnpm mediaforge -- workflow strategic-episode graph --episode episode-001 --unit-root /tmp/episodes/episode-001
pnpm mediaforge -- veronica-media run --workspace /tmp/episodes --episode-id episode-001 --json
```
