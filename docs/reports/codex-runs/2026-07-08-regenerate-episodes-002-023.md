# Regenerate episodes 002 and 023

Date: 2026-07-08

Changed files:
- `episodes/002-even-killers-can-lick/en/full/script.md`
- `episodes/002-even-killers-can-lick/de/full/script.md`
- `episodes/002-even-killers-can-lick/languages/script-en.md`
- `episodes/002-even-killers-can-lick/languages/script-de.md`
- `episodes/002-even-killers-can-lick/en/full/canonical-full.json`
- `episodes/002-even-killers-can-lick/en/full/generation-manifest.json`
- `episodes/002-even-killers-can-lick/script.md`
- `episodes/023-the-vanishing-hitchhiker/en/full/script.md`
- `episodes/023-the-vanishing-hitchhiker/de/full/script.md`
- `episodes/023-the-vanishing-hitchhiker/languages/script-en.md`
- `episodes/023-the-vanishing-hitchhiker/languages/script-de.md`
- `episodes/023-the-vanishing-hitchhiker/en/full/canonical-full.json`
- `episodes/023-the-vanishing-hitchhiker/en/full/generation-manifest.json`
- `episodes/023-the-vanishing-hitchhiker/script.md`

Tests/checks run:
- `pnpm mediaforge -- stories rewrite-full --episode 002 --languages de --force --json`
- `pnpm mediaforge -- stories rewrite-full --episode 023 --languages de --force --json`
- `sha256sum` comparison between generated full scripts and canonical `languages/` scripts
- `wc -w` for the four canonical regenerated scripts
- `pnpm mediaforge -- episode validate --episode 002 --language en --artifact full --json`

Results:
- Episode 002 regenerated with real OpenAI-compatible provider output: 5654 input tokens, 4630 output tokens.
- Episode 023 regenerated with real OpenAI-compatible provider output: 5311 input tokens, 3758 output tokens.
- Canonical language files match regenerated full-script outputs by SHA-256.
- Word counts: 002 en 994, 002 de 1185, 023 en 803, 023 de 1072.
- `episode validate` failed because it validates complete episode-production artifacts and stale legacy layout/schema state, not just story rewrite outputs.

Risks remaining:
- Legacy `script.md` and `<locale>/full/script.md` files remain because the rewrite command writes them.
- Complete episode-production validation was not repaired or rerun for all four targets.

Follow-up tasks:
- Align `stories rewrite-full` output with canonical `languages/script-<locale>.md` if this command remains part of the production path.
