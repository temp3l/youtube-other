# Veronica source-pack ingestion

Veronica source packs are translated at the ingestion boundary, not in visual, speech, image, or render code.

`VeronicaContentPack2Adapter` discovers `content-packs/vero/veronica-content-pack-2/shorts/<locale>/<authored-key>.md`, groups equal authored keys across locales, hashes the exact source bytes, and emits a canonical source episode. Its stable episode identity is the Pack 2 authored key (for example, `01a-revenue-is-not-a-good-business`), which already satisfies the shared opaque episode-ID contract.

Preparation writes the canonical episode workspace under `episodes/<episode-id>/`, a provenance descriptor, a planner-input artifact, and the current pipeline's canonical locale script. The script is an automatically materialized derived copy; the descriptor retains the external Pack 2 path, SHA-256, locale, pack identity, and adapter version for invalidation.

Use `mediaforge veronica-media source-pack prepare --pack <pack-root> --workspace episodes --episode-id <authored-key> --language en` to perform this prepare-only boundary. It does not invoke planning or any provider.

Pack 2 provides neither a source visual plan nor visual-reuse metadata. Both are intentionally represented as absent/empty in the canonical planner input. During production preparation, the visual-plan resolver runtime-validates this input and its source hashes, then executes the same deterministic Veronica visual planner used by the legacy positioning workflow. It persists `source/visual-plan.json` as a derived compatibility artifact with planner-input, source, configuration, and plan-revision hashes.

Resolution precedence is explicit: a legacy or human-authored plan remains authoritative; a matching derived plan is reused; a stale or missing derived plan is regenerated from `visual-planner-input.v1.json`; and an episode with neither artifact fails closed. The legacy positioning-pack adapter remains unchanged and continues to own `meta/visual-reuse-manifest.json`.

## Full-transcripted Pack Wave 01

`content-packs/full-transcripted-pack/production-wave-01/` contains ten finished, QA-approved English narrations: five Shorts and five long-form videos. The `prepare-full-transcripted` command reads the exact script bytes and Wave 01 `qa.json`, then records the story ID, source transcript IDs, source-quality flags, and QA gates in the canonical source descriptor and episode manifest. The remaining editorial briefs are deliberately excluded until they have an approved narration script and equivalent QA evidence.

Use the short story ID or its canonical slug:

```bash
mediaforge veronica-media source-pack prepare-full-transcripted \
  --pack content-packs/full-transcripted-pack \
  --workspace episodes \
  --episode-id S001 \
  --format short
```

For a long-form narration, use `--episode-id L004 --format long`. Shorts materialize to `languages/short/script-en.md`; long-form scripts materialize to `languages/script-en.md`. Both variants produce `source/canonical-source-episode.v1.json` and `source/visual-planner-input.v1.json`, then continue through `veronica-media prepare-production` and the existing gated QA, review, speech, and image stages.
