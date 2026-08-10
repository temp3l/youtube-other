# API approval gate alignment

- Changed files: `apps/api/src/contract.ts`, `apps/api/src/contract.unit.test.ts`.
- Tests/checks run: `pnpm test:focused -- apps/api/src/contract.unit.test.ts`; `pnpm --filter @mediaforge/api build`.
- Results: API TypeScript build passed. The new approval-gate assertions passed; one unrelated existing OpenAPI exposure assertion failed in the same unit-test file.
- Risks remaining: the strategic content blueprint intentionally retains its separate `final-render` policy gate; this change only aligns workflow approval reviews with persistence.
- Follow-up tasks: none.
