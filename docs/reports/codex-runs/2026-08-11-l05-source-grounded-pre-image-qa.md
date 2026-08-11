# L05 source-grounded pre-image QA

Date: 2026-08-11

Summary: Added a QA-only Veronica CLI stage and ran the live, bounded L05 source-grounded gate. All six scene judgements and the sequence judgement passed; no semantic plan, treatment, prompt, narration, image, render, or publish stage ran.

Changed paths: `apps/cli/src/veronica-media-commands.ts`, `apps/cli/src/veronica-media-commands.unit.test.ts`, `packages/strategic-reinvention/src/positioning-production-adapter.ts`; QA evidence in `episodes/l05-s01-you-dont-need-a-publisher/shared/source-grounded-visual-qa.v1.json` and readiness evidence in the source plan/review artifact.

Checks: focused `veronica-media-commands.unit.test.ts` passed; affected package/CLI TypeScript builds passed. Live QA: 1 batched scene request + 1 sequence request, `gpt-5.4-mini`/low, 9,206 input and 1,608 output tokens, estimated $0.03358875, no escalation.

Commit: `dc06033`.

Risk/follow-up: `manifest.json` retains pre-remediation plan/prompt hashes and timing metadata; it should be reconciled in the normal production-manifest update before downstream rendering/publishing, but it did not affect source-QA evidence or canonical image inputs.
