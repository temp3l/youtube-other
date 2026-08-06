# Approval-gated implementation plan

Nothing in this plan is authorized by this analysis. Each work package requires the decision-register approvals applicable to it. Keep all changes additive and History-scoped until characterization proves shared reuse safe.

## Phase 0 — characterization and P0 integrity slice (smallest safe first slice)

### WP0: narration integrity, semantic-boundary and approval gate

- Goal: prevent a History approval pack from claiming a complete usable plan when input coverage, boundaries or timing are invalid.
- Rationale: resolves HVP-P0-02 through P0-05 without changing media aesthetics or downstream rendering.
- Exact modules likely affected: `packages/history/src/visual-planner.ts` and its unit test; `packages/history/src/task-registry.ts`; `apps/cli/src/history-commands.ts` only if a read-only validation/status command is needed; `packages/history/src/content-pack.ts` and tests for narration lineage. Add a History-only artifact schema module if existing `contracts.ts` is the chosen owner.
- Contract changes: additive v2 validation/diagnostic artifact; retain v1 reader. Add source length/hash, final range, semantic-boundary, timing-source and duration-delta fields. Do not change existing generic `Scene` or `ShotPlan`.
- Implementation steps:
  1. Define the canonical normalized narration artifact and deterministic sentence-unit extractor (Unicode/abbreviation aware).
  2. Make validation receive narration metadata rather than only the plan; require range start=0, final end=source length, contiguous monotonic ranges, valid sentence/intentional paragraph boundary, and feasible duration per unit.
  3. Detect source-pack/imported-script lineage disagreement; mark the plan blocked/provisional rather than overwrite or repair the script.
  4. Treat target duration as reconciliation input. If complete narration cannot fit the declared target by policy tolerance, emit a blocking conflict; never slice text or dump overflow into one beat.
  5. Render full unit references/counts and validation errors in the pack; preserve excerpts as explicitly labelled excerpts.
  6. Make plan/replan reset an approval only through the new plan revision; do not mutate existing v1 approvals.
- Tests: exact adversarial timing fixtures in `05`; legacy v1 parse/unchanged behavior; CLI approval rejects plan with a blocker.
- Observability: required source/planned chars/units/ranges, duration values/delta, timing source/fallback, error/warning codes.
- Backward compatibility: v1 plan commands remain inspectable. New v2 planning requires explicit `--planner-version`/profile selection or a History feature flag until rollout.
- Cache/artifact handling: new filenames or a versioned envelope; v1 cache is never a hit for v2. Do not delete/overwrite approved artifacts.
- Rollout: fixture-only → explicit dry-run diagnostics → opt-in per new History episode → default only after audit.
- Risks: sentence segmentation edge cases and legitimate non-narrated intros/outros. Model them explicitly rather than weakening coverage.
- Acceptance criteria: a final incomplete sentence, overflow conclusion, source hash mismatch, or timing conflict blocks approval with an actionable code; complete source narration remains represented.
- Estimated complexity: M. Parallelisation safety: high after schema owner is agreed.

## Phase 1 — correct model and timing

### WP1: versioned narration-unit / beat / shot model and timing resolver

- Goal: establish distinct narrative, semantic, source-asset and render-time identities with variable timing.
- Rationale: fixes the source of equal beat timing and removes one-beat/one-shot ambiguity.
- Exact modules likely affected: History visual schema/planner/tests; `packages/history/src/task-registry.ts`; adapter boundary tests; possibly `packages/domain/src/index.ts` only for a new generic interface proven reusable.
- Contract changes: `NarrationUnit`, `HistoryBeat`, `SourceAsset`, `EditedShot`, timing source/precision and intentional non-narrated interval. Do not mutate existing domain `Scene` fields in place.
- Implementation steps: implement integer-ms resolver with measured-word, measured-total, estimated fallback; segment before selection; allocate variable shots within unit ranges; emit a v2 plan and a stable History-to-existing-scene derivative.
- Tests: timing property tests, monotonicity/no-overlap, exact reconciliation and source-to-shot coverage.
- Observability: unit/beat/shot duration histograms, planned vs measured/estimated delta, fallback reason.
- Compatibility/cache: version schema/planner and adapter; fingerprint all timing inputs. Legacy output is only read, not re-derived.
- Rollout: shadow-plan selected fixture/episodes; diff diagnostics, not media, before enabling new renderable derivative.
- Risks: audio may arrive after editorial plan. Provisional plan must be retimed/reapproved or use a deliberate two-stage approval policy.
- Acceptance criteria: 600-second target cannot force uniform timings; every render shot has a valid purpose and interval.
- Estimated complexity: L. Parallelisation safety: medium; depends on WP0 contract.

### WP2: wire measured audio and alignment without changing non-History order

- Goal: make measured audio the source of truth when available and make fallback visible when not.
- Rationale: History currently plans before audio; shared code already has ffprobe/alignment patterns.
- Exact modules likely affected: History task ordering/bindings; audio duration probe adapter; chapter alignment; only add a small shared utility if the existing audio-validation API is suitable.
- Contract changes: immutable audio identity/hash/duration and optional word-alignment artifact reference.
- Implementation steps: introduce a post-audio timing reconciliation task; preserve pre-audio provisional semantic plan; require new approval if timing changes renderable shot boundaries beyond tolerance.
- Tests: missing audio fallback, measured-audio proportional fallback, stale audio hash, revision-bound approval.
- Observability: audio duration source and cache status.
- Compatibility/cache: no cross-genre task-order change; History workflow revision changes and old workflow remains resumable as legacy.
- Rollout: opt-in only after WP1 fixture suite passes.
- Risks: provider audio path inconsistency (`locales/en/full` vs `en/full` check must be characterized and corrected under this work package).
- Acceptance criteria: measured audio changes timing deterministically and approval cannot cover a stale timing derivative.
- Estimated complexity: M. Parallelisation safety: medium after WP1.

## Phase 2 — editorial and evidence planning

### WP3: semantic media selection and section hierarchy

- Goal: replace cyclic allocation with evidence-aware selection and document global targets as soft policy.
- Rationale: addresses HVP-P1-02/03 and P2 hierarchy without arbitrary hard-coded percentages.
- Exact modules likely affected: History visual planner/profile configuration; `content-pack.ts` editorial section ingestion; research/claim contracts and tests.
- Contract changes: History media eligibility/selection reason, hard requirements, section role/importance, policy version.
- Implementation steps: compile profile + episode rules; build candidates from claims/sections/evidence availability; rank deterministically; use quotas only as constrained soft repair; report actual and target mixes separately.
- Tests: semantic hard requirements beat quotas, no modulo pattern, unavailable archival alternative, non-History characterization.
- Observability: candidate counts, selected/rejected reasons, transitions/run lengths, policy deviations.
- Compatibility/cache: History policy/version and selection results fingerprinted. No shared media defaults change.
- Rollout: shadow selection packs reviewed by a historian/editor before any provider call.
- Risks: weak research input must lower confidence and expose gaps, not invent archival support.
- Acceptance criteria: no index-driven cycle; every selected medium has a recorded editorial reason.
- Estimated complexity: L. Parallelisation safety: high once WP1 is stable.

### WP4: production-ready source assets, historical constraints and provenance

- Goal: replace generic text directions with typed, auditable source/reconstruction specifications.
- Rationale: addresses weak documentary authority and hallucination risk.
- Exact modules likely affected: History planner/research/validation; potentially `packages/visual-planning/src/editorial-documentary-plan.ts` through an adapter, not replacement.
- Contract changes: discriminated media specs; claim/source/right links; uncertainty disclosure; reconstruction constraints; confidence rationale.
- Implementation steps: deterministically compile factual constraints from metadata/claims; validate source/rights links; allow optional schema-constrained enrichment; present fields in approval pack; block missing required cinematic constraints or archival rights/provenance.
- Tests: disputed claim, quotation, unknown rights, modern-anachronism exclusion, provenance/hash behavior.
- Observability: constraint coverage, provenance/rights/confidence summaries.
- Compatibility/cache: hash all render-relevant constraints and immutable source manifests; source acquisition state is separate.
- Rollout: start with plan-only/approval display; do not claim generative images as evidence.
- Risks: external source rights verification needs a product owner and may be unavailable.
- Acceptance criteria: every reconstruction has constraints; every evidence asset can name provenance/confidence/rights state.
- Estimated complexity: L. Parallelisation safety: high with WP3 after shared schema decision.

### WP5: map and diagram sequence states

- Goal: make maps/diagrams reusable stateful explanatory media.
- Rationale: supports campaign continuity, accurate reuse counts and ratio adaptation.
- Exact modules likely affected: History planner; map-timeline binding; shared renderer adapter only after a state-to-overlay design is approved.
- Contract changes: master sequence/state IDs, chronology/claim links, positions/routes/legend/camera/layout fields and source disclosure.
- Implementation steps: define generic state model; compile History campaign candidates from chronology/claims; produce stateful sequences; create 16:9/9:16 layouts; map edited shots to state IDs.
- Tests: ordered state transitions, changed-state reuse, strategic/tactical scale, dense vertical labels.
- Observability: state counts, state reuse, missing data/disclosure warnings.
- Compatibility/cache: state content and renderer composition are separate but both versioned/hashes; no current maps converted automatically.
- Rollout: plan-only first; explicit rendering capability approval later.
- Risks: cartographic source licensing/accuracy; avoid fake precision.
- Acceptance criteria: a campaign map can represent the nine example phases through states without nine unrelated static assets.
- Estimated complexity: XL. Parallelisation safety: medium after WP4.

## Phase 3 — ratio, renderer bridge, and approval experience

### WP6: explicit 16:9/9:16 composition and History-to-render adapter

- Goal: deliver ratio-specific, consumable derivatives rather than a History-only plan and a disconnected generic scene plan.
- Rationale: resolves HVP-P1-07/08 while preserving shared contracts.
- Exact modules likely affected: History planner/task binding, `packages/domain` adapters, `packages/visual-planning`, `packages/image-generation`, `packages/rendering`, CLI inspection output.
- Contract changes: immutable derivative manifest declaring source v2 plan/hash/schema, variants and render identities.
- Implementation steps: compile semantic plan into existing scene/shot inputs; enforce ratio coverage; use shared focal/crop/FFmpeg pathways; validate mapping equality; add previews/inspection before routing image generation.
- Tests: adapter lineage, vertical maps/text safe zones, FFmpeg render-contract, existing Dark Truth/math/generic render characterization.
- Observability: ratio coverage, crop/recompose strategy, adapter cache hit.
- Compatibility/cache: adapter opt-in; old History generic scenes retained; no shared renderer behavior changes without a History shot plan.
- Rollout: dual-write derivatives without generation, then one approved pilot.
- Risks: path and scene-ID conventions; renderer supports these concepts but its capability must be verified at integration time.
- Acceptance criteria: generated/rendered History inputs carry exactly the approved plan's hash and both required ratio strategies.
- Estimated complexity: XL. Parallelisation safety: low with renderer integration; isolate via adapter.

### WP7: approval pack, diagnostics, CLI gate and rollout audit

- Goal: make human approval meaningful and operationally auditable.
- Rationale: presentation only follows typed contracts and validates the real consumed derivative.
- Exact modules likely affected: History renderer/CLI/test files; observability artifact writers; workflow approval binding.
- Contract changes: versioned approval record contains semantic plan and derivative hashes, validation summary, versions and approval scope.
- Implementation steps: render executive summary/timeline/histogram/mix diagnostics/state/provenance/ratio/reuse tables; add inspect/validate commands; change approval gate to validate current derivative; produce migration/audit utility that is read-only by default.
- Tests: golden packs, stale approval, blocked errors vs warning-only, legacy handling, CLI deterministic output.
- Observability: complete requested diagnostic set in JSON plus readable Markdown.
- Compatibility/cache: legacy CLI aliases preserved; explicit `--legacy` inspection only; policy version causes a new plan rather than silent reuse.
- Rollout: documentation, operator training, shadow artifact audit, opt-in pilot, post-pilot acceptance review.
- Risks: pack becomes unreadable. Use summary plus linked detailed JSON; never hide errors.
- Acceptance criteria: approval is blocked by every required P0 invariant and reports actual plan state.
- Estimated complexity: L. Parallelisation safety: high after adapter contract freezes.
