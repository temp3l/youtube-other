# A-006 observability

Summary: implemented structured math telemetry and redaction under explicit user gate
override. Added bounded math context, deterministic correlation IDs, null-cost warnings,
central redaction for secrets/headers/Base64/binary/oversize payloads, verifier success
and failure events, and persisted workflow/batch correlation IDs.

Changed paths: `packages/observability/src/{math-telemetry.ts,math-telemetry.unit.test.ts,index.ts}`,
`packages/observability/dist/*`, `packages/math-education/package.json`,
`packages/math-education/src/orchestration/{workflow.ts,batch.ts,pilot-simulation.ts}`,
`packages/math-education/src/verification/sympy-adapter.ts`, this report.

Tests: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/observability/src/math-telemetry.unit.test.ts`
failed once on an overbroad Base64-shaped fixture, then passed, 3 tests.
`pnpm --filter @mediaforge/observability build` passed.
`pnpm --filter @mediaforge/observability --filter @mediaforge/math-education typecheck`
failed twice; final failure was the pilot-simulation `releaseId/releaseHash` call, fixed
after retry budget without rerun.

Commit: not committed.

Risks: no broad integration run; A-003/A-004 evidence was bypassed by request.
