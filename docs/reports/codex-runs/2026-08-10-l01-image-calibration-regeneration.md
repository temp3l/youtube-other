# L01 image calibration regeneration

Changed files: `episodes/l01-s01-being-good-isnt-enough/shared/{scenes.json,semantic-image-prompt-brief.v1.json,semantic-image-prompt-review.v1.json}`, five scoped image-generation state records, and `shared/images/generated/scene-001-9x16.png` through `scene-005-9x16.png`.

The stale abstract semantic cache was replaced with the approved L01-S01 semantic fixture; all five short scenes were forcibly regenerated using the updated Veronica final-prompt projection.

Checks run: verified all five scene manifests report `generated` and outputs exist. Provider execution: OpenAI `gpt-image-2`, five requested scenes.

Results: `scene-001`–`scene-005` regenerated successfully. Historical failure records remain beside the newer generated manifests; they do not change the current manifest status.

Risks/follow-up: visual human review is still required before final use. Commit hash: uncommitted.
