# VRI-16 approval-gated publication

## Changed files

- `packages/youtube-upload/src/publication-intent.ts`
- `packages/youtube-upload/src/publication-intent.unit.test.ts`
- `packages/youtube-upload/src/index.ts`
- `packages/youtube-upload/src/strategic-publish-routing.ts`
- `packages/youtube-upload/package.json`
- `packages/veronica-media/src/delivery/youtube-publication.ts`
- `packages/veronica-media/src/delivery/youtube-publication.unit.test.ts`
- `packages/veronica-media/src/index.ts`
- `packages/veronica-media/package.json`

## Tests and checks

- `pnpm test:focused -- packages/youtube-upload/src/publication-intent.unit.test.ts` — passed (3 tests).
- `pnpm test:focused -- packages/veronica-media/src/delivery/youtube-publication.unit.test.ts` — passed (2 tests after correcting the delivery-to-publication provenance adapter).
- `pnpm --filter @mediaforge/youtube-upload typecheck` — blocked by pre-existing unresolved workspace declarations for `@mediaforge/process-runner` and `@mediaforge/observability`; it also exposed and this task corrected the stale strategic profile comparison.

## Results

Added a provider-free, attributable authorization and derived-idempotency-bound YouTube publication intent. It verifies that distinct current-revision approvals bind the exact delivery bundle hash, records reuse/regeneration rationale, audits redacted preflight/schedule/reconciliation evidence, and only reconciles receipts matching the intended channel and visibility.

The Veronica adapter accepts only canonical approved delivery bundles and leaves visuals unchanged. No publisher dispatch, provider mutation, or source-original mutation is enabled.

## Risks and follow-up

The returned intent must be admitted by the existing durable publication-intent repository and executed only by its separately authorized worker. External activation remains intentionally disabled.
