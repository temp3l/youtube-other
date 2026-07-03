# Manual CLI Workflow

This runbook shows the command-line steps to manually run the story-to-assets workflow for episode `022-the-whistler-in-the-woods`.

Use the repository root as your working directory.

## Conventions

- Episode slug: `022-the-whistler-in-the-woods`
- Example localized languages: `de,es,fr`
- Primary CLI surface: `npm run mediaforge -- ...`
- The wrapper requires a built CLI, so build once before running commands.

```bash
pnpm build
npm run doctor
```

## Important boundary

The current CLI does not expose every stage in your list as an isolated command.

The following stages are bundled inside the `episode` workflow commands:

- narration plans and segments
- full and short scene plans
- scene-to-reference assignments used by the legacy Dark Truth flow
- canonical full-image generation during the English full pass
- review package and `generation-manifest.json` creation

Where a stage is bundled, this document points to the command that produces it and names the artifact to inspect.

## 1. Canonical source story

This uses the canonical English source already present in the source pack and materializes it into the episode workspace.

```bash
npm run mediaforge -- stories rewrite-full \
  --episode 022-the-whistler-in-the-woods \
  --languages de,es,fr
```

Main outputs:

- `episodes/022-the-whistler-in-the-woods/source/022-the-whistler-in-the-woods-en-full.md`
- `episodes/022-the-whistler-in-the-woods/en/full/script.md`
- `episodes/022-the-whistler-in-the-woods/en/full/canonical-full.json`

## 2. Story intelligence extraction

`stories rewrite-full` also writes the story-intelligence artifacts under the episode-local localization cache.

Inspect them with:

```bash
find episodes/022-the-whistler-in-the-woods/.localization-cache/production -maxdepth 3 -type f | sort
```

Key files:

- `source-analysis.json`
- `story-bible.json`
- `originality-review.json`
- `retention-plan.json`
- `protected-elements.json`

## 3. Character, location, prop, and entity maps

The entity-level maps live in the story-intelligence artifacts above, especially `story-bible.json`. The shared character registry used by image generation is bootstrapped separately:

```bash
npm run mediaforge -- stories bootstrap-shared \
  --episode 022-the-whistler-in-the-woods
```

Main outputs:

- `episodes/022-the-whistler-in-the-woods/shared/characters.json`
- character reference candidates under the shared image-reference workspace

## 4. Reference image discovery and resolution

The bootstrap step above is the command surface that syncs the shared character map and generates character reference images.

To inspect current character-reference state:

```bash
npm run mediaforge -- images status 022-the-whistler-in-the-woods
```

To regenerate one character reference:

```bash
npm run mediaforge -- images regenerate-character \
  --episode 022-the-whistler-in-the-woods \
  --character <character-id>
```

## 5. Missing reference image generation

Generate missing character references explicitly:

```bash
npm run mediaforge -- images generate-character-references \
  --episode 022-the-whistler-in-the-woods
```

Or target one character:

```bash
npm run mediaforge -- images generate-character-references \
  --episode 022-the-whistler-in-the-woods \
  --character <character-id>
```

## 6. Reference image validation and approval state

Approve each usable character reference:

```bash
npm run mediaforge -- images approve-character \
  --episode 022-the-whistler-in-the-woods \
  --character <character-id>
```

If you want bootstrap to auto-approve everything it generated:

```bash
npm run mediaforge -- stories bootstrap-shared \
  --episode 022-the-whistler-in-the-woods \
  --approve
```

## 7. Localized full stories

`stories rewrite-full` already generated them in step 1. Re-run only when needed:

```bash
npm run mediaforge -- stories rewrite-full \
  --episode 022-the-whistler-in-the-woods \
  --languages de,es,fr \
  --resume
```

## 8. Localized short stories

Generate English and localized shorts from the persisted full-story outputs:

```bash
npm run mediaforge -- stories rewrite-short \
  --episode 022-the-whistler-in-the-woods \
  --languages en,de,es,fr
```

Main outputs:

- `episodes/022-the-whistler-in-the-woods/en/short/...`
- `episodes/022-the-whistler-in-the-woods/de/short/...`
- matching `manifests/*-short.json`

## 9. Story production analysis gate

Run the production-readiness analysis for the current full story before media generation:

```bash
npm run mediaforge -- stories analyze \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --format full
```

Optional status check:

```bash
npm run mediaforge -- stories status \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --format full \
  --json
```

## 10. Canonical English narration plans, scene plans, and review package

There is no standalone CLI command for only `speech-plan.json`, `production-instructions.json`, `shared/scenes.json`, and `shared/visual-plan.json`.

The current bundled command is:

```bash
npm run episode:english -- --episode 022-the-whistler-in-the-woods
```

Main outputs:

- `episodes/022-the-whistler-in-the-woods/en/full/speech-plan.json`
- `episodes/022-the-whistler-in-the-woods/en/full/production-instructions.json`
- `episodes/022-the-whistler-in-the-woods/shared/scenes.json`
- `episodes/022-the-whistler-in-the-woods/shared/visual-plan.json`
- `episodes/022-the-whistler-in-the-woods/en/full/generation-manifest.json`
- `episodes/022-the-whistler-in-the-woods/reviews/en/full/review-package.json`

## 11. Human approval gate for canonical English full

Localized full generation is blocked until English full is approved.

Check review status:

```bash
npm run episode:review:status -- \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --artifact full
```

Approve:

```bash
npm run episode:review:approve -- \
  --episode 022-the-whistler-in-the-woods \
  --language en \
  --artifact full \
  --reviewer <name>
```

## 12. Localized full narration assets, scene plans, and manifests

There is also no standalone scene-plan-only command for localized full branches. The bundled command is:

```bash
npm run episode:localized -- \
  --episode 022-the-whistler-in-the-woods \
  --languages de,es,fr
```

Main outputs per language:

- `<lang>/full/speech-plan.json`
- `<lang>/full/production-instructions.json`
- `<lang>/full/scenes.json`
- `<lang>/full/visual-plan.json`
- `<lang>/full/generation-manifest.json`
- `reviews/<lang>/full/review-package.json`

## 13. Human approval gate for localized full

The short workflow for `de` requires current approval of `de/full`.

Check:

```bash
npm run episode:review:status -- \
  --episode 022-the-whistler-in-the-woods \
  --language de \
  --artifact full
```

Approve:

```bash
npm run episode:review:approve -- \
  --episode 022-the-whistler-in-the-woods \
  --language de \
  --artifact full \
  --reviewer <name>
```

Repeat for `es` and `fr` if you want explicit approval records there as well.

## 14. Full and short narration stages through the dedicated staged pipeline

If you want to run narration through the staged narration CLI instead of relying only on the bundled `episode` commands, use:

```bash
npm run mediaforge -- audio narration prepare --episode 022-the-whistler-in-the-woods --all-languages --all-variants
npm run mediaforge -- audio narration plan --episode 022-the-whistler-in-the-woods --all-languages --all-variants
npm run mediaforge -- audio narration generate --episode 022-the-whistler-in-the-woods --all-languages --all-variants
npm run mediaforge -- audio narration assemble --episode 022-the-whistler-in-the-woods --all-languages --all-variants
npm run mediaforge -- audio narration validate --episode 022-the-whistler-in-the-woods --all-languages --all-variants
```

This is the explicit command surface for:

- narration plans
- narration segments
- narration asset generation
- narration validation

## 15. Short scene plans and short production manifests

Short scene planning is currently bundled inside `episode short`.

English short:

```bash
npm run episode:short -- \
  --episode 022-the-whistler-in-the-woods \
  --language en
```

German short:

```bash
npm run episode:short -- \
  --episode 022-the-whistler-in-the-woods \
  --language de
```

Main outputs per language:

- `<lang>/short/speech-plan.json`
- `<lang>/short/production-instructions.json`
- `<lang>/short/scenes.json`
- `<lang>/short/visual-plan.json`
- `<lang>/short/generation-manifest.json`

## 16. Batchable image requests with resolved references

Once `shared/scenes.json` exists, create the image-generation plan:

```bash
npm run images:plan -- --episode 022-the-whistler-in-the-woods
```

This writes the batchable prompt/manifests under:

- `episodes/022-the-whistler-in-the-woods/state/image-generation/prompts/`
- `episodes/022-the-whistler-in-the-woods/state/image-generation/manifests/`
- `episodes/022-the-whistler-in-the-woods/state/image-generation/visual-plans/`

If you need the OpenArt export path:

```bash
npm run mediaforge -- images export-openart 022-the-whistler-in-the-woods
```

## 17. Scene image generation

Generate all planned scene images:

```bash
npm run images:generate -- --episode 022-the-whistler-in-the-woods
```

Resume partial runs:

```bash
npm run mediaforge -- images resume \
  --episode 022-the-whistler-in-the-woods
```

Or via the alias:

```bash
npm run mediaforge -- stories resume-images \
  --episode 022-the-whistler-in-the-woods
```

## 18. Asset validation

Validate generated image assets:

```bash
npm run mediaforge -- images validate 022-the-whistler-in-the-woods
```

List missing assets:

```bash
npm run mediaforge -- images missing 022-the-whistler-in-the-woods
```

Check image readiness summary:

```bash
npm run mediaforge -- images status 022-the-whistler-in-the-woods
```

## 19. Production manifests and final packaging summary

The main production manifests are written as side effects of the commands above:

- `en/full/generation-manifest.json`
- `<lang>/full/generation-manifest.json`
- `<lang>/short/generation-manifest.json`
- review approvals under `reviews/<lang>/<variant>/approval.json`

To inspect the episode packaging summary:

```bash
npm run mediaforge -- package 022-the-whistler-in-the-woods
```

To inspect overall workflow status:

```bash
npm run episode:status -- --episode 022-the-whistler-in-the-woods
```

## Minimal end-to-end command list

If you want the shortest practical operator sequence for this episode:

```bash
pnpm build
npm run doctor
npm run mediaforge -- stories rewrite-full --episode 022-the-whistler-in-the-woods --languages de,es,fr
npm run mediaforge -- stories analyze --episode 022-the-whistler-in-the-woods --language en --format full
npm run mediaforge -- stories bootstrap-shared --episode 022-the-whistler-in-the-woods
npm run mediaforge -- stories rewrite-short --episode 022-the-whistler-in-the-woods --languages en,de,es,fr
npm run episode:english -- --episode 022-the-whistler-in-the-woods
npm run episode:review:approve -- --episode 022-the-whistler-in-the-woods --language en --artifact full --reviewer <name>
npm run episode:localized -- --episode 022-the-whistler-in-the-woods --languages de,es,fr
npm run episode:review:approve -- --episode 022-the-whistler-in-the-woods --language de --artifact full --reviewer <name>
npm run episode:short -- --episode 022-the-whistler-in-the-woods --language en
npm run episode:short -- --episode 022-the-whistler-in-the-woods --language de
npm run images:plan -- --episode 022-the-whistler-in-the-woods
npm run images:generate -- --episode 022-the-whistler-in-the-woods
npm run mediaforge -- images validate 022-the-whistler-in-the-woods
npm run mediaforge -- package 022-the-whistler-in-the-woods
```
