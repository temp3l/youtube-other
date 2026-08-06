# History V3.3 acceptance audit

Date: 2026-08-06. Source goal:
`prompts/03-history-v3.3-complete-remediation-claims-provenance-and-regeneration-goal.md`.

## Contract and authority

- [x] Explicit `history-visual-plan.v3.3`,
  `history-visual-planner.v3.3.0`, and `history-approval-pack.v3.3` contracts.
- [x] V1–V3.2 remain additive and unchanged; unrelated genre tests/inputs were
  not regenerated.
- [x] Strict OpenAI claim, evidence-assessment, and visual-purpose schemas omit
  application IDs, offsets, source identities, statuses, and approvals.
- [x] Deterministic code owns canonical units/spans, claim/source/evidence IDs,
  provenance policy, overrides, gates, hashes, and checksums.
- [x] Offline fixture/replay requires no paid call; live providers use bounded
  batches, cache keys, retries/jitter, timeouts, cancellation, failure taxonomy,
  concurrency limits, circuit throttling, usage metadata, and redacted packs.

## Narration and timing

- [x] NFKC/LF canonicalization removes headings as non-spoken content, removes
  inline Markdown while retaining link text, preserves punctuation, collapses
  inline whitespace, and uses `\n\n` paragraph separators.
- [x] Every unit uses explicit UTF-16 code-unit fields and slices exactly; unit
  order, non-overlap, separator-only gaps, word boundaries, final bounds,
  repeated sentences, Unicode, punctuation, chapters, and no-final-newline cases
  are tested, including all three episodes and the three V3.2 split regressions.
- [x] Claims align exact unit text deterministically; unmatched and ambiguous
  text is rejected; model offsets/IDs are rejected.
- [x] Timing uses aggregate words/WPM with separately bounded punctuation,
  paragraph, and chapter pauses. The 600,000 ms preference remains distinct from
  the 480,000–1,200,000 ms range and measured timing takes precedence.
- [x] Production requires measured TTS/final audio unless an audited policy says
  otherwise. All generated packs truthfully report provisional estimates.

## Claims and provenance

- [x] Forced materiality covers dates, quantities, entities, causal/interpretive
  assertions, quotations, and higher-evidence claims.
- [x] Source URL/DOI/ISBN identity and source IDs are deterministic; free-form
  model URLs are ignored; only tool citations are accepted by the OpenAI search
  adapter.
- [x] Live HTTP retrieval persisted real source records, response snapshot
  hashes, concise fragments, reproducible locators, and exact inaccessible-source
  diagnostics. Resolution counts are Napoleon 1/2, Rome 3/3, Black Death 1/3.
- [x] Assessments can reference only supplied claims/fragments. Versioned policy
  derives supported, partial, contested, contradicted, unresolved, or
  not-required status; confidence never authorizes approval.
- [x] Higher-evidence source rules and append-only, hash-bound override
  invalidation are tested.
- [x] All 296 material claims remain explicitly unresolved and therefore block
  content; no source fragment was treated as entailment without assessment.

## Visual, approval, and packaging

- [x] Every canonical unit has a distinct purpose, beat, shot, asset/media
  decision, and independent 16:9/9:16 plan with contiguous full timing coverage.
- [x] Unsupported factual modalities are deterministically withheld. Each
  fallback records rejected modality, reason, selected fallback, semantics, and
  claim/evidence links; no global map fallback exists.
- [x] Map route/actor/endpoint/label and diagram node/edge validators cover valid
  references, evidence bindings, maritime/overland and pathogen-role conflicts,
  unsupported edges, and no-diagram fallbacks.
- [x] No map or diagram is falsely emitted from unresolved claims. Comparison
  records say `not_generated`; editorial, content, and production remain blocked.
- [x] Exact/semantic purpose and shot-treatment metrics pass; diagnostics carry
  beat/shot IDs.
- [x] Every required pack artifact exists; approval evidence and comparison
  records expose identities, timing, provenance, quality, tests, and four gates.
- [x] Final audit parses all JSON, resolves references, verifies checksums,
  rejects paths/secrets/symlinks, tests ZIPs, and recreates nested ZIPs byte-for-byte.
- [x] Two final Phase B runs matched: combined ZIP
  `6c402f1c2274fee4b92dcbb4ea6582959d29b5e25acc95ce982a5cdcef8ed57c`.

## Verification and blocker evidence

- [x] Focused results: V3.2 baseline 2/2; V3.3 23/23; CLI 11/11;
  History typecheck/build and targeted ESLint pass. The known Math ordering
  failure remains documented in `docs/history-v3.2/VERIFICATION.md`.
- [x] Live source retrieval succeeded as counted above. Live OpenAI execution
  was attempted but the environment rejected escalation because its usage quota
  is exhausted until 2026-08-12 23:01; zero paid OpenAI calls completed. The
  maintained SDK path is implemented and unit-tested, while packs truthfully
  identify fixture extraction and retain all semantic blockers.
