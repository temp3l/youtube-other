import type {
  VisualRegistryEntryKind,
  VisualRegistryRevisionEnvelope,
  VisualRegistryRevisionStatus,
} from "@mediaforge/domain";

export type AppendVisualRegistryRevisionInput = {
  readonly envelope: VisualRegistryRevisionEnvelope;
};

export type AcceptVisualRegistryRevisionInput = {
  readonly seriesId: string;
  readonly entryId: string;
  readonly entryKind: VisualRegistryEntryKind;
  readonly revisionId: string;
  readonly acceptedAt: string;
};

export type UpdateVisualRegistryRevisionStatusInput = {
  readonly revisionId: string;
  readonly status: VisualRegistryRevisionStatus;
  readonly updatedAt: string;
};

export interface VisualAssetRegistryPort {
  migrate(): void;
  appendRevision(
    input: AppendVisualRegistryRevisionInput
  ): VisualRegistryRevisionEnvelope;
  getRevision(revisionId: string): VisualRegistryRevisionEnvelope | null;
  listRevisionsByEntry(
    seriesId: string,
    entryId: string,
    entryKind: VisualRegistryEntryKind
  ): readonly VisualRegistryRevisionEnvelope[];
  updateRevisionStatus(
    input: UpdateVisualRegistryRevisionStatusInput
  ): VisualRegistryRevisionEnvelope;
  acceptRevision(input: AcceptVisualRegistryRevisionInput): VisualRegistryRevisionEnvelope;
  getAcceptedRevision(
    seriesId: string,
    entryId: string,
    entryKind: VisualRegistryEntryKind
  ): VisualRegistryRevisionEnvelope | null;
}

export class VisualRegistryDuplicateRevisionError extends Error {
  public override readonly name = "VisualRegistryDuplicateRevisionError";
}

export class VisualRegistryRevisionNotFoundError extends Error {
  public override readonly name = "VisualRegistryRevisionNotFoundError";
}

export class VisualRegistryRevisionMismatchError extends Error {
  public override readonly name = "VisualRegistryRevisionMismatchError";
}

export class VisualRegistryRevisionNotApprovedError extends Error {
  public override readonly name = "VisualRegistryRevisionNotApprovedError";
}
