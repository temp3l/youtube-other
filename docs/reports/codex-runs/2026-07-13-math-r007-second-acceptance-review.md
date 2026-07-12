# Math R-007 second independent acceptance review

- Decision: reject; R-007 remains implemented and pending on 2026-07-13. R-008 was not started.
- Changed paths: `docs/mathe/audits/remediation-backlog.md`; `docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md`; this report.
- Blocker/owner: `packages/math-rendering/src/provider-free-media.ts` passes `visualPlan` into `factBindingInputSchema`, a strict schema that omits that field. Thus `createProviderFreeMediaSlice()` rejects every authoritative request before cache, teacher loading, TTS, or render. `packages/math-education/src/orchestration/artifact-schemas.ts` also allows missing/extra visual-plan scenes, and provider validation skips absent plan entries.
- Evidence gap: the authorized integration filter skips the 180-second production-boundary test, so its passing small render does not exercise this path.
- Checks: `pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts` passed 14/14. Authorized `pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"` failed only with sandbox `uv_interface_addresses`, then passed unchanged with host access (1 passed, 1 skipped). `pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering typecheck` passed.
- Commit: `996ba78f99804bf7dd85b668642e42b16107a2d8`; baseline `ac21261`; uncommitted.
- Not rerun/risks: 180-second render and changed pixels/teacher overlay; no build, fixtures, generated/dist assets, provider/network, fallback, publish, or commit.
- Smallest repair: validate `visualPlan`, require exactly nine exact scene entries, add missing/extra-plan attacks, then seek acceptance.
