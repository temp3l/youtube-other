Summary: Moved episode 029 story outputs into the canonical authored-script layout under `episodes/029-the-ghost-train-of-silver-pines/` so downstream resolvers can find them.

Changed files: `episodes/029-the-ghost-train-of-silver-pines/languages/script-en.md`, `episodes/029-the-ghost-train-of-silver-pines/languages/script-de.md`, `episodes/029-the-ghost-train-of-silver-pines/languages/short/script-en.md`, `episodes/029-the-ghost-train-of-silver-pines/languages/short/script-de.md`

Checks run: `find episodes/029-the-ghost-train-of-silver-pines -maxdepth 3 -type f | sort`, `git status --short`

Results: Verified the four canonical story files exist at the expected paths.

Risks: The old `content-ideas/content/dark-truth-episodes-optimized/029-the-ghost-train-of-silver-pines-*` paths are now absent; if any external reference still points there, it will need to be updated.
