# Final grounded-modality calibration

Checkpoint: `history-v3.5-pre-final-grounding-calibration` → `62c46f4914f60028388d675f3bf053e8ca37929d`; semantic baseline `aae72a565c4cf00e9b61576fc04f06e1a9a0fe73`.

Tutankhamun passed because claim-level causal classification plus A/B co-occurrence authorized an arbitrary edge. Rome/Black Death then failed because finalization lacked structured claims and literal grounding omitted normalized concepts. Exact edges now require linked-claim proposition evidence for both concepts and an exhaustive typed relation-compatibility map; insufficient evidence rejects. Bronze, Rome, Black Death pass; `Tutankhamun leads-to Egypt` fails. Valid unsupported nodes/edges, proper-name fragments, and cross-episode violations: `0/0/0/0`; four type mismatches are correctly blocked.

Map fan-out came from window-scoped identities and volatile mention IDs. Ownership is now episode + owning claims + relation + modality. Complete windows win, then smallest, confidence, stable order; only proposition-required geography materializes. Semantic geo facts canonicalize entity labels. Representative maps/facts: `69/121 → 37/89`; Napoleon, Messina, Cuban, and Franklin regressions pass.

Corpus: beats `1985`; qualifiers `583`; facts `158`; maps `61` (`18` locator, `42` sequence, `1` movement); exact duplicates `0`; same-explanation groups/excess `0/0`; portrait overflow `0`; diagrams `16` (`6` valid, `10` blocked); diagram opportunities `194/16` eligible/selected; approvals `40/40/40`; only `TIMING_MEASUREMENT_REQUIRED`.

Changed: `packages/history/src/history-{diagram-*,map-*,geo-facts-v35,v34-contracts,visual-planner-v35}.ts`, focused tests, corpus acceptance.

Checks: focused Vitest `98/98`; corpus acceptance `1/1`; typecheck, targeted ESLint, diff check PASS. Risks: none beyond expected timing measurement.

Final tag: `history-v3.5-grounded-modality-baseline-v4`. Pack: `artifacts/chatgpt-review/history-approval-packs-v3.5-episodes-01-40-20260808T164223Z.zip`; embedded provenance must equal its generating commit.
