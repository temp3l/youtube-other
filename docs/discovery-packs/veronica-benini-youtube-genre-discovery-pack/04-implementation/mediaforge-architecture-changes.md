# Mediaforge Architecture Changes

## Known repository context

The existing repository is a private pnpm TypeScript/Node.js monorepo.

Primary operational surface:

```text
apps/cli
```

Relevant packages include:

```text
packages/shared
packages/domain
packages/config
packages/story-localization
packages/image-generation
packages/speech
packages/rendering
packages/metadata
packages/youtube-upload
packages/visual-planning
packages/observability
packages/dark-truth
```

Current canonical locales:

```text
en, de, es, fr, pt
```

Current variants:

```text
full, short
```

Current canonical script paths:

```text
episodes/<id>/languages/script-<locale>.md
episodes/<id>/languages/short/script-<locale>.md
```

Active code must use:

```text
createEpisodePathResolver
packages/shared/src/episode-filesystem.ts
```

Do not reintroduce legacy `script.md` layouts.

## Required product changes

### 1. Add Italian

Extend the locale union, Zod schemas, CLI options, path tests, metadata, speech,
caption and upload handling to include `it`.

Migration requirement:

- preserve all existing locales;
- do not change existing path semantics;
- provide compile-time exhaustive handling;
- update fixtures and snapshots.

### 2. Add generic genre registry

Introduce a genre abstraction rather than embedding prompt logic in CLI commands.

Suggested domain:

```text
packages/genres
  src/
    genre.ts
    registry.ts
    loaders/
    strategic-reinvention/
```

A genre definition should configure:

- editorial promise;
- episode modes;
- required beats;
- source policy;
- short extraction policy;
- visual defaults;
- metrics;
- approval requirements.

### 3. Add creator profiles

Suggested domain:

```text
packages/creator-profiles
```

A creator profile overlays:

- canonical locale;
- terminology;
- tone constraints;
- authorship policy;
- voice and likeness policy;
- content boundaries;
- offers and CTAs;
- approval authority.

The genre remains reusable.

### 4. Add content-source provenance

Create a first-class source manifest validated by Zod and JSON Schema.

Required invariants:

- every script beat traces to at least one source;
- rights and access level are explicit;
- source hash is stable;
- publishing is blocked for unclear rights;
- sensitive sources require review;
- private/premium source cannot become public by default.

### 5. Add source-led script adaptation

The stage must not behave like open-ended ghostwriting.

Inputs:

- approved source manifests;
- approved transcripts or notes;
- episode blueprint;
- creator profile;
- genre.

Outputs:

- canonical script;
- beat-to-source map;
- unsupported-inference report;
- quotations and claims register;
- editorial warnings.

For Veronica:

```text
generativeFirstPersonDrafting = false
generativeOpinionDrafting = false
```

### 6. Add approval domain

Approvals must be persistent, fingerprint-bound and audited.

Suggested package:

```text
packages/approvals
```

Required:

- stage and locale granularity;
- invalidation graph;
- second reviewer for high-risk material;
- CLI status/grant/reject/revoke;
- upload hard gate;
- structured observability events.

### 7. Add editorial-documentary visual planner

Do not reuse the `dark-truth` cinematic grammar by default.

Support:

- kinetic typography;
- creator footage;
- approved photos;
- diagrams;
- decision trees;
- timelines;
- worksheets;
- contextual B-roll;
- illustrative metaphors;
- 16:9 and independently composed 9:16 layouts.

### 8. Add multilingual-audio packaging

The rendering package should produce:

```text
master video
canonical audio
localized audio stems
localized subtitles
localized titles/descriptions
localized thumbnail text
audio-track manifest
```

The YouTube package should support a single canonical video with additional reviewed
audio tracks where the API and channel capability permit it.

Do not silently fall back to separate public uploads. The fallback must be explicit.

### 9. Add public/premium policy enforcement

An episode carries:

```text
contentTier: public | lead-generation | premium | private
```

The public renderer and uploader reject premium/private source leakage.

### 10. Add CTA attribution

Episode metadata must include:

- offer ID;
- campaign ID;
- locale-specific destination;
- UTM parameters;
- public/premium boundary;
- analytics correlation ID.

## Reliability work to preserve

The implementation must continue the existing direction:

- strict TypeScript;
- Zod at boundaries;
- explicit stage contracts;
- deterministic workspace resolution;
- idempotent and resumable commands;
- stable manifests;
- content fingerprints and invalidation;
- bounded concurrency;
- typed provider interfaces;
- structured errors and logs;
- dry-run support;
- duplicate-upload protection.

## Known risks to inspect before implementation

Do not assume these have been resolved:

- conflicting script paths and workspace resolvers;
- stale generated artifacts;
- stale `apps/cli/bin/mediaforge.js` distribution;
- per-scene speech generation inefficiency;
- unsafe image filenames;
- bearer-token leakage in telemetry;
- weak remote-render schemas;
- legacy and current pipeline coexistence;
- unverified edit-batch semantics;
- skeleton-only stories pipeline.

## Recommended implementation phases

### Phase A — read-only audit

- inspect repository and branch;
- map authoritative schemas and pipeline DAG;
- verify current test status;
- identify stale/legacy paths;
- write a plan and decision register;
- do not modify production behavior.

### Phase B — foundational domain

- add `it`;
- genre registry;
- creator profiles;
- source schema;
- approval domain.

### Phase C — pipeline integration

- source-led script adaptation;
- editorial visual planner;
- localization QA;
- audio-track packaging;
- CTA metadata.

### Phase D — uploader and safety

- publish gate;
- multi-language audio capability adapter;
- explicit fallback;
- duplicate prevention;
- audit logging.

### Phase E — pilot fixture

- one fully mocked Italian episode;
- English and Spanish localizations;
- full + Short;
- no real external API calls;
- deterministic acceptance tests.

## Definition of done

- no legacy path reintroduction;
- full strict TypeScript build;
- Zod validation at all file/provider/CLI boundaries;
- deterministic fixtures;
- unit and integration tests;
- resume and invalidation tests;
- approval bypass tests;
- rights-block tests;
- no secret leakage;
- documentation and migration guide;
- an operator can run an end-to-end dry run from a clean checkout.
