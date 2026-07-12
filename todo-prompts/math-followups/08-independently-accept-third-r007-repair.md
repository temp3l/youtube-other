# Recommended next prompt: independently accept the third R-007 repair

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r007-second-acceptance-review.md,
docs/reports/codex-runs/2026-07-13-math-r007-third-blocker-repair.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
996ba78f99804bf7dd85b668642e42b16107a2d8, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs. Do
not clean, reset, commit, regenerate fixtures, modify generated episode assets,
edit generated dist files, or revert the pending R-007 work.

R-006 is accepted. R-007 remains implemented and pending new independent
acceptance after its third blocker repair on 2026-07-13. Independently review
R-007 for acceptance only. Do not repair production or test code. If a material
defect is found, keep R-007 pending and document the exact blocker. Do not start
R-008.

First re-audit the two previously rejected blockers against source and tests:

1. Strict authoritative visual-plan validation

- Trace `createProviderFreeMediaSlice` through authoritative R-004 artifact
  loading and `assertProviderFreeFactBindings`.
- Confirm the strict binding schema declares and requires `visualPlan`; a valid
  authoritative request must pass schema validation without stripping fields
  or weakening any strict schema.
- Confirm validation completes before visual-cache reads/writes, teacher asset
  loading, TTS, or rendering.
- Confirm caller-supplied inline lesson/narration content remains forbidden and
  the existing workflow/artifact-lineage contract remains the sole provenance
  model.

2. Exact ordered scene and fact correspondence

- Confirm `mathVisualPlanSchema` requires exactly nine scenes with unique scene
  IDs and rejects duplicated per-scene fact IDs.
- Confirm exact ordered correspondence among visual-plan, lesson, narration,
  and requested scene IDs and fact IDs.
- Adversarially inspect missing, extra, duplicate, reordered, mismatched, and
  cross-scene plan entries/facts, including duplicate fact IDs that preserve
  array length.
- Confirm requested semantic component bindings still cover every locked scene
  fact exactly once with identical AST/unit semantics, enforce planned
  component compatibility, and prevent teacher overlays from bypassing checks.

Then verify the third repair did not regress the already reviewed R-007
contract:

- Formula and non-formula SVG output, teacher composition, timing, media QA,
  and their cache identities were not changed by the third repair.
- Authoritative lesson, narration, and visual-plan artifacts remain
  schema-/hash-valid, workflow-owned, parent-bound, identity-matched, and
  checked before media work.
- Safe-area/readability, teacher area/timeline, timing synchronization,
  duration, stream, corruption, and packet-continuity failures remain blocking.
- No story/horror fallback, paid provider, remote renderer, external media
  service, publish action, or network media dispatch exists on this path.

Run only these checks, in order:

1. pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts
2. pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"
3. pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering typecheck

If the integration fails only with the known sandbox uv_interface_addresses
error, rerun the unchanged command once with approved host access. Do not
weaken assertions, update snapshots, regenerate fixtures, or broaden
verification.

Do not run the 180-second production render. Its absence is an explicit
remaining evidence limitation, not authorization to expand verification. Do
not claim fresh pixel-level or teacher-overlay render evidence from the
filtered integration.

Issue an explicit accept or reject decision. Accept only if source review and
fresh checks establish the complete material R-007 contract, including both
third-repair blockers. If accepted, mark R-007 accepted dated 2026-07-13 but do
not start R-008. If rejected, keep it pending and report the exact defect,
owning module, evidence gap, and smallest repair.

Update only:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r007-third-acceptance-review.md

Keep reports under 200 words. Report exact changed paths, exact checks/results,
current commit hash, decision, remaining risks, and anything not rerun. Do not
commit.
```
