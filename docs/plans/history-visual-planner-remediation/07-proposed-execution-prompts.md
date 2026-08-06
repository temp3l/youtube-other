# Proposed approval-gated execution prompts

Run these in order only after the decisions named in each prompt are approved. Each is deliberately narrow, must inspect source before edits, preserve the dirty worktree, use focused validation, and create its required implementation report. Do not combine prompts or authorize provider calls/regeneration merely by running one.

## 1. P0 runtime/narration-integrity fix

> Implement only WP0 from `docs/plans/history-visual-planner-remediation/04-implementation-plan.md`. Approved decisions: timing source policy for no-audio plans, semantic blocking validation policy, v2 legacy strategy, and script-lineage response. Work only in History import/visual-plan validation/approval-pack/CLI-gate paths and their focused tests. Add a versioned History v2 diagnostic/validation contract; do not change media selection, prompts, maps, rendering, shared domain contracts, existing episode files, cache contents, or approvals. Require exact source coverage, valid final semantic boundary, visible full narration reference, timing conflict diagnostics, and fail-closed approval on blockers. Add deterministic adversarial fixtures from `05-test-and-validation-plan.md`. Report exact verification and migration behavior. Stop for approval before WP1.

## 2. Timing and beat/shot model

> Implement approved WP1 and, only if explicitly included, WP2. Begin with a History-only v2 narration-unit, semantic-beat, source-asset and edited-shot model plus integer-millisecond timing resolver. Preserve all v1 artifacts as read-only legacy. Add measured-audio/word-timestamp adapters only after inspecting current History audio paths and shared alignment APIs; do not reorder other genres. Produce a versioned derivative interface but do not route image generation/rendering through it. Add the specified timing/property/legacy tests and diagnostics. No provider calls, episode regeneration, cache deletion, or approval action. Stop for approval before semantic selection.

## 3. Semantic media selection

> Implement approved WP3 in History only. Replace literal/index-driven media cycling with a deterministic candidate/selection policy using semantic beats, sections, claims, evidence availability, hard requirements, soft configurable mix goals and anti-repetition constraints. Persist target versus actual mix and selection reasons. Keep current non-History visual planners, prompts, hashes and defaults unchanged. Do not call an LLM or generate media in this task. Add focused semantic-pattern, unavailable-archival, quota-conflict and non-History characterization tests. Stop before richer shot fields/maps.

## 4. Production-ready shot specification

> Implement approved WP4 in History only. Add a strict discriminated History visual specification with render-relevant composition, motion/overlay, source/reconstruction classification, factual constraints, claim/source links, confidence rationale and uncertainty display. Compile deterministic constraints from the existing History research/metadata contracts; any optional LLM enrichment must be schema-constrained and disabled by default. Do not claim reconstruction is evidence, fetch assets, change shared prompts, or generate imagery. Add contract/prompt-boundary/provenance tests and approval-pack projections. Stop before map-state and ratio integration.

## 5. Maps, diagrams, and provenance

> Implement approved WP5 and the remaining provenance integrations in History only. Add reusable map/diagram master-and-state contracts with chronology/claim linkage, state order, disclosure, strategic/tactical camera/layout intent and explicit reuse. Support the Napoleon campaign only as a fixture, never as hard-coded planner logic. Preserve existing generic map/timeline artifacts and do not render maps yet. Add deterministic state transition, changed-state reuse, rights/provenance and dense-label fixtures. Stop before shared renderer integration.

## 6. 16:9/9:16 adaptation

> Implement approved WP6 as an additive, opt-in History-to-shared adapter. Require independently planned 16:9 and 9:16 composition variants with safe zones, focal/crop/recomposition strategy and explicit map layout. Bind the derivative to semantic plan/schema/adapter hashes and demonstrate that shared image-generation/FFmpeg contracts receive only an approved current derivative. Do not change Dark Truth, mathematics, VeronicaBenini or generic defaults; add characterization tests before and after. Use existing local renderer fixtures only; no provider media generation or existing artifact rewrite. Stop before changing operator approval UX.

## 7. Approval UI/pack and validation

> Implement approved WP7. Project typed History v2 diagnostics into a concise approval pack and deterministic inspect/validate/approve/reject CLI behavior. Approval must bind the current semantic plan and consumed derivative hashes, block all approved P0 severity conditions, and distinguish warnings/provisional status. Keep legacy approvals inspectable without reauthorizing them. Add golden pack, stale-hash, warning/error, CLI and cache tests. Do not approve/reject real episodes, migrate stored artifacts, or change unrelated command behavior.

## 8. Regression and rollout audit

> Perform the approved rollout audit only. Make no production behavior changes unless a separately approved repair is necessary. Use read-only inspection and fixture/dry-run commands to audit v1 legacy readability, v2 cache keys, History approval scope, source lineage, non-History characterization, adapter output and FFmpeg contract evidence. Produce a dated report with exact commands/results, unresolved risks, and a go/no-go recommendation. Do not regenerate episodes, invalidate caches, migrate artifacts, call providers, or approve/reject visual plans.
