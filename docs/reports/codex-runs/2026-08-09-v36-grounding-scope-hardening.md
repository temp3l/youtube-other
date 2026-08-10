# V3.6 grounding scope hardening

Changed files: `packages/history/src/v36/atomic-claim-grounder-v36.ts`, `packages/history/src/v36/atomic-claim-grounding-v36.unit.test.ts`.

The atomic grounder now evaluates modality against the emitted leading clause and excludes comparative subordinate `suggests` text. It retains uncertainty, intent, and attempt statuses. Unresolved-participant diagnostics now require an existing claim binding or proper-name-shaped candidate, preserving Pevensey while filtering arbitrary lower-case clause fragments.

Checks: focused atomic grounding tests (15/15), focused V3.6 relation/schema/representative tests (80/80), History typecheck, and targeted ESLint all passed.

Risk/follow-up: this deliberately bounded lexical scope rule is frozen for the all-40 census; corpus findings are measurement-only.
