# M2-010 validated cache-reuse preflight

Summary: The canonical Class 5 batch now accepts existing lesson roots only when their full workflow state parses and matches the expected math unit, profile, locale, and variant. Symlinks, path escapes, missing state, malformed state, and identity mismatches fail closed. Source task: `todo-prompts/math-2/10-class5-private-batch.md`.

Changed paths: `apps/cli/src/math-commands.ts`, `apps/cli/src/math-commands.unit.test.ts`, and this report.

Tests/checks: the two cache-reuse tests passed; CLI typecheck/build passed. The full CLI file passed 13 tests before its known unrelated publish-fixture curriculum-identity mismatch. Packaged preflight passed with 37 items, three reusable units, 23 speech hits, 250 misses, zero writes/calls/mutations, USD 0.334482 prior cost, and USD 7.633634 estimated new cost. All three narration hashes and 25 historical success-call logs remained unchanged.

Risks/follow-up: M2-010 execution remains unstarted. The remaining 34 lessons require fresh explicit approval before up to 250 paid calls: USD 0.226 per lesson and USD 7.969 cumulative total. No publication is authorized.
