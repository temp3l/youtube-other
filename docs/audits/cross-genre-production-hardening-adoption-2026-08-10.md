# Cross-Genre Production Hardening Adoption — 2026-08-10

1. `CROSS_GENRE_HARDENING_PRODUCTION_ENFORCEMENT: PASS`

## Production enforcement completion

The prior adoption findings below are historical context. The remaining gaps
are closed as follows:

- The existing workflow-engine task fingerprint is now the canonical hardening
  dependency mechanism. History and DarkTruth bind stable shared and
  genre/variant policy hashes only to tasks whose output is affected; normal
  dependency fingerprints propagate that material downstream.
- History Short is a canonical variant: it resolves a dedicated narration
  artifact (explicit source, or an explicit extractive trusted-script
  derivation), creates a hook/payoff 9:16 plan, uses short-only paths, and has
  a persisted adaptive 55–65 second TTS calibration plan. It does not invoke
  the V3.5 long-form derivative path.
- `technical-pixel-qa.v1` supplies local corrupt-raster, dimension,
  near-empty/uniform, and alpha failure detection. The episode image pipeline
  applies the History and DarkTruth blocking policies; Veronica retains its
  semantic/aesthetic evaluator unchanged.
- Bounded fixtures passed for History full/short and DarkTruth full/short.
  Each artifact records a hardening fingerprint, correct aspect ratio, no
  genre fallback, and zero provider calls. History Short records
  `derived-from-trusted-long`, four first-class 9:16 scenes, and a resolved
  calibration plan.

Recommended optional live canaries (operator authorization required):

`pnpm mediaforge -- workflow history run --episode <history-id> --variant full --task history.audio-generation`

`pnpm mediaforge -- workflow history run --episode <history-id> --variant short --task history.audio-generation`

`pnpm mediaforge -- workflow episode run --unit <darktruth-id> --variant full --task darktruth.audio-generate`

`pnpm mediaforge -- workflow episode run --unit <darktruth-id> --variant short --task darktruth.audio-generate`

The generic contracts, validators, adaptive calibration engine, policy isolation, offline fixtures, and DarkTruth short aspect-ratio fix are implemented. Full adoption remains partial because History has no dedicated Short narration/planning workflow, and the new semantic hardening result is not yet a mandatory input to the existing History V3.5 or DarkTruth canonical media task adapters.

2. History identifiers

- User-facing/internal genre: History / `history`
- Package: `packages/history` (`@mediaforge/history`)
- CLI: `apps/cli/src/history-commands.ts`; `mediaforge history visuals ...`; short metadata via `history metadata --variant short`
- Orchestration: `packages/history/src/history-workflow-v35.ts`, `visual-planner-v35.ts`, `history-render-adapter-v35.ts`
- Long planning: V3.5 plan/review/approval path
- Short planning: V3.5 9:16 derivative only; no dedicated Short script planner found

3. DarkTruth identifiers

- User-facing name: DarkTruth / Dark Truth
- Content profile: `dark-truth`; workflow task prefix: `darktruth.*`; API profile: `dark_truth`
- Package: `packages/dark-truth` (`@mediaforge/dark-truth`)
- CLI: `apps/cli/src/episode-commands.ts`, `story-pipeline-command.ts`, `story-production-command.ts`, `story-audio-command.ts`, `story-images-command.ts`, plus root `images review-pack`
- Orchestration: `packages/dark-truth/src/task-registry.ts`, `canonical-story-task-adapters.ts`, `canonical-media-task-adapters.ts`, and legacy production functions in `index.ts`

4. Selected fixtures

- History full: `content-packs/youtube-history-10-video-story-pack/02-napoleons-invasion-of-russia.md`
- History short: the same fixture through its existing V3.5 9:16 derivative path; this is not a dedicated Short narration
- DarkTruth full: `content-ideas/content/dark-truth-episodes/007-ben-drowned-the-game-that-knew-his-name-en-full.md`
- DarkTruth short: sibling `...-en-short.md`

5. Shared architecture summary

`production-hardening.ts` supplies typed semantic treatments, roles, state complexity, continuity/motif contracts, normalized diversity, semantic reuse, final-treatment hashes, canonical timing, event regeneration, review hashing, cache invalidation, and fail-closed readiness. History and DarkTruth adapters supply independent semantics and variant policy. `adaptive-pacing.ts` is the shared engine; Veronica retains its own policy wrapper.

6. Audit/adoption capability matrix

| Capability | Veronica source component | History long | History short | DarkTruth long | DarkTruth short | Recommended action |
|---|---|---|---|---|---|---|
| Semantic treatment validation | `veronica-pre-image-semantic-gate.ts` | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Wire adapter result into canonical media tasks |
| Visible thesis | semantic gate + prompt brief | SHARED_ALREADY | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Require before provider dispatch |
| Actor/action owner | semantic gate | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Persist typed actor IDs |
| Actor mismatch | semantic gate | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Block canonical task dispatch |
| State complexity | semantic gate | GENRE_SPECIFIC_EXISTING_EQUIVALENT | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Persist adapter treatment |
| Decisive still | semantic gate | NOT_RELEVANT | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | Keep variant policy |
| Multi-state representation | long-form semantic gate | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | PARTIALLY_SHARED | PARTIALLY_SHARED | Keep History maps first-class |
| Motif contract | visual plan | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | PARTIALLY_SHARED | PARTIALLY_SHARED | Persist only when used |
| Continuity | visual plan | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | Retain profile policy |
| Diversity normalization | semantic gate | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Diagnostic only for History |
| Intentional repetition | semantic gate | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Use atmosphere-aware policy |
| Asset reuse safety | Veronica registry | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Wire evaluator into registries |
| Final-treatment ownership | semantic gate | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Mandatory derived-state fingerprint |
| Diagram integrity | semantic gate | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | PARTIALLY_SHARED | PARTIALLY_SHARED | Keep History compiler authoritative |
| Visual-event regeneration | semantic gate | PARTIALLY_SHARED | PARTIALLY_SHARED | RELEVANT_GAP | RELEVANT_GAP | Persist regenerated events |
| Canonical post-TTS timing | production adapter | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | Require selected-audio hash |
| Timing terminology | production adapter | SHARED_ALREADY | SHARED_ALREADY | RELEVANT_GAP | RELEVANT_GAP | Use canonical enum |
| Adaptive TTS engine | speech pacing | NOT_RELEVANT | NOT_RELEVANT | NOT_RELEVANT | NOT_RELEVANT | Engine reusable; policies remain disabled |
| Pacing separation | speech policy | SHARED_ALREADY | SHARED_ALREADY | SHARED_ALREADY | SHARED_ALREADY | Preserve discovered policies |
| Acceptance tolerance | speech pacing | NOT_RELEVANT | NOT_RELEVANT | NOT_RELEVANT | NOT_RELEVANT | Available only if adaptive policy approved |
| Candidate caching | CLI pacing | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | Use generic cache-key helpers if enabled |
| Calibration versioning | CLI pacing | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | Use genre/variant key if enabled |
| Review hashing | review packs | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | Include hardening hash in normal pack |
| Provider gates | image pipeline/review pack | GENRE_SPECIFIC_EXISTING_EQUIVALENT | PARTIALLY_SHARED | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | Add hardening blockers without weakening gates |
| Human approval states | workflow | GENRE_SPECIFIC_EXISTING_EQUIVALENT | PARTIALLY_SHARED | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | Reuse existing states |
| Cache invalidation | semantic gate | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | Wire artifact dependency edges |
| Structured observability | semantic gate | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | PARTIALLY_SHARED | Persist dry-run diagnostics |
| Post-generation pixel QA | `veronica-post-generation-visual-qa.ts` | NOT_RELEVANT | NOT_RELEVANT | NOT_RELEVANT | NOT_RELEVANT | Veronica-only; future genericization |
| Aspect ratio | production adapter | SHARED_ALREADY | SHARED_ALREADY | SHARED_ALREADY | RELEVANT_GAP | Fixed DarkTruth Short 9:16 leakage |
| Visual density | visual policy | GENRE_SPECIFIC_EXISTING_EQUIVALENT | PARTIALLY_SHARED | GENRE_SPECIFIC_EXISTING_EQUIVALENT | GENRE_SPECIFIC_EXISTING_EQUIVALENT | Preserve current presets |

7. Generic components reused

Shared hashing, Zod runtime validation, History V3.5 maps/diagrams/entity context, DarkTruth DAG/approvals/visual-retention presets, pre-image review hashing, and Veronica pacing behavior through a generic engine wrapper.

8. Generic components added

Typed hardening schema/policies; actor-role validator; state/event integrity; diversity classification; reuse evaluator; canonical timing; review hash; targeted invalidation; readiness gate; cache-key helpers; structured diagnostics; four offline adapters/runs.

9. History behavior preserved

Trusted narration is unchanged. Existing evidence, entity, geography, map, diagram, reference-image, and approval systems remain authoritative. Diversity is diagnostic and never mutates facts.

10. DarkTruth behavior preserved

Atmosphere, ambiguity, unseen threat, restrained symbolism, motif repetition, and setup-to-reveal progression remain valid. Positive requests for generic stock-horror imagery are blocked.

11. Long/short boundaries

Policies resolve 16:9/full and 9:16/short independently. Long retains multi-state progression. Short prefers decisive transitions without collapsing required processes. No Veronica duration/WPM values appear in target policies.

12. Actor/role result

Structural owner IDs survive projection. Supporting actors cannot replace owners. Historical figures require resolved entity IDs. Intentionally unidentified DarkTruth actors remain explicitly unspecified.

13. State-complexity result

All three states are typed. History maps remain multi-state in both ratios. DarkTruth full uses setup-to-reveal progression; Short compresses the representative reveal to a decisive moment.

14. Motif/continuity result

History uses an evidence-grounded campaign route. DarkTruth uses the fixture's corrupted-game signal. Contracts are optional and scope/reuse-limited.

15. Diversity result

Ten normalized viewer-visible families distinguish information-bearing continuity from empty repetition. History factual continuity and DarkTruth atmosphere repetition are preserved.

16. Asset reuse result

History blocks period/entity/faction/geography/material-culture mismatches. DarkTruth blocks story-state/environment/motif mismatches. Crop safety alone cannot pass reuse.

17. History map/diagram integrity

Final treatment owns active states; events derive from it and carry treatment hashes. Orphan/stale events block. Existing compilers are untouched.

18. DarkTruth diagram/event integrity

No fixture diagrams were invented. Generic orphan checks apply only when diagrams exist. Reveal events remain genre-specific through `genreEventType`.

19. Canonical timing

Every fixture uses the selected fake/cached audio hash and duration. Proportional allocation is labeled `proportional-total-audio-reconciliation`; it is not claimed as scene alignment.

20. TTS engine reuse

The adaptive algorithm is now generic. Veronica delegates to it and retains its policy/schema. No target variant enables adaptive calibration without approved policy.

21. TTS policy by variant

- History full/short: preserve existing trusted narration configuration; adaptive disabled.
- DarkTruth full: static 175–185 WPM guidance.
- DarkTruth short: static 175–185 WPM and existing 55–65 second envelope; adaptive disabled.

22. Tolerance by variant

Not applicable to all four because adaptive calibration is disabled. The generic engine supports configurable `durationAcceptanceToleranceSeconds` for future approved policies.

23. TTS cache/calibration

Exact-speed candidate keys cover provider/model/voice/locale/narration/instructions/speed/format/options. Completed keys additionally cover genre, variant, policy, target, tolerance, and output settings.

24. Review/provider readiness

Shared review hashes bind narration, timing, treatment, map/diagram state, semantic review, provider prompts, reuse, and pacing. Fixture provider readiness intentionally fails closed on missing human approval.

25. Cache invalidation

Treatment changes invalidate all treatment-derived state. Timing, provider projection, diversity, and reuse versions invalidate only their affected consumers.

26. Post-generation QA

Implemented infrastructure is Veronica-specific. No major CV subsystem was built. History identity/period and DarkTruth tone QA remain deferred genericization candidates.

27–30. Dry-run results

- History full: PASS; 3 map progressions; provider blocked only by expected missing human approval.
- History short derivative: PASS as 9:16 derivative; not evidence of a dedicated Short narration workflow.
- DarkTruth full: PASS; multi-state reveal preserved.
- DarkTruth short: PASS; decisive reveal and 9:16 projection preserved.

31. Artifacts

`docs/reports/codex-runs/2026-08-10-cross-genre-production-hardening-artifacts/` contains four JSON artifacts. No fresh normal review pack was generated because these source fixtures do not contain cached narration audio in the episode layout required by `images review-pack`.

32. Veronica regression

`packages/speech/src/veronica-short-pacing.unit.test.ts`: 6 passed. Adaptive policy, tolerance semantics, and selection behavior remain intact. Veronica semantic-gate files were not modified by this task.

33. Other affected regression

Shared hardening: 10 passed; generic pacing: 3 passed; History adapter: 2 passed; DarkTruth adapter: 3 passed.

34. Live TTS calls: `0`

35. Image provider calls: `0`

36. Validation

- Focused Vitest: final affected selections passed (24 tests total across final focused runs).
- Builds/typechecks: shared, speech, History, DarkTruth passed.
- Targeted ESLint passed.
- Four offline fixture runs passed.

37. Blockers/deferred work

- Build a real History Short script/planning workflow before claiming full History Short adoption.
- Make hardening artifacts mandatory dependencies of History V3.5 and DarkTruth canonical media provider tasks.
- Include the hardening review hash in normal pre-image packs.
- Wire semantic reuse/invalidation decisions into current asset registries.
- Genericize post-generation pixel QA separately.

## Required final matrix

| Capability | History long | History short | DarkTruth long | DarkTruth short | Shared implementation | Genre-specific policy |
|---|---|---|---|---|---|---|
| semantic gate | Partial | Partial | Partial | Partial | typed validator | trusted evidence / relevant atmosphere |
| visible thesis | Active in adapter | Active in derivative adapter | Active in adapter | Active in adapter | required treatment field | examples not hard-coded |
| actor/action owner | Active | Active | Active | Active | structural actor IDs | historical identity / intentional ambiguity |
| actor mismatch validation | Active | Active | Active | Active | provider actor-set check | stronger History entity gate |
| state complexity | Active | Active | Active | Active | shared enum | representation varies |
| decisive transition | Allowed | Preferred | Allowed | Preferred | event regeneration | no forced collapse |
| multi-state support | First-class | Maps allowed | First-class | Allowed when required | shared category | History maps / DarkTruth reveals |
| motif | Optional | Optional | Optional | Optional | typed contract | route / episode motif |
| continuity | Active | Active | Active | Active | shared modes | geography / fragmented-hybrid |
| diversity normalization | Diagnostic | Diagnostic | Diagnostic | Diagnostic | ten families | facts / atmosphere win |
| repetition classification | Active | Active | Active | Active | pair classifier | atmosphere-aware DarkTruth |
| asset reuse | Evaluator added | Evaluator added | Evaluator added | Evaluator added | semantic compatibility | strict history / story state |
| treatment invalidation | Added | Added | Added | Added | targeted dependency map | compiler remains authoritative |
| map/diagram integrity | Active | Active | Conditional | Conditional | orphan/stale checks | History compiler preserved |
| visual events | Regenerated | Regenerated | Regenerated | Regenerated | treatment hash | genre event type retained |
| canonical timing | Active in dry run | Active in dry run | Active in dry run | Active in dry run | selected-audio timing | cadence policy separate |
| timing terminology | Accurate | Accurate | Accurate | Accurate | timing enum | none |
| adaptive TTS | Disabled | Disabled | Disabled | Disabled | reusable engine | no invented target |
| pacing policy | Existing | Existing | 175–185 WPM | 175–185 WPM, 55–65s | typed resolver | independent versions |
| acceptance tolerance | N/A | N/A | N/A | N/A | configurable engine field | requires approved adaptive policy |
| TTS cache | Available | Available | Available | Available | exact candidate/completed keys | genre/variant isolation |
| review integrity | Added, not mandatory | Added, not mandatory | Added, not mandatory | Added, not mandatory | deterministic review hash | existing approval systems |
| provider gate | Existing + dry-run gate | Partial | Existing + dry-run gate | Existing + dry-run gate | fail-closed evaluator | stronger gates win |
| cache invalidation | Added, not wired | Added, not wired | Added, not wired | Added, not wired | targeted invalidation | no broad asset purge |
| post-generation QA | Deferred | Deferred | Deferred | Deferred | Veronica-only implementation found | future separate task |
