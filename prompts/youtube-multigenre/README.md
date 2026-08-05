# Quick Start

```bash
# From repository root:
mkdir -p prompts/youtube-multigenre
cp -R /path/to/youtube-multigenre-enhancement-codex-pack/prompts/* \
  prompts/youtube-multigenre/

git status
```

Start Codex in normal/goal mode using Terra/high, low verbosity, and one agent.

First instruction:

```text
Implement prompts/youtube-multigenre/01-shared-genre-production-intelligence.md completely.

Inspect and reuse existing repository abstractions before editing. Keep all new
behavior additive, opt-in, and genre-profile gated. Run the required tests and
continue until the completion criteria are satisfied. Do not implement later
goals in this session.
```

Then:

1. Review and commit Goal 1.
2. Start a fresh branch and Codex session.
3. Run Goal 2.
4. Continue in the order defined in `MASTER-IMPLEMENTATION-GUIDE.md`.
