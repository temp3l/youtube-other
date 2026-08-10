# V3.6 structured claim enrichment

Changed files: V3.6 structured-claim runtime/enricher/tests, atomic shadow integration, package exports, mechanically generated schema/contract docs, architecture note, and deterministic review generators. V3.5 production and the V3.6 relation validator were unchanged.

Implementation checkpoint: `def0fef3fa13caf71a44d68f5b4696a19677a55b`; tags `history-v3.6-structured-claim-baseline` and `history-v3.6-structured-claim-corpus-baseline`.

Checks: focused structured tests 6/6; existing V3.6 contract/atomic/representative/golden tests 90/90; representative eight-episode gate PASS; targeted ESLint PASS; JSON and diff checks PASS; all-40 repeat hash, persisted schema/invariants, checksums, and ZIP integrity PASS. The affected package typecheck exposed two successive branded-ID typing errors; both were repaired, but the retry budget prevented a final typecheck rerun.

Results: 3,774 claims; 106 structured; 111 propositions, all compatibility backfill; schema rejects 0. Atomic propositions 111 -> 111; insufficient structure 309 -> 309 (0%). Candidates 236 -> 236; 188 accepted before dedup; validated relations 103 -> 103; rejected 48 -> 48; 63 overlapping rejection-diagnostic occurrences. All hard safety counts are zero. Differential reporting labels 40 episode comparisons separately from 206 unpaired relation signals. Manual review: 39 items.

Risk/follow-up: compatibility backfill cannot test the expected gain from native semantics. Next: add native structured output to the V3.6 canonical claim-generation fixture/provider contract, without an extra provider call.
