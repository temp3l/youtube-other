# Task 12: Repair Routing, Regeneration, And Retry Hardening Plan

## 1. Scope And Non-Goals

Scope:

- Make repair, regeneration, incomplete-response handling, and retry policy purpose-aware and variant-safe.
- Prevent full and short generation from crossing repair or regeneration routes.
- Persist failed and incomplete call metadata, usage, incomplete reason, failed cost, and request fingerprint.
- Suppress unchanged retries for duplicate failed fingerprints.

Non-goals:

- Do not create replacement variant, locale, parent-hash, short-contract, prompt, validation, or persistence abstractions owned by Tasks 08-11 and 16.
- Do not change public CLI commands, artifact paths, provider routing, or `.env` precedence.
- Do not make paid API calls.
- Do not implement global cost reporting; Task 15 owns aggregation.

## 2. Confirmed Repository Findings

- `story-generation-preflight.ts` already defines narration variants, request fingerprints, `DUPLICATE_FAILED_REQUEST`, and cost-ceiling blocking.
- `story-localization.service.ts` has generic full/localized repair logic and already detects `response.incomplete_details?.reason === "max_output_tokens"` in one provider path.
- `short-rewrite.service.ts` has its own retry loop, transient error handling, short repair prompt, and preflight variants for `canonical-english-short`, `localized-short`, and `short-repair`.
- `story-localization-batch-service.ts` supports retrying failed batch items and has operation names including `canonical-english-full`, `english-short`, `localization`, and `repair`.
- Existing repair wording in `story-localization.service.ts` includes short-related retry instructions in localized full flows, which is a routing risk.

## 3. Dependencies And Assumptions From Tasks 08-10

- Task 08 will finalize localized full purpose, lineage, and locale validation behavior.
- Task 09 will finalize short contract excerpts allowed in repair prompts.
- Task 10 will finalize canonical and localized short generation routes, model config use, prompt fingerprints, and artifact status fields.
- If Tasks 08-10 already introduce `StoryGenerationPurpose` or `RepairScope`, extend those exact types instead of adding new duplicates.

## 4. Target Architecture And Ownership

- Task 12 owns a shared repair-routing policy for purpose, scope, retry cap, token exhaustion behavior, and allowed prompt context.
- Provider callers in full, short, and batch services should receive an already-resolved route and must not infer cross-variant fallback.
- Full purposes: `canonical-full` and `localized-full`.
- Short purposes: `canonical-short` and `localized-short`.
- Repair scopes should distinguish local field/sentence/paragraph/opening/hook/ending repair from full and short regeneration.

## 5. File-By-File Change Plan

- `packages/story-localization/src/story-generation-preflight.ts`: extend fingerprint input only if final Task 10 fields are missing; include variant and parent artifact hash in all relevant request fingerprints.
- `packages/story-localization/src/story-localization.service.ts`: route full/localized full repair through the shared policy, persist incomplete responses, and remove any path that can send a short failure to full regeneration.
- `packages/story-localization/src/short-rewrite.service.ts`: route short repair/regeneration through the shared policy, ensure short repair prompts exclude full payloads except allowed parent-contract excerpts, and detect incomplete SDK response shapes.
- `packages/story-localization/src/story-localization-batch-service.ts`: apply the same routing and duplicate-fingerprint suppression to batch retry item construction and import failures.
- `packages/story-localization/src/story-localization.errors.ts` and `short-rewrite.errors.ts`: add or reuse typed errors for incomplete responses and blocked duplicate failed requests if needed.
- Unit tests near the modified services: cover route safety, incomplete responses, and duplicate failed fingerprint behavior.

## 6. Compatibility And Migration

- Preserve `stories rewrite-full`, `stories rewrite-short`, `stories localize`, and `stories:batches retry-failed`.
- Preserve existing debug artifact paths and add failed/incomplete metadata additively.
- Continue reading legacy failed artifacts that lack incomplete reason or request fingerprint.
- Keep provider routing behavior compatible with current model config precedence.

## 7. Tests And Verification Commands

- `pnpm test:unit -- packages/story-localization/src/story-generation-preflight.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-localization.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/short-rewrite.service.unit.test.ts`
- `pnpm test:unit -- packages/story-localization/src/story-localization.batch.integration.test.ts`

## 8. Ordered Implementation Steps

1. Verify merged Tasks 08-10 purpose names, short route entrypoints, parent hash fields, and artifact status fields.
2. Add or extend the shared purpose/scope routing policy using repository conventions.
3. Wire full and localized full repair/regeneration through the policy.
4. Wire canonical and localized short repair/regeneration through the policy.
5. Normalize incomplete-response detection across `responses.create`, `responses.parse`, and batch response shapes.
6. Persist failed/incomplete usage, cost, reason, and fingerprint metadata.
7. Add duplicate failed request suppression and targeted tests.

## 9. Risks

- Over-hardening can block legitimate repair if deterministic issue classification is incomplete; allow explicit route scopes rather than broad string matching.
- Batch retry paths can drift from sync paths; share route validation helpers.
- Incomplete response shapes differ by SDK path; tests need representative mocked shapes.

## 10. Acceptance Criteria

- Repair and regeneration are purpose-aware.
- Full and short retry logic cannot cross routes.
- Full story never enters short regeneration.
- Short story never enters full regeneration with full output targets.
- Failed and incomplete calls are observable, costed, fingerprinted, and not retried unchanged.

## 11. Post-Task-10 Verification Checklist

- Confirm final `StoryGenerationPurpose` and `RepairScope` names if Tasks 08-10 add them.
- Confirm final short repair prompt interface and allowed parent-contract excerpt fields.
- Confirm final short model/localized-short model config selection.
- Confirm final retry caps and output-token fields by variant.
- Confirm final request fingerprint payload and failed artifact schema.
