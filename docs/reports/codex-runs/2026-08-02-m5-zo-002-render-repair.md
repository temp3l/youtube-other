# M5-ZO-002 render repair

Summary: Fixed the 328-frame static interval by making the semantic chalk scheduler consistently enforce the 225-frame render-guard ceiling while retaining the preferred 180-frame cadence when feasible. Added an exact verifier-bound fact-stack fallback when number-line or place-value plans receive relation expressions they cannot render. Paid narration was not regenerated; `math.tts` remains succeeded and `narration.wav` remains SHA-256 `1421c87cf704de822d233f42355626094d8e20ee500ac4db20722878c4109aae`.

Changed files: `packages/math-rendering/src/composition/semantic-chalk.ts`; its unit test; `apps/cli/src/math-workflow-runtime.ts`; `apps/cli/src/math-workflow-visual-selection.unit.test.ts`; this report.

Tests/checks: focused chalk tests passed (6); focused visual-selection tests passed (2); `git diff --check` passed; math-rendering build passed. CLI build is blocked by unrelated existing `approval-commands.ts` TS2322 errors.

Result: The first retry cleared scene-002 and exposed the relation mismatch; the corrected retry could not run because approval for writing the external episode workspace was rejected when the approval service ran out of credits. `math.render` remains failed; downstream tasks remain pending; no final MP4 exists.

Risk/follow-up: grant write approval, rebuild/run from source, resume `math.render`, then verify media metadata and final workflow status.

Commit: `2029f3f` (working tree changes uncommitted).
