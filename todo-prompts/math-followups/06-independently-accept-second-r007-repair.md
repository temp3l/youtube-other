# Recommended next prompt: independently accept the second R-007 repair

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r007-acceptance-review.md,
docs/reports/codex-runs/2026-07-13-math-r007-second-blocker-repair.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
996ba78f99804bf7dd85b668642e42b16107a2d8, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs. Do
not clean, reset, commit, regenerate fixtures, modify generated episode assets,
edit generated dist files, or revert the pending R-007 repair.

R-006 is accepted. R-007 remains implemented and pending new independent
acceptance after its second blocker repair. Independently review R-007 for
acceptance only. Do not repair production or test code. If a material defect is
found, keep R-007 pending and document the exact blocker. Do not start R-008.

Trace the actual production and test paths and adversarially verify:

1. Authoritative artifact lineage

- Provider-free media consumes only authoritative R-004 workflow-owned lesson,
  narration, and visual-plan artifacts, never caller-supplied inline content.
- Validate schema version, file/content hash, owning stage, workflow output,
  parent hashes, lesson identity/variant/objective, rebuilt fact lock,
  narration hash, resolved-fact hashes, and scene membership before cache,
  teacher loading, TTS, or rendering.
- Attack forged inline content, wrong parents, wrong stage owner, swapped
  artifacts, duplicate outputs, path escapes, and valid payloads absent from
  the workflow. Confirm the existing lineage contract is used rather than a
  parallel weaker provenance model.

2. Exact displayed scene coverage

- Every locked scene fact is represented exactly once by that scene's semantic
  visual bindings with identical AST and unit semantics.
- Reject omitted, duplicated, extra, reordered or cross-scene facts,
  same-ID/different-AST, same-ID/different-unit, and compound-value mismatches.
- Teacher presence is an explicit overlay on a mathematical visual and cannot
  bypass coverage, visual-plan compatibility, safe area, area, or timeline
  limits.

3. Truthful visual bounds and readability

- Bounds are measured or demonstrably conservative for actual SVG output, not
  constant readiness claims.
- Attack long schema-valid labels at number-line endpoints, graph points and
  bounds, geometry and measurement labels, probability branches/nodes, and
  table cells. Overflow, clipping, unreadable scaling, or unknown bounds block.
- Plain SVG labels contain no generated LaTeX commands and preserve AST
  grouping/operation semantics.
- Every changed renderer behavior has a bumped cache identity. Confirm the
  formula renderer's output is unchanged before accepting its preserved
  identity.

4. Production/test timing resolution and media QA

- @mediaforge/math-education runtime and tests resolve the same current timing
  implementation; no stale dist path masks production behavior.
- Timing creation and synchronization use the same deterministic 30fps
  allocator, including final-segment reconciliation. Retain scene-span/audio
  equality, identity, continuity, total duration, cue-position, fact-count,
  and finite non-negative integer tolerance checks. Keep 180/300 valid and
  179/301 invalid.
- Missing assets/streams, excessive teacher presence, corrupt media, duration
  errors, packet gaps, absent packet evidence, and unavailable corruption
  evidence remain blocking.
- No story/horror fallback, paid provider, remote renderer, external media
  service, publish, or network media dispatch exists on this path.

Run only these checks, in order:

1. pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts
2. pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"
3. pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering typecheck

The repair task exhausted its unit repair reruns after correcting stale
stricter-error matchers, so the final matcher correction has not yet received a
fresh run. Treat the first command as required acceptance evidence. If the
integration fails only with the known sandbox uv_interface_addresses error,
rerun the unchanged command once with approved host access. Do not weaken
assertions, update snapshots, regenerate fixtures, or broaden verification.

The repair materially changed non-formula pixels and teacher composition, so
the prior 180-second render does not prove those changed pixels. Do not rerun it
automatically because it is outside the authorized checks. If acceptance truly
requires it, first state the exact unsupported claim, why focused evidence is
insufficient, and the estimated 3-minute artifact/20-minute test budget, then
request explicit authorization.

Issue an explicit accept or reject decision. Accept only if source review and
fresh checks establish every material R-007 criterion. If accepted, mark R-007
accepted dated 2026-07-13 but do not start R-008. If rejected, keep it pending
and report the exact defect, owning module, evidence gap, and smallest repair.

Update only:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new independent acceptance report under docs/reports/codex-runs/ dated
  2026-07-13

Keep reports under 200 words. Report changed paths, exact checks/results,
current commit hash, decision, remaining risks, and anything not rerun. Do not
commit.
```
