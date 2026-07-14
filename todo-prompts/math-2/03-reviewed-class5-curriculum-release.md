# M2-003: Establish a reviewed Class 5 curriculum release

Prepare and, only with real editorial evidence, promote the Class 5 curriculum scope
required for private production. This task must never fabricate review, provenance,
prerequisite, state, school-type, or jurisdiction claims.

## Dependency

Run after M2-001. It may proceed in parallel with M2-002. Read the refreshed audit and
current curriculum source before relying on historical A-003 packets.

## Inspect first

- `packages/math-education/data/curriculum/v1/`
- `packages/math-education/src/curriculum/`
- `packages/math-education/src/profile-contracts.ts`
- `docs/mathe/curriculum/grade-05.md`
- `docs/mathe/sources/`
- `docs/mathe/audits/a003-m5-zo-001-review-packet.md`
- current curriculum tests and migration policy

## Required work

1. Verify the 37 Class 5 skill identities, order, wording, grade, variants, source mapping,
   prerequisite edges, and rollout jurisdiction against repository source evidence.
2. Produce a concise review packet containing exact source file hashes/sections, proposed
   release scope, all 37 skill records, DAG edges, disconnected-node decisions, state and
   school-type scope, reviewer fields, and explicit approve/reject instructions.
3. Keep every unsupported state-specific placement claim out of the release.
4. If explicit reviewer approval is absent, stop after the packet, leave tracked release
   data draft, and report `HUMAN_OR_EXTERNAL_BLOCKER`.
5. If exact approval evidence is present, apply it through an append-only release migration.
   Recompute canonical hashes, bind reviewer identity/time/decision, and promote only the
   approved Class 5 scope. Do not rewrite published IDs or silently approve grades 6-10.
6. Ensure production readiness derives from validated evidence and cannot be enabled by a
   caller boolean or test fixture.

Store the new review packet under `docs/mathe/audits/` using a descriptive Class 5 name.
Do not replace historical evidence.

## Adversarial coverage

Test altered source hashes, missing sections, duplicate or unknown skills, reordered
skills, dangling/self/duplicate/cyclic edges, unapproved future-grade prerequisites,
forged reviewer data, partial provenance, invalid state claims, mutable published IDs,
and a reviewed profile bound to a different release hash.

## Verification

Run the current curriculum release test first and the prerequisite DAG test second. Use
one narrow CLI validation only if needed. No broad tests, providers, rendering, or writes
outside approved curriculum migration and documentation.

## Acceptance

- Without human approval: a complete review packet exists and production remains blocked.
- With human approval: all 37 Class 5 skills have exact provenance and reviewed DAG/scope
  evidence, and the release/profile readiness gates accept only that hash-bound scope.
- Grades 6-10 and unsupported state claims remain explicitly unapproved.
- The Codex-run report states whether this task is accepted or blocked and names the exact
  missing evidence. Do not commit unless requested.
