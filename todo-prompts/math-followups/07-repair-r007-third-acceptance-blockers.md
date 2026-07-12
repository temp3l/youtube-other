# Recommended next prompt: repair the third R-007 acceptance blockers

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r007-second-acceptance-review.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
996ba78f99804bf7dd85b668642e42b16107a2d8, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs. Do
not clean, reset, commit, regenerate fixtures, modify generated episode assets,
edit generated dist files, or revert the pending R-007 work.

R-006 is accepted. R-007 remains implemented and pending after its second
independent acceptance was rejected on 2026-07-13. Repair only the two blockers
documented in the second acceptance report. Do not accept R-007 in this task and
do not start R-008.

Required behavior:

1. `assertProviderFreeFactBindings` must accept and strictly validate the
   authoritative `visualPlan` supplied by `createProviderFreeMediaSlice`. Do
   not work around the failure by stripping unknown fields or weakening strict
   schemas.
2. Make the visual plan mandatory for provider-free production validation.
3. Require exactly nine visual-plan scenes with unique scene IDs.
4. Require exact ordered correspondence among visual-plan, lesson, narration,
   and requested scenes.
5. Reject missing, extra, duplicated, reordered, or mismatched visual-plan
   scenes and fact IDs.
6. Preserve exact semantic fact coverage, component compatibility, and
   teacher-overlay checks.
7. Ensure this validation completes before cache access, teacher loading, TTS,
   or rendering.
8. Add focused regression tests that would have caught the strict-schema
   production failure and missing, extra, duplicate, and reordered visual-plan
   entries.
9. Do not change formula or non-formula SVG output, teacher composition, timing,
   media QA, or their cache identities.
10. Keep the existing R-004 workflow/artifact-lineage validation intact. Do not
    add a parallel provenance model.

Do not run the 180-second production render. Focused schema/binding tests must
prove this repair without expensive media generation. Do not introduce a
story/horror fallback, paid provider, remote renderer, external media service,
publish action, or network media dispatch.

Run only these checks, in order:

1. pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts
2. pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"
3. pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering typecheck

If the integration fails only with the known sandbox uv_interface_addresses
error, rerun the unchanged command once with approved host access. Do not
weaken assertions, update snapshots, regenerate fixtures, or broaden
verification.

After repair, keep R-007 implemented and pending new independent acceptance.
Update only:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r007-third-blocker-repair.md

Keep reports under 200 words. Report exact changed paths, exact checks/results,
current commit hash, remaining risks, and anything not rerun. Do not commit.
```
