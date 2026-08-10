# VJ-08 — Regenerate Safely after a Change

## Primary actor
Creator / Production Operator

## Trigger
The creator edits narration, replaces a source asset, changes a translation, updates provider configuration, or requests a scene retry.

## Main flow
1. System computes a typed invalidation graph.
2. Only artifacts whose semantic inputs changed are marked stale.
3. Cached outputs with matching input/config hashes remain valid.
4. Paid/provider calls are skipped for reusable outputs.
5. The regeneration run records exactly why each artifact was reused or rebuilt.
6. Downstream renders are rebuilt only if their dependencies changed.
7. Approved prior revisions remain immutable.
8. Review pack emphasizes the delta.

## Success outcome
Regeneration is predictable, cost-efficient, and revision-safe.
