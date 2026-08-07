# Cross-Session Safety and Parallel Multi-Agent Execution

## Context

Another Cursor session may simultaneously modify history-channel code or shared visual infrastructure.

Assume the repository can change externally at any time.

No agent may assume exclusive ownership.

# 1. Preferred isolation

Before editing inspect:

```bash
git status --short
git branch --show-current
git log -1 --oneline
git worktree list
```

If practical, use a dedicated branch and Git worktree for Veronica work.

Preferred conceptual setup:

```text
history worktree          ← history session
veronica-media worktree   ← this session
```

If a separate worktree is not practical, use strict file ownership.

# 2. Never destroy concurrent work

Forbidden without explicit user approval:

```text
git reset --hard
git clean -fd
git checkout -- .
git restore .
git stash --all
force checkout
force branch reset
automatic conflict resolution by discarding other edits
```

Never revert unrelated dirty files.

# 3. Detect external changes

At the start of every implementation wave and before modifying shared files:

1. capture repository status
2. compare target-file hashes/Git diff
3. detect edits not created by the current task
4. classify each target:

```text
owned-by-veronica-session
shared-but-currently-clean
shared-and-modified-by-other-session
history-owned
unknown
```

If `shared-and-modified-by-other-session`, do not overwrite it.

# 4. File ownership registry

Create a temporary coordination artifact such as:

```text
.tmp/agentic/veronica-media/file-ownership.json
```

or use the repository's existing coordination mechanism.

Track:

```json
{
  "session": "veronica-media",
  "ownedPatterns": [],
  "sharedPatterns": [],
  "deferredSharedFiles": [],
  "conflicts": []
}
```

Do not commit temporary coordination state unless repository convention requires it.

# 5. Safe parallelization model

Recommended agents:

```text
A. architecture/contracts
B. ingestion/security
C. narration/media planner
D. localization/visual adaptation
E. render DSL/FFmpeg
F. workflow/cache/regeneration
G. review pack/metrics
H. tests/documentation
```

The coordinator owns cross-cutting contract decisions.

Safe parallel examples:

- ingestion adapters + FFmpeg compiler
- localization fixtures + security tests
- review-pack generation + planner metrics
- docs + isolated unit tests

Unsafe examples:

- two agents editing the same schema
- changing shared scene contracts while history session edits them
- two agents changing the same FFmpeg wrapper
- simultaneous cache-key migrations

# 6. Shared-contract ownership

For each shared contract:

1. inspect whether history currently owns/modifies it
2. prefer consuming it unchanged
3. prefer additive extension
4. if actively modified elsewhere, defer shared integration
5. create a local adapter/compatibility layer where feasible

Never generalize a history-specific contract by renaming it while another history session may be using it.

# 7. History integration boundary

## Reuse directly only if stable and generic

- checksum utilities
- approval-state primitives
- generic narration anchors
- generic provenance
- generic render primitives
- generic review-pack ZIP helpers

## Extract later if useful but currently history-coupled

- generic visual-plan base
- generic multi-shot planning
- generic approval-gate evaluation
- generic source/claim graph

If these are being edited concurrently, implement Veronica behind an adapter first.

## Never reuse as generic behavior

- history map contracts
- battle/route semantics
- historical chronology rules
- history-only entity/source taxonomies
- history-specific rendering defaults

# 8. Conflict response

When encountering another session's edits:

```text
1. mark target integration blocked
2. record conflicting path and expected interface
3. continue independent tasks
4. implement against an adapter/port if safe
5. add integration tests for later merge
6. include exact merge instructions in final report
```

Only stop if the blocked contract prevents all meaningful progress.

# 9. Commit discipline

Prefer small scoped commits if allowed:

```text
feat(veronica-media): add v1 media-plan contracts
feat(veronica-media): add secure source ingestion
feat(veronica-media): add portrait composition planner
feat(veronica-media): add typed ffmpeg render manifest
test(veronica-media): add approval eligibility fixtures
```

Do not commit unrelated files.

Never push automatically unless explicitly instructed.

# 10. Mandatory merge manifest

Create:

```text
docs/architecture/veronica-supplemental-media/MERGE-STATUS.md
```

Include:

- files modified
- files intentionally not modified due to concurrent history work
- shared contracts consumed
- adapters introduced
- deferred extraction/generalization
- expected conflicts
- exact post-history integration steps
- tests to rerun after merge
