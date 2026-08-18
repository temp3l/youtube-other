# Veronica Unified V3 English Semantic Remediation

Status: planning-only; implementation has not begun.

## Mission and execution boundary

Repair the deterministic semantic-planning and validation layer for the 18 English Longs and 36 English Shorts in `content-packs/veronica-unified-content-pack-v3`. Produce fresh plans for all 54 stories and a new zero-provider review ZIP. Do not call or authorize TTS, image generation, remote QA, transcription, rendering, or any paid/network provider.

The worktree is extensively dirty. Its current bytes are the implementation baseline. Before editing, record branch, HEAD, full status, and hashes of overlapping files. Never reset, clean, overwrite unrelated work, or create a commit unless separately requested.

## Verified baseline

- Branch/HEAD observed during planning: `codex/veronicabenini-positioning-visual-planning` at `492543be534da6bf004d6089e174fbb2d21b86cc`; re-record both when implementation starts.
- The packaged CLI launches stale `apps/cli/dist` output and rejects `veronica-media source-pack validate`; the source command exists. The `tsx` CLI fails with `listen EPERM` on its IPC socket.
- Existing plans cover 54/54 current source hashes, but they were reused rather than freshly executed.
- All 36 Shorts use `hook,evidence,example,contrast,resolution,evidence,example,contrast,payoff`.
- Current artifacts contain 432 instances of `it is not a decorative restatement`, 177 of `changes whether an expert is understood and chosen`, and 177 of `A buyer observes how`.
- All 486 prompts contain an invented `evidence artifact` prop; the producer uses the first semantic token rather than a concrete source-backed object.
- 39/54 stories contain nine distinct subject descriptions across nine scenes.
- Thumbnail planning collapses to seven concepts; one is reused by 31 stories.
- 35/36 Shorts exceed 225 words, 21 exceed 230, 18 exceed 232, and 8 contain at least 235 words.
- Every Long has nine base assets; motion-event cadence does not independently prove base-state or semantic novelty.
- Portfolio-template hypothesis D is modified: the symbolic-metaphor/opening grammar appears in 54/54 stories; client-decision and its associated camera/environment appear in 28/54, not 54/54.

The fresh pre-fix run created in Task T02 becomes the authoritative before-state. Existing reused artifacts are supporting evidence only.

## Architecture and public contracts

### Runtime and CLI

- Extend runtime fingerprints to domain, strategic-reinvention, and CLI packages.
- Require verified fingerprints before every `veronica-media source-pack` command so stale builds fail with an explicit rebuild instruction before obsolete Commander parsing.
- Add `veronica-media source-pack plan-english` backed by a reusable portfolio service. It always loads canonical v3 English records, disables cache reuse in fresh mode, isolates story failures, and writes a zero-provider ledger.
- The run envelope records source hash, planner/schema/policy versions, runtime planner hash, portfolio-context hash, plan hash, validation result, provider requests, attempted dispatches, and paid cost.

### Canonical plan V3

- Add `PositioningVisualPlanV3`; retain V2 parsing only for inspection and an explicit `REPLAN_REQUIRED` result. Provider-readiness paths accept V3 only.
- Each V3 scene requires a hashed exact narration span, narrative function, finalized semantic proposition, visible thesis, communication intent, continuity group, transition relationship, evidence need, and explicit subject role/identity when a person is required.
- Reuse existing proposition, treatment, visible-thesis, and continuity concepts rather than creating a second semantic authority. Legacy convenience fields become derived projections.
- Add explicit visual states. Timeline events reference both `assetId` and `visualStateId`; semantic novelty uses the state's source-grounded claim hash.
- Bump planner/schema/policy versions and include them, the source hash, and portfolio-context hash in plan/cache identities.

### Typed findings

Individual and portfolio findings carry code, severity, story IDs, optional scene/asset IDs, observed value, threshold, message, and remediation boundary. A blocker is an abstention and can never be converted to a generic provider prompt.

## Planner remediation

### Story-derived segmentation and functions

- Remove synthetic cold-open concepts and generic positioning fallbacks.
- Segment narration at proposition/discourse boundaries. Shorts are not forced to nine scenes. Approximately ten-minute Longs target 12–16 semantic visual states.
- Classify narrative function from questions/tension, context, problem, examples, evidence, causal mechanisms, contrasts, objections, decisions, methods, consequences, resolutions, payoffs, and CTAs. Position may break a semantic tie but cannot be the sole input.
- If a proposition or visual mechanism cannot be grounded confidently, emit a typed blocker rather than boilerplate.

### Evidence objects and prompts

- Delete the one-token `${token} evidence artifact` heuristic.
- Select an optional source-backed noun phrase only when it has a concrete head object, relevant modifiers, an evidence span, and an imageable role in the proposition. If no candidate passes, omit the extra prop.
- Block any literal `evidence artifact`, auxiliary/stopword fragment, malformed contraction, unsupported abstraction, lexical corruption, or proposition/prompt mismatch. Findings identify the exact story, scene, and asset.

### Continuity-aware subjects

- Select one story mode: `character-led`, `object-led`, `process-led`, or source-justified `ensemble`.
- Shorts allow one primary and at most one supporting human identity. Longs default to one anchor plus at most two supporting identities.
- Additional identities require explicit montage evidence. Concept-led scenes prefer objects, environments, diagrams, or process states instead of invented professionals.
- Subject description changes under one identity do not count as new people; unrelated identity churn blocks readiness.

### Semantic visual grammar and thumbnails

- Use two deterministic passes: per-story planning ranks only semantically compatible candidates; a stable portfolio coordinator selects among equal-fit candidates with semantic fit first and repetition penalty second.
- Do not randomize adjectives or choose semantically weaker treatments for diversity. Stable story order, candidate IDs, source-span order, and hashes resolve ties.
- Thumbnail concepts require source evidence, central contradiction/consequence, focal person/object, practical or emotional tension, composition, title relationship, and distinction from neighboring episodes. The shared title-relationship principle may remain.

### Novelty accounting

- Report motion cadence, underlying asset/base-state cadence, and semantic-state cadence separately.
- Longs target 12–16 visual states, warn above 45 seconds on one state, and block above 60 seconds. Pushes, pans, or crops do not reset base/semantic novelty.
- One provider asset may support multiple states only when the plan specifies distinct regions/states and each has a different source-grounded claim hash.

## Portfolio validation policy

- Narrative-function signature concentration warns above 35% and blocks above 50% within a format containing at least eight stories.
- Role-specific treatment/camera/environment/composition/subject concentration warns above 40% of stories and blocks above 60%.
- Global exact-field concentration warns above 35% and blocks above 50% of scenes.
- Exact treatment-camera-environment-composition tuples warn above 10% and block above 20% of stories.
- Thumbnail exact duplication warns above two stories and blocks above four. Deterministic token/trigram similarity clusters at `>= 0.82` warn above three and block above five.
- Approved shared editorial brand style and the general title-relationship rule are reported but excluded from duplication blockers.
- Forbidden semantic or prompt fragments block on any occurrence.
- Threshold fixtures must include legitimate shared channel grammar so validation does not optimize for arbitrary uniqueness.

## English Short timing policy

- Preferred range: 215–225 spoken words.
- Actionable warning: 226–230 words.
- Hard blocker: above 230 words; no waivers in this tranche.
- Per the planning decision, edit only the current 21 blockers and target 215–225 words. Preserve the strongest hook, one concrete mechanism/example, and the practical payoff; remove redundant restatements first.
- Leave the 14 warning-only Shorts and the one already-safe Short unchanged. Do not edit Long narration.
- Update the canonical timing policy/manifest to represent preferred, warning, and blocker states. Do not modify non-English narration; retain localization-review status after English hashes change.

## Implementation task ledger

All tasks begin `NOT_STARTED`. A task is complete only when its acceptance evidence is recorded. Do not continue past a provider-ledger violation or a systemic execution blocker.

| ID | Task | Depends on | Acceptance evidence |
|---|---|---|---|
| T00 | Capture branch, HEAD, status, overlapping-file hashes, current review paths, and provider prohibition | — | Baseline ledger exists; unrelated dirty changes are preserved |
| T01 | Fix runtime fingerprint/build verification and add the production English portfolio runner | T00 | Packaged CLI validates v3 and runs without `tsx` IPC; stale builds fail clearly |
| T02 | Execute a fresh pre-fix 54-story zero-provider baseline | T01 | 18/36/54 coverage; fresh plan timestamps/hashes; requests/dispatches/cost all zero |
| T03 | Add focused failing regressions for the seven required defect classes plus thumbnail specificity | T02 | Tests fail for the intended producer/validator reasons before fixes |
| T04 | Add V3 plan/scene/visual-state contracts and V2 inspect-only compatibility | T03 | V3 requires semantic/state fields; V2 cannot cross provider readiness |
| T05 | Replace positional segmentation/functions and generic semantic fallbacks | T04 | Source-grounded business-model and structurally different Short fixtures pass |
| T06 | Replace evidence-token extraction and harden prompt validation | T05 | Invalid examples block; absent evidence objects are omitted; no invented suffix remains |
| T07 | Add continuity modes and subject identity planning | T05 | Short/Long identity limits and justified ensemble exceptions pass |
| T08 | Add semantic candidate ranking, deterministic portfolio coordination, and story-specific thumbnails | T05, T07 | Repeated templates materially decline without semantic drift or nondeterminism |
| T09 | Separate motion, base-state, and semantic novelty metrics | T04, T05 | One raster with many motion events still fails base/semantic novelty when appropriate |
| T10 | Add portfolio validators and thresholds | T06, T07, T08, T09 | Positive and false-positive-control fixtures pass; current universal templates fail |
| T11 | Trim the 21 blocking English Shorts and update timing policy/manifest | T03 | Zero Shorts above 230; all edits listed; 14 warning-only stories preserved |
| T12 | Run focused validation, fresh 54-story V3 planning, and review-pack generation | T06–T11 | All fresh artifacts exist; integrity passes; provider ledger remains zero |
| T13 | Update affected operator/source-pack docs and mandatory reports | T12 | Codex run report and `docs/reports/2026-08-18/veronica-unified-v3-en-semantic-remediation-plan-implementation-report.md` accurately reflect final state |

## Validation budget and commands

- Write and demonstrate the focused regressions before repairing their producers.
- Use at most two grouped Vitest commands: one unit command for planner/evidence/continuity/portfolio/timing/thumbnail/review integrity and one packaged-CLI integration command.
- Run targeted Prettier and ESLint on changed files, then one combined affected-package typecheck for domain, strategic-reinvention, and CLI.
- Rebuild domain, strategic-reinvention, and CLI output; run packaged source validation; run the fresh English planner; self-verify checksums; run ZIP integrity validation.
- Do not run repository-wide tests, builds, snapshot updates, or fixture regeneration. Do not rerun an unchanged failure or weaken assertions.

Required regression scenarios:

1. A business-model narration cannot inherit expert-positioning semantics without source evidence.
2. `are/can/after/isn evidence artifact` and equivalent fragments block with scene/asset IDs.
3. Semantically different Shorts produce supported, non-universal signatures; legitimate shared signatures remain allowed.
4. Dominant treatment/camera/environment/composition/subject/prop/thumbnail patterns trigger typed portfolio findings.
5. One story cannot rotate unrelated people without source-justified ensemble evidence.
6. English Shorts above 230 block; 226–230 warn; 215–225 pass.
7. Motion events on one raster do not count as base or semantic novelty.
8. V2 artifacts remain inspectable but require V3 replanning before provider readiness.
9. Repeated runs over identical inputs produce identical semantic/plan hashes.
10. The packaged runner completes all 54 with zero provider requests, dispatch attempts, and cost.

## Fresh run and review pack

The final run must rebuild all 54 plans with reuse disabled and continue through isolated story failures. It writes per-story success/failure envelopes and a corpus validation result; any corpus omission, network attempt, malformed prompt, hash mismatch, or portfolio blocker makes the command non-zero.

Create a timestamped ZIP containing:

- `README.md`
- `PORTFOLIO-CENSUS.md`
- `SYSTEMIC-FINDINGS.md`
- `BEFORE-AFTER.md`
- `PROVIDER-AUDIT.md`
- `IMPLEMENTATION-CHANGES.md`
- `STORY-ISSUES.json`
- `PORTFOLIO-SUMMARY.json`
- `PORTFOLIO-DIVERSITY.md`
- `TIMING-REPORT.md`
- `STORY-EVIDENCE/`
- `STORIES/`
- `MANIFEST.json`

`BEFORE-AFTER.md` compares the fresh T02 baseline with the fresh V3 run. `TIMING-REPORT.md` covers all 36 Shorts and identifies every changed narration. `MANIFEST.json` hashes every file and validates 54 evidence/source records before ZIP creation.

## Completion states

- `VERONICA_UNIFIED_V3_EN_SEMANTIC_REMEDIATION_READY_FOR_REVIEW`: 54 fresh artifacts, zero provider activity/cost, integrity PASS, and no blockers.
- `PARTIAL_SEMANTIC_REMEDIATION_REVIEW_READY`: complete pack and zero-provider proof, but isolated story-specific blockers remain.
- `BLOCKED_SYSTEMIC_REMEDIATION`: fresh execution, corpus coverage, or the zero-provider guarantee cannot be established.

Planning-ready never authorizes TTS, image generation, remote QA, rendering, publishing, or any paid-media tranche. Independent review of the new ZIP is required first.
