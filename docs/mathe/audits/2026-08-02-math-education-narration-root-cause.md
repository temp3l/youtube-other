# Math education narration root-cause audit

Date: 2026-08-02  
Scope: deterministic Grade-5 `M5-DZ-001` narration path; no production artefacts changed.

## Findings

### FACT — pipeline map

| Stage | Source / schema / persisted artefact | Version, validation, operational evidence |
| --- | --- | --- |
| Curriculum → objective | `packages/math-education/data/curriculum/v1/skills.json`; curriculum import and prerequisite tasks | Task registry: `packages/math-education/src/task-registry.ts:231-283`; reviewed release/provenance gate. |
| Lesson specification | `domain/lesson.ts:460-499`; `lesson-spec.v1` | Runtime schema validates structural facts, scenes and tasks; content producer is `lesson/data-diagrams-standard-content.ts`. |
| Canonical facts / verification | `verification/protocol-schemas.ts`; verifier response | `math-verifier.v3`, SymPy adapter, fact-coverage assertion (`canonical-task-adapters.ts:1120-1140`). |
| Narration and display | `localization/localization.ts:73-107`; `math-narration.v2` | Fact-token ordering is validated (`:342-371`); German review checks text presence (`narration-review.ts:63-176`). |
| Speech / TTS text | `lesson/educational-speech-sync.ts:23-37`; `speech/educational-speech-planning.ts:660-699` | Speech plan preserves display, original spoken, normalized spoken and TTS text. |
| Timing / subtitles / visual plan | `lesson/timing.ts`; `orchestration/artifact-schemas.ts:57-102` | `math-timing.v1` has scene/cue timing; visual plan records scene fact IDs only. |
| Render / quality / metadata | `canonical-task-adapters.ts:1386-1740`; `orchestration/quality-gate.ts` | Renderer evidence, `math-quality.v2`, then metadata and dry-run publish. |

Persisted workflow state is `math-workflow.v2`, validates ordered lineage and quarantines corrupt manifests (`orchestration/workflow.ts:149-290`). Batch execution checkpoints and retries (`orchestration/batch.ts:116-190`). Cache fingerprints include profile, curriculum, verifier and renderer inputs (`profile-bindings.ts:10-90`), but have no narration-compiler or number-verbalizer version. Stage invalidation is a dependency cascade (`workflow-invalidation.ts:8-52`). Structured math telemetry carries stage, version, attempt, duration and cache decision with redaction (`packages/observability/src/math-telemetry.ts:4-175`).

### FACT — exact leak and raw-value trace

`M5-DZ-001` is the declared objective “Daten in Ur- und Strichlisten erfassen” (`lesson/data-diagrams-standard-content.ts:67-77`). The same source creates category-free tuple facts for `4, 3, 5` and `6, 4, 5` (`:35-43`, `:76-77`), embeds the supplied leaked wording verbatim in task steps (`:98-109`), and embeds “geprüfte Ergebnis” in formative copy (`:121-122`).

Default German templates add “geprüftes Modell”, generic signs/units instructions, and “geprüften Darstellung” (`localization/localization.ts:109-165`, `:201-259`). `reviewedNarrationInstruction` itself replaces a fact marker with “die eingeblendete geprüfte Darstellung” (`:37-42`). The review then requires every authored task-step explanation to be present in learner narration (`localization/narration-review.ts:80-98`), so it protects the defect rather than detecting it.

Tuple formatting joins values as comma-separated expressions (`localization/locale-formatter.ts:181-198`, `:228-234`); category labels are not part of the fact semantic type. The localized segments substitute that spoken text (`localization/localization.ts:330-369`), and the education speech planner forwards it through normalization and pronunciation into `ttsText` (`packages/speech/src/educational-speech-planning.ts:660-699`). Thus raw arrays can reach speech without semantic context. German integer words for 12 and 15 are otherwise correctly implemented (`locale-formatter.ts:30-118`, `:180-245`); digit-by-digit output is therefore not caused by this math formatter.

### FACT — why prior gates missed it

The lesson schema checks IDs, ordering, fact references, answer identity and a nine-scene structure (`lesson/production-content.ts:109-299`), not pedagogical coverage or natural learner copy. The localization review checks literal inclusion, fact-token identity, questions and word count (`narration-review.ts:76-145`), not internal vocabulary, semantic category/value binding or grade language. Quality gates are evidence/status-derived (`quality-gate.ts:14-126`); the production adapter sets timing, final media, publish packet, content review and minor review ready without educational semantic checks (`canonical-task-adapters.ts:1534-1614`). Visual plans bind only fact IDs (`artifact-schemas.ts:57-102`) and timing binds cue counts (`lesson/timing.ts:125-231`), so neither proves that a narrated value has a visible label or that objective concepts are taught.

### FACT — active duplicate or divergent paths

- Canonical workflow: `orchestration/canonical-task-adapters.ts`.
- Direct CLI speech/generation: `apps/cli/src/math-commands.ts:317-457`, `:493-553`, `:2430-2445`.
- CLI canonical operator/runtime: `apps/cli/src/math-workflow-runtime.ts:384-450`.
- Pilot simulation: `orchestration/pilot-simulation.ts:275-365`.

Each independently invokes lesson building, localization and/or timing. `apps/cli/src/workflow-commands.ts` composes the canonical operator. The API accepts a mathematics profile (`apps/api/src/contract.ts:21-43`), but this audit found no math-specific API executor; its durable worker deliberately accepts an injected generic handler (`apps/api/src/job-process.ts:135-180`). `packages/application/src/legacy-cli-composition.ts:1-18` is a transitional registry adapter.

### INFERENCE — affected package boundary

Primary repair surfaces are `packages/math-education`, `packages/math-rendering`, `packages/educational-renderer` and math CLI integration. `packages/speech` needs an opt-in math adapter for content-surface separation; a shared number verbalizer is a separate, cross-genre change and must first be characterized for non-math callers.

### RECOMMENDATION — Batch 1 ownership

| Owner | Exclusive file area |
| --- | --- |
| A — architecture | domain/artifact content-boundary contracts, ADRs, this audit, migration design |
| B — didactic compiler | data-diagram canonical semantics, grade profiles, objective coverage |
| C — narration/TTS | learner-copy compiler, denylist/naturalness lint, number verbalizer boundary |
| D — visual synchronization | instructional scene/display semantic mapping and renderer validation |
| E — QA | semantic validators, quality report, fixtures and characterization tests |
| F — workflow | task registration, cache versions, CLI, migration commands, telemetry |

### UNRESOLVED

- Whether a production API math executor exists outside this repository was not established.
- Existing historical lesson artefacts were not inspected or mutated; their compliance requires a separate revalidation command and report.
- Cross-genre normalized-number impact requires characterization fixtures before any shared implementation decision.
