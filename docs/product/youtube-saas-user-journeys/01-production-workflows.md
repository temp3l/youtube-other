# Production workflows

## US-001 — Workflow Queue
**Persona:** producer.  
**User story:** As a producer, I want a tenant-scoped workflow queue so that I can act on bulk production safely.
**Entry conditions:** authenticated producer with project access.
**Primary journey:** 1. Open queue. 2. Filter channel/profile/locale/status/time. 3. Inspect run, episode/brief, latest job/stage, timestamps, failure/blocker. 4. Navigate to the pinned episode revision or brief.
**Alternate journeys:** Save a filter; open an individual run timeline.
**Failure / recovery journeys:** A stale/forbidden item is omitted; failed runs link to US-007.
**API/domain expectations:** Tenant-scoped, cursorable run projection joins run, pinned episode revision, latest job and sanitized failure; no filename inference.
**Frontend expectations:** Bulk-safe filters, counts, empty state, direct revision-safe links.
**Security / tenant-isolation requirements:** membership and `workflow.read`; no cross-workspace results.
**Idempotency / concurrency requirements:** reads are snapshot/cursor consistent; actions use current revision/ETag.
**Audit requirements:** filter-independent action links preserve correlation IDs.
**Acceptance criteria:** Given two tenants, when a producer lists runs, then only authorized runs and their safe summaries appear.
**Open questions:** Which queue filters warrant persistence?
**Existing implementation evidence:** `apps/api/src/contract.ts` exposes individual workflow/job/step reads; `apps/web/src/saas-runtime.ts` has a per-run UI, not a tenant queue. **PARTIAL.**

## US-005 — Provider-Free Acceptance Journey
**Persona:** producer.  
**User story:** As a producer, I want a deterministic production path so that local/CI acceptance does not require providers.
**Entry conditions:** provider-free entitled profile and local fixture runtime.
**Primary journey:** 1. Create project and typed brief. 2. Admit a pinned revision/locales workflow. 3. Produce deterministic artifacts and validations. 4. Submit hash-bound challenge. 5. Decide and inspect audit.
**Alternate journeys:** Use API instead of BFF.
**Failure / recovery journeys:** Inject safe failure; resume from durable run without a paid call.
**API/domain expectations:** Provider-free executor, workflow admission, immutable artifact hashes, validation and approval records.
**Frontend expectations:** Label the mode and withhold unavailable paid/publication controls.
**Security / tenant-isolation requirements:** BFF holds identity; no provider secret is rendered.
**Idempotency / concurrency requirements:** admission/retry keys and pinned revision prevent duplicate effects.
**Audit requirements:** record admission, run transitions, decision.
**Acceptance criteria:** Given provider-free mode, when a brief is completed, then an approved evidence set is reproducible without external credentials.
**Open questions:** Which deterministic fixture profiles become supported acceptance fixtures?
**Existing implementation evidence:** `packages/application/src/provider-free-profile-executor.ts`, `apps/api/src/provider-free-worker-entry.ts`, and `apps/web/src/saas-runtime.ts`. **PARTIAL** because the full release path remains disabled.

## US-006 — Episode Workspace / Lifecycle
**Persona:** producer.  
**User story:** As a producer, I want one episode workspace so that I can understand its lifecycle without reconstructing state.
**Entry conditions:** accessible episode or brief.
**Primary journey:** 1. Open episode. 2. See identity/current revision and lifecycle summary. 3. Inspect blockers, warnings, resolved configuration, artifacts, workflow/review/localization/render/publication states. 4. Use only available actions.
**Alternate journeys:** Deep-link from queue, artifact, review, or publication.
**Failure / recovery journeys:** Conflicting/stale revision displays the newer version and safe next action.
**API/domain expectations:** A canonical aggregate or typed related projection, with lifecycle distinct from runs and revisions.
**Frontend expectations:** Never derive lifecycle from files/jobs; explain unavailable actions.
**Security / tenant-isolation requirements:** resource-level workspace/project authorization.
**Idempotency / concurrency requirements:** mutations require strong version preconditions.
**Audit requirements:** lifecycle-changing action and correlation ID.
**Acceptance criteria:** Given a partial failure and an old approval, when the workspace opens, then both are separately visible with corrective actions.
**Open questions:** See `10-domain-state-assessment.md`.
**Existing implementation evidence:** project/episode revisions and per-resource workflow/assets/validations exist in `packages/api-sdk/src/v1-contract.ts`; aggregate lifecycle view does not. **PARTIAL.**

## US-007 — Failure Recovery
**Persona:** producer.  
**User story:** As a producer, I want to recover a partial workflow failure so that valid upstream work is preserved.
**Entry conditions:** failed/cancelled durable run.
**Primary journey:** 1. Open failure. 2. Read stage, sanitized structured error and retryability. 3. Inspect preserved artifacts. 4. Select safe retry stage/resume or abandon. 5. Confirm effect/idempotency impact. 6. Monitor continuation.
**Alternate journeys:** Admin follows correlation ID in observability.
**Failure / recovery journeys:** Non-retryable fault directs configuration/review/regeneration; ambiguous external effect enters reconciliation.
**API/domain expectations:** Typed failure, attempts, resumability and effect fence; retain upstream artifact lineage.
**Frontend expectations:** Plain-language cause plus technical code; no duplicate-cost claim.
**Security / tenant-isolation requirements:** sanitize provider/infrastructure details.
**Idempotency / concurrency requirements:** resume is keyed/fenced to one run and refuses stale conditions.
**Audit requirements:** retry, abandon and terminal outcome.
**Acceptance criteria:** Given a failed downstream job, when retry is safe, then only its allowed continuation executes and prior artifacts remain linked.
**Open questions:** Which failures are operator-retriable per profile?
**Existing implementation evidence:** cancel/resume, jobs/steps and redacted failures in `apps/api/src/contract.ts`; durable state in `packages/persistence/src/relational-workflow-state.ts`. **PARTIAL.**

## US-008 — Artifact Browser
**Persona:** producer/reviewer.  
**User story:** As a user, I want to inspect immutable production assets so that decisions are evidence-based.
**Entry conditions:** authorized project artifacts.
**Primary journey:** 1. Filter by kind/revision/state. 2. Open narration, scripts, images/reference images, maps/diagrams, TTS, captions, thumbnails, intermediate/final renders or approval pack. 3. See hash, provenance/run, validation, reuse state. 4. Preview/download if authorized.
**Alternate journeys:** Open asset from validation/review.
**Failure / recovery journeys:** Quarantined/failed artifact shows reason; unavailable preview does not imply validation.
**API/domain expectations:** Stable artifact catalogue with content hash, format, subject revision, lineage and controlled delivery.
**Frontend expectations:** Media-appropriate preview; distinguish shared/reusable from episode-owned.
**Security / tenant-isolation requirements:** signed/controlled access only; authorization before download.
**Idempotency / concurrency requirements:** immutable hashes; refresh cannot change viewed version.
**Audit requirements:** controlled download/share where policy requires.
**Acceptance criteria:** Given two revisions, when selecting one asset, then its hash, provenance and validation bind to that revision.
**Open questions:** Which formats get in-browser preview?
**Existing implementation evidence:** artifact contracts and asset/validation BFF pages in `packages/api-sdk/src/v1-contract.ts`, `apps/web/src/saas-runtime.ts`; downloads deliberately absent. **PARTIAL.**

## US-009 — Artifact Version Comparison
**Persona:** producer/reviewer.  
**User story:** As a user, I want to compare an artifact with its previous, approved, or source version so that I can assess change.
**Entry conditions:** comparable lineage exists.
**Primary journey:** 1. Choose baseline. 2. View lineage and hashes. 3. Compare text semantically/diff, visuals/media side-by-side or timed, and generated metadata/provenance. 4. Record decision.
**Alternate journeys:** Missing baseline explains why.
**Failure / recovery journeys:** Incompatible formats fall back to metadata/provenance comparison.
**API/domain expectations:** Explicit artifact lineage and baseline selectors, never path heuristics.
**Frontend expectations:** Clearly label non-pixel/non-semantic comparison limitations.
**Security / tenant-isolation requirements:** both resources independently authorized.
**Idempotency / concurrency requirements:** read-only immutable comparison.
**Audit requirements:** comparison context may be retained with review decision.
**Acceptance criteria:** Given an approved and regenerated image, when compared, then both hashes/provenance and visual difference are identifiable.
**Open questions:** What semantic-media comparison threshold is appropriate?
**Existing implementation evidence:** artifact hashes/lineage components exist; comparison projection/UI absent. **MISSING.**

## US-010 — Selective Regeneration
**Persona:** producer.  
**User story:** As a producer, I want to regenerate only an affected unit so that valid work is reused.
**Entry conditions:** a pinned production revision and regenerate permission.
**Primary journey:** 1. Select scene image, diagram, map, narration, TTS, subtitles, thumbnail or render. 2. Review affected downstream artifacts, validation and approval invalidation. 3. Confirm scoped run. 4. Inspect result and required revalidation/review.
**Alternate journeys:** Select configuration-only change, which requires no media generation.
**Failure / recovery journeys:** Unsafe scope expands to required dependencies or is rejected with typed reason.
**API/domain expectations:** Unit dependency graph, invalidation preview, regeneration command and lineage.
**Frontend expectations:** Scope and cost/reuse preview before execution.
**Security / tenant-isolation requirements:** permission and provider policy checked server-side.
**Idempotency / concurrency requirements:** command key and source revision prevent duplicate work.
**Audit requirements:** selected target, invalidated bindings, result run.
**Acceptance criteria:** Given one changed thumbnail, when regeneration is confirmed, then upstream narration/images remain reusable and stale approval is identified.
**Open questions:** Define canonical production-unit granularity across profiles.
**Existing implementation evidence:** `packages/veronica-media/src/workflow/regeneration.ts` and workflow contracts support regeneration concepts; SaaS invalidation UX/API is absent. **PARTIAL.**

## US-011 — Production Gate Explanation
**Persona:** producer.  
**User story:** As a producer, I want to know why an episode is blocked so that I can take the correct action.
**Entry conditions:** episode/revision with a gate outcome.
**Primary journey:** 1. Open blocking summary. 2. See blocking gates separate from warnings. 3. Inspect validation evidence, failed artifact, stale approval and required action. 4. Navigate to regeneration, review, or configuration correction.
**Alternate journeys:** No blockers displays readiness and residual warnings.
**Failure / recovery journeys:** Unavailable evidence is itself a blocker with correlation ID.
**API/domain expectations:** Typed gate evaluation with severity, evidence refs, affected revision and actions.
**Frontend expectations:** One plain answer; no UI-local status synthesis.
**Security / tenant-isolation requirements:** evidence respects access policy.
**Idempotency / concurrency requirements:** explanation is a revisioned read.
**Audit requirements:** gating decision/override if supported.
**Acceptance criteria:** Given stale approval and failed caption validation, when asking why blocked, then both causes and distinct actions appear.
**Open questions:** Can authorized policy overrides exist?
**Existing implementation evidence:** validations, approval challenges and output validators exist, e.g. `packages/veronica-media/src/rendering/output-validation.ts`; unified explanation absent. **PARTIAL.**

## US-020 — Bulk Production Dashboard
**Persona:** producer.  
**User story:** As a producer, I want to operate many episodes so that production remains controllable at scale.
**Entry conditions:** scoped portfolio access.
**Primary journey:** 1. Filter channel/profile/locale/lifecycle/workflow/validation/review/publishing. 2. Select eligible items. 3. Queue, safely retry, cancel, make approval pack, localize or submit review. 4. Inspect per-item results.
**Alternate journeys:** Export filtered non-secret result list.
**Failure / recovery journeys:** Partial results preserve item errors and allow only safe retries.
**API/domain expectations:** Cursorable cross-episode read and async batch command/results.
**Frontend expectations:** Eligibility, confirmation and granular result states; no all-or-nothing ambiguity.
**Security / tenant-isolation requirements:** bulk selection reauthorized per item.
**Idempotency / concurrency requirements:** batch/item keys; each item has a precondition.
**Audit requirements:** batch actor, selection basis, item results.
**Acceptance criteria:** Given mixed eligibility, when a batch queues, then ineligible items are rejected individually and eligible items retain run IDs.
**Open questions:** Maximum batch size/concurrency by entitlement?
**Existing implementation evidence:** batch contracts exist in `packages/domain/src/workflow-contracts.ts`; SaaS cross-episode dashboard absent. **PARTIAL.**

## US-025 — Workflow Observability
**Persona:** advanced producer/admin.  
**User story:** As an authorized operator, I want a safe workflow timeline so that I can diagnose production.
**Entry conditions:** workflow-read authorization.
**Primary journey:** 1. Open run. 2. Inspect timeline, stages/jobs, durations, attempts, correlation/run IDs and artifacts. 3. Read sanitized errors. 4. Take permitted recovery action.
**Alternate journeys:** Link from queue/audit.
**Failure / recovery journeys:** Redacted diagnostic directs support with correlation ID.
**API/domain expectations:** durable run/job/step/attempt projection, sanitized failure and correlation references.
**Frontend expectations:** chronological, accessible timeline; no raw logs/secrets.
**Security / tenant-isolation requirements:** least-privilege diagnostics.
**Idempotency / concurrency requirements:** read-only; actions obey run fence.
**Audit requirements:** recovery actions, not mere viewing by default.
**Acceptance criteria:** Given a retried failure, when opening the run, then each attempt, timing and safe failure is visible.
**Open questions:** Retention/access level for detailed timing?
**Existing implementation evidence:** workflow/job/step APIs and durable state are in `apps/api/src/contract.ts` and `packages/persistence/src/relational-workflow-state.ts`. **PARTIAL.**
