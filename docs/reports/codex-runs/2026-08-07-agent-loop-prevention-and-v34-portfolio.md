# Agent loop prevention and History V3.4 portfolio completion

## Summary
Wired missing verification hooks, added anti-loop guardrails, confirmed all History V3.4 acceptance tests pass, and regenerated the four-episode combined approval pack with plan-hash determinism.

## Loop prevention
- Created `.codex/hooks.json` (was documented but missing) and enabled `codex_hooks` in `.codex/config.toml`
- Created `.cursor/hooks.json` + `.cursor/hooks/verification-guard.sh` for Cursor agents
- Extracted shared policy in `scripts/lib/verification-command-policy.mjs`
- Blocks: chained `pnpm test:focused`, ad-hoc `node --input-type=module -e`, broad test/build/typecheck
- Updated `.cursor/rules/history-v34-focused.mdc` and phase-00 prompt with stop rules

## Test results (all exit 0)
- `fall-of-rome-v34.acceptance.ts`, `napoleon-v34.acceptance.ts`, `black-death-v34.acceptance.ts`, `franklin-v34.acceptance.ts`, `history-v34-portfolio.acceptance.ts`
- `history-v34.unit.test.ts`, `history-v34-semantics.unit.test.ts`

## Portfolio regeneration
- Output: `artifacts/chatgpt-review/history-approval-packs-v3.4-final/`
- ZIP: `artifacts/chatgpt-review/history-approval-packs-v3.4-final.zip`
- Plan-hash determinism: pass (two consecutive runs)
- ZIP byte determinism: varies by wall-clock timestamps (documented v3.4 policy)

## Risks
- Cursor hooks require IDE reload to activate
- Codex hooks require `codex_hooks = true` (added)

## Follow-up
- Phase 04 publishing readiness when authorized
