# Veronica autonomous pre-production orchestrator plan

## Summary

Current phase ledger:

- Source-of-truth closure: **PARTIAL** — deterministic v2 resolver works, rejects legacy fallback, and validates 18/18/36/54; pack identity is still hard-coded to v2.
- Multilingual v3: **NOT_STARTED** — no `veronica-unified-content-pack-v3` directory exists.
- Canonical promotion: **NOT_STARTED** — canonical selector remains v2.
- Audiovisual planning: **NOT_STARTED** for the target corpus; older artifacts are historical candidates without v3 identity.
- Combined review pack: **NOT_STARTED**.
- Current strict validation: **FAIL** — 30 story translation sets missing (54 story-locale records) and 22 French timing violations. The reported 52 stale translations will be recomputed from source hashes before remediation.
- Worktree: extensively dirty with user-owned Veronica changes. Treat its current bytes—not HEAD—as the implementation baseline; never reset, clean, overwrite, or commit them.

Execution continues automatically across passing gates and stops only for a genuine blocker or a verified final ZIP.

## Implementation changes

### 1. Canonical and multilingual v3

- Capture HEAD, branch, status, overlapping-file hashes, existing reports, and legacy-plan inventory in the run report before edits.
- Extend the controlled pack-ID type to admit only v2 and v3. Add candidate-aware resolution through `validateVeronicaContentSource({ packId })` and CLI `--pack-id`; default resolution remains the single canonical selector with no path, locale, directory-order, or legacy fallback.
- Freeze all 54 v2 English files into `publication-review-v3/english-hash-preservation.json`, recording story/episode/variant/path, raw SHA-256, normalized content hash, word count, and deterministic duration.
- Mechanically create v3 from v2, preserving all English bytes, episode assignments, story IDs, titles, order, and provenance. v2 remains untouched.
- Build an initial 324-row localization matrix. Derive prior `sourceEnglishHash` from the exact lineage source associated with each inherited localization; unverifiable lineage is treated as stale, never fresh. Recompute missing and stale counts before editing.
- Translate every missing record directly from v2 English and surgically synchronize stale records. Use contemporary Brazilian Portuguese/`você`, which is the dominant documented corpus convention.
- Remediate every French timing failure through semantic compression, not WPM changes. Apply the centralized Long 570–630-second and established Short word-band policies.
- Review all 270 non-English records locally through the five requested editorial personas. Persist concise findings and the weighted rubric under the truthful label `AI editorial certification`; `overallScore` must be strictly greater than 9.5 with no critical semantic/naturalness defect.
- Make `localization-matrix.json` authoritative. Generate its CSV, ratings projection, timing JSON/CSV, remediation ledger, per-locale portfolio reviews, manifest diff, changed-file inventory, README, and checksums from it.
- Extend the v3 manifest with parent-pack identity and a hash-bound multilingual certification block. Strict candidate validation must prove 324/324 records, zero missing/stale/timing/quality/hygiene/security failures, and 54/54 raw plus normalized English preservation.
- Promote by changing only the canonical selector from v2 to v3 after candidate PASS. Immediately re-resolve and rerun strict validation plus resolver tests. On failure, restore only that selector to v2 and retain the v3 candidate.

### 2. Portfolio audiovisual planning

- Add `veronica-portfolio-story-plan.v1` as an envelope over the existing `PositioningVisualPlanV2`, `PlannedScene`, and `VisualBeatTreatmentV1` ontology—no competing scene/beat model.
- Bind each plan to pack/story/episode/variant, canonical English hash, six localized hashes, schema/policy versions, and a deterministic `planHash`. Exclude timestamps, paths, cache hits, latency, and runtime telemetry from hashes.
- Keep English as semantic authority. Create six provisional locale timing maps by complete narration-span alignment and deterministic beat weighting; each map binds only its localized hash and becomes stale independently.
- Extend Long planning with multiple narration-grounded beats per scene so information changes generally land in the existing 6–15-second guidance. Keep Shorts as independently planned 9:16 stories, normally 5–9 scenes.
- Annotate existing beats with actor/action owner, object, environment, before/after state, grounding/metaphor classification, composition, asset mode, cost class, reuse relationship, hero role, and generation-readiness status.
- Inventory old Veronica plans as historical, stale, conflicting, or reusable candidates. Reuse only exact story mappings with matching English hashes, valid semantics, and compatible provenance; otherwise replan.
- Run story, sequence, episode-triplet, and portfolio QA. Critical failures include identity/hash errors, missing coverage, actor/state inversion, source-domain loss, semantic drift, invalid metaphor, broken timing maps, and missing hook/payoff mechanics.
- Permit at most two recorded automatic repair passes per story. Remaining critical failures become `NOT_ELIGIBLE` and block the terminal READY status; noncritical diversity or continuity warnings may become `REVIEW_REQUIRED`.
- Produce portfolio metrics for compositions, environments, actions, treatments, monotony patterns, local-only opportunities, reuse graph, and future LOW/MEDIUM/HIGH cost classes. All authorization fields remain false.

### 3. Review artifacts and reporting

- Write plans and review output beneath `artifacts/veronica-portfolio-planning/<UTC-run-id>/veronica-portfolio-planning-review-v3/`.
- Include the requested README, summaries, CSV ledgers, systemic findings, diversity, cost, reuse, locale timing, generation eligibility, and 54 JSON/Markdown story pairs, plus `MANIFEST.json`, `SHA256SUMS.txt`, and a zero-provider ledger.
- Generate Markdown/CSV only from authoritative JSON. Reject symlinks, unsafe paths, absolute-path leakage, credential-like content, malformed UTF-8, placeholders, and instructions embedded in narration.
- Normalize archive timestamps, sort entries, create the ZIP with stripped extra metadata, verify checksums, and run `unzip -t`.
- Update only affected source-of-truth/operator documentation and create `docs/reports/codex-runs/2026-08-18-veronica-autonomous-preproduction-orchestrator.md` with changed paths, checks, results, risks, follow-ups, and unchanged HEAD. No commit is required.

## Public interfaces

- Controlled `VeronicaContentPackId` gains v3; canonical identity resolves to v3 only after promotion.
- Content validation gains explicit `packId`/`--pack-id` candidate selection and strict certification results.
- New typed contracts cover localization records/certification, portfolio story plans, locale timing maps, QA findings, asset/cost modes, reuse edges, and readiness.
- Add local-only CLI operations for portfolio planning, validation, and review-pack creation. They must not import or dispatch provider adapters.

## Test and acceptance plan

- First run the focused canonical resolver test.
- Use at most two additional Vitest commands: one grouped unit run for localization/planning/QA/ZIP contracts and one full-corpus integration test using temporary paths and fail-on-call provider fakes.
- After focused tests pass, run one affected-package typecheck for domain, strategic-reinvention, and CLI; then scoped ESLint.
- Operational acceptance runs:
  - explicit v3 strict validation before promotion;
  - canonical and strict validation after promotion;
  - 18/18/36/54/324 coverage and triplet checks;
  - English/localized staleness regressions;
  - semantic, continuity, monotony, hook/payoff, locale-map, and provider-safety checks;
  - `git diff --check`;
  - manifest/checksum verification and `unzip -t`.
- Respect the repository’s retry budget: no unchanged failing reruns, no weakened assertions, and stop with an exact blocker ledger when repair limits are exhausted.

## Assumptions and terminal rules

- v2 English is immutable; any unexpected 54/54 hash mismatch stops the run.
- Existing dirty work is user-owned and must be preserved through targeted patches.
- Historical provider activity is not part of this run; the new run-scoped ledger must remain exactly zero.
- `VERONICA_PORTFOLIO_PLANNING_READY` requires canonical v3, strict multilingual PASS, 54 plans, zero critical QA failures, verified review directory/ZIP, and zero provider calls.
- Planning-ready does not authorize image, TTS, video, publishing, paid QA, or any other external generation.
