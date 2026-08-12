import {
  type MicrodramaAssetCostScope,
  type MicrodramaBudgetPreflight,
  type MicrodramaBudgetProfile,
  type MicrodramaCostAttribution,
  type MicrodramaPreflightBlockReason,
  type MicrodramaPreflightWorkItem,
  microdramaBudgetPreflightSchema,
  normalizeMicrodramaScopeId,
} from "./microdrama-budget-contracts.js";
import { evaluateReservationAdmission } from "./usage-reservation-lifecycle.js";

export type MicrodramaBudgetCommitment = {
  readonly profileId: string;
  readonly reservedMinor: number;
  readonly settledMinor: number;
};

export type SharedVisualDedupKey = {
  readonly episodeId: string;
  readonly assetType: string;
  readonly revisionId: string;
  readonly assetCostScope: MicrodramaAssetCostScope;
};

export function buildSharedVisualDedupKey(input: {
  readonly episodeId: string;
  readonly assetType: string;
  readonly revisionId: string;
  readonly assetCostScope: MicrodramaAssetCostScope;
}): string {
  return [
    input.episodeId,
    input.assetType,
    input.revisionId,
    input.assetCostScope,
  ].join(":");
}

export function shouldRecordSharedVisualCost(input: {
  readonly dedupKey: string;
  readonly existingKeys: ReadonlySet<string>;
}): boolean {
  return !input.existingKeys.has(input.dedupKey);
}

export function resolveBudgetProfilesForWorkItem(input: {
  readonly item: MicrodramaPreflightWorkItem;
  readonly profiles: readonly MicrodramaBudgetProfile[];
}): readonly MicrodramaBudgetProfile[] {
  const scopes: Array<{ kind: MicrodramaBudgetProfile["scopeKind"]; id: string }> =
    [
      { kind: "task", id: input.item.taskId },
      { kind: "provider", id: input.item.provider },
      { kind: "episode", id: input.item.episodeId },
    ];
  if (input.item.locale) {
    scopes.push({ kind: "locale", id: normalizeMicrodramaScopeId(input.item.locale) });
  }
  return scopes.map((scope) => {
    const profile = input.profiles.find(
      (candidate) =>
        candidate.scopeKind === scope.kind &&
        candidate.scopeId === normalizeMicrodramaScopeId(scope.id)
    );
    return profile ?? null;
  }).filter((profile): profile is MicrodramaBudgetProfile => profile !== null);
}

export function evaluateMicrodramaBudgetPreflight(input: {
  readonly correlationId: string;
  readonly workItems: readonly MicrodramaPreflightWorkItem[];
  readonly profiles: readonly MicrodramaBudgetProfile[];
  readonly commitments: readonly MicrodramaBudgetCommitment[];
  readonly evaluatedAt: string;
}): MicrodramaBudgetPreflight {
  const reservations: MicrodramaBudgetPreflight["reservations"] = [];
  const sharedVisualKeys = new Set<string>();
  let blockReason: MicrodramaPreflightBlockReason | undefined;
  let message: string | undefined;

  for (const item of input.workItems) {
    const requiredScopes: Array<{
      kind: MicrodramaBudgetProfile["scopeKind"];
      id: string;
    }> = [
      { kind: "task", id: item.taskId },
      { kind: "provider", id: item.provider },
      { kind: "episode", id: item.episodeId },
    ];
    if (item.locale) {
      requiredScopes.push({
        kind: "locale",
        id: normalizeMicrodramaScopeId(item.locale),
      });
    }

    for (const scope of requiredScopes) {
      const profile = input.profiles.find(
        (candidate) =>
          candidate.scopeKind === scope.kind &&
          candidate.scopeId === normalizeMicrodramaScopeId(scope.id)
      );
      if (!profile) {
        blockReason = "budget_profile_missing";
        message = `Missing budget profile for ${scope.kind}:${scope.id}`;
        break;
      }

      const commitment = input.commitments.find(
        (candidate) => candidate.profileId === profile.profileId
      );
      const admission = evaluateReservationAdmission({
        limitUnits: profile.limitMinor,
        reservedUnits: commitment?.reservedMinor ?? 0,
        settledUnits: commitment?.settledMinor ?? 0,
        requestedUnits: item.estimatedCostMinor,
        enforcement: profile.enforcement,
      });
      if (!admission.allowed) {
        blockReason = "budget_exceeded";
        message = `Budget exceeded for ${scope.kind}:${scope.id}`;
        break;
      }
    }

    if (blockReason) {
      break;
    }

    if (item.assetCostScope === "shared_visual") {
      const dedupKey = buildSharedVisualDedupKey({
        episodeId: item.episodeId,
        assetType: item.assetType,
        revisionId: item.revisionId,
        assetCostScope: item.assetCostScope,
      });
      if (!shouldRecordSharedVisualCost({
        dedupKey,
        existingKeys: sharedVisualKeys,
      })) {
        continue;
      }
      sharedVisualKeys.add(dedupKey);
    }

    const episodeProfile = input.profiles.find(
      (candidate) =>
        candidate.scopeKind === "episode" && candidate.scopeId === item.episodeId
    );
    if (!episodeProfile) {
      blockReason = "budget_profile_missing";
      message = `Missing episode budget profile for ${item.episodeId}`;
      break;
    }

    reservations.push({
      schemaVersion: "mediaforge.microdrama-budget.v1",
      reservationId: `reservation.${input.correlationId}.${item.taskId}.${item.revisionId}`,
      profileId: episodeProfile.profileId,
      revisionId: item.revisionId,
      episodeId: item.episodeId,
      locale: item.locale,
      provider: item.provider,
      taskId: item.taskId,
      reservedMinor: item.estimatedCostMinor,
      state: "reserved",
      correlationId: input.correlationId,
      createdAt: input.evaluatedAt,
      updatedAt: input.evaluatedAt,
    });
  }

  return microdramaBudgetPreflightSchema.parse({
    schemaVersion: "mediaforge.microdrama-budget.v1",
    correlationId: input.correlationId,
    allowed: blockReason === undefined,
    blockReason,
    message,
    reservations,
    evaluatedAt: input.evaluatedAt,
  });
}

export function attributeMicrodramaCost(input: {
  readonly attribution: MicrodramaCostAttribution;
  readonly existingAttributions: readonly MicrodramaCostAttribution[];
}): {
  readonly record: MicrodramaCostAttribution | null;
  readonly deduplicated: boolean;
} {
  if (input.attribution.assetCostScope !== "shared_visual") {
    return { record: input.attribution, deduplicated: false };
  }

  const dedupKey = buildSharedVisualDedupKey({
    episodeId: input.attribution.episodeId,
    assetType: input.attribution.assetType,
    revisionId: input.attribution.revisionId,
    assetCostScope: input.attribution.assetCostScope,
  });
  const existingKeys = new Set(
    input.existingAttributions
      .filter((entry) => entry.assetCostScope === "shared_visual")
      .map((entry) =>
        buildSharedVisualDedupKey({
          episodeId: entry.episodeId,
          assetType: entry.assetType,
          revisionId: entry.revisionId,
          assetCostScope: entry.assetCostScope,
        })
      )
  );

  if (!shouldRecordSharedVisualCost({ dedupKey, existingKeys })) {
    return { record: null, deduplicated: true };
  }
  return { record: input.attribution, deduplicated: false };
}
