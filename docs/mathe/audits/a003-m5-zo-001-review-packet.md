# A-003 Review Packet: M5-ZO-001 Standard DE

Status: `pending-human-review`

This packet prepares the minimum evidence needed to unblock A-003 for the
provider-free pilot slice. It does not promote curriculum status by itself.

## Proposed Rollout Slice

- Skill: `M5-ZO-001`
- Variant: `standard`
- Locale: `de`
- Grade: 5
- Domain: `Zahl und Operation`
- Topic: `Natürliche Zahlen`
- Learning objective: `Natürliche Zahlen im Stellenwertsystem lesen und schreiben`
- Process competency: `REP`
- Duration target: 240 seconds

## Current Repository Evidence

- `packages/math-education/data/curriculum/v1/skills.json`
  - Current status: `draft`
  - Current mapping review status: `pending`
  - Local file SHA-256:
    `27a74c4e6e48f863e9f8665442a05b17b7972eea08440b3f6bda4e58f0199e69`
- `docs/mathe/curriculum/grade-05.md`
  - Lists `M5-ZO-001` as the first Grade 5 skill with `high` placement.
  - Local file SHA-256:
    `3e326efdfd90a04c817ef502525b60268966d4e8364d4ab8f467f31b12bb6c8d`
- `docs/mathe/curriculum/03-machine-readable-seed.md`
  - Lists `M5-ZO-001` as `normalized-editorial-draft`.
  - Local file SHA-256:
    `1acbc995a7fed583139d606a8cc31d5d1b713364ce566a0bf8f3343b0ded3720`
- `packages/math-education/data/curriculum/v1/source-registry.json`
  - Maps the synthesized slice to `kmk-2022-math`.
  - Local file SHA-256:
    `6e47f1dbf409433dbc4f08a4d0d9708f37c252d774b6415d89ec0dafa01f58df`

## Official Source Mapping To Review

- Source ID: `kmk-2022-math`
- Title: `Bildungsstandards Mathematik ESA/MSA`
- Document version: `2022-06-23`
- URL:
  `https://www.kmk.org/fileadmin/Dateien/veroeffentlichungen_beschluesse/2022/2022_06_23-Bista-ESA-MSA-Mathe.pdf`
- Current repository section: `normalized synthesis`
- Current coverage: `synthesized`

Required before promotion:

- Official source artifact hash or archived artifact identifier.
- Exact section/page reference supporting the learning objective.
- Reviewer confirmation that this skill is an acceptable narrow rollout mapping.
- Confirmation that this does not imply state-specific legal placement.

## Prerequisite Decision

Current `M5-ZO-001` prerequisite IDs: none.

Required reviewer decision:

- Approve `M5-ZO-001` as a rollout root skill with no prerequisite edge inside the
  selected pilot slice, or provide the missing prerequisite edge(s).
- Confirm disconnected/non-reviewed global graph nodes remain out of rollout scope.

## State-Scope Decision

Current state overrides are explicitly incomplete.

Required reviewer decision:

- Choose `state placement out of rollout scope` for this pilot slice, or provide a
  reviewed state override record with source mapping and provenance.

## Human Sign-Off Fields

These fields must be completed by the human reviewer before A-003 can be accepted.

- Reviewer name:
- Reviewer role/authority:
- Review date:
- Official source artifact hash:
- Official source section/page:
- Source mapping decision: `approve` / `reject`
- Prerequisite decision: `approve as root` / `requires edges`
- State-scope decision: `out of rollout scope` / `reviewed override attached`
- Notes:

## Implementation After Sign-Off

After sign-off, update only the minimum curriculum data and tests needed to mark the
selected slice reviewed while keeping all unrelated skills draft/pending. Recompute
release input hashes through the existing curriculum loader/tests; do not hand-edit
hashes without validation.
