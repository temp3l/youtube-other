# Two-Phase Cacheable Media Pipeline

## Current execution and root causes

Source discovery and cleaning feed parsing, canonical fact extraction, character
renaming, StoryIR/contract construction, prompt compilation, Responses generation,
quality validation, targeted repair, cache persistence, and artifact rendering.
Canonical English full narration is the parent of localized full narrations. The
accepted canonical full plus retention context produces the canonical Short, which
is the parent of localized Shorts.

Images have synchronous and Batch API paths. The batch path already persisted v2
manifests, deterministic IDs, JSONL, per-item import results, partial successes,
retry lineage, and separate character-reference and scene stages. Its first major
inefficiency occurred in scene planning: requests were split primarily by endpoint
and size instead of ordered reference bundle. Reference readiness existed, but the
bundle was not a first-class cache/group identity. Local image reuse depended on
scene-manifest request hashes rather than a complete versioned generation identity.

Text corruption first enters when generated narration violates the structured
contract; current deterministic and semantic gates catch incomplete responses,
scaffolding, filler, repetition, Unicode/language defects, compression, facts, and
duration issues. Remaining risk is provider/model quality, not a generic fallback.
Image inconsistency enters when scenes lack validated anchors or use different
reference ordering. Provider upload IDs were stored on character records but lacked
a content-hash registry for cross-logical reuse.

## Implemented architecture

The reusable prompt contract separates normalized stable blocks from dynamic blocks
and records the final stable block as the cache breakpoint. Prompt-cache planning
enforces model support, a 1024-token reusable prefix, reuse count, repair policy,
privacy-safe keys, and deterministic bounded sharding. OpenAI-specific cache fields
are emitted only at the provider request boundary.

Image generation now has a full content-addressed identity, ordered reference-bundle
identity, cache compatibility grouping, validated atomic cache records, provider
reference registry, bounded repair routing, and a dependency DAG resolver. A failed
reference blocks only dependent scenes. Unrelated ready nodes continue.

## Migration and invalidation

Existing v2 image and story manifests remain readable. New cache records are
additive. Prompt, schema, visual-bible, model, quality, size, reference ordering,
source, or validator-version changes invalidate reuse. Corrupt records or artifact
hash mismatches are invalid cache entries. Provider file expiration requires the
adapter to clear the stored file ID and re-upload by content hash.
