# Task 18: Rollout, Deprecation, And Telemetry

## 1. Objective

Add production telemetry, savings reports, rollout defaults, and staged deprecation notes for obsolete one-scene-one-image assumptions.

## 2. Dependencies

Tasks 14, 15, 16, and 17.

## 3. Likely Files

- `packages/observability/src/telemetry.ts`
- `apps/cli/src/*status*`
- `docs/plans/visual-retention-shot-architecture/*.md`
- Relevant architecture docs only if behavior is now implemented.

## 4. Implementation Steps

- Record source-image count, rendered shot count, shots per image, avoided image calls, estimated savings, cache-hit ratio, opening changes, longest static interval, and validation status.
- Add concise CLI/report output.
- Mark deprecated assumptions and old manifests in docs.
- Keep legacy render fallback until shot-aware path has production confidence.

## 5. Tests

- `pnpm test:focused -- packages/observability/src/telemetry.unit.test.ts`
- `pnpm test:focused -- apps/cli/src/episode-status-output.unit.test.ts`
- `pnpm test:focused -- apps/cli/src/images-status-output.unit.test.ts`

## 6. Acceptance Criteria

- Operators can see image savings and visual-retention metrics after planning/render.
- No complete narration or secrets are logged.
- Deprecated components are documented but not deleted.

## 7. Risks

- Metrics may imply false precision. Label image savings as estimated.

## 8. Parallelization

Final serial task after integrations.

## 9. Recommended Model

GPT-5.5 Medium, medium reasoning.

## 10. Commit Boundary

Commit telemetry, status/report updates, and deprecation docs only.

