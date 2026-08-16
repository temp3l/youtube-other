import {
  type BoundedPaidProviderEffectBindings,
  type BoundedProductionAndPublicationBatchBindings,
  type ExactPublicationIntentBindings,
  type ExactReadOnlyProviderAccessBindings,
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

export type ExactReadOnlyProviderAccessBindingProbe = {
  readonly providerAppRevision: string;
  readonly providerAccountId: string;
  readonly requestedScopes: readonly string[];
  readonly allowedEndpoints: readonly string[];
  readonly authorizationWindow: {
    readonly startAt: string;
    readonly endAt: string;
  };
  readonly publicationId?: string;
  readonly observationWindow?: {
    readonly windowStart: string;
    readonly windowEnd: string;
  };
  readonly requestedMetricSet?: readonly string[];
};

export type ExactPublicationIntentBindingProbe = ExactPublicationIntentBindings;

export function exactReadOnlyProviderAccessBindingsMatchProbe(input: {
  readonly bindings: ExactReadOnlyProviderAccessBindings;
  readonly probe: ExactReadOnlyProviderAccessBindingProbe;
}): { readonly allowed: boolean; readonly reason?: string } {
  if (input.bindings.providerAppRevision !== input.probe.providerAppRevision) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.bindings.providerAccountId !== input.probe.providerAccountId) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingScopes = [...input.bindings.requestedScopes].sort().join(",");
  const probeScopes = [...input.probe.requestedScopes].sort().join(",");
  if (bindingScopes !== probeScopes) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingEndpoints = [...input.bindings.allowedEndpoints].sort().join(",");
  const probeEndpoints = [...input.probe.allowedEndpoints].sort().join(",");
  if (bindingEndpoints !== probeEndpoints) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (
    input.bindings.authorizationWindow.startAt !==
      input.probe.authorizationWindow.startAt ||
    input.bindings.authorizationWindow.endAt !== input.probe.authorizationWindow.endAt
  ) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (
    (input.bindings.publicationId ?? undefined) !==
    (input.probe.publicationId ?? undefined)
  ) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingWindow = input.bindings.observationWindow;
  const probeWindow = input.probe.observationWindow;
  if (
    (bindingWindow?.windowStart ?? undefined) !==
      (probeWindow?.windowStart ?? undefined) ||
    (bindingWindow?.windowEnd ?? undefined) !== (probeWindow?.windowEnd ?? undefined)
  ) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingMetrics = [...(input.bindings.requestedMetricSet ?? [])].sort().join(",");
  const probeMetrics = [...(input.probe.requestedMetricSet ?? [])].sort().join(",");
  if (bindingMetrics !== probeMetrics) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  return { allowed: true };
}

export function exactPublicationIntentBindingsMatchProbe(input: {
  readonly bindings: ExactPublicationIntentBindings;
  readonly probe: ExactPublicationIntentBindingProbe;
}): { readonly allowed: boolean; readonly reason?: string } {
  const fields: Array<keyof ExactPublicationIntentBindings> = [
    "providerAccountId",
    "creatorCapabilityEvidenceRevision",
    "episodeRevisionId",
    "locale",
    "renderHash",
    "metadataRevision",
    "privacy",
    "consentRevision",
    "exportApprovalRevision",
    "approvalTimestamp",
  ];
  for (const field of fields) {
    if (input.bindings[field] !== input.probe[field]) {
      return { allowed: false, reason: "operator_authorization_binding_mismatch" };
    }
  }
  if (
    input.bindings.interactionSettings.allowComments !==
      input.probe.interactionSettings.allowComments ||
    input.bindings.interactionSettings.allowDuet !==
      input.probe.interactionSettings.allowDuet ||
    input.bindings.interactionSettings.allowStitch !==
      input.probe.interactionSettings.allowStitch
  ) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.bindings.aiDeclaration !== input.probe.aiDeclaration) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.bindings.commercialDeclaration !== input.probe.commercialDeclaration) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  return { allowed: true };
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

export type BoundedProductionAndPublicationBatchBindingProbe =
  BoundedProductionAndPublicationBatchBindings;

export function boundedProductionAndPublicationBatchBindingsMatchProbe(input: {
  readonly bindings: BoundedProductionAndPublicationBatchBindings;
  readonly probe: BoundedProductionAndPublicationBatchBindingProbe;
}): { readonly allowed: boolean; readonly reason?: string } {
  if (
    input.bindings.episodeRange.startEpisodeId !==
      input.probe.episodeRange.startEpisodeId ||
    input.bindings.episodeRange.endEpisodeId !== input.probe.episodeRange.endEpisodeId
  ) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingLocales = [...input.bindings.locales].map((v) => v.toLowerCase()).sort().join(",");
  const probeLocales = [...input.probe.locales].map((v) => v.toLowerCase()).sort().join(",");
  if (bindingLocales !== probeLocales) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingProviders = [...input.bindings.providers].sort().join(",");
  const probeProviders = [...input.probe.providers].sort().join(",");
  if (bindingProviders !== probeProviders) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingAccounts = [...input.bindings.accounts].sort().join(",");
  const probeAccounts = [...input.probe.accounts].sort().join(",");
  if (bindingAccounts !== probeAccounts) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  const bindingRevisions = [...input.bindings.revisionSet].sort().join(",");
  const probeRevisions = [...input.probe.revisionSet].sort().join(",");
  if (bindingRevisions !== probeRevisions) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.bindings.costLimitMinor !== input.probe.costLimitMinor) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  if (input.bindings.scheduleMode !== input.probe.scheduleMode) {
    return { allowed: false, reason: "operator_authorization_binding_mismatch" };
  }
  return { allowed: true };
}

export function parseMicrodramaOperatorAuthorizationRecord(
  value: unknown
): MicrodramaOperatorAuthorizationRecord {
  return microdramaOperatorAuthorizationRecordSchema.parse(value);
}
