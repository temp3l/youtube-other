import type {
  MicrodramaBudgetCommitment,
  MicrodramaBudgetPreflight,
  MicrodramaBudgetProfile,
  MicrodramaBudgetReservation,
  MicrodramaCostAttribution,
  MicrodramaPreflightWorkItem,
} from "@mediaforge/domain";

export type UpsertMicrodramaBudgetProfileInput = {
  readonly profile: MicrodramaBudgetProfile;
};

export type RecordMicrodramaBudgetReservationInput = {
  readonly reservation: MicrodramaBudgetReservation;
};

export type RecordMicrodramaCostAttributionInput = {
  readonly attribution: MicrodramaCostAttribution;
  readonly evidence: unknown;
};

export interface MicrodramaBudgetPort {
  migrateBudgets(): void;
  upsertBudgetProfile(input: UpsertMicrodramaBudgetProfileInput): MicrodramaBudgetProfile;
  listBudgetProfiles(): readonly MicrodramaBudgetProfile[];
  listBudgetCommitments(): readonly MicrodramaBudgetCommitment[];
  recordPreflightReservations(
    preflight: MicrodramaBudgetPreflight
  ): readonly MicrodramaBudgetReservation[];
  recordCostAttribution(
    input: RecordMicrodramaCostAttributionInput
  ): MicrodramaCostAttribution | null;
  listCostAttributionsByRevision(
    revisionId: string
  ): readonly MicrodramaCostAttribution[];
  runBudgetPreflight(input: {
    readonly correlationId: string;
    readonly workItems: readonly MicrodramaPreflightWorkItem[];
    readonly evaluatedAt: string;
  }): MicrodramaBudgetPreflight;
}

export class MicrodramaBudgetDuplicateAttributionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MicrodramaBudgetDuplicateAttributionError";
  }
}
