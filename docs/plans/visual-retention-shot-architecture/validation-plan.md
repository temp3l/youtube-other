# Visual Retention Validation Plan

## Goals

Validation must catch static or repetitive output before full render. It should be local, deterministic, and based on shot metadata, source image hashes, timing, crop overlap, treatment identity, and optional sampled-frame analysis.

## Pre-Render Validation Codes

| Code | Severity | Condition | Default Repair |
| --- | --- | --- | --- |
| `VISUAL_CHANGE_RATE_TOO_LOW` | error | Shot intervals exceed profile cadence | Split shot or add motion/crop |
| `OPENING_VISUAL_VARIETY_TOO_LOW` | error for Shorts | Fewer than 3 meaningful changes in first 8s | Add hook/detail/evidence shot |
| `STATIC_SHOT_TOO_LONG` | error | Fully static shot exceeds profile max | Add motion or split |
| `SOURCE_IMAGE_OVERUSED` | warning/error | Uses exceed per-image budget | Switch source image or reduce uses |
| `CONSECUTIVE_SOURCE_IMAGE_REUSE_TOO_HIGH` | warning/error | Too many adjacent shots from same image | Force alternate image if available |
| `CONSECUTIVE_CROP_TOO_SIMILAR` | warning/error | Adjacent crop IoU too high with same image | Reframe or change treatment |
| `REPEATED_MOTION_PATTERN` | warning | Same pan/zoom direction repeats | Change direction or use static detail |
| `CLIMAX_PACING_TOO_SLOW` | error | Final third exceeds climax cadence | Split and shorten shots |
| `SHOT_BUDGET_EXCEEDED` | warning | Total shots exceed configured budget | Merge low-importance shots |
| `SOURCE_IMAGE_BUDGET_EXCEEDED` | warning | Generated source image target exceeded | Prefer local treatments |
| `FINAL_CALLBACK_SHOT_MISSING` | warning | No callback/hold at ending | Add final callback shot |
| `BLURRED_FILL_OVERUSED` | warning | Blurred fill exceeds cap | Prefer crop/pan or alternate image |
| `SURVEILLANCE_EFFECT_OVERUSED` | warning | Security/glitch cap exceeded | Downgrade to hard cut/grain |
| `PARALLAX_EFFECT_OVERUSED` | warning | Parallax cap exceeded | Use push-in/pan |
| `CAPTION_VISUAL_COLLISION` | error | Caption overlaps protected face/evidence region | Move caption or alter crop |
| `EVIDENCE_PROVENANCE_MISSING` | error | Evidence insert lacks source fact | Drop insert |
| `LOW_RESOLUTION_CROP_RISK` | warning/error | Crop cannot support output resolution | Use wider crop or blurred fill |
| `FACE_CLIPPING_RISK` | warning/error | Face crop clips protected region | Recenter or use medium crop |

## Thresholds

Shorts aggressive:

- First 0-8s: at least 3 meaningful visual changes.
- First 0-5s: prefer change every 1.5-2.5s.
- Setup: 3-5s shot target.
- Climax: 1-3s shot target.
- Maximum fully static shot: 3s.
- Maximum moving shot: 6s.
- Maximum consecutive shots from same image: 3.
- Maximum total uses per image: 5.

Full balanced:

- Opening: 3-6s shot target.
- Regular: 4-8s shot target.
- Evidence: 3-6s.
- Climax: 2-5s.
- Maximum fully static shot: 5s.
- Maximum atmospheric moving shot: 10-12s only with visible motion.
- Maximum consecutive shots from same image: 3.

Crop similarity:

- Adjacent crops from same image should normally have IoU below 0.82 unless motion/treatment changes are strong.
- Repeated identical crops are allowed only for deliberate callback shots.

Effect caps:

- Blurred fill: max 20% of shots and never more than 2 adjacent.
- Surveillance/glitch/static combined: max 15% of shots.
- Parallax: max 1 per Short, 1-3 per full video.
- Exposure flash: max 3 per Short.

## Meaningful Visual Change Definition

Count as meaningful:

- New source image.
- Crop shift with sufficient IoU difference.
- Material camera motion direction/scale change.
- Evidence insert entering or exiting.
- Treatment change such as security overlay, blackout, exposure flash, or lighting pulse.
- Transition across scene or source image boundary.

Do not count alone:

- Caption text update.
- Minor grain/noise variation.
- Same crop with imperceptible drift.
- Audio-only cue.

## Pre-Render Inputs

- `ShotPlan`.
- `ScenePlan`.
- Source image manifest and source image hashes.
- Focal metadata.
- Caption plan or caption sidecar.
- Evidence insert provenance.
- Pacing profile and visual budget.
- Treatment catalog version.

## Post-Render Validation

Optional sampled-frame validation should run after focused metadata validation passes or when preview/final render is requested.

Checks:

- Sample frames at 2-4 fps for Shorts preview and 1 fps for full video.
- Compute perceptual similarity or histogram similarity for adjacent samples.
- Estimate longest static-frame interval.
- Run FFmpeg scene-detection metrics for sanity.
- Confirm final output duration, dimensions, codec, pixel format, and aspect ratio through existing `validateRenderedVideo`.

Post-render warnings should not silently weaken pre-render rules. They identify renderer drift, filter failures, or overly subtle visual changes.

## Repair And Fallback

Deterministic local repairs:

- Split an overlong static shot.
- Add slow push-in to a static shot.
- Change repeated pan direction.
- Replace unsafe close-up with medium crop.
- Replace parallax with push-in when face/hand distortion risk appears.
- Replace unsupported evidence insert with no insert and emit provenance warning.
- Use blurred fill only when smart crop fails.

Hard failures:

- Missing source image.
- Evidence insert without source fact.
- No valid crop for required aspect ratio.
- Caption collision with no safe position.
- Source image too low resolution for any compliant shot and no fallback profile allowed.

## Rollout Interpretation

- `disabled`: no shot-plan requirement; legacy rendering remains primary.
- `preview`: validation still runs and persists reports, but final production render stays on the legacy path.
- `enabled`: shot-aware rendering is allowed only after validation passes; otherwise the system must surface a stable fallback reason instead of silently changing paths.

Estimated image-savings values must stay labeled as estimates and should be interpreted against the configured baseline rather than as exact historical spend.
