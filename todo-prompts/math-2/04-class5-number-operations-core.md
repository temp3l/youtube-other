# M2-004: Implement Class 5 number and operations core lessons

Implement production-capable German `standard` lesson specifications for
`M5-ZO-001` through `M5-ZO-016`. Replace narrow fixture-only behavior with a strict,
versioned, reviewable content contract. Do not mark content reviewed without evidence.

## Dependencies

M2-001 must be accepted. M2-003 must define a stable exact reviewed rollout scope and
shared content/review contract. Content implementation may proceed in parallel with
M2-002, but canonical workflow integration and final capability acceptance require M2-002.

## Inspect first

- current Class 5 curriculum records and prerequisite DAG
- `packages/math-education/src/lesson/`
- `packages/math-education/src/domain/`
- verifier v3 schemas, adapter, and Python checks
- localization, fact-lock, profile, workflow, and visual-component contracts
- current approved lesson fixtures and tests

## Required behavior

- Add strict, versioned specifications for all 16 skills covering objective,
  prerequisites, prior knowledge, misconceptions, examples, worked steps, transfer task,
  formative checks, answer key, scene purposes, expected duration, and source identity.
- Use data-driven loading and schema validation. Do not add another 16-branch skill switch
  or treat test fixtures as production authority.
- Represent every value and expression with exact typed ASTs. No JavaScript floating-point
  result may become mathematical evidence.
- Independently verify place value, comparison, rounding, estimation, four operations,
  order of operations, arithmetic laws, text-to-expression mapping, substitution,
  divisibility, and powers through verifier v3.
- Verification must derive truth from the expression/check contract, not compare against a
  caller-supplied expected value tautologically.
- Bind all visible numbers, formulas, worked steps, answers, and visual claims to verified
  fact IDs and artifact lineage.
- Produce German narration and labels through the existing fact-lock/localization boundary.
- Keep duration within the approved lesson profile and make each scene teachable from its
  prerequisites.
- Reject unsupported or unreviewed specifications before provider, rendering, metadata,
  or publish tasks run.
- Preserve current three-variant contracts. Only `standard` must become production-ready
  for this milestone; unimplemented foundation/challenge content must stay explicitly
  unsupported rather than aliasing standard.

Create a domain review packet listing each skill, objective, examples, checks, solutions,
misconceptions, prerequisite links, sources, and content hash. Enable a production
capability only when exact review evidence exists.

## Adversarial coverage

Test carry/borrow mistakes, division remainder errors, ambiguous text expressions, wrong
operator precedence, invalid rounding place, false divisibility, `0^0`, negative or
out-of-scope inputs, answer-key transplant, reordered steps, forged hashes, duplicate fact
IDs, stale curriculum identity, and an unreviewed capability request.

## Verification and acceptance

Run the lesson specification test first, then one focused verifier test, then at most one
package typecheck. Acceptance requires all 16 standard specifications to parse, verify,
localize to German without semantic drift, produce deterministic fingerprints, and fail
closed when review or verifier evidence is missing. Create the required Codex-run report.
Do not call providers or render production media in this task.
