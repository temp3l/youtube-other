# Veronica Benini Supplemental Media Integration — Agentic Multi-Agent Prompt Pack v2

This pack implements supplemental media support for the Veronica Benini genre while reusing generic lessons from the history-channel visual-planning work.

Another Cursor session may simultaneously modify history-channel or shared visual infrastructure. Therefore this pack treats cross-session isolation, additive contracts, explicit file ownership, and merge-safe integration as first-class requirements.

## Recommended execution

Start a new Cursor agent session from the repository root. Prefer a dedicated branch or Git worktree for this goal.

Then run the contents of `05-kickoff-prompt.md`.

The agent must read all files in this directory before implementation.

## Governing order

1. `00-agentic-goal.md`
2. `01-concurrency-and-cross-session-safety.md`
3. `02-planning-and-contract-audit.md`
4. `03-parallel-implementation-tasks.md`
5. `04-review-and-acceptance.md`
6. `05-kickoff-prompt.md`

`00-agentic-goal.md` is the governing product goal.

`01-concurrency-and-cross-session-safety.md` is mandatory whenever another session may edit the repository.

## Core architecture

```text
Uploaded narration + supplemental media
        ↓
Secure source inventory / extraction
        ↓
Versioned semantic media plan
        ↓
Claim / source / narration linkage
        ↓
Approval eligibility gate
        ↓
Language-specific preparation
        ↓
Independent 16:9 + 9:16 compositions
        ↓
Typed deterministic FFmpeg render manifest
        ↓
Render + validation + approval pack
```

## Reuse from history enhancements

Reuse generic infrastructure where safe:

- versioned visual/media-plan contracts
- semantic narration anchors
- provenance
- claim/source linkage
- asset reuse
- multi-state/multi-shot planning
- approval gating
- aspect-ratio adaptation
- regeneration boundaries
- approval/review packs
- quality metrics

Do not copy history-specific behavior:

- historical map semantics
- battle/route semantics
- historical chronology rules
- historical entity taxonomies
- history-specific source-confidence policies
- history-specific visual defaults

## Concurrent history-session rule

If another session is editing a shared file required by this feature, do not overwrite, revert, reset, stash, or silently reconcile its work.

Prefer:

1. an additive Veronica-owned module or contract;
2. a narrow adapter/port;
3. deferring only the shared integration step;
4. documenting the blocked integration in `MERGE-STATUS.md`.

Continue all independent work safely.
