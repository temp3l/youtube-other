# Retain OpenAI debug prompts

## Summary

Future OpenAI debug files now retain full request prompts and other textual fields. Credentials and base64 image payloads remain redacted; historical debug files are unchanged.

## Changed paths

- `packages/shared/src/openai-debug-logger.ts`
- `packages/shared/src/openai-debug-logger.unit.test.ts`
- `docs/reports/codex-runs/2026-08-11-retain-openai-debug-prompts.md`

## Tests/checks

- `pnpm test:focused -- packages/shared/src/openai-debug-logger.unit.test.ts` — passed (6 tests).
- `pnpm exec eslint packages/shared/src/openai-debug-logger.ts packages/shared/src/openai-debug-logger.unit.test.ts` — passed.
- `git diff --check` — passed.

## Commit hash

`c4e786f742a75489bb1a725fa7fc07d50328d167`

## Unresolved risks

The change does not reconstruct prompts in already-written historical debug records.
