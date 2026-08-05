# History genre and content-pack run

## Summary

Completed canonical History contracts, presets, evidence/media/workflow schemas, reusable versioned pack import, CLI, API/SDK/persistence/application registration, and ten checksum-bound imports. Revisions now validate provenance, include README idempotency, retain artifact history, invalidate derived tasks, and reset publication gates.

## Changed paths

`packages/history/**`; `packages/{domain,dynamic-genre,application,persistence,api-sdk}/**`; `apps/{cli,api}/**`; `episodes/history-*`; `docs/history/**`; dependency manifests/lockfile.

## Tests/checks

History-focused Vitest: 34 relevant tests passed; persistence: 4 passed; SDK: 8 passed. History typecheck, targeted ESLint, diff check, pack checksum/provenance comparison, and ten-episode gate audit passed.

## Risks and follow-up

Unrelated existing failures remain: workflow Math fixture expects 10 traversals but produces 12; API compatibility lists omit 12 speech routes. Direct TSX CLI launch was blocked by sandbox IPC and approval quota. Model/provider research bindings and map/timeline renderers remain intentionally gated. No provider or publish call ran.

Next: run strict validate, dry-run import, checksum-identical import, then `history workflow status` for the Bronze Age pilot. Commit: none; HEAD `2029f3f`.
