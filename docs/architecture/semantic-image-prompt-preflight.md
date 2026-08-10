# Semantic image-prompt preflight

`@mediaforge/shared` owns the versioned strict schema, bounded OpenAI Responses request, persistent cache, structural quality gate, and deterministic prompt-assembly primitives. The capability is enabled fail-closed only by the Veronica and History adapters.

- One canonical content ID or History episode produces one brief containing every asset. Locale, subtitles, TTS settings/duration, render timing, and image seed are excluded from cache identity.
- Canonical narration meaning, approved visual treatment, adapter/direction/prompt/schema versions, configured planner model, and genre factual-context hashes invalidate the brief.
- Final prompts project semantic action, takeaway, subject, environment, objects, composition, camera/lens, lighting, motion opportunities, aspect ratio, and text-free constraints. Existing image/reference identity remains authoritative and changed prompt hashes are reported as `STALE_BY_SEMANTIC_PROMPT`; files are not deleted.
- Veronica adapter v2 gives narration semantics precedence over conflicting legacy treatment, rejects narration-unrequired abstract treatment, and structurally selects whole prompt clauses. Provider-facing prompts target 250–350 words, fail before provider execution above 450 words, and never use blind tail truncation.
- Veronica blocks generic luxury/editorial drift and reuses one canonical brief/image set for EN, DE, IT, FR, and PT. History remains on its v1 adapter and default assembly path.
- History consumes the frozen V3.5 trusted narration, claims, entities, chronology, geography, map/diagram state IDs, and existing figure-reference decisions. It performs no research or claim extraction. Map geometry, diagram topology, evidence scope, and reference attachment cannot be changed by the semantic model.

Planner models use the configured OpenAI story model, with optional `VERONICA_IMAGE_PROMPT_PLANNER_MODEL` or `HISTORY_IMAGE_PROMPT_PLANNER_MODEL` overrides. Repository cache hits make no OpenAI call.

Inspect without image generation:

```bash
pnpm mediaforge -- veronica-media images derive-image-prompts --workspace episodes --episode-id l01-s01-being-good-isnt-enough --variant short --dry-run --json
pnpm mediaforge -- veronica-media images inspect-image-prompts --workspace episodes --episode-id l01-s01-being-good-isnt-enough --json
pnpm mediaforge -- history visuals derive-image-prompts <episode-id> --json
pnpm mediaforge -- history visuals inspect-image-prompts <episode-id> --json
```

Use `--refresh-image-prompt-brief` on a derive command to refresh only this cache. Optional live smoke tests are the same derive commands without fixture/dry-run flags; they call only the text planner and never generate images.
