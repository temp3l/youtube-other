# Review — History Approval Packs V3.1

## Verdict

**REJECT for production approval.**

The bundle is structurally valid and materially improved as a review artifact, but it is not production-approval ready. All three episodes correctly declare `approvalEligible: false`. The primary acceptance blocker remains unresolved, and additional semantic/provenance defects would make a simple duration-only approval unsafe.

## Acceptance summary

| Area | Result | Notes |
|---|---|---|
| ZIP/file integrity | PASS | Archive extracted cleanly; all internal SHA-256 checks passed. |
| JSON/schema/reference integrity | PASS | 52 JSON files parse; no dangling IDs; narration units have complete beat/shot coverage; shot timelines are contiguous. |
| Redaction/binary safety | PASS | No media binaries, secret-like values, local absolute paths, or symlinks found. |
| Focused implementation checks | PASS/PARTIAL | Build, typecheck, focused ESLint, and 24 focused tests are reported as passing. |
| Repository regression baseline | FAIL/UNVERIFIED | One Math Education characterization test is failing and the full suite was not run. Calling the failure “unrelated” is not independently demonstrated in this bundle. |
| Timing truthfulness | FAIL | All plans use provisional estimated timing; two estimates are severely inflated by sentence segmentation. |
| Historical provenance | FAIL | 408/408 claims have no claim-level source link and remain `unresolved`. |
| Map/diagram semantics | FAIL | Several generated relationships are generic, contradictory, or weakly grounded. |
| Editorial specificity | FAIL | Visual purposes and shot direction remain heavily templated. |
| Production approval | FAIL | Do not approve or generate final media from these packs. |

## P0 blockers

### 1. The narration-duration conflict is still unresolved

| Episode | Words | Target | Planner | Effective planner pace | Word-count estimate at 108 WPM |
|---|---:|---:|---:|---:|---:|
| Napoleon | 1,076 | 10:00 | 13:03 | 82.4 WPM | 9:58 |
| Fall of Rome | 1,149 | 10:00 | 17:12 | 66.8 WPM | 10:38 |
| Black Death | 1,099 | 10:00 | 10:19 | 106.6 WPM | 10:11 |

The estimator is not consistently applying the configured `narrationWordsPerMinute: 108`. The likely cause is a per-sentence minimum duration or pause cost accumulating across short sentences. Fall of Rome has 179 narration units and receives an implausible additional duration of roughly 6½ minutes.

Required correction:

- Derive provisional narration timing from total spoken tokens/words plus bounded punctuation and chapter pauses, not an additive minimum for every sentence.
- Keep measured immutable TTS/audio duration as the production source of truth.
- Use a configurable target tolerance for estimated timing; a small provisional difference such as Black Death’s 18.9 seconds should normally be a warning rather than an unconditional blocker.
- Regenerate all three plans and review bundles after changing the estimator.

### 2. Claim provenance is not approval-safe

The packs declare eight candidate source references in total, but every extracted claim has:

- `sourceReferenceIds: []`
- `sourceStatus: "unresolved"`

That is **408 unresolved claims out of 408**. `CLAIM_PROVENANCE_UNRESOLVED` is only a warning. Based on the current severity model, resolving the duration error alone appears capable of making a pack approval-eligible while all historical claims remain unverified.

Required correction:

- Link each material factual, chronological, quantitative, causal, disputed, geographic, map-driving, and diagram-driving claim to one or more source IDs.
- Preserve source locator metadata suitable for audit: URL/identifier, title, publisher, access/publication date where relevant, and page/section/fragment when available.
- Make unresolved material claims approval-blocking, or require an explicit recorded human override with reviewer identity, timestamp, reason, and plan/narration hashes.
- Distinguish “declared candidate sources exist” from “research provenance is attached to this claim.”

### 3. Diagram semantics contain false or generic relationships

Examples found in the generated data:

- **Napoleon:** a generic `Revenue and obligations → Institutional capacity → Political authority` diagram is attached to claims about political pressure, Moscow, Kutuzov, and lost credibility. The linked claims do not establish the stated revenue relationship.
- **Fall of Rome:** the disease/demographic/labour diagram associates Julius Nepos, 480, Dalmatia, Constantinople, and Rome with a claim about disease and climatic pressure. The bundle itself emits `DIAGRAM_ENTITY_CONTEXT_UNRESOLVED`.
- **Black Death:** a fiscal-political diagram is derived from antisemitic persecution/institutional failure and broad post-plague renegotiation, but labels the nodes as revenue, institutional capacity, and political authority.
- Node `entityIds` are copied broadly across every node rather than attached to the specific node they support. This creates misleading semantic authority.

Required correction:

- Only instantiate a domain diagram when the linked narration explicitly supports every node and edge.
- Bind entities and claims per node/edge, not at diagram-wide union scope.
- Reject a diagram when a generic domain template is a weak fit; fall back to archival art, quotation, map, timeline, or no diagram.
- Add semantic tests ensuring every edge can cite at least one claim that expresses or strongly entails that relationship.

### 4. Map semantics need targeted correction

Concrete defect:

- Black Death `map-state-2` represents merchant ships linking Black Sea ports to Constantinople but labels the route **“Overland trade connection.”** This contradicts the linked claim and route type `maritime-trade`.

Additional weaknesses:

- Some inferred endpoints are overly broad (`Niemen River → Russian Empire`, `Black Sea → Europe`) and may not be useful production geography.
- Several states are static regional orientation cards rather than meaningful map states, while many actual movement claims remain unresolved.
- Actor semantics are inconsistent: `plague` is used as an actor for a merchant trade route.

Required correction:

- Validate route labels against route type and linked claim language.
- Separate carrier/vehicle, moving actor, pathogen, and affected region roles.
- Require geographically renderable endpoints and reject overly broad or unsupported routes.

## P1 quality defects

### 5. Visual-purpose generation is still highly repetitive

| Episode | Unique purposes | Beats | Uniqueness |
|---|---:|---:|---:|
| Napoleon | 35 | 72 | 48.6% |
| Fall of Rome | 41 | 98 | 41.8% |
| Black Death | 27 | 54 | 50.0% |

Examples repeat verbatim across many beats, including generic phrases such as:

- “Orient the viewer to the setting and constraints around …”
- “Establish … at contextual scale, then isolate the change that follows.”
- “the material condition described in the linked narration”

`genericPurposeRate: 0` therefore overstates editorial quality. The purposes are technically populated but often not specific enough to guide an editor or asset generator.

Required correction:

- Measure exact and semantic purpose repetition in the blocking lint, not only blank/generic token patterns.
- Require the purpose to name the concrete evidence, change, comparison, mechanism, or uncertainty shown in that beat.
- Set a maximum exact-purpose reuse rate and a maximum template-prefix concentration.

### 6. Multi-shot anchors are mechanically templated

Every anchor sequence that triggers `duplicateShotAsset` reuses one asset intent. Reuse itself can be valid, but the shot treatment is nearly uniform:

- only **2** camera/motion instructions per episode;
- only **2** transition instructions per episode;
- repeated “controlled lateral reveal” followed by “slow push toward the decisive detail.”

This satisfies structural multi-shot cardinality but not strong editorial diversification.

Required correction:

- Model intentional derived treatments explicitly: full frame, detail crop, annotated overlay, route reveal, parallax layer, evidence highlight, comparison state, before/after state, or independent render.
- Generate shot direction from media type and claim function rather than one global establish/detail template.
- Do not warn about asset reuse when the reuse is explicitly approved and has materially distinct derived treatments; warn when treatments are effectively identical.

### 7. Aspect-ratio plans are valid but generic

Both required ratios exist for every media decision, and independent portrait renders are correctly requested. However, most composition reasons and camera instructions are media-type templates rather than beat-specific plans. The output is suitable as policy metadata, not yet as a production composition specification.

Required correction:

- Add beat-specific protected subjects, labels, focal evidence, and safe-zone conflicts.
- Verify that named map labels and diagram nodes actually fit portrait layouts.
- Add render-contract tests for maximum text density and minimum label size in 9:16.

### 8. Status surfaces can produce a false green result

- `artifact-lint.json` reports `valid: true`, `warnings: []` while `validation.json` contains 62–87 diagnostics per episode.
- `comparison-manifest-v3.1.json` exposes only `semanticLintValid: true`, not `reviewable`, `approvalEligible`, blocking errors, unresolved provenance, or warning counts.
- Manifest warning code arrays repeat the same code dozens of times and are difficult to audit.

Required correction:

- Make the comparison manifest include approval status, blocker codes/counts, warning counts by code, timing source/delta, and unresolved provenance count.
- Clearly separate structural lint, semantic lint, editorial quality, and approval gates.
- Deduplicate warning-code arrays and represent them as `{code, count}` summaries.

### 9. Narration revision binding is not independently reproducible

The declared narration revision does not equal the SHA-256 of `canonical-script.md` or `narration.normalizedText`, and the bundle does not document the revision derivation algorithm. The internal checksums prove file integrity after packaging, but an external reviewer cannot independently prove that the declared narration revision binds to the included canonical narration.

Required correction:

- Include `canonicalScriptSha256` and `normalizedNarrationSha256` explicitly.
- Document the normalization/revision algorithm and version.
- Validate both hashes during bundle generation and approval.

## Verification strengths

The following parts are good and should be retained:

- deterministic bundle layout and versioned schema/planner metadata;
- valid SHA-256 checksum sets;
- no dangling entity, claim, beat, asset, map, diagram, or narration-unit references;
- exact equality between embedded plan arrays and their exported review views;
- complete, non-overlapping beat coverage of narration units;
- contiguous shot timelines ending exactly at planned narration duration;
- explicit 16:9 and 9:16 adaptation records;
- safe generation commands without an embedded production-approval action;
- redacted, media-free review bundles.

## Required acceptance gate for V3.2

Do not accept the next bundle unless all of the following are true:

1. All three bundles are `reviewable: true` and `approvalEligible` reflects both timing and provenance policy.
2. Timing estimates are consistent with configured pace; measured audio is attached or approval remains explicitly provisional.
3. No `NARRATION_DURATION_CONFLICT` remains unless the script/target is intentionally changed and recorded.
4. Every material claim used by a map, diagram, quotation, quantitative graphic, or factual visual has source provenance.
5. No generic diagram is emitted without claim-supported node and edge relationships.
6. No route-type/route-label contradiction exists.
7. Visual-purpose and shot-direction repetition is below explicit thresholds.
8. Comparison manifest presents blockers and approval status, not only lint validity.
9. All focused tests pass, the existing Math characterization failure is resolved or formally baselined before these changes, and the full relevant test suite is run.
10. Regenerated combined and individual ZIPs pass checksum, redaction, reference-integrity, and deterministic-regeneration checks.

## Final decision

**The V3.1 bundle may be accepted as a structurally trustworthy diagnostic/review export. It must not be accepted as a production approval pack.**
