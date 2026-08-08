# V3.6 explanatory relation IR

## Summary

Added an isolated, fail-closed V3.6 explanatory-relation IR with deterministic IDs, typed validation diagnostics, a 38-fixture semantic corpus, shadow diff envelope, architecture docs, and review-artifact generator. V3.5 production modules were not changed.

## Changed paths

- `packages/history/src/v36/*`, `packages/history/src/index.ts`
- `docs/history/v3.6/*`
- `scripts/generate-history-v36-relation-ir-review.mjs`

## Tests/checks

- V3.6 focused Vitest: 43/43 pass
- `@mediaforge/history` typecheck: pass
- Targeted ESLint: pass
- Review ZIP integrity: pass

## Commit hash

`10a7ccb0dcc0ecada4e2c7b17fff263904f5f93e`

## Unresolved risks

No production extraction or compiler exists; the next task is shadow candidate extraction against this corpus.
