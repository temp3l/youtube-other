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
