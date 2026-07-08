# Security And Provider Boundary Review

Date: 2026-07-08

## Provider Approval Boundaries

- Confirmed: `images batch prepare` is local-only and uses a placeholder API key in `apps/cli/src/images-batch-commands.ts`; `submit`, `status`, and `download` use provider clients and must remain explicit operator actions.
- Confirmed: `stories pipeline` is dry-run only in `apps/cli/src/story-pipeline-command.ts`, so it must not be documented as an executable provider-backed workflow.
- Confirmed: OpenAI story, short rewrite, image, speech, transcription, and metadata code paths exist in package modules and CLI commands. Future refactors must preserve dry-run/no-provider modes and use fakes in tests.
- Confirmed: reference-assisted `/v1/images/edits` batch behavior is blocked by current docs and planner errors; do not enable it without explicit paid verification.

## OpenAI Boundaries

- Story/localization: `packages/story-localization/src/story-localization-openai-batch.ts`, `story-localization.service.ts`, and short rewrite services create or consume OpenAI clients. Keep request/response schemas at the package boundary.
- Images: `packages/image-generation/src/openai-image.ts`, `episode-image-pipeline.ts`, and `image-batch-service.ts` mix direct and batch provider mechanics. Use a provider adapter before expanding batch semantics.
- TTS/transcription/metadata: `packages/speech`, `packages/transcription`, and `packages/metadata/src/youtube-metadata.ts` should preserve mock/fake paths and avoid network checks in characterization tests.

## YouTube And Remote Boundaries

- YouTube upload is correctly isolated in `packages/youtube-upload`, but upload input selection can still fall back to filesystem scans. Prefer render/upload manifests over directory discovery.
- Remote rendering uses SSH/rsync and generated worker manifests in `packages/rendering/src/index.ts` plus CLI shell helpers. Do not run remote commands during refactor verification; add schemas and dry-run validation first.

## Secret Handling Risks

- CR-003: `packages/process-runner/src/index.ts` can record command arguments, while curl callers in `packages/metadata/src/youtube-metadata.ts` and `packages/image-generation/src/openai-image.ts` include bearer-token headers in args.
- `apps/cli/src/env-setup.ts` intentionally maps OpenAI env vars; keep logs/reporting redacted and never dump effective runtime config with secrets.
- YouTube refresh tokens and client secrets are loaded by `packages/config/src/index.ts`; reports must cite variable names only, not values.

## Command And Path Injection Risks

- CR-012: subtitle paths are interpolated into FFmpeg filter syntax in `packages/rendering/src/index.ts`; use filter escaping.
- CR-014: remote render cleanup shells should keep base-dir validation and guarded deletion semantics before any cleanup refactor.
- CR-004 and CR-013: generated image filenames and shot source paths need stricter containment to avoid workspace escapes or external dependencies.

## Generated-File Secrecy Risks

- Provider debug artifacts, telemetry JSON, OpenAI response bodies, upload reports, and remote logs can outlive a run. Redact provider headers, request IDs where necessary, and credential-like env values before writing reports.

## Recommended Hardening Tasks

- Address CR-003 first with telemetry argument redaction and tests.
- Add provider response schemas and fake clients before changing OpenAI/image/upload behavior.
- Require explicit operator intent for paid calls, remote execution, and YouTube upload.
- Add path containment tests for generated image filenames, render source paths, subtitle paths, and remote base directories.
