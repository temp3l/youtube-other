# M2-003 Class 5 curriculum review

## Summary

`HUMAN_OR_EXTERNAL_BLOCKER`. Added the exact hash-bound 37-skill review
packet; no curriculum data was promoted. The tracked release remains draft and
production-blocked. This task was based on
`todo-prompts/math-2/03-reviewed-class5-curriculum-release.md`, not
`docs/plans/*`.

## Changed paths

- `docs/mathe/audits/class-5-curriculum-release-review-packet.md`
- `docs/reports/codex-runs/2026-07-14-m2-003-class5-curriculum-review.md`

## Tests

- `pnpm test:focused -- packages/math-education/src/curriculum/curriculum-release.unit.test.ts` — 8/8 passed.
- `pnpm test:focused -- packages/math-education/src/curriculum/prerequisite-dag.unit.test.ts` — 5/5 passed.
- Read-only cross-file check — 37/37 seed, normalized table, and skills records matched.

## Commit hash

Current HEAD: `7d8c03f`; M2-003 changes are uncommitted.

## Unresolved risks / follow-up

Missing: 37 exact official artifact hashes/sections and mapping decisions; named
reviewer authority, timestamp, exact-target decision and annex hashes; approval
of eight edges and decisions for 24 disconnected nodes; explicit no-claim or
evidenced state/school-type scope. After real approval, add an append-only,
scope-aware release migration and rerun adversarial promotion gates.
