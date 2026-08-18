# Veronica source-pack ingestion

Veronica narration enters production only through the canonical content source
documented in [the source-of-truth contract](../veronica-content-source-of-truth.md).

`resolveVeronicaContentSource()` locates the fixed
`veronica-unified-content-pack-v3` root from the pnpm repository root, validates
its manifest and series plan, checks every narration is a contained real file,
validates the 54-entry `visual-direction.v1.json`, and builds one in-memory
registry. It does not recursively discover packs or
fall back to older directories.

Use either a series episode or one story:

```bash
pnpm mediaforge -- veronica-media source-pack prepare \
  --workspace episodes --episode 7 --language en

pnpm mediaforge -- veronica-media source-pack prepare \
  --workspace episodes --story-id osc-l04 --language en
```

Episode preparation materializes the Long and two Shorts as separate canonical
story workspaces. Each workspace records pack, story, series episode, slot,
locale, readiness, source-revision, and selected narration byte-hash identity in
`source/canonical-source-episode.v1.json`,
`source/visual-planner-input.v1.json`, and `manifest.json`. Missing translations
fail explicitly; English is never substituted for a requested locale.

Each story carries schema-validated visual premise, concrete object and
environment systems, optional identity continuity, progression, and thumbnail
direction. Its visual-direction hash participates in the canonical source
revision, fresh-run portfolio context, and V3 plan hash, so editorial direction
changes cannot reuse a stale plan.

Production visual planning requires the v2 source descriptor, validates its
source bytes, and binds derived visual plans to narration and revision hashes.
Metadata, narration, image, QA, supplemental, and render command boundaries
also require the canonical workspace identity. Veronica render manifests embed
the same identity and fail closed when it is absent or differs during resume.

## Local inspection

```bash
pnpm veronica:content:status
pnpm veronica:content:validate
pnpm veronica:content:validate --strict-locales
```

These commands are read-only and provider-free. Default validation reports
known localization work without failing; strict locale mode fails on those
gaps. Canonical structural or English timing failures always fail closed.

## Fresh English semantic planning

The packaged CLI is the supported zero-provider planner entry. It verifies that
the CLI, domain, and strategic-reinvention build fingerprints match source
before running; it never accepts a reused plan as fresh semantic evidence.

```bash
pnpm --filter @mediaforge/domain build
pnpm --filter @mediaforge/strategic-reinvention build
pnpm --filter @mediaforge/cli build
node apps/cli/bin/mediaforge.js veronica-media source-pack plan-english \
  --repository-root . --output-dir artifacts/<fresh-run> --json
```

`--legacy-baseline` creates a separate V2 comparison run only. The default
creates V3 source-span semantic plans, portfolio validation, and a zero-provider
ledger; each invocation requires a new output directory. Long plans compile 16
crop-safe base assets into 48 distinct semantic regions, while provider prompts
are generated from structured depictions rather than narration-copy claims.

## Legacy adapters

Pack 2 and full-transcripted adapters remain only for provenance/debug work:

```bash
mediaforge veronica-media source-pack prepare-legacy-pack2 ...
mediaforge veronica-media source-pack prepare-legacy-full-transcripted ...
mediaforge veronica-media legacy-plan-positioning-series ...
mediaforge veronica-media legacy-plan-positioning-calibration ...
```

Their descriptors are rejected by production planning. They cannot become the
active source through discovery order or missing-v2 fallback.
