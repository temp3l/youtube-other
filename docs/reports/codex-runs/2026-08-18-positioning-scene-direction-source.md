# Positioning scene-direction source

## Summary

Added the first directly authored positioning bundle (`pos-l01`) to the new scene-direction source. Its 16 ordered records use physical depictions, concrete objects, scene-specific actions, and no narration-restatement placeholders.

## Changed paths

- `content-packs/veronica-unified-content-pack-v3/scene-directions/positioning.json`

## Checks

- `jq` JSON parse and field census: pass (one bundle, 16 scenes, no missing `subjectMode`).

## Risks / follow-up

This is deliberately incomplete: the remaining five positioning longs and eighteen Shorts still require direct authored bundles. Fifteen `pos-l01` scenes also need a distinct third semantic state before the source can be used for the long-form cadence gate.
