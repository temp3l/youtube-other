# Speech API contract run

## Changed files

- `apps/api/src/speech-contract.ts`
- `apps/api/src/http-server.ts`
- `apps/api/src/contract.ts`
- `apps/api/src/index.ts`
- `apps/api/src/speech-contract.unit.test.ts`

## Checks run

- `pnpm --filter @mediaforge/api typecheck` — passed.
- `pnpm exec vitest run -c vitest.unit.config.ts apps/api/src/speech-contract.unit.test.ts --bail=1` — passed (2 tests).

## Risks and follow-up

The existing SDK/OpenAPI compatibility test needs corresponding generated SDK operations before it can accept the new OpenAPI operations. Production composition must inject `SpeechApiUseCases`; otherwise endpoints deliberately return a clear 503.
