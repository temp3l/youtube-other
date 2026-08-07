# History V3.5 restart handoff

Use this prompt to resume the interrupted History V3.5 remediation. Read this file first, then continue with the smallest fix that moves the focused corpus test.

## Session status (2026-08-07)

- Prior agent session was stopped after an edit/debug spiral.
- V3.5 modules, CLI wiring, unit tests, and corpus acceptance scaffolding already exist.
- `packages/history/src/history-v35-semantics.unit.test.ts` passes.
- `packages/history/test/acceptance/history-v35-corpus.acceptance.ts` is the current blocker.

## Do first

1. Read `.cursor/rules/history-v34-focused.mdc` and obey the anti-loop verification rules.
2. Run exactly one focused command:

```bash
pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts
```

3. Fix only the first failing invariant before rerunning the same file.

## Known failing invariants

### Roman Empire episode

1. `TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION` is still present in `plan.approval.production.blockerCodes`.
   - Likely beat: `beat-0051`
   - Owning modules: `packages/history/src/history-visual-semantics-v35.ts`, `packages/history/src/visual-planner-v35.ts`
   - Expected fix: choose a semantically justified visual treatment or valid remediation, not a shorter text-only beat.

2. Invented route still allowed:
   - `movingActor: "narrated expedition"`
   - `origin.label: "Rome"`
   - `destination.label: "Europe"`
   - Owning modules: `packages/history/src/history-geo-v35.ts`, `packages/history/src/history-visual-semantics-v35.ts`
   - Expected fix: suppress unsupported route synthesis for non-movement claims.

## Explicit stop rules

- Do not use ad-hoc `node --input-type=module -e` debug scripts.
- Do not chain `pnpm build` with `pnpm test:focused`.
- Do not rerun the same focused test more than twice without a code change.
- After 12 edits to the same file, stop and report instead of continuing incremental patches.
- Do not regenerate the four-episode portfolio until this corpus acceptance file passes.
- Do not hand-edit generated `episodes/*-v3.5/` JSON.

## Still pending after corpus acceptance passes

- Franklin narration corrections (134 -> 129 chronology, HMS Terror hatch wording)
- Four-episode regeneration under `history-visual-plan.v3.5`
- Combined bulk review pack with comparative metrics
- Completion report with exact commands, hashes, and remaining blockers

## Suggested focused regression tests to add before more planner churn

- Roman `beat-0051` must not emit `TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION`
- Roman `map-state-0001` must not emit unsupported `Rome -> Europe` / `narrated expedition` route

Add these as narrow acceptance/unit tests if planner edits are not converging quickly.
