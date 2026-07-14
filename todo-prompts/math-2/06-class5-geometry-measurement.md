# M2-006: Implement Class 5 geometry and measurement lessons

Implement production-capable German `standard` specifications for `M5-GM-001` through
`M5-GM-005` and `M5-RF-001` through `M5-RF-006`.

## Dependencies

M2-001 must be accepted. Use the stable reviewed M2-003 scope and the shared lesson
content/review contract established for the other Class 5 slices. Content work may proceed
in parallel with M2-002, but canonical integration and final acceptance require M2-002.

## Inspect first

- curriculum records, prerequisites, and source evidence for the 11 target skills
- verifier v3 unit, geometry, and exact arithmetic checks
- math visual ASTs and SVG/educational-renderer components
- profile accessibility, semantic-color, typography, and safe-area policies
- current `M5-GM-002` fixture and all geometry/render tests

## Required behavior

- Cover unit conversion for length, mass, time, and money; rectangle/square perimeter and
  area; point/segment/line/parallel/perpendicular; angle types and measurement; triangle
  and quadrilateral classification; axial symmetry; cube/cuboid nets; unit-cube volume;
  and cuboid volume.
- Use exact unit dimensions and scale factors. Reject cross-dimension conversion and any
  unit inference not declared by the lesson contract.
- Verify formulas, substitutions, dimensions, classifications, angle bounds, symmetry
  mappings, net validity, and volume independently through verifier v3 or a new strict
  deterministic checker owned by the verifier boundary.
- Geometry diagrams must encode semantic coordinates and relations, not merely labels.
  Essential meaning cannot rely on color alone.
- Mark non-scale drawings explicitly. Reject visuals whose measured geometry contradicts
  a claim unless the visual contract declares and visibly labels the abstraction.
- Bind every measurement, formula, relation, and answer to a verified fact ID and exact
  source lineage.
- Use deterministic German terminology and spoken units, including singular/plural and
  squared/cubed units.
- Keep unreviewed skills and variants blocked.

Create a review packet with diagrams or structured visual descriptions, exact facts,
worked solutions, misconception coverage, source references, and hashes. Do not infer
editorial approval from passing tests.

## Adversarial coverage

Test mixed dimensions, wrong conversion scale, perimeter/area confusion, square/cubed unit
loss, impossible angle values, false parallel/perpendicular claims, ambiguous polygon
classification, broken symmetry pairs, invalid or duplicate cube-net faces, overlapping
net faces, wrong unit-cube counts, not-to-scale deception, fact transplant, and stale
renderer/verifier versions.

## Verification and acceptance

Run one focused lesson/verifier file and one focused rendering or component file, followed
by at most one affected-package typecheck. All 11 specifications must have exact verified
facts, deterministic accessible visuals, German narration contracts, and review-bound
capability status. Create the required Codex-run report. Do not invoke paid providers.
