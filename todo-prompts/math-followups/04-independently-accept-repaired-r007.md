# Recommended next prompt: independently accept repaired R-007

Recommended model: `gpt-5.3-codex`.

Recommended reasoning: `xhigh`. Use `high` when latency or cost matters more
than maximum review confidence. If GPT-5.3-Codex is unavailable, use the
strongest available Codex model with `xhigh` or `high` reasoning.

Why: this is a review-heavy cross-package acceptance decision involving exact
mathematical semantics, artifact provenance, TypeScript runtime resolution,
deterministic frame allocation, SVG safety, Remotion, and FFmpeg evidence.
OpenAI currently describes GPT-5.3-Codex as its most capable agentic coding
model and documents `low`, `medium`, `high`, and `xhigh` reasoning efforts:
https://developers.openai.com/api/docs/models/gpt-5.3-codex

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-12-math-media-remediation.md,
docs/reports/codex-runs/2026-07-12-math-r007-acceptance-review.md,
docs/reports/codex-runs/2026-07-12-math-r007-acceptance-blocker-repair.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect actual Git state first. Baseline is ac21261; expected HEAD is
949022648057a7e09f50be3fdcdd981496644a9b, but Git is authoritative. Preserve
every pre-existing tracked and untracked change, including
.tmp/mock-openai-server.mjs if it still exists. Do not clean, reset, commit,
regenerate fixtures, build generated trees, or modify generated episode assets.

R-006 is accepted. R-007 is implemented, pending independent acceptance dated
2026-07-12. Independently review R-007 for acceptance only. This is a
review-only task: do not repair production or test code. If a material defect
is found, keep R-007 pending, document the exact blocker, and stop. Do not start
R-008 or any later remediation item. Do not publish or call paid providers,
remote renderers, external media services, network media services, or
story/horror fallbacks.

Evidence to verify rather than assume:

- The blocker-repair unit file passed 12/12 after its timing assertions were
  changed to import math-education source directly because the workspace
  runtime entry resolves through existing dist.
- The exact filtered small local Remotion integration passed after one known
  sandbox-only uv_interface_addresses failure and an approved unchanged host
  rerun.
- pnpm --filter @mediaforge/math-rendering typecheck passed.
- The repaired math-education package typecheck was not rerun.
- A prior temporary 180-second 1920x1080/30fps provider-free render passed in
  823 seconds and was deleted. It predates the pre-render fact-binding repair,
  shared timing assertion, and stricter missing-continuity readiness rule.
  The repair report argues that the exercised formula pixels, scene props,
  frame ranges, muxing, and packet probe remain unchanged.

Before any documentation edit, identify the exact acceptance contract and
owning files. Inspect at minimum:

- packages/math-education/src/domain/{lesson,math-ast}.ts
- packages/math-education/src/localization/{fact-lock,localization}.ts
- packages/math-education/src/verification/{canonical-json,ast-normalizer}.ts
- packages/math-education/src/lesson/timing.ts
- packages/math-education/package.json
- packages/math-rendering/package.json and tsconfig.json
- packages/math-rendering/src/components/{math-components,svg-cache}.ts
- packages/math-rendering/src/provider-free-media.ts
- packages/math-rendering/src/audio/mock-tts.ts
- packages/math-rendering/src/composition/{composition,remotion-entry,remotion-runner}.ts*
- packages/math-rendering/src/profiles/profiles.ts
- packages/math-rendering/src/quality/media-qa.ts
- packages/math-rendering/src/math-rendering.unit.test.ts
- packages/math-rendering/src/math-media.integration.test.ts
- artifact/workflow lineage and schema modules only where needed to decide
  whether the media request consumes an authoritative upstream lesson artifact

Use adversarial source review, not report summaries. Confirm or reject each of
these claims:

Fact authority and binding:

- Every displayed scalar, measurement, unit scale/dimension/angle, graph
  point/tuple, table value, probability, and diagram value maps to canonical
  exact lesson semantics, not merely a matching ID or caller-provided hash.
- The lesson schema and content hash, rebuilt fact lock, narration content
  hash, resolved-fact semantic hashes, lesson identity/variant/objective, and
  exact scene membership are all checked before SVG cache creation, teacher
  asset loading, TTS, or rendering.
- Missing, duplicate, unsupported, cross-scene, same-ID/different-AST,
  same-ID/different-unit, and compound-value mismatch cases fail closed.
- Determine whether accepting an inline, self-consistent lesson object is
  sufficient under the existing R-004 artifact-lineage contract. Trace the
  actual call path and parent-hash authority; do not assume that a recomputable
  content hash proves upstream provenance.

Timing and runtime resolution:

- Timing creation and synchronization validation use the same deterministic
  30fps allocator, including final-segment rounding reconciliation.
- Every scene span must equal its audio allocation; identity, continuity,
  total duration, cue positions, fact counts, and finite non-negative integer
  tolerances remain enforced.
- 180 and 300 seconds pass; 179 and 301 fail.
- Verify that focused tests exercise the source used by the production package.
  Classify any src/dist mismatch or direct-source test import that masks actual
  package runtime behavior. Do not build or edit dist in this review.

Visual and media fail-closed behavior:

- Plain SVG text never exposes generated LaTeX commands, and AST-to-label
  rendering preserves grouping and operation semantics.
- Cache keys change for every renderer behavior change while the unchanged
  formula renderer legitimately retains its recorded identity.
- Safe-area bounds and minimum-glyph metadata describe or conservatively bound
  actual output rather than hard-coded claims. Specifically attack long but
  schema-valid AST labels near number-line/graph/table boundaries and decide
  whether overflow can pass readiness.
- Missing components/teacher assets, excessive teacher area or timeline
  presence, unreadable glyphs, corrupt media, missing streams, duration errors,
  packet gaps, absent packet evidence, and unavailable corruption evidence all
  block readiness.
- No story/horror import or fallback, paid provider, remote renderer, publish,
  or external media dispatch exists on the R-007 path.

Within one fresh AGENTS.md budget, run only, in this order:

1. pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts
2. pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"
3. pnpm --filter @mediaforge/math-education typecheck

The focused wrapper honors the file and test-name filters. If the integration
fails only with the known sandbox uv_interface_addresses error, classify it as
environmental and rerun the unchanged command once with approved host access.
Do not alter source for that failure. Do not weaken assertions, update
snapshots, regenerate fixtures, broaden verification, or run a second package
typecheck.

Do not rerun the 180-second render merely to duplicate recorded evidence. Rerun
it only if source review proves that the prior render evidence is materially
stale for the production render path or media assertions. Before any rerun,
state the exact stale claim, why the focused evidence cannot cover it, and the
verification-budget impact. A pre-render-only validation change does not by
itself require another 823-second render.

If and only if source review and all fresh checks establish every material
R-007 criterion, set R-007 to an accepted status dated 2026-07-13 and summarize
the independent evidence. Do not start R-008 in the same task. If any material
criterion remains unsupported, keep R-007 pending and report the exact defect,
owning module, command/test result, evidence gap, and smallest repair prompt.

Update only the decision documentation:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a new required Codex run report under docs/reports/codex-runs/ dated
  2026-07-13

Keep reports under 200 words. Report exact changed paths, checks/results,
current commit hash, acceptance decision, remaining risks, and anything not
rerun. Do not commit unless explicitly asked.
```
