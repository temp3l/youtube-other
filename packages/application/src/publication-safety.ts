export type PublicationState = "pending" | "executing" | "published" | "failed" | "reconciliation_required" | "cancelled";
export interface PublicationIntent { readonly id: string; readonly approvalRevision: number; readonly credentialVersion: string; readonly assetHash: string; readonly state: PublicationState; }

export interface PublicationReceipt {
  readonly providerObjectId: string;
  readonly recoveryIdentity: string;
  readonly evidence: unknown;
}

export interface PublicationReconciliationStore {
  recordResolved(input: { readonly publicationId: string; readonly receipt: PublicationReceipt }): Promise<void>;
  recordInconclusive(input: { readonly publicationId: string; readonly reason: "no_match" | "multiple_matches" | "provider_unavailable" }): Promise<void>;
}

export interface PublicationEvidenceLookup {
  findByRecoveryIdentity(input: { readonly publicationId: string }): Promise<readonly PublicationReceipt[]>;
}

/** No ambiguous effect may create a second provider upload. */
export function transitionPublication(intent: PublicationIntent, next: PublicationState): PublicationIntent {
  const allowed: Readonly<Record<PublicationState, readonly PublicationState[]>> = {
    pending: ["executing", "cancelled"], executing: ["published", "failed", "reconciliation_required"],
    published: [], failed: [], reconciliation_required: [], cancelled: [],
  };
  if (!allowed[intent.state].includes(next)) throw new Error("publication_transition_rejected");
  return { ...intent, state: next };
}

export type PublicationReconciliationResult =
  | { readonly kind: "published"; readonly receipt: PublicationReceipt }
  | { readonly kind: "reconciliation_required"; readonly reason: "no_match" | "multiple_matches" | "provider_unavailable" };

/**
 * Reconciliation is deliberately read-only toward the provider. It never
 * retries an upload: only exactly one provider-observable receipt can close an
 * uncertain intent, while zero/multiple/error outcomes remain operator-owned.
 */
export class PublicationReconciliationWorker {
  public constructor(
    private readonly lookup: PublicationEvidenceLookup,
    private readonly store: PublicationReconciliationStore
  ) {}

  public async reconcile(intent: PublicationIntent): Promise<PublicationReconciliationResult> {
    if (intent.state !== "reconciliation_required") throw new Error("Only uncertain publications may be reconciled.");
    let matches: readonly PublicationReceipt[];
    try {
      matches = await this.lookup.findByRecoveryIdentity({ publicationId: intent.id });
    } catch {
      await this.store.recordInconclusive({ publicationId: intent.id, reason: "provider_unavailable" });
      return { kind: "reconciliation_required", reason: "provider_unavailable" };
    }
    if (matches.length !== 1) {
      const reason = matches.length === 0 ? "no_match" : "multiple_matches";
      await this.store.recordInconclusive({ publicationId: intent.id, reason });
      return { kind: "reconciliation_required", reason };
    }
    await this.store.recordResolved({ publicationId: intent.id, receipt: matches[0]! });
    return { kind: "published", receipt: matches[0]! };
  }
}
