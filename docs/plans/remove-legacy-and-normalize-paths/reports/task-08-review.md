# Task 08 Episode Layout Migration Review

Generated from saved migration JSON reports. Episode data under `episodes/` is git-ignored; rollback paths are preserved in `task-08-write.json`.

## Initial Dry Run Summary
- already_canonical: 7
- safe_move: 36
- identical_duplicate: 7
- divergent_duplicate: 18
- target_collision: 0
- stale_unsupported_layout: 0
- invalid_language_or_variant: 7
- filesystem_error: 2

## Resolved Safe Moves
- performed safe moves: 36
- episodes/009-mary-gloria-the-christmas-doll/de/full/script.md -> episodes/009-mary-gloria-the-christmas-doll/languages/script-de.md
- episodes/009-mary-gloria-the-christmas-doll/de/short/script.md -> episodes/009-mary-gloria-the-christmas-doll/languages/short/script-de.md
- episodes/009-mary-gloria-the-christmas-doll/en/full/script.md -> episodes/009-mary-gloria-the-christmas-doll/languages/script-en.md
- episodes/009-mary-gloria-the-christmas-doll/en/short/script.md -> episodes/009-mary-gloria-the-christmas-doll/languages/short/script-en.md
- episodes/009-mary-gloria-the-christmas-doll/es/full/script.md -> episodes/009-mary-gloria-the-christmas-doll/languages/script-es.md
- episodes/009-mary-gloria-the-christmas-doll/es/short/script.md -> episodes/009-mary-gloria-the-christmas-doll/languages/short/script-es.md
- episodes/009-mary-gloria-the-christmas-doll/fr/full/script.md -> episodes/009-mary-gloria-the-christmas-doll/languages/script-fr.md
- episodes/009-mary-gloria-the-christmas-doll/fr/short/script.md -> episodes/009-mary-gloria-the-christmas-doll/languages/short/script-fr.md
- episodes/010-010-the-cleaner-of-death/de/full/script.md -> episodes/010-010-the-cleaner-of-death/languages/script-de.md
- episodes/010-010-the-cleaner-of-death/de/short/script.md -> episodes/010-010-the-cleaner-of-death/languages/short/script-de.md
- episodes/010-010-the-cleaner-of-death/en/short/script.md -> episodes/010-010-the-cleaner-of-death/languages/short/script-en.md
- episodes/010-010-the-cleaner-of-death/script.md -> episodes/010-010-the-cleaner-of-death/languages/script-en.md
- episodes/010-the-cleaner-of-death/de/full/script.md -> episodes/010-the-cleaner-of-death/languages/script-de.md
- episodes/010-the-cleaner-of-death/de/short/script.md -> episodes/010-the-cleaner-of-death/languages/short/script-de.md
- episodes/010-the-cleaner-of-death/en/short/script.md -> episodes/010-the-cleaner-of-death/languages/short/script-en.md
- episodes/010-the-cleaner-of-death/source/010-the-cleaner-of-death-en-full.md -> episodes/010-the-cleaner-of-death/languages/script-en.md
- episodes/011-the-black-eyed-children/de/full/script.md -> episodes/011-the-black-eyed-children/languages/script-de.md
- episodes/011-the-black-eyed-children/es/full/script.md -> episodes/011-the-black-eyed-children/languages/script-es.md
- episodes/011-the-black-eyed-children/pt/full/script.md -> episodes/011-the-black-eyed-children/languages/script-pt.md
- episodes/012-the-elevator-game/de/full/script.md -> episodes/012-the-elevator-game/languages/script-de.md
- episodes/012-the-elevator-game/es/full/script.md -> episodes/012-the-elevator-game/languages/script-es.md
- episodes/012-the-elevator-game/fr/full/script.md -> episodes/012-the-elevator-game/languages/script-fr.md
- episodes/012-the-elevator-game/pt/full/script.md -> episodes/012-the-elevator-game/languages/script-pt.md
- episodes/014-hachishakusama-the-eight-foot-woman/de/full/script.md -> episodes/014-hachishakusama-the-eight-foot-woman/languages/script-de.md
- episodes/014-hachishakusama-the-eight-foot-woman/en/short/script.md -> episodes/014-hachishakusama-the-eight-foot-woman/languages/short/script-en.md
- episodes/015-the-bell-witch/de/full/script.md -> episodes/015-the-bell-witch/languages/script-de.md
- episodes/015-the-bell-witch/en/full/script.md -> episodes/015-the-bell-witch/languages/script-en.md
- episodes/016-kisaragi-station/de/full/script.md -> episodes/016-kisaragi-station/languages/script-de.md
- episodes/016-kisaragi-station/en/full/script.md -> episodes/016-kisaragi-station/languages/script-en.md
- episodes/018-the-smiling-man/de/full/script.md -> episodes/018-the-smiling-man/languages/script-de.md
- episodes/018-the-smiling-man/en/full/script.md -> episodes/018-the-smiling-man/languages/script-en.md
- episodes/019-the-russian-sleep-experiment/de/full/script.md -> episodes/019-the-russian-sleep-experiment/languages/script-de.md
- episodes/019-the-russian-sleep-experiment/en/full/script.md -> episodes/019-the-russian-sleep-experiment/languages/script-en.md
- episodes/021-the-rake-at-the-bedroom-window-en-full-optimized/source/021-the-rake-at-the-bedroom-window-en-full-optimized-en-full.md -> episodes/021-the-rake-at-the-bedroom-window-en-full-optimized/languages/script-en.md
- episodes/021-the-rake-at-the-bedroom-window/de/full/script.md -> episodes/021-the-rake-at-the-bedroom-window/languages/script-de.md
- episodes/021-the-rake-at-the-bedroom-window/de/short/script.md -> episodes/021-the-rake-at-the-bedroom-window/languages/short/script-de.md

## Final Dry Run Summary
- already_canonical: 43
- safe_move: 0
- identical_duplicate: 7
- divergent_duplicate: 18
- target_collision: 0
- stale_unsupported_layout: 0
- invalid_language_or_variant: 7
- filesystem_error: 2

## Unresolved Manual Resolution Required

### divergent_duplicate (18)
- episodes/011-the-black-eyed-children/en/script.md -> episodes/011-the-black-eyed-children/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/011-the-black-eyed-children/script.md -> episodes/011-the-black-eyed-children/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/011-the-black-eyed-children/source/011-the-black-eyed-children-en-full.md -> episodes/011-the-black-eyed-children/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/012-the-elevator-game/en/script.md -> episodes/012-the-elevator-game/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/012-the-elevator-game/script.md -> episodes/012-the-elevator-game/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/012-the-elevator-game/source/012-the-elevator-game-en-full.md -> episodes/012-the-elevator-game/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/013-the-dyatlov-pass-incident/script.md -> episodes/013-the-dyatlov-pass-incident/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/013-the-dyatlov-pass-incident/source/013-the-dyatlov-pass-incident-en-full.md -> episodes/013-the-dyatlov-pass-incident/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/014-hachishakusama-the-eight-foot-woman/en/full/script.md -> episodes/014-hachishakusama-the-eight-foot-woman/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/014-hachishakusama-the-eight-foot-woman/en/script.md -> episodes/014-hachishakusama-the-eight-foot-woman/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/014-hachishakusama-the-eight-foot-woman/script.md -> episodes/014-hachishakusama-the-eight-foot-woman/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/014-hachishakusama-the-eight-foot-woman/source/014-hachishakusama-the-eight-foot-woman-en-full.md -> episodes/014-hachishakusama-the-eight-foot-woman/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/021-the-rake-at-the-bedroom-window/en/full/script.md -> episodes/021-the-rake-at-the-bedroom-window/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/021-the-rake-at-the-bedroom-window/en/script.md -> episodes/021-the-rake-at-the-bedroom-window/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/021-the-rake-at-the-bedroom-window/script.md -> episodes/021-the-rake-at-the-bedroom-window/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/021-the-rake-at-the-bedroom-window/source/021-the-rake-at-the-bedroom-window-en-full.md -> episodes/021-the-rake-at-the-bedroom-window/languages/script-en.md :: Multiple noncanonical candidates for the same target have divergent normalized content.
- episodes/022-the-whistler-in-the-woods/source/022-the-whistler-in-the-woods-de-full.md -> episodes/022-the-whistler-in-the-woods/languages/script-de.md :: Duplicate content diverges from the canonical authored script.
- episodes/022-the-whistler-in-the-woods/source/022-the-whistler-in-the-woods-en-full.md -> episodes/022-the-whistler-in-the-woods/languages/script-en.md :: Duplicate content diverges from the canonical authored script.

### target_collision (0)
- none

### stale_unsupported_layout (0)
- none

### invalid_language_or_variant (7)
- episodes/001-calhoun-experiment/languages/script-ar.md :: Invalid locale code: ar
- episodes/001-calhoun-experiment/languages/script-hi.md :: Invalid locale code: hi
- episodes/001-calhoun-experiment/languages/script-id.md :: Invalid locale code: id
- episodes/001-calhoun-experiment/languages/script-ja.md :: Invalid locale code: ja
- episodes/001-calhoun-experiment/languages/script-ru.md :: Invalid locale code: ru
- episodes/001-calhoun-experiment/languages/script-tr.md :: Invalid locale code: tr
- episodes/001-calhoun-experiment/languages/script-vi.md :: Invalid locale code: vi

### filesystem_error (2)
- episodes/002-ancient-humans-at-night :: ENOENT: no such file or directory, scandir '/home/box/workspace/fehmarn-seo/youtube/other/episodes/002-ancient-humans-at-night'
- episodes/003-baby-memory :: ENOENT: no such file or directory, scandir '/home/box/workspace/fehmarn-seo/youtube/other/episodes/003-baby-memory'

## Episode 022 Verification Inventory
- identical_duplicate: episodes/022-the-whistler-in-the-woods/de/full/script.md -> episodes/022-the-whistler-in-the-woods/languages/script-de.md [de/full]
- identical_duplicate: episodes/022-the-whistler-in-the-woods/en/full/script.md -> episodes/022-the-whistler-in-the-woods/languages/script-en.md [en/full]
- identical_duplicate: episodes/022-the-whistler-in-the-woods/en/script.md -> episodes/022-the-whistler-in-the-woods/languages/script-en.md [en/full]
- already_canonical: episodes/022-the-whistler-in-the-woods/languages/script-de.md -> episodes/022-the-whistler-in-the-woods/languages/script-de.md [de/full]
- already_canonical: episodes/022-the-whistler-in-the-woods/languages/script-en.md -> episodes/022-the-whistler-in-the-woods/languages/script-en.md [en/full]
- already_canonical: episodes/022-the-whistler-in-the-woods/languages/short/script-de.md -> episodes/022-the-whistler-in-the-woods/languages/short/script-de.md [de/short]
- already_canonical: episodes/022-the-whistler-in-the-woods/languages/short/script-en.md -> episodes/022-the-whistler-in-the-woods/languages/short/script-en.md [en/short]
- identical_duplicate: episodes/022-the-whistler-in-the-woods/script.md -> episodes/022-the-whistler-in-the-woods/languages/script-en.md [en/full]
- divergent_duplicate: episodes/022-the-whistler-in-the-woods/source/022-the-whistler-in-the-woods-de-full.md -> episodes/022-the-whistler-in-the-woods/languages/script-de.md [de/full]
- divergent_duplicate: episodes/022-the-whistler-in-the-woods/source/022-the-whistler-in-the-woods-en-full.md -> episodes/022-the-whistler-in-the-woods/languages/script-en.md [en/full]
