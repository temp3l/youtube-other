# Test and validation plan

Testing must be deterministic and offline. Run direct affected tests first; no provider calls, asset generation, snapshot update, cache invalidation, or episode mutation is part of this plan.

## Test layers

| Layer | Focus | Examples |
| --- | --- | --- |
| Schema/unit | strict parsing, unions, version dispatch | reject unbound range, overlapping shot, missing map state data, missing ratio variant |
| Property | invariant preservation over generated text/unit sets | coverage, monotonicity, range contiguity, no silent character removal, integer-ms reconciliation |
| Planner fixture | semantic timing/selection outcomes | Napoleon-style campaign, evidence unavailable, paragraph/quote edge cases |
| Prompt contract | optional model output cannot escape policy | schema-valid result still needs deterministic claim/range/rights checks; prompt version changes hash |
| Characterization | preserve unaffected paths | Dark Truth, mathematics, VeronicaBenini/generic image and render inputs are byte/semantic equivalent under default configuration |
| Adapter / cache | mapping and identity correctness | v2 plan → derivative scene/shot equality; stale source/timing/ratio rejection; v1 legacy inspection |
| CLI / approval | operator-visible safety | validate/inspect deterministic JSON; error blocks approval; warning permits appropriately scoped approval |
| FFmpeg contract | renderer receives valid media/timeline fields | source image IDs, ratio, crop/safe-zone metadata, ordered shots and expected duration; fixture render only when existing local fixture allows it |
| Approval golden | readable projection of typed plan | concise summary plus complete unit/diagnostic references, target vs actual mix, no hidden truncation |

## Required invariants and checks

1. Compare the canonical normalized narration hash, characters, word units and unit IDs with the plan. Require exact coverage unless an explicitly typed non-narrated interval exists.
2. Generate targets shorter and longer than speech estimates; assert no text or partial sentence is discarded, and assert a duration conflict/fallback diagnostic instead of clipping.
3. Require final narration unit to end at an approved sentence/paragraph boundary. Verify abbreviations (`Dr.`, `e.g.`), decimals (`3.14`) and dates do not create false boundaries.
4. With measured audio, sum timed units/shots in integer milliseconds and assert planned duration differs from measured duration by the declared tolerance. Without it, require an estimate/fallback code and provisional status.
5. Assert monotonic non-overlapping shot intervals, and that every shot either maps to one or more narration units or declares an allowed non-narrated purpose and duration cap.
6. Assert independent counters: source assets, asset variants, map/diagram states, composition variants and edited shots. Reuse must reference a prior immutable ID, never an index accident.
7. Verify each selection has a semantic reason. A hard map/diagram/evidence requirement cannot be replaced by a media quota repair. Detect deterministic repeating patterns through transition/run-length assertions rather than a single snapshot.
8. Verify a reused map/diagram has state IDs and materially changed state fields when counted as a changed visual. Verify reconstruction constraints and provenance/rights fields according to media discriminant.
9. Require all requested 16:9/9:16 composition variants, their text safe zones and valid crop/recomposition strategy. Dense vertical map labels must receive an explicit layout or a blocking overflow issue.
10. Verify a new plan hash changes for render-relevant narration, unit boundaries/timing, claim links, selection, state, ratio layout, policy/prompt/schema/planner/adapter changes—and does not change for Markdown-only formatting.
11. Ensure a v1 artifact does not parse as v2 or gain a new meaning. Existing approved v1 decisions remain inspectable and do not authorize v2 derivatives.
12. Assert all non-History profile default plans/hashes/commands remain characterized unchanged.

## Explicit adversarial fixtures

| Fixture | Expected result |
| --- | --- |
| narration slightly shorter than target runtime | complete coverage; available slack is an explicit non-narrated hold/credits policy or a warning, never stretched hidden text |
| narration slightly longer than target runtime | `NARRATION_DURATION_CONFLICT` blocks approval until narration/target changes |
| final sentence crossing exact runtime boundary | full final sentence remains one unit; error/diagnostic, no slice |
| abbreviations and decimal numbers near boundaries | deterministic correct segmentation and complete offsets |
| quotation ending at last beat | quotation whole, source linkage required, final boundary valid |
| one extremely long sentence | no truncation; planner may split into timed sub-beats only on allowed clause/alignment boundaries with one source unit link |
| short conclusion | conclusion role/anchor remains visible and has plausible timing |
| missing measured audio | estimate fallback and provisional diagnostic; approval policy tested explicitly |
| measured audio conflicts with metadata target | audio source of truth is reported; approval blocks if policy tolerance is exceeded |
| cached legacy plan | read-only legacy report; v2 cache miss; no automatic rewrite |
| no archival assets available | source gap is recorded; semantic alternative selected or required-evidence error, no fake archival asset |
| vertical map with dense labels | portrait stack/label priority or blocking collision diagnostic |
| disputed claim / uncertain date | uncertainty display and source confidence carried to visual plan; reconstruction cannot state certainty |
| repeated media candidates | anti-repetition scorer makes deterministic documented choice, and quotas cannot force cycle |
| source-pack vs script mismatch | script lineage mismatch blocks new approval and preserves both artifacts |
| stale plan approval / stale derivative | CLI refuses generation/approval and prints expected/current hashes |

## Suggested test ownership and execution order

1. Add History unit tests beside the History planner/schema (`packages/history/src/*unit.test.ts`) for P0 first.
2. Add pure property tests for segmentation/range/timing in the same package; seed randomness and persist failures as small text fixtures.
3. Add History workflow and CLI tests for artifact/approval behavior (`apps/cli/src/history-commands.unit.test.ts` and task registry tests).
4. Only after adapter design approval, add adapter tests and focused shared `visual-planning`, `image-generation`, `rendering` tests. Use their existing fixtures rather than regenerating media.
5. Golden approval fixtures assert selected semantic fields and table values. Snapshots supplement—not replace—semantic assertions.

For each implementation work package, inspect its package scripts/Vitest config, then run `pnpm test:focused -- <affected-test-file>` before a targeted typecheck. Keep verification within repository guardrails: no broad build/test by default, no unchanged failure rerun, and classify fixture updates as intentional contract changes before changing them.

## Validation severity policy to test

Blocking: narration hash/range/boundary failure; invalid timing/overlap; required ratio absent; timing conflict beyond tolerance; source evidence/rights missing when requested; missing reconstruction constraints; stale source/adapter/approval hashes; corrupt map/diagram state.

Warning: estimate fallback (if provisional approvals are allowed), soft media-mix deviation, low confidence, optional evidence unavailable, limited visual diversity, non-critical label density, and cache fallback. Every warning has a typed code, affected IDs and remediation. Approval tests must prove errors cannot be downgraded by a high score or a Markdown renderer.

## Golden approval-pack assertions

The golden pack must show: blocking errors/warnings; source/planned narration unit and character coverage; measured/estimated/planned duration and delta; variable-duration summary; actual/target media mix and repetition diagnostics; map/diagram state/reuse; archival provenance/rights/confidence; 16:9/9:16 coverage; chapter/anchor outline; plan/schema/planner/adapter versions; and deterministic approve/reject commands. It must distinguish an excerpt from the linked complete narration range.
