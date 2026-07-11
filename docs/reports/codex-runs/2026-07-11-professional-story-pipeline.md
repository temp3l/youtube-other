# Professional Story Pipeline Hardening

Summary: Reused the current facts, prompt compiler, validators, localization fidelity, workflow quality, cache, production-analysis, Short-parent, and TTS extraction architecture. Added runtime contracts for immutable facts, supernatural mechanics, experiments, 12–16 stable beats, editorial review/thresholds, deterministic metrics, Short selection, repair scopes, stage assertions, and complete cache identities. Professional anti-pattern findings now block generated-story and quality gates. Localization defaults require 85–115% duration and complete beat coverage. `READY_WITH_MINOR_EDITS` blocks unless a profile explicitly opts in. Prompt/cache policy versions now invalidate stale results.

Changed: `packages/story-localization/src/{professional-story-contracts.ts,professional-story-contracts.unit.test.ts,generated-story-validator.ts,story-quality-gate.ts,story-workflow-quality.ts,story-workflow-quality.unit.test.ts,language-profiles.ts,story-localization-cache.ts,story-prompt-module-registry.ts,index.ts}`; `docs/architecture/story-localization.md`; this report.

Checks: focused 67 tests passed; package typecheck passed; targeted Prettier, ESLint, and diff checks passed. Full suite: 1003 passed, 49 failed, 5 todo; integration/E2E did not run because unit failed. Failures are existing dirty-tree fixture/contract/image/render mismatches, not focused regressions.

Commit: `96bc991`.

Risks: provider-backed model staging was not exercised; broad pre-existing failures remain.
