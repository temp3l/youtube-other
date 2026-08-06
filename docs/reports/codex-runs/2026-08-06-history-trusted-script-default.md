# History trusted-script default and incremental visual provenance

Date: 2026-08-06  
Source: `prompts/06-history-trusted-script-default-and-incremental-visual-provenance-goal.md`

## Summary

History now defaults to `trusted-script`. Trusted stories skip OpenAI research/web search, emit honest `trusted_input` claims, bind factual visuals to narration+attestation, and keep research-backed mode as explicit opt-in (`--promote-to-research-backed`).

## Changed files by workstream

1. Defaults / authority: `packages/history/src/history-trusted-script-v33.ts`, `content-pack.ts`, `index.ts`
2–6. Attestation, offline claims, schema, IDs: `history-trusted-script-v33.ts`
7–8. Approval + narration-bound visuals: `history-trusted-script-v33.ts`, `visual-planner-v33.ts`
9–12. Story claim import, migration, deltas, transitions: `history-trusted-script-v33.ts`, `history-trusted-workflow-v33.ts`
13. CLI: `apps/cli/src/history-commands.ts`, `apps/cli/src/index.ts`
14–15. Review/comparison artifacts: `history-workflow-v33.ts`
16. Regenerated episode packs under `artifacts/chatgpt-review/history-approval-packs-v3.3*`
17. Tests: `history-trusted-script-v33.unit.test.ts`, `history-commands.unit.test.ts`
Docs: `docs/history/overview.md`, `.env.example`

## Architecture

Modes: `trusted-script` | `research-backed` | `unverified-external`.  
Default resolution: CLI → episode metadata → persisted authority → History default `trusted-script` (non-history unchanged).  
Attestation: hash-bound append-only `TrustedNarrationAttestationV1`.  
Claim status: material → `trusted_input` (never `supported`); rhetorical → `not_required`.  
Approval: content allows valid trusted attestation; unverified-external blocks factual planning.  
Visuals: narration-bound map/diagram validation in trusted mode; evidence validation retained for research-backed.

## CLI

`history authoring status|set-authority|attest|trust-script|extract-trusted-claims|diff-script|reattest-deltas|regenerate-visuals`  
`history v3.3 * --live-research` requires `--promote-to-research-backed` on trusted episodes.

## Tests / checks

- `pnpm test:focused -- packages/history/src/history-trusted-script-v33.unit.test.ts` → 9 passed
- `pnpm test:focused -- apps/cli/src/history-commands.unit.test.ts packages/history/src/history-v33.unit.test.ts packages/history/src/history-trusted-script-v33.unit.test.ts` → passed
- `pnpm --filter @mediaforge/history typecheck` → passed
- `pnpm --filter @mediaforge/history build` → passed
- focused ESLint on touched History/CLI files → passed
- Live research without promote flag → blocked as expected
- Migration/review regeneration with `OPENAI_API_KEY` unset → providerCalls=0, webSearchCalls=0

## Proof: zero provider calls

Trust-script migration and compare regeneration ran with API keys unset; diagnostics report `researchMode: skipped-trusted-script`, `providerCalls: 0`, `webSearchCalls: 0`. Prior research snapshots preserved as non-authoritative.

## Episode results

| Episode | Mode | Narration hash | Attestation | Trusted claims | Maps/Diagrams/Beats/Shots | Gates | Review ZIP SHA-256 |
|---|---|---|---|---|---|---|---|
| napoleon | trusted-script | `a8a673…845d` | `attestation-90df747de0c61fa426517c9d` valid | 94 mat / 0 non / 0 deltas | 7/2/94/94 | S reviewable, E production_plan_reviewable, C approved, P blocked (`TIMING_MEASUREMENT_REQUIRED`) | `f65e114feef216b474649b4c4e4d8e784cce1b349b6df37d062fd817742ba599` |
| roman | trusted-script | `2551d1…db9a` | `attestation-02fedd7df720b7b7c899a19a` valid | 106/0/0 | 3/2/106/106 | same pattern | `6979613f25b6b4315052736148504d7c118b8127d20b577af5ec9a056787dd0c` |
| black-death | trusted-script | `c22564…2099` | `attestation-13532cdf3791ce82115d7f7b` valid | 96/0/0 | 3/0/96/96 | same pattern | `61c195ac02460d86d3cfe15ad0f9d7d4350566a4c00f5490d8a83d776ee887ce` |

Combined bundle: `artifacts/chatgpt-review/history-approval-packs-v3.3.zip`  
SHA-256: `1f6d523ca7357eac85014961569174a0914b2c0907cc9cf6a04e45cb3a5bf9de`  
Determinism: two consecutive `--regenerate` compares produced identical combined ZIP hash.

## Limitations

- Deterministic claim extraction is structural, not semantic verification; optional `--semantic-claim-structuring` remains disabled by default and is not yet a separate CLI flag beyond generation import.
- Production remains blocked until measured audio exists.
- Rhetorical `not_required` classification is conservative for these three scripts (0 non-material).
- Do not describe these episodes as independently researched or source-verified.
