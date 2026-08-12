import type {
  VideoGenerationCostEstimate,
  VideoGenerationRequest,
  VideoProviderAdapter,
  VideoProviderAdapterResult,
} from "./contracts.js";

export type FakeVideoAdapterBehavior =
  | { readonly kind: "complete"; readonly artifactHash?: string }
  | { readonly kind: "pending" }
  | { readonly kind: "ambiguous"; readonly message?: string }
  | { readonly kind: "fail"; readonly message?: string };

export class FakeVideoProviderAdapter implements VideoProviderAdapter {
  public readonly capabilityId: string;
  public readonly submissions: Array<{
    readonly request: VideoGenerationRequest;
    readonly cacheKey: string;
  }> = [];
  public readonly reconciliations: unknown[] = [];

  public constructor(
    capabilityId = "fake-video-v1",
    private behavior: FakeVideoAdapterBehavior = {
      kind: "complete",
    },
    private readonly costPerSecondMinor = 10
  ) {
    this.capabilityId = capabilityId;
  }

  public setBehavior(behavior: FakeVideoAdapterBehavior): void {
    this.behavior = behavior;
  }

  public async estimate(
    request: VideoGenerationRequest
  ): Promise<VideoGenerationCostEstimate> {
    return {
      estimatedCostMinor: Math.ceil(
        request.durationSeconds * this.costPerSecondMinor
      ),
      billableSeconds: request.durationSeconds,
      currency: "USD",
    };
  }

  public async submit(
    request: VideoGenerationRequest,
    input: { readonly cacheKey: string }
  ): Promise<VideoProviderAdapterResult> {
    this.submissions.push({ request, cacheKey: input.cacheKey });
    const providerRequestId = `fake-req-${this.submissions.length}`;
    switch (this.behavior.kind) {
      case "complete":
        return {
          kind: "completed",
          providerRequestId,
          artifactHash:
            this.behavior.artifactHash ??
            `a${String(this.submissions.length).padStart(63, "0")}`,
          durationMs: Math.round(request.durationSeconds * 1000),
          actualCostMinor: Math.ceil(
            request.durationSeconds * this.costPerSecondMinor
          ),
        };
      case "pending":
        return { kind: "pending", providerRequestId };
      case "ambiguous":
        return {
          kind: "ambiguous",
          providerRequestId,
          message:
            this.behavior.message ??
            "Provider accepted the request but did not return a terminal artifact.",
        };
      case "fail":
        return {
          kind: "failed",
          providerRequestId,
          message: this.behavior.message ?? "Fake adapter failure.",
        };
    }
  }

  public async reconcile(input: {
    readonly effect: { readonly effectId: string };
    readonly providerEvidence: unknown;
  }): Promise<VideoProviderAdapterResult> {
    this.reconciliations.push(input.providerEvidence);
    if (
      input.providerEvidence &&
      typeof input.providerEvidence === "object" &&
      "resolveAs" in input.providerEvidence
    ) {
      const resolveAs = (input.providerEvidence as { resolveAs: string })
        .resolveAs;
      if (resolveAs === "failed") {
        return {
          kind: "failed",
          providerRequestId: `fake-reconcile-${this.reconciliations.length}`,
          message: "Reconciled as failed.",
        };
      }
    }
    return {
      kind: "completed",
      providerRequestId: `fake-reconcile-${this.reconciliations.length}`,
      artifactHash: `b${String(this.reconciliations.length).padStart(63, "0")}`,
      durationMs: 4_000,
      actualCostMinor: 40,
    };
  }
}
