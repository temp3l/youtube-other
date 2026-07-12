# Recommended next prompt: repair remaining R-007 acceptance blockers

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-13-math-r007-acceptance-review.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect Git state first. Baseline is ac21261; expected HEAD is
949022648057a7e09f50be3fdcdd981496644a9b, but Git is authoritative. Preserve
all tracked and untracked changes, especially .tmp/mock-openai-server.mjs.
Do not clean, reset, commit, regenerate fixtures, modify generated episode
assets, or edit generated dist files.

R-006 is accepted. R-007 remains implemented but pending after independent
acceptance was rejected on 2026-07-13. Repair only the documented R-007
blockers. Do not accept R-007 in this task and do not start R-008.

Before implementation, trace the actual production and test resolution paths
and identify the exact files to change. Address all of these blockers:

1. Authoritative artifact lineage

- The provider-free media path must consume authoritative R-004 lesson and
  narration artifacts, not caller-supplied objects made self-consistent by
  recomputing content hashes.
- Validate schema version, file/content hash, owning stage, workflow output,
  parent hashes, lesson identity/variant/objective, rebuilt fact lock,
  narration hash, resolved-fact hashes, and scene membership before cache
  creation, teacher loading, TTS, or rendering.
- Use the existing artifact/workflow lineage contracts. Do not introduce a
  parallel weaker provenance model.
- Add adversarial tests for forged inline content, wrong parent hashes,
  wrong owning stage, swapped artifacts, and valid payloads absent from the
  authoritative workflow.

2. Exact displayed scene coverage

- Every locked fact assigned to a rendered scene must be represented exactly
  once by that scene's semantic visual bindings.
- Reject omitted, duplicated, extra, cross-scene, same-ID/different-AST,
  same-ID/different-unit, and compound-value mismatches.
- Teacher scenes must not bypass mathematical coverage. If a teacher and a
  mathematical visual must coexist, model that explicitly without weakening
  fact coverage, safe-area, area, or timeline limits.
- Ensure requested component kinds are compatible with the authoritative
  lesson/visual plan.

3. Truthful visual bounds and readability

- Replace constant claimed bounds with measured or demonstrably conservative
  bounds derived from actual output.
- Attack long but schema-valid AST labels at number-line endpoints, graph
  points/bounds, geometry labels, measurement labels, probability branches,
  and table cells.
- Overflow, clipping, unreadable scaling, or inability to establish bounds
  must block readiness.
- Keep plain SVG labels free of generated LaTeX commands and preserve AST
  grouping/operation semantics.
- Bump cache renderer identity for every changed renderer behavior. Preserve
  the formula renderer's existing identity only if its output is unchanged.

4. Production/test timing resolution

- Remove the src/dist mismatch that allowed direct-source timing tests to pass
  while @mediaforge/math-education runtime resolved stale dist.
- Tests must exercise the same current implementation consumed by the
  production math-rendering path.
- Do not edit or commit dist artifacts.
- Timing creation and synchronization must share the same deterministic 30fps
  allocator, including final-segment reconciliation.
- Retain scene-span/audio equality, identity, continuity, total duration,
  cue-position, fact-count, and finite non-negative integer tolerance checks.
- Keep 180 and 300 valid and 179 and 301 invalid.

Preserve existing media fail-closed behavior: missing assets/streams, excessive
teacher presence, corrupt media, duration errors, packet gaps, absent packet
evidence, and unavailable corruption evidence must block readiness. No
story/horror fallback, paid provider, remote renderer, external media service,
publish, or network media dispatch may be introduced.

Run only these checks, in order:

1. pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts
2. pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"
3. pnpm --filter @mediaforge/math-education --filter @mediaforge/math-rendering typecheck

If the integration fails only with the known sandbox
uv_interface_addresses error, rerun the unchanged command once with approved
host access. Do not weaken assertions, update snapshots, regenerate fixtures,
or run broad verification.

Do not rerun the 180-second render unless the repair materially changes the
production Remotion pixels, scene props/frame ranges, muxing, or media QA
assertions. Before rerunning, state the exact stale claim and budget impact.

After repair, keep R-007 as implemented, pending new independent acceptance.
Update only:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new report at
  docs/reports/codex-runs/2026-07-13-math-r007-second-blocker-repair.md

Keep reports under 200 words. Report changed paths, exact checks/results,
current commit hash, remaining risks, and anything not rerun. Do not commit.
```
