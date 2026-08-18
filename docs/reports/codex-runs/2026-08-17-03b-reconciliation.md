# 03B canonical image reconciliation

Date: 2026-08-17

## Result

BLOCKED before paid generation. The required 11-asset cryptographic inventory
was persisted. It proves 10 manifest/file mismatches, 2 current PASS pixel
sets, 92 historical image requests, and 41 repeated successful prompt
requests. No TTS, image, or QA provider call was made in this continuation.

## Root cause

The Veronica semantic-QA retry loop overwrote the canonical output path but
left the initial generation manifest/provider response in place. Resume reuse
also failed to compare the file SHA with `outputSha256`. Accepted retry pixels
could therefore be overwritten again while stale metadata remained. The fix
persists accepted or rejected retry bytes truthfully, records durable
asset-local accepted bindings, rejects byte mismatches during normal reuse,
and permits only evidence-linked A/B/E reconciliation after exact-current QA.

## Asset inventory

| Asset | Class | Current SHA-256 | Current QA | Disposition |
|---|---:|---|---|---|
| HOOK-B01 | E | `8a91e036fb609bc06a7851bb600aa490978b6de7067b7165336598dd1b3e5f6c` | BLOCK | QA rerun then decide |
| HOOK-B02 | B | `e9212b2fc7c7007bee1a3d08b42b0bbd3e4269932c415922e1fd704d77f6057f` | PASS | QA rebound eligible |
| S01-B01 | D | `b51a06fb07a69416f0a2b3249b7656d57414c9db533508f77ef9df3fd0541f87` | none | regenerate |
| S01-B02 | CURRENT | `190c08df3c0474aa88c88b417d075fa7b806e0f7f2b299e0d84d1dcda803eba3` | PASS | frozen/reuse |
| S02-B01 | E | `6d9c25a6addeab57bfb2e01ea400eee5f94c1dff660b003e4ed06eaacad19af6` | BLOCK | QA rerun then decide |
| S03-B01 | E | `d1bda5ea0bf90c18faf45bde8c5f64ffdb9a29222de71039bc13dd537aad25e6` | BLOCK | QA rerun then decide |
| S03-B02 | E | `16e6da0380dfb874f1da0153a807e541970f6166ea1b852b652df54bd5917473` | BLOCK | QA rerun then decide |
| S04-B01 | E | `a1721b28d7faac8284d17e65cf4bbc047b5b3ed4011b0fef85d4635f18122a31` | BLOCK | QA rerun then decide |
| S04-B02 | E | `46e0c4e00740f671f600c0d990df602e72c2301a0c2f7d7d0c4cbcdc5af4f58a` | BLOCK | QA rerun then decide |
| S05-B01 | E | `ca8298513f69571a5ef8a16364d4454cf900389ff7cc91ec08a24cae9ca4c21d` | BLOCK | QA rerun then decide |
| S06-B01 | E | `8fb71739dfce936936046a1ef5bbdb2ce91ca9c5db550f4545bbcc32e571bf39` | BLOCK | QA rerun then decide |

Classification summary: CURRENT 1, A 0, B 1, C 0, D 1, E 8.
Recovered without generation: 1 current asset; one further asset is eligible
for exact-current QA rebinding. No manifest was repaired yet because sequence
remediation changes must settle first.

## Sequence

Previous REVIEW: adjacent S03 comparison duplication; generic tabletop,
environment, action, and flush-boundary monotony; missing HOOK item continuity;
missing coral-box continuity into S01-B02. Seven judge-targeted beat overrides
were drafted while preserving S01-B02. Deterministic diversity advanced past
the repetition findings, then provider readiness rejected S05/S06 doorway
projections. Those words were removed, but the command reached the repository
two-repair limit before a confirming rerun. No canonical plan was persisted.

## Changed files

- `packages/image-generation/src/episode-image-pipeline.ts`
- `apps/cli/src/veronica-image-reconciliation.ts`
- `apps/cli/src/images-resume-command.ts`
- `apps/cli/src/images-resume-command.unit.test.ts`
- `apps/cli/src/index.ts`
- `episodes/03b-the-promise-formula/source/03b-review-beat-overrides.v1.json`
- `docs/architecture/strategic-reinvention/operator-guide.md`

## Tests and checks

- Focused reconciliation + QA binding: 14/14 PASS.
- Image-generation + CLI typecheck: PASS.
- Image-generation build: PASS.
- CLI build: PASS.
- Broad image-pipeline unit run: stopped by unrelated pre-existing fixture
  failure, `scene.referenceCharacterIds is not iterable`.
- Sequence materialization: BLOCKED as described above.

## Risks and next steps

Run one human-authorized confirming deterministic density pass. If it passes,
rerun source-grounded QA with asset-local cache reuse, persist a new inventory,
QA-rebind eligible unchanged pixels, and generate only C/D or current-QA BLOCK
assets. Rendering, render QA, metadata, publication package, and production
manifest remain incomplete. Nothing was published.

## Continuation outcome

The explicitly authorized confirming density pass succeeded and persisted the
11-beat sequence. The first refreshed source-grounded run reached 7/7 scene,
11/11 beat, and sequence PASS. A byte-preservation audit then found that the
draft had changed S01-B02 from “steps through the gap” to “moves through the
route.” The exact approved action was restored. Its adjacent-beat QA correctly
invalidated, but both primary and escalation judges rejected the existing
S01-B02 causal language as stronger than the narrated conditional question.

A single tightly scoped modality repair retained the exact gate, crossing, and
two-handed pickup action while making the prose explicitly hypothetical. It
passed deterministic density/provider readiness, but refreshed parent-scene QA
BLOCKED S01 with `ACTION_OWNER_INVERSION`, `STATE_ROLE_INVERSION`,
`SEMANTIC_DRIFT`, and `SOURCE_DOMAIN_LOST`: the judge interprets the narration
as an operator-led diagnostic inquiry, while the established visual mechanism
is buyer-led selection and pickup. No further automatic repair was attempted.

Continuation provider usage: 9 source-grounded QA requests, 0 image requests,
0 TTS requests. Incremental known estimated cost: $0.094345. Cumulative known
estimated episode cost: $1.719477 with partial coverage; total remains unknown.
Pixel reconciliation, regeneration, render, and packaging did not run because
pre-image QA is BLOCKED. S01-B02 bytes remain unchanged at
`190c08df3c0474aa88c88b417d075fa7b806e0f7f2b299e0d84d1dcda803eba3`.

## S01 semantic-contract reconciliation

The primary defect was classified **D — incorrect beat segmentation**. Before
the repair, both S01-B01 and S01-B02 referenced only offsets 0–68 (`What
result…care about?`), while B02 depicted offsets 101–152 (`Is there added
value or an obstacle you can remove?`). The runtime contract also exposed one
action owner for a multi-actor causal frame, conflating the operator's gate
removal with the customer's resulting crossing and pickup.

The generalized fix adds exact-substring beat evidence and a typed actor
relation (`causalActionOwnerRole`, `outcomeActorRole`, relationship, and both
actions). Deterministic compatibility now accepts a source-entailed beneficiary
consequence but blocks true owner inversion, missing causal evidence, state-role
conflation, and unrelated actor/domain drift. S01 now binds all three source
questions at parent level, B01 to sentence 1, and B02 to sentence 3. The exact
S01-B02 action and pixel SHA were preserved.

Deterministic materialization passed: semantic density, diversity, provider
readiness, and 11-beat planning all PASS. Focused Vitest passed 80/80; affected
package typecheck and build passed.

Paid cache-aware QA used 2 calls ($0.06712825 estimated): 5 scene cache hits,
S01 primary + escalation, no beat or sequence call. S01 remains BLOCK. Latest
reason: the stills turn open diagnostic evaluation into completed selection and
gate-removal pickup, omit visible time-frame and added-value consideration, and
assert a concrete outcome not stated by the exact span. Original
`SOURCE_DOMAIN_LOST` is resolved, but `ACTION_OWNER_INVERSION`,
`STATE_ROLE_INVERSION`, and `SEMANTIC_DRIFT` remain, with `CAUSAL_INVERSION`,
`ABSTRACT_UNRENDERABLE_STATE`, and `SEVERE_UNDER_COVERAGE`. S02 also invalidated
through its previous-scene prompt dependency and independently BLOCKED; it was
not repaired because this task was scoped to S01.

Changed canonical/code paths in this continuation:

- `packages/strategic-reinvention/src/positioning-visual-contracts.ts`
- `packages/strategic-reinvention/src/positioning-production-adapter.ts`
- `packages/strategic-reinvention/src/veronica-visual-beats.ts`
- `packages/strategic-reinvention/src/veronica-image-prompt-compiler.ts`
- `packages/strategic-reinvention/src/source-grounded-visual-qa.ts`
- `packages/strategic-reinvention/src/veronica-visual-beats.unit.test.ts`
- `episodes/03b-the-promise-formula/source/03b-s01-semantic-contract-overrides.v1.json`
- `episodes/03b-the-promise-formula/source/03b-review-beat-overrides.v1.json`
- derived semantic plan, beat plan, provider prompts, admission, and QA aggregate

No TTS or image request was made. No accepted image was overwritten. Pixel
reconciliation, render, metadata, and packaging remain blocked behind pre-image
admission. Cumulative known estimate is now $1.78660525; total exact episode
cost remains unavailable.
