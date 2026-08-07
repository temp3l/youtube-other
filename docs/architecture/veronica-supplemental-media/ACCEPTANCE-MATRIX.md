# Acceptance Matrix

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Mixed media ingest | pass | `secure-ingest.unit.test.ts` |
| Narration revision traceability | pass | `media-plan.v1.unit.test.ts`, pilot fixture |
| Versioned semantic plan | pass | `veronica-media-plan.v1` schema |
| Claim/source/placement linkage | pass | semantic planner + plan schema |
| Hard approval eligibility | pass | `approval/eligibility.ts` |
| Embedded text translation flags | pass | prepared asset translation status |
| Distinct 16:9 and 9:16 plans | pass | landscape/portrait placements + manifests |
| Multi-state visual sequences | pass | PDF/PPTX multi-state planner |
| Post-TTS anchor resolution | pass | `resolveAnchorTimings` in pipeline |
| Typed FFmpeg manifest | pass | `rendering/compiler.ts` |
| Approval pack export | pass | `review-pack/export.ts` |
| Explicit fallback behavior | pass | fallback policy on placements |
| Content-addressed reuse hooks | pass | checksums + cache keys |
| Regeneration scope | pass | `workflow/regeneration.ts` |
| Planner metrics | pass | `metrics/planner-metrics.ts` |
| Idempotent resume | pass | state dir + plan artifact persistence |
| Non-Veronica compatibility | pass | `compatibility.unit.test.ts` |

## Verdict

`ACCEPTED_WITH_MEDIUM_RISKS`

Medium risks:

- Pilot render uses deterministic placeholder PNG bytes; production rasterization of PDF/PPTX pages is not yet wired to an external renderer
- FFmpeg commands are compiled and validated but not executed in CI by default
