export interface ReleaseGateEvidence {
  readonly educationProviderFree: boolean;
  readonly controlledProviderSmoke: boolean;
  readonly tenantIsolation: boolean;
  readonly objectStorage: boolean;
  readonly webhooks: boolean;
  readonly quotasAndAudit: boolean;
  readonly publicationReconciliation: boolean;
  readonly operationalRunbooks: boolean;
}

export function assessPilotGate(evidence: ReleaseGateEvidence): { readonly eligible: boolean; readonly missing: readonly (keyof ReleaseGateEvidence)[] } {
  const missing = (Object.keys(evidence) as Array<keyof ReleaseGateEvidence>).filter((key) => !evidence[key]);
  return { eligible: missing.length === 0, missing };
}
