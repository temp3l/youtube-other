import {
  type MicrodramaAssetGenerationApproval,
  type MicrodramaAssetGenerationScope,
  microdramaAssetGenerationApprovalSchema,
} from "./microdrama-asset-generation-approval-contracts.js";
import type { MicrodramaAssetType } from "./microdrama-budget-contracts.js";
import type { BoundedPaidProviderBindingProbe } from "./microdrama-operator-authorization-lifecycle.js";

export function evaluateAssetGenerationApprovalAdmission(input: {
  readonly approval: MicrodramaAssetGenerationApproval | undefined;
  readonly taskId: string;
  readonly now: string;
}): { readonly allowed: boolean; readonly reason?: string } {
  if (!input.approval) {
    return { allowed: false, reason: "asset_generation_not_approved" };
  }
  if (input.approval.taskId !== input.taskId) {
    return { allowed: false, reason: "asset_generation_scope_mismatch" };
  }
  if (input.approval.state !== "active") {
    return { allowed: false, reason: "asset_generation_not_approved" };
  }
  const nowMs = Date.parse(input.now);
  if (Date.parse(input.approval.approvedAt) > nowMs) {
    return { allowed: false, reason: "asset_generation_not_approved" };
  }
  if (
    input.approval.expiresAt !== undefined &&
    Date.parse(input.approval.expiresAt) <= nowMs
  ) {
    return { allowed: false, reason: "asset_generation_not_approved" };
  }
  if (input.approval.revokedAt !== undefined) {
    return { allowed: false, reason: "asset_generation_not_approved" };
  }
  return { allowed: true };
}

function normalizeEpisodeIds(episodeIds: readonly string[]): string[] {
  return [...new Set(episodeIds.map((episodeId) => episodeId.toUpperCase()))].sort();
}

export function assetGenerationScopeMatchesProbe(input: {
  readonly scope: MicrodramaAssetGenerationScope;
  readonly probe: BoundedPaidProviderBindingProbe;
  readonly requiredAssetKinds: readonly MicrodramaAssetType[];
}): { readonly allowed: boolean; readonly reason?: string } {
  const scopeEpisodes = normalizeEpisodeIds(input.scope.episodeIds);
  const probeEpisodes = normalizeEpisodeIds(input.probe.episodeIds);
  if (scopeEpisodes.join(",") !== probeEpisodes.join(",")) {
    return { allowed: false, reason: "asset_generation_scope_mismatch" };
  }
  if (input.scope.locale.toLowerCase() !== input.probe.locale.toLowerCase()) {
    return { allowed: false, reason: "asset_generation_scope_mismatch" };
  }
  const scopeScripts = [...input.scope.scriptRevisionIds].sort().join(",");
  const probeScripts = [...input.probe.scriptRevisionIds].sort().join(",");
  if (scopeScripts !== probeScripts) {
    return { allowed: false, reason: "asset_generation_scope_mismatch" };
  }
  if (input.scope.voiceRevision !== input.probe.voiceRevision) {
    return { allowed: false, reason: "asset_generation_scope_mismatch" };
  }
  if (!input.scope.providers.includes(input.probe.provider)) {
    return { allowed: false, reason: "asset_generation_scope_mismatch" };
  }
  if (input.probe.estimatedCostMinor > input.scope.costLimitMinor) {
    return { allowed: false, reason: "asset_generation_scope_mismatch" };
  }
  for (const assetKind of input.requiredAssetKinds) {
    if (!input.scope.assetKinds.includes(assetKind)) {
      return { allowed: false, reason: "asset_generation_scope_mismatch" };
    }
  }
  return { allowed: true };
}

export function parseMicrodramaAssetGenerationApproval(
  value: unknown
): MicrodramaAssetGenerationApproval {
  return microdramaAssetGenerationApprovalSchema.parse(value);
}
