# History V3.5 restart and loop-prevention

## Summary
Stopped the stuck History V3.5 agent (PID 3202554), added restart handoff, and strengthened Cursor/Codex loop-prevention hooks.

## Restart
- Handoff prompt: `prompts/history-v35-cursor/00-restart-handoff.md`
- Start a fresh agent session with: "Read and follow prompts/history-v35-cursor/00-restart-handoff.md"
- Current blocker: `packages/history/test/acceptance/history-v35-corpus.acceptance.ts` (Rome `TEXT_ONLY_LONG_WITHOUT_JUSTIFICATION`, invented `Rome -> Europe` route)

## Loop prevention
- `sessionStart`: resets session counters, points agents at restart handoff
- `beforeShellExecution`: blocks ad-hoc `node -e`, chained build+test, filtered builds, repeated identical focused tests (>2)
- `postToolUse`: warns at 12 edits/file, stop message at 20 edits/file
- Shared session state: `scripts/lib/verification-session-state.mjs`
- Fixed hook launchers for Node 24 (`.mjs` without `--input-type=module`)

## Why prior session looped
Hooks existed but the agent ignored rules and used 11 ad-hoc `node -e` scripts plus 73 edits to `visual-planner-v35.ts`. New hooks add hard blocks and churn warnings.

## Validation
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` (exit 1, expected Rome failures)
- Hook smoke tests: ad-hoc node denied, chained build+test denied

## Risks
- Cursor must reload hooks (Settings > Hooks) or restart IDE/CLI agent
- CLI `agent` sessions need project hooks enabled in Cursor settings

## Follow-up
Resume V3.5 from handoff; fix Rome blockers before portfolio regeneration.
