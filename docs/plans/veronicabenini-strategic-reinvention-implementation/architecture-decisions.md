# Architecture decisions

1. Persist **veronicabenini**; normalize `strategic-reinvention` as a deprecated compatibility alias before identity or path construction.
2. Episode plus immutable production revision own semantic state; workflow events/attempts own execution state.
3. Extend shared manifests, lineage, fingerprints, and typed invalidation; filenames never establish cache validity.
4. Share visual semantics across locales and formats; locale editions own narration, overlays, captions, metadata, voice, and layouts.
5. Translate/composite/reflow first; regenerate imagery only for inseparable language visuals, with a recorded reason.
6. Treat 16:9 and 9:16 as independently approved composition derivatives of one semantic revision.
7. Keep sources immutable; extraction, crop, redesign, translation, and generated assets are provenance-bound derivatives.
8. Use shared provider authorization, semantic cache, retry, budget, idempotency, and cost/provenance controls; missing configuration fails closed.
9. CLI and API invoke the same workflow, approval, publication intent/reconciliation, audit, and tenant boundaries.
