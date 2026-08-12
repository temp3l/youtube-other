import {
  type BoundedPaidProviderEffectBindings,
  type MicrodramaOperatorAuthorizationRecord,
  microdramaOperatorAuthorizationRecordSchema,
} from "./microdrama-operator-authorization-contracts.js";

export type BoundedPaidProviderBindingProbe = {
  readonly episodeIds: readonly string[];
  readonly locale: string;
  readonly scriptRevisionIds: readonly string[];
  readonly voiceRevision: string;
  readonly provider: string;
  readonly estimatedCostMinor: number;
};

export function evaluateOperatorAuthorizationAdmission(input: {
  readonly authorization: MicrodramaOperatorAuthorizationRecord | undefined;
  readonly taskId: string;
  readonly expectedKind: MicrodramaOperatorAuthorizationRecord["kind"];
  readonly now: string;
}): { readonly allowed: boolean; readonly reason?: string } {
  if (!input.authorization) {
    return { allowed: false, reason: "operator_authorization_missing" };
  }
  if (input.authorization.taskId !== input.taskId) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.authorization.kind !== input.expectedKind) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.authorization.state !== "active") {
    return { allowed: false, reason: "operator_authorization_stale" };
  }
  const nowMs = Date.parse(input.now);
  if (Date.parse(input.authorization.authorizedAt) > nowMs) {
    return { allowed: false, reason: "operator_authorization_stale" };
  }
  if (
    input.authorization.expiresAt !== undefined &&
    Date.parse(input.authorization.expiresAt) <= nowMs
  ) {
    return { allowed: false, reason: "operator_authorization_stale" };
  }
  if (input.authorization.revokedAt !== undefined) {
    return { allowed: false, reason: "operator_authorization_stale" };
  }
  return { allowed: true };
}

function normalizeEpisodeIds(episodeIds: readonly string[]): string[] {
  return [...new Set(episodeIds.map((episodeId) => episodeId.toUpperCase()))].sort();
}

export function boundedPaidProviderBindingsMatchProbe(input: {
  readonly bindings: BoundedPaidProviderEffectBindings;
  readonly probe: BoundedPaidProviderBindingProbe;
}): { readonly allowed: boolean; readonly reason?: string } {
  const bindingEpisodes = normalizeEpisodeIds(input.bindings.episodeIds);
  const probeEpisodes = normalizeEpisodeIds(input.probe.episodeIds);
  if (bindingEpisodes.join(",") !== probeEpisodes.join(",")) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (
    input.bindings.locale.toLowerCase() !== input.probe.locale.toLowerCase()
  ) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingScripts = [...input.bindings.scriptRevisionIds].sort().join(",");
  const probeScripts = [...input.probe.scriptRevisionIds].sort().join(",");
  if (bindingScripts !== probeScripts) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.bindings.voiceRevision !== input.probe.voiceRevision) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.bindings.provider !== input.probe.provider) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.probe.estimatedCostMinor > input.bindings.costLimitMinor) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  return { allowed: true };
}

export function parseMicrodramaOperatorAuthorizationRecord(
  value: unknown
): MicrodramaOperatorAuthorizationRecord {
  return microdramaOperatorAuthorizationRecordSchema.parse(value);
}
