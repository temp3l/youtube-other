# VJ-04 — Build the Visual and Multimedia Plan

## Primary actor
Automated Production Agent / Editor

## Main flow
1. System reads approved/frozen narration, episode context, source manifest, target year/area/topic, and genre policy.
2. It derives scene-level visual direction.
3. It decides per scene whether to reuse supplied media, redesign a source slide, generate an image, create a diagram, use text treatment, or use another supported visual form.
4. It derives camera/image direction only when relevant to generated visual content.
5. Episode-level visual/camera direction is persisted and reused on regeneration unless invalidated by relevant changes.
6. Visual prompts include reference/source images only when semantically relevant.
7. Each scene records asset source, rationale, lineage, aspect-ratio strategy, and localization behavior.
8. Editor reviews the visual plan before expensive generation when required by policy.

## Success outcome
A deterministic visual plan minimizes cost, maximizes source reuse, and can produce both 16:9 and 9:16 outputs.
