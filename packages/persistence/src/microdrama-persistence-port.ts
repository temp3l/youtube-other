import type {
  NarrativeAggregateKind,
  NarrativeRevisionEnvelope,
  NarrativeRevisionId,
} from "@mediaforge/narrative-core";

export type MicrodramaEventKind =
  | "revision_appended"
  | "projection_updated"
  | "artifact_registered";

export type MicrodramaEvent = {
  readonly eventId: string;
  readonly sequence: number;
  readonly eventKind: MicrodramaEventKind;
  readonly payload: unknown;
  readonly contentHash: string;
  readonly recordedAt: string;
};

export type ArtifactReference = {
  readonly artifactHash: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly storageUri: string;
  readonly provenance: unknown;
  readonly recordedAt: string;
};

export type MicrodramaProjection = {
  readonly projectionKey: string;
  readonly projectionRevision: number;
  readonly projection: unknown;
  readonly contentHash: string;
  readonly updatedAt: string;
};

export type AppendNarrativeRevisionInput = {
  readonly envelope: NarrativeRevisionEnvelope;
};

export type AppendMicrodramaEventInput = {
  readonly eventId: string;
  readonly eventKind: MicrodramaEventKind;
  readonly payload: unknown;
  readonly contentHash: string;
  readonly recordedAt: string;
};

export type RegisterArtifactReferenceInput = {
  readonly artifactHash: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly storageUri: string;
  readonly provenance: unknown;
  readonly recordedAt: string;
};

export type ReplaceProjectionInput = {
  readonly projectionKey: string;
  readonly expectedProjectionRevision?: number;
  readonly projection: unknown;
  readonly contentHash: string;
  readonly updatedAt: string;
};

export interface MicrodramaPersistencePort {
  migrate(): void;
  appendNarrativeRevision(input: AppendNarrativeRevisionInput): NarrativeRevisionEnvelope;
  getNarrativeRevision(
    revisionId: NarrativeRevisionId
  ): NarrativeRevisionEnvelope | null;
  listNarrativeRevisionsByAggregate(
    aggregateId: string,
    aggregateKind: NarrativeAggregateKind
  ): readonly NarrativeRevisionEnvelope[];
  appendEvent(input: AppendMicrodramaEventInput): MicrodramaEvent;
  replayEvents(): readonly MicrodramaEvent[];
  registerArtifactReference(
    input: RegisterArtifactReferenceInput
  ): ArtifactReference;
  getArtifactReference(artifactHash: string): ArtifactReference | null;
  replaceProjection(input: ReplaceProjectionInput): MicrodramaProjection;
  getProjection(projectionKey: string): MicrodramaProjection | null;
}

export class MicrodramaConcurrencyError extends Error {
  public override readonly name = "MicrodramaConcurrencyError";
}

export class MicrodramaDuplicateRevisionError extends Error {
  public override readonly name = "MicrodramaDuplicateRevisionError";
}

export type MicrodramaBackupManifest = {
  readonly schemaVersion: "mediaforge.microdrama-backup.v1";
  readonly databaseFileName: string;
  readonly artifactReferences: readonly Pick<
    ArtifactReference,
    "artifactHash" | "storageUri"
  >[];
  readonly exportedAt: string;
};

export interface MicrodramaBackupPort {
  exportBackupManifest(): MicrodramaBackupManifest;
}
