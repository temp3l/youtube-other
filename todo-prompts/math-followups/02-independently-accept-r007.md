# Recommended next prompt: independently accept R-007

Recommended model: `gpt-5.6-sol` (Codex selector: `5.6-sol`).

Recommended reasoning: `max`. If `max` is unavailable, use
`xhigh`/`extra-high`.

Why: this is an independent adversarial acceptance review across strict
TypeScript contracts, Remotion/Chromium rendering, deterministic caching,
FFmpeg packet semantics, and prior boundary-render evidence. It should favor
review accuracy over latency. Cost-aware fallback: `gpt-5.6-terra` with
`xhigh` reasoning.

```text
Continue from the current worktree. Read AGENTS.md,
docs/ai-context/context-pack.md,
docs/mathe/audits/remediation-backlog.md,
docs/mathe/plans/math-genre-implementation-plan.md,
docs/mathe/plans/math-genre-test-matrix.md,
docs/reports/codex-runs/2026-07-12-math-media-remediation.md,
and docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md.

Inspect actual Git state first. Baseline is ac21261; expected HEAD is
9651a4036d8d29cc0a545eb5bceb53a02e4135da, but Git is authoritative. Preserve
every pre-existing tracked and untracked change. Do not clean, reset, commit,
regenerate fixtures, or modify generated episode assets.

R-006 is accepted. Independently review R-007 for acceptance only. Do not
implement R-008 or any later remediation item. Do not publish or call paid
providers, remote renderers, external media services, or story/horror
fallbacks.

Current evidence, to verify rather than assume:

- The exact small local Remotion integration passed with valid audio/video,
  DTS continuity, corruption scanning, and corrupt-media rejection.
- The focused math-rendering unit file passed 9/9.
- One actual temporary 180-second, 1920x1080, 30fps provider-free MP4 passed
  in 823 seconds. It proved inclusive duration, narration/frame
  synchronization, audio/video streams, packet continuity, corruption scan,
  and no intercepted external fetch. The binary was deleted.
- The prior package typecheck found two defects. Narrow repairs made
  RemotionMathVideoProps extend Record<string, unknown> and made fraction()
  handle unchecked split elements. The human has now run
  `pnpm --filter @mediaforge/math-rendering typecheck` successfully.

Treat the human typecheck result and prior reports as evidence, not as a
substitute for independent source review. Before editing, identify any exact
contract defect and owning file. Inspect at minimum:

- packages/math-education/src/lesson/timing.ts
- packages/math-rendering/package.json and tsconfig.json
- packages/math-rendering/src/audio/mock-tts.ts
- packages/math-rendering/src/assets/teacher.ts
- packages/math-rendering/src/components/{math-components,svg-cache}.ts
- packages/math-rendering/src/composition/{composition,remotion-entry,remotion-runner}.ts*
- packages/math-rendering/src/{provider-free-media,profiles/profiles,quality/media-qa}.ts
- packages/math-rendering/src/math-rendering.unit.test.ts
- packages/math-rendering/src/math-media.integration.test.ts
- relevant repo-native speech/render validation contracts
- math artifact/workflow/quality/CLI modules only if an R-007 acceptance claim
  depends on their lineage or operational wiring

Use adversarial review. Confirm:

- every displayed mathematical value is fact-bound;
- inputs are strict structured AST/unit data only, with no caller LaTeX or
  numeric unbound labels;
- invalid number-line, graph, geometry, table, measurement, and probability
  semantics fail explicitly;
- SVG/cache, TTS, timing, and render fingerprints include all relevant inputs
  and are deterministic;
- teacher frame area and timeline presence are each <=25 percent;
- missing teacher/component, unsafe bounds, unreadable glyphs, cue drift,
  corrupt media, missing streams, duration violations, and DTS gaps block;
- Remotion receives resolved scene props and renders the synchronized ranges;
- 179/180/300/301 boundaries are enforced inclusively;
- no story/horror import, fallback, paid provider, remote renderer, or network
  media dispatch exists in the R-007 path.

Within a fresh AGENTS.md verification budget, run only:

1. pnpm --filter @mediaforge/math-rendering typecheck
2. pnpm test:focused -- packages/math-rendering/src/math-rendering.unit.test.ts
3. pnpm test:focused -- packages/math-rendering/src/math-media.integration.test.ts -t "creates cached mock speech, performs a local Remotion render, and rejects corrupt media"

Do not rerun the 180-second render merely to duplicate the recorded evidence.
Rerun it only if source review shows that the recorded boundary test did not
exercise the production runner or its assertions are materially unsound; if
that happens, explain the defect and budget impact before running it. Do not
weaken assertions, update snapshots, regenerate fixtures, or broaden tests.

If source review and all fresh checks pass, change R-007 to exactly an accepted
status dated 2026-07-12 and summarize the independent evidence. Acceptance is
authorized only for R-007. Do not start R-008 in the same task. If any material
criterion is unsupported, keep R-007 pending and report the exact defect,
command/test failure, owning module, and smallest follow-up.

Update:

- docs/mathe/audits/remediation-backlog.md
- docs/reports/2026-07-12/math-genre-implementation-plan-implementation-report.md
- a required Codex run report under docs/reports/codex-runs/

Keep reports under 200 words. Report exact changed paths, checks/results,
current commit hash, acceptance decision, remaining risks, and anything not
rerun. Do not commit unless explicitly asked.
```
