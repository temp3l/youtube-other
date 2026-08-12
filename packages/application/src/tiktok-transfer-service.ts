import {
  type TikTokLocalRenderArtifact,
  type TikTokPullFromUrlEligibility,
  type TikTokTransferByteEvidence,
  type TikTokTransferPlan,
  type TikTokVerifiedPullDomainConfiguration,
} from "@mediaforge/domain";
import {
  TikTokTransferPlanningService,
  type TikTokTransferChunkConstraintsPort,
  streamTikTokFileUploadPlan,
} from "@mediaforge/tiktok-publishing";

export type TikTokTransferApplicationPort = {
  saveTransferPlan(input: { readonly plan: TikTokTransferPlan }): TikTokTransferPlan;
  saveTransferByteEvidence(input: {
    readonly evidence: TikTokTransferByteEvidence;
  }): TikTokTransferByteEvidence;
};

export type TikTokTransferApplicationServiceInput = {
  readonly port: TikTokTransferApplicationPort;
  readonly constraintsPort: TikTokTransferChunkConstraintsPort;
};

export class TikTokTransferApplicationService {
  private readonly planningService: TikTokTransferPlanningService;

  public constructor(private readonly input: TikTokTransferApplicationServiceInput) {
    this.planningService = new TikTokTransferPlanningService({
      constraintsPort: input.constraintsPort,
    });
  }

  public planLocalFileUpload(input: {
    readonly source: TikTokLocalRenderArtifact;
    readonly plannedAt: string;
  }): TikTokTransferPlan {
    const plan = this.planningService.planFileUpload(input);
    return this.input.port.saveTransferPlan({ plan });
  }

  public evaluatePullFromUrlEligibility(input: {
    readonly source: TikTokLocalRenderArtifact;
    readonly sourceUrl: string;
    readonly domainConfiguration: TikTokVerifiedPullDomainConfiguration | null;
    readonly evaluatedAt: string;
  }): TikTokPullFromUrlEligibility {
    return this.planningService.evaluatePullFromUrl(input);
  }

  public preparePullFromUrlPlan(input: {
    readonly source: TikTokLocalRenderArtifact;
    readonly sourceUrl: string;
    readonly domainConfiguration: TikTokVerifiedPullDomainConfiguration;
    readonly plannedAt: string;
  }): TikTokTransferPlan {
    const plan = this.planningService.planPullFromUrl(input);
    return this.input.port.saveTransferPlan({ plan });
  }

  public async streamLocalFileUpload(input: {
    readonly filePath: string;
    readonly plan: TikTokTransferPlan;
    readonly maxReadBufferBytes: number;
    readonly streamedAt: string;
  }): Promise<TikTokTransferByteEvidence> {
    const evidence = await streamTikTokFileUploadPlan(input);
    return this.input.port.saveTransferByteEvidence({ evidence });
  }
}
