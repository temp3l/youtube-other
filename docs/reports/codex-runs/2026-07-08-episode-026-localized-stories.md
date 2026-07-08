Summary: Materialized episode 026 authored scripts in the canonical episode workspace from existing optimized English and German story assets after the `stories rewrite-full` CLI returned an invalid OpenAI response with no source story in the prompt.

Changed paths: `episodes/026-bloody-mary-in-the-mirror/languages/script-en.md`, `episodes/026-bloody-mary-in-the-mirror/languages/script-de.md`, `episodes/026-bloody-mary-in-the-mirror/languages/short/script-en.md`, `episodes/026-bloody-mary-in-the-mirror/languages/short/script-de.md`

Tests/checks: `pnpm mediaforge -- stories rewrite-full --input content-ideas/content/dark-truth-episodes-optimized/026-bloody-mary-in-the-mirror-en-full-optimized.md --episode-slug 026-bloody-mary-in-the-mirror --languages de --dry-run --json`; `pnpm mediaforge -- stories rewrite-short --input content-ideas/content/dark-truth-episodes-optimized/026-bloody-mary-in-the-mirror-en-full-optimized.md --episode-slug 026-bloody-mary-in-the-mirror --languages en,de --compatibility-source --dry-run --json`; `pnpm mediaforge -- stories rewrite-full --input content-ideas/content/dark-truth-episodes-optimized/026-bloody-mary-in-the-mirror-en-full-optimized.md --episode-slug 026-bloody-mary-in-the-mirror --languages de --json`

Results: Full rewrite dry-run passed. Short rewrite dry-run failed because canonical source did not exist yet. Full rewrite execution created `episodes/026-bloody-mary-in-the-mirror/source/...` and debug artifacts, but failed localized generation because the OpenAI response said no source story was included.

Risks remaining: German full script content comes from the preexisting optimized asset and contains obvious mixed-language quality issues (`The protagonist`, `The`). The CLI generation bug remains unresolved.

Follow-up: Fix the full rewrite prompt/source injection path, then regenerate episode 026 German full and short outputs through the CLI and review the German text quality.
