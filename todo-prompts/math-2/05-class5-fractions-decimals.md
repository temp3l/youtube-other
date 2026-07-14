# M2-005: Implement Class 5 fractions and decimals lessons

Implement production-capable German `standard` lesson specifications for
`M5-ZO-017` through `M5-ZO-024`, using exact rational and decimal semantics throughout.

## Dependencies

M2-001 must be accepted. Use only the stable M2-003 reviewed rollout scope. Content work
may proceed in parallel with M2-002, but canonical integration and final acceptance require
M2-002. Reuse the versioned lesson content contract established by M2-004; if M2-004 is
running in parallel, agree on that shared contract before either task edits it.

## Inspect first

- current skill records and reviewed prerequisite edges
- exact-value, expression, unit, fact-lock, localization, and visual schemas
- verifier v3 rational/decimal checks
- number-line, formula, table, and educational visual components
- current lesson/content loaders and review evidence format

## Required behavior

- Add strict specifications for fraction-as-part, numerator/denominator notation,
  fractions on number lines, equivalent fractions, expansion, reduction, decimal place
  value, and decimal comparison/order.
- Keep rational values exact as numerator/denominator ASTs and decimal values exact as
  unscaled integer plus scale. Do not convert mathematical evidence through binary floats.
- Normalize signs and rational forms consistently while preserving the pedagogical form
  shown to the learner when that form is intentional.
- Verify equivalence, expansion/reduction factors, number-line position, place value, and
  ordering independently. Reject zero denominators and unsupported recurring decimals.
- Bind diagrams and displayed forms to verified facts. Number-line bounds, tick spacing,
  labels, shaded parts, and comparison signs must be semantically checked.
- Generate deterministic German display and spoken forms. Decimal separators, fraction
  speech, signs, and grouping must not depend on provider punctuation interpretation.
- Include misconceptions such as comparing denominators directly, treating a fraction bar
  as decoration, dropping decimal zeros incorrectly, and comparing decimal digit counts.
- Keep unreviewed variants and skills blocked. Do not duplicate standard content into
  foundation or challenge as a shortcut.

Create or extend the domain review packet with exact examples, solutions, visual claims,
source references, prerequisite links, and content hashes. Capability activation requires
matching review evidence.

## Adversarial coverage

Test zero/negative denominators, non-equivalent expansion, over-reduction, mismatched
shading, off-grid number-line points, `0.5` versus `0.50`, locale separator confusion,
large scale values, answer/fact transplant, changed visual AST under the same ID, stale
release hashes, and unsupported recurring values.

## Verification and acceptance

Run the directly affected lesson test, one verifier test, and at most one package
typecheck. All eight standard lessons must parse, verify exactly, localize without semantic
drift, generate deterministic visual contracts, and reject missing review evidence. Create
the required Codex-run report. Do not call providers or render production media.
