Summary: Rewrote episode 029 English and German optimized full-story drafts locally without calling any provider. Generated offline OpenAI-style prompt and request debug artifacts for `en` and `de`, plus episode-local debug call logs marked `no-paid-provider`.

Changed paths: `content-ideas/content/dark-truth-episodes-optimized/029-the-ghost-train-of-silver-pines-en-full-optimized.md`, `content-ideas/content/dark-truth-episodes-optimized/029-the-ghost-train-of-silver-pines-de-full-optimized.md`, `content-ideas/content/dark-truth-episodes-optimized/029-the-ghost-train-of-silver-pines/debug/stories-rewrite-full-en.prompt.md`, `.../stories-rewrite-full-en.request.json`, `.../stories-rewrite-full-de.prompt.md`, `.../stories-rewrite-full-de.request.json`, `.../debug/openai-calls/*`

Tests: `node --input-type=module -e "..."`

Result: Verified rewritten story files exist, verified debug artifacts exist, and measured narration word counts (`en` 2221, `de` 2121).

Commit hash: `0888508`

Unresolved risks: Manual rewrites are longer than the compiler-generated prompt contract for this episode (`579-679` words). German audio-instruction/metadata blocks remain largely source-shaped rather than fully re-localized.
