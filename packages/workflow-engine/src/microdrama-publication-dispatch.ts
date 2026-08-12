import {
  resolvePublicationCapability,
  type MicrodramaPublicationCapabilityState,
  type MicrodramaPublicationDispatchAdmission,
  type MicrodramaPublicationIntent,
} from "@mediaforge/domain";

export type MicrodramaPublicationDispatchPort = {
  getIntent(intentId: string): MicrodramaPublicationIntent | null;
  evaluateDispatchAdmission(input: {
    readonly correlationId: string;
    readonly evaluatedAt: string;
    readonly intentId: string;
    readonly capabilityState?: MicrodramaPublicationCapabilityState;
    readonly operatorDispatchConfirmed?: boolean;
    readonly scheduleConsentRecorded?: boolean;
  }): MicrodramaPublicationDispatchAdmission;
};

export type MicrodramaPublicationDispatchResult = {
  readonly admission: MicrodramaPublicationDispatchAdmission;
  readonly intent: MicrodramaPublicationIntent | null;
};

export class MicrodramaPublicationDispatchBlockedError extends Error {
  public constructor(
    public readonly admission: MicrodramaPublicationDispatchAdmission
  ) {
    super(admission.message ?? "Microdrama publication dispatch blocked.");
    this.name = "MicrodramaPublicationDispatchBlockedError";
  }
}

export function runMicrodramaPublicationDispatchGate(input: {
  readonly port: MicrodramaPublicationDispatchPort;
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly intentId: string;
  readonly capabilityState?: MicrodramaPublicationCapabilityState;
  readonly operatorDispatchConfirmed?: boolean;
  readonly scheduleConsentRecorded?: boolean;
}): MicrodramaPublicationDispatchResult {
  const admission = input.port.evaluateDispatchAdmission({
    correlationId: input.correlationId,
    evaluatedAt: input.evaluatedAt,
    intentId: input.intentId,
    capabilityState: resolvePublicationCapability({
      state: input.capabilityState,
    }),
    operatorDispatchConfirmed: input.operatorDispatchConfirmed,
    scheduleConsentRecorded: input.scheduleConsentRecorded,
  });
  return {
    admission,
    intent: input.port.getIntent(input.intentId),
  };
}

export function requireMicrodramaPublicationDispatchGate(input: {
  readonly port: MicrodramaPublicationDispatchPort;
  readonly correlationId: string;
  readonly evaluatedAt: string;
  readonly intentId: string;
  readonly capabilityState?: MicrodramaPublicationCapabilityState;
  readonly operatorDispatchConfirmed?: boolean;
  readonly scheduleConsentRecorded?: boolean;
}): MicrodramaPublicationDispatchResult {
  const result = runMicrodramaPublicationDispatchGate(input);
  if (!result.admission.allowed) {
    throw new MicrodramaPublicationDispatchBlockedError(result.admission);
  }
  return result;
}
