# Veronica content source of truth

## Canonical pack

The only production content source is `veronica-unified-content-pack-v3` at
`content-packs/veronica-unified-content-pack-v3`. Its authoritative manifest is
`manifest.json`; `metadata/series-plan-v2.json` defines release order and the
one-Long/two-Short episode relationship. English is the canonical editorial
locale.

Feature code must use `resolveVeronicaContentSource()` and its indexed registry.
It must not import a content-pack path, scan content directories, infer identity
from filenames, or substitute a different locale. The resolver is rooted at the
pnpm repository marker, validates all data and contained real-file paths, caches
one registry per process, and fails closed. Legacy fallback is always disabled.

## Dependency map

```text
veronica-media source-pack prepare/status/validate
  -> resolveVeronicaContentSource
  -> validated manifest + series registry
  -> canonical source episode + workspace identity
  -> deterministic visual planning / metadata / speech preparation
  -> image planning / source-grounded QA
  -> render / delivery / publishing preparation
```

The workspace manifest and source descriptors carry `contentPackId`, `storyId`,
`seriesEpisodeId`, locale, variant, readiness, the selected narration's SHA-256
`contentHash`, and source-revision identity. Planning rejects non-v2 descriptors.
Metadata, narration, image, QA, supplemental, and render CLI boundaries reject a
Veronica workspace without this canonical identity. Provider dispatch remains a
separate, explicit operation.

Standalone `veronica-render-manifest.v2` artifacts embed that identity directly.
Their creation and resume paths bind it to the selected narration, so auditing a
render does not depend on a separate mutable workspace manifest.

## Corpus and timing

The registry validates 18 episodes, 18 Longs, 36 Shorts, 54 unique English
assets, no duplicates, and no orphans. Planning WPM is centralized in the domain
contract: Long EN/ES/FR/IT/PT 150 and DE 145; Short EN/ES/FR/IT/PT 155 and DE
150. Long planning is 570–630 seconds around 600 seconds. Short planning uses
the pack's locale word bands around 90 seconds. Selected decoded audio becomes
timing authority only after TTS.

English records are `CANONICAL_READY`, not automatically audiovisual
`PRODUCTION_READY`. Existing translations are derived v1-era assets and remain
`LOCALIZATION_REVIEW_REQUIRED`; French timing failures are
`TIMING_REVIEW_REQUIRED`; absent translations are `LOCALIZATION_PENDING` and
fail explicitly. Current known gaps are 24 positioning stories without Spanish,
six `tx-*` stories without DE/ES/FR/IT/PT, and 22 French timing violations.

## Legacy policy

Pack 1, both Pack 2 copies, the editorial-master tree, and full-transcripted
content remain provenance inputs only. CLI access is named `prepare-legacy-*` or
`legacy-plan-*`; it cannot enter canonical production planning. Historical
census/reconciliation scripts remain explicit diagnostics. The two Pack 2 trees
are almost duplicates but their `support/TIMING_REPORT.csv` files differ, so
neither is treated as canonical.

## Updating to a future pack

1. Add the candidate pack without replacing v2.
2. Validate schema, paths, hashes, corpus invariants, timing, and localization.
3. Compare provenance and migrate episode assignments explicitly.
4. Change the single typed pack ID/root contract.
5. Run `pnpm veronica:content:validate` and focused tests.
6. Regenerate downstream artifacts intentionally where `contentHash` changed.

Validation and discovery are read-only and idempotent. They make no provider
calls and never rewrite narration or generated assets.
