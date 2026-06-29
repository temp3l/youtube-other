# Task: Persistence, Cache, Resume, And Invalidation

Implement versioned persistence and dependency-aware invalidation for full and short artifacts.

## Artifact Identity

Prefer logical identity:

```text
<language>/<variant>/<artifact-owner>
```

Adapt physical layout to existing conventions, including shared episode filesystem helpers and legacy compatibility paths.

Every short artifact must persist:

- language;
- locale;
- variant;
- parent full-story hash;
- StoryIR hash;
- short-contract hash;
- compiler version;
- prompt hash;
- model configuration;
- token usage;
- cost;
- validation;
- repair history;
- status.

## Invalidation Matrix

Implement dependency-aware invalidation:

| Change | Required invalidation |
|---|---|
| Raw English source | Canonical full and everything downstream |
| Cleaner version | Canonical full and everything downstream |
| StoryIR | All full and short stories |
| Canonical English full | All localized full stories and all short stories |
| Spanish full | Spanish short and Spanish downstream assets |
| German full | German short and German downstream assets |
| Portuguese full | Portuguese short and Portuguese downstream assets |
| French full | French short and French downstream assets |
| Full prompt module | Affected full artifacts and dependent shorts |
| Short prompt module | Affected short artifacts only |
| Short target word range | Affected short narration and downstream short assets |
| Full target word range | Affected full narration and dependent shorts |
| Metadata prompt | Corresponding metadata only |
| Audio template | Corresponding audio only |
| Scene planner | Corresponding scene and visual artifacts only |
| Renderer | Rendered media only |

## Resume Rules

Resume must never reuse:

- a short whose parent full hash changed;
- a full artifact with stale StoryIR or prompt hash;
- failed artifacts as successful outputs;
- artifacts generated with incompatible schema or compiler version.

## Tests

Add tests for cache key variant inclusion, parent-hash invalidation, locale isolation, stale short rejection, and concurrent manifest writes.

## Acceptance Criteria

- Resume is dependency-aware and variant-safe.
- Compatibility paths exist where needed.
- Cache keys and manifests include variant and parent lineage.
