# Codex Prompt — Task 17: Legacy Episode Migration

## Model recommendation

- **Minimum:** GPT-5.4, medium reasoning
- **Recommended:** GPT-5.5, medium reasoning
- **Use high reasoning if:** legacy artifacts have several incompatible historical shapes or migration touches multiple CLI/workflow paths

## Task

Implement **Task 17: Legacy Episode Migration** from:

`docs/plans/visual-retention-shot-architecture/tasks/17-legacy-episode-migration.md`

Work directly in the existing repository.

Do not enter planning mode. Implement the task now.

Assume Tasks 01–13 are complete and committed.

This task may run in parallel with Task 14 in a separate worktree. Keep changes isolated and minimize edits to shared CLI entry files.

---

## Objective

Support existing episodes that have scene timing and scene images but do not yet have:

- focal metadata;
- visual source-scene artifacts;
- a shot plan;
- shot validation reports;
- derived-shot cache entries.

Create deterministic, conservative shot plans from existing local assets without requiring source-image regeneration.

The migration must:

- recognize supported legacy artifact shapes;
- reuse current local images;
- infer conservative focal metadata;
- generate safe shot plans;
- validate the result;
- persist canonical new artifacts;
- produce actionable warnings;
- avoid aggressive treatments;
- regenerate images only when no compliant composition can be produced and only through a later explicit workflow.

This task must not automatically call paid providers.

---

## Source documents

Read only the relevant portions of:

```text
docs/plans/visual-retention-shot-architecture/tasks/17-legacy-episode-migration.md
docs/plans/visual-retention-shot-architecture/architecture-plan.md
docs/plans/visual-retention-shot-architecture/production-defaults.md
docs/plans/visual-retention-shot-architecture/validation-plan.md
```

Inspect completed implementations from:

- Task 03 — resolver paths;
- Task 06 — focal metadata and conservative fallback;
- Task 07 — deterministic planner;
- Task 08 — validation;
- Task 12 — shot-aware renderer contracts;
- Task 13 — derived cache and fingerprints.

Likely relevant files include:

```text
packages/visual-planning/src/*
packages/image-generation/src/*
packages/shared/src/episode-filesystem.ts
apps/cli/src/*
packages/dark-truth/src/*
```

Inspect Dark Truth and canonical historical artifact locations only as needed to recognize legacy episodes.

Do not modify current production workflows in this task.

---

## Scope boundary

Implement:

- legacy artifact discovery through known canonical paths;
- parsing of supported historical scene/image manifest shapes;
- canonical normalization;
- conservative focal metadata generation;
- safe deterministic shot-plan generation;
- validation;
- canonical artifact persistence;
- migration reporting;
- optional dedicated migration CLI command if required by existing task conventions;
- focused tests.

Do not implement:

- automatic paid image regeneration;
- canonical pipeline integration;
- Dark Truth production integration;
- rollout or telemetry;
- deletion of legacy artifacts;
- broad repository-wide data migration;
- remote object-store migration;
- new renderer behavior;
- new shot-planning rules.

Do not mutate or overwrite legacy source artifacts by default.

---

## Migration API

Provide a focused API comparable to:

```ts
interface MigrateLegacyEpisodeInput {
  readonly episodeWorkspace: string;
  readonly variant: OutputVariant;
  readonly locale: Locale;
  readonly pacingProfile?: VisualPacingProfile;
  readonly visualBudget?: VisualBudget;
  readonly dryRun?: boolean;
}

interface LegacyMigrationResult {
  readonly status:
    | "migrated"
    | "already-current"
    | "migrated-with-warnings"
    | "blocked";
  readonly sourceFormat: LegacyArtifactFormat;
  readonly artifactsWritten: readonly string[];
  readonly warnings: readonly LegacyMigrationWarning[];
  readonly validation: ShotPlanValidationResult;
  readonly requiresImageRegeneration: boolean;
}
```

Adapt names to repository conventions.

The core migration function should be callable without CLI involvement.

Keep it deterministic and testable.

---

## Legacy artifact discovery

Recognize only documented or clearly existing legacy artifact shapes.

Likely sources include:

- current `ScenePlan` artifacts;
- image-generation manifests;
- Dark Truth `shared/image-manifest.json`;
- Dark Truth short image manifests;
- existing generated image directories;
- current narration-retimed scene plans;
- known imported image manifests.

Do not scan arbitrary directories recursively.

Use the shared resolver for canonical locations.

For known legacy compatibility paths, centralize path knowledge in one migration adapter rather than scattering `path.join()` calls.

## Discovery rules

- prefer canonical current artifacts when both canonical and legacy artifacts exist;
- identify source format explicitly;
- reject ambiguous conflicting manifests rather than silently choosing one;
- preserve deterministic image ordering;
- never depend on directory enumeration order;
- verify every referenced image exists;
- verify duplicate scene or image identities;
- verify scene timing;
- record unsupported shapes as typed blockers.

Do not infer scenes from filenames alone when a valid manifest exists.

Filename-based fallback may be used only for clearly documented legacy patterns and must be deterministic.

---

## Canonical normalization

Normalize supported legacy inputs into the completed Task 02/06 contracts:

- `VisualSourceScene`;
- source-image references;
- source image hashes;
- focal metadata artifact;
- shot-planner input.

Do not copy complete legacy manifests into new artifacts.

Preserve:

- scene identity;
- scene timing;
- source-image identity;
- locale;
- variant;
- aspect ratio;
- narration alignment where available.

Do not rewrite narration or source facts.

## Source image hashes

Use existing recorded SHA-256 values when valid.

When absent:

- hash the existing local file using repository-standard streaming helpers;
- do not read large files fully into memory;
- do not use modification times as identity;
- do not alter the image.

A hash failure must block only the affected migration with an actionable result.

---

## Conservative focal metadata

Use the completed Task 06 local fallback.

Requirements:

- read image dimensions using existing local utilities;
- create safe central or rule-of-thirds regions;
- label origin as local fallback or legacy-derived;
- do not claim face detection;
- do not claim evidence-object detection;
- do not invent depth maps;
- avoid aggressive close-ups;
- produce byte-stable metadata for equivalent images;
- persist canonical focal metadata through the Task 03 resolver path.

When valid historical focal hints exist:

- normalize and validate them;
- preserve their provenance;
- prefer them over geometric fallback only when they are structurally safe.

Do not trust unvalidated legacy bounds.

---

## Safe shot planning profile

Use the completed Task 07 planner, but apply migration-safe restrictions.

Default migration restrictions should:

- allow static medium and wide crops;
- allow conservative detail crops only when supported by real metadata;
- allow slow push-in;
- allow slow pull-out;
- allow restrained horizontal or vertical pan;
- allow blurred background fill only when vertical crop is unsafe;
- use hard cuts or short safe dissolves;
- disable aggressive fast zoom by default;
- disable parallax;
- disable depth warping;
- disable high-risk face close-ups without real face metadata;
- disable evidence-specific framing without real evidence metadata;
- disable strong rotation;
- avoid stacked effects.

Do not duplicate planner logic. Supply restrictions and existing profiles.

## Expected shot count

Produce safe plans consistent with current budgets:

- generally 2–3 shots per source image where duration requires it;
- fewer for short scenes;
- more only when needed to satisfy duration caps;
- no artificial source-image duplication;
- no image-generation requests.

The migration planner must preserve scene timeline coverage exactly.

---

## Aspect-ratio handling

For legacy landscape images used in Shorts:

1. prefer validated smart or conservative crop;
2. use restrained pan-and-scan when crop supports it;
3. use blurred background fill when a safe crop is impossible;
4. avoid empty or low-resolution vertical composition;
5. record low-resolution or crop limitations.

Do not alter the source file.

For full videos, prefer stable landscape framing and conservative motion.

---

## Validation

Run the completed Task 08 validator against every migrated plan.

Persist the validation report through resolver-owned paths.

Migration status rules:

- `migrated`: no errors and no material warnings;
- `migrated-with-warnings`: no errors but warnings remain;
- `blocked`: validation errors or missing required assets prevent compliant migration;
- `already-current`: valid canonical artifacts already exist and match current inputs.

Do not mark an invalid plan as successfully migrated.

## Image-regeneration recommendation

Set `requiresImageRegeneration` only when:

- source image is missing;
- source image is unreadable;
- effective crop resolution cannot satisfy any allowed fallback;
- no valid composition exists for required aspect ratio;
- all safe treatments fail;
- a required source image does not correspond to the scene.

Do not automatically regenerate images.

Return actionable affected scene/image IDs and reasons.

Avoid false certainty. A warning should not imply regeneration when a safe local fallback exists.

---

## Idempotency

Migration must be safe to rerun.

When canonical artifacts already exist:

- parse and validate them;
- compare stable fingerprints or dependencies;
- return `already-current` when they are valid and current;
- do not rewrite byte-identical artifacts;
- regenerate only stale or invalid derived artifacts;
- never duplicate shot plans or focal metadata entries.

Equivalent legacy inputs must produce byte-identical canonical artifacts.

Do not include current timestamps in content identity.

---

## Artifact persistence

Use Task 03 resolver paths for:

```text
state/visual-retention/source-scenes.json
state/visual-retention/focal-metadata.json
state/visual-retention/shot-plan.<variant>.<locale>.json
state/visual-retention/validation.<variant>.<locale>.json
```

Persist atomically using existing helpers.

Do not:

- overwrite legacy manifests;
- delete legacy images;
- relocate source images;
- create ad hoc migration folders;
- write canonical artifacts before the complete migration result is internally valid.

A partial failure must not leave a valid-looking shot-plan artifact without required dependencies.

---

## Dry-run support

Provide a dry-run mode through the migration API and CLI if CLI integration is included.

Dry run must:

- discover and parse artifacts;
- hash files where required;
- infer focal metadata in memory;
- produce a shot plan in memory;
- validate it;
- report intended writes;
- not write or modify files;
- not invoke FFmpeg;
- not call providers.

Dry-run output must be deterministic.

---

## CLI command

Add a dedicated command only if consistent with the existing CLI architecture, for example:

```bash
pnpm mediaforge -- shots migrate \
  --episode <episode-id> \
  --variant short \
  --locale en \
  --dry-run
```

Prefer a dedicated module such as:

```text
apps/cli/src/commands/legacy-shots.ts
```

Keep edits to `apps/cli/src/index.ts` minimal to reduce conflicts with Task 14.

CLI output should include:

- detected legacy format;
- scenes found;
- images found;
- focal metadata generated;
- planned shot count;
- validation result;
- artifacts that would be or were written;
- warnings;
- blocked scene/image IDs;
- whether image regeneration is recommended.

Do not print full narration, prompts, or secrets.

---

## Error handling

Use typed migration errors and warning codes.

Suggested blocker/warning concepts:

```text
LEGACY_MANIFEST_UNSUPPORTED
LEGACY_MANIFEST_AMBIGUOUS
LEGACY_SCENE_TIMING_INVALID
LEGACY_IMAGE_MISSING
LEGACY_IMAGE_UNREADABLE
LEGACY_IMAGE_HASH_FAILED
LEGACY_IMAGE_DIMENSIONS_INVALID
LEGACY_SOURCE_REFERENCE_MISMATCH
LEGACY_CROP_UNSAFE
LEGACY_RESOLUTION_INSUFFICIENT
LEGACY_PLAN_VALIDATION_FAILED
LEGACY_ARTIFACT_WRITE_FAILED
```

Use existing issue conventions where possible.

Do not throw for normal unsupported legacy formats when a typed blocked result is more useful.

Do not suppress programming errors.

---

## Determinism

Do not use:

- `Math.random()`;
- current time;
- UUIDs;
- directory iteration order;
- absolute paths in fingerprints;
- modification times as content identity;
- mutable global state.

Sort semantically unordered inputs.

Use stable planner seeds derived from existing episode identity, locale, variant, scene ID, source-image hash, and migration/planner version.

Document seed inputs.

---

## Tests

Add focused tests, preferably:

```text
packages/visual-planning/src/legacy-shot-plan.unit.test.ts
apps/cli/src/legacy-shots.unit.test.ts
```

Run at minimum:

```bash
pnpm test:focused -- packages/visual-planning/src/legacy-shot-plan.unit.test.ts
pnpm test:focused -- apps/cli/src/index.unit.test.ts
```

Also run relevant regressions:

```bash
pnpm test:focused -- packages/visual-planning/src/shot-planner.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
pnpm test:focused -- packages/image-generation/src/focal-metadata.unit.test.ts
pnpm test:focused -- packages/shared/src/episode-filesystem.unit.test.ts
pnpm test:focused -- packages/domain/src/shot-plan.unit.test.ts
```

Use the closest existing filenames where needed.

## Required fixtures

Include representative fixtures for:

- canonical scene plan plus legacy image manifest;
- Dark Truth full image manifest;
- Dark Truth short image manifest;
- scene images with no focal metadata;
- landscape image migrated to Short;
- portrait image migrated to Short;
- square image;
- low-resolution image;
- missing image;
- malformed manifest;
- ambiguous duplicate manifests;
- existing current canonical artifacts;
- legacy artifact with missing hash;
- legacy artifact with valid historical focal hint;
- unsupported legacy shape.

## Required behavior tests

### Successful migration

- conservative focal metadata generated;
- source image hash preserved or calculated;
- shot plan generated;
- exact timeline coverage;
- safe treatments only;
- no source-image regeneration;
- canonical paths used;
- validation report persisted;
- rerun returns `already-current`.

### Aspect adaptation

- safe portrait crop when available;
- restrained pan when safe;
- blurred fill fallback when crop is unsafe;
- low-resolution risk reported;
- no parallax;
- no unsupported close-up without metadata.

### Blocked migration

- missing image;
- unreadable image;
- invalid scene timing;
- ambiguous manifest;
- no safe composition;
- validation errors;
- atomic persistence prevents partial canonical state.

### Dry run

- no writes;
- no renderer invocation;
- no provider call;
- intended artifacts reported;
- deterministic output.

### Compatibility

- legacy artifacts remain untouched;
- existing scene/image manifests remain parseable;
- source images remain unchanged;
- current production workflows are not automatically altered;
- no Task 15 or 16 integration is introduced.

Avoid large snapshots. Assert semantic artifacts, issue codes, IDs, counts, and paths.

---

## Type safety and maintainability

- do not use `any`;
- avoid unchecked assertions;
- use discriminated unions for legacy formats;
- keep migration adapters focused;
- keep public arrays readonly;
- do not leak legacy shapes into canonical planner APIs;
- document supported legacy formats and fallback boundaries;
- avoid a generic “accept anything” manifest parser.

---

## Performance

Migration should be local and bounded.

Avoid:

- decoding full images when metadata is sufficient;
- hashing the same file repeatedly in one run;
- scanning unrelated directories;
- rendering video;
- provider calls;
- rewriting identical artifacts.

Cache per-run file metadata and hashes through local immutable maps where useful.

---

## Security

- validate every path resolved from legacy data;
- ensure referenced files remain inside the episode workspace or approved asset roots;
- reject traversal;
- do not follow unexpected remote URLs;
- do not execute shell commands;
- do not include sensitive content in errors;
- use atomic writes;
- preserve original legacy data.

---

## Compatibility review

Before finishing, confirm:

- no paid image generation occurs;
- no source images are modified;
- canonical current artifacts take precedence;
- legacy artifacts remain untouched;
- migration is idempotent;
- dry run performs no writes;
- only safe treatments are selected;
- no pipeline or Dark Truth production integration was added;
- no preview CLI or telemetry behavior was added;
- all new paths use the shared resolver.

---

## Execution procedure

1. Inventory known legacy artifact shapes from existing code and tests.
2. Define explicit legacy adapters.
3. Normalize legacy scene and image data.
4. compute or validate image hashes and dimensions.
5. generate conservative focal metadata.
6. invoke the existing planner with migration-safe restrictions.
7. validate the result.
8. persist canonical artifacts atomically.
9. add optional dedicated migration CLI command.
10. add focused tests.
11. run affected type checks.
12. run:

```bash
git diff --check
```

13. Review for accidental Task 14, 15, 16, or 18 work.
14. Create exactly one commit.

---

## Commit

Use:

```text
feat(visual-planning): add legacy episode shot migration
```

Do not proceed to Task 18 or production integration.

---

## Final response

Return only:

- concise summary;
- files changed;
- legacy formats supported;
- migration API and optional CLI command;
- conservative focal and treatment behavior;
- validation and idempotency behavior;
- image-regeneration recommendation rules;
- tests and type checks with results;
- commit hash;
- unsupported legacy formats or blockers intentionally deferred.

Do not produce another architecture plan.
