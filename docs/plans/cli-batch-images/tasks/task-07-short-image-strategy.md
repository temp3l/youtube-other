# Task 07 - Short Image Batch Strategy

Recommended model: GPT-5.4 for visual strategy and cost tradeoffs; GPT-5.4-mini for implementation once policies are explicit.

Commit after implementation: `feat(image-batch): support short image batch strategy`

## Objective

Integrate short-video image requirements with the batch workflow while preserving deterministic transforms where they are sufficient.

## Background

`prepareShortsImageAssets` currently selects key scenes for native portrait regeneration and transforms the rest from landscape full images. This behavior should remain the default unless a scene genuinely requires separate generation.

## Scope

- Classify each short image as native generation, reuse full image, or deterministic conversion.
- Batch only native short generation items.
- Preserve `smart-crop`, `pan-and-scan`, and `blurred-fill` transforms for deterministic outputs.
- Store transform metadata and generated item identities in `shorts-image-manifest.json` or a compatible batch-linked manifest.
- Support requested languages and short variants.

## Out of scope

- No forced regeneration of all short images.
- No separate short generation when deterministic conversion is adequate.
- No renderer rewrite beyond manifest/path integration.

## Dependencies

Task 02. For merge, Tasks 03 and 04 should be complete.

## Repository evidence

- `packages/image-generation/src/shorts-image-strategy.ts`
- `apps/cli/src/episode-commands.ts`
- `packages/rendering/src/index.ts`
- `apps/cli/src/shots.ts`

## Required changes

- Add short image planning output compatible with image batch identity.
- Use existing `ShortsImageConfig` defaults for key scene selection.
- Represent deterministic transforms as non-provider batch items or linked local tasks.
- Prepare provider batch requests for native short scenes only.

## Data model or manifest changes

Short image items must record source full image hash, transform strategy, output portrait path, prompt hash for native generation, and parent narration/full-image dependencies.

## CLI behavior

`images batch prepare --variants short` must preview how many short images will be generated versus transformed locally.

## Error handling and observability

Report missing landscape source, duplicate portrait destination, invalid portrait dimensions, stale source hash, and unsupported native generation endpoint.

## Security and cost controls

Print separate counts for paid native generations and free deterministic transforms. Never submit transform-only items to OpenAI.

## Tests

- Classification table for short scenes.
- Native short generation request preparation for key scenes.
- Deterministic transform items are not submitted as provider requests.
- Existing portrait cache reuse.
- Missing landscape image failure.

## Verification commands

```bash
pnpm test:focused -- packages/image-generation/src/shorts-image-strategy.unit.test.ts
pnpm test:focused -- packages/image-generation/src/image-batch-planner.unit.test.ts
```

## Acceptance criteria

- Short batch workflow supports native generation where required.
- Deterministic conversion remains preferred for safe reuse cases.
- Renderable portrait outputs are placed in canonical short paths.

## Rollback considerations

Keep current `episode short` synchronous/transform flow available while batch support is added.
