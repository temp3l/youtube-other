# Production Defaults

## Rollout Modes

- `disabled`: preserve legacy scene rendering and skip shot-aware final render.
- `preview`: generate or reuse shot plans and validation artifacts, keep final production render on the legacy path, and report the fallback reason.
- `enabled`: use shot-aware rendering when validation passes; otherwise preserve the legacy fallback path and report a stable fallback code.

Default rollout remains conservative: existing installations should start in `disabled` or explicit `preview` until operators confirm validation, cache behavior, and estimated image-savings telemetry on live episodes.

Rollback is configuration-only: switch the rollout mode back to `disabled` or pass the existing explicit legacy override, then rerun render. No image regeneration, cache deletion, artifact migration reversal, or database changes are required.

## Visual Budgets

| Output | Generated Source Images | Rendered Shots | Shots Per Image | Max Consecutive Uses | Max Total Uses |
| --- | ---: | ---: | ---: | ---: | ---: |
| Short 45-60s | 5-9 | 15-28 | 2-4 | 3 | 5 |
| Short 60-75s | 7-12 | 20-35 | 2-4 | 3 | 5 |
| Full 4-6m | 18-35 | 45-85 | 2-3 | 3 | 6 |

## Pacing Profiles

| Profile | Use | Static Max | Moving Max | Notes |
| --- | --- | ---: | ---: | --- |
| `shorts-aggressive` | Shorts default | 3s | 6s | Three changes in first 8s |
| `high-retention` | Fast full videos or intense Shorts | 4s | 8s | More close-ups and evidence inserts |
| `balanced` | Full default | 5s | 10s | Avoid static holds, preserve atmosphere |
| `atmospheric` | Slow full sequences | 5s | 12s | Only for visibly moving shots |

## Shorts Timing

| Phase | Duration Target | Rules |
| --- | --- | --- |
| Hook first shot | 1.5-2.5s | Prefer close-up, evidence, threat, or disturbing detail |
| Opening 0-8s | 1.5-3.5s | At least 3 meaningful visual changes |
| Setup 8-35s | 3-5s | Alternate wide, medium, detail, inserts, and motion direction |
| Evidence | 2-4s | Fact-provenanced inserts and object crops |
| Escalation | 1.5-3.5s | More close-ups and interruptions |
| Climax | 1-3s | Fastest cadence; capped flashes, blackouts, surveillance cuts |
| Callback | 2-3.5s | Controlled push-in or deliberate stillness |

## Full Timing

| Phase | Duration Target | Rules |
| --- | --- | --- |
| Opening | 3-6s | Establish tone without long static frames |
| Regular | 4-8s | Use visible motion for longer shots |
| Evidence | 3-6s | Keep text readable |
| Intense sequence | 2-5s | Faster cadence and more source-image changes |
| Atmospheric hold | 8-12s | Allowed only with visible motion |
| Callback | 3-6s | Hold final horror image long enough to register |

## Image Priorities

Prefer new generated source images for:

- Opening hook.
- Central supernatural or horror rule.
- Concrete proof/evidence.
- Personal escalation.
- Primary reveal.
- Climax.
- Final callback if it materially differs from prior imagery.

Reuse source images for:

- Exposition.
- Transitional narration.
- Evidence inserts.
- Alternate crops.
- Aspect-ratio reframes.
- Subtle motion shots.

## Motion Defaults

| Setting | Shorts | Full |
| --- | ---: | ---: |
| Minimum shot duration | 1.0s | 2.0s |
| Push-in scale range | 1.03-1.14 | 1.02-1.10 |
| Fast push-in scale range | 1.08-1.22 | 1.06-1.16 |
| Pan travel range | 3-12% image dimension | 2-8% image dimension |
| Rotation range | -1.0 to 1.0 deg | -0.5 to 0.5 deg |
| Default transition | hard cut | hard cut or short dissolve |
| Dissolve duration | 0.12-0.25s | 0.2-0.5s |
| Dip/blackout duration | 0.1-0.5s | 0.2-0.8s |

## Crop Defaults

| Setting | Default |
| --- | ---: |
| Minimum crop area | 35% of source image |
| Minimum face crop margin | 8% around detected face |
| Maximum crop zoom | 2.0x Shorts, 1.7x full |
| Minimum output equivalent | 1080px short height, 1080px full height |
| Adjacent same-image crop IoU target | < 0.82 |

## Effect Caps

| Effect | Shorts | Full |
| --- | ---: | ---: |
| Blurred fill | <= 20% shots | <= 15% shots |
| Surveillance/glitch/static combined | <= 15% shots | <= 10% shots |
| Parallax | <= 1 per Short | 1-3 per video |
| Exposure flash | <= 3 | <= 1 per minute |
| Blackout | <= 2 | <= 1 per intense sequence |
| Fast zoom | <= 3 | <= 1 per minute |

## Caption Defaults

- Max two lines.
- Phrase-based segmentation.
- Large mobile-readable text for Shorts.
- Place above Shorts UI safe area.
- Avoid faces, evidence inserts, and channel branding.
- One emphasized keyword where appropriate.
- No word-by-word bounce by default.
- Caption changes do not count as the only meaningful visual change.

## Operations

- Preview mode should persist shot plans under `state/visual-retention/` without making shot-aware rendering mandatory.
- Validation reports should be read from `state/visual-retention/validation.<variant>.<locale>.json`.
- Status and inspect surfaces should treat image-savings values as estimates, not exact realized cost reductions.
