# Episode Migration Plan

## Inventory fields

The migration utility must report:

- episode slug
- current candidate script paths
- inferred language
- inferred variant
- file hash
- normalized content hash
- duplicate group
- divergence status
- target canonical path
- collision risk
- recommended action

## Known high-priority inventory

| Episode | Current layouts | Languages | Risk | Action |
|---|---|---|---|---|
| `001-calhoun-experiment` | root, `languages`, `audio/script-source` | many | duplicate and unsupported language set | compare and keep canonical languages |
| `009-mary-gloria-the-christmas-doll` | root, `<lang>/full`, `<lang>/short`, audio source | en/de/es/fr/pt partial | generated/authored ambiguity | manual classification |
| `010-*` | root, de full/short, en short | en/de | duplicate slugs | manual owner decision |
| `011-*` | root, en script, localized full | en/de/es/fr/pt | multiple variants | compare |
| `014-hachishakusama...` | root, en script, en/full, en/short, de/full | en/de | divergence risk | compare |
| `021-the-rake...` | root, en script, en/full, de full/short, source cleaning | en/de | lineage refs point to old paths | compare and update refs |
| `022-the-whistler-in-the-woods` | root, en script, en/full, de/full, languages en/de | en/de | highest priority conflict | manual if any divergence |

## Utility behavior

- `--dry-run`: default, no writes.
- `--write`: moves only when no collision and content equality policy is satisfied.
- no silent overwrite.
- no silent English fallback.
- path containment checks for every source and target.
- structured JSON and Markdown reports.
- deterministic move order.
- rollback notes listing original paths and git commands.

## Divergent files

If `episodes/<slug>/script.md` and `episodes/<slug>/languages/script-en.md` differ after normalization, mark:

```text
MANUAL_RESOLUTION_REQUIRED
```

Do not choose one automatically.

## Post-migration validation

Resolve and parse:

- `episodes/022-the-whistler-in-the-woods/languages/script-en.md`
- `episodes/022-the-whistler-in-the-woods/languages/script-de.md`

Then run dry-run setup validation through discovery, language, variant, analysis, scene, image, narration, audio slicing, subtitles, render setup, and output isolation.
