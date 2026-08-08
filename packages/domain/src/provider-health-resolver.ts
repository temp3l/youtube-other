import {
  USAGE_QUOTA_SCHEMA_VERSION,
  type ProviderHealthState,
  type ProviderHealthStatus,
  providerHealthStatusSchema,
} from "./usage-quota-contracts.js";

export function resolveProviderHealthStatus(input: {
  readonly providerId: string;
  readonly scope: ProviderHealthStatus["scope"];
  readonly configured: boolean;
  readonly supportedInProfile: boolean;
  readonly probeHealthy?: boolean;
  readonly probeDegraded?: boolean;
  readonly probeStale?: boolean;
  readonly freshness: string;
  readonly fallbackProviderId?: string;
}): ProviderHealthStatus {
  let state: ProviderHealthState;
  let message: string | undefined;

  if (!input.supportedInProfile) {
    state = "unsupported";
    message = "Provider is not enabled for this profile.";
  } else if (!input.configured) {
    state = "unconfigured";
    message = "Provider credentials or policy are not configured.";
  } else if (input.probeStale) {
    state = "degraded";
    message = "Health probe is stale; treat capacity as uncertain.";
  } else if (input.probeDegraded) {
    state = "degraded";
    message = "Provider is responding with degraded capacity.";
  } else if (input.probeHealthy === false) {
    state = "unavailable";
    message = "Provider health probe failed.";
  } else {
    state = "available";
  }

  const fallbackExplicit =
    state === "unavailable" || state === "degraded"
      ? input.fallbackProviderId !== undefined
      : false;

  return providerHealthStatusSchema.parse({
    schemaVersion: USAGE_QUOTA_SCHEMA_VERSION,
    providerId: input.providerId,
    scope: input.scope,
    state,
  ...(input.fallbackProviderId && fallbackExplicit
      ? { fallbackProviderId: input.fallbackProviderId }
      : {}),
    fallbackExplicit,
    freshness: input.freshness,
    ...(message ? { message } : {}),
  });
}
