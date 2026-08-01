# Provider-neutral speech generation

`SpeechGenerationService` is the provider-neutral application boundary introduced by
this change. The connected speech CLI, workflow adapter, and web administration model
target that boundary. The HTTP routes accept an injected `SpeechApiUseCases` boundary.
Production server composition and migration of the legacy episode, math, benchmark, and
educational callers remain rollout work; until then, the unconfigured HTTP routes return
a deliberate 503 and the legacy OpenAI path is still reachable.

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

The additive PostgreSQL repository is the intended production authority and applies
workspace row-level security, but it is not yet fully adapted to every application port
or composed at production startup. Local CLI adapters may bind the same ports to the
filesystem conformance implementation.
Provider configuration is runtime-validated with Zod. Instrumentation excludes narration,
credentials, consent evidence, voice IDs, request IDs, and other unbounded labels.

The final renderer should encode the mixed program as AAC-LC, 48 kHz stereo, 192 kbps,
approximately -14 LUFS, and no more than -1 dBTP. That is a renderer responsibility.
