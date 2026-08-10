# History and Veronica cache/reuse checkpoint

- **History chain:** CLI image resume derives the durable semantic brief, resolves durable visual direction, then invokes the shared direct Images generation pipeline.
- **Veronica chain:** CLI image resume derives the durable semantic brief and invokes the same shared direct Images generation pipeline.
- **Responses surfaces:** shared semantic-image prompt preflight and History visual-direction resolver. Direct `images.generate`/`images.edit` and image batches are cache-ineligible.
- **SDK capability:** OpenAI 6.44.0 types expose `prompt_cache_key`, `prompt_cache_retention` (`in_memory`/`24h`), and cached input-token usage for Responses.
- **Local cache hierarchy:** semantic briefs and History direction are durable artifacts; generated images use exact content-addressed identity/result caches. Exact image reuse remains first.
- **Fingerprint fields:** generation identity includes operation, episode/language/format, prompt/version/model/quality/size/aspect, stable and dynamic prompt hashes, ordered reference hashes/roles, and source-plan hashes.
- **Proposed implementation:** a typed shared Responses cache planner with a stable-prefix hash key and normalized usage; a versioned, filesystem-backed Veronica registry with deterministic semantic descriptor matching and copy materialization.
- **Eligibility:** only long enough stable Responses prefixes are explicitly cache-requested; direct Images requests receive no provider-cache fields.
- **Reuse policy:** Veronica defaults to two cross-episode reuses per episode, never adjacent or duplicate assets; History semantic reuse remains disabled.
- **Expected changes:** shared cache utilities/semantic planner, History resolver, batch planner cleanup, image-generation reusable registry/integration, focused tests, and run report.
- **Concurrency:** existing edits are limited to Codex/config/API/docs guardrail files and are not touched by this task.
- **Validation:** focused Vitest files followed by affected package typecheck and file-targeted ESLint.

## Implementation result

- **Changed files:** `packages/shared/src/prompt-cache.ts`, `packages/shared/src/semantic-image-prompt.ts`, their unit tests; `packages/image-generation/src/history-visual-direction-openai-v1.ts`, `image-batch-planner.ts`, `episode-image-pipeline.ts` and its unit test, `index.ts`, and new `veronica-reusable-image-registry.ts` plus its unit test.
- **Provider cache:** Responses-only typed cache fields now derive from stable contracts; current active stable prefixes remain below the documented threshold and accurately downgrade. Direct Images batch requests no longer receive cache fields.
- **Reuse:** Veronica uses a versioned registry at `<episode-parent>/.mediaforge/veronica-reusable-images/registry-v1.json`, after exact local reuse and before provider generation. It copies validated compatible candidates, writes episode-local provenance, and registers only eligible successful provider outputs. History remains disabled.
- **Checks:** image-generation typecheck passed; focused cache/registry tests passed (39 tests); pipeline unit tests passed (43 tests), including registry materialization without a provider call; targeted ESLint passed.
- **Risks/follow-up:** same-host concurrent registry writers remain last-writer-wins despite atomic writes.
