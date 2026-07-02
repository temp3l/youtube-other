# Codex Prompt — Tasks 15 → 16: Canonical Pipeline and Dark Truth Integration

## Model recommendation

- **Minimum:** GPT-5.4, high reasoning
- **Recommended:** GPT-5.5, high reasoning
- **Execution mode:** implementation mode, not planning mode
- **Commit policy:** one commit per task

## Tasks

Implement these tasks sequentially:

1. `docs/plans/visual-retention-shot-architecture/tasks/15-canonical-pipeline-integration.md`
2. `docs/plans/visual-retention-shot-architecture/tasks/16-dark-truth-episode-integration.md`

Work directly in the existing repository.

Assume Tasks 01–14 and Task 17 are complete and committed, and that Tasks 12–13 have finalized the renderer and derived-shot cache contracts.

Do not enter planning mode. Implement the tasks now.

---

## Mandatory execution order

Execute exactly:

```text
Task 15
→ inspect current canonical pipeline stage order
→ implement integration behind a safe feature gate
→ run focused unit and E2E tests
→ review compatibility
→ commit Task 15

Task 16
→ inspect active Dark Truth episode workflow
→ integrate using the stable Task 15/renderer contracts
→ run focused Dark Truth and CLI tests
→ review review-package compatibility
→ commit Task 16

→ run combined regression checks
```

Do not mix both tasks into one commit.

Do not start Task 16 until Task 15:

- passes focused unit tests;
- passes focused E2E tests;
- preserves the legacy render path;
- has stable persisted artifact references;
- has been committed.

If Task 15 cannot be completed safely, stop without starting Task 16.

---

# Shared constraints

These tasks integrate already-completed shot planning, validation, rendering, and cache behavior.

Do not redesign:

- shot-domain schemas;
- pacing profiles;
- treatment catalog;
- focal metadata;
- planner behavior;
- validation rules;
- FFmpeg filter builders;
- shot-aware renderer contracts;
- derived-shot cache fingerprints;
- preview CLI behavior;
- legacy migration behavior.

Do not implement Task 18 telemetry, rollout, or deprecation work.

Do not add provider calls.

Do not regenerate source images because of:

- crop changes;
- motion changes;
- treatment changes;
- validation changes;
- caption changes;
- renderer-version changes.

Keep all new behavior feature-gated or explicitly enabled until rollout work is complete.

Do not introduce:

- `any`;
- unchecked casts;
- ad hoc filesystem paths;
- duplicate artifact schemas;
- duplicate planner logic;
- duplicate validator logic;
- shell command construction;
- time-dependent fingerprints;
- global mutable orchestration state.

---

# Task 15 — Canonical Pipeline Integration

Implement:

`docs/plans/visual-retention-shot-architecture/tasks/15-canonical-pipeline-integration.md`

## Objective

Integrate shot planning and shot-aware rendering into the canonical `packages/pipeline` workflow behind safe defaults.

Add a stage between image readiness/validation and final video rendering.

The canonical flow should become conceptually:

```text
scene planning
→ narration/alignment
→ image generation or image reuse
→ source-image validation
→ focal metadata resolution
→ shot planning
→ shot validation
→ shot-aware rendering or legacy fallback
→ packaging
```

Use existing stage conventions rather than inventing a second pipeline framework.

## Likely files

Inspect only what is necessary:

```text
packages/pipeline/src/index.ts
packages/pipeline/src/index.unit.test.ts
packages/pipeline/src/index.e2e.test.ts
packages/domain/src/*
packages/visual-planning/src/*
packages/rendering/src/*
packages/shared/src/episode-filesystem.ts
```

Do not modify Dark Truth files during Task 15.

---

## Feature gate

Add or reuse a safe explicit configuration/option such as:

```ts
visualRetention: {
  enabled: boolean;
  profile?: VisualPacingProfileId;
  strictValidation?: boolean;
}
```

Adapt to existing configuration conventions.

Requirements:

- existing runs behave exactly as before when disabled or absent;
- shot-aware behavior is opt-in until Task 18;
- no new required config field;
- dry runs remain compatible;
- existing manifests remain parseable.

Do not scatter feature-gate checks across unrelated code. Resolve the mode near orchestration boundaries.

---

## Stage placement

Add shot planning only after all required local inputs exist:

- retimed scene plan;
- source images;
- source-image hashes;
- focal metadata or safe fallback;
- render profile;
- alignment/caption artifacts where required.

Do not plan shots before narration timing is final.

Do not generate source images from the shot planner.

Do not perform paid calls in the shot-planning stage.

---

## Artifact loading and persistence

Use resolver-owned paths from Task 03 for:

```text
state/visual-retention/source-scenes.json
state/visual-retention/focal-metadata.json
state/visual-retention/shot-plan.<variant>.<locale>.json
state/visual-retention/validation.<variant>.<locale>.json
```

Requirements:

- no manual path templates;
- write atomically using existing helpers;
- reuse valid existing artifacts when fingerprints match;
- regenerate only stale shot plans or dependent render outputs;
- preserve source-image cache state;
- malformed artifacts produce actionable errors or safe regeneration;
- do not silently trust file existence.

---

## Source-scene construction

Build canonical `VisualSourceScene` records from:

- existing retimed `ScenePlan`;
- current image manifest;
- source-image hashes;
- focal metadata;
- narrative phase or importance mapping.

Requirements:

- one canonical source-scene record per narrative scene/image relationship;
- preserve exact narration timing;
- preserve source image identity;
- do not duplicate narrative content;
- do not infer facts or rewrite prompts;
- validate all source references.

If focal metadata is absent, use the completed Task 06 local fallback without regenerating images.

---

## Shot planning

Invoke the completed Task 07 planner.

Pass only stable inputs:

- platform/variant;
- aspect ratio;
- source scenes;
- pacing profile;
- visual budget;
- treatment catalog version;
- restrictions;
- stable seed.

Do not implement planner logic inside the pipeline package.

Use a deterministic stable seed derived from existing episode identity and variant/locale conventions.

Do not include absolute paths or current timestamps in planning identity.

---

## Validation

Invoke the completed Task 08 validator.

Behavior:

- persist validation output;
- allow warnings;
- block shot-aware rendering on validation errors unless an explicit existing review override is enabled;
- do not silently downgrade to legacy rendering after a validation error without reporting the reason;
- do not duplicate validation rules in pipeline code.

When shot-aware behavior is enabled but cannot proceed, return a typed stage failure with concise diagnostics.

---

## Rendering

When shot-aware behavior is enabled and validation allows it:

- pass the shot plan to the completed Task 12 renderer;
- use the Task 13 derived-shot cache;
- preserve final narration/audio behavior;
- preserve caption sidecars and current caption rendering behavior;
- package final output normally.

When disabled or no shot plan is supplied:

- use the existing scene-render path unchanged.

Do not modify renderer internals unless a minimal integration adapter is required.

---

## Packaging and episode manifest

Allow package results and episode manifests to reference new artifacts additively, such as:

- shot plan;
- shot validation report;
- source-scene artifact;
- focal metadata;
- derived-shot summary;
- cache summary.

Requirements:

- existing consumers remain compatible;
- existing required fields do not change;
- no complete narration or prompt content is embedded;
- paths use existing artifact-reference conventions;
- new fields are optional until rollout is complete.

Do not create a second episode manifest.

---

## Resume and retry behavior

Pipeline reruns should:

- reuse current source images;
- reuse valid focal metadata;
- reuse valid shot plans;
- reuse valid derived clips;
- rerender only stale or missing shot outputs;
- preserve successfully completed prior stages.

A failure in shot rendering must not invalidate image generation.

Use existing stage checkpoint conventions.

---

## Error handling

Use existing pipeline error/result conventions.

Errors should identify:

- stage;
- variant;
- locale;
- scene or shot IDs where relevant;
- validation issue summary;
- cache/render failure code.

Do not include full narration, prompts, secrets, or large FFmpeg output.

---

## Task 15 tests

Run at minimum:

```bash
pnpm test:focused -- packages/pipeline/src/index.unit.test.ts
pnpm test:focused -- packages/pipeline/src/index.e2e.test.ts
```

Also run:

```bash
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm test:focused -- packages/rendering/src/derived-shot-cache.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

Use the nearest existing test filenames where they differ.

### Required Task 15 coverage

- default/disabled mode preserves legacy pipeline behavior;
- enabled mode creates source scenes;
- enabled mode creates or reuses focal metadata;
- enabled mode creates a deterministic shot plan;
- validation report is persisted;
- validation errors block shot-aware rendering;
- warnings allow rendering;
- one source image can produce multiple rendered shots;
- derived cache hits are reused;
- crop/motion changes do not regenerate images;
- package results reference shot artifacts additively;
- rerun resumes without repeating completed work;
- no provider calls occur during local shot planning;
- existing E2E fixture still passes in legacy mode.

---

## Task 15 review checkpoint

Before committing:

1. Confirm shot planning occurs after final narration timing.
2. Confirm disabled mode is behaviorally unchanged.
3. Confirm no source-image regeneration is triggered by shot changes.
4. Confirm validation gates shot-aware rendering.
5. Confirm all artifacts use shared resolver paths.
6. Confirm current package manifests remain compatible.
7. Confirm focused unit and E2E tests pass.
8. Run the narrowest type checks for pipeline and dependencies.
9. Run:

```bash
git diff --check
```

10. Review for accidental Dark Truth or Task 18 work.

## Task 15 commit

Create exactly one commit:

```text
feat(pipeline): integrate shot planning and rendering
```

Do not start Task 16 until this commit exists.

---

# Task 16 — Dark Truth Episode Integration

Implement:

`docs/plans/visual-retention-shot-architecture/tasks/16-dark-truth-episode-integration.md`

## Objective

Integrate the stable visual-retention flow into the active Dark Truth `episode` workflows for both full and short outputs.

The integration must preserve:

- existing scene retiming;
- narration audio;
- scene-level audio slicing where still required;
- image generation and reuse;
- full and short source-image locations;
- sidecar subtitles;
- review package structure;
- dry-run behavior;
- existing CLI commands;
- legacy fallback.

Use shared planner, validator, renderer, cache, and artifact contracts. Do not create a Dark Truth-specific second implementation.

## Likely files

Inspect only what is necessary:

```text
apps/cli/src/episode-commands.ts
apps/cli/src/episode-commands.unit.test.ts
packages/dark-truth/src/index.ts
packages/dark-truth/src/index.unit.test.ts
packages/pipeline/src/*
packages/shared/src/episode-filesystem.ts
```

---

## Integration point

Create or load shot plans only after:

- narration has been generated;
- scene timing has been retimed to final narration;
- source images are prepared;
- full or short image manifests are available;
- focal metadata can be resolved;
- caption/alignment artifacts exist where required.

Do not plan against pre-retimed scene durations.

Do not alter the story text.

---

## Source images

Use existing Dark Truth image locations and manifests, including the current canonical locations for:

- full images;
- short images;
- shared generated images;
- shared short generated images.

Do not copy images unnecessarily.

Normalize them into shared `VisualSourceScene` inputs.

Requirements:

- preserve source-image identity and hashes;
- validate missing or mismatched files;
- do not scan arbitrary folders;
- do not regenerate historical assets merely because no shot plan exists;
- use Task 17 migration support when applicable rather than duplicating migration logic.

---

## Full and Short behavior

### Shorts

When enabled:

- use the configured Shorts pacing profile;
- allow the expected 15–35 rendered shots from approximately 5–12 source images;
- enforce opening visual variety;
- preserve 9:16 output;
- use safe source-image reuse;
- maintain captions above UI-safe areas where existing caption integration supports it.

### Full videos

When enabled:

- use the configured full-video pacing profile;
- preserve atmospheric movement allowances;
- preserve 16:9 output;
- avoid unnecessarily aggressive Shorts cadence;
- reuse source images conservatively.

Do not hard-code separate planner algorithms.

---

## CLI behavior

Existing commands such as:

```text
episode ...
episode short ...
episode full ...
episode short --dry-run
```

must remain compatible.

Add visual-retention flags only if consistent with current command structure, for example:

```text
--visual-retention
--no-visual-retention
--visual-profile <profile>
--strict-shot-validation
```

Prefer configuration defaults and avoid excessive CLI surface.

Requirements:

- disabled mode preserves existing behavior;
- dry run performs planning/validation in memory or reports intended artifacts without rendering;
- no provider calls are added by shot planning;
- help output remains stable and clear.

---

## Review package integration

Preserve all existing review-package outputs.

Add optional references to:

- shot plan;
- validation report;
- storyboard/contact sheet where available;
- derived-shot cache summary;
- validation warnings.

Do not remove or rename existing files.

Do not make new review artifacts mandatory for legacy mode.

Keep sidecar SRT/VTT outputs unchanged.

---

## Caption and audio behavior

Preserve:

- narration duration;
- caption timing;
- sidecar generation;
- audio alignment.

Do not:

- synthesize new audio per shot;
- retime narration from shot timing;
- duplicate captions with local timing resets;
- burn captions twice.

If shot clips are video-only intermediates, continue using the existing final narration track.

---

## Validation and fallback

When visual retention is enabled:

- validate the shot plan;
- block shot-aware rendering on errors unless an explicit review override exists;
- preserve warnings in manifests and review output;
- do not silently fall back to legacy rendering after errors without reporting it.

When visual retention is disabled:

- use the existing path exactly.

For existing legacy episodes without canonical shot artifacts:

- call Task 17 migration support where safe;
- do not duplicate migration behavior;
- do not require source-image regeneration.

---

## Persistence

Use shared resolver-owned paths as the source of truth.

Dark Truth may mirror concise review-facing summaries into existing review directories only when compatibility requires it.

Do not create a second authoritative shot-plan location.

Do not add ad hoc path templates to `episode-commands.ts`.

---

## Resume behavior

A rerun should:

- reuse existing narration;
- reuse valid source images;
- reuse focal metadata;
- reuse or regenerate only stale shot plans;
- reuse valid derived clips;
- rerender only missing or invalid shots;
- preserve completed review artifacts.

Do not invalidate full and short variants together unless their dependencies actually overlap.

---

## Task 16 tests

Run at minimum:

```bash
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- packages/dark-truth/src/index.unit.test.ts
```

Also run:

```bash
pnpm test:focused -- packages/pipeline/src/index.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
```

Run the applicable focused E2E tests for current Dark Truth full and short workflows.

### Required Task 16 coverage

- disabled mode preserves current full workflow;
- disabled mode preserves current short workflow;
- enabled short workflow creates multiple shots per image;
- enabled full workflow uses appropriate pacing;
- final scene timing comes from retimed narration;
- source image manifests are normalized correctly;
- full and short image paths do not collide;
- dry run does not render or call providers;
- existing review package files remain present;
- sidecar subtitles remain compatible;
- validation warnings are referenced;
- validation errors block shot-aware rendering;
- migration support is reused for legacy episodes;
- reruns reuse valid derived clips;
- no historical source-image regeneration is mandatory.

---

## Task 16 review checkpoint

Before committing:

1. Confirm current full and short workflows remain available.
2. Confirm planning occurs after retiming.
3. Confirm full and short source-image paths remain correct.
4. Confirm review packages and sidecars remain compatible.
5. Confirm migration behavior is reused rather than duplicated.
6. Confirm no Task 18 telemetry or rollout defaults were added.
7. Run focused tests and type checks.
8. Run:

```bash
git diff --check
```

9. Review for accidental broad refactoring.

## Task 16 commit

Create exactly one commit:

```text
feat(dark-truth): integrate shot-aware episode rendering
```

---

# Combined regression checks

After both commits exist, run:

```bash
pnpm test:focused -- packages/pipeline/src/index.unit.test.ts
pnpm test:focused -- packages/pipeline/src/index.e2e.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- packages/dark-truth/src/index.unit.test.ts
pnpm test:focused -- packages/rendering/src/index.unit.test.ts
pnpm test:focused -- packages/rendering/src/derived-shot-cache.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
```

Run applicable full and short workflow E2E tests.

Run the narrowest type checks for:

- pipeline;
- Dark Truth;
- CLI;
- rendering;
- visual planning;
- shared.

Review:

```bash
git log -2 --oneline
git diff HEAD~2..HEAD --check
git status --short
```

Confirm:

- exactly two task commits exist;
- Task 15 precedes Task 16;
- the working tree is clean;
- no Task 18 changes were introduced.

---

## Final response

Return only:

### Task 15

- concise summary;
- files changed;
- feature gate and stage placement;
- artifact persistence;
- render/fallback behavior;
- unit and E2E tests;
- commit hash.

### Task 16

- concise summary;
- files changed;
- full and short integration behavior;
- review package and subtitle compatibility;
- migration/reuse behavior;
- tests and type checks;
- commit hash.

### Combined verification

- regression commands and results;
- confirmation that legacy paths remain available;
- confirmation that source-image generation behavior is unchanged;
- confirmation that the working tree is clean;
- issues intentionally deferred to Task 18.

Do not proceed to Task 18.
