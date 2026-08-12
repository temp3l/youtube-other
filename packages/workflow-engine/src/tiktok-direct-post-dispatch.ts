import {
  type MicrodramaPublicationCapabilityState,
  type TikTokDirectPostDispatchContext,
  type TikTokDirectPostDispatchAdmission,
} from "@mediaforge/domain";

export type TikTokDirectPostWorkflowPort = {
  evaluateDispatchAdmission(
    input: TikTokDirectPostDispatchContext
  ): TikTokDirectPostDispatchAdmission;
};

export type TikTokDirectPostWorkflowResult = {
  readonly admission: TikTokDirectPostDispatchAdmission;
};

export class TikTokDirectPostWorkflowBlockedError extends Error {
  public constructor(public readonly admission: TikTokDirectPostDispatchAdmission) {
    super(admission.message ?? "TikTok Direct Post workflow gate blocked.");
    this.name = "TikTokDirectPostWorkflowBlockedError";
  }
}

export function runTikTokDirectPostPreDispatchGate(input: {
  readonly port: TikTokDirectPostWorkflowPort;
  readonly context: TikTokDirectPostDispatchContext;
  readonly capabilityState?: MicrodramaPublicationCapabilityState;
}): TikTokDirectPostWorkflowResult {
  const admission = input.port.evaluateDispatchAdmission({
    ...input.context,
    capabilityState: input.capabilityState ?? input.context.capabilityState,
  });
  return { admission };
}

export function requireTikTokDirectPostPreDispatchGate(input: {
  readonly port: TikTokDirectPostWorkflowPort;
  readonly context: TikTokDirectPostDispatchContext;
  readonly capabilityState?: MicrodramaPublicationCapabilityState;
}): TikTokDirectPostWorkflowResult {
  const result = runTikTokDirectPostPreDispatchGate(input);
  if (!result.admission.allowed) {
    throw new TikTokDirectPostWorkflowBlockedError(result.admission);
  }
  return result;
}
