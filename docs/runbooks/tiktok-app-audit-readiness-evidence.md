# TikTok app and audit readiness evidence

Date: 2026-08-12
Schema: `mediaforge.tiktok-app-audit.v1`
Runbook version: `tiktok-app-audit-readiness.v1`

## Purpose

This runbook defines the immutable evidence contract for TikTok developer-app
configuration, Login Kit, scopes, Content Posting configuration, creator-info
export UX, consent/export UX, and provider audit submission. Readiness
projections are evidence only. They never authorize publication, OAuth, or
Direct Post by themselves.

## Evidence surfaces

| Surface | Required fields | Local-only |
| --- | --- | --- |
| Developer app/product | `providerAppId`, `product`, `environment`, `appCredentialHandle` | Yes |
| Login Kit | `callbackConfigHash`, `redirectUriHashes[]` | Yes |
| Scopes | `requiredScopes[]`, `grantedScopes[]` with exact coverage | Yes |
| Content Posting | `configured`, `configurationHash` | Yes |
| Creator-info/export UX | `runbookVersion`, `reviewEvidenceHash`, `reviewedAt` | Yes |
| Consent/export UX | `runbookVersion`, `reviewEvidenceHash`, `reviewedAt` | Yes |
| Provider audit | `evidenceSource`, `submissionState`, `resultEvidenceHash` | No |

## Provider audit rules

- Allowed evidence sources: `provider_portal_export`, `operator_canary_evidence`.
- `provider_approved` may be recorded only through provider-evidenced audit
  records, never through local app configuration.
- Local configuration must not include `providerApproved`, `auditApproved`, or
  `publicPostingEnabled` fields.
- `TIKTOK_APP_AUDIT_READY` requires an active configuration revision and an
  active provider-evidenced audit record bound to the same configuration
  revision.
- `TIKTOK_PUBLIC_POSTING_ENABLED` remains a separate operator/policy gate and
  is never inferred from local readiness evidence.

## Blocked operations

When readiness is missing, expired, revoked, or pending provider audit:

- live OAuth connect is blocked;
- creator-info preflight is blocked;
- Direct Post preparation/dispatch is blocked.

## Operator workflow

1. Record developer app/product configuration with Login Kit and scope evidence.
2. Review creator-info/export UX and consent/export UX against this runbook.
3. Record provider audit evidence from the TikTok developer portal export or a
   bounded operator canary.
4. Persist the immutable readiness projection and inspect `gateAssessment`.
5. Do not treat a ready projection as publication authorization.

## Rollback

Disable app-readiness projection writers and keep TikTok live capabilities off
until a new provider-evidenced audit revision is recorded.
