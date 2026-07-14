# AI Content Pack

## Current-State Decision

`docs/ai-context/` is the existing pack convention. The current
`context-pack.md` is manually dated and describes a prior dirty-tree state; no
deterministic build/status/validate scripts were found during the initial
inspection. The refactor will evolve this location rather than create a parallel
top-level pack.

The pack is curated documentation plus selected schemas and indexes, never a
repository dump.

## Target Structure

```text
docs/ai-context/
├── README.md
├── MANIFEST.json
├── repository-map.md
├── source-index.json
├── architecture/
├── cli/
├── profiles/
├── darktruth/
├── mathematics/
├── schemas/
├── operations/
├── testing/
└── migration/
```

Existing numbered files may remain as generated compatibility outputs while
consumers migrate. `context-pack.md` becomes a generated compact entry point or
redirect, not an independently maintained source.

## Generator

Add deterministic commands using repository naming conventions:

```bash
pnpm ai-pack:build
pnpm ai-pack:validate
pnpm ai-pack:status
```

The generator reads an explicit source configuration. It normalizes line
endings, orders entries lexically, hashes source bytes, renders indexes, rejects
unexpected files, and writes atomically. A generation timestamp may vary in the
manifest; content files and all other fields must be deterministic for the same
revision and inputs.

## Manifest Contract

`MANIFEST.json` contains:

- pack schema and generator versions;
- generation timestamp and repository revision/dirty marker;
- included pack files with size and SHA-256;
- mapped source files with hashes;
- explicit exclusions and reasons;
- total pack size and per-file limit status;
- required-section coverage;
- known limitations and unresolved source mappings.

`source-index.json` maps concepts and symbols to current paths and optional
anchors: CLI bootstrap, registry, engine, state, artifact resolver, cache, batch,
providers, Dark Truth bibles/references/tasks, media tasks, mathematics
curriculum/correctness/renderer, metadata/publishing, errors, and observability.
Validation fails when a mapped file or required symbol disappears.

## Included Content

- repository/package map and ownership boundaries;
- canonical task/engine/artifact/state/cache/batch/provider/observability design;
- complete CLI reference, common workflows, recovery, and deprecations;
- separate Dark Truth and mathematics profiles and workflows;
- selected public schemas or concise generated schema references;
- configuration precedence with redacted examples;
- deterministic testing and migration/recovery guidance;
- current known risks and compatibility adapters.

## Exclusions and Security

Never include `.env` values, credentials, tokens, private data, dependency or
generated trees, media binaries, fixtures containing production media, transient
logs, provider payload binaries, or large base64. Secret scanning uses patterns
plus an allowlist for documented placeholder names; a match blocks the build and
reports only the file and redacted key type.

Reject binary content, files above configured limits, duplicate output entries,
path escapes, invalid manifests, and excessive total upload size. Split large
sections by concept rather than truncating source silently.

## Validation

`ai-pack:validate` detects stale hashes, missing/obsolete sources or symbols,
missing sections, duplicate entries, invalid JSON/schema, binary/generated-media
inclusion, size violations, credential-like values, broken internal links, and
contradictory command/architecture claims where machine-checkable.

`ai-pack:status` is read-only and returns human or JSON output with freshness,
repository revision, dirty status, changed sources, missing sources, pack size,
and required rebuild action. It exits nonzero when stale or invalid.

## Rollout and Acceptance

1. Audit current files and consumers.
2. Define source configuration and schemas.
3. Implement generator and tests in a bounded tooling package/script.
4. Generate the new pack and compatibility `context-pack.md`.
5. Update `AGENTS.md`/docs only if command or pack usage changes.
6. Validate freshness, secrets, binaries, links, symbols, and size.

Acceptance requires two consecutive builds from unchanged sources to produce
identical content hashes, a clean validation result, coverage of all canonical
concepts, and no generated media or secret material.

