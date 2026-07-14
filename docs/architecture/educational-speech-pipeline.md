# Educational Speech Pipeline

## Pre-implementation audit (2026-07-13)

- Canonical operator surface: `apps/cli/src/math-commands.ts`. It creates and resumes the
  `@mediaforge/math-education` workflow. Localized narration already keeps `displayText` and
  deterministic `spokenText` separate for `de`, `en`, `es`, `fr`, and `pt`.
- Canonical reusable speech implementation: `@mediaforge/speech`. It owns the OpenAI-compatible
  provider, request builder, validation, chunk cache, FFmpeg assembly, mastering, telemetry, and
  the staged story narration pipeline.
- Current educational audio: `packages/math-rendering/src/audio/mock-tts.ts` creates nine long
  deterministic test tones and concatenates them. It is used only by the provider-free media
  slice and tests; the math CLI's `tts` and `timing-reflow` stages are skipped.
- Renderer status: `@mediaforge/math-rendering` is the active math workflow renderer.
  `@mediaforge/educational-renderer` is an isolated standalone renderer with chalk-write support,
  audio input, and scene-level narration cues, but no production caller or TTS implementation.
- Competing non-educational paths remain: the CLI legacy localized generator and
  `@mediaforge/dark-truth` both wrap `SpeechProvider`; staged story narration is opt-in. Their
  documentary presets, voices, pacing, and compatibility behavior must remain unchanged.
- Provider defaults: OpenAI-compatible speech uses `gpt-4o-mini-tts`; generic/Dark Truth voice
  resolution defaults to `onyx`. The API request contains only supported `input`, `model`, `voice`,
  `instructions`, `response_format`, and `speed` fields.
- Current gaps: no production educational profile or CLI, no semantic educational chunk model,
  no explicit board-aware pause plan, no real educational cache/workflow record, no candidates,
  no bounded educational retry policy, and no actual-audio timing reflow. Generic chunk cache
  fingerprints are strong but do not name every educational profile/dictionary/post-process input.
  Generic assembly normalizes to PCM and supports retained boundary silence/crossfades; crossfade
  is disabled by default. Mastering changes loudness but not tempo or pitch.

## Implementation plan

1. Add one versioned, typed `education-natural-teacher` profile and language-specific resolution
   in `@mediaforge/speech`; keep documentary settings untouched.
2. Add pure educational normalization, pronunciation, semantic beat/chunk, pause, candidate, cache
   key, presentation-sync, and retry planning. Reuse the existing OpenAI request builder,
   `SpeechProvider`, validation, chunk cache, assembly, mastering, and telemetry.
3. Add a resumable educational speech orchestrator with atomic candidate artifacts, explicit
   selection, conservative/no tempo correction, dry-run inspection, and structured workflow logs.
4. Adapt math narration segments to educational beats, persist authoritative `tts` and
   `timing-reflow` artifacts, and invalidate downstream workflow stages without deleting files.
5. Add `math speech` CLI commands and explicit overrides. Default only this educational surface to
   the natural-teacher profile; require OpenAI configuration for paid generation.
6. Add fake-provider integration tests, deterministic English/German listening fixtures,
   renderer-neutral board timing, cache/retry/resume tests, and Dark Truth isolation coverage.

Compatibility risks are limited to additive schemas/exports and math workflow invalidation. Cache
keys are versioned, so the new profile intentionally misses older educational audio. Existing CLI
global OpenAI model/voice overrides remain higher priority than profile defaults. No story or Dark
Truth default is migrated.

## Implemented production path

`math speech generate` is the educational operator surface. The authoritative flow is:

1. Load the workflow-owned `locales/<language>/narration.json`. Its `displayText` remains a renderer
   input; only `spokenText` enters speech normalization.
2. Resolve the typed `education-natural-teacher` profile and its language-specific instructions,
   rate, voice override, pause/chunk/post-process policies, and versioned pronunciation dictionary.
3. Normalize mathematical speech, plan board-linked teaching beats and deterministic pauses, then
   pack complete beats into semantic 20–45 second chunks when the source length permits. Oversized
   units split only at safe sentence/clause boundaries; an unsafe split fails.
4. Build every OpenAI request through `buildOpenAiTtsChunkRequest`. The provider receives only the
   supported `input`, `model`, `voice`, `instructions`, `response_format`, and `speed` fields.
5. Generate and validate candidate WAV files atomically. Reuse the shared cache, audio validator,
   FFmpeg assembler, and mastering layer. Promote `narration.wav` only after every selected chunk,
   assembly, and mastering step succeeds.
6. Record speech and presentation-sync artifacts in math stages `tts` and `timing-reflow`, then mark
   render and later stages stale. A subsequent render must use the new speech lineage.

The earlier math tone generator remains a provider-free media test fixture. It is not called by the
new command. Story, generic documentary, and Dark Truth voice resolution still defaults to `onyx`
and is not routed through the educational profile.

## Default delivery and language behavior

The natural-teacher profile is version `education-natural-teacher.v1`, targets 150 WPM, uses a
provider speed of `1`, and defaults to OpenAI model `gpt-4o-mini-tts`. Explicit global model and
voice settings or `--speech-voice` win; values are never silently replaced. Instructions are authored
separately for `de`, `en`, `es`, `fr`, and `pt`. Unsupported languages fail profile resolution.

Pause ranges are deterministic within these configurable bounds:

| Kind | Range |
| --- | ---: |
| `micro` | 100–250 ms |
| `step-transition` | 300–500 ms |
| `board-reading` | 500–900 ms |
| `result-reveal` | 350–650 ms |
| `section-transition` | 600–1,000 ms |

Only semantic transitions receive a planned pause; punctuation does not create a pause after every
sentence. Paragraph boundaries preserve internal teaching beats for native provider instructions.
Chunk boundaries and the final board-inspection hold use deterministic composed silence. The
presentation-sync artifact records writing start/end, narration start/end, overlap, pause application,
inspection time, and the earliest next-step start. The standalone educational renderer accepts the
same opt-in chalk timing and holds the completed board content until the inspection window ends.

## Text and pronunciation artifacts

The TTS-only normalizer handles decimal points and German decimal commas, negative values,
percentages, fractions, powers, equations/operators, common units, abbreviations, dates, and ranges.
It uses contextual patterns; it never rewrites display text. `speech-plan.json` retains all four
forms: display text, original spoken text, normalized spoken text, and final dictionary-adjusted TTS
text.

Default dictionaries live at:

`config/speech-profiles/education-natural-teacher/pronunciation/<language>.v1.json`

Entries are literal, ordered deterministically, scoped, enableable, and versioned. Additional custom
dictionaries may be supplied through the package API. Increment the dictionary version whenever an
entry changes so cache compatibility is explicit.

## Candidates, cache, and resume

`--speech-candidates 2` or `3` generates alternatives only for introductions, major explanations,
final answers, and recaps. Other chunks remain single-candidate. Files use stable paths such as
`candidates/candidate-02/chunks/narr-chunk-001.wav`. No subjective auto-scoring occurs. Candidate 1
is selected unless `--speech-selection narr-chunk-001=2` is given, and all candidates remain on disk.

The educational cache key covers provider and base-URL identity, model and optional snapshot, voice,
language, final normalized input, complete instructions, profile/version, dictionary version and
fingerprint, format, provider and assembly sample rates, WPM/provider speed, pause/chunk/post-process
policies, candidate number, and centralized request fingerprint. `--regenerate-speech` bypasses reuse
without deleting an accepted candidate first. Resume walks chunks in stable order: valid cache hits
are retained and generation continues at the first missing, stale, invalid, or incomplete artifact.

Zero-byte, undecodable, mostly silent, hash-mismatched, or failed-validation files are never cache
hits. Candidate audio and metadata use temporary files plus atomic rename. Final narration promotion
occurs only after successful assembly and light mastering.

## Joining and pacing safety

Assembly decodes every selected chunk into 48 kHz mono PCM, trims only excess edge silence, retains
70 ms of boundary silence, and inserts planned chunk-transition and final-inspection silence. A 30 ms
equal-power crossfade is available only when no explicit pause exists and retained silence protects
consonants. The final-pause switch is educational-only; generic and Dark Truth assembly retain their
existing no-tail-pause default. Mastering uses light compression, `-17 LUFS`, and a `-2 dB` true-peak
ceiling.

No `atempo` or pitch filter is used. Generation is instructed toward the requested rate. The workflow
records the hypothetical tempo ratio and warns outside `0.97–1.03`; the current profile applies no
tempo correction. Large board holds belong in presentation timing, not destructive speech stretching.

## Workflow and observability

`workflow-log.json` records provider, model, optional model snapshot, voice, language, profile and
dictionary versions, input hash, cache counts, request count, chunks/candidates, selected candidates,
attempts, validation status, request latency, generated durations, text/audio ratios, hypothetical
tempo ratios, post-processing time, warnings, errors, timestamps, and exit code. Logs omit API keys,
headers, and binary audio. The math manifest owns the final log and audio hashes and records whether
a paid provider was actually called.

Transient rate-limit, timeout, network, capacity, and HTTP 502/503/504 failures receive at most three
attempts with bounded exponential backoff. Authentication, unsupported language, invalid input or
configuration, deterministic schema failures, and other deterministic 4xx failures are not retried.
A failed candidate leaves every earlier valid candidate available for resume.

## CLI

Preview without calls or final writes:

```bash
pnpm mediaforge -- math speech generate \
  --lesson m5-zo-001-standard \
  --workspace /path/to/math-workspace \
  --language de \
  --speech-dry-run
```

Generate with the educational defaults and an existing OpenAI configuration:

```bash
pnpm mediaforge -- --tts-provider openai-compatible \
  math speech generate \
  --lesson m5-zo-001-standard \
  --workspace /path/to/math-workspace \
  --language de
```

Explicit example:

```bash
pnpm mediaforge -- --tts-provider openai-compatible \
  --openai-speech-model gpt-4o-mini-tts \
  math speech generate \
  --lesson m5-zo-001-standard \
  --workspace /path/to/math-workspace \
  --language en \
  --speech-profile education-natural-teacher \
  --speech-voice cedar \
  --speech-rate 150 \
  --speech-candidates 2 \
  --speech-selection narr-chunk-001=2
```

`--speech-dry-run` prints effective provider/model/voice/language/profile, chunks, text size, stable
paths, cache decisions, candidate cost notice, and planned pauses. It does not instantiate a paid
provider or create the output root.

## Manual listening evaluation

English and German fixtures cover an introduction, equation, three calculation steps, a common
mistake, final answer, and recap. Generate both the previous generic-style baseline and new profile:

```bash
pnpm mediaforge -- --tts-provider openai-compatible \
  math speech compare --language en --output /tmp/math-speech-en

pnpm mediaforge -- --tts-provider openai-compatible \
  math speech compare --language de --output /tmp/math-speech-de
```

Run first with `--speech-dry-run`. A real comparison makes two uncached passes and can cost roughly
twice a single candidate. Listen with the same explicit `--speech-voice` and `--speech-rate` when
isolating delivery instructions from voice choice. Do not commit generated comparison audio.

## Troubleshooting

| Symptom | Inspect | Action |
| --- | --- | --- |
| Robotic, uniform rhythm | effective profile/instructions in `speech-plan.json` | confirm natural profile; regenerate after fixing a stale override |
| Too many/few pauses | chunk pause fields and `assembly-manifest.json` | adjust the versioned pause policy; avoid punctuation edits as timing hacks |
| Wrong math pronunciation | original/normalized/TTS text and dictionary report | add a literal language entry and bump dictionary version |
| Abrupt transition | validation edge-silence metrics and assembly entry order | inspect clipped source audio; do not increase crossfade across consonants |
| Narration too slow | measured duration, WPM, hypothetical tempo ratio | adjust `--speech-rate` or provider instruction; do not use heavy `atempo` |
| Board timing mismatch | `presentation-sync.json` and chalk timing | compare writing/narration/inspection timestamps and rerun timing-reflow/render |
| Stale audio reused | cache record fingerprint and profile/dictionary versions | use `--regenerate-speech` once; fix missing version bumps before repeating |
| Resume stops | failed chunk/candidate and retry classification in workflow log | repair auth/config/input errors, then rerun without deleting valid chunks |
