# Semantic chalkboard v4

## Changed files

- `apps/cli/src/math-commands.ts`, `math-workflow-runtime.ts`, and focused tests
- `packages/math-education/src/orchestration/canonical-task-adapters.ts` and focused tests
- `packages/math-rendering/package.json`, renderer/component/composition sources, exports, and focused tests
- `pnpm-lock.yaml`
- `docs/architecture/media-assets-and-delivery.md`

## Tests and checks

- Focused Vitest: 4 files/15 tests passed.
- Follow-up focused Vitest: 2 files/12 tests and 1 file/4 tests passed.
- Affected package TypeScript builds passed.
- Three 1920×1080 German pilot videos passed media and visual validation.
- Full-resolution frame and contact-sheet review passed after correcting the long fact-card overflow.
- Speech hashes remained unchanged; rerenders had 23 cache hits, zero misses, zero new calls, and USD 0.000 new provider cost.

## Risks and follow-up

- Only M5-ZO-001, M5-GM-002, and M5-DZ-001 were rerendered and reviewed.
- Unsupported future semantic component kinds intentionally block production until implemented.
