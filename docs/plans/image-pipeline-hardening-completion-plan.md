# Image Pipeline Hardening Completion Plan

## 1. Executive summary

The repository now has meaningful progress on image-pipeline hardening, but it does not yet fully satisfy the requirements in `todo-prompts/image-hardining.md`.

Confirmed strengths already in place:

- canonical generated scene images now resolve to `shared/images/generated/`;
- legacy `state/image-generation/images/` can still be hydrated during migration;
- typed visual-plan validation exists;
- renderability and image reuse behavior exist;
- the CLI singular `episode resume-images` path is documented and tested.

Confirmed remaining gaps:

- no repository-local architecture review and decision-log deliverable for the full prompt;
- the image pipeline still constructs several paths locally instead of using one canonical resolver;
- the shared resolver still exposes a legacy `generatedImage()` write path;
- narration and visual planning are still too tightly coupled in fallback builders;
- character continuity matching is still heuristic substring matching, not a typed resolver;
- `--concurrency` is parsed but not implemented as real multi-scene execution control;
- prompt-difference handling still uses synthetic shot/camera rotation as a fallback;
- persisted manifests do not yet record the full audit/failure data requested by the prompt;
- the public image CLI surface is still broader and less predictable than the target shape.

This plan closes those gaps without discarding the working parts already present.

## 2. Target outcomes

Completion means the repository has:

1. one canonical image artifact contract;
2. one typed path-resolution layer for image assets and state;
3. a clean separation between narration beat, visual plan, and provider request;
4. deterministic validation and difference checking without synthetic scene churn;
5. explicit character continuity resolution rules;
6. real concurrency and retry semantics;
7. complete audit records for planning and generation attempts;
8. CLI docs and command help that cannot drift from the real registry;
9. repository-local planning documents covering architecture review, decisions, migration, and tasks.

## 3. Required planning deliverables

The prompt asked for planning artifacts before or alongside implementation. The following docs should exist by the end of this effort:

- `docs/architecture/image-pipeline-hardening-review.md`
- `docs/decisions/009-image-artifact-layout.md`
- `docs/decisions/010-image-reuse-and-ownership.md`
- `docs/plans/image-pipeline-hardening-completion-plan.md`
- `docs/tasks/image-pipeline-hardening-tasks.md`

This file is the execution plan. The other documents are explicit deliverables in the tasks below.

## 4. Ordered phases

1. Characterize the current image pipeline and write missing review/decision docs.
2. Freeze the canonical artifact layout and path ownership model.
3. Finish the typed planning model split.
4. Replace remaining weak prompt-construction heuristics.
5. Finish character continuity resolution.
6. Remove synthetic difference generation and harden semantic comparison.
7. Implement real concurrency, retry, and atomic state coordination.
8. Expand observability and persisted failure records.
9. Simplify the CLI surface and make documentation executable.
10. Complete migration and downstream-consumer alignment.

## 5. Task list

### P0 tasks

#### IMG-001 - Write the missing architecture review

- Priority: `P0`
- Problem:
  The prompt explicitly required a repository-local architecture review, but the repository does not yet contain one dedicated to the image hardening effort.
- Scope:
  Create `docs/architecture/image-pipeline-hardening-review.md`.
- Implementation notes:
  Document current pipeline, current data flow, current artifact flow, root causes, correctness risks, performance risks, reliability risks, maintainability risks, target architecture, and rejected alternatives.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/shared/src/episode-filesystem.ts`
  - `packages/rendering/src/index.ts`
  - `apps/cli/src/images-resume-command.ts`
  - `docs/episode-image-generation.md`
- Acceptance criteria:
  - review uses concrete file paths and symbols;
  - review explicitly explains why the current partial implementation does not fully satisfy the prompt;
  - review contains a producer/consumer artifact map.
- Tests:
  - none beyond doc review;
  - optional snapshot-style documentation lint if the repo adds one later.
- Dependencies:
  - none.
- Migration concerns:
  - none.
- Rollback considerations:
  - revert the doc file only.
- Risk level:
  - low.

#### IMG-002 - Record canonical image artifact layout decision

- Priority: `P0`
- Problem:
  The code now prefers `shared/images/generated/`, but the full ownership/lifecycle/deletion contract is not written down as a decision.
- Scope:
  Create `docs/decisions/009-image-artifact-layout.md`.
- Implementation notes:
  Explicitly answer:
  - whether scene images are canonical assets;
  - whether `state/` may contain final binaries;
  - which paths are safe to delete and regenerate;
  - which paths are consumed by rendering;
  - which paths are migration-only compatibility locations.
- Affected modules or search targets:
  - `packages/shared/src/episode-filesystem.ts`
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/rendering/src/index.ts`
- Acceptance criteria:
  - the decision declares `shared/images/generated/` canonical or explicitly chooses another path;
  - the decision defines `state/image-generation/` as metadata-only or documents exceptions;
  - the decision includes a concrete directory tree.
- Tests:
  - add or update resolver tests after the decision is implemented.
- Dependencies:
  - `IMG-001`.
- Migration concerns:
  - must preserve readable legacy state-image paths for at least one compatibility phase.
- Rollback considerations:
  - revert the decision doc only.
- Risk level:
  - low.

#### IMG-003 - Replace scattered image path helpers with one typed image artifact resolver

- Priority: `P0`
- Problem:
  The shared resolver exists, but the image pipeline still hardcodes local path builders, and the shared `generatedImage()` method still points to the legacy state path.
- Scope:
  Move all image path ownership into `@mediaforge/shared`.
- Implementation notes:
  Add explicit resolver methods for:
  - image visual plan JSON;
  - image prompt text;
  - image manifest JSON;
  - canonical generated scene image;
  - legacy generated image fallback;
  - character registry;
  - character reference image;
  - image checkpoint / failure record / response record.
- Affected modules or search targets:
  - `packages/shared/src/episode-filesystem.ts`
  - `packages/shared/src/episode-filesystem.unit.test.ts`
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/rendering/src/index.ts`
  - `apps/cli/src/episode-image-summary.ts`
- Acceptance criteria:
  - no image-generation command or service manually concatenates episode image paths;
  - `generatedImage()` resolves to the canonical location, not the legacy state path;
  - legacy image paths remain readable through explicit compatibility methods, not canonical write methods.
- Tests:
  - resolver path tests;
  - path traversal prevention tests;
  - legacy candidate path tests;
  - downstream rendering path resolution tests.
- Dependencies:
  - `IMG-002`.
- Migration concerns:
  - preserve old state-image read compatibility;
  - do not silently delete legacy files.
- Rollback considerations:
  - keep a compatibility wrapper commit ready because this touches many consumers.
- Risk level:
  - medium.

#### IMG-004 - Persist a complete image audit record schema

- Priority: `P0`
- Problem:
  Current manifests are too thin for the requested auditability and failure analysis.
- Scope:
  Add typed persisted records for planning and generation attempts.
- Implementation notes:
  Add or split artifacts such as:
  - `visual-plans/<sceneId>.json`
  - `provider-requests/<sceneId>.json`
  - `provider-responses/<sceneId>.json`
  - `failures/<sceneId>.json`
  - `checkpoints/<sceneId>.json`
  Keep secrets out of persisted records.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/observability/src/telemetry.ts`
  - `apps/cli/src/scene-inspect-output.ts`
- Acceptance criteria:
  - every scene attempt has persisted planning input, validated plan, provider request metadata, retryability, duration, output path, and checksum;
  - provider auth headers or raw secrets are never written;
  - persisted records use typed schemas and schema validation.
- Tests:
  - manifest schema round-trip tests;
  - failure record persistence tests;
  - secret-redaction tests.
- Dependencies:
  - `IMG-003`.
- Migration concerns:
  - existing scene manifests must remain readable;
  - additive schema versioning only.
- Rollback considerations:
  - preserve backward-compatible readers during rollout.
- Risk level:
  - medium.

#### IMG-005 - Implement real scene-generation concurrency control

- Priority: `P0`
- Problem:
  `--concurrency` is parsed but scene generation still runs sequentially.
- Scope:
  Introduce bounded parallel execution for scene planning and generation with atomic manifest writes and deterministic ordering where required.
- Implementation notes:
  Separate:
  - plan concurrency;
  - provider concurrency;
  - import or postprocessing concurrency.
  Use a queue or pool instead of naive `Promise.all`.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `apps/cli/src/images-resume-command.ts`
  - `apps/cli/src/episode-commands.ts`
- Acceptance criteria:
  - `OPENAI_IMAGE_CONCURRENCY` and CLI `--concurrency` actually bound provider calls;
  - manifests remain uncorrupted under concurrent generation;
  - one scene failure does not block unrelated scenes unless required by the reuse policy.
- Tests:
  - concurrent generation integration test;
  - manifest corruption regression test;
  - partial failure and resume test.
- Dependencies:
  - `IMG-003`, `IMG-004`.
- Migration concerns:
  - reuse chains and merge-with-next behavior must stay deterministic.
- Rollback considerations:
  - keep a feature flag or internal toggle for serial fallback during rollout.
- Risk level:
  - high.

### P1 tasks

#### IMG-006 - Remove narration-as-fallback source of truth from visual fields

- Priority: `P1`
- Problem:
  Focal subject, visible action, and environment still fall back to raw narration too aggressively.
- Scope:
  Make `SceneVisualPlan` a concrete interpretation layer rather than a thin narration projection.
- Implementation notes:
  Replace direct narration-copy fallbacks with:
  - field-specific repair strategies;
  - concrete evidence-shot inference;
  - typed unresolved-plan issues when a concrete visual cannot be established.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/domain`
  - `docs/episode-image-generation.md`
- Acceptance criteria:
  - provider prompts do not directly echo narration unless explicitly justified;
  - generic fields do not silently collapse into copied narration text;
  - unresolved visuals are surfaced as typed plan issues instead of hidden fallback prose.
- Tests:
  - narration non-copy regression tests;
  - abstract beat repair tests;
  - prompt compactness tests.
- Dependencies:
  - `IMG-001`, `IMG-004`.
- Migration concerns:
  - prompt hashes will change; document one-time regeneration impact.
- Rollback considerations:
  - retain the old planner behind a short-lived compatibility flag only if necessary.
- Risk level:
  - medium.

#### IMG-007 - Introduce a typed `ImageProviderRequest` artifact and renderer

- Priority: `P1`
- Problem:
  The code has `SceneNarrativeBeat` and persisted visual plans, but not a first-class typed provider request artifact.
- Scope:
  Add a typed provider-request model between visual planning and OpenAI request execution.
- Implementation notes:
  Keep provider-specific options out of the visual plan and diagnostics out of the provider prompt.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/image-generation/src/index.ts`
- Acceptance criteria:
  - prompt string rendering is pure output from a typed provider request object;
  - cache keys can distinguish visual-plan hash from provider-request hash.
- Tests:
  - request renderer unit tests;
  - request hash stability tests.
- Dependencies:
  - `IMG-004`, `IMG-006`.
- Migration concerns:
  - old prompt files remain readable for one compatibility cycle.
- Rollback considerations:
  - preserve manifest readers for prior prompt-only records.
- Risk level:
  - medium.

#### IMG-008 - Replace synthetic shot/camera rotation with semantic repair rules

- Priority: `P1`
- Problem:
  Current difference repair still manufactures uniqueness by rotating shot size and camera angle.
- Scope:
  Remove artificial `rewriteForDifference()` behavior and replace it with semantic repair or explicit merge decisions.
- Implementation notes:
  If two scenes differ only by weak cinematic fields:
  - merge them;
  - reuse the prior image;
  - promote one with a stronger evidence/reaction anchor;
  - or raise `NON_MATERIAL_SCENE_DIFFERENCE`.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- Acceptance criteria:
  - scenes are not made “different” by camera rotation alone;
  - repeated scenes are either merged, reused, or semantically repaired;
  - no prompt contains synthetic “in a different pose” churn unless justified by scene content.
- Tests:
  - fake-difference regression tests;
  - overlap false-positive and false-negative fixtures.
- Dependencies:
  - `IMG-006`, `IMG-007`.
- Migration concerns:
  - regeneration likely for affected scenes.
- Rollback considerations:
  - none beyond normal revert.
- Risk level:
  - medium.

#### IMG-009 - Implement typed character continuity resolution

- Priority: `P1`
- Problem:
  Character matching is still substring-based and does not robustly cover aliases, collectives, or omissions.
- Scope:
  Add a dedicated resolver for recurring character detection.
- Implementation notes:
  Support:
  - canonical names;
  - aliases;
  - role labels;
  - collective labels such as “the children”;
  - graceful handling of unresolved pronouns;
  - explicit failure or degradation policy when a known recurring character is missing from the registry.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `apps/cli/src/episode-commands.ts`
  - source character-registry builders in `packages/dark-truth/src/index.ts`
- Acceptance criteria:
  - scenes that mention recurring characters do not quietly emit empty `characterIds`;
  - collective identities can map to known registry entries when configured;
  - unresolved recurring-character cases surface as typed issues.
- Tests:
  - alias resolution tests;
  - collective identity tests;
  - missing recurring character tests;
  - Noah / children regression fixtures.
- Dependencies:
  - `IMG-006`.
- Migration concerns:
  - existing registry shape may need backward-compatible optional alias fields.
- Rollback considerations:
  - alias fields should be additive, not breaking.
- Risk level:
  - medium.

#### IMG-010 - Expand visual-plan validation to cover unresolved continuity and contradiction cases

- Priority: `P1`
- Problem:
  Validation is good but still does not fully enforce all requested continuity and contradiction checks.
- Scope:
  Add missing issue types and repair flow.
- Implementation notes:
  Add validation for:
  - missing recurring character;
  - contradictory exclusions and required features;
  - previous-scene text leakage;
  - empty location;
  - unresolved collective subject;
  - plan-too-verbose thresholds on plan fields and request fields separately.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
- Acceptance criteria:
  - validation issue set covers the full prompt requirement set or documents deliberate exclusions;
  - every validation issue is typed and actionable.
- Tests:
  - new unit and fixture regression tests for each issue type.
- Dependencies:
  - `IMG-006`, `IMG-007`, `IMG-009`.
- Migration concerns:
  - stricter validation may turn previously planned scenes into failures; add a review note.
- Rollback considerations:
  - none beyond revert.
- Risk level:
  - medium.

#### IMG-011 - Harden cache layers and request hashing

- Priority: `P1`
- Problem:
  The pipeline has scene, visual-plan, and prompt hashes, but it still lacks a distinct provider-request hash and fully documented invalidation rules.
- Scope:
  Split and document all cache layers.
- Implementation notes:
  Keep separate hashes for:
  - narration beat;
  - visual plan;
  - provider prompt;
  - provider request;
  - output checksum.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `packages/image-generation/src/image-batch-planner.ts`
  - `docs/episode-image-generation.md`
- Acceptance criteria:
  - changing docs or diagnostics does not trigger regeneration;
  - changing model, quality, size, references, or concrete visual content invalidates the correct layer only.
- Tests:
  - hash stability tests;
  - hash invalidation matrix tests.
- Dependencies:
  - `IMG-007`.
- Migration concerns:
  - one-time manifest invalidation for new hash fields is acceptable if documented.
- Rollback considerations:
  - maintain old-hash compatibility reader briefly if needed.
- Risk level:
  - medium.

### P2 tasks

#### IMG-012 - Implement complete retry taxonomy and persisted failure categories

- Priority: `P2`
- Problem:
  Retry behavior exists, but failure categories are still too coarse for operator recovery.
- Scope:
  Distinguish provider safety rejection, transient provider error, permanent provider error, validation failure, filesystem failure, and manifest conflict.
- Implementation notes:
  Persist structured categories in failure records and expose them in CLI status output.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.ts`
  - `apps/cli/src/episode-image-summary.ts`
  - `apps/cli/src/images-status-output.ts`
- Acceptance criteria:
  - operators can see retryability and failure category without reading logs;
  - resume mode retries only eligible failures.
- Tests:
  - retry classification tests;
  - resume eligibility tests.
- Dependencies:
  - `IMG-004`, `IMG-005`.
- Migration concerns:
  - additive manifest fields only.
- Rollback considerations:
  - none beyond revert.
- Risk level:
  - low.

#### IMG-013 - Simplify the public image CLI surface

- Priority: `P2`
- Problem:
  The public image CLI surface is still broad and partly overlapping.
- Scope:
  Design and implement a smaller public image command set while keeping compatibility shims for older entry points.
- Implementation notes:
  Target public structure:
  - `episode images plan`
  - `episode images generate`
  - `episode images resume`
  - `episode images validate`
  - `episode images status`
  - `episode images sync-shared`
  Keep existing commands as documented aliases until removal.
- Affected modules or search targets:
  - `apps/cli/src/index.ts`
  - `apps/cli/src/episode-commands.ts`
  - `apps/cli/src/images-resume-command.ts`
  - `docs/cli.md`
- Acceptance criteria:
  - canonical commands are documented once;
  - compatibility aliases are explicitly marked as compatibility-only;
  - help output and docs stay aligned.
- Tests:
  - command registration snapshot or smoke tests;
  - doc/help consistency tests.
- Dependencies:
  - `IMG-001`.
- Migration concerns:
  - keep existing automation working during alias period.
- Rollback considerations:
  - leave aliases in place if downstream automation is unknown.
- Risk level:
  - medium.

#### IMG-014 - Add executable documentation validation for image commands

- Priority: `P2`
- Problem:
  CLI documentation can still drift unless command references are validated automatically.
- Scope:
  Add a documentation smoke-test strategy for image command examples.
- Implementation notes:
  Prefer tests that:
  - parse registered command paths;
  - assert documented examples exist;
  - optionally execute `--help` or dry-run examples.
- Affected modules or search targets:
  - `apps/cli/src/*.unit.test.ts`
  - `docs/cli.md`
- Acceptance criteria:
  - the canonical image command examples in docs are tested;
  - removed or renamed commands fail tests if docs still reference them.
- Tests:
  - dedicated docs smoke test.
- Dependencies:
  - `IMG-013`.
- Migration concerns:
  - none.
- Rollback considerations:
  - none.
- Risk level:
  - low.

#### IMG-015 - Align downstream rendering and manifests with the canonical image path

- Priority: `P2`
- Problem:
  The image pipeline has moved canonically to `shared/images/generated`, but downstream consumers still need explicit alignment and tests.
- Scope:
  Make rendering and any remaining asset manifest writers resolve canonical image paths through the shared resolver.
- Implementation notes:
  Remove assumptions that the canonical writable path is under state or ad hoc `shared/images`.
- Affected modules or search targets:
  - `packages/rendering/src/index.ts`
  - `packages/dark-truth/src/index.ts`
  - `packages/pipeline/src/index.ts`
- Acceptance criteria:
  - downstream video composition consumes canonical scene-image paths;
  - any remaining image manifests consistently record repository-relative canonical paths where appropriate.
- Tests:
  - rendering integration test using canonical image path;
  - asset-manifest path regression tests.
- Dependencies:
  - `IMG-003`, `IMG-011`.
- Migration concerns:
  - keep compatibility reads for older manifests containing legacy image output paths.
- Rollback considerations:
  - compatibility reader should remain even if writer changes roll back.
- Risk level:
  - medium.

### P3 tasks

#### IMG-016 - Add explicit image ownership and reuse decision log

- Priority: `P3`
- Problem:
  Cross-language reuse and full/short reuse rules are partly implied in code and tests but not captured as decisions.
- Scope:
  Create `docs/decisions/010-image-reuse-and-ownership.md`.
- Implementation notes:
  Decide:
  - full/short reuse policy;
  - cross-language reuse policy when no visible text exists;
  - whether character-reference images are shared across locales or episode-specific only.
- Affected modules or search targets:
  - `packages/dark-truth/src/index.ts`
  - `packages/rendering/src/index.ts`
  - `packages/image-generation/src/episode-image-pipeline.ts`
- Acceptance criteria:
  - decisions cite repository evidence and resulting implementation constraints.
- Tests:
  - none directly;
  - implementation tasks will add tests later.
- Dependencies:
  - `IMG-002`.
- Migration concerns:
  - none.
- Rollback considerations:
  - doc only.
- Risk level:
  - low.

#### IMG-017 - Add representative malformed-scene fixtures for scenes 013-032 style failures

- Priority: `P3`
- Problem:
  Some current unit tests cover defect classes, but the prompt explicitly asked for representative malformed record fixtures.
- Scope:
  Add fixture-backed regression coverage for malformed scenes and overlap failures.
- Implementation notes:
  Avoid binary image fixtures; use JSON scene-plan and visual-plan fixtures.
- Affected modules or search targets:
  - `packages/image-generation/src/episode-image-pipeline.unit.test.ts`
  - fixture directories under `packages/image-generation/src/__fixtures__/`
- Acceptance criteria:
  - fixtures cover duplicated narration, omitted recurring characters, fake keyword-soup environment, copied previous-scene content, abstract forced image, false overlap rejection, and genuine duplicate merge.
- Tests:
  - fixture regression suite.
- Dependencies:
  - `IMG-008`, `IMG-009`, `IMG-010`.
- Migration concerns:
  - none.
- Rollback considerations:
  - none.
- Risk level:
  - low.

#### IMG-018 - Update user-facing image pipeline documentation after code and decisions stabilize

- Priority: `P3`
- Problem:
  `docs/episode-image-generation.md` still contains at least one stale statement about including the exact narration beat in prompts.
- Scope:
  Rewrite docs to match final architecture and remove stale behavior descriptions.
- Implementation notes:
  Update:
  - `docs/episode-image-generation.md`
  - `docs/cli.md`
  - any image workflow references in production docs.
- Affected modules or search targets:
  - docs only, informed by all preceding tasks.
- Acceptance criteria:
  - docs do not describe provider prompts as narration-driven;
  - docs match the final command surface and artifact layout;
  - migration notes are explicit.
- Tests:
  - doc smoke tests from `IMG-014`.
- Dependencies:
  - `IMG-002`, `IMG-013`, `IMG-014`.
- Migration concerns:
  - none.
- Rollback considerations:
  - docs can be reverted independently.
- Risk level:
  - low.

## 6. Recommended execution order

Recommended order for implementation:

1. `IMG-001`
2. `IMG-002`
3. `IMG-003`
4. `IMG-004`
5. `IMG-006`
6. `IMG-007`
7. `IMG-009`
8. `IMG-010`
9. `IMG-008`
10. `IMG-011`
11. `IMG-005`
12. `IMG-012`
13. `IMG-015`
14. `IMG-013`
15. `IMG-014`
16. `IMG-016`
17. `IMG-017`
18. `IMG-018`

## 7. What to do next

The highest-leverage next move is:

1. approve the planning-doc route and use this file as the source of truth;
2. start with `IMG-001` and `IMG-002` together, because they freeze the architecture and path contract before more code churn;
3. after those docs exist, implement `IMG-003` immediately, because path ownership is the current highest-risk correctness gap.

If you want the fastest path to code changes instead of more planning, the implementation order should start with:

1. `IMG-003` typed path resolver cleanup;
2. `IMG-006` and `IMG-007` visual-plan / provider-request split;
3. `IMG-005` real concurrency and resume hardening.

That sequence removes the biggest structural gaps first.
