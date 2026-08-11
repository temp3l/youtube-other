# OpenAI Prompt Cache Phase 2A

Date: 2026-08-11

## Changed files

- Shared prompt-cache capability/projection and routing economics contracts/tests.
- Story Batch provider projection, cache-write usage import, and focused test.
- History V3.3 canonical cache planning and focused assertion.
- OpenAI cache characterization, remediation plan, and implementation report.
- Story client mock boundary corrected for Phase 0/1 `maxRetries` options.

## Tests/checks run and results

- Story package typecheck: failed on mock signatures, fixed, then passed.
- Exact short safety test: passed; full-story tests blocked by stale Story IR fixtures.
- Shared build: initially exposed a missing `24h` TTL union member, fixed, passed.
  History and Story builds: passed.
- Cache/identity suite: 20 passed. Combined run then stopped on missing History
  episode fixture before the Story Batch test file executed.
- Compiled Story Batch projection smoke check: passed.
- `git diff --check`: passed. No paid OpenAI calls were made.

## Risks and follow-up

Provider behavior still needs a human-approved two-call live experiment. Repair
the unrelated Story IR and History fixtures, then execute the Story Batch test.
Do not add distributed claims until topology evidence justifies them.
