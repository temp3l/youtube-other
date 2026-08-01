# Codex Implementation Prompt — Strategic Reinvention Genre and Veronica Benini Profile

You are working inside the private `mediaforge` pnpm TypeScript/Node.js monorepo.

Implement a reusable `strategic-reinvention` genre and a separate
`veronica-benini` creator profile. The implementation must be production-grade,
strictly typed, resumable, auditable and safe for creator-owned content.

## Operating mode

Use planning mode first.

Use multiple agents only for read-only analysis or clearly isolated work. Do not let
parallel agents edit overlapping files or make conflicting architecture decisions.
The lead agent owns integration, migrations and final validation.

Do not start by writing code. First inspect the repository and establish what is
authoritative today.

## Known context to verify

- `apps/cli` is the primary operational surface.
- Relevant packages may include `shared`, `domain`, `config`,
  `story-localization`, `image-generation`, `speech`, `rendering`, `metadata`,
  `youtube-upload`, `visual-planning`, `observability` and `dark-truth`.
- Existing canonical locales are `en/de/es/fr/pt`.
- Variants are `full/short`.
- Canonical scripts should be:
  - `episodes/<id>/languages/script-<locale>.md`
  - `episodes/<id>/languages/short/script-<locale>.md`
- Active code must use `createEpisodePathResolver` from
  `packages/shared/src/episode-filesystem.ts`.
- Legacy `script.md` layouts must not be reintroduced.
- Existing risks may include conflicting workspace resolvers, stale artifacts,
  stale `apps/cli/bin/mediaforge.js`, per-scene audio inefficiency, unsafe image
  filenames, bearer-token telemetry, weak remote-render schemas, legacy/current
  coexistence, unverified edit-batch semantics and a skeleton-only stories pipeline.

Treat all of these as hypotheses until verified in the current branch.

## Required discovery output

Before implementation, create:

- `docs/plans/strategic-reinvention-implementation-plan.md`
- `docs/audits/strategic-reinvention-repository-audit.md`
- `docs/decisions/strategic-reinvention-decision-register.md`
- a current pipeline DAG;
- a file/package ownership map;
- a list of conflicts with existing abstractions;
- a test and migration strategy.

Stop and report any unresolved decision that could cause data loss, path migration,
publishing risk or creator-rights bypass.

## Product model

Implement two distinct concepts:

```text
genre: strategic-reinvention
creatorProfile: veronica-benini
```

The genre is reusable. The creator profile is an overlay and must not leak into
generic packages.

Use the supplied files in this pack as the initial contract:

- `03-product-spec/genre.strategic-reinvention.yaml`
- `03-product-spec/creator.veronica-benini.yaml`
- `03-product-spec/content-source.schema.json`
- `03-product-spec/episode-blueprint.schema.json`
- `03-product-spec/approval-workflow.md`
- `04-implementation/acceptance-criteria.md`

Copy these into an appropriate repository-controlled configuration or fixture
location without weakening their constraints.

## Non-negotiable authorship rule

For the `veronica-benini` profile:

```text
generativeFirstPersonDrafting = false
generativeOpinionDrafting = false
```

The pipeline may structure, condense and adapt approved creator-authored source
material, but it must not invent first-person experiences, opinions, memories,
claims or advice in her name.

Every script beat must trace to approved source IDs.

Produce:

- beat-to-source map;
- claims register;
- quotation register;
- unsupported-inference report;
- public/premium boundary report.

Fail the stage when unsupported first-person content exists.

## Required implementation

### 1. Italian locale

Add `it` as a first-class supported locale across:

- domain types;
- Zod schemas;
- CLI;
- path resolver;
- localization;
- speech;
- captions;
- metadata;
- rendering;
- upload packaging;
- fixtures and tests.

Preserve existing locale and path behavior.

### 2. Genre registry

Create or extend a typed genre registry.

A genre controls:

- episode modes;
- narrative beats;
- source policy;
- Short extraction rules;
- visual grammar;
- approval gates;
- metric definitions.

Avoid prompt-only configuration. Parse at runtime through Zod and expose inferred
TypeScript types.

### 3. Creator-profile registry

Creator profile controls:

- canonical locale;
- terminology;
- tone constraints;
- authorship;
- voice and likeness;
- content boundaries;
- offers and CTA;
- approval authority.

Provide merge semantics with explicit precedence:

```text
system safety > legal/rights > genre > creator profile > episode override
```

Episode overrides may only narrow permissions, never expand them without an explicit
grant.

### 4. Content-source provenance

Implement the supplied source schema.

Persist source manifests in a deterministic episode location resolved through the
canonical filesystem abstraction.

Required enforcement:

- explicit rights status;
- allowed transformations;
- permitted locales;
- commercial-use flag;
- access level;
- sensitivity;
- stable SHA-256 hash;
- approver and approval time.

Unknown, permission-required or blocked rights must prevent public rendering and
publishing.

### 5. Episode blueprint

Implement the supplied blueprint schema.

Story-beat identity must remain stable across locales and independent of localized
scene numbering.

### 6. Approval domain

Implement persistent, fingerprint-bound approvals for:

- source;
- canonical script;
- localization;
- voice;
- render;
- publish.

Changing upstream inputs invalidates downstream approvals.

Add CLI commands:

```bash
mediaforge approvals status <episode-id> [--json]
mediaforge approvals grant <episode-id> --stage <stage> [--locale <locale>]
mediaforge approvals reject <episode-id> --stage <stage> [--locale <locale>]
mediaforge approvals revoke <episode-id> --stage <stage> [--locale <locale>]
```

Add structured audit events. Do not log secrets or sensitive source text.

### 7. Source-led script adaptation stage

Inputs:

- approved sources;
- genre;
- creator profile;
- episode blueprint.

Outputs:

- approved-candidate canonical script;
- source map;
- claims/quotes;
- unsupported inferences;
- sensitivity warnings;
- premium leakage report.

The output is not publishable before creator approval.

### 8. Editorial-documentary visual planner

Add a visual strategy suitable for creator-led education:

- kinetic typography;
- diagrams;
- timelines;
- decision trees;
- worksheets;
- creator-supplied footage and photography;
- contextual B-roll;
- restrained illustration.

Do not default to `dark-truth` cinematic scene generation.

Generate independent 16:9 and 9:16 composition plans.

Synthetic likeness is prohibited for the supplied profile.

### 9. Multilingual packaging

Italian is canonical.

Generate reviewed assets for `en/es/de/fr/pt` from the approved Italian script:

- localized script;
- terminology report;
- subtitles;
- narration/dub;
- metadata;
- thumbnail text;
- CTA destination;
- audio-track manifest.

Prefer one YouTube video with additional reviewed audio tracks. Implement a capability
adapter because channel/API availability can differ. Do not silently publish duplicate
videos as a fallback.

### 10. Public/premium enforcement

Add:

```text
public | lead-generation | premium | private
```

Block public output when a source or episode violates the boundary.

### 11. YouTube publishing gate

The uploader must require:

- exact render fingerprint;
- exact metadata fingerprint;
- locale/audio-track scope;
- active rights grants;
- current publish approval;
- duplicate-upload check.

`autoPublish` must remain false.

### 12. Observability and security

Use structured logs and metrics.

Required security checks:

- bearer tokens and secrets are redacted;
- source text is not emitted in normal logs;
- filenames are normalized;
- provider errors are typed;
- external calls use timeouts and bounded retries;
- concurrency is bounded;
- audit events are immutable or append-only;
- `doctor` detects stale built CLI artifacts.

## Tests

Implement all acceptance criteria in
`04-implementation/acceptance-criteria.md`.

Use mock providers. No paid external calls in CI.

Add at least one deterministic end-to-end fixture:

- creator: `veronica-benini`;
- genre: `strategic-reinvention`;
- canonical Italian full episode;
- Italian Short;
- English and Spanish localization;
- mock audio and visual assets;
- all approvals;
- dry-run upload package;
- resume from a partially completed stage;
- source-change invalidation.

## Documentation

Update `AGENTS.md` and the repository's AI context documents where applicable.

Add:

- architecture;
- configuration;
- source onboarding;
- creator onboarding;
- approval runbook;
- localization workflow;
- YouTube audio-track packaging;
- migration guide;
- operator dry run;
- limitations and open decisions.

## Execution checkpoints

After each phase:

1. run formatting, lint, typecheck and relevant tests;
2. record changed files;
3. record decisions;
4. record unresolved risks;
5. commit only a coherent checkpoint if repository policy allows;
6. do not proceed through failing gates.

## Final report

Return:

- implemented architecture;
- migration impact;
- commands to run;
- tests and results;
- remaining decisions;
- known risks;
- sample dry-run output;
- exact files that require operator or Veronica approval.

Do not claim support for a YouTube feature unless it is verified through the current
integration and channel capability.
