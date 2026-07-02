# Task 14: Preview And Inspection CLI

## 1. Objective

Add CLI commands to plan, inspect, validate, and preview shot plans before full render.

## 2. Dependencies

Tasks 07, 08, and 13.

## 3. Likely Files

- `apps/cli/src/index.ts`
- New CLI output helper files.
- `apps/cli/src/*.unit.test.ts`

## 4. Implementation Steps

- Register `shots plan`, `shots inspect`, `shots validate`, and `shots preview`.
- Use resolver-owned paths for artifacts.
- Inspect report must include image count, shot count, duration stats, first-8s changes, climax cadence, shots per image, treatment distribution, validation warnings, estimated render time, avoided image calls, and savings.
- Add storyboard/contact-sheet metadata first; low-resolution preview can follow if renderer support is ready.

## 5. Tests

- `pnpm test:focused -- apps/cli/src/index.unit.test.ts`
- `pnpm test:focused -- apps/cli/src/shot-inspect-output.unit.test.ts`

## 6. Acceptance Criteria

- CLI emits stable JSON/text reports.
- Commands do not call paid providers.
- Preview/inspect can run without final render.

## 7. Risks

- CLI can duplicate path logic. Use shared resolver helpers.

## 8. Parallelization

Can run in parallel with Task 17 after Task 13.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit CLI commands and tests only.

