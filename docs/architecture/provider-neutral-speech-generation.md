# Provider-neutral speech generation

`SpeechGenerationService` is the provider-neutral application boundary. Production API
startup migrates the additive speech schema and composes PostgreSQL profile, cache,
generation, quota, usage, and audit adapters with workspace-scoped filesystem artifacts.
The connected CLI calls that API. Existing episode, math, Dark Truth, educational, and
benchmark file contracts now use a deprecated compatibility facade that executes each
request through the same service; the facade is scheduled for removal after 2026-10-01.

```text
API / CLI / workflow / web
              |
              v
     SpeechGenerationService
       | profile + consent
       | estimate + quota reservation
       | cache claim / wait / reuse
       v
 SpeechProviderRegistry ---- OpenAI adapter
       |                `--- ElevenLabs adapter
       v
 raw artifact persistence -> deterministic concatenation -> canonical FLAC mastering
       v
 generation state, usage ledger, audit, bounded metrics/logs/spans
```

Profile resolution is replacement request (operator-only), persisted video override,
genre default, then the active system OpenAI profile. Normal generation uses exactly the
video → genre → OpenAI system order. The resolved immutable version is pinned to the
generation. A provider error never triggers another provider or voice.

Text is NFC-normalized only for cache identity. Punctuation, numbers, and meaningful
whitespace are preserved. The cache key includes schema version, language, provider,
model, voice, settings, dictionary versions, output format, profile version, and
mastering version. A unique cache authority owns a fenced lease; concurrent callers wait
for or reuse its master. Forced requests create a separate lineage and do not overwrite
the cache authority.

Long narration splits at paragraph, sentence, then clause boundaries. Chunks preserve
all characters and are generated sequentially per video. Raw responses remain unchanged
under `speech/raw/<generation>/<index>.*`. The canonical master is two-pass normalized,
48 kHz mono signed-16 FLAC at -16 LUFS and no more than -1.5 dBTP.

The additive PostgreSQL repository is the production authority. Every application
operation opens a transaction, establishes workspace RLS context, and persists immutable
profile versions, policies, generations, chunk attempts, artifacts, quota reservations,
usage, and audits. Retry pins the original profile version—even if deprecated—and reuses
only successful chunks whose index and narration hash still match. Cache publication is
fenced; force/replacement lineage never replaces the ordinary cache authority.
Provider configuration is runtime-validated with Zod. Instrumentation excludes narration,
credentials, consent evidence, voice IDs, request IDs, and other unbounded labels.

The repository does not yet persist canonical video narration for lookup by video ID, so
production estimate/generate/retry requests currently require explicit `text` and
`language`. Episode journal execution and the server-rendered web administration view
still need direct API orchestration before the compatibility facade can be removed.

The final renderer should encode the mixed program as AAC-LC, 48 kHz stereo, 192 kbps,
approximately -14 LUFS, and no more than -1 dBTP. That is a renderer responsibility.
