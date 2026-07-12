# Recommended next prompt: repair R-007 acceptance blockers

Recommended model: `gpt-5.6-sol` (Codex selector: `5.6-sol`).

Recommended reasoning: `max`. If `max` is unavailable, use `xhigh`.

Why: this requires adversarial cross-package reasoning about exact mathematical
lineage, structured AST/unit semantics, frame allocation, Remotion inputs, and
fail-closed media validation. OpenAI recommends GPT-5.6 Sol for complex
reasoning and coding. Cost-aware fallback: `gpt-5.6-terra` with `xhigh`
reasoning.

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-12-math-media-remediation.md,
docs/reports/codex-runs/2026-07-12-math-r007-acceptance-review.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect actual Git state first. Baseline is ac21261; expected HEAD is
9651a4036d8d29cc0a545eb5bceb53a02e4135da, but Git is authoritative. Preserve
every pre-existing tracked and untracked change. Do not clean, reset, commit,
regenerate fixtures, or modify generated episode assets.

R-006 is accepted. R-007 remains pending after independent review. Repair only
R-007 acceptance blockers; do not accept R-007 in this task and do not start
R-008 or any later remediation item. Do not publish or call paid providers,
remote renderers, external media services, or story/horror fallbacks.

Fresh evidence:

- `pnpm --filter @mediaforge/math-rendering typecheck` passed.
- `pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts`
  passed 9/9.
- The exact filtered small local Remotion integration passed after its first
  attempt was blocked only by sandbox `uv_interface_addresses` access.
- The recorded 180-second 1920x1080/30fps provider-free render passed in 823
  seconds and was deleted. It was not rerun during acceptance review.

Two material defects block acceptance:

1. `packages/math-rendering/src/provider-free-media.ts` checks only whether a
   component fact ID occurs anywhere in `narration.resolvedFacts`. A caller can
   reuse a valid locked fact ID with a different AST value or unit and reach
   rendering. It also does not enforce scene-local fact membership.
2. `assertTimingSynchronization()` in
   `packages/math-education/src/lesson/timing.ts` recomputes cue positions from
   the supplied scene span but never verifies that each scene span equals the
   deterministic frame allocation for its audio duration. Skewed scene/audio
   boundaries can therefore validate when cue frames are adjusted to the
   skewed span.

Before editing, identify the exact contract and files. Inspect at minimum:

- packages/math-education/src/domain/{lesson,math-ast}.ts
- packages/math-education/src/localization/{fact-lock,display-verification,localization}.ts
- packages/math-education/src/verification/canonical-json.ts
- packages/math-education/src/lesson/timing.ts
- packages/math-rendering/src/components/math-components.ts
- packages/math-rendering/src/provider-free-media.ts
- packages/math-rendering/src/audio/mock-tts.ts
- packages/math-rendering/src/composition/{composition,remotion-runner}.ts
- packages/math-rendering/src/quality/media-qa.ts
- packages/math-rendering/src/math-rendering.unit.test.ts
- packages/math-rendering/src/math-media.integration.test.ts
- artifact/workflow lineage modules only as needed to use a schema- and
  hash-valid upstream fact source instead of trusting a new free-form hash

Implement the smallest sound repair.

Fact binding requirements:

- Bind every displayed component value to schema-valid upstream lesson/fact
  semantics, not merely a matching string ID and not a caller-supplied hash
  placed beside the component.
- Compare canonical exact semantics for scalar expressions, measurements
  including unit scale/dimensions/angle, and compound values such as graph
  points where supported. If a component-to-fact mapping is ambiguous or
  unsupported, reject it explicitly.
- Require each displayed fact ID to belong to that exact narration/lesson
  scene, preserve the locked lesson/fact-lock relationship, and reject missing,
  duplicate, cross-scene, same-ID/different-value, and same-ID/different-unit
  cases before SVG caching, TTS, or rendering.
- Keep inputs strict structured AST/unit data. Do not add caller LaTeX, numeric
  unbound labels, free booleans, or a permissive compatibility fallback.

Timing requirements:

- Use one deterministic 30fps frame-allocation contract for both timing
  creation and synchronization validation, including final-segment rounding
  reconciliation.
- Verify every scene start/end span against its corresponding audio segment,
  in addition to identity, continuous total duration, and cue positions.
- Reject non-finite or invalid tolerances and skewed scene spans even when cue
  frames are recomputed to fit the skew.
- Preserve inclusive 180/300 acceptance and 179/301 rejection.

During the focused source review, also check adjacent R-007 fail-closed cases:
plain SVG text must not expose generated LaTeX commands as unreadable labels;
AST rendering must preserve expression semantics; safe-area/glyph metadata
must describe actual output; and unavailable packet continuity evidence must
not be treated as ready. If source confirms any of these is unsound, make only
the smallest R-007 repair and add a semantic negative. Do not broaden into
R-008 quality-status or CLI work.

Required focused tests must include:

- valid ID with a different scalar AST rejected;
- valid ID with changed measurement unit/scale/dimensions rejected;
- a fact from the wrong scene rejected;
- supported graph/compound semantics accepted and mismatches rejected, or
  explicitly unsupported;
- a continuous timing manifest with deliberately skewed adjacent scene spans
  and recomputed cues rejected;
- unchanged deterministic timing remains accepted at 180 and 300 seconds;
- any confirmed adjacent fail-open case receives a direct negative assertion.

Within one fresh AGENTS.md budget, run only:

1. pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts
2. pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"
3. pnpm --filter @mediaforge/math-rendering typecheck

The focused wrapper honors the file and test-name filters. If the integration
fails only with the known sandbox `uv_interface_addresses` error, classify it
as environmental and rerun the unchanged command once with approved host
access; do not edit production code for that failure. Do not weaken
assertions, update snapshots, regenerate fixtures, or broaden verification.

Do not rerun the 180-second render if the repair changes only pre-render fact
validation and timing assertions while leaving Remotion/FFmpeg production
rendering unchanged. If the actual render path, scene props, frame ranges,
audio muxing, or media QA changes materially, explain why the recorded evidence
is stale and the verification-budget impact before deciding whether a boundary
rerun is necessary.

If the defects are repaired and all fresh checks pass, set R-007 to exactly
"implemented, pending independent acceptance 2026-07-12" and summarize the
new adversarial evidence. Do not mark it accepted. If any material criterion
remains unsupported, keep R-007 pending and report the exact defect, owning
module, command/test result, and smallest follow-up. R-008 must remain
untouched.

Update:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a required Codex run report under docs/reports/codex-runs/

Keep reports under 200 words. Report exact changed paths, checks/results,
current commit hash, status decision, remaining risks, and anything not rerun.
Do not commit unless explicitly asked.
```
