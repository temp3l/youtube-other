# History documentaries

The `history` genre is a documentary workflow with evidence and release gates. Imported pack scripts are editorial drafts: structural import records their provenance and keeps every episode blocked from publication until source assessment, claim mapping, chronology, quotation, factuality, media, and publish validation have completed.

See [content-pack-inventory.md](content-pack-inventory.md) for the immutable pack inventory, SHA-256 checksums, and implementation ownership map.

## Presets and formats

Use `mediaforge history presets --json` to inspect the ten registered presets. Supported formats are `short` (45–75 seconds), `standard` (6–10 minutes), and `long` (15–25 minutes). The supplied pack uses a versioned rule that normalizes its legacy `long-form-youtube-video` label to `standard`.

Representative typed configuration:

```json
{"genreId":"history","presetId":"dark-strange-history","format":"short","audienceLevel":"general","narrativeMode":"investigative","audioPreset":"documentary-investigative"}
{"genreId":"history","presetId":"civilization-rise-fall","format":"standard","audienceLevel":"general","narrativeMode":"rise-and-fall","audioPreset":"documentary-neutral"}
{"genreId":"history","presetId":"historical-biography","format":"long","audienceLevel":"enthusiast","narrativeMode":"biographical","audioPreset":"documentary-intimate"}
```

## Content-pack operations

All operations are offline structural operations and call no research, TTS, image, or publishing provider.

```bash
mediaforge content-pack inspect content-packs/youtube-history-10-video-story-pack --json
mediaforge content-pack validate content-packs/youtube-history-10-video-story-pack --genre history --strict --json
mediaforge content-pack import content-packs/youtube-history-10-video-story-pack --genre history --strict --dry-run --json
mediaforge content-pack import content-packs/youtube-history-10-video-story-pack --genre history --strict --collect-errors --json
```

`--strict` is the default and treats manifest and editorial-contract mismatches as failures. `--lenient` allows only safe compatibility mismatches to be reported as warnings. `--fail-fast` stops at the first episode failure; `--collect-errors` (the default) isolates failures and produces an aggregate result. `--dry-run` writes no production artifacts.

An unchanged source, manifest, and README checksum is a no-op. Any of those inputs changing creates a source revision, resets factual/media/release readiness, retains prior artifact history for audit, and invalidates every derived History workflow task before imported checkpoints are replayed.

Imported bibliography links remain `declared-by-pack`, never approved. Source assessment classifies primary, scholarly, institutional, reference, journalism, specialist-secondary, low-confidence, and prohibited evidence. Claims preserve established/consensus/inference/disputed/legend/unknown classifications. Quotations, chronology, consequential numbers, intent, atrocities, and disputed causes remain blocked until their gates pass.

History media uses the common provider-neutral speech, image, rendering, metadata, localization, and publishing services. Audio presets select delivery—not a provider or cloned voice. Generated scenes carry reconstruction status and anti-anachronism constraints. The configured locale contract currently supports `en`, `de`, `es`, `fr`, `pt`, and `it`.

## Visual-plan approval gate

Before any History image generation, create and review a deterministic visual plan. The planner uses episode runtime metadata when present, otherwise its documented 108 words-per-minute default. It writes `history-visual-plan.json`, `history-shot-list.json`, `history-asset-manifest.draft.json`, `history-approval-pack.md`, `history-visual-validation.json`, and `history-visual-approval.json` under the episode `source/` directory. Planning never starts media generation.

```bash
mediaforge history visuals plan history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia
# Read source/history-approval-pack.md, then use its exact hash:
mediaforge history visuals approve history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia --plan-hash <plan-hash>
mediaforge history visuals reject history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia --reason "Need clearer logistics diagram"
```

Approval is bound to the plan's SHA-256 hash. Regenerating a materially changed plan resets it to `AWAITING_VISUAL_APPROVAL`; History image generation rejects missing, rejected, stale, or mismatched approvals. The approval pack includes the exact approve, reject, and regenerate commands plus the runtime, cost-driving asset count, media mix, maps, diagrams, warnings, and beat list.

### Opt-in v2 visual-planning pilot

The legacy v1 workflow above remains the default. `--planner-version v2` is an additive History-only pilot: it creates hash-addressed v2 plan, derivative, diagnostics, and approval-pack files without rewriting v1 artifacts or decisions. It preserves canonical narration ranges, validates sentence boundaries and duration conflicts, records composition for both `16:9` and `9:16`, and emits a renderable shared-scene derivative without generating media.

```bash
mediaforge history visuals plan <episode-id> --planner-version v2 --json
mediaforge history visuals inspect <episode-id> --plan-hash <v2-plan-hash> --json
mediaforge history visuals validate <episode-id> --plan-hash <v2-plan-hash> --json
# After locally generated narration exists; this creates a new timing revision.
mediaforge history visuals reconcile-audio <episode-id> --audio-path episodes/<episode-id>/locales/en/full/audio/narration.wav --json
mediaforge history visuals approve <episode-id> --planner-version v2 --plan-hash <v2-plan-hash> --derivative-hash <v2-derivative-hash>
```

Estimate-only v2 plans are explicitly provisional and may be reviewed, but final renderable approval requires a valid, hash-bound derivative. A source-lineage mismatch, incomplete final sentence, timing conflict, missing ratio variant, unresolved required evidence rights, or stale derivative is a blocking diagnostic. The v2 reconciliation workflow is separately registered as `history.visual-v2-production`, preserving the legacy workflow order during rollout.

### Opt-in V3.3 research and approval packs

V3.3 is an additive History-only contract. Phase A may call OpenAI and live
retrieval providers; it freezes immutable research snapshots. Phase B never
performs live research and is byte-deterministic for the same canonical inputs,
configuration, and frozen snapshot. Application code owns UTF-16 offsets,
identifiers, provenance status, gate state, hashes, and checksums. Model output
is schema-constrained advisory data.

```bash
mediaforge history v3.3 normalize <episode-id> --offline-fixture --json
mediaforge history v3.3 extract-claims <episode-id> --offline-fixture --json
mediaforge history v3.3 retrieve-sources <episode-id> --live-research --refresh-source --json
mediaforge history v3.3 assess-evidence <episode-id> --live-research --refresh-source --json
mediaforge history v3.3 evaluate-provenance <episode-id> --reuse-frozen-snapshot --json
mediaforge history v3.3 freeze <episode-id> --reuse-frozen-snapshot --json
mediaforge history v3.3 plan <episode-id> --reuse-frozen-snapshot --json
mediaforge history v3.3 validate <episode-id> --reuse-frozen-snapshot --json
mediaforge history v3.3 export <episode-id> --reuse-frozen-snapshot --output <directory> --json
mediaforge history v3.3 regenerate <episode-id> --reuse-frozen-snapshot --output <directory> --json
mediaforge history v3.3 compare <episode-a> <episode-b> <episode-c> --output <directory> --regenerate --json
```

`--live-research` is opt-in, requires `OPENAI_API_KEY` (or
`OPENAI_API_TOKEN`), and uses `OPENAI_HISTORY_MODEL` when set, otherwise
`gpt-5-mini`. It uses strict Responses API schemas, bounded batches, SDK
timeouts/retries, retrieval validation, and fail-closed semantic validation.
`--offline-fixture` never makes paid calls. `--reuse-frozen-snapshot` is the
required deterministic packaging mode. `--dry-run`, `--force`, structured JSON,
and human-readable output remain available.

The History long-form V3.3 policy preserves a 600,000 ms preference and allows
480,000–1,200,000 ms. Estimated timing can pass planning validation but cannot
approve production. Unresolved claims block content; missing evidence-bound
maps/diagrams block editorial review and are reported as `not_generated`, not
as passing. See [the V3.3 acceptance audit](../history-v3.3/ACCEPTANCE-AUDIT.md).

## Recommended pilot

The Bronze Age pilot ID is `history-youtube-history-10-video-story-pack-01-bronze-age-collapse`. Its imported configuration is `civilization-rise-fall`, `standard`, `general`, `rise-and-fall`, `documentary-neutral`, with maps and timelines enabled.

```bash
mediaforge content-pack inspect content-packs/youtube-history-10-video-story-pack --json
mediaforge content-pack validate content-packs/youtube-history-10-video-story-pack --genre history --strict --json
mediaforge content-pack import content-packs/youtube-history-10-video-story-pack --genre history --strict --dry-run --json
mediaforge content-pack import content-packs/youtube-history-10-video-story-pack --genre history --strict --collect-errors --json
mediaforge history workflow status history-youtube-history-10-video-story-pack-01-bronze-age-collapse --json
mediaforge history factuality validate history-youtube-history-10-video-story-pack-01-bronze-age-collapse --json
mediaforge workflow history run --episode history-youtube-history-10-video-story-pack-01-bronze-age-collapse --task history.research-brief
mediaforge history workflow status history-youtube-history-10-video-story-pack-01-bronze-age-collapse --json
```

The factuality command initially returns `blocked` because claims, chronology, and verified quotations have not been produced. Run only the next command reported by the workflow. The structural importer and deterministic research-brief task are implemented; source assessment and later model/provider tasks intentionally remain blocked until their canonical implementations are bound. Publishing remains false until factual, media, and release validation all pass.

## Troubleshooting

- `Unsafe manifest path` means an absolute, traversal, or escaping symlink entry was rejected.
- `No versioned ... contract` means the pack needs an explicit compatibility adapter; filenames are never guessed.
- A word-count error requires correcting pack metadata or an approved tolerance change, not editing the immutable source during import.
- Provider credentials are irrelevant to structural import and are never read or called.
