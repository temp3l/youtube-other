# Strategic Reinvention Implementation Plan

Status: active; Task 00 execution gate accepted
Audit: `docs/audits/strategic-reinvention-repository-audit.md`
Decisions: `docs/decisions/strategic-reinvention-decision-register.md`
Task index: `docs/plans/strategic-reinvention-tasks/README.md`

## Objective

Add a reusable `strategic-reinvention` genre and a separate `veronica-benini` creator profile to the canonical Mediaforge workflow. The result must be source-led, Italian-canonical, resumable, auditable, rights-aware, approval-bound, safe for multilingual media production, and incapable of automatic publication.

## Architectural Outcome

### Ownership

- `packages/domain`: strict generic schemas and locale/profile unions; no I/O.
- `packages/shared`: canonical resolver keys, hashing, containment, and atomic persistence primitives.
- `packages/config`: generic genre/profile registries and permission merge semantics.
- `packages/strategic-reinvention`: concrete YAML/JSON configuration, profile policy, task registrations, adaptation/provenance logic, and pilot fixture.
- `packages/workflow-engine`: DAG, approval evaluation, invalidation, events, resume, and reconciliation.
- Capability packages: generic localization, visual, speech, metadata, rendering, and publishing operations.
- `apps/cli`: composition, approval commands, operator output, and compatibility delegation.

### Canonical Storage

```text
episodes/<id>/
  blueprint.json
  sources/
    manifests/<source-id>.json
    content/<source-id>/...
  languages/
    script-it.md
    script-en.md
    short/script-it.md
    short/script-en.md
  state/workflow/<workflow-id>/
    state.json
    events.jsonl
    approvals.json
    runs/...
  locales/<locale>/<variant>/
    provenance/...
    audio/...
    subtitles/...
    metadata/...
    composition/...
    renders/...
    packages/...
```

All paths are selected through `createEpisodePathResolver`/`ArtifactRef`. Existing legacy paths are readable compatibility candidates, never strategic write targets.

### Target DAG

```text
source-manifest -> rights/sensitivity gate -> source approval -> blueprint
  -> source-led adaptation -> provenance/first-person/premium validation
  -> canonical Italian script approval
  -> Italian Short extraction and approval
  -> per-locale localization -> terminology/provenance QA -> localization approval
  -> per-locale voice/captions/metadata/CTA -> voice/metadata approval
  -> independent 16:9 and 9:16 visual plans -> likeness/media-rights gate
  -> render -> render QA approval
  -> multilingual package/capability report
  -> exact publish approval -> idempotent upload/reconciliation
```

Source changes invalidate all downstream tasks. Metadata-only changes invalidate metadata, package, and publish evidence but not render. Voice or visual changes invalidate affected locale renders and publication evidence.

## Public Contract Changes

- `ContentLocale` adds `it`.
- `ContentProfileId` adds `strategic-reinvention`.
- Add `GenreDefinition`, `CreatorProfile`, `EffectiveContentPolicy`, `ContentSourceManifest`, `EpisodeBlueprint`, provenance-report, multilingual-package, and scoped-approval schemas.
- Add `GenreRegistry`, `CreatorProfileRegistry`, and `resolveEffectiveContentPolicy`.
- Extend approval records for named gate/scope and distinct reviewer evaluation while retaining v1 readers.
- Add artifact kinds/resolver methods for sources, blueprint, reports, compositions, audio-track manifests, capability reports, and upload packages.
- Add `mediaforge approvals status|grant|reject|revoke` with `--json` support.

## Execution Waves

| Wave | Tasks      | Parallel safety                       | Merge barrier                                                                  |
| ---- | ---------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| 0    | 00         | Lead only                             | Decisions and worktree baseline accepted                                       |
| 1    | 01, 02     | Parallel                              | 01 owns domain/shared; 02 owns security/remote boundaries                      |
| 2    | 03         | Sequential integration                | Locale/contracts and safety foundations merged                                 |
| 3    | 04, 05, 06 | Parallel                              | Disjoint source, workflow approval, and visual packages                        |
| 4    | 07, 08     | Parallel                              | Adaptation owns strategic text; locale media owns localization/speech/metadata |
| 5    | 09         | Sequential integration                | Approval, visual, adaptation, and locale media contracts stable                |
| 6    | 10         | Sequential irreversible-boundary work | Canonical workflow integration merged                                          |
| 7    | 11, 12     | Parallel                              | Pilot files and documentation are disjoint                                     |
| 8    | 13         | Lead only                             | All task branches integrated and worktree clean                                |

Agents must not begin the next wave until the lead agent integrates the preceding wave, resolves contradictions, and records the checkpoint. Parallel agents receive exclusive ownership from their task brief; cross-owner changes require lead reassignment.

## Phases And Checkpoints

### Phase A: Decisions and characterization

- Task 00 finalizes evidence gates and baseline.
- Commit: `docs: finalize strategic reinvention execution gate`

### Phase B: Shared foundations

- Tasks 01-03 add Italian, domain/path contracts, security prerequisites, registries, and concrete profile configuration.
- Checkpoints:
  - `feat(domain): add Italian strategic content contracts`
  - `fix(safety): harden telemetry remote render and cli freshness`
  - `feat(profile): register strategic reinvention policy`

### Phase C: Provenance, approvals, and visual policy

- Tasks 04-06 add source rights, durable scoped approvals, and editorial-documentary planning.
- Checkpoints:
  - `feat(source): add rights-aware content manifests`
  - `feat(approval): add scoped creator workflow approvals`
  - `feat(visuals): add editorial documentary composition plans`

### Phase D: Content and media pipeline

- Tasks 07-09 add source-led adaptation, Italian/multilingual media support, and canonical task integration.
- Checkpoints:
  - `feat(strategy): add source-led adaptation provenance`
  - `feat(locale): add Italian multilingual media support`
  - `feat(workflow): register strategic reinvention pipeline`

### Phase E: Publishing safety

- Task 10 wires capability-gated, approval-bound, reconciled publication.
- Commit: `fix(publish): enforce strategic approval and reconciliation`

### Phase F: Pilot, docs, and release evidence

- Tasks 11-13 add the mocked pilot, operator documentation, bounded verification, and required reports.
- Checkpoints:
  - `test(strategy): add deterministic Veronica pilot`
  - `docs: add strategic reinvention operator guidance`
  - `chore(strategy): record strategic implementation evidence`

## Migration And Compatibility

- Add Italian to generic unions without adding it to existing profile default locale sets.
- Parse supplied schema v1.0 and normalize to canonical v1.1; do not silently rewrite source files.
- Use new workflow instances for Strategic Reinvention rather than reinterpreting legacy stories manifests.
- Read legacy artifact candidates in a fixed order, reject ambiguity, and write only canonical strategic paths.
- Route strategic publishing only through the generic publisher; legacy upload remains available to existing profiles until separately migrated.
- Keep `autoPublish` false and live creator publication blocked until the decision register's evidence exists.
- Do not track or hand-edit `dist`, episode outputs, state, generated assets, or AI-context generated files.

## Verification Strategy

Each task runs its directly affected test file first, at most three distinct test commands, and at most one affected-package typecheck. No paid provider calls, broad test runs, builds, snapshot updates, fixture regeneration, migrations, or uploads are authorized by this plan.

Required acceptance coverage:

- six-locale exhaustive contracts and full/Short resolver paths;
- registry parsing, duplicate IDs, schema import, and permission intersection;
- rights/use/locale/commercial/expiry and premium-leakage matrices;
- beat/source, first-person, claim, quote, and unsupported-inference validation;
- approval fingerprinting, invalidation, revocation, and distinct reviewers;
- independent aspect compositions and pre-dispatch voice/likeness blocks;
- localization provenance, protected terms, captions, metadata, and CTA;
- multilingual audio capability outcomes;
- missing/stale publish approval, ambiguous upload reconciliation, and dedupe;
- partial resume and source-change invalidation;
- argv/curl/header/content redaction, remote schema rejection, and stale CLI detection;
- deterministic mocked Italian full + Short with English and Spanish localization.

## Completion And Reporting

Because implementation executes this file under `docs/plans/`, every execution must maintain:

```text
docs/reports/<YYYY-MM-DD>/strategic-reinvention-implementation-plan-implementation-report.md
```

Each modifying task also creates its normal `docs/reports/codex-runs/<date>-<task>.md` report. The lead agent owns the final implementation report, task completion matrix, deviations, test evidence, known risks, and next steps.

Implementation is complete only when all task acceptance criteria pass, the worktree contains no unintended generated changes, production publication remains blocked without external evidence, and the lead has reconciled all parallel branches.

## Execution Checkpoints

### Task 00 — 2026-08-01

- Branch and audited HEAD confirmed: `feat/strategic-reinvention-veronica` at `2bc65f7157ddcdf850b47f664e39b87396100ac9`.
- Node `v24.18.0`, pnpm `10.16.0`, workspace dependencies, and the focused-test wrapper are available.
- Current baseline: 68 focused tests passed across three bounded commands.
- No operator rights, activation, reviewer, offer, channel, or provider evidence was received; all named blocks remain fail-closed.
- Wave 1 ownership: Task 01 exclusively owns `packages/domain` and `packages/shared`; Task 02 exclusively owns observability, process execution, remote-render validation, and CLI doctor freshness paths listed in its brief. Cross-owner edits require lead reassignment.
