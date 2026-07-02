# Episode Workspace Layout Audit

## Discovered layouts

| Layout | Example | Readers | Writers | Purpose | Status | Risk | Migration |
|---|---|---|---|---|---|---|---|
| `languages/script-<lang>.md` | `episodes/022-the-whistler-in-the-woods/languages/script-en.md` | desired resolver, manual operators | manual/content import | authored multilingual full scripts | CANONICAL_CANDIDATE | missing variant dimension if Shorts diverge | keep for full |
| `languages/short/script-<lang>.md` | planned | future resolver | manual/content import | authored Short scripts | CANONICAL_CANDIDATE | no current widespread evidence | create only when needed |
| root `script.md` | `episodes/022-the-whistler-in-the-woods/script.md` | `short-rewrite.resolution`, docs, legacy commands | story rewrite compatibility | English full compatibility | ACTIVE_NONCANONICAL | duplicates English, can diverge | compare then remove |
| `en/script.md` | `episodes/022-the-whistler-in-the-woods/en/script.md` | Dark Truth analysis evidence | old episode parser | English full source | LEGACY | ambiguous with `en/full` | compare then remove |
| `<lang>/full/script.md` | `episodes/022-the-whistler-in-the-woods/de/full/script.md` | analysis, dark-truth, story services | story localization | full output/compatibility | ACTIVE_NONCANONICAL | generated vs authored ambiguity | generated output only |
| `<lang>/short/script.md` | `episodes/009-mary-gloria.../de/short/script.md` | short/render/audio flows | short rewrite | Short output/compatibility | ACTIVE_NONCANONICAL | generated vs authored ambiguity | generated output only |
| `locales/<locale>/<variant>/...` | `episodes/022.../locales/en/full/audio/narration.wav` | staged narration/upload | speech pipeline | generated staged artifacts | GENERATED_OUTPUT | not source scripts | preserve as output |
| `source/<slug>-<lang>-full.md` | `episodes/022.../source/022...-en-full.md` | story localization | rewrite commands | source-cleaning lineage | GENERATED_OUTPUT | may be mistaken for canonical | keep lineage only |
| `audio/script-source-*.md` | `episodes/001.../audio/script-source-en.md` | legacy audio | audio generation | compatibility source for audio | LEGACY | duplicate script text | remove after staged audio |

## Active episodes using multiple layouts

- `001-calhoun-experiment`: root `script.md`, `languages/script-*.md`, `audio/script-source*.md`.
- `009-mary-gloria-the-christmas-doll`: root, `<lang>/full`, `<lang>/short`, audio source files.
- `010-*`, `011-*`, `012-*`, `014-*`, `021-*`: root and/or `<lang>/<variant>`.
- `022-the-whistler-in-the-woods`: root, `en/script.md`, `en/full/script.md`, `de/full/script.md`, `languages/script-en.md`, `languages/script-de.md`, source files, staged locale audio.

## Cache implications

Cache identities must include episode slug, language, variant, resolver-relative path, and content hash. Path normalization must not reuse a cache entry if the resolved canonical content differs from previous compatibility content.

## Migration action

Run a dry-run inventory that computes hashes for every candidate. Identical duplicates can be removed after consumer migration. Divergent duplicates must be reported for manual resolution.
