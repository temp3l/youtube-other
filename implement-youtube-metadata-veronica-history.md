# Implement Variant-Aware YouTube Metadata for Veronica + History

You are working in the YouTube monorepo.

## Mission

Complete the missing YouTube metadata orchestration for both:

- `veronica-media`
- `history`

The repository already contains a shared YouTube metadata generator with validation and caching.

Do **not** build another metadata generator.

Implement a small shared orchestration substrate for variant-aware metadata generation, then expose genre-specific adapters/CLI commands for Veronica and History.

The implementation must support the actual narration variant selected for publication, especially `short`, rather than implicitly assuming the full narration script.

---

# Known Current State

## Shared metadata

The shared YouTube metadata package already supports:

- validated metadata generation;
- caching;
- provider-backed generation;
- reusable metadata contracts.

Reuse this implementation as the single production metadata generator.

## Generic CLI defect

The generic CLI currently hard-codes metadata narration to the full variant:

`apps/cli/src/index.ts` around line ~915.

It therefore cannot correctly generate metadata for a short-form episode when only short narration exists.

Do not solve this by adding more genre-specific conditionals directly to the existing generic command.

## Veronica

Current observed behavior:

- Veronica does not have a usable `veronica-media metadata` orchestration command.
- Existing Veronica short episodes may contain:
  - `languages/short/script-en.md`
  - `languages/short/script-it.md`
- They may not contain:
  - `languages/script-en.md`
  - `languages/script-it.md`
- Generic metadata dry-runs therefore fail before a provider call.
- `packages/veronica-media/src/delivery/delivery-bundle.ts` already accepts metadata supplied in a delivery bundle.
- An Italian-specific Veronica metadata helper currently appears unused outside its unit test.

## History

History must also use the shared metadata generator through a genre-owned orchestration path.

Inspect the existing History CLI, episode structure, localization helpers, delivery/publication manifests, and artifact layout before modifying code.

History metadata must be generated from the narration variant actually being published.

Do not assume History and Veronica use identical internal path utilities even if their final layouts are currently similar.

---

# Required Architecture

Prefer this shape:

```text
CLI
  |
  +--> veronica-media metadata
  |      |
  |      +--> Veronica metadata adapter
  |               |
  |               +--> shared variant-aware metadata orchestration
  |                         |
  |                         +--> shared YouTube metadata generator
  |
  +--> history metadata
         |
         +--> History metadata adapter
                  |
                  +--> shared variant-aware metadata orchestration
                            |
                            +--> shared YouTube metadata generator
```

The shared orchestration layer may own:

- common invocation contract;
- canonical variant validation;
- locale normalization where already shared;
- cache/artifact identity construction;
- metadata artifact validation;
- force/reuse semantics;
- provider-independent dry-run planning;
- structured result type.

Genre adapters should own:

- episode lookup;
- narration path resolution;
- genre-specific episode identifiers;
- genre-specific publication/delivery integration;
- genre-specific metadata context inputs;
- any genre-specific title/description/tag policy already established.

Do not move domain-specific filesystem knowledge into the metadata generator itself.

---

# Core Design Rule

The selected media variant is a first-class input.

A request equivalent to:

```ts
{
  genre: 'veronica',
  locale: 'en',
  variant: 'short',
}
```

must never accidentally read, cache, generate, deliver, or publish metadata associated with:

```ts
{
  genre: 'veronica',
  locale: 'en',
  variant: 'full',
}
```

The same invariant applies to History.

---

# Canonical Variant Type

First inspect whether the repository already has a canonical media/episode/narration variant type.

Reuse it if suitable.

Otherwise introduce the narrowest shared type necessary, for example:

```ts
export type YouTubeMetadataVariant = 'full' | 'short';
```

Prefer domain aliases if they improve API clarity:

```ts
type VeronicaMediaVariant = YouTubeMetadataVariant;
type HistoryMediaVariant = YouTubeMetadataVariant;
```

Do not pass arbitrary strings internally.

At CLI/process boundaries, validate the runtime value before converting it into the typed variant.

Do not silently normalize unsupported values.

---

# Shared Orchestration Contract

Prefer a small API equivalent to:

```ts
interface GenerateEpisodeYouTubeMetadataInput {
  genre: SupportedMetadataGenre;
  episodeId: string;
  locale: string;
  variant: YouTubeMetadataVariant;

  narrationPath: string;
  artifactPath: string;

  // Existing shared generator context only.
  // Do not invent redundant metadata schemas.
}

interface GenerateEpisodeYouTubeMetadataResult {
  genre: SupportedMetadataGenre;
  episodeId: string;
  locale: string;
  variant: YouTubeMetadataVariant;

  narrationPath: string;
  artifactPath: string;

  cacheStatus: 'hit' | 'miss' | 'bypass';
  generated: boolean;
}
```

This is illustrative.

Conform to existing repository types and naming.

Avoid adding an abstraction if an equivalent one already exists.

---

# Narration Resolution

## General rule

Metadata orchestration must receive the exact narration path selected for the requested:

- genre;
- episode;
- locale;
- variant.

It must not rediscover or substitute another variant later.

Resolve the narration before provider invocation.

Missing narration must fail before a provider request.

---

# Veronica Narration Resolver

Create or extend one canonical Veronica resolver equivalent to:

```ts
resolveVeronicaMetadataNarration({
  episodeRoot,
  locale,
  variant,
});
```

Expected semantics for the currently observed Veronica layout:

```text
full:
  languages/script-{locale}.md

short:
  languages/short/script-{locale}.md
```

If canonical Veronica episode-layout utilities already exist, extend/reuse those instead of constructing paths independently.

Do not duplicate this mapping in:

- CLI;
- delivery;
- metadata generator;
- tests;
- publication adapters.

One production resolver should own it.

---

# History Narration Resolver

Create or extend one canonical History resolver equivalent to:

```ts
resolveHistoryMetadataNarration({
  episodeRoot,
  locale,
  variant,
});
```

Before implementation, inspect History's existing canonical layout.

Use existing History path/layout helpers where possible.

If the established History layout is:

```text
full:
  languages/script-{locale}.md

short:
  languages/short/script-{locale}.md
```

reuse that mapping.

If History already uses a different canonical short/full layout, preserve it.

Do not force History into Veronica's filesystem layout merely to share code.

The shared orchestration layer should consume a resolved narration path, not know how History arrived at it.

---

# Fail-Closed Resolution

A missing requested narration variant must produce a domain-level error containing sufficient diagnostic context.

Include at least:

- genre;
- episode ID;
- locale;
- variant;
- expected narration path.

Prefer an existing domain error pattern.

Do not expose a raw ambiguous `ENOENT` as the only diagnostic.

Do not perform these fallbacks:

```text
short -> full
full -> short
it -> en
de -> en
localized -> source locale
```

unless an explicit existing product policy requires that exact fallback.

If such a policy exists, document it and make it explicit in the resolved plan/result.

Never introduce a fallback only to make the smoke test pass.

---

# Metadata Artifact Identity

Metadata artifacts must be unambiguously scoped by:

- genre;
- episode;
- locale;
- variant.

Use an existing artifact-layout abstraction if one exists.

Do not create incompatible parallel conventions.

If no canonical layout exists, prefer deterministic semantics equivalent to:

```text
<episode-root>/
  metadata/
    full/
      en.json
      it.json
      de.json
    short/
      en.json
      it.json
      de.json
```

This is an example only.

Use repository conventions where established.

---

# Cache Identity

The cache identity must distinguish at least:

```text
genre
episode
locale
variant
effective narration/content fingerprint
generator/schema version
material generation inputs
```

Reuse the existing shared cache mechanism.

Do not build a second cache.

Variant separation must be explicit even if the narration hash would currently make collisions unlikely.

These must not collide:

```text
veronica / episode-1 / en / full
veronica / episode-1 / en / short

history / episode-1 / en / full
history / episode-1 / en / short
```

Also ensure equivalent episode IDs across genres cannot collide if cache storage is shared.

---

# Dry-Run Semantics

Implement or reuse a provider-free dry-run path.

Dry-run should verify:

- episode resolution;
- locale validation;
- variant validation;
- narration resolution;
- narration existence;
- artifact destination;
- cache identity/planning;
- delivery/publication target compatibility where practical.

Dry-run must not:

- invoke OpenAI;
- invoke another metadata provider;
- mutate production metadata;
- publish;
- upload;
- regenerate narration;
- regenerate images.

A dry-run must be sufficient to prove the original Veronica failure has been fixed.

---

# Veronica CLI

Add the smallest genre-native command consistent with existing CLI conventions.

Prefer an invocation equivalent to:

```bash
pnpm youtube veronica-media metadata \
  --episode <episode> \
  --variant short \
  --locale en
```

If the CLI supports multiple locales consistently, support something equivalent to:

```bash
pnpm youtube veronica-media metadata \
  --episode <episode> \
  --variant short \
  --locales en,it
```

Use the repository's existing argument conventions rather than introducing incompatible flags.

Support existing metadata options only where already meaningful, such as:

- `--force`;
- `--dry-run`;
- provider/model selection if already exposed;
- output root if already part of the CLI family.

Do not add unrelated switches.

---

# History CLI

Add or complete a History-owned metadata command consistent with existing History CLI conventions.

Prefer an invocation equivalent to:

```bash
pnpm youtube history metadata \
  --episode <episode> \
  --variant full \
  --locale en
```

And, where History short narration exists:

```bash
pnpm youtube history metadata \
  --episode <episode> \
  --variant short \
  --locale en
```

If History commands already use another command hierarchy, extend it instead of inventing a competing one.

Do not require users to invoke the defective generic command for normal History metadata generation after this change.

---

# Generic CLI

Do not make a large generic CLI rewrite.

The current hard-coded full behavior should not remain the only production route for Veronica or History.

Choose the smallest safe treatment:

1. leave the generic full-only command backward compatible and direct Veronica/History users to genre-native commands; or
2. make the generic command accept an additive variant argument only if the existing architecture supports it cleanly.

Do not inject a growing switch such as:

```ts
if (genre === 'veronica') { ... }
else if (genre === 'history') { ... }
```

for narration layout resolution.

Genre adapters must own that behavior.

If retaining the generic command, document its semantics accurately.

---

# Veronica Delivery Integration

Trace:

`packages/veronica-media/src/delivery/delivery-bundle.ts`

and all relevant callers.

Generated metadata should flow into the existing delivery bundle through the metadata input it already accepts.

Prefer:

```text
metadata command/orchestrator
    -> typed metadata artifact/result
        -> delivery bundle
```

Do not make the delivery bundle call the metadata provider.

Do not make delivery independently rediscover the narration variant.

Do not make delivery guess which metadata file to use based on filesystem ordering or existence.

Variant consistency must be explicit:

```text
short delivery -> short metadata
full delivery  -> full metadata
```

If a delivery bundle contains a variant field, validate that the supplied metadata artifact has the same variant.

Fail closed on mismatch.

---

# History Delivery / Publication Integration

Trace the actual History publication/export/delivery flow.

Identify the canonical structure that carries:

- title;
- description;
- tags;
- localized metadata;
- upload/publication inputs.

Wire the generated metadata artifact into that existing structure.

Do not invent a second History publication representation if one already exists.

Prefer:

```text
History metadata orchestration
    -> typed artifact/reference
        -> existing History delivery/publication input
```

History publication must consume metadata matching the exact:

- episode;
- locale;
- variant.

If History currently reads metadata directly from a filesystem path, replace duplicated path construction with the canonical resolver/artifact reference where bounded and safe.

Do not expand the task into redesigning the entire History publishing subsystem.

---

# Orchestration Integration

Metadata generation should become an explicit reusable orchestration step for both genres.

Inspect existing production pipelines before changing them.

Prefer an explicit step such as:

```text
resolve narration
-> ensure/generate metadata
-> build delivery/publication bundle
-> publish/export
```

The pipeline should reuse cached valid metadata automatically.

Do not require provider regeneration every time an episode is rebuilt.

Do not trigger metadata generation during unrelated image-only regeneration.

Do not trigger metadata generation during map/diagram-only regeneration.

---

# Idempotency

Repeated orchestration with unchanged inputs must be safe.

Expected behavior:

```text
run 1:
  resolve -> cache miss -> generate -> validate -> persist

run 2:
  resolve -> cache hit -> reuse
```

`--force`, if supported, may explicitly bypass reuse.

Never overwrite another locale or variant as a side effect.

---

# Metadata Context

Reuse the inputs expected by the shared metadata generator.

Do not introduce genre-specific metadata schemas unless existing product rules require extra context.

Where genre-specific context is already available, pass it through the shared generator's supported extension points.

Potential context may include:

- episode subject/title;
- narration;
- locale;
- channel/genre;
- duration/format;
- full vs short;
- existing content policy/profile.

Do not send irrelevant asset data to the provider.

Do not include image prompts, generated images, or unrelated visual plans unless the shared metadata contract explicitly requires them.

---

# YouTube Shorts Semantics

For `variant=short`, ensure the metadata generator receives enough explicit context to know it is producing metadata for a YouTube Short if the shared generator already supports such a field.

Do not infer this solely from a path string deep inside the metadata provider layer.

Prefer a typed format/variant signal.

Do not create hard-coded marketing copy such as `#Shorts` unless that is an existing metadata policy.

Preserve shared validation rules.

---

# Localization

Metadata must remain locale-specific.

At minimum preserve support for the locales already used by each genre.

For the existing Veronica short episode, smoke-test:

- `en`;
- `it`.

For History, use existing episode locales.

Do not assume every History episode has every configured locale.

Generate only explicitly requested/available locales.

Do not fall back to another language invisibly.

---

# Existing Italian Veronica Helper

Locate the Italian-specific Veronica metadata helper currently used only by unit tests.

Determine whether it is:

1. legacy duplicated generation;
2. a localization transformation still required;
3. reusable normalization;
4. dead code.

There must be one production metadata-generation path after this task.

Preferred outcomes:

- integrate genuinely useful locale logic behind the shared generator/orchestration contract; or
- remove/deprecate the helper if fully superseded.

Do not leave two competing generators active.

Preserve useful tests by moving them to the canonical behavior where practical.

Document the final disposition in the implementation report.

---

# Shared Code Boundary

Before introducing a new package/module, inspect whether the existing shared metadata package is the correct home for orchestration helpers.

If the generator package should remain provider/domain focused, place the orchestration helper in the narrowest existing shared YouTube application layer.

Avoid:

- circular dependencies;
- History importing Veronica;
- Veronica importing History;
- CLI-owned domain logic;
- delivery-owned provider logic.

A desirable dependency direction is:

```text
shared metadata contracts/generator
        ^
        |
shared metadata orchestration
      ^       ^
      |       |
Veronica    History
      ^       ^
      |       |
     CLI     CLI
```

Adapt to actual package boundaries.

---

# Error Handling

Use repository-standard typed/domain errors.

Differentiate where useful:

- invalid variant;
- unsupported locale;
- episode not found;
- narration missing;
- metadata validation failure;
- metadata provider failure;
- metadata artifact mismatch;
- delivery variant mismatch.

Errors should preserve enough cause/context for debugging without leaking secrets or full narration.

---

# Observability

Use existing structured logging conventions.

Include fields equivalent to:

```ts
{
  genre,
  episodeId,
  locale,
  variant,
  narrationPath,
  metadataArtifactPath,
  cacheStatus,
  dryRun,
}
```

When generation occurs, include existing provider/model identifiers if already logged elsewhere.

Do not log:

- full narration text;
- API keys;
- auth tokens;
- provider request bodies containing sensitive content.

Avoid noisy per-line logging.

---

# Tests: Shared Orchestration

Add focused unit tests for any new shared orchestration code.

At minimum verify:

- variant is part of cache/artifact identity;
- genre is part of cache/artifact identity when shared;
- dry-run performs no provider call;
- missing resolved narration fails before provider invocation;
- cached valid metadata is reused;
- force semantics behave as existing metadata infrastructure defines.

Do not recreate shared generator tests already covered elsewhere.

---

# Tests: Veronica Resolver

Cover at minimum:

```text
full + en
short + en
short + it
```

Verify:

- full resolves full narration;
- short resolves short narration;
- missing short narration fails;
- no short -> full fallback;
- locale is respected;
- invalid CLI variant fails runtime validation.

For a short request, assert that the required narration path is:

```text
languages/short/script-en.md
```

not:

```text
languages/script-en.md
```

Perform equivalent Italian coverage where inexpensive.

---

# Tests: History Resolver

Cover History's actual canonical layout.

At minimum:

- a full locale resolves correctly;
- missing requested narration fails closed;
- locale does not fall back silently;
- variant is preserved through the resolver.

If History supports/contains short narration:

- test short resolution;
- assert short does not resolve full narration;
- test artifact/cache separation for History full vs short.

If no current production History short asset exists:

- use a focused fixture to validate short mechanics if short is a supported target;
- do not fabricate or mutate a real episode just for the test.

---

# Tests: CLI

Add focused CLI/orchestration coverage.

## Veronica

Prove:

```text
genre=veronica
variant=short
locale=en
```

resolves:

```text
languages/short/script-en.md
```

and does not require:

```text
languages/script-en.md
```

Also cover Italian.

## History

Prove the History command resolves the canonical History narration path for the requested variant and locale.

Assert no provider call during dry-run.

Do not snapshot huge CLI outputs.

Prefer semantic assertions.

---

# Tests: Delivery / Publication

## Veronica

Prove a short Veronica delivery bundle receives short metadata.

Prove a mismatch such as:

```text
delivery.variant = short
metadata.variant = full
```

fails closed if both variants are represented in the contract.

## History

Prove the History delivery/publication path consumes metadata for the requested episode/locale/variant.

Avoid full external upload tests.

Use the narrowest existing seam or fixture.

---

# Provider-Free Smoke Tests

Use real existing episode structure where safe.

## Veronica

Use the existing Veronica episode that currently has only short localized scripts.

Dry-run at least:

```text
short / en
short / it
```

Expected:

- episode resolves;
- locale resolves;
- short narration resolves;
- correct metadata destination is planned;
- variant-specific cache identity is planned;
- no provider call occurs.

This directly verifies the original defect.

## History

Select one existing History episode with a known localized narration.

Dry-run at least one full locale.

If an existing History short narration is available, also dry-run one short locale.

Expected:

- correct History resolver is used;
- artifact destination is correct;
- no provider call occurs.

Do not spend paid provider tokens on routing verification.

---

# Optional Fixture Generation

If existing test infrastructure provides a deterministic/mock metadata provider, perform one end-to-end local orchestration test per genre:

```text
narration resolve
-> shared generator
-> validation
-> artifact persist
-> delivery/publication bundle
```

Do not add a heavy new fake-provider framework solely for this task.

---

# Backward Compatibility

Existing generic metadata behavior must not regress.

Existing non-Veronica/non-History genres must remain unaffected.

Existing full-video metadata flows must remain valid.

Shared metadata schemas should remain unchanged unless a genuine defect requires an additive change.

Any shared API change must be:

- minimal;
- typed;
- additive where practical;
- covered by affected tests.

Do not modify unrelated visual generation, TTS, scene planning, maps, diagrams, or uploads.

---

# Performance

Avoid unnecessary filesystem scans.

Prefer deterministic path construction through canonical layout helpers.

Avoid reading full narration multiple times in one orchestration invocation.

Reuse validated cached metadata before provider invocation.

Avoid hashing unrelated episode assets.

Do not rebuild metadata when only images are regenerated and metadata inputs are unchanged.

If the existing cache already handles content hashing correctly, reuse it rather than layering another hash system on top.

---

# Security

Do not log provider credentials.

Do not expose secrets in errors.

Do not execute arbitrary paths supplied through CLI without using existing episode-root/path validation.

Preserve repository path traversal protections.

Do not weaken metadata validation to make existing data pass.

---

# Documentation

Update only the smallest relevant CLI/runbook documentation.

Document:

- Veronica metadata command;
- History metadata command;
- `full` vs `short`;
- locale selection;
- dry-run;
- cache reuse;
- force behavior if supported.

Do not produce a large architecture document unless the repository requires one for shared-package changes.

Inline documentation should explain invariants and non-obvious variant/cache behavior, not restate code.

---

# Implementation Sequence

Execute in this order.

## Phase 1 — Inspect

1. Locate shared YouTube metadata generator public API.
2. Locate shared metadata schema/validation.
3. Locate shared metadata cache/fingerprint implementation.
4. Locate generic CLI hard-coded full narration behavior.
5. Locate Veronica CLI registration.
6. Locate Veronica canonical episode/path utilities.
7. Locate Veronica delivery bundle and callers.
8. Locate Italian Veronica metadata helper.
9. Locate History CLI registration.
10. Locate History canonical episode/path utilities.
11. Locate History publication/delivery/export flow.
12. Locate existing metadata-related History code.
13. Locate existing variant types.

Do not perform broad unrelated repository exploration.

## Phase 2 — Decide the boundary

14. Reuse an existing canonical variant type if available.
15. Decide the narrowest home for shared orchestration.
16. Keep narration path resolution genre-owned.
17. Keep provider generation shared.
18. Keep delivery/publication provider-free.

Record only consequential architecture decisions in code/docs.

## Phase 3 — Shared mechanics

19. Add/reuse typed variant-aware orchestration input.
20. Add/reuse deterministic artifact identity.
21. Ensure cache identity scopes genre/episode/locale/variant.
22. Add/reuse dry-run planning.
23. Preserve shared validation.
24. Preserve cache reuse and force behavior.

## Phase 4 — Veronica

25. Implement/reuse canonical Veronica narration resolver.
26. Implement `veronica-media metadata` command.
27. Wire requested locale/variant into shared orchestration.
28. Persist metadata using canonical variant-aware layout.
29. Feed artifact/result into existing delivery bundle.
30. Enforce delivery/metadata variant consistency.
31. Resolve the Italian helper duplication/dead-code question.

## Phase 5 — History

32. Implement/reuse canonical History narration resolver.
33. Implement/complete `history metadata` command.
34. Wire requested locale/variant into shared orchestration.
35. Persist metadata using canonical variant-aware layout.
36. Feed artifact/result into existing History publication/delivery path.
37. Enforce publication/metadata episode-locale-variant consistency.

## Phase 6 — Tests

38. Add focused shared orchestration tests only if shared code changed.
39. Add Veronica resolver tests.
40. Add Veronica CLI dry-run test.
41. Add Veronica delivery metadata test.
42. Add History resolver tests.
43. Add History CLI dry-run test.
44. Add History publication/delivery metadata test.
45. Verify cache/artifact separation.

## Phase 7 — Smoke

46. Dry-run existing Veronica short EN.
47. Dry-run existing Veronica short IT.
48. Dry-run one existing History localized full episode.
49. Dry-run one History short locale if an existing short asset is available.
50. Confirm zero provider calls for all dry-runs.

## Phase 8 — Validation

51. Run focused metadata tests.
52. Run affected Veronica tests.
53. Run affected History tests.
54. Run affected CLI tests.
55. Run typecheck/build for changed packages only.
56. Run focused lint for touched files.
57. Run shared metadata tests only if shared metadata code changed.

Do not run the complete monorepo suite unless an actual cross-cutting failure forces escalation.

---

# Git Safety

Before edits:

```bash
git status --short
```

Do not discard unrelated user changes.

Keep the implementation bounded.

If the working tree contains unrelated changes, preserve them.

Do not use destructive reset/checkout commands.

Create logical commits/checkpoints only if the current repository workflow expects the agent to commit.

Do not commit generated paid-provider artifacts.

---

# No-Stop Policy

Do not stop for minor implementation questions.

Resolve local ambiguity by:

1. existing repository conventions;
2. existing types/contracts;
3. nearest analogous implementation;
4. smallest backward-compatible change.

Only report a blocker if implementation is genuinely impossible without missing required information or an unsafe architectural change.

Do not ask for permission to proceed between phases.

---

# Scope Guard

Do not modify:

- image generation;
- visual prompt generation;
- History V3.x visual planning;
- maps;
- diagrams;
- TTS;
- transcription;
- thumbnails;
- unrelated publication providers;
- unrelated genres;
- SaaS/API surfaces outside metadata integration.

Do not regenerate videos.

Do not regenerate images.

Do not perform paid metadata provider calls just to validate routing.

---

# Acceptance Criteria

The task is complete only when all applicable criteria pass.

## Shared

- [ ] Shared YouTube metadata generator remains the single production generator.
- [ ] Variant is a typed first-class input.
- [ ] Runtime CLI variant validation exists.
- [ ] Metadata artifact identity includes locale and variant.
- [ ] Shared cache cannot collide across full/short.
- [ ] Shared cache cannot collide across Veronica/History when sharing storage.
- [ ] Dry-run does not invoke a provider.
- [ ] Missing narration fails before provider invocation.
- [ ] Valid cached metadata is reused.

## Veronica

- [ ] A usable Veronica metadata command exists.
- [ ] `short/en` resolves `languages/short/script-en.md`.
- [ ] `short/it` resolves `languages/short/script-it.md`.
- [ ] Short does not silently fall back to full.
- [ ] Full uses canonical full narration.
- [ ] Metadata is persisted per locale/variant.
- [ ] Delivery receives the exact generated/reused metadata artifact.
- [ ] Short delivery cannot consume full metadata accidentally.
- [ ] Existing short EN dry-run passes.
- [ ] Existing short IT dry-run passes.
- [ ] Italian helper has one documented disposition.

## History

- [ ] A usable History metadata command exists.
- [ ] History narration resolution uses canonical History layout helpers.
- [ ] Full metadata resolves the requested localized narration.
- [ ] Short metadata resolves the short narration when supported.
- [ ] History does not silently fall back across variants/locales.
- [ ] History metadata is persisted per locale/variant.
- [ ] History publication/delivery consumes the exact metadata artifact.
- [ ] History artifact/cache identity is variant-aware.
- [ ] Existing localized History full dry-run passes.
- [ ] Existing History short dry-run passes if a real short asset exists.
- [ ] No paid provider call is needed for smoke validation.

## Regression

- [ ] Existing generic full metadata behavior is not broken.
- [ ] Other genres are unaffected.
- [ ] Existing metadata schema validation still runs.
- [ ] Focused tests pass.
- [ ] Affected typecheck/build passes.
- [ ] Focused lint passes.

---

# Desired Example Commands

Report the actual commands after inspecting the CLI.

Target ergonomics should be equivalent to:

```bash
pnpm youtube veronica-media metadata \
  --episode l01-s01-being-good-isnt-enough \
  --variant short \
  --locales en,it \
  --dry-run
```

```bash
pnpm youtube history metadata \
  --episode <history-episode> \
  --variant full \
  --locale en \
  --dry-run
```

If an existing History short asset exists:

```bash
pnpm youtube history metadata \
  --episode <history-episode> \
  --variant short \
  --locale en \
  --dry-run
```

Do not force these exact syntaxes if the repo already has a canonical CLI style.

---

# Final Report

Return a concise implementation report with exactly these sections:

1. `VERDICT: PASS | PARTIAL | BLOCKED`
2. `SHARED ARCHITECTURE`
3. `FILES CHANGED`
4. `VERONICA COMMAND`
5. `HISTORY COMMAND`
6. `VARIANT RESOLUTION`
7. `ARTIFACT + CACHE IDENTITY`
8. `VERONICA DELIVERY`
9. `HISTORY DELIVERY/PUBLICATION`
10. `ITALIAN HELPER`
11. `DRY-RUN RESULTS`
12. `VALIDATION`
13. `REGRESSIONS`
14. `REMAINING BLOCKERS`
15. `EXAMPLE COMMANDS`

For `DRY-RUN RESULTS`, explicitly report:

```text
Veronica short/en: PASS | FAIL
Veronica short/it: PASS | FAIL
History full/<locale>: PASS | FAIL
History short/<locale>: PASS | NOT AVAILABLE | FAIL
Provider calls during dry-run: 0
```

For `VALIDATION`, list only commands actually run and their result.

Do not claim tests or smoke runs that were not executed.
