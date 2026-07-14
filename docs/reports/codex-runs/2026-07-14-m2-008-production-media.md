# M2-008 production media path

## Summary

Hardened educational speech cache/provider identity, deterministic root speech,
private static-board rendering evidence, readable caption overlays, output-path
safety, placeholder public-release blocking, and exact chalk timing. The
historical chalk failure reproduced and was repaired with `svg-chalk.v3`.

## Changed files

- `packages/speech/src/{index,educational-speech-*}.ts` and focused test
- `packages/math-rendering/src/{provider-free-media,composition/*,thumbnail/*}.ts` and test
- `packages/math-education/src/{publishing,orchestration}/*`
- `packages/educational-renderer/src/renderers/chalk-animation.ts`
- `docs/architecture/educational-speech-pipeline.md`

## Tests/checks

- Focused speech: 10/10 passed.
- Focused chalk: initially failed 1534/1500 ms; after fix, 3/3 passed.
- Affected-package typecheck: initially found thumbnail union defect; after fix, all four packages passed.

## Risks / follow-up

M2-003 and M2-004–007 remain externally unaccepted and production-gated, so
representative reviewed slice traversal and M2-008 production acceptance cannot
truthfully pass. No paid call, upload, public publish, or broad render ran.

Commit hash: not committed (`7d8c03f`).
