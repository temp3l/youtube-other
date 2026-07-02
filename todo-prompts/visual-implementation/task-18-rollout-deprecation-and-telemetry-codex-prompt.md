# Codex Prompt — Task 18: Rollout, Deprecation, and Telemetry

## Model recommendation

- **Minimum:** GPT-5.4, medium reasoning
- **Recommended:** GPT-5.4, medium reasoning
- **Use GPT-5.5, medium reasoning if:** telemetry and status reporting are spread across several inconsistent command paths

## Task

Implement **Task 18: Rollout, Deprecation, And Telemetry** from:

`docs/plans/visual-retention-shot-architecture/tasks/18-rollout-deprecation-and-telemetry.md`

Work directly in the existing repository.

Do not enter planning mode. Implement the task now.

Assume Tasks 01–17 are complete and committed.

This is the final implementation task for the Visual Retention Shot Architecture.

---

## Objective

Add production-facing:

- visual-retention telemetry;
- estimated image-generation savings;
- cache and render metrics;
- CLI/status reporting;
- safe rollout defaults;
- staged deprecation notes for obsolete one-scene/one-image assumptions.

Do not remove the legacy render path.

Do not delete deprecated code.

Do not change the shot planner, validator, renderer, cache, migration, or pipeline contracts unless a minimal additive telemetry hook is required.

---

## Source documents

Read only the relevant portions of:

```text
docs/plans/visual-retention-shot-architecture/tasks/18-rollout-deprecation-and-telemetry.md
docs/plans/visual-retention-shot-architecture/architecture-plan.md
docs/plans/visual-retention-shot-architecture/production-defaults.md
docs/plans/visual-retention-shot-architecture/validation-plan.md
```

Inspect completed implementations from Tasks 14–17.

Likely relevant files include:

```text
packages/observability/src/telemetry.ts
packages/observability/src/telemetry.unit.test.ts
apps/cli/src/*status*
apps/cli/src/*
packages/pipeline/src/*
packages/dark-truth/src/*
docs/plans/visual-retention-shot-architecture/*
```

Inspect only what is necessary.

---

## Scope boundary

Implement:

- telemetry fields;
- run summaries;
- status output;
- savings estimates;
- cache-hit metrics;
- rollout configuration/defaults;
- staged deprecation documentation;
- focused tests.

Do not:

- remove legacy rendering;
- make shot-aware rendering mandatory for all runs;
- regenerate historical episodes;
- add paid provider calls;
- redesign planner or renderer behavior;
- introduce a metrics backend;
- export full narration or prompts;
- claim exact financial savings when values are estimates.

---

## Telemetry fields

Record or expose at minimum:

- generated source-image count;
- reused source-image count where known;
- rendered shot count;
- average shots per source image;
- total uses per source image;
- maximum consecutive source-image reuse;
- avoided image-generation calls;
- estimated image-generation savings;
- local shot render time;
- final composition render time;
- derived-shot cache hits;
- derived-shot cache misses;
- derived-shot cache-hit ratio;
- shot-plan regeneration count;
- source-image regeneration count;
- validation warning count;
- validation error count;
- validation status;
- meaningful visual changes in the first eight seconds;
- longest static interval;
- average shot duration;
- climax average shot duration;
- final visual-change frequency.

Use existing persisted metrics where available instead of recalculating expensively.

---

## Metric definitions

Centralize definitions.

Document:

- numerator;
- denominator;
- empty-input behavior;
- units;
- whether a value is measured, derived, or estimated.

Examples:

```text
averageShotsPerSourceImage =
  renderedShotCount / uniqueSourceImageCount

derivedClipCacheHitRatio =
  cacheHits / (cacheHits + cacheMisses)

avoidedImageGenerationCalls =
  max(0, renderedShotCount - generatedSourceImageCount)
```

Adapt formulas when the implemented architecture uses a more precise baseline.

Do not divide by zero.

Use `null` or an explicit unavailable state where a metric cannot be computed honestly.

---

## Savings estimates

Estimate image-generation savings conservatively.

Use:

- actual generated source-image count;
- rendered-shot count or configured one-image-per-change baseline;
- existing image cost metadata when available;
- provider/model pricing captured by current run artifacts where already stored.

Requirements:

- label values as estimated;
- expose currency and cost basis;
- avoid hard-coded external prices when current artifacts already contain them;
- do not fetch current pricing from the network;
- do not imply that every shot would otherwise require a unique image unless that is the stated baseline;
- preserve enough fields to audit the estimate.

A suitable shape is:

```ts
{
  estimated: true,
  avoidedCalls: number,
  baseline: "one-image-per-rendered-shot",
  unitCost?: number,
  currency?: string,
  estimatedSavings?: number
}
```

Adapt to existing telemetry conventions.

---

## Privacy and log safety

Do not log or persist:

- complete narration;
- full prompts;
- provider secrets;
- API keys;
- local credentials;
- full evidence text;
- complete caption text;
- arbitrary local file contents.

Use:

- IDs;
- hashes;
- counts;
- durations;
- issue codes;
- aggregate distributions.

Sanitize file paths according to existing logging conventions.

Do not include absolute user paths in high-level telemetry unless current observability policy explicitly allows them.

---

## Event integration

Use the existing observability abstraction.

Do not introduce a parallel telemetry system.

Add concise structured events around:

- shot-plan created;
- shot-plan reused;
- shot validation completed;
- derived clip cache summary;
- shot render completed;
- final composition completed;
- migration completed;
- visual-retention fallback used;
- legacy render path used.

Avoid one telemetry event per frame or low-level filter operation.

Do not emit excessive high-cardinality labels such as complete shot IDs to a metrics backend unless current conventions permit event-level IDs.

---

## Status and CLI output

Update relevant status or inspection commands so operators can see:

```text
Visual retention: enabled|disabled|fallback
Validation: PASS|WARN|ERROR
Source images: N
Rendered shots: N
Shots per image: X
Opening changes (first 8s): N
Longest static interval: Xs
Derived cache: H hits / M misses (R%)
Avoided image calls: N
Estimated image savings: <currency/value or unavailable>
```

Keep output concise.

Use existing JSON/text output conventions.

Do not duplicate Task 14 report logic. Reuse shared DTOs or metric builders.

JSON output must remain stable and machine-readable.

---

## Rollout configuration

Add safe production rollout controls using existing configuration conventions.

Support a staged mode such as:

```text
disabled
preview
enabled
```

or reuse an existing boolean plus validation strictness if already implemented.

Recommended semantics:

### Disabled

- preserve legacy scene rendering;
- no shot planning required.

### Preview

- generate/reuse shot plan and validation artifacts;
- optionally generate preview artifacts;
- keep final production render on legacy path unless explicitly requested.

### Enabled

- use shot-aware rendering when validation passes;
- keep legacy fallback available;
- report fallback reasons.

Do not change the default to mandatory shot-aware rendering without explicit architecture evidence that rollout is approved.

Prefer a conservative default for existing installations.

---

## Fallback reporting

When the system uses legacy rendering, record a stable reason code, such as:

```text
VISUAL_RETENTION_DISABLED
SHOT_PLAN_MISSING
SHOT_PLAN_INVALID
SHOT_VALIDATION_FAILED
SHOT_RENDER_UNSUPPORTED
SHOT_RENDER_FAILED
LEGACY_EPISODE_NOT_MIGRATED
EXPLICIT_LEGACY_OVERRIDE
```

Do not silently fall back.

The operator should be able to distinguish:

- explicit disabled mode;
- validation failure;
- unsupported treatment;
- renderer failure;
- legacy compatibility choice.

Do not include large exception objects in status output.

---

## Deprecation documentation

Update architecture or operational documentation to mark obsolete assumptions as deprecated.

Document at minimum:

- one scene equals one rendered clip;
- scene ID equals clip ID;
- one source image equals one visual interval;
- Shorts motion metadata without temporal shot realization;
- scene-only visual reports;
- ad hoc shot artifact paths;
- direct renderer assumptions that bypass shot plans.

Use staged language:

- deprecated;
- fallback-supported;
- planned removal after production confidence;
- not yet removed.

Do not claim code is deleted when it remains.

Do not mark legacy behavior unsupported while it is still required as fallback.

---

## Compatibility documentation

Document:

- how to enable preview mode;
- how to enable shot-aware rendering;
- how to force legacy mode;
- where shot artifacts are persisted;
- where validation reports are persisted;
- how to inspect cache behavior;
- how to interpret savings estimates;
- how legacy episodes are migrated;
- rollback procedure.

Keep documentation concise and repository-specific.

Do not create a broad user manual unrelated to this architecture.

---

## Tests

Run at minimum:

```bash
pnpm test:focused -- packages/observability/src/telemetry.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-status-output.unit.test.ts
pnpm test:focused -- apps/cli/src/images-status-output.unit.test.ts
```

Also run relevant regressions:

```bash
pnpm test:focused -- apps/cli/src/shot-inspect-output.unit.test.ts
pnpm test:focused -- packages/pipeline/src/index.unit.test.ts
pnpm test:focused -- apps/cli/src/episode-commands.unit.test.ts
pnpm test:focused -- packages/dark-truth/src/index.unit.test.ts
pnpm test:focused -- packages/rendering/src/derived-shot-cache.unit.test.ts
pnpm test:focused -- packages/visual-planning/src/shot-validation.unit.test.ts
```

Use the nearest existing filenames where names differ.

## Required test coverage

### Metrics

- average shots per image;
- avoided image calls;
- zero-image behavior;
- cache-hit ratio;
- zero-cache-event behavior;
- opening change count;
- longest static interval;
- validation status;
- measured versus estimated fields;
- stable units.

### Savings

- estimate with known unit cost;
- unavailable cost basis;
- currency preserved;
- negative avoided calls clamped to zero;
- no false exactness;
- unrelated metadata does not affect estimate.

### Rollout modes

- disabled preserves legacy path;
- preview creates/reuses planning artifacts without changing final production render;
- enabled uses shot-aware rendering when valid;
- validation failure produces explicit fallback or failure according to configured policy;
- explicit legacy override works;
- no existing config becomes mandatory.

### Status output

- concise text output;
- stable JSON output;
- cache summary;
- savings labeled estimated;
- fallback reason visible;
- no narration, prompts, or secrets printed.

### Telemetry safety

- complete story text is absent;
- prompt text is absent;
- secrets are absent;
- absolute path handling follows existing policy;
- event field cardinality is bounded.

### Deprecation

- documentation references implemented current behavior;
- legacy path remains documented as fallback;
- no deleted-code claim;
- rollout and rollback steps are present.

Avoid large snapshots. Assert semantic fields and concise stable text.

---

## Type safety and maintainability

- do not use `any`;
- avoid unchecked assertions;
- use readonly telemetry DTOs;
- centralize metric calculations;
- centralize fallback reason codes;
- use stable enums or unions;
- reuse Task 14 report DTOs where practical;
- do not mix telemetry calculation into FFmpeg execution internals;
- document measured versus estimated fields.

---

## Performance

Telemetry should not significantly extend render time.

Do not:

- rehash all media when validated manifests already contain hashes;
- decode video to recompute metrics already persisted by validation;
- scan unrelated episode directories;
- emit unbounded per-shot logs at normal verbosity.

Aggregate from current manifests and validation metrics.

---

## Rollback safety

Ensure operators can return to legacy mode through configuration without deleting artifacts.

Rollback must not require:

- image regeneration;
- shot-cache deletion;
- artifact migration reversal;
- database changes.

Document the rollback command or configuration.

Do not remove existing legacy configuration paths.

---

## Execution procedure

1. Inspect current telemetry and status-report conventions.
2. Define shared visual-retention metric DTOs and fallback reason codes.
3. Add metric aggregation from existing artifacts.
4. Add telemetry events at orchestration boundaries.
5. Update concise status outputs.
6. Add rollout configuration/defaults.
7. Add fallback reporting.
8. Update deprecation and operations documentation.
9. Add focused tests.
10. Run affected type checks.
11. Run:

```bash
git diff --check
```

12. Review for accidental removal of legacy behavior.
13. Create exactly one commit.

---

## Commit

Use:

```text
feat(observability): add visual retention rollout metrics
```

---

## Final response

Return only:

- concise summary;
- files changed;
- metrics added;
- savings estimation approach;
- rollout modes and defaults;
- fallback reason codes;
- CLI/status changes;
- deprecation documentation changes;
- tests and type checks with results;
- commit hash;
- confirmation that legacy rendering remains available.

Do not produce another architecture plan.
