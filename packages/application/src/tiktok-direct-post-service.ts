import {
  type TikTokDirectPostDispatchContext,
  type TikTokDirectPostDispatchInput,
  type TikTokDirectPostDispatchResult,
  TikTokDirectPostService,
} from "@mediaforge/tiktok-publishing";

export type TikTokDirectPostApplicationPort = {
  dispatchInit(
    input: TikTokDirectPostDispatchInput
  ): Promise<TikTokDirectPostDispatchResult>;
  evaluateDispatchAdmission(
    input: TikTokDirectPostDispatchContext
  ): ReturnType<TikTokDirectPostService["evaluateDispatchAdmission"]>;
};

export type TikTokDirectPostApplicationServiceInput = {
  readonly port: TikTokDirectPostApplicationPort;
};

export class TikTokDirectPostApplicationService {
  public constructor(private readonly input: TikTokDirectPostApplicationServiceInput) {}

  public evaluateDispatchAdmission(
    input: TikTokDirectPostDispatchContext
  ): ReturnType<TikTokDirectPostService["evaluateDispatchAdmission"]> {
    return this.input.port.evaluateDispatchAdmission(input);
  }

  public dispatchInit(
    input: TikTokDirectPostDispatchInput
  ): Promise<TikTokDirectPostDispatchResult> {
    return this.input.port.dispatchInit(input);
  }
}
