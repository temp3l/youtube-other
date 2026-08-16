import {
  TIKTOK_OFFICIAL_VIDEO_QUERY_ENDPOINT,
} from "@mediaforge/domain";

import {
  MICRO_050_AUDIT_READY_FIXTURE,
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_CANARY_PROVIDER_APP_REVISION,
  MICRO_050_CANARY_WORKSPACE_ID,
  MICRO_050_OAUTH_FIXTURE,
} from "./micro-050-canary-bindings.js";
import { MICRO_038_INTENT_ID } from "./micro-038-canary-bindings.js";

export const MICRO_042_TASK_ID = "MICRO-042";

export const MICRO_042_CANARY_PUBLICATION_ID = MICRO_038_INTENT_ID;
export const MICRO_042_CANARY_PROVIDER_VIDEO_ID = "video.micro-038.public";
export const MICRO_042_CANARY_LOCALE = "en-US" as const;
export const MICRO_042_CANARY_EPISODE_ID = "E002" as const;

export const MICRO_042_CANARY_REQUESTED_METRIC_SET = [
  "views",
  "likes",
  "comments",
  "shares",
] as const;

export const MICRO_042_CANARY_REQUESTED_SCOPES = [
  "user.info.basic",
  "video.list",
] as const;

export const MICRO_042_CANARY_ALLOWED_ENDPOINTS = ["videoQuery"] as const;

export const MICRO_042_CANARY_OFFICIAL_ENDPOINT_URL =
  TIKTOK_OFFICIAL_VIDEO_QUERY_ENDPOINT;

export const MICRO_042_CANARY_AUTHORIZATION_WINDOW = {
  startAt: "2026-08-12T00:00:00.000Z",
  endAt: "2026-08-13T00:00:00.000Z",
} as const;

export const MICRO_042_CANARY_OBSERVATION_WINDOW = {
  windowStart: "2026-08-12T00:00:00.000Z",
  windowEnd: "2026-08-12T23:59:59.000Z",
} as const;

export const MICRO_042_CANARY_PROVIDER_APP_REVISION =
  MICRO_050_CANARY_PROVIDER_APP_REVISION;
export const MICRO_042_CANARY_PROVIDER_ACCOUNT_ID =
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID;
export const MICRO_042_CANARY_WORKSPACE_ID = MICRO_050_CANARY_WORKSPACE_ID;
export const MICRO_042_AUDIT_READY_FIXTURE = MICRO_050_AUDIT_READY_FIXTURE;

export const MICRO_042_IDEMPOTENCY_KEY =
  "idempotency.micro-042.public-video-read-canary";

export function buildMicro042ReadOnlyBindingProbe(input?: {
  readonly publicationId?: string;
}): {
  readonly providerAppRevision: string;
  readonly providerAccountId: string;
  readonly requestedScopes: string[];
  readonly allowedEndpoints: string[];
  readonly authorizationWindow: {
    readonly startAt: string;
    readonly endAt: string;
  };
  readonly publicationId: string;
  readonly observationWindow: {
    readonly windowStart: string;
    readonly windowEnd: string;
  };
  readonly requestedMetricSet: Array<(typeof MICRO_042_CANARY_REQUESTED_METRIC_SET)[number]>;
} {
  return {
    providerAppRevision: MICRO_042_CANARY_PROVIDER_APP_REVISION,
    providerAccountId: MICRO_042_CANARY_PROVIDER_ACCOUNT_ID,
    requestedScopes: [...MICRO_042_CANARY_REQUESTED_SCOPES],
    allowedEndpoints: [...MICRO_042_CANARY_ALLOWED_ENDPOINTS],
    authorizationWindow: { ...MICRO_042_CANARY_AUTHORIZATION_WINDOW },
    publicationId: input?.publicationId ?? MICRO_042_CANARY_PUBLICATION_ID,
    observationWindow: { ...MICRO_042_CANARY_OBSERVATION_WINDOW },
    requestedMetricSet: [...MICRO_042_CANARY_REQUESTED_METRIC_SET],
  };
}

export const MICRO_042_OAUTH_ACCOUNT_BINDINGS = {
  accountId: MICRO_050_OAUTH_FIXTURE.accountId,
  providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
} as const;
