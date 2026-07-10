Summary: Followed up Task 09 verification. Fixed final-media validation so narration-shortened scene renders are not rejected for clip-continuity drift, normalized blocked-vs-failed handling for spoken narration validation artifacts, and updated focused tests/fixtures to match the current contracts.

Changed paths: `packages/rendering/src/index.ts`, `packages/rendering/src/index.unit.test.ts`, `packages/speech/src/narration-pipeline.ts`, `packages/speech/src/narration-pipeline.unit.test.ts`

Tests: `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/speech/src/narration-pipeline.unit.test.ts` PASS; `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 packages/rendering/src/index.unit.test.ts -t "uses an explicit output basename for final renders"` PASS; earlier focused reruns of `packages/rendering/src/index.unit.test.ts` exposed and guided the follow-up fixes; `git diff --check -- packages/rendering/src/index.ts packages/rendering/src/index.unit.test.ts packages/speech/src/narration-pipeline.ts packages/speech/src/narration-pipeline.unit.test.ts` PASS

Commit hash: `9e3ba73`

Unresolved risks: I did not re-run the full `packages/rendering/src/index.unit.test.ts` file after the final explicit-basename fixture correction, only the exact previously failing test. The broader rendering file had passed the earlier scene-duration regression and then exposed this fixture issue.
