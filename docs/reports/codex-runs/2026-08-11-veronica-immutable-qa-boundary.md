# Veronica 01A immutable QA boundary repair

Date: 2026-08-11  
Episode: `01a-revenue-is-not-a-good-business` (`en/short`)  
External calls during this task: OpenAI 0; paid QA 0; TTS/image/thumbnail/render/publication/playlist 0.

## Root cause and semantic comparison

`runExistingVeronicaSourceGroundedPreImageQa` read the admitted plan, ran QA, then spread `sourceGroundedVisualQa` and `hierarchicalReadiness` into that same plan, recomputed `planHash`, and overwrote `source/pre-image-semantic-plan.v1.json`. No planner, finalizer, prompt compiler, or artifact-loader regeneration ran. Therefore `f4960a39…6ca49a4b -> e6ca058e…6a075c75` was QA-orchestration artifact mutation, not serialization nondeterminism.

The old `f496…` bytes are no longer retained, so a byte-level diff cannot be reproduced. The writing expression precisely bounded the semantic comparison: scenes, propositions, treatments, beats, assets, prompts, timing, and planner/configuration fields were preserved; only QA result/readiness metadata and derived `planHash` changed. The retained pre/post paid packs have identical scene/beat semantics.

## Repairs

- QA-only execution no longer writes the semantic plan or invokes regeneration. It writes `shared/source-grounded-visual-qa.v1.json` only.
- `shared/source-grounded-qa-admission.v1.json` binds raw source, WAV, canonical timing, plan file/internal hash, beat plan, provider artifact/projection, compiler, planner/configuration, deterministic gate, and QA revision. The identity is schema-validated and checked before every primary, escalation, advisor, final, and sequence dispatch. Missing/incompatible artifacts and drift raise typed precondition/identity errors.
- QA results record the exact admission identity. Review packs now consume the standalone QA result.
- S01 was a false validator scope: “customer pays” is payment origin, while its structured proposition correctly has `buyerConsequenceFamily: NONE`. Structured propositions now require buyer perspective only for a non-`NONE` consequence; legacy inputs retain lexical fallback. Genuine buyer-consequence coverage remains blocking.
- All 13 new-image beats already had canonical adapter, source-span, parent-scene, and asset mapping. The six `UNAVAILABLE` results were scheduler denials after the Short 4-call/15k-output ceiling was exhausted, not missing ports. Short defaults are now 6 calls/20k output, enough for the observed scene batches, beat batches, one bounded escalation, and sequence call. Partial beat availability remains blocking.
- Sequence composition already existed and remains gated on exact complete scene/beat PASS cardinality. It is now admission-guarded and cannot dispatch on incomplete beats.
- Cache records now require the current full QA revision in addition to content keys. The cache-only audit reused the unchanged prior identity: 16 evaluation hits, 0 provider calls; 8 scenes and 7 beats remain reusable. Six beats and sequence have no reusable judgment. Any material admitted revision change correctly invalidates reuse.

## Changed files

- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
- `packages/strategic-reinvention/src/source-grounded-visual-qa.ts`
- `packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.ts`
- their focused unit tests
- `apps/cli/src/veronica-pre-image-review-pack.ts`
- `apps/cli/src/veronica-source-grounded-visual-qa-composition.ts`
- `apps/cli/src/veronica-media-commands.unit.test.ts`
- `docs/architecture/strategic-reinvention/operator-guide.md`

## Verification

- `pnpm test:focused -- packages/strategic-reinvention/src/veronica-pre-image-semantic-gate.unit.test.ts` — PASS, 55/55 after one fixture correction.
- `pnpm test:focused -- packages/strategic-reinvention/src/positioning-production-adapter.unit.test.ts` — final executed run reached the new admission check but failed because the borrowed legacy episode fixture is not deterministically admissible; that added integration block was removed. The command was not rerun after the repository's three-command/two-repair budget was exhausted.
- `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/strategic-reinvention/src/source-grounded-visual-qa.unit.test.ts apps/cli/src/veronica-source-grounded-visual-qa-composition.unit.test.ts` — progressively exposed three stale cache-count expectations under the stricter revision contract; all three were updated, but the command could not be rerun after the repair budget was exhausted.
- Targeted ESLint for all changed TypeScript files — PASS.
- `pnpm --filter @mediaforge/strategic-reinvention typecheck` — PASS.
- Source-path cache-only 01A audit — PASS as an immutability check: 0 API calls, 0 reserved calls, $0, plan hash unchanged, admission/result identities equal.
- `git diff --check` — PASS.

## Final deterministic identity and state

- source: `4e82a65208256d74b2171c4475ee624d9506cfd6f0b21b1f055074d4062c7503`
- WAV: `2dfc4193f3b325d98bb972d64af168b8dddf9d7f34d267710144965be6190622`
- timing file: `67e2a4539d37d41e6cf574c73e360697cb294d037243bdd1be3daf3c6c7ccbb2`
- semantic plan file: `e6ca058ebb9f7f2da26d1b23e65e4096c310b5de025be0780b94fdbe6a075c75`
- embedded plan: `ea2e79c5662a870de95b9a42b43041d9512d2fccb3653b0de1328df22b5f27c4`
- beat plan: `e410c90290846a4164933aa5de5f6d177162428b1818fd2edd4f72fc8ba97b92`
- provider artifact: `503c3575c22527248ef78e60dc8440c476e19b8181d3491c57cca14a1cc4c078`
- admission: `3bac8b593b335a82890e9ba8f06b2eac5f4aca9b80f0a2bba6595c37954b47ce`
- HEAD: `cf42724e2361e11e39b49f454422a9e76af5f6ee`

The deterministic admission check passes, including S01, 13/13 prompt/beat mapping, and composed sequence capability. A second paid canary must still wait for one clean rerun of the patched focused QA/composition tests. After that, its exact remaining paid gate is six beat judgments followed by sequence QA, then explicit human pre-image review. No images are authorized.
