# History V3.4 Focused Codex Prompt Pack

## Existing reference packs

These extracted directories already exist:

```text
episodes/history-youtube-history-10-video-story-pack-02-napoleons-invasion-of-russia-v3.4/
episodes/history-youtube-history-10-video-story-pack-03-fall-of-the-roman-empire-v3.4/
episodes/history-youtube-history-10-video-story-pack-04-black-death-v3.4/
episodes/history-youtube-history-10-video-story-pack-05-franklin-expedition-v3.4/
```

Treat them as **reference approval artifacts only**.

Do not:
- patch these generated files as the implementation;
- make them canonical episode roots;
- overwrite them during development;
- use their current gate states as proof that the generator is fixed.

All behavior changes must be implemented in source code, planners, validators, schemas, CLI integration, and tests. Final artifacts must be produced by regenerating the pipeline.

Mark them as references:

```bash
for d in episodes/*-v3.4; do
  test -d "$d" && touch "$d/.REFERENCE_APPROVAL_PACK_DO_NOT_PATCH"
done
```

## Execution sequence

Use a new Codex session for every prompt and commit after each accepted stage:

```text
00 — repository analysis only
01 — Franklin golden fixture
02 — Napoleon second fixture
03 — generalize to Rome and Black Death
04 — publishing readiness
05 — independent final audit
```

Do not run the entire pack as one goal.

## Authority policy

History remains `trusted-script`.

Optional OpenAI calls may be used only for non-research semantic structuring. They must not perform web search, source retrieval, or evidence assessment. Application code remains authoritative for IDs, spans, entity types, canonical places, coordinates, graph validity, timing, gates, and deterministic packaging.
