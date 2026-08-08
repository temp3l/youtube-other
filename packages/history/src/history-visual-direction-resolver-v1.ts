import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";
import {
  type HistoricalVisualDirectionProfileV1,
  type VisualDirectionResolverInputV1,
  VisualDirectionInvalidError,
  buildDeterministicVisualDirectionFallbackV1,
  buildVisualDirectionResolverInputV1,
  finalizeHistoricalVisualDirectionProfileV1,
  isPersistedVisualDirectionReusableV1,
  loadPersistedHistoricalVisualDirectionV1,
  persistHistoricalVisualDirectionV1,
} from "./history-visual-direction-v1.js";

export type VisualDirectionProviderResolverV1 = (
  input: VisualDirectionResolverInputV1
) => Promise<Omit<HistoricalVisualDirectionProfileV1, "provenance" | "validation">>;

const inFlightResolutions = new Map<
  string,
  Promise<HistoricalVisualDirectionProfileV1>
>();

let providerResolutionCallCount = 0;

export function resetVisualDirectionResolverStateForTests(): void {
  inFlightResolutions.clear();
  providerResolutionCallCount = 0;
}

export function readVisualDirectionProviderResolutionCallCount(): number {
  return providerResolutionCallCount;
}

function assertValidProfile(
  profile: HistoricalVisualDirectionProfileV1
): HistoricalVisualDirectionProfileV1 {
  if (!profile.validation.approved || !profile.validation.schemaValid) {
    throw new VisualDirectionInvalidError(
      `History visual direction is not approved: ${profile.validation.blockerCodes.join(", ") || "validation failed"}`
    );
  }
  return profile;
}

async function resolveAndPersistVisualDirectionV1(input: {
  readonly episodeDir: string;
  readonly resolverInput: VisualDirectionResolverInputV1;
  readonly resolveWithProvider: VisualDirectionProviderResolverV1;
  readonly fallbackModel: string;
  readonly refreshed: boolean;
}): Promise<HistoricalVisualDirectionProfileV1> {
  let body: Omit<HistoricalVisualDirectionProfileV1, "provenance" | "validation">;
  let provider: "openai" | "deterministic-fallback" = "openai";
  let providerStatus: "resolved" | "fallback" | "refreshed" = input.refreshed
    ? "refreshed"
    : "resolved";
  let model = input.fallbackModel;
  let fallbackReason: string | undefined;
  try {
    providerResolutionCallCount += 1;
    body = await input.resolveWithProvider(input.resolverInput);
  } catch (error) {
    provider = "deterministic-fallback";
    providerStatus = "fallback";
    fallbackReason =
      error instanceof Error ? error.message : "visual-direction-provider-failed";
    body = buildDeterministicVisualDirectionFallbackV1(input.resolverInput);
  }
  const profile = finalizeHistoricalVisualDirectionProfileV1({
    body,
    resolverInput: input.resolverInput,
    provider,
    model,
    providerStatus,
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(input.refreshed ? { refreshed: true } : {}),
  });
  await persistHistoricalVisualDirectionV1(input.episodeDir, profile);
  return profile;
}

export async function getOrResolvePersistedHistoricalVisualDirectionV1(input: {
  readonly episodeDir: string;
  readonly plan: HistoryVisualPlanV35;
  readonly refresh?: boolean;
  readonly resolveWithProvider: VisualDirectionProviderResolverV1;
  readonly fallbackModel?: string;
}): Promise<HistoricalVisualDirectionProfileV1> {
  const resolverInput = buildVisualDirectionResolverInputV1({
    plan: input.plan,
  });
  const flightKey = `${input.episodeDir}|${resolverInput.semanticInputFingerprint}|${input.refresh ? "refresh" : "reuse"}`;
  if (!input.refresh) {
    const persisted = await loadPersistedHistoricalVisualDirectionV1(input.episodeDir);
    if (
      persisted &&
      isPersistedVisualDirectionReusableV1({
        persisted,
        semanticInputFingerprint: resolverInput.semanticInputFingerprint,
      })
    ) {
      return assertValidProfile(persisted);
    }
  }
  const existing = inFlightResolutions.get(flightKey);
  if (existing) return existing;
  const pending = resolveAndPersistVisualDirectionV1({
    episodeDir: input.episodeDir,
    resolverInput,
    resolveWithProvider: input.resolveWithProvider,
    fallbackModel: input.fallbackModel ?? "deterministic-fallback",
    refreshed: Boolean(input.refresh),
  }).finally(() => {
    inFlightResolutions.delete(flightKey);
  });
  inFlightResolutions.set(flightKey, pending);
  return pending;
}
