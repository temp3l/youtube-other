Summary: Initialized episode `032-the-broadcast-that-cut-out` in the canonical authored-script workspace for `en,de,es,fr`, generated dry-run planning artifacts for English full and short, bridged the current batch planner’s expected `canonical/` and `locales/` paths, and prepared image batches for both full and short variants.

Changed paths: `episodes/032-the-broadcast-that-cut-out/languages/`; `episodes/032-the-broadcast-that-cut-out/canonical/scenes.json`; `episodes/032-the-broadcast-that-cut-out/locales/en/full/script.md`; `episodes/032-the-broadcast-that-cut-out/locales/en/short/script.md`; `episodes/032-the-broadcast-that-cut-out/shared/scenes.json`; `episodes/032-the-broadcast-that-cut-out/shared/visual-plan.json`; `episodes/032-the-broadcast-that-cut-out/en/{full,short}/`; `episodes/032-the-broadcast-that-cut-out/reviews/en/{full,short}/`; `episodes/032-the-broadcast-that-cut-out/manifests/`; `episodes/032-the-broadcast-that-cut-out/state/image-generation/`; `docs/reports/codex-runs/2026-07-10-episode-032-batch-init.md`

Tests/checks:
- `pnpm mediaforge -- episode dry-run --episode 032-the-broadcast-that-cut-out --source content-ideas/content/dark-truth-episodes-multilingual-production-pack --language en --artifact full --output-root episodes --json`
- `pnpm mediaforge -- episode dry-run --episode 032-the-broadcast-that-cut-out --source content-ideas/content/dark-truth-episodes-multilingual-production-pack --language en --artifact short --output-root episodes --json`
- `pnpm mediaforge -- images batch prepare --episode 032-the-broadcast-that-cut-out --languages en --variants full --json`
- `SHORTS_FORCE_REGENERATE_ALL=true pnpm mediaforge -- images batch prepare --episode 032-the-broadcast-that-cut-out --languages en --variants short --json`
- Attempted `pnpm mediaforge -- images batch submit ...` for full batch `imgb-afd9374ee8ab-p001-of001` and short batch `imgb-920e06a0c54b-p001-of001`

Results:
- Full batch prepared successfully with 35 image-generation requests.
- Short batch prepared successfully with 14 native portrait-generation requests.
- Submit attempts failed before provider upload with `getaddrinfo ENOTFOUND api.openai.com` in the sandbox; escalated retry was policy-blocked as external data export without explicit user approval.

Risks remaining:
- No remote batch was submitted, so no images were generated or imported yet.
- The batch planner still depends on canonical/runtime path bridges (`canonical/scenes.json`, `locales/en/*/script.md`) not written by the legacy dry-run path.

Follow-up:
- If explicit approval is granted for external submission, submit `imgb-afd9374ee8ab-p001-of001` and `imgb-920e06a0c54b-p001-of001`, then run `images batch status` and `images batch download`.
- Normalize dry-run outputs to canonical/runtime batch-planner paths in source code to remove the manual bridge.

Commit hash: `24ca8c2`
