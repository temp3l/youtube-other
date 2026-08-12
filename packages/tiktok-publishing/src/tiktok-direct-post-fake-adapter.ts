import {
  type TikTokDirectPostInitRequest,
  type TikTokDirectPostInitResponse,
  type TikTokDirectPostThrottleEvidence,
  validateTikTokDirectPostInitResponse,
} from "@mediaforge/domain";

export type TikTokDirectPostAdapterResult =
  | { readonly kind: "initialized"; readonly response: TikTokDirectPostInitResponse }
  | { readonly kind: "throttled"; readonly throttle: TikTokDirectPostThrottleEvidence };

export type TikTokDirectPostAdapter = {
  initDirectPost(input: {
    readonly request: TikTokDirectPostInitRequest;
    readonly dispatchedAt: string;
  }): Promise<TikTokDirectPostAdapterResult>;
};

export class FixtureTikTokDirectPostAdapter implements TikTokDirectPostAdapter {
  public readonly calls: TikTokDirectPostInitRequest[] = [];

  public constructor(
    private readonly publishIdPrefix = "tiktok.publish.fixture"
  ) {}

  public async initDirectPost(input: {
    readonly request: TikTokDirectPostInitRequest;
    readonly dispatchedAt: string;
  }): Promise<TikTokDirectPostAdapterResult> {
    this.calls.push(input.request);
    return {
      kind: "initialized",
      response: validateTikTokDirectPostInitResponse({
        schemaVersion: "mediaforge.tiktok-direct-post.v1",
        initRequestId: input.request.initRequestId,
        publishId: `${this.publishIdPrefix}.${this.calls.length}`,
        providerCorrelation: {
          requestId: input.request.initRequestId,
          responseId: `provider.response.${this.calls.length}`,
        },
        receivedAt: input.dispatchedAt,
      }),
    };
  }
}

export class ThrottlingTikTokDirectPostAdapter implements TikTokDirectPostAdapter {
  public readonly calls: TikTokDirectPostInitRequest[] = [];

  public constructor(
    private readonly throttleEvidence: Omit<
      TikTokDirectPostThrottleEvidence,
      "schemaVersion" | "recordedAt" | "providerCorrelation"
    >
  ) {}

  public async initDirectPost(input: {
    readonly request: TikTokDirectPostInitRequest;
    readonly dispatchedAt: string;
  }): Promise<TikTokDirectPostAdapterResult> {
    this.calls.push(input.request);
    return {
      kind: "throttled",
      throttle: {
        schemaVersion: "mediaforge.tiktok-direct-post.v1",
        ...this.throttleEvidence,
        providerCorrelation: {
          requestId: input.request.initRequestId,
        },
        recordedAt: input.dispatchedAt,
      },
    };
  }
}
