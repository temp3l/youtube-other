# Task 02: Security, Observability, Remote Render, And CLI Freshness

## Objective

Close global safety gaps that would expose creator content or undermine resumable execution.

## Dependencies And Parallelism

Depends on Task 00. Safe in parallel with Task 01.

## Exclusive Ownership

- `packages/process-runner/src/index.ts` and its unit test
- `packages/observability/src/telemetry.ts` and its unit test
- `packages/shared/src/openai-debug-logger.ts` and its unit test
- remote-render contracts under `packages/rendering/src/`
- `scripts/remote-render-worker.mjs` and focused remote-render tests
- a new extracted CLI doctor module/test; coordinate with lead before touching `apps/cli/src/index.ts`

## Required Behavior

- Redact sensitive argv values, URL credentials/query values, sensitive response headers, absolute content paths, and source text from normal logs.
- Make content-bearing debug logging explicit and disabled by default for protected sources.
- Add strict versioned remote job/marker schemas, unique IDs, containment checks, dependency hashes, and maximum concurrency.
- Make `doctor` report stale/missing packaged CLI output.
- Preserve current process timeouts, cancellation, and secret-redaction behavior.

## Verification

```bash
pnpm test:focused -- packages/process-runner/src/index.unit.test.ts
pnpm test:focused -- packages/observability/src/telemetry.unit.test.ts
pnpm test:focused -- apps/cli/src/mediaforge-bin.unit.test.ts
```

## Acceptance

Security snapshots contain no supplied token, source phrase, URL query secret, or sensitive header; malformed/duplicate/traversing remote manifests fail before process creation; stale CLI output is actionable.

Lead checkpoint: `fix(safety): harden telemetry remote render and cli freshness`.
