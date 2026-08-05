# Math lesson migration dry run

Date: 2026-08-02  
Mode: read-only; no artifacts, workflow states, caches, or episodes mutated.

The repository does not contain the private production-workspace inventory, so
no historical lesson can be truthfully classified by ID here. Operators must
run revalidation against that inventory before regeneration.

The implemented classifier returns one of:

- `compliant`: semantic version vector is current;
- `narration-regeneration`: narration compiler, number verbalizer, locale, or
  voice preset changed;
- `scene-plan-regeneration`: renderer semantics changed;
- `full-regeneration`: lesson schema, canonical math model, grade profile, or
  prompt semantics changed.

It returns ordered affected stages and a reproducible `mediaforge math lesson`
dry-run command. It never schedules work. Existing episodes remain readable,
and no non-math profile is accepted by this classifier.

For this change, every historical math lesson compiled with the former
narration semantics requires revalidation. `M5-DZ-001-standard/de` requires at
least narration and subtitle regeneration; scene-plan/render regeneration is
also required if its persisted display used raw tuples. No non-math episode was
scanned, invalidated, migrated, regenerated, or marked for regeneration.

The shared number-verbalizer dry-run API reports only artifacts whose German
provider-bound normalized text changes. An external artifact inventory is
required to enumerate affected Dark Truth, history, Veronica Benini, and other
episodes; optional regeneration requires separate explicit approval.
