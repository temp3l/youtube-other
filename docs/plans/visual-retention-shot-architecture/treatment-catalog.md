# Shot Treatment Catalog

## Catalog Rules

Treatments must be deterministic, locally generated, and validated before render. They should increase visual novelty without making horror videos look like generic social-media templates.

Default treatments must work without paid APIs. Advanced treatments may require pre-render caching but should still use local tooling.

Frequency caps are production defaults and can be tightened by validation.

## Static Reframing

| Treatment | Local Tooling | Value | Cost | Complexity | 16:9 | 9:16 | Phases | Duration | Default | Cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Establishing wide crop | FFmpeg crop/scale, Sharp preview | Context and orientation | Low | Low | Yes | Use carefully | setup, callback | 3-8s | Yes | No |
| Medium crop | FFmpeg crop/scale | Human-readable subject framing | Low | Low | Yes | Yes | setup, evidence | 2-6s | Yes | No |
| Face close-up | crop with focal face metadata | Hook and emotional threat | Low | Medium | Yes | Yes | hook, escalation, climax | 1.5-4s | Yes with face validation | No |
| Object-detail crop | crop toward evidence region | Proof, clue, texture | Low | Medium | Yes | Yes | evidence, climax | 1.5-4s | Yes | No |
| Rule-of-thirds reposition | crop/scale | More cinematic framing | Low | Low | Yes | Yes | all | 2-6s | Yes | No |
| Vertical smart crop | Sharp attention, focal metadata, FFmpeg crop | Shorts adaptation | Low | Medium | N/A | Yes | all Shorts | 1.5-6s | Yes | No |
| Caption-safe negative-space crop | crop with safe area | Caption readability | Low | Medium | Yes | Yes | hook, setup | 2-6s | Yes | No |
| Crop toward evidence | crop plus optional overlay | Directs attention | Low | Medium | Yes | Yes | evidence, climax | 1.5-4s | Yes | No |

Risks:

- Crops can become too similar. Validate overlap.
- Close-ups can expose low source resolution. Enforce minimum crop area and output resolution.
- Face close-ups require face/focal metadata; otherwise fall back to medium crop.

## Camera Movement

| Treatment | Local Tooling | Value | Cost | Complexity | 16:9 | 9:16 | Phases | Duration | Default | Cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Slow push-in | FFmpeg zoompan/scale/crop | Adds dread | Low | Medium | Yes | Yes | setup, callback | 3-8s | Yes | No |
| Fast push-in | zoompan | Hook/climax impact | Low | Medium | Yes | Yes | hook, climax | 1-3s | Capped | No |
| Slow pull-out | zoompan | Reveals context | Low | Medium | Yes | Yes | setup, aftermath | 3-8s | Yes | No |
| Lateral pan | zoompan crop window | Visual change from same image | Low | Medium | Yes | Yes | setup, evidence | 3-6s | Yes | No |
| Vertical pan | zoompan crop window | Reveals tall details | Low | Medium | Yes | Yes | evidence, setup | 3-6s | Yes | No |
| Diagonal pan | zoompan crop window | Unease | Low | Medium | Yes | Yes | escalation | 2-5s | Capped | No |
| Pan plus zoom | zoompan | Stronger novelty | Low | Medium | Yes | Yes | escalation, climax | 2-5s | Yes capped | No |
| Handheld micro-drift | subtle crop jitter via expressions | Organic unease | Low | Medium | Yes | Yes | setup, escalation | 3-8s | Yes subtle | No |
| Subtle rotation | rotate + crop padding | Uneasy tilt | Low | Medium | Yes | Yes | escalation, climax | 1.5-4s | Capped | No |
| Accelerated climax zoom | zoom expression | Impact | Low | Medium | Yes | Yes | climax | 1-2.5s | Capped | No |

Frequency caps:

- No repeated pan direction more than twice.
- Fast push-in maximum 2 per Short unless climax needs 3.
- Rotation maximum 1 per 20 seconds.
- Avoid motion that makes captions hard to read.

## Aspect-Ratio Adaptation

| Treatment | Local Tooling | Value | Cost | Complexity | 16:9 | 9:16 | Phases | Default | Cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Smart crop | Sharp attention, focal metadata, FFmpeg | Clean vertical output | Low | Medium | Yes | Yes | all | Yes | No |
| Pan-and-scan | FFmpeg crop movement | Turns landscape into multiple Shorts shots | Low | Medium | No need | Yes | all | Yes | No |
| Blurred background fill | Sharp/FFmpeg scale + blur overlay | Safe when crop unsafe | Low | Low | Yes | Yes | fallback | Capped | No |
| Mirrored edge fill | FFmpeg crop/overlay/hflip | Less empty than bars | Low | Medium | Yes | Yes | fallback | Capped | No |
| Layered foreground/background fill | Sharp composites | More premium vertical adaptation | Medium | Medium | Yes | Yes | hook, callback | Later | Maybe |
| Split framing | Canvas/Sharp composite | Show evidence and subject together | Medium | Medium | Yes | Yes | evidence | Capped | Maybe |
| Subject-aware repositioning | focal metadata | Keeps subject readable | Low | Medium | Yes | Yes | all | Yes | No |
| Separate background/foreground scaling | Sharp masks or simple regions | Depth without new image | Medium | High | Yes | Yes | setup, callback | Later | Yes |

Blurred fill cap: at most 20% of shots by default, and never more than two adjacent shots.

## Depth And Motion

| Treatment | Local Tooling | Value | Cost | Complexity | 16:9 | 9:16 | Phases | Default | Cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Layered pseudo-parallax | Sharp masks/regions, FFmpeg overlay | Premium motion | Medium | High | Yes | Yes | hook, callback, climax | No | Yes |
| Foreground obstruction movement | generated local shape/texture overlay | Horror depth | Low | Medium | Yes | Yes | escalation | Capped | Maybe |
| Background drift | enlarged image layer movement | Subtle motion | Low | Medium | Yes | Yes | setup | Yes subtle | No |
| Depth-based zoom | local depth map if available | Cinematic | High | High | Yes | Yes | selected hero shots | No | Yes |
| Simulated rack focus | blur expressions/masks | Attention shift | Medium | High | Yes | Yes | evidence, climax | Later | Yes |
| Focus breathing | subtle blur/scale pulse | Unease | Low | Medium | Yes | Yes | setup, escalation | Capped | No |
| Vignette drift | FFmpeg vignette/overlay | Horror mood | Low | Medium | Yes | Yes | all | Yes subtle | No |
| Animated shadow | Canvas/overlay | Threat implication | Low | Medium | Yes | Yes | escalation | Capped | Maybe |
| Light sweep | overlay gradient | Reveal detail | Low | Medium | Yes | Yes | evidence | Capped | Maybe |
| Fog or grain overlay | noise/overlay loop | Texture | Low | Medium | Yes | Yes | all | Yes subtle | Maybe |

Parallax avoidance:

- Faces with obvious distortion.
- Hands.
- Low-resolution crops.
- Crowded scenes.
- Strong perspective lines.
- Images without border margin.

Parallax cap: maximum 1 in a 60-second Short, 1-3 in a full video depending on duration.

## Horror-Specific Treatments

| Treatment | Local Tooling | Value | Cost | Complexity | 16:9 | 9:16 | Phases | Duration | Default | Cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Security-camera overlay | drawtext/Canvas overlay | Found-footage credibility | Low | Medium | Yes | Yes | evidence, escalation | 2-6s | Yes capped | Maybe |
| Recording timestamp | drawtext | Time pressure | Low | Low | Yes | Yes | evidence | 2-6s | Yes | No |
| Analogue noise | FFmpeg noise | Texture | Low | Low | Yes | Yes | all | 1-8s | Subtle | No |
| Film grain | noise/overlay | Cohesion | Low | Low | Yes | Yes | all | all | Yes subtle | No |
| Exposure flash | eq/fade | Impact | Low | Low | Yes | Yes | hook, climax | 0.1-0.3s | Capped | No |
| Emergency-light pulse | color/eq overlay | Escalation | Low | Medium | Yes | Yes | escalation, climax | 1-4s | Capped | No |
| Fluorescent flicker | eq expression | Horror environment | Low | Medium | Yes | Yes | setup, escalation | 1-5s | Capped | No |
| Frame skip | select/setpts or micro-cut | Disturbance | Low | Medium | Yes | Yes | climax | 0.2-1s | Capped | No |
| Chromatic separation | split/overlay offsets | Unreality | Medium | Medium | Yes | Yes | climax | 0.5-2s | Capped | Maybe |
| Short blackout | color clip | Breath/reveal | Low | Low | Yes | Yes | climax, callback | 0.1-0.5s | Capped | No |
| Static burst | noise + audio cue alignment | Interrupt | Low | Medium | Yes | Yes | climax | 0.2-0.8s | Capped | Maybe |
| Damaged-film frame | overlay texture | Archive feel | Low | Medium | Yes | Yes | evidence | 1-4s | Capped | Maybe |
| Declassified-file overlay | Canvas/Sharp text asset | Fact/evidence | Low | Medium | Yes | Yes | evidence | 2-5s | Yes if sourced | Yes |
| Audio-waveform insert | Canvas/SVG from audio amplitude or generated bars | Recording evidence | Low | Medium | Yes | Yes | evidence | 2-4s | Yes if sourced | Yes |
| Clock close-up | Canvas insert or crop | Time pressure | Low | Medium | Yes | Yes | evidence, climax | 1.5-4s | Yes if sourced | Yes |
| Handwritten-note insert | Canvas/Sharp local asset | Personal horror | Low | Medium | Yes | Yes | evidence, callback | 2-5s | Yes if sourced | Yes |
| Text-message insert | Canvas local asset | Modern proof | Low | Medium | Yes | Yes | evidence | 2-4s | Yes if sourced | Yes |
| Archive-photo treatment | grayscale/sepia/noise/vignette | Historical tone | Low | Low | Yes | Yes | setup, evidence | 2-6s | Yes capped | No |

Hard caps:

- Security/glitch/static combined maximum 15% of shots.
- Exposure flashes maximum 3 in a Short.
- Blackouts maximum 2 in a Short except explicit climax style.
- Do not stack more than two stylized effects on one shot by default.

## Valid Combinations

Safe defaults:

- Smart crop + slow push-in + subtle grain.
- Object-detail crop + light sweep + short dissolve.
- Security overlay + timestamp + lateral pan.
- Blurred fill + foreground contain crop + slow push-in.
- Final callback crop + controlled push-in + subtle vignette.

Avoid:

- Parallax + face close-up.
- Fast zoom + word-dense caption.
- Glitch + evidence insert when text must be readable.
- Blur fill + split framing + security overlay in the same shot.
- Repeated push-ins on adjacent shots unless climax validation allows it.

