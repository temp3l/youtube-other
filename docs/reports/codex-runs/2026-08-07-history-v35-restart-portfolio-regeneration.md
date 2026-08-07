# History V3.5 restart portfolio regeneration

## Summary
Resumed from `00-restart-handoff.md`: corpus acceptance green, Franklin narration corrected, four-episode v3.5 portfolio regenerated with deterministic plan hashes and combined comparative metrics.

## Changed files
- `episodes/.../05-franklin-expedition/languages/script-en.md`
- `packages/history/test/acceptance/history-v35-corpus.acceptance.ts`
- `packages/history/src/history-v35-franklin-geo.unit.test.ts`
- `packages/history/src/history-v35.unit.test.ts`
- `prompts/history-v35-cursor/00-restart-handoff.md`
- Regenerated episode `source/history-v3.5/*` for all four portfolio episodes
- `artifacts/chatgpt-review/history-approval-packs-v3.5/**`

## Tests
- `pnpm test:focused -- packages/history/test/acceptance/history-v35-corpus.acceptance.ts` — pass
- `pnpm test:focused -- packages/history/src/history-v35.unit.test.ts` — pass
- `pnpm exec tsx scripts/history-v35-regenerate-combined.mjs` — pass, `planHashDeterministic: true`

## Regeneration hashes
- Combined ZIP SHA-256: `4e0c96e41c7b2d0c6b06b10cabf29412e28c02c0669bd33326111a45782bcf98`
- Napoleon planHash: `7b78341d0267498a4d600fed5bc4da2ac6adb4f4f52245c3f2c77c236799629f`
- Rome planHash: `83d039989df5d980616c43d05e1574c9aeb1cc01f4b485296db310c7d8c3861d`
- Black Death planHash: `ea2462d50356609e8905fb2d5da3fa784fafb2d2a8247514416362d91a874472`
- Franklin planHash: `4125cbb8ff6aa661d5325dd42855d9c51491a60a2a80acd10c0ab8ab6607e26d`

## Remaining blockers
- Napoleon: `EDITORIAL_REPETITION_THRESHOLD`
- All four: `TIMING_MEASUREMENT_REQUIRED`, `HISTORICAL_APPROVAL_UNATTESTED`

## Risks
- Napoleon editorial repetition may need planner/treatment refinement before content approval.
