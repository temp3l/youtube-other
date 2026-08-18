# Veronica EN semantic-admission repair

Summary: added source-grounded promise, follow-up, and channel mechanisms to clear deterministic semantic admission for EN Shorts 03B, 08B, and 02B. A later scene-alignment experiment was reverted at user request; artifacts now use the prior planner behavior. No source, audio, or provider content changed.

Changed paths: `packages/strategic-reinvention/src/positioning-visual-contracts.ts`; `veronica-semantic-quality.ts`; `veronica-pre-image-semantic-gate.unit.test.ts`; `veronica-visual-plan-resolver.unit.test.ts`; regenerated pre-image plans and prompt artifacts for 03B, 08B, and 02B.

Checks: focused Vitest PASS (75/75); strategic-reinvention and CLI builds PASS; `git diff --check` PASS. Provider-free `prepare-production` replays PASS: 03B (7 scenes/8 beats), 08B (7/12), 02B (8/8). Each has provider readiness PASS, semantic quality PASS, and validation pass. QA was cache-only with 0 API calls and 0 calls reserved.

Commit: `492543b` (worktree uncommitted).

Unresolved risk: source-grounded QA transport is unconfigured; human review and explicit approval remain required before paid QA or image generation.
